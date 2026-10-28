import { sendPush } from './webpush.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function pushAll(env, data) {
  const { results } = await env.DB.prepare('SELECT * FROM subscriptions').all();
  let ok = 0;
  for (const s of results) {
    const status = await sendPush(s, data, env).catch(() => 0);
    if (status === 404 || status === 410) await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(s.endpoint).run();
    else if (status >= 200 && status < 300) ok++;
  }
  return ok;
}

// D1 콘솔을 따로 열지 않아도 되도록 tasks 테이블을 처음 쓸 때 만든다
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT, note TEXT,
      done INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'app', notified INTEGER NOT NULL DEFAULT 0)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tasks_start ON tasks (start_at)'),
  ]);
  schemaReady = true;
}

// 오프셋이 붙은 ISO 문자열을 UTC ISO로. 오프셋이 없으면 한국 시각으로 본다
const KST = '+09:00';
function toUtc(v) {
  if (v == null || v === '') return null;
  let s = String(v).trim().replace(' ', 'T');
  if (/^\d{4}-\d\d-\d\d$/.test(s)) s += 'T00:00';
  const d = new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(s) ? s : s + KST);
  return isNaN(d) ? undefined : d.toISOString();
}

// ?date=YYYY-MM-DD(한국 날짜) 또는 ?from=&to= , 둘 다 없으면 한국 기준 오늘
function range(url) {
  const q = url.searchParams;
  if (q.get('from') && q.get('to')) return [toUtc(q.get('from')), toUtc(q.get('to'))];
  const date = q.get('date') || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const from = new Date(`${date}T00:00:00${KST}`);
  return [from.toISOString(), new Date(from.getTime() + 86400e3).toISOString()];
}

const taskOut = (t) => ({ id: t.id, title: t.title, start: t.start_at, end: t.end_at, note: t.note, done: !!t.done, source: t.source });

async function tasks(req, env, path) {
  await ensureSchema(env);
  const m = req.method;
  if (path === '/api/tasks' && m === 'GET') {
    const [from, to] = range(new URL(req.url));
    if (!from || !to) return json({ error: 'from, to 형식 오류' }, 400);
    const { results } = await env.DB.prepare(
      'SELECT * FROM tasks WHERE start_at < ? AND COALESCE(end_at, start_at) >= ? ORDER BY start_at, id',
    ).bind(to, from).all();
    return json(results.map(taskOut));
  }

  if (path === '/api/tasks' && m === 'POST') {
    const b = await req.json();
    const start = toUtc(b.start), end = toUtc(b.end);
    if (!b.title || !start) return json({ error: 'title, start 필요' }, 400);
    if (end === undefined || (end && end < start)) return json({ error: 'end 형식 오류' }, 400);
    // 이미 지난 시각이면 알림을 보내지 않는다
    const notified = start <= new Date().toISOString() ? 1 : 0;
    const t = await env.DB.prepare('INSERT INTO tasks (title, start_at, end_at, note, source, notified) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
      .bind(String(b.title).trim(), start, end, b.note || null, b.source === 'openclaw' ? 'openclaw' : 'app', notified).first();
    return json(taskOut(t), 201);
  }

  const one = path.match(/^\/api\/tasks\/(\d+)$/);
  if (!one) return json({ error: 'not found' }, 404);
  const cur = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(one[1]).first();
  if (!cur) return json({ error: 'not found' }, 404);

  if (m === 'GET') return json(taskOut(cur));

  if (m === 'PATCH') {
    const b = await req.json();
    const start = 'start' in b ? toUtc(b.start) : cur.start_at;
    const end = 'end' in b ? toUtc(b.end) : cur.end_at;
    if (!start || end === undefined || (end && end < start)) return json({ error: 'start/end 형식 오류' }, 400);
    // 시각을 미래로 옮기면 다시 알림 대상이 된다
    const notified = start === cur.start_at ? cur.notified : (start <= new Date().toISOString() ? 1 : 0);
    const t = await env.DB.prepare('UPDATE tasks SET title = ?, start_at = ?, end_at = ?, note = ?, done = ?, notified = ? WHERE id = ? RETURNING *')
      .bind('title' in b ? String(b.title).trim() || cur.title : cur.title, start, end, 'note' in b ? b.note || null : cur.note,
        'done' in b ? (b.done ? 1 : 0) : cur.done, notified, cur.id).first();
    return json(taskOut(t));
  }

  if (m === 'DELETE') {
    await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(cur.id).run();
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}

async function api(req, env, path) {
  // 인증 없음 (개인용). 주소를 아는 사람은 누구나 API를 쓸 수 있다
  if (path === '/api/vapid') return json({ key: env.VAPID_PUBLIC });

  if (path === '/api/tasks' || path.startsWith('/api/tasks/')) return tasks(req, env, path);

  const m = req.method;
  if (path === '/api/subscribe' && m === 'POST') {
    const sub = await req.json();
    await env.DB.prepare('INSERT OR REPLACE INTO subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)')
      .bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth).run();
    return json({ ok: true });
  }

  if (path === '/api/test' && m === 'POST') {
    const sent = await pushAll(env, { title: '자비스', body: '테스트 알림입니다.' });
    return json({ sent });
  }

  if (path === '/api/reminders' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM reminders WHERE sent = 0 ORDER BY at').all();
    return json(results);
  }

  if (path === '/api/reminders' && m === 'POST') {
    const { title, at } = await req.json();
    if (!title || !at) return json({ error: 'title, at 필요' }, 400);
    const r = await env.DB.prepare('INSERT INTO reminders (title, at) VALUES (?, ?) RETURNING *').bind(title, at).first();
    return json(r, 201);
  }

  const del = path.match(/^\/api\/reminders\/(\d+)$/);
  if (del && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM reminders WHERE id = ?').bind(del[1]).run();
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/api/')) return api(req, env, path);
    return env.ASSETS.fetch(req);
  },

  // 1분마다 실행: 시간이 된 리마인더와 할 일을 푸시로 발송
  async scheduled(_event, env) {
    const now = new Date().toISOString();
    const { results } = await env.DB.prepare('SELECT * FROM reminders WHERE sent = 0 AND at <= ?').bind(now).all();
    for (const r of results) {
      await pushAll(env, { title: '자비스', body: r.title });
      await env.DB.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').bind(r.id).run();
    }
    await ensureSchema(env);
    const due = await env.DB.prepare('SELECT * FROM tasks WHERE notified = 0 AND done = 0 AND start_at <= ?').bind(now).all();
    for (const t of due.results) {
      await env.DB.prepare('UPDATE tasks SET notified = 1 WHERE id = ?').bind(t.id).run();
      await pushAll(env, { title: '할 일', body: t.title });
    }
  },
};
