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
- [ ] **Workers & Pages → Import a repository로 배포** (Project name은 반드시 `jarvis`, 브랜치는 위 기본 브랜치) ← 다음 할 일
- [ ] 배포 주소의 `/keys.html`에서 키 생성 → Worker Settings에 Secret 3개 등록: `VAPID_PUBLIC`, `VAPID_PRIVATE_JWK`, `APP_TOKEN`
- [ ] 폰 크롬에서 앱 설치 → 토큰 입력 → 알림 켜기 → 테스트

## 구조
```
public/index.html   PWA UI (리마인더 추가/삭제, 알림 구독, 테스트)
public/sw.js        서비스 워커 (push → 알림 표시)
public/keys.html    폰에서 VAPID 키/토큰 생성 (브라우저 안에서만 생성)
src/index.js        /api/* 라우트 + scheduled() 1분 cron으로 리마인더 발송
src/webpush.js      RFC 8291(aes128gcm) + RFC 8292(VAPID), WebCrypto만 사용
schema.sql          subscriptions, reminders
test/               ece.mjs(암호화), vapid.mjs(JWT 서명) 검증 스크립트
```
- API 인증: `Authorization: Bearer <APP_TOKEN>` (`/api/vapid`만 공개)
- 리마인더 시각은 UTC ISO 문자열로 저장

## 다음 기능 (예정)
- 캘린더, 프로젝트 장부 (원래 핵심 기능)
- 반복 리마인더

## 사용자 선호
- 답변은 짧고 직접적으로. 이모지 쓰지 않기
- 모바일(안드로이드) 기준으로 안내
