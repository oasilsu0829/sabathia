// 공통 도구: JSON 응답, 오류, 본문 읽기, 토큰 확인, 테이블 준비

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export async function readBody(req) {
  try {
    return await req.json();
  } catch {
    throw httpError(400, 'JSON 본문을 읽을 수 없습니다');
  }
}

// Worker에 API_TOKEN 비밀값이 있으면 Authorization: Bearer <토큰> 이 맞아야 한다. 없으면 열려 있다.
export function authorized(req, env) {
  const token = (env.API_TOKEN || '').trim();
  if (!token) return true;
  const h = req.headers.get('Authorization') || '';
  const given = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (given.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= given.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

// 테이블은 첫 요청(또는 첫 cron) 때 만든다. 대시보드에서 SQL을 따로 돌릴 필요가 없다.
let ready = null;
export function ensureTables(env) {
  if (!ready) {
    ready = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS subscriptions (
        endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL)`),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, at TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0)`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_due ON reminders (sent, at)'),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT,
        end_time TEXT,
        kind TEXT NOT NULL DEFAULT 'event',
        done INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        updated TEXT NOT NULL,
        cat TEXT NOT NULL DEFAULT ''
      )`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_events_date ON events (date)'),
      // 알림 설정(k='notify')
      env.DB.prepare('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)'),
      // 반복 알림: days는 요일 숫자를 이어 붙인 글자('135' = 월·수·금, 0 = 일요일), time은 한국 시각 HH:MM
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS repeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, time TEXT NOT NULL,
        days TEXT NOT NULL DEFAULT '0123456', active INTEGER NOT NULL DEFAULT 1)`),
      // 보낸 알림 기록: 같은 알림을 두 번 보내지 않게 한다
      env.DB.prepare('CREATE TABLE IF NOT EXISTS push_log (k TEXT PRIMARY KEY, at INTEGER NOT NULL)'),
      // 장부: 프로젝트 하나가 한 줄. data는 JSON, updated는 ms, deleted는 지운 표시(다른 기기에도 지워지게 남겨 둔다)
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`),
      // 음악 잼: 손님이 넣은 곡 대기열(호스트 화면이 가져가 Spotify 플레이리스트에 넣고 지운다)
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS jam_q (
        id TEXT PRIMARY KEY, pid TEXT NOT NULL, uris TEXT NOT NULL DEFAULT '[]', q TEXT NOT NULL DEFAULT '',
        label TEXT NOT NULL DEFAULT '', by TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT '')`),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_jam_q ON jam_q (pid, at)'),
    ])
      // 예전에 만든 events 테이블에는 cat 열이 없다. 이미 있으면 duplicate column 오류가 나므로 무시한다.
      .then(() => env.DB.prepare("ALTER TABLE events ADD COLUMN cat TEXT NOT NULL DEFAULT ''").run().catch((e) => {
        if (!/duplicate column/i.test(String(e && e.message))) throw e;
      }))
      // jam_q 첫 판에는 kind 열이 없었다
      .then(() => env.DB.prepare("ALTER TABLE jam_q ADD COLUMN kind TEXT NOT NULL DEFAULT ''").run().catch((e) => {
        if (!/duplicate column/i.test(String(e && e.message))) throw e;
      }))
      .catch((e) => { ready = null; throw e; });
  }
  return ready;
}
