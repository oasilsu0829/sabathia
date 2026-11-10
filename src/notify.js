// 알림: 구독, 알림 설정, 반복 알림 API + 1분 cron이 부르는 tick()
// 시각은 모두 한국 시각(UTC+9, 서머타임 없음). 일정의 date·time도 한국 날짜·시각이다.
import { sendPush } from './webpush.js';
import { json, httpError, readBody, ensureTables } from './util.js';

const KST = 9 * 3600e3;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// lead: 시각 있는 일정 몇 분 전에 알릴지(null = 끔) / am: 아침 요약 시각 / pm: 전날 저녁 알림 시각 ('' = 끔)
export const DEFAULTS = { lead: 10, am: '07:30', pm: '20:00' };
const LEAD_WINDOW = 3;    // cron이 1~2분 빠져도 놓치지 않게 보는 폭(분). 같은 알림은 push_log가 한 번만 보내게 막는다
const DIGEST_WINDOW = 10;

const pad = (n) => String(n).padStart(2, '0');
const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const leadText = (n) => (n >= 60 && n % 60 === 0 ? `${n / 60}시간` : `${n}분`);

export function kst(now) {
  const d = new Date(now + KST);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: d.getUTCDay() };
}
// hm 시각부터 span분 동안 참
const inWindow = (min, hm, span) => { const d = min - toMin(hm); return d >= 0 && d < span; };

export function parseSettings(v) {
  let s = {};
  try { s = JSON.parse(v) || {}; } catch {}
  return {
    lead: s.lead === null ? null : Number.isInteger(s.lead) && s.lead >= 0 && s.lead <= 180 ? s.lead : DEFAULTS.lead,
    am: s.am === '' ? '' : TIME_RE.test(s.am) ? s.am : DEFAULTS.am,
    pm: s.pm === '' ? '' : TIME_RE.test(s.pm) ? s.pm : DEFAULTS.pm,
  };
}

/* 지금 보낼 알림 후보를 고른다 (DB를 쓰지 않는 순수 함수 — test/notify.mjs 가 검사한다)
   k        kst(now)
   tomorrow 내일 날짜
   set      parseSettings 결과
   repeats  repeats 테이블의 켜진 줄
   events   오늘·내일의 끝나지 않은 일정 (events 테이블 줄 모양: end_time)
   overdue  날짜가 지난 미완료 할 일·마감 수 (아침 요약에만 쓴다)
   돌려주는 값: [{ key, title, body, url, tag }] — key는 push_log에 남겨 중복을 막는다 */
export function candidates(k, tomorrow, set, repeats, events, overdue = 0) {
  const out = [];
  const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title);
  const line = (e) => (e.time ? `${e.time} ${e.title}` : e.title);
  const count = (list) => {
    const d = list.filter((e) => e.kind === 'deadline'), t = list.filter((e) => e.kind === 'task'), ev = list.filter((e) => e.kind === 'event');
    return { d, t, ev };
  };

  // 반복 알림
  for (const r of repeats) {
    if (!String(r.days).includes(String(k.wd)) || !TIME_RE.test(r.time)) continue;
    if (inWindow(k.min, r.time, LEAD_WINDOW)) {
      out.push({ key: `rep:${r.id}:${k.date}`, title: r.title, body: `${r.time} 반복 알림`, url: '/', tag: `rep-${r.id}` });
    }
  }

  // 시작 전 알림: 시각이 있는 오늘·내일(자정 넘어가는 경우) 일정
  if (set.lead !== null) {
    for (const e of events) {
      if (!e.time || e.done) continue;
      const left = (e.date === tomorrow ? 1440 : 0) + toMin(e.time) - k.min; // 시작까지 남은 분
      if (left > set.lead || left <= set.lead - LEAD_WINDOW) continue;
      const lt = set.lead ? leadText(set.lead) : '';
      let body;
      if (e.kind === 'deadline') body = `${e.time} 마감` + (lt ? ` · ${lt} 남음` : '');
      else if (e.kind === 'task') body = `${e.time} 할 일` + (lt ? ` · ${lt} 뒤` : '');
      else body = `${e.time}${e.end_time ? '–' + e.end_time : ''}` + (lt ? ` · ${lt} 뒤 시작` : ' · 지금 시작');
      out.push({ key: `lead:${e.id}:${e.date}T${e.time}`, title: e.title, body, url: '/schedule/', tag: `ev-${e.id}` });
    }
  }

  // 아침 요약: 오늘 남은 것 + 지연
  if (set.am && inWindow(k.min, set.am, DIGEST_WINDOW)) {
    const list = events.filter((e) => e.date === k.date && !e.done).sort(byTime);
    const { d, t, ev } = count(list);
    const parts = [];
    if (d.length) parts.push(`마감 ${d.length}`);
    if (t.length) parts.push(`할 일 ${t.length}`);
    if (ev.length) parts.push(`일정 ${ev.length}`);
    if (overdue) parts.push(`지연 ${overdue}`);
    if (parts.length) {
      const names = [...d, ...ev, ...t].slice(0, 4).map(line);
      out.push({ key: `am:${k.date}`, title: '오늘 일정', body: [parts.join(' · '), ...names].join('\n'), url: '/schedule/', tag: 'am' });
    }
  }

  // 전날 저녁: 내일 마감(과 내일 일정)
  if (set.pm && inWindow(k.min, set.pm, DIGEST_WINDOW)) {
    const list = events.filter((e) => e.date === tomorrow && !e.done).sort(byTime);
    const { d, t, ev } = count(list);
    const rest = [];
    if (t.length) rest.push(`할 일 ${t.length}`);
    if (ev.length) rest.push(`일정 ${ev.length}`);
    if (d.length) {
      const body = [d.slice(0, 4).map(line).join(', ') + (d.length > 4 ? ` 외 ${d.length - 4}건` : ''), rest.join(' · ')].filter(Boolean).join('\n');
      out.push({ key: `pm:${k.date}`, title: `내일 마감 ${d.length}건`, body, url: '/schedule/', tag: 'pm' });
    } else if (rest.length) {
      out.push({ key: `pm:${k.date}`, title: '내일 일정', body: [rest.join(' · '), ...[...ev, ...t].slice(0, 4).map(line)].join('\n'), url: '/schedule/', tag: 'pm' });
    }
  }
  return out;
}

