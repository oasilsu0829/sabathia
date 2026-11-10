CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh   TEXT NOT NULL,
  auth     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  at    TEXT NOT NULL,           -- UTC ISO 8601
  sent  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_due ON reminders (sent, at);
-- 일정 (OpenClaw 스킬 · /schedule/ 앱). Worker가 첫 요청 때 자동으로 만든다
CREATE TABLE IF NOT EXISTS events (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  date     TEXT NOT NULL,          -- YYYY-MM-DD (한국 날짜)
  time     TEXT,                   -- HH:MM
  end_time TEXT,
  kind     TEXT NOT NULL DEFAULT 'event',  -- event | task | deadline
  done     INTEGER NOT NULL DEFAULT 0,
  note     TEXT NOT NULL DEFAULT '',
  source   TEXT NOT NULL DEFAULT '',
  updated  TEXT NOT NULL,
  cat      TEXT NOT NULL DEFAULT ''   -- '' | report | school | academy | none (묶음)
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events (date);

-- 아래 테이블도 Worker가 첫 요청(또는 첫 cron) 때 자동으로 만든다 (src/util.js)
-- 알림 설정 (k = 'notify', v = {"lead":10,"am":"07:30","pm":"20:00"})
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
-- 반복 알림: days = 요일 숫자를 이어 붙인 글자('135' = 월·수·금, 0 = 일요일), time = 한국 시각 HH:MM
CREATE TABLE IF NOT EXISTS repeats (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  title  TEXT NOT NULL,
  time   TEXT NOT NULL,
  days   TEXT NOT NULL DEFAULT '0123456',
  active INTEGER NOT NULL DEFAULT 1
);
-- 보낸 알림 기록 (같은 알림을 두 번 보내지 않게)
CREATE TABLE IF NOT EXISTS push_log (k TEXT PRIMARY KEY, at INTEGER NOT NULL);
-- 장부: 프로젝트 하나가 한 줄. data = JSON, updated = ms, deleted = 지운 표시
CREATE TABLE IF NOT EXISTS projects (
  id      TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
