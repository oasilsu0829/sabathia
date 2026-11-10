// 일정 API (/api/events) — OpenClaw 스킬과 /schedule/ 앱이 쓴다.
// 저장: D1 events 테이블. 테이블 준비와 토큰 확인은 src/index.js 가 /api/* 전체에 대해 먼저 한다.
import { json, httpError, readBody } from './util.js';

const KINDS = new Set(['event', 'task', 'deadline']);
// 묶음: 보고서 제출 / 학교 수행 / 학원 수행 / none(묶지 않음). 빈 값이면 앱이 제목으로 짐작한다.
const CATS = new Set(['', 'report', 'school', 'academy', 'none']);
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[\w.-]{1,64}$/;
const KEEP_DAYS = 180; // 이보다 오래된 일정은 추가할 때 정리

export async function eventsApi(req, env, path) {
  try {
    return await route(req, env, path);
  } catch (err) {
    return json({ error: err.message || String(err) }, err.status || 400);
  }
}

async function route(req, env, path) {
  const parts = path.split('/').filter(Boolean); // ['api', 'events', id?]
  if (parts.length > 3) throw httpError(404, '없는 경로입니다');
  const id = parts[2] ? decodeURIComponent(parts[2]) : null;
  const m = req.method;
  const url = new URL(req.url);

  if (m === 'GET' && !id) {
    const from = url.searchParams.get('from') || '0000-00-00';
    const to = url.searchParams.get('to') || '9999-99-99';
    const { results } = await env.DB
      .prepare("SELECT * FROM events WHERE date >= ? AND date <= ? ORDER BY date, COALESCE(time, '99:99'), title")
      .bind(from, to).all();
    return json({ events: results.map(fromRow) });
  }

  if (m === 'GET' && id) {
    const row = await getRow(env, id);
    if (!row) throw httpError(404, `일정 ${id}을(를) 찾을 수 없습니다`);
    return json({ event: fromRow(row) });
  }

  if (m === 'POST' && !id) {
    const body = await readBody(req);
    const items = Array.isArray(body) ? body : Array.isArray(body.events) ? body.events : [body];
    if (!items.length || items.length > 200) throw httpError(400, '한 번에 1~200개까지 넣을 수 있습니다');
    const rows = [];
    for (const item of items) rows.push(await prepareUpsert(env, item, false));
    await env.DB.batch(rows.map((e) => insertStmt(env, e)));
    const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
    await env.DB.prepare('DELETE FROM events WHERE date < ?').bind(cutoff).run();
    return json({ events: rows }, 201);
  }

  if (m === 'PATCH' && id) {
    const body = await readBody(req);
    const e = await prepareUpsert(env, { ...body, id }, true);
    await insertStmt(env, e).run();
    return json({ event: e });
  }

  if (m === 'DELETE' && id) {
    const r = await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
    if (!r.meta || !r.meta.changes) throw httpError(404, `일정 ${id}을(를) 찾을 수 없습니다`);
    return json({ deleted: id });
  }

  throw httpError(405, '지원하지 않는 요청입니다');
}

// id가 이미 있으면 필드를 병합해 덮어쓰고, 없으면 새로 만든다.
// OpenClaw가 같은 id로 다시 보내도 중복되지 않는다.
async function prepareUpsert(env, input, mustExist) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, '일정은 JSON 객체여야 합니다');
  if (input.id != null && !ID_RE.test(String(input.id))) throw httpError(400, 'id는 영문·숫자·_.- 로 64자 이내여야 합니다');
  const prevRow = input.id != null ? await getRow(env, String(input.id)) : null;
  if (mustExist && !prevRow) throw httpError(404, `일정 ${input.id}을(를) 찾을 수 없습니다`);
  const prev = prevRow ? fromRow(prevRow) : null;
  return normalize({ ...(prev || {}), ...input }, prev);
}

function normalize(x, prev) {
  const title = String(x.title ?? '').trim();
  if (!title) throw httpError(400, 'title(제목)이 필요합니다');
  const date = String(x.date ?? '');
  if (!DATE_RE.test(date)) throw httpError(400, 'date는 YYYY-MM-DD 형식이어야 합니다');
  const time = x.time ? String(x.time) : null;
  if (time && !TIME_RE.test(time)) throw httpError(400, 'time은 24시간제 HH:MM 형식이어야 합니다');
  const end = time && x.end ? String(x.end) : null;
  if (end && !TIME_RE.test(end)) throw httpError(400, 'end는 24시간제 HH:MM 형식이어야 합니다');
  const kind = x.kind ? String(x.kind) : 'event';
  if (!KINDS.has(kind)) throw httpError(400, 'kind는 event, task, deadline 중 하나여야 합니다');
  const cat = x.cat ? String(x.cat) : '';
  if (!CATS.has(cat)) throw httpError(400, 'cat은 report, school, academy, none 중 하나이거나 비워야 합니다');
  return {
    id: prev ? prev.id : x.id != null ? String(x.id) : crypto.randomUUID().slice(0, 8),
    title: title.slice(0, 200),
    date,
    time,
    end,
    kind,
    cat,
    done: x.done === true || x.done === 'true' || x.done === 1,
    note: x.note ? String(x.note).slice(0, 500) : '',
    source: x.source ? String(x.source).slice(0, 40) : '',
    updated: new Date().toISOString(),
  };
}

const getRow = (env, id) => env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();

function insertStmt(env, e) {
  return env.DB
    .prepare('INSERT OR REPLACE INTO events (id, title, date, time, end_time, kind, done, note, source, updated, cat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(e.id, e.title, e.date, e.time, e.end, e.kind, e.done ? 1 : 0, e.note, e.source, e.updated, e.cat);
}

function fromRow(r) {
  return {
    id: r.id, title: r.title, date: r.date, time: r.time || null, end: r.end_time || null,
    kind: r.kind, cat: r.cat || '', done: !!r.done, note: r.note || '', source: r.source || '', updated: r.updated,
  };
}