// 구독한 기기 모두에 보낸다. 없어진 구독(404·410)은 지운다
async function pushAll(env, subs, data) {
  let ok = 0;
  for (const s of subs) {
    const status = await sendPush(s, data, env).catch(() => 0);
    if (status === 404 || status === 410) await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(s.endpoint).run();
    else if (status >= 200 && status < 300) ok++;
  }
  return ok;
}

// 1분마다 cron이 부른다
export async function tick(env, now = Date.now()) {
  await ensureTables(env);
  const k = kst(now), tomorrow = kst(now + 864e5).date;
  const [subQ, remQ, setQ, repQ, evQ] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM subscriptions'),
    env.DB.prepare('SELECT * FROM reminders WHERE sent = 0 AND at <= ?').bind(new Date(now).toISOString()),
    env.DB.prepare("SELECT v FROM settings WHERE k = 'notify'"),
    env.DB.prepare('SELECT * FROM repeats WHERE active = 1'),
    env.DB.prepare('SELECT id, title, date, time, end_time, kind, done FROM events WHERE date >= ? AND date <= ? AND done = 0').bind(k.date, tomorrow),
  ]);
  const subs = subQ.results;
  let sent = 0;

  // 예전 리마인더 API(/api/reminders)로 넣은 한 번짜리 알림
  for (const r of remQ.results) {
    sent += await pushAll(env, subs, { title: 'Sabathia', body: r.title, url: '/' });
    await env.DB.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').bind(r.id).run();
  }
  if (!subs.length) return { sent, notes: 0 };

  const set = parseSettings(setQ.results[0] && setQ.results[0].v);
  let overdue = 0;
  if (set.am && inWindow(k.min, set.am, DIGEST_WINDOW)) {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE date < ? AND done = 0 AND kind != 'event'").bind(k.date).first();
    overdue = row ? row.n : 0;
  }
  const cands = candidates(k, tomorrow, set, repQ.results, evQ.results, overdue);
  let fresh = [];
  if (cands.length) {
    const res = await env.DB.batch(cands.map((c) => env.DB.prepare('INSERT OR IGNORE INTO push_log (k, at) VALUES (?, ?)').bind(c.key, now)));
    fresh = cands.filter((_, i) => res[i].meta && res[i].meta.changes === 1);
  }
  for (const c of fresh) sent += await pushAll(env, subs, { title: c.title, body: c.body, url: c.url, tag: c.tag });
  if (k.min % 360 === 0) await env.DB.prepare('DELETE FROM push_log WHERE at < ?').bind(now - 3 * 864e5).run();
  return { sent, notes: fresh.length };
}

/* ---------- API ---------- */
export async function notifyApi(req, env, path) {
  try {
    return await route(req, env, path);
  } catch (err) {
    return json({ error: err.message || String(err) }, err.status || 400);
  }
}

const repRow = (r) => ({ id: r.id, title: r.title, time: r.time, days: String(r.days).split('').map(Number), active: !!r.active });

async function state(env) {
  const [setQ, repQ, subQ] = await env.DB.batch([
    env.DB.prepare("SELECT v FROM settings WHERE k = 'notify'"),
    env.DB.prepare('SELECT * FROM repeats ORDER BY time, id'),
    env.DB.prepare('SELECT COUNT(*) AS n FROM subscriptions'),
  ]);
  return {
    settings: parseSettings(setQ.results[0] && setQ.results[0].v),
    repeats: repQ.results.map(repRow),
    subs: subQ.results[0].n,
    ready: !!(env.VAPID_PUBLIC && env.VAPID_PRIVATE_JWK),
  };
}

