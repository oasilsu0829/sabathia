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
  updated  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events (date);
