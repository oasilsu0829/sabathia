#!/usr/bin/env python3
"""OpenClaw 텔레그램 알리미.

OpenClaw cron의 command 작업으로 실행되며, stdout이 그대로 텔레그램으로 전달된다.
보낼 내용이 없으면 NO_REPLY를 출력해 전송을 건너뛴다.

  alimi.py brief              아침 브리핑 (오늘 구글 캘린더 일정 + 오늘 리마인더)
  alimi.py upcoming [--minutes N]
                              N분(기본 30) 안에 시작하는 일정 사전 알림 (중복 알림 방지)

환경 변수
  GOG_ACCOUNT          gog가 사용할 구글 계정 (예: you@gmail.com)
  ALIMI_CALENDARS      조회할 캘린더 ID (쉼표 구분, 기본 primary, "all"이면 전체)
  ALIMI_TZ             표시 시간대 (기본 Asia/Seoul)
  ALIMI_STATE_DIR      알림 기록 저장 위치 (기본 ~/.openclaw/alimi)
  ALIMI_GOG_BIN        gog 실행 파일 (기본 gog)
  ALIMI_OPENCLAW_BIN   openclaw 실행 파일 (기본 openclaw)
  ALIMI_NOW            테스트용 현재 시각 (ISO 8601)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

NO_REPLY = "NO_REPLY"
REMINDER_PREFIX = "리마인더:"
WEEKDAYS = "월화수목금토일"


def tz() -> ZoneInfo:
    return ZoneInfo(os.environ.get("ALIMI_TZ", "Asia/Seoul"))


def now() -> datetime:
    fixed = os.environ.get("ALIMI_NOW")
    if fixed:
        return parse_dt(fixed).astimezone(tz())
    return datetime.now(tz())


def parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz())
    return dt


def run_json(cmd: list[str]) -> object:
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip().splitlines()
        raise RuntimeError(detail[-1] if detail else f"exit {proc.returncode}")
    return json.loads(proc.stdout or "null")


# --- 구글 캘린더 (gog) ---------------------------------------------------------


def calendar_args() -> list[str]:
    raw = os.environ.get("ALIMI_CALENDARS", "primary").strip()
    if raw == "all":
        return ["--all", "--sort", "start"]
    ids = [c.strip() for c in raw.split(",") if c.strip()]
    if len(ids) == 1:
        return [ids[0]]
    return ["--calendars", ",".join(ids), "--sort", "start"]


def fetch_events(start: datetime, end: datetime) -> list[dict]:
    cmd = [
        os.environ.get("ALIMI_GOG_BIN", "gog"),
        "--json",
        "--no-input",
        "calendar",
        "events",
        *calendar_args(),
        "--from",
        start.isoformat(),
        "--to",
        end.isoformat(),
        "--max",
        "100",
    ]
    data = run_json(cmd)
    events = data.get("events", []) if isinstance(data, dict) else data or []
    return [e for e in events if e.get("status") != "cancelled"]


def event_start(event: dict) -> tuple[datetime, bool]:
    """(시작 시각, 종일 여부)."""
    start = event.get("start") or {}
    if start.get("dateTime"):
        return parse_dt(start["dateTime"]).astimezone(tz()), False
    day = date.fromisoformat(start["date"])
    return datetime.combine(day, time.min, tz()), True


def event_end(event: dict) -> datetime | None:
    end = event.get("end") or {}
    if end.get("dateTime"):
        return parse_dt(end["dateTime"]).astimezone(tz())
    return None


def event_line(event: dict) -> str:
    start, all_day = event_start(event)
    if all_day:
        when = "종일"
    else:
        when = start.strftime("%H:%M")
        end = event_end(event)
        if end and end.date() == start.date():
            when += f"–{end.strftime('%H:%M')}"
    line = f"• {when}  {event.get('summary') or '(제목 없음)'}"
    if event.get("location"):
        line += f" ({event['location']})"
    return line


# --- 리마인더 (OpenClaw cron) --------------------------------------------------


def fetch_reminders(start: datetime, end: datetime) -> list[tuple[datetime, str]]:
    data = run_json([os.environ.get("ALIMI_OPENCLAW_BIN", "openclaw"), "cron", "list", "--json"])
    jobs = data.get("jobs", []) if isinstance(data, dict) else data or []
    found = []
    for job in jobs:
        name = job.get("name") or ""
        if not name.startswith(REMINDER_PREFIX) or job.get("enabled") is False:
            continue
        next_ms = (job.get("state") or {}).get("nextRunAtMs") or job.get("nextRunAtMs")
        if not next_ms:
            continue
        when = datetime.fromtimestamp(next_ms / 1000, tz())
        if start <= when < end:
            found.append((when, name[len(REMINDER_PREFIX):].strip()))
    return sorted(found)


# --- 명령 ----------------------------------------------------------------------


def brief() -> str:
    current = now()
    day_start = datetime.combine(current.date(), time.min, tz())
    day_end = day_start + timedelta(days=1)

    weekday = WEEKDAYS[current.weekday()]
    lines = [f"☀️ {current.month}월 {current.day}일 ({weekday}) 아침 브리핑", ""]

    try:
        events = sorted(fetch_events(day_start, day_end), key=lambda e: event_start(e)[0])
        events = [e for e in events if event_start(e)[0] < day_end]
        if events:
            lines.append(f"📅 오늘 일정 ({len(events)})")
            lines += [event_line(e) for e in events]
        else:
            lines.append("📅 오늘 일정이 없어요.")
    except Exception as exc:  # 한쪽이 실패해도 나머지는 보낸다
        lines.append(f"⚠️ 캘린더를 불러오지 못했어요: {exc}")

    lines.append("")
    try:
        reminders = fetch_reminders(current, day_end)
        if reminders:
            lines.append(f"⏰ 오늘 리마인더 ({len(reminders)})")
            lines += [f"• {when:%H:%M}  {text}" for when, text in reminders]
        else:
            lines.append("⏰ 오늘 남은 리마인더가 없어요.")
    except Exception as exc:
        lines.append(f"⚠️ 리마인더 목록을 불러오지 못했어요: {exc}")

    lines += ["", "좋은 하루 보내세요!"]
    return "\n".join(lines)


def state_path() -> Path:
    base = os.environ.get("ALIMI_STATE_DIR") or Path.home() / ".openclaw" / "alimi"
    return Path(base) / "notified.json"


def load_state() -> dict[str, str]:
    try:
        return json.loads(state_path().read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(state: dict[str, str]) -> None:
    path = state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    tmp.replace(path)


def upcoming(minutes: int) -> str:
    current = now()
    window_end = current + timedelta(minutes=minutes)
    events = fetch_events(current, window_end)

    state = load_state()
    # 하루 지난 기록은 정리
    cutoff = current - timedelta(days=1)
    state = {k: v for k, v in state.items() if parse_dt(v) > cutoff}

    due = []
    for event in events:
        start, all_day = event_start(event)
        if all_day or not (current < start <= window_end):
            continue
        key = f"{event.get('id')}|{start.isoformat()}"
        if key in state:
            continue
        state[key] = start.isoformat()
        due.append((start, event))

    save_state(state)
    if not due:
        return NO_REPLY

    lines = []
    for start, event in sorted(due, key=lambda d: d[0]):
        left = max(1, round((start - current).total_seconds() / 60))
        lines.append(f"🔔 {left}분 뒤 일정")
        lines.append(event_line(event))
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="OpenClaw 텔레그램 알리미")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("brief", help="아침 브리핑")
    up = sub.add_parser("upcoming", help="곧 시작하는 일정 알림")
    up.add_argument("--minutes", type=int, default=30)
    args = parser.parse_args(argv)

    if args.command == "brief":
        print(brief())
        return 0
    try:
        print(upcoming(args.minutes))
    except Exception as exc:
        # 5분마다 실행되므로 오류 메시지는 1시간에 한 번만 보낸다
        state = load_state()
        last = state.get("_last_error_alert")
        if last and now() - parse_dt(last) < timedelta(hours=1):
            print(NO_REPLY)
        else:
            state["_last_error_alert"] = now().isoformat()
            save_state(state)
            print(f"⚠️ 일정 사전 알림 실패: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