function repeatInput(x, prev) {
  const title = String(x.title ?? (prev ? prev.title : '')).trim().slice(0, 100);
  if (!title) throw httpError(400, '제목이 필요합니다');
  const time = String(x.time ?? (prev ? prev.time : ''));
  if (!TIME_RE.test(time)) throw httpError(400, '시각은 24시간제 HH:MM 형식이어야 합니다');
  let days = x.days ?? (prev ? String(prev.days).split('').map(Number) : [0, 1, 2, 3, 4, 5, 6]);
  if (!Array.isArray(days)) throw httpError(400, 'days는 요일 숫자 배열이어야 합니다 (0 = 일요일)');
  days = [...new Set(days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) throw httpError(400, '요일을 하나 이상 골라 주세요');
  const active = x.active ?? (prev ? !!prev.active : true);
  return { title, time, days: days.join(''), active: active ? 1 : 0 };
}

async function route(req, env, path) {
  const m = req.method;

  if (path === '/api/notify' && m === 'GET') return json(await state(env));

  if (path === '/api/notify' && m === 'PUT') {
    const b = await readBody(req);
    const cur = (await state(env)).settings;
    const next = { ...cur };
    if ('lead' in b) {
      if (b.lead !== null && !(Number.isInteger(b.lead) && b.lead >= 0 && b.lead <= 180)) throw httpError(400, 'lead는 0~180(분) 또는 null(끔)이어야 합니다');
      next.lead = b.lead;
    }
    for (const key of ['am', 'pm']) {
      if (!(key in b)) continue;
      if (b[key] !== '' && !TIME_RE.test(String(b[key]))) throw httpError(400, `${key}는 HH:MM 이거나 빈 값(끔)이어야 합니다`);
      next[key] = b[key];
    }
    await env.DB.prepare("INSERT OR REPLACE INTO settings (k, v) VALUES ('notify', ?)").bind(JSON.stringify(next)).run();
    return json({ settings: next });
  }

  if (path === '/api/repeats' && m === 'POST') {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM repeats').first();
    if (count.n >= 50) throw httpError(400, '반복 알림은 50개까지 만들 수 있습니다');
    const r = repeatInput(await readBody(req), null);
    const row = await env.DB.prepare('INSERT INTO repeats (title, time, days, active) VALUES (?, ?, ?, ?) RETURNING *').bind(r.title, r.time, r.days, r.active).first();
    return json({ repeat: repRow(row) }, 201);
  }
  const rep = path.match(/^\/api\/repeats\/(\d+)$/);
  if (rep && m === 'PATCH') {
    const prev = await env.DB.prepare('SELECT * FROM repeats WHERE id = ?').bind(rep[1]).first();
    if (!prev) throw httpError(404, '반복 알림을 찾을 수 없습니다');
    const r = repeatInput(await readBody(req), prev);
    await env.DB.prepare('UPDATE repeats SET title = ?, time = ?, days = ?, active = ? WHERE id = ?').bind(r.title, r.time, r.days, r.active, prev.id).run();
    return json({ repeat: repRow({ ...prev, ...r }) });
  }
  if (rep && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM repeats WHERE id = ?').bind(rep[1]).run();
    return json({ ok: true });
  }

  if (path === '/api/subscribe' && m === 'POST') {
    const sub = await readBody(req);
    const k = sub && sub.keys;
    if (!sub || !/^https:\/\//.test(String(sub.endpoint)) || !k || !k.p256dh || !k.auth) throw httpError(400, '구독 정보가 올바르지 않습니다');
    await env.DB.prepare('INSERT OR REPLACE INTO subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)')
      .bind(String(sub.endpoint), String(k.p256dh), String(k.auth)).run();
    return json({ ok: true });
  }
  if (path === '/api/unsubscribe' && m === 'POST') {
    const b = await readBody(req);
    await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(String(b.endpoint || '')).run();
    return json({ ok: true });
  }
  if (path === '/api/test' && m === 'POST') {
    const { results } = await env.DB.prepare('SELECT * FROM subscriptions').all();
    const sent = await pushAll(env, results, { title: 'Sabathia', body: '테스트 알림입니다.', url: '/schedule/#prefs', tag: 'test' });
    return json({ sent, subs: results.length });
  }

  // 한 번짜리 리마인더 (화면은 없다. 시각은 UTC ISO 문자열)
  if (path === '/api/reminders' && m === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM reminders WHERE sent = 0 ORDER BY at').all();
    return json(results);
  }
  if (path === '/api/reminders' && m === 'POST') {
    const { title, at } = await readBody(req);
    if (!title || !at || Number.isNaN(Date.parse(at))) throw httpError(400, 'title, at(UTC ISO 시각)이 필요합니다');
    const r = await env.DB.prepare('INSERT INTO reminders (title, at) VALUES (?, ?) RETURNING *').bind(String(title).slice(0, 200), new Date(at).toISOString()).first();
    return json(r, 201);
  }
  const del = path.match(/^\/api\/reminders\/(\d+)$/);
  if (del && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM reminders WHERE id = ?').bind(del[1]).run();
    return json({ ok: true });
  }

  throw httpError(404, '없는 경로입니다');
}
