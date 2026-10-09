# 알리미 (OpenClaw + 텔레그램)

클라우드 서버에서 돌아가는 [OpenClaw](https://openclaw.ai)로 텔레그램 알림을 받는 개인 알리미입니다.

| 기능 | 언제 | 방식 |
| --- | --- | --- |
| ☀️ 아침 브리핑 | 매일 07:00 (한국 시각) | 오늘 구글 캘린더 일정과 오늘 남은 리마인더 요약 |
| 🔔 일정 사전 알림 | 5분마다 확인 | 30분 안에 시작하는 캘린더 일정을 한 번만 알림 |
| ⏰ 리마인더 | 말로 등록 | 텔레그램에 "내일 3시에 병원 예약 알려줘"라고 보내면 등록 |

```
텔레그램 ──▶ OpenClaw Gateway (VPS, Claude) ──▶ alimi-reminder 스킬 ──▶ cron 리마인더 등록
                 │
                 ├─ cron "알리미: 아침 브리핑"    ─▶ scripts/alimi.py brief    ─┐
                 └─ cron "알리미: 일정 사전 알림" ─▶ scripts/alimi.py upcoming ─┴─▶ gog(구글 캘린더) ─▶ 텔레그램
```

브리핑과 사전 알림은 OpenClaw의 **command cron 작업**으로 파이썬 스크립트를 실행합니다.
AI 모델을 호출하지 않으므로 5분마다 돌아도 API 비용이 들지 않습니다.
Claude는 텔레그램으로 대화하거나 리마인더를 등록할 때만 사용됩니다.

## 저장소 구성

```
scripts/alimi.py              브리핑 / 사전 알림 스크립트 (파이썬 표준 라이브러리만 사용)
scripts/install.sh            스킬·스크립트 복사 + cron 작업 등록
skills/alimi-reminder/        텔레그램 대화로 리마인더를 등록·조회·취소하는 OpenClaw 스킬
config/openclaw.json5.example openclaw.json 에 넣을 설정 예시
config/env.example            ~/.openclaw/.env 예시 (비밀 값)
tests/test_alimi.py           테스트
```

---

## 설치 가이드

### 1. 서버 준비

Ubuntu 22.04 이상 VPS 한 대를 준비합니다(메모리 2GB 이상 권장, 예: Hetzner, DigitalOcean, Oracle Cloud 무료 티어).
SSH로 접속한 뒤 다음을 실행하세요.

```bash
sudo apt update && sudo apt install -y git python3 curl
# 로그아웃 상태에서도 사용자 서비스(Gateway)가 계속 돌도록
sudo loginctl enable-linger "$USER"
git clone https://github.com/oasilsu0829/sabathia.git ~/sabathia
```

### 2. 텔레그램 봇 만들기

1. 텔레그램에서 **@BotFather**(철자 정확히 확인)와 대화하고 `/newbot`을 실행합니다.
2. 봇 이름과 아이디를 정하면 **봇 토큰**(`123456:ABC...`)을 받습니다. 남에게 보여 주지 마세요.
3. 만든 봇에게 아무 메시지나 하나 보냅니다.
4. 내 **숫자 user ID**를 확인합니다.
   ```bash
   curl -s "https://api.telegram.org/bot<봇토큰>/getUpdates" | python3 -m json.tool | grep -A3 '"from"'
   ```
   `"id": 123456789` 값이 내 user ID입니다.

### 3. OpenClaw 설치 (Claude 연결)

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

설치 마법사(onboarding)가 이어서 실행됩니다.

- 모델 공급자로 **Anthropic**을 고르고 API 키를 넣습니다. 키는 [Anthropic Console](https://console.anthropic.com/)에서 발급합니다.
- 백그라운드 서비스(daemon) 설치는 **예**를 선택합니다.
- 채널 설정은 건너뛰어도 됩니다. 4단계에서 직접 설정합니다.

마법사를 건너뛰었다면 `openclaw onboard --install-daemon`을 실행하세요.

### 4. 설정 넣기

```bash
cp ~/sabathia/config/env.example ~/.openclaw/.env
chmod 600 ~/.openclaw/.env
nano ~/.openclaw/.env                     # ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, GOG_* 채우기
```

`~/.openclaw/openclaw.json`에 [`config/openclaw.json5.example`](config/openclaw.json5.example) 내용을 합쳐 넣습니다.
`<TELEGRAM_USER_ID>`는 2단계에서 확인한 숫자로 바꾸세요. 이 설정으로 다음이 적용됩니다.

- 한국 시간대(`userTimezone: "Asia/Seoul"`)
- **나만** 봇과 대화할 수 있도록 허용 목록 지정(`dmPolicy: "allowlist"`)

```bash
openclaw gateway restart
openclaw doctor
```

이제 텔레그램에서 봇에게 "안녕"이라고 보내 Claude가 답하는지 확인하세요.

### 5. 구글 캘린더 연결 (gog)

[gog](https://github.com/openclaw/gogcli)는 OpenClaw 팀이 만든 구글 워크스페이스 CLI입니다.

1. **설치**: [Releases 페이지](https://github.com/openclaw/gogcli/releases)에서 `gogcli_<버전>_linux_amd64.tar.gz`를 받습니다.
   ARM 서버라면 `arm64`를 받으세요.
   ```bash
   tar xzf gogcli_*_linux_amd64.tar.gz && sudo install gog /usr/local/bin/ && gog --version
   ```
2. **OAuth 클라이언트 만들기** ([Google Cloud Console](https://console.cloud.google.com/)):
   - 새 프로젝트를 만들고 **Google Calendar API**를 사용 설정합니다.
   - OAuth 동의 화면에서 외부(External)를 고르고, 테스트 사용자에 내 Gmail을 추가합니다.
   - 사용자 인증 정보에서 **OAuth 클라이언트 ID**를 만듭니다. 유형은 **데스크톱 앱**입니다.
   - JSON 파일을 내려받아 서버에 복사합니다(`scp`).
3. **인증** (서버에는 브라우저가 없으므로 `--manual` 사용):
   ```bash
   set -a; source ~/.openclaw/.env; set +a      # GOG_KEYRING_* 값 적용
   gog auth credentials ~/client_secret_*.json
   gog auth add you@gmail.com --services calendar --manual
   ```
   - 출력된 URL을 내 PC 브라우저에서 열고 승인합니다.
   - 승인 후 이동한 주소창의 URL 전체를 복사해 터미널에 붙여 넣습니다.
4. **확인**: 아래 명령으로 오늘 일정이 JSON으로 나오면 성공입니다.
   ```bash
   gog --json calendar events primary --today
   ```

> 리프레시 토큰은 `GOG_KEYRING_PASSWORD`로 암호화되어 저장됩니다.
> Gateway가 실행하는 스크립트도 같은 값을 써야 하므로 `~/.openclaw/.env`에 들어 있어야 합니다.

### 6. 알리미 설치

```bash
cd ~/sabathia
TELEGRAM_USER_ID=123456789 ./scripts/install.sh
```

설치 스크립트가 하는 일:
- `~/.openclaw/workspace/skills/alimi-reminder/`에 리마인더 스킬을 설치합니다.
- `~/.openclaw/alimi/alimi.py`에 알림 스크립트를 설치합니다.
- cron 작업 `알리미: 아침 브리핑`(매일 07:00)과 `알리미: 일정 사전 알림`(5분마다)을 등록합니다.

다시 실행해도 기존 작업을 지우고 새로 만들기 때문에, 설정을 바꿀 때도 그냥 다시 실행하면 됩니다.

| 환경 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `ALIMI_BRIEF_CRON` | `0 7 * * *` | 브리핑 시각 (예: 평일만 `0 7 * * 1-5`) |
| `ALIMI_UPCOMING_MINUTES` | `30` | 몇 분 전에 일정을 알릴지 |
| `ALIMI_TZ` | `Asia/Seoul` | 시간대 |

### 7. 테스트

```bash
openclaw cron list                         # job id 확인
openclaw cron run <아침-브리핑-job-id>      # 지금 바로 브리핑 받아 보기
openclaw cron runs --id <job-id>           # 실행 기록
```

---

## 사용법

텔레그램에서 봇에게 그냥 말하면 됩니다.

- `내일 오후 3시에 병원 예약 알려줘`
- `20분 뒤에 빨래 꺼내라고 해줘`
- `매주 월요일 아침 9시에 주간 회의 자료 챙기라고 알려줘`
- `등록된 리마인더 보여줘`
- `병원 리마인더 취소해줘`

등록된 리마인더는 `리마인더: <내용>` 이름의 cron 작업으로 저장됩니다.
그날 남은 리마인더는 아침 브리핑에도 함께 표시됩니다.

브리핑 예시:

```
☀️ 10월 9일 (금) 아침 브리핑

📅 오늘 일정 (3)
• 종일  엄마 생신
• 09:30–10:30  팀 회의 (회의실 A)
• 12:00–13:00  점심 약속

⏰ 오늘 리마인더 (1)
• 21:00  약 먹기

좋은 하루 보내세요!
```

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| 봇이 대답을 안 함 | `openclaw logs --follow`에서 봇 토큰, `allowFrom`의 user ID 확인 |
| 브리핑에 "캘린더를 불러오지 못했어요" | `~/.openclaw/.env`의 `GOG_ACCOUNT`, `GOG_KEYRING_PASSWORD` 확인 후 `openclaw gateway restart` |
| 시간이 9시간 어긋남 | `openclaw.json`의 `userTimezone: "Asia/Seoul"`, 서버 시간대 확인 |
| cron이 안 돎 | `openclaw cron status`, `openclaw gateway status`, `loginctl enable-linger` 적용 여부 |

사전 알림이 실패하면 오류 메시지는 1시간에 한 번만 텔레그램으로 옵니다.

## 개발

```bash
python3 -m unittest discover -s tests -v
```

테스트는 `gog`와 `openclaw`를 가짜 스크립트로 바꿔 실행하므로 실제 계정이 필요 없습니다.
