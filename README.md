# Sabathia (Cloudflare PWA)

학습앱을 한곳에 모은 개인 PWA. Cloudflare Workers 하나로 화면, API, DB(D1), 예약 푸시(Cron)를 전부 처리합니다. 무료이고 카드가 필요 없습니다.

| 주소 | 앱 |
| --- | --- |
| `/` | Sabathia 홈 (앱 아이콘, 폰 앱 실행) |
| `/plan/` | 15577 공부 블록 플래너 |
| `/vocab/` | 어원 단어 (능률보카 어원편 간격 반복) |
| `/schedule/` | 일정 (OpenClaw가 넣는 할 일·일정·마감) |
| `/pdf/` | 사진 PDF 묶음기 |
| `/lecture/` | 수업 녹음 (받아쓰기 → 수업 노트로 보내기) |
| `/projects/` | 장부 (프로젝트·단계·마감, 기기 간 동기화) |
| `/focus/` | 집중 타이머 |

디자인 규칙은 [`docs/design-language.md`](docs/design-language.md). 새 앱은 `public/<폴더>/`에 넣고 `public/apps.js`에 한 항목을 더하면 홈에 나옵니다.

15577과 어원 단어 기록은 기기 브라우저에 저장되므로 주소가 바뀌면 따라오지 않습니다. 앱의 **온라인 저장**에서 예전과 같은 ID로 연결하면 그대로 이어집니다.

## 구조
```
public/         PWA (홈 index.html, apps.js, sabathia.js, sw.js, manifest, 아이콘, 앱 폴더)
src/index.js    /api/* 라우터(토큰 확인) + 1분 간격 cron
src/events.js   일정 API
src/notify.js   알림: 구독, 알림 설정, 반복 알림, cron이 보낼 알림 고르기
src/projects.js 장부 동기화 API
src/webpush.js  웹 푸시 암호화/VAPID (외부 라이브러리 없음)
src/util.js     공통 도구, 테이블 자동 생성
schema.sql      DB 테이블 (참고용. Worker가 첫 요청 때 스스로 만든다)
scripts/gen-keys.mjs  VAPID 키 + API 토큰 생성
test/           node test/notify.mjs (알림 고르기), ece.mjs · vapid.mjs (푸시 암호화)
```

## 알림
일정 앱 → 설정 → 알림에서 기기마다 "이 기기에서 알림 켜기"를 누른다. 언제 받을지(시작 전 알림, 아침 요약, 전날 저녁 마감 알림)와 반복 알림은 서버에 저장되어 모든 기기에 같이 적용된다. 런처 앱(WebView) 안에서는 웹 푸시가 안 되니 크롬에 설치한 Sabathia에서 켠다.

## 토큰
Worker에 `API_TOKEN` 비밀값을 넣으면 `/api/*` 전체(공개 키 `/api/vapid` 제외)에 `Authorization: Bearer <토큰>`이 필요하다. 일정 앱 설정의 토큰 칸에 넣으면 홈·일정·장부가 같이 쓴다. 넣지 않으면 주소를 아는 사람은 누구나 API를 쓸 수 있다.

## 배포 A: 폰만으로 (GitHub 연동)
1. Cloudflare 대시보드 → Storage & Databases → **D1** → Create → 이름 `jarvis-db`
2. 만든 DB → Console에 `schema.sql` 내용을 붙여넣고 실행
3. DB 화면의 **Database ID**를 복사해 GitHub 웹 편집기로 `wrangler.toml`의 `REPLACE_WITH_ID`에 붙여넣기 (`VAPID_SUBJECT`도 본인 이메일로)
4. Workers & Pages → Create → **Import a repository** → 이 저장소 선택 → Deploy
5. 배포된 주소 뒤에 `/keys.html`을 붙여서 열고, 값 3개를 Worker → Settings → Variables and Secrets에 **Secret**으로 등록
6. 아래 "폰 설정"으로 진행

## 배포 B: PC (Node 18 이상 필요)
1. https://dash.cloudflare.com 가입 (무료)
2. 압축을 풀고 폴더에서 다음을 실행
   ```
   npm install
   npx wrangler login
   npx wrangler d1 create jarvis-db
   ```
3. 출력된 `database_id`를 `wrangler.toml`의 `REPLACE_WITH_ID` 자리에 붙여넣기. 같은 파일의 `VAPID_SUBJECT`를 `mailto:본인이메일`로 수정
4. DB를 만들고 배포
   ```
   npm run db:remote
   npm run deploy
   ```
   (처음 배포하면 workers.dev 서브도메인을 정하라고 나옴)
5. 키를 만들고 secret으로 등록
   ```
   npm run keys
   npx wrangler secret put VAPID_PUBLIC
   npx wrangler secret put VAPID_PRIVATE_JWK
   npx wrangler secret put API_TOKEN
   ```
   각 명령마다 `npm run keys` 출력에서 `=` 뒤의 값을 붙여넣으면 됩니다. **API_TOKEN은 따로 적어두세요** (일정 앱 설정의 토큰 칸에 입력).

## 폰 설정 (안드로이드 크롬)
1. `https://sabathia.<서브도메인>.workers.dev` 접속
2. 메뉴(⋮) → **앱 설치** 또는 **홈 화면에 추가** (Sabathia 하나만 설치하면 됩니다. 예전에 따로 설치한 '일정' 앱은 지워도 됩니다)
3. 15577, 어원 단어는 각 앱의 온라인 저장에서 예전 ID로 연결

## 로컬 개발
```
npm run keys > .dev.vars
npm run db:local
npm run dev          # http://localhost:8787 , 크론 테스트: /__scheduled
```

## 다음에 붙일 것
- 15577 블록 시작 알림
- 홈 앱 격자 배치(앱 7개)
