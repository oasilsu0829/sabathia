#!/usr/bin/env bash
# 알리미 설치: 스킬/스크립트를 OpenClaw에 복사하고 cron 작업 2개를 등록한다.
# 여러 번 실행해도 같은 이름의 작업은 지우고 다시 만든다.
#
#   TELEGRAM_USER_ID=123456789 ./scripts/install.sh
set -euo pipefail

: "${TELEGRAM_USER_ID:?TELEGRAM_USER_ID 환경 변수에 텔레그램 숫자 user ID를 넣어 주세요}"
BRIEF_CRON="${ALIMI_BRIEF_CRON:-0 7 * * *}"
UPCOMING_MINUTES="${ALIMI_UPCOMING_MINUTES:-30}"
TZ_NAME="${ALIMI_TZ:-Asia/Seoul}"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
SKILL_DIR="$STATE_DIR/workspace/skills/alimi-reminder"
ALIMI_DIR="$STATE_DIR/alimi"

for bin in openclaw gog python3; do
  command -v "$bin" >/dev/null || { echo "❌ $bin 이(가) 설치되어 있지 않아요." >&2; exit 1; }
done

echo "▶ 스킬 설치: $SKILL_DIR"
mkdir -p "$SKILL_DIR"
sed "s/{{TELEGRAM_USER_ID}}/$TELEGRAM_USER_ID/g" \
  "$REPO_DIR/skills/alimi-reminder/SKILL.md" > "$SKILL_DIR/SKILL.md"

echo "▶ 스크립트 설치: $ALIMI_DIR/alimi.py"
mkdir -p "$ALIMI_DIR"
install -m 755 "$REPO_DIR/scripts/alimi.py" "$ALIMI_DIR/alimi.py"

echo "▶ 기존 알리미 작업 정리"
openclaw cron list --all --json | python3 -c '
import json, sys
data = json.load(sys.stdin)
jobs = data.get("jobs", []) if isinstance(data, dict) else data
for job in jobs:
    if job.get("name", "").startswith("알리미:"):
        print(job["id"])
' | while read -r id; do
  openclaw cron remove "$id" >/dev/null && echo "  - 삭제: $id"
done

echo "▶ 아침 브리핑 등록 ($BRIEF_CRON, $TZ_NAME)"
openclaw cron create "$BRIEF_CRON" \
  --name "알리미: 아침 브리핑" \
  --tz "$TZ_NAME" \
  --exact \
  --command-argv "[\"python3\",\"$ALIMI_DIR/alimi.py\",\"brief\"]" \
  --timeout-seconds 120 \
  --announce --channel telegram --to "$TELEGRAM_USER_ID"

echo "▶ 일정 사전 알림 등록 (5분마다 확인, ${UPCOMING_MINUTES}분 전 알림)"
openclaw cron create "*/5 * * * *" \
  --name "알리미: 일정 사전 알림" \
  --tz "$TZ_NAME" \
  --exact \
  --command-argv "[\"python3\",\"$ALIMI_DIR/alimi.py\",\"upcoming\",\"--minutes\",\"$UPCOMING_MINUTES\"]" \
  --timeout-seconds 60 \
  --announce --channel telegram --to "$TELEGRAM_USER_ID"

echo
openclaw cron list
echo
echo "✅ 완료. 브리핑 테스트: openclaw cron run <아침 브리핑 job-id>"
