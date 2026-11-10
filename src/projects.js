// 장부 API (/api/projects) — /projects/ 앱이 기기 사이에 프로젝트를 맞춘다.
// 프로젝트 하나가 D1 projects 테이블의 한 줄(data = JSON).
// 같은 프로젝트를 두 기기에서 고치면 항목(단계·기록·자료) 단위로 합친다(public/projects/merge.js, 화면과 같은 코드).
// 지운 프로젝트는 deleted = 1 인 줄로 남겨 다른 기기에서도 지워지게 하고, 180일 뒤에 치운다.
// 마감 연결: 프로젝트 마감은 일정 prj-<id>(마감), 날짜가 있는 단계는 prj-<id>-<단계 id>(할 일)로 올린다.
//   일정에서 그 할 일을 끝내면(또는 되돌리면) 다음 동기화 때 장부 단계에도 반영한다.
import '../public/projects/merge.js';
import { json, httpError, readBody } from './util.js';

const { fill, merge } = globalThis.PrjMerge;
const ID_RE = /^[\w.-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PROJECTS = 1000;
const MAX_BYTES = 200000;         // 프로젝트 하나의 JSON 길이 (단계·기록·자료 포함, D1 한 줄 한도 1MB보다 한참 아래)
const KEEP_DELETED = 180 * 864e5;
const EVENT_CATS = new Set(['report', 'school', 'academy']);

export async function projectsApi(req, env, path) {
  try {
    return await route(req, env, path);
  } catch (err) {
    return json({ error: err.message || String(err) }, err.status || 400);
  }
}

const parse = (r) => { try { return JSON.parse(r.data) || {}; } catch { return {}; } };
const fromRow = (r) => (r.deleted ? { id: r.id, updated: r.updated, deleted: true } : { ...parse(r), id: r.id, updated: r.updated });

async function route(req, env, path) {
  const m = req.method;

  if (path === '/api/projects' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM projects WHERE deleted = 0 ORDER BY updated DESC').all();
    return json({ projects: results.map(fromRow) });
  }

  // 기기가 가진 프로젝트(지운 것은 { id, updated, deleted: true })를 보내면 서버 것과 합쳐 저장하고, 서버의 전체 목록을 돌려준다
  if (path === '/api/projects/sync' && m === 'POST') {
    const body = await readBody(req);
    const list = body && Array.isArray(body.projects) ? body.projects : null;
    if (!list) throw httpError(400, 'projects 배열이 필요합니다');
    if (list.length > MAX_PROJECTS) throw httpError(400, `프로젝트는 ${MAX_PROJECTS}개까지 맞출 수 있습니다`);
    const now = Date.now();
    const { results: rows } = await env.DB.prepare('SELECT * FROM projects').all();
    const cur = new Map(rows.map((r) => [r.id, { id: r.id, updated: r.updated, deleted: !!r.deleted, data: r.deleted ? null : fill({ ...parse(r), id: r.id, updated: r.updated }) }]));
    const dirty = new Set();

    for (const p of list) {
      if (!p || typeof p !== 'object' || !ID_RE.test(String(p.id))) throw httpError(400, '프로젝트 id가 올바르지 않습니다');
      if (!Number.isFinite(p.updated) || p.updated <= 0) throw httpError(400, `프로젝트 ${p.id}의 updated가 올바르지 않습니다`);
      const id = String(p.id);
      // 시계가 앞서 있는 기기가 계속 이기지 않게 서버 시각 + 5분까지만 인정한다
      const updated = Math.min(Math.floor(p.updated), now + 300000);
      const ex = cur.get(id);
      if (p.deleted === true) {
        if (ex && ex.updated >= updated) continue;
        cur.set(id, { id, updated, deleted: true, data: null });
        dirty.add(id);
        continue;
      }
      if (ex && ex.deleted && ex.updated >= updated) continue; // 이 판보다 나중에 지워졌다
      const inc = fill({ ...p, id, updated, fu: Math.min(Number.isFinite(p.fu) ? p.fu : updated, now + 300000) });
      const next = ex && !ex.deleted ? merge(ex.data, inc) : inc;
      if (ex && !ex.deleted && JSON.stringify(next) === JSON.stringify(ex.data)) continue;
      cur.set(id, { id, updated: next.updated, deleted: false, data: next });
      dirty.add(id);
    }

    const evStmts = await reconcileEvents(env, cur, dirty);

    const stmts = [];
    for (const id of dirty) {
      const r = cur.get(id);
      const data = r.deleted ? '{}' : JSON.stringify(r.data);
      if (data.length > MAX_BYTES) throw httpError(400, `프로젝트 ${id}가 너무 큽니다`);
      stmts.push(env.DB.prepare('INSERT OR REPLACE INTO projects (id, data, updated, deleted) VALUES (?, ?, ?, ?)').bind(id, data, r.updated, r.deleted ? 1 : 0));
    }
    const all = [...stmts, ...evStmts];
    for (let i = 0; i < all.length; i += 50) await env.DB.batch(all.slice(i, i + 50));
    await env.DB.prepare('DELETE FROM projects WHERE deleted = 1 AND updated < ?').bind(now - KEEP_DELETED).run();

    const out = [...cur.values()].map((r) => (r.deleted ? { id: r.id, updated: r.updated, deleted: true } : r.data));
    return json({ projects: out, wrote: stmts.length, events: evStmts.length, now });
  }

  throw httpError(404, '없는 경로입니다');
}

// 장부 ↔ 일정. 일정에서 바뀐 단계 완료를 먼저 장부에 들이고(dirty에 더함), 그다음 일정을 장부에 맞춘다.
// 장부가 만든 일정(source '장부', id prj-…)만 건드린다. 돌려주는 것은 일정 쪽 D1 문장들
export async function reconcileEvents(env, cur, dirty) {
  const { results } = await env.DB.prepare("SELECT * FROM events WHERE id LIKE 'prj-%'").all();
  const have = new Map(results.map((r) => [r.id, r]));
  const want = new Map();

  for (const [pid, r] of cur) {
    if (r.deleted) continue;
    const p = r.data;
    const cat = EVENT_CATS.has(p.cat) ? p.cat : '';
    for (const s of p.steps) {
      if (!DATE_RE.test(s.due || '')) continue;
      const eid = `prj-${pid}-${s.id}`;
      const e = have.get(eid);
      if (e && e.source === '장부' && !!e.done !== !!s.done) {
        const et = Date.parse(e.updated) || 0;
        if (et > (s.u || 0)) {
          s.done = !!e.done; s.doneAt = s.done ? et : 0; s.u = et;
          p.log.unshift({ id: `e${s.id}${et.toString(36)}`, at: et, u: et, kind: 'auto', t: `${s.done ? '끝냄' : '되돌림'}(일정에서) — ${s.t}` });
          p.updated = Math.max(p.updated, et); r.updated = p.updated;
          dirty.add(pid);
        }
      }
      want.set(eid, { title: `${p.name} · ${s.t}`, date: s.due, kind: 'task', done: !!s.done, cat });
    }
    if (DATE_RE.test(p.due || '')) want.set(`prj-${pid}`, { title: `${p.name} 마감`, date: p.due, kind: 'deadline', done: p.status === 'done', cat });
  }

  const stmts = [];
  const stamp = new Date().toISOString();
  for (const [eid, w] of want) {
    if (eid.length > 64) continue; // 일정 id 한도
    const e = have.get(eid);
    if (e && e.source !== '장부') continue;
    if (e && e.title === w.title.slice(0, 200) && e.date === w.date && e.kind === w.kind && !!e.done === w.done && (e.cat || '') === w.cat) continue;
    stmts.push(env.DB
      .prepare('INSERT OR REPLACE INTO events (id, title, date, time, end_time, kind, done, note, source, updated, cat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(eid, w.title.slice(0, 200), w.date, e ? e.time : null, e ? e.end_time : null, w.kind, w.done ? 1 : 0, e ? e.note || '' : '', '장부', stamp, w.cat));
  }
  for (const [eid, e] of have) {
    if (!want.has(eid) && e.source === '장부') stmts.push(env.DB.prepare('DELETE FROM events WHERE id = ?').bind(eid));
  }
  return stmts;
}
