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

async function api(req, env, path) {
  // 공개 키만 인증 없이 제공
  if (path === '/api/vapid') return json({ key: env.VAPID_PUBLIC });

  if (req.headers.get('Authorization') !== `Bearer ${env.APP_TOKEN}`) return json({ error: 'unauthorized' }, 401);

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

  // 1분마다 실행: 시간이 된 리마인더를 푸시로 발송
  async scheduled(_event, env) {
    const now = new Date().toISOString();
    const { results } = await env.DB.prepare('SELECT * FROM reminders WHERE sent = 0 AND at <= ?').bind(now).all();
    for (const r of results) {
      await pushAll(env, { title: '자비스', body: r.title });
      await env.DB.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').bind(r.id).run();
    }
  },
};
