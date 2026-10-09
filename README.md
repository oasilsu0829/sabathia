# 자비스 (Cloudflare PWA)

Cloudflare Workers 하나로 PWA, API, DB(D1), 예약 푸시(Cron)를 전부 처리합니다. 무료이고 카드가 필요 없습니다.

## 구조
```
public/         PWA (index.html, sw.js, manifest, 아이콘)
src/index.js    API + 1분 간격 cron (리마인더 발송)
src/webpush.js  웹 푸시 암호화/VAPID (외부 라이브러리 없음)
schema.sql      DB 테이블
scripts/gen-keys.mjs  VAPID 키 + 앱 토큰 생성
```

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
   npx wrangler secret put APP_TOKEN
   ```
   각 명령마다 `npm run keys` 출력에서 `=` 뒤의 값을 붙여넣으면 됩니다. **APP_TOKEN은 따로 적어두세요** (폰에서 입력함).

## 폰 설정 (안드로이드 크롬)
1. `https://jarvis.<서브도메인>.workers.dev` 접속
2. 메뉴(⋮) → **앱 설치** 또는 **홈 화면에 추가**
3. 설치한 앱을 열고 APP_TOKEN 입력
4. **알림 켜기** → **테스트**를 눌러 알림이 오면 성공

## 로컬 개발
```
npm run keys > .dev.vars
npm run db:local
npm run dev          # http://localhost:8787 , 크론 테스트: /__scheduled
```

## 다음에 붙일 것
- 캘린더 / 프로젝트 장부 테이블 + API
- 반복 리마인더
