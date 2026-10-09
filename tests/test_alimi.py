"""alimi.py 테스트. gog/openclaw를 가짜 스크립트로 바꿔 실행한다.

    python3 -m unittest discover -s tests
"""

import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "alimi.py"

EVENTS = {
    "events": [
        {
            "id": "allday",
            "summary": "엄마 생신",
            "start": {"date": "2026-10-09"},
            "end": {"date": "2026-10-10"},
        },
        {
            "id": "meeting",
            "summary": "팀 회의",
            "location": "회의실 A",
            "start": {"dateTime": "2026-10-09T09:30:00+09:00"},
            "end": {"dateTime": "2026-10-09T10:30:00+09:00"},
        },
        {
            "id": "cancelled",
            "status": "cancelled",
            "summary": "취소된 일정",
            "start": {"dateTime": "2026-10-09T09:40:00+09:00"},
        },
        {
            "id": "lunch",
            "summary": "점심 약속",
            "start": {"dateTime": "2026-10-09T03:00:00Z"},
            "end": {"dateTime": "2026-10-09T04:00:00Z"},
        },
    ]
}

JOBS = {
    "jobs": [
        {"name": "리마인더: 약 먹기", "enabled": True, "state": {"nextRunAtMs": 1791547200000}},  # 10-09 21:00 KST
        {"name": "리마인더: 내일 일", "enabled": True, "state": {"nextRunAtMs": 1791612000000}},  # 10-10 15:00 KST
        {"name": "리마인더: 꺼둔 것", "enabled": False, "state": {"nextRunAtMs": 1791547200000}},
        {"name": "알리미: 아침 브리핑", "enabled": True, "state": {"nextRunAtMs": 1791496800000}},
    ]
}


class AlimiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.env = {
            **os.environ,
            "ALIMI_STATE_DIR": str(self.tmp / "state"),
            "ALIMI_GOG_BIN": self.fake("gog", EVENTS),
            "ALIMI_OPENCLAW_BIN": self.fake("openclaw", JOBS),
            "ALIMI_TZ": "Asia/Seoul",
        }

    def fake(self, name, payload, fail=False):
        path = self.tmp / name
        body = "sys.exit('auth failed')" if fail else f"print({json.dumps(json.dumps(payload))})"
        path.write_text(f"#!{sys.executable}\nimport sys\n{body}\n")
        path.chmod(0o755)
        return str(path)

    def run_alimi(self, *args, now):
        env = {**self.env, "ALIMI_NOW": now}
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), *args], env=env, capture_output=True, text=True
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return proc.stdout.strip()

    def test_brief(self):
        out = self.run_alimi("brief", now="2026-10-09T07:00:00+09:00")
        self.assertEqual(
            out,
            textwrap.dedent(
                """\
                ☀️ 10월 9일 (금) 아침 브리핑

                📅 오늘 일정 (3)
                • 종일  엄마 생신
                • 09:30–10:30  팀 회의 (회의실 A)
                • 12:00–13:00  점심 약속

                ⏰ 오늘 리마인더 (1)
                • 21:00  약 먹기

                좋은 하루 보내세요!"""
            ),
        )

    def test_brief_survives_calendar_failure(self):
        self.env["ALIMI_GOG_BIN"] = self.fake("gog", None, fail=True)
        out = self.run_alimi("brief", now="2026-10-09T07:00:00+09:00")
        self.assertIn("⚠️ 캘린더를 불러오지 못했어요: auth failed", out)
        self.assertIn("• 21:00  약 먹기", out)

    def test_upcoming_notifies_once(self):
        out = self.run_alimi("upcoming", now="2026-10-09T09:02:00+09:00")
        self.assertEqual(out, "🔔 28분 뒤 일정\n• 09:30–10:30  팀 회의 (회의실 A)")
        # 5분 뒤 다시 실행해도 같은 일정은 다시 알리지 않는다
        self.assertEqual(self.run_alimi("upcoming", now="2026-10-09T09:07:00+09:00"), "NO_REPLY")

    def test_upcoming_skips_far_and_started_events(self):
        self.assertEqual(self.run_alimi("upcoming", now="2026-10-09T08:00:00+09:00"), "NO_REPLY")
        self.assertEqual(self.run_alimi("upcoming", now="2026-10-09T09:31:00+09:00"), "NO_REPLY")

    def test_upcoming_error_is_throttled(self):
        self.env["ALIMI_GOG_BIN"] = self.fake("gog", None, fail=True)
        first = self.run_alimi("upcoming", now="2026-10-09T09:00:00+09:00")
        self.assertEqual(first, "⚠️ 일정 사전 알림 실패: auth failed")
        self.assertEqual(self.run_alimi("upcoming", now="2026-10-09T09:05:00+09:00"), "NO_REPLY")
        self.assertEqual(
            self.run_alimi("upcoming", now="2026-10-09T10:01:00+09:00"),
            "⚠️ 일정 사전 알림 실패: auth failed",
        )


if __name__ == "__main__":
    unittest.main()
