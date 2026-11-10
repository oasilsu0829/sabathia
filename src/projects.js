// 장부 API (/api/projects) — /projects/ 앱이 기기 사이에 프로젝트를 맞춘다.
// 프로젝트 하나가 D1 projects 테이블의 한 줄(data = JSON). 충돌은 프로젝트 단위로 "나중에 고친 쪽"(updated, ms)이 이긴다.
// 지운 프로젝트는 deleted = 1 인 줄로 남겨 다른 기기에서도 지워지게 하고, 180일 뒤에 치운다.
import { json, httpError, readBody } from './util.js';

const ID_RE = /^[\w.-]{1,64}$/;
const MAX_PROJECTS = 1000;
const MAX_BYTES = 40000;          // 프로젝트 하나의 JSON 길이
const KEEP_DELETED = 180 * 864e5;

export async function projectsApi(req, env, path) {
  try {
    return await route(req, env, path);
  } catch (err) {
    return json({ error: err.message || String(err) }, err.status || 400);
  }
}

const fromRow = (r) => {
  if (r.deleted) return { id: r.id, updated: r.updated, deleted: true };
  let d = {};
  try { d = JSON.parse(r.data) || {}; } catch {}
  return { ...d, id: r.id, updated: r.updated };
};

async function route(req, env, path) {
  const m = req.method;

  if (path === '/api/projects' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM projects WHERE deleted = 0 ORDER BY updated DESC').all();
    return json({ projects: results.map(fromRow) });
  }

  // 기기가 가진 프로젝트(지운 것은 { id, updated, deleted: true })를 보내면, 더 새로운 것만 저장하고 서버의 전체 목록을 돌려준다
  if (path === '/api/projects/sync' && m === 'POST') {
    const body = await readBody(req);
    const list = body && Array.isArray(body.projects) ? body.projects : null;
    if (!list) throw httpError(400, 'projects 배열이 필요합니다');
    if (list.length > MAX_PROJECTS) throw httpError(400, `프로젝트는 ${MAX_PROJECTS}개까지 맞출 수 있습니다`);
    const now = Date.now();
    const { results: have } = await env.DB.prepare('SELECT id, updated FROM projects').all();
    const cur = new Map(have.map((r) => [r.id, r.updated]));

    const stmts = [];
    for (const p of list) {
      if (!p || typeof p !== 'object' || !ID_RE.test(String(p.id))) throw httpError(400, '프로젝트 id가 올바르지 않습니다');
      if (!Number.isFinite(p.updated) || p.updated <= 0) throw httpError(400, `프로젝트 ${p.id}의 updated가 올바르지 않습니다`);
      const id = String(p.id);
      // 시계가 앞서 있는 기기가 계속 이기지 않게 서버 시각 + 5분까지만 인정한다
      const updated = Math.min(Math.floor(p.updated), now + 300000);
      if (cur.has(id) && cur.get(id) >= updated) continue;
      const deleted = p.deleted === true;
      const data = deleted ? '{}' : JSON.stringify({ ...p, updated });
      if (data.length > MAX_BYTES) throw httpError(400, `프로젝트 ${id}가 너무 큽니다`);
      stmts.push(env.DB.prepare('INSERT OR REPLACE INTO projects (id, data, updated, deleted) VALUES (?, ?, ?, ?)').bind(id, data, updated, deleted ? 1 : 0));
      cur.set(id, updated);
    }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    await env.DB.prepare('DELETE FROM projects WHERE deleted = 1 AND updated < ?').bind(now - KEEP_DELETED).run();

    const { results } = await env.DB.prepare('SELECT * FROM projects').all();
    return json({ projects: results.map(fromRow), wrote: stmts.length, now });
  }

  throw httpError(404, '없는 경로입니다');
}
