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
-- 할 일 타임라인 (앱과 OpenClaw가 같이 씀). Worker가 처음 요청 때 자동으로도 만든다
CREATE TABLE IF NOT EXISTS tasks (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  title    TEXT NOT NULL,
  start_at TEXT NOT NULL,        -- UTC ISO 8601
  end_at   TEXT,                 -- UTC ISO 8601, 없으면 시점 하나
  note     TEXT,
  done     INTEGER NOT NULL DEFAULT 0,
  source   TEXT NOT NULL DEFAULT 'app',   -- app | openclaw
  notified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tasks_start ON tasks (start_at);
