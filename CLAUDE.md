# 자비스 (sabathia) — 작업 인계 메모

## 목표
개인용 "자비스" 파이프라인. 안드로이드 폰 중심. 텔레그램은 쓰지 않기로 함 (한국에서 이미지가 좋지 않음). **PWA + 웹 푸시** 방식.

## 결정된 것
- 호스팅: **Cloudflare 무료** (Workers + Static Assets + D1 + Cron). 카드가 필요 없음
  - Oracle Free Tier는 가입이 안 돼서 포기. 상시 켜둘 집 PC도 없음
- 사용자는 **지금 PC가 없음** → 배포는 **GitHub 연동(Workers Builds)** 방식. 로컬 `wrangler` 명령어를 전제로 하지 말 것
- 이 저장소에 있던 이전 텔레그램/OpenClaw 알리미 코드는 삭제함 (커밋 62ce707에 남아 있음)
- 기본 브랜치: `ccr-a6652a14-opge2l`

## 현재 상태
- [x] 코드 작성, 로컬 검증 완료 (API, cron, 푸시 암호화는 http_ece로 복호화 확인, VAPID JWT 서명 검증)
- [x] D1 `jarvis-db` 생성, 테이블 생성 완료. ID는 `wrangler.toml`에 반영됨
- [x] **배포 완료: https://sabathia.oasilsu0829.workers.dev** (Project name `sabathia`, 브랜치는 위 기본 브랜치. Build command는 비우고 Deploy command는 `npx wrangler deploy`)
- [ ] 배포 주소의 `/keys.html`에서 키 생성 → Worker Settings에 Secret 등록: `VAPID_PUBLIC`, `VAPID_PRIVATE_JWK` (완료)
- [ ] 폰 크롬에서 앱 설치 → 토큰 입력 → 알림 켜기 → 테스트
- [x] 할 일 타임라인 (런처 홈 화면 메인) + `/api/tasks` + OpenClaw 스킬 (`openclaw/skills/jarvis-tasks`)
- [x] 별도 타임라인 앱 `/timeline/` (독립 PWA, 손그림 스케치 기준: 위 왼쪽 날짜 물방울, 오른쪽 일정/남은 시간, 아래 가로 타임라인)
- [ ] OpenClaw 서버에 스킬 복사 (`~/.openclaw/skills/jarvis-tasks/SKILL.md`)

## 구조
```
public/index.html   PWA UI (리마인더 추가/삭제, 알림 구독, 테스트)
public/sw.js        서비스 워커 (push → 알림 표시)
public/timeline/    별도 타임라인 앱(PWA, scope /timeline/). 같은 /api/tasks, 같은 sw.js 구독 사용
public/keys.html    폰에서 VAPID 키/토큰 생성 (브라우저 안에서만 생성)
src/index.js        /api/* 라우트 + scheduled() 1분 cron으로 리마인더 발송
src/webpush.js      RFC 8291(aes128gcm) + RFC 8292(VAPID), WebCrypto만 사용
schema.sql          subscriptions, reminders
android/            홈 런처 앱(WebView, JS 브리지 window.Jarvis: launch/apps/open). Actions가 빌드해 릴리스 'launcher'에 jarvis.apk 게시
test/               ece.mjs(암호화), vapid.mjs(JWT 서명) 검증 스크립트
```
- API 인증 없음 (사용자 요청으로 APP_TOKEN 제거). 주소를 아는 사람은 API 사용 가능
- 리마인더 시각은 UTC ISO 문자열로 저장
- 할 일 API: `GET /api/tasks?date=YYYY-MM-DD`(한국 날짜, 기본 오늘) 또는 `?from=&to=`, `POST`, `PATCH /:id`, `DELETE /:id`. 필드 title/start/end/note/done/source. 오프셋 없는 시각은 +09:00으로 해석

- 런처 WebView는 웹 푸시 미지원 → 알림은 크롬 PWA로 받음

## 다음 기능 (예정)
- 캘린더, 프로젝트 장부 (원래 핵심 기능)
- 반복 리마인더

## 사용자 선호
- 답변은 짧고 직접적으로. 이모지 쓰지 않기
- 모바일(안드로이드) 기준으로 안내
