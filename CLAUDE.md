# 자비스 (sabathia) — 작업 인계 메모

## 목표
개인용 "자비스" 파이프라인. 안드로이드 폰 중심. 텔레그램은 쓰지 않기로 함 (한국에서 이미지가 좋지 않음). **PWA + 웹 푸시** 방식.
학습앱은 전부 **Sabathia** 하나로 묶었다(2026-10-29). 한 주소, 한 번 설치(PWA 하나), 디자인 언어 v1.0(`docs/design-language.md`).
- 2026-11-07 사용자 결정: UI를 장부 시안 스타일(옅은 회색 바탕, 흰 둥근 카드, 옅은 그림자, Inter, 파랑 #004ac6)로 전면 교체. `public/theme.css`가 모든 페이지 <head> 끝에서 v1.0 변수를 덮어쓴다. 새 화면은 theme.css 기준. v1.0 문서의 색·글꼴·선·모서리 규칙은 theme.css가 우선
- 루트 `/` = Sabathia 홈. 예전 CMD 자비스 화면(리마인더 UI·배경화면)은 지웠다. 폰 앱 실행(런처)은 홈의 "폰 앱" 시트로
- 홈 배치(사용자가 시안에서 고름): 가로 화면 = C(하루 줄 3칸), 폰 = P5(시계 먼저 + 하루 띠), 패드 세로 = P6. 독(작업표시줄)은 어느 쪽에도 두지 않음
- 앱: 15577 `/plan/`, 어원 단어 `/vocab/`, 일정 `/schedule/`, 사진 PDF `/pdf/`, 수업 녹음 `/lecture/`, 장부 `/projects/`, 집중 `/focus/`, 시험대비 `/exam/`. 원본 저장소(Block-planner, llm-wiki-private)의 사본이고 이제 이쪽이 기준
- FFF 대시보드·주간 루틴은 쓰지 않음(사용자 결정). 할 일·일정은 Sabathia 일정(D1)으로
- 새 앱 추가: `public/<폴더>/index.html` + `public/apps.js`에 한 항목. 앱 페이지는 `/sabathia.js`를 불러오고 맨 위에 `SABATHIA` 줄을 둔다

## 결정된 것
- 호스팅: **Cloudflare 무료** (Workers + Static Assets + D1 + Cron). 카드가 필요 없음
  - Oracle Free Tier는 가입이 안 돼서 포기. 상시 켜둘 집 PC도 없음
- 사용자는 **지금 PC가 없음** → 배포는 **GitHub 연동(Workers Builds)** 방식. 로컬 `wrangler` 명령어를 전제로 하지 말 것
- 이 저장소에 있던 이전 텔레그램/OpenClaw 알리미 코드는 삭제함 (커밋 62ce707에 남아 있음)
- 기본 브랜치: `ccr-a6652a14-opge2l`
- Cloudflare Workers Builds 설정: Build command `npm run build`(echo만 함), Deploy command `npx wrangler deploy`. 이 칸에 브랜치 이름이 들어가면 `ccr-a6652a14-opge2l: not found`로 실패한다. 예전 빌드의 'Retry build'는 예전 설정으로 다시 도니, 설정을 고친 뒤에는 새 커밋으로 확인할 것

## 진행 중 (2026-10-29 세션에서 넘어옴)
- PR #1(학습앱 통합 + 새 홈), PR #2(홈 움직임) 병합됨
- 이름·아이콘: 웹 매니페스트는 PR #1부터 Sabathia. 폰에 예전에 설치한 '자비스' PWA는 크롬이 매니페스트 변경을 늦게(하루 단위, 확인 창) 반영하니 지우고 다시 설치하는 게 빠르다. 런처 APK(`android/`)도 이름 Sabathia + 컨택트 맵 적응형 아이콘으로 바꿈(applicationId는 그대로라 덮어 설치됨)
- **막힌 것: Cloudflare 미리보기 빌드 실패.** 로그는 매번 `Executing user build command: ccr-a6652a14-opge2l` → `not found`. 코드 문제 아님(`npx wrangler deploy --dry-run`, `versions upload --dry-run` 모두 통과). 대시보드 Settings → Builds의 Build command 칸이 화면엔 "None"(빈 칸)으로 보이는데 실제 저장값은 브랜치 이름인 것으로 보임. 오늘 02:54 UTC 정식 빌드는 `npm run build`로 성공했음
  - 다음 할 일: 사용자가 Build command에 `npm run build`를 직접 입력·저장(새로고침해서 남는지 확인) → Claude가 PR 브랜치에 실제 변경이 있는 새 커밋을 올려 확인(빈 커밋 금지) → 초록이면 사용자가 병합
  - 원인: Settings → Builds 위의 **Production / Previews Base** 탭 중 Previews Base(미리보기 빌드 설정)의 Build command에 브랜치 이름이 들어가 있었음. Production 탭은 정상(`npm run build` / `npx wrangler deploy`). Previews Base는 Build `npm run build`, Deploy `npx wrangler versions upload`. 2026-10-29 13:24 UTC 사용자가 Previews Base 수정 완료(캡처로 확인). 그래도 새 커밋 빌드가 예전 값(브랜치 이름)으로 실패해서, 'Builds for Preview branches'를 껐다 켜서 다시 저장함
  - 이 설정 그대로 병합하면 정식 배포도 같은 이유로 실패할 수 있음(사이트는 이전 버전 유지)
- 홈 시안 캔버스: https://claude.ai/artifact/Ggzhjjn3T6q6ZE5ZyXoro2 (가로 A–F, 세로 P1–P6). 사용자 선택: 가로 C(독 없음), 폰 P5, 패드 세로 P6 → 코드에 반영함(`public/index.html`, `public/today.js`)
- 병합 후 사용자가 할 일: 폰·패드 크롬에서 Sabathia 설치, 15577·어원 단어 온라인 저장에 예전 ID로 연결, 예전에 따로 설치한 '일정' 앱은 지워도 됨
- 원본 저장소(Block-planner, llm-wiki-private, fff-dashboard)는 건드리지 않음. 예전 주소는 그대로 열림

## 2026-11-10 세션 (속도·오프라인 / 알림 / 장부 동기화)
- 브랜치 `claude/charming-mendel-vhuvjh`에 커밋 3개 + 문서. 로컬(wrangler dev + Playwright)에서 확인한 것: 오프라인으로 앱 8개 열림, 새로고침 때 최신 반영, 집중 30fps, 알림 설정 화면·API·cron 중복 방지, 토큰 401, 장부 두 기기 동기화·마감 → 일정·내보내기/가져오기
- 확인 못 한 것: 실제 기기에서 푸시가 오는지(샌드박스에서는 푸시 서버에 못 닿고 헤드리스 크롬은 알림 권한이 막혀 있음). 병합 뒤 폰에서 테스트 알림으로 확인할 것
- 병합 후 사용자가 할 일: 폰 크롬에 설치한 Sabathia → 일정 → 설정 → 알림 → "이 기기에서 알림 켜기" → 테스트 알림. 장부는 기기마다 한 번 열면 맞춰짐(토큰을 쓰면 일정 설정에 토큰이 들어 있어야 함)
- 알림 시각 기본값(10분 전 · 07:30 · 20:00)은 사용자에게 물었지만 답이 없어 임의로 정함. 설정에서 바꿀 수 있음

## 현재 상태
- [x] 코드 작성, 로컬 검증 완료 (API, cron, 푸시 암호화는 http_ece로 복호화 확인, VAPID JWT 서명 검증)
- [x] D1 `jarvis-db` 생성, 테이블 생성 완료. ID는 `wrangler.toml`에 반영됨
- [x] **배포 완료: https://sabathia.oasilsu0829.workers.dev** (Project name `sabathia`, 브랜치는 위 기본 브랜치. Build command는 비우고 Deploy command는 `npx wrangler deploy`)
- [ ] 배포 주소의 `/keys.html`에서 키 생성 → Worker Settings에 Secret 등록: `VAPID_PUBLIC`, `VAPID_PRIVATE_JWK` (완료)
- [ ] 폰 크롬에서 Sabathia 설치 → 15577·어원 단어의 온라인 저장에서 예전 ID로 연결 (Firestore 키는 도메인 제한이 없어 새 주소에서도 동작 확인함)

## 구조
```
public/index.html   Sabathia 홈: 화면별 배치 3개(폰 <640 · 세로 화면 · 가로 화면), 오늘 하루 = 24시간 원 그래프 타임테이블(0시 위, 바깥부터 일정·15577·수업 고리, 00–06시는 수면으로 세 고리를 채움), 앱 아이콘(컨택트 맵, 홈에서만 앱 고유색), 폰 앱 시트(런처 브리지). 독 없음
public/apps.js      앱 목록(코드·이름·주소·고유색·홈 아이콘 진행률 계산). 새 앱은 여기에
public/today.js     홈의 "오늘 하루": 15577 보고(블록 위치·상태·수업·D-day) + /api/events + 어원 단어 보고를 한 줄로 모음
public/sabathia.js  공통: 런처 뒤로가기/홈 버튼, 앱 상태 보고(localStorage sabathia.status.<id>), /sw.js 등록
public/projects/merge.js  장부 합치기(화면·서버 공용)
public/sw.js        서비스 워커 하나가 / 전체를 맡음. 캐시를 먼저 보여 주고 뒤에서 갱신(다음에 열 때 반영), 새로고침·"최신 버전 확인"은 네트워크 먼저.
                    설치 때 앱 8개 화면을 미리 캐시. 글꼴·jsPDF는 버전과 무관한 캐시. push → 알림(누르면 url로 이동)
                    공통 파일이나 여러 화면을 함께 고치면 VERSION을 올릴 것
public/manifest.webmanifest  PWA 하나 (scope /)
public/plan/        15577 공부 블록 플래너 (Block-planner 사본). 온라인 저장은 Firestore planners/{ID}
public/vocab/       어원 단어 (Block-planner/vocab 사본을 v1.0으로 다시 그림). Firestore planners/v-{ID}
public/pdf/         사진 PDF 묶음기 (llm-wiki-private/tools 사본, v1.0)
public/focus/       집중 타이머 Aero Focus (FOC-07). 파일 하나. theme.css를 쓰지 않는 몰입 화면(사용자 결정: CRT 열대 해변)
                    - 배경은 저해상도 캔버스에 그려 Skylance 2099와 같은 WebGL CRT 셰이더로 출력. 글자·버튼은 Inter + 글로우 + 약한 글리치(DOM)
                    - 실제 시각 → 해·달·하늘·바다 색. 날씨는 Open-Meteo(키 없음, 위치 권한 없으면 서울) 30분마다, 일출·일몰도 여기서
                    - 평소엔 현재 시각 표시, 시작하면 카운트다운. 숫자 누르면 시간 직접 입력(40 / 12:30 / 1.5)
                    - 소리: 파도(바다·바람·비·효과음)와 알람 음량 따로(localStorage aerofocus.vol). 알람은 압축기 거쳐 3번 반복 + 진동
                    - 사람(낚시·모래성·수영·산책)과 아프리카 펭귄 4마리는 1px 스프라이트(문자열로 정의). 키: T 시간대, W 날씨 미리보기, S 음소거
                    - 특별한 날(SDAYS 14개: 새해·설날·밸런타인·삼일절·어린이날·부처님오신날·현충일·광복절·추석·개천절·한글날·핼러윈·크리스마스·12/31). 음력 날짜는 LUNAR에 2026~2028만 적어 둠(이후 해는 추가 필요)
                    - 겨울(12~2월)엔 아델리펭귄 6~10마리가 바다에서 떼로 와서 배로 미끄러지며 돌아다니다 돌아감. 미리보기: 주소 끝 #day=xmas 같은 id, #day=winter, 키 H
                    - 원본은 claude.ai 아티팩트 https://claude.ai/artifact/QBbYAhP3pPsQuKkWmy7dsz (날씨 없는 이전 판). 이제 이쪽이 기준
public/exam/        시험대비 (EXM-08, 2026-11-10). 2026 1학년 2학기 기말(12/10 시작) 계획을 주차별 Todo로 수행 + 한눈에 보기
                    - 계획 자체(주차 WEEKS, 과목 SUBJ, 기본 할 일 seeds(), 원칙·목표)는 index.html 위쪽 상수에 적혀 있다. 다음 시험 때는 이 상수를 바꾼다
                    - 주차: 1주 11/10~13, 2주 11/14~22, 3주 11/23~29, 4주 11/30~12/6, 마무리 12/7~9 (마감선 11/29·12/6이 주 끝에 오게 Claude가 나눔). apps.js exam()에도 같은 날짜
                    - 탭: 계획(요약 3칸 · 날짜 띠 · 과목×주차 표 · 그 주 할 일 · 마감선 · 한 번만) / 오답(당일·3일·7일 재풀이, 실수 유형 집계) / 과목(목표·전략·시험 날짜·범위·서술형 배점)
                    - 저장 localStorage exam.v1 = { items, wrongs, subj } (항목마다 u, 지운 것은 del). 기본 할 일은 id 고정 + u: 0
                    - 동기화 /api/exam/sync (src/exam.js, D1 settings k='exam' 한 줄). 합치기 public/exam/merge.js를 화면·서버가 같이 씀(test/exam.mjs)
                    - 18:30~19:30에 열면 '고비 시간' 띠(light 표시된 할 일 + 오답 확인)
public/music/       음악 (MUS-09, 2026-11-11). Spotify 플레이어. Stitch 시안 "White Deck - iPad Edition"(턴테이블 + 플레이리스트 상자)을 옮김(상표·모델명은 뺌). theme.css를 쓰지 않는 자체 화면
                    - 로그인: PKCE(서버 없음). 사용자가 developer.spotify.com에 앱을 만들고 Client ID를 설정 창에 넣는다(localStorage music.cid, 토큰 music.tok). Redirect URI = <주소>/music/
                    - 조작은 Web API(/me/player…), 플레이리스트는 /me/playlists. Web Playback SDK로 이 브라우저를 'Sabathia' 기기로 올림(PC 크롬만. 폰·아이패드 브라우저는 Spotify가 막아서 기기 목록에서 폰 Spotify 앱을 조작)
                    - Premium 계정 필요(사용자 Premium 확인). 개발 모드 앱이라 사용자 본인 계정만 씀
                    - 크레이트(2026-11-11 사용자 요청): 오른쪽은 낡은 나무 상자(CSS 나뭇결) 안에 앨범을 세워 꽂고 앞으로 넘겨 고른다(밀기·휠·화살표). 플레이리스트는 뺐고 앨범 단위로 듣는다(재생 때 셔플 끔)
                    - '앨범 찾기' = /v1/search type=album(limit 10, 개발 모드 한도) → 담기. 크레이트 여러 개(만들기·이름·지우기 = 칩을 한 번 더 누름). 저장 music.crates, 동기화 /api/music/sync(src/music.js, D1 settings k='music', 합치기 public/music/merge.js · test/music.mjs, 크레이트 단위로 늦게 고친 쪽)
                    - 앨범이 바뀌면(다른 기기에서 바꿔도) dropLP(): 3초 동안 슬리브가 들어와 판을 꺼내 플래터에 올리고 톤암이 내려옴. 아래는 지금 앨범의 트랙 목록(누르면 그 곡부터)
                    - 플레이리스트도 크레이트에 꽂음(항목 k: 'pl'). 플레이리스트는 LP가 아니라 곡 목록이 적힌 클립보드 모양(fillClip, 사용자 결정). 찾기 창 탭: 앨범 · 플레이리스트 · 내 플레이리스트. 지금 판 = context가 플레이리스트면 그 플레이리스트(ctxKey), 아니면 곡의 앨범. 플레이리스트 트랙은 /playlists/{id}/items(없으면 /tracks)
                    - 3D 턴테이블(2026-11-11): public/music/3d/deck3d.js(three r170, 같은 폴더에 필요한 파일만 둠, importmap으로 'three'). (2026-11-12부터 안 씀) 모델 deck.glb 1.4MB = 사용자가 AI로 만든 모델(Drive 947cec14…zip 안 base_basic_pbr.glb, 23MB)을 Claude가 손봄: 로고 3곳 지움(굴곡 평평 + 텍스처 칠), 뒤쪽 뭉개진 면 삭제, AI 플래터는 울퉁불퉁해서 버리고(빈 노드 platter = 회전축) 둘레 비탈을 평평하게, 톤암 떼어 armYaw > armLift(관절 원점 = 축), 톤암 흔적 지움, 면 22%로, 텍스처 1024 webp, meshopt. 손보는 스크립트 scripts/deck-model.mjs
                      좌표 +Y 위 +Z 앞, 플래터 중심 (-0.18, 0, -0.035), 톤암 축 (0.645, 0, -0.4), 재생 각 -0.355 ~ -0.65(곡 진행). 플래터(반지름 0.645, 옆면 스트로브 점 4줄)·매트·축·판(반지름 0.6)은 deck3d.js가 코드로 만듦. 얇은 판이라 밑에 RoundedBox 받침을 댐
                      window.Deck3D { ok, setPlaying(on, 진행 0~1), setLabel, drop(a, slam), shake }. 뜨면 body.d3로 CSS 턴테이블을 숨김. WebGL이 안 되면 CSS 턴테이블 그대로. 판 갈기 모션도 3D(앨범 3초 슬리브, 플레이리스트 1.9초 클립보드), 소리 시각은 그대로
                    - 3D 완성(2026-11-12): AI 모델(deck.glb)을 버리고 본체까지 전부 코드(deck3d.js). 작동 조작부: START/STOP·큐 레버 = 재생/정지(Deck3D.onButton), 33/45(판 회전만), 볼륨 슬라이더(onVolume ↔ setVolume), 안티스케이팅 다이얼(장식). 먼지 덮개(멈춘 채 25초면 닫힘, 만지면 열림), 바늘 조명(조명 모드), 톤암 클립, 무게추 눈금, 45 어댑터, 고무 발, RCA 케이블. 판 테두리·매트 동심원·크롬 축. 연출: (무지개 반사광은 끔), 먼지, 판 휨, 스트로브 착시, 카메라 숨쉬기(D._camLock으로 끔), 곡 바뀌면 무음 홈 빛남(flashGap)+타자기(#tw). 소리: click·cue·cover·motor·key·surface(판 잡음, 낡을수록 큼)
                    - 3D 추가(2026-11-11): 판에 곡 사이 무음 홈(곡 길이 비율), 바늘은 앨범 전체 진행(albumProgress, deck3d yawFor), 판 잡기 스크래치(Deck3D.onScratch: 잡으면 일시정지(이 브라우저면 SDK, 아니면 API), 놓으면 잡은 시점+돌린 만큼 seek 후 다시 재생, 한 바퀴 1.8초), 조명 버튼(기본 켬, 끄면 music.lamp=false · body.night · Deck3D.setNight), 슬리브 낡음(항목 p = 들은 횟수, 판 갈 때 +1, 20번이면 최대)
                    - 디자인 A+E(2026-11-11 사용자 선택): 3D 본체·받침 헤어라인 알루미늄, 앞면 각인(SABATHIA · DIRECT DRIVE TURNTABLE · 33⅓ · 45 RPM), 실제 그림자(shadowMap + ShadowMaterial 바닥), 턴테이블 칸 바닥 리넨. 앨범 표지 대표색 3개(paletteOf, --a1~a3)로 화면 배경(.amb) 전체를 물들이고 앨범이 바뀌면 1.6초에 넘어감, 위·아래 바·칸은 반투명 유리, 밤 조명이 앨범 색을 머금음(Deck3D.setTint)
                    - 밀봉 신보(2026-11-11): 설정에 위클리·데이리스트 링크(music.special). 회차 키(위클리 = 그 주 월요일, 데이리스트 = 날짜+아침/오후/저녁/밤)가 music.opened와 다르면 크레이트 위에 비닐째 뜸 → 가로로 70% 넘게 그으면 찢어짐 → 슬리브 누르면 판 모션(sealed: 플레이리스트여도 슬리브). 표지를 못 읽으면 sealArt()로 그림
                    - 플레이리스트를 틀면 1.9초 모션: 클립보드가 날아와 턴테이블 위에 쾅(턴테이블 판 흔들림·빨간 충격파·진동) → 옆으로 걷어내면 밑에서 판이 돈다. 효과음 sfx: 넘김·슬리브·판 꺼냄·내려앉음·바늘 지직·쾅. Web Audio 합성(파일 없음), 설정 창에서 끔(music.sfx)
docs/design-language.md  디자인 언어 v1.0 + 12장(홈 아이콘 예외) + 13장(Sabathia 공통) + 14장(움직임)
public/keys.html    폰에서 VAPID 키/토큰 생성 (브라우저 안에서만 생성)
src/index.js        /api/* 라우터: API_TOKEN 확인(/api/vapid 제외) → 테이블 준비 → events / projects / notify. scheduled() 1분 cron은 notify.tick()
src/util.js         json·httpError·readBody·authorized, ensureTables(모든 테이블을 첫 요청·첫 cron 때 자동 생성)
src/notify.js       알림: /api/subscribe·unsubscribe·test, /api/notify(설정), /api/repeats(반복 알림), /api/reminders(한 번짜리, 화면 없음)
                    tick(): 시작 전 알림 · 아침 요약 · 전날 저녁 · 반복 알림. 후보 고르기는 순수 함수 candidates()(test/notify.mjs). 시각은 한국 시각(UTC+9 고정)
src/projects.js     /api/projects/sync 장부 동기화 (merge.js로 항목 단위 합치기, 지운 것은 deleted 줄로 180일 보관) + 마감·단계 날짜를 일정에 맞춤
src/webpush.js      RFC 8291(aes128gcm) + RFC 8292(VAPID), WebCrypto만 사용
schema.sql          참고용 (subscriptions, reminders, events, settings, repeats, push_log, projects)
src/events.js       /api/events 일정 API
public/schedule/    일정 PWA (홈·캘린더·일정·설정). 디자인 언어 v1.0. ?theme=projector&kiosk=1 은 책상 프로젝터용
openclaw-skill/     OpenClaw 스킬 sabathia-schedule (SKILL.md + sched.mjs). PC의 OpenClaw가 이걸로 일정을 넣는다
android/            홈 런처 앱(WebView, JS 브리지 window.Jarvis: launch/apps/open). Actions가 빌드해 릴리스 'launcher'에 jarvis.apk 게시
test/               notify.mjs(알림 고르기), merge.mjs(장부 합치기), ece.mjs(암호화), vapid.mjs(JWT 서명, .dev.vars 필요) 검증 스크립트
```
- 알림(2026-11-10): 일정 앱 설정 → 알림. 구독은 기기마다, 설정(lead 분·am·pm, D1 settings k='notify')과 반복 알림(repeats)은 서버에 하나. 기본값 10분 전 · 07:30 · 20:00. 같은 알림은 push_log 키(lead:<id>:<날짜T시각>, am:<날짜>, pm:<날짜>, rep:<id>:<날짜>)로 한 번만
- 장부 v2(2026-11-10, 계획서 https://claude.ai/artifact/7NoqWBYbB8WGbQefaufZ3U 1단계): 카드를 누르면 상세(단계·기록·자료 탭). 폰·세로는 화면을 덮는 판(history.pushState로 뒤로가기에 닫힘), 1000px 이상은 왼쪽 목록 440px + 오른쪽 상세
  - 프로젝트 모양 v: 2 — cat(report·school·academy·research·code·personal, 일정 묶음과 같은 이름), steps[{id,t,done,due,note,doneAt}], log[{id,at,kind(auto·memo·decision·block),t}], links[{id,url,title,kind(paper·link)}]. 숫자 칸(events·papers·decisions)은 없앴고 값이 있었으면 기록에 '예전 숫자 칸' 한 줄
  - 저장 이름은 projects.v1 그대로(홈 아이콘이 읽음). normalize()가 어떤 모양이 와도 v2로 맞추고 updated는 건드리지 않는다. 처음 옮길 때 projects.v1.bak에 원본
  - 새 프로젝트는 종류별 기본 단계(TPL)와 코드 접두어(RPT·SCH·ACA·EXP·CODE·PER). 자료 칸은 DOI·PMID만 넣어도 링크로. '논문 리더용으로 복사' = Paper-reader profile/my-projects.md 형식
  - 서버 프로젝트 한도 200KB(src/projects.js MAX_BYTES). 자동 기록은 100줄까지
- 장부 2단계(2026-11-10): 사용자 결정 — 종류는 6개 다, 숫자 칸 없앰, 집중에 프로젝트 고르기 넣음, 손 안 댄 알림 7일
  - 합치기: public/projects/merge.js 하나를 화면(<script>)과 서버(import)가 같이 쓴다. 항목마다 u(고친 시각), 단계 o(순서), 칸은 fu, 지운 항목은 del{id:시각}. 두 기기에서 고쳐도 둘 다 남는다(test/merge.mjs)
  - 마감 연결은 서버가 한다(/api/projects/sync 안 reconcileEvents): 프로젝트 마감 prj-<id>(deadline), 날짜 있는 단계 prj-<id>-<단계 id>(task, 묶음은 report·school·academy만). source '장부'인 것만 고치거나 지운다. 일정에서 그 할 일을 끝내면 다음 동기화 때 단계도 끝남(기록에 '(일정에서)'). 화면의 linkEvents·dueSynced·projects.evdel은 없앰
  - 집중: 왼쪽 위 '프로젝트 고르기'(aerofocus.prj). 장부 상세 '집중' 버튼 = /focus/?prj=<id>. 끝나면 projects.focus 줄에 {id: f+끝난 시각, pid, min} → 장부를 열 때 기록(kind focus, min)으로 옮김. 그 기기에서 장부를 열어야 올라간다
  - 알림: 아침 요약 끝에 '7일 넘게 그대로 — …'(진행 중 프로젝트, notify.js STALE_DAYS). 일정이 없으면 '장부' 알림 하나. 단계 날짜는 일정으로 올라가므로 전날 저녁 알림에 같이 나온다
  - 홈: 오늘 시각 있는 일이 없으면 '다음' 칸(폰)·다음 줄(가로)에 장부의 다음 할 일. 세로 화면 '오늘 할 일'에는 날짜 없는 다음 할 일 3개(today.js projects())
- 장부 동기화(2026-11-10): 이 기기 저장(projects.v1)이 먼저, 고치면 1.5초 뒤 /api/projects/sync. 예시 프로젝트는 demo: true 라 올리지 않고 진짜 프로젝트가 생기면 사라짐. 지운 것은 projects.gone, 마감(due)은 일정에 id prj-<id> 마감으로 올림(dueSynced로 한 번만), 일정에서 지울 것은 projects.evdel
- 백업: 장부·수업 녹음 화면의 내보내기/가져오기(.json)
- 토큰 이름은 API_TOKEN 하나(keys.html·gen-keys도 이 이름). 주소·토큰은 일정 앱 설정의 sab.base·sab.token을 홈·장부가 같이 읽는다
- 일정 묶음(2026-11-08): 오늘·일정 탭 위에 요약 3칸 + 묶음 카드 3개(보고서 제출 / 학교 수행 / 학원 수행). 일정마다 `cat`(report·school·academy·none, D1 열은 첫 요청 때 ALTER로 추가). 비어 있으면 제목·메모로 짐작(학원 → 학원 수행, 보고서|리포트|레포트 → 보고서, 수행 → 학교 수행). 묶음에 든 할 일은 아래 '할 일' 목록에서 빠지고, 마감·일정은 타임라인에도 남는다. 상세 시트에서 묶음을 바꾸면 바로 저장
- /api/* 전체(/api/vapid 제외)는 Worker에 secret `API_TOKEN`이 있으면 Bearer 토큰 필요. OpenClaw는 PC 사용자 환경 변수 SABATHIA_TOKEN으로 읽는다(토큰을 채팅·설정 파일에 쓰지 않기)
- 리마인더 시각은 UTC ISO 문자열로 저장

- 런처 WebView는 웹 푸시 미지원 → 알림은 크롬 PWA로 받음
- 런처 APK는 뒤로가기 때 window.onJarvisBack 만 부른다(WebView history 안 씀). 앱 페이지는 Sabathia.back 으로 시트를 닫고, 없으면 홈으로 간다

## 다음 기능 (예정)
- 시험대비: 시안 없이 바로 만들었다. 써 보고 바꿀 곳을 물을 것. 안 한 것 — 백지테스트·마감선·시험 날짜를 일정(알림)에 올리기, 홈 '오늘 하루'에 이번 주 할 일 띄우기, 수요일 10시가 오전인지 밤인지 미확인
- 장부 3단계(계획서): 주간 돌아보기, 날짜 축 보기, OpenClaw로 단계 추가·수업 노트 과제 보내기. 1·2단계를 2주쯤 써 본 뒤 고르기로 함
- 장부 상세 화면은 시안 없이 바로 만들었다(사용자가 '코딩 시작'). 써 보고 바꿀 곳을 물을 것
- 15577 블록 시작 알림(블록은 Firestore·기기에 있어 서버 cron이 모름. 하려면 15577이 오늘 블록을 서버에 올려야 함)
- 홈 앱 격자: 앱 7개라 4칸 격자 둘째 줄이 3개. 배치 시안을 보여 주고 고르게 할 것
- 홈이 30초마다 일정 90일치를 통째로 받음 → 바뀐 게 없으면 304
- 페이지마다 v1.0 CSS 위에 theme.css가 !important로 덮는 이중 구조 정리

## 수업 노트 아티팩트 (2026-11-01)
- 수업 전사·정리 앱은 Sabathia PWA가 아니라 claude.ai 아티팩트로 만듦(사용자 결정: AI 정리를 API 키 없이 쓰려고). https://claude.ai/artifact/799cSCZn6VKRq2x2xBjxnY
- 원본 `artifacts/lecture.html`. 고친 뒤 같은 파일을 Artifact 도구로 다시 게시(주소 유지). capabilities: db(루트 read/write admin = 본인만), sample(Claude 호출)
- 아티팩트는 마이크가 막혀 있음(GitHub 조사: 아티팩트에서 마이크를 연 사례 없음, 이 계정 기능 목록에도 없음). 소리는 넘겨도 아티팩트 AI가 못 받아씀(글자·이미지만)
- 그래서 녹음은 Sabathia `/lecture/`(LEC-05)가 맡는다: 크롬 Web Speech 받아쓰기 → "복사하고 수업 노트 열기" → 아티팩트 첫 화면 "녹음 앱에서 받기" 칸에 붙여넣기. 전송은 클립보드(실패하면 .txt). 아티팩트는 다른 주소를 fetch할 수 없어 D1 경유는 불가
- 머리줄 형식 `[수업노트] 학교 · 한국사 · 2026-11-01 · 48:00` (녹음 앱 `header()` ↔ 아티팩트 `parseHeader()` 같이 바꿀 것)
- 녹음 앱 저장: localStorage `lecture.recs`(최대 40, 보낸 것부터 지움). 홈 아이콘 배지 = 아직 안 보낸 전사문 수. 홈 앱 격자가 4칸이라 5번째 아이콘이 둘째 줄에 혼자 있음(배치 바꿀지 사용자에게 물을 것)
- DB: lectures/{id}(mode, subject, date, title, summary, cards[{q,a,box,due}], hwDone), tx/{id}-{n}(전사문 6만 자씩), settings/subjects. 예시 문서 lectures/example, tx/example-0
- 정리: 1만 자 넘으면 구간별 정리 후 병합. 카드 복습은 상자 0~5, 간격 1·2·4·8·16일

## 사용자 선호
- 답변은 짧고 직접적으로. 이모지 쓰지 않기
- 모바일(안드로이드) 기준으로 안내. 다만 아이패드·컴퓨터도 많이 씀(가로 화면 중요)
- 디자인은 `public/theme.css`(시안 스타일 v2) + 디자인 언어 v1.0의 배치 규칙을 따른다. 시안을 여러 개 보여 주고 고르게 하는 방식을 좋아함. 질문은 적극적으로
