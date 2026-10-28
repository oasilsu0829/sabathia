---
name: jarvis-tasks
description: 자비스 타임라인(폰 홈 화면)의 할 일을 등록·조회·수정·완료·삭제한다. "오늘 할 일 뭐야", "3시에 회의 넣어줘", "보고서 끝냈어" 같은 요청에 쓴다.
metadata: {"openclaw": {"requires": {"bins": ["curl"]}}}
---

# 자비스 할 일 타임라인

사용자의 할 일은 자비스 서버에 저장되고 폰 홈 화면(런처)에 시간순으로 표시된다.
사용자가 폰에서 직접 추가하거나 완료한 것도 같은 곳에 있으므로, 할 일을 묻거나 바꿀 때는
기억에 의존하지 말고 항상 아래 API를 `exec`로 `curl` 호출해서 확인한다.

- 주소: `https://sabathia.oasilsu0829.workers.dev`
- 사용자 시간대는 **Asia/Seoul (UTC+09:00)** 이다. 현재 시각이 필요하면 `session_status`로 확인한다.
- 시각은 `2026-10-28T15:00:00+09:00`처럼 **반드시 `+09:00`을 붙여서** 보낸다. 응답의 `start`, `end`는 UTC(`Z`)이니 사용자에게는 한국 시각으로 바꿔서 말한다.
- 인증은 없다. 한국어가 깨지지 않도록 본문은 `--data-binary`로 보낸다.

## 조회

```sh
curl -s "https://sabathia.oasilsu0829.workers.dev/api/tasks"                     # 오늘(한국 날짜)
curl -s "https://sabathia.oasilsu0829.workers.dev/api/tasks?date=2026-10-29"     # 특정 날짜
curl -s "https://sabathia.oasilsu0829.workers.dev/api/tasks?from=2026-10-27T00:00:00%2B09:00&to=2026-11-03T00:00:00%2B09:00"  # 기간
```

응답: `[{"id":3,"title":"회의","start":"...Z","end":"...Z"|null,"note":null,"done":false,"source":"app"|"openclaw"}]`

보여줄 때는 시간순으로 `09:00 회의 (~10:00)`처럼 한 줄씩, 완료된 것은 `[완료]`로 표시한다.

## 등록

```sh
curl -s -X POST https://sabathia.oasilsu0829.workers.dev/api/tasks \
  -H 'Content-Type: application/json' \
  --data-binary '{"title":"병원 예약","start":"2026-10-29T15:00:00+09:00","end":"2026-10-29T16:00:00+09:00","note":"신분증","source":"openclaw"}'
```

- `title`, `start`는 필수. `end`, `note`는 없으면 뺀다. `source`는 항상 `"openclaw"`.
- "20분 뒤", "내일 오후 3시"처럼 말하면 현재 시각 기준으로 절대 시각으로 바꿔서 넣는다.
- 날짜·시각이 모호하면(오전/오후 불분명 등) 등록 전에 한 번 되묻는다.
- 시작 시각이 되면 서버가 폰으로 푸시 알림을 보낸다. 따로 `cron` 작업을 만들 필요 없다.
- 등록 후 `10월 29일 (목) 15:00 "병원 예약" 타임라인에 넣었어요.`처럼 한 줄로 확인한다.

## 수정 / 완료 / 삭제

먼저 조회해서 `id`를 찾는다. 제목이 비슷한 게 여러 개면 어느 것인지 되묻는다.

```sh
# 완료 (취소는 false)
curl -s -X PATCH https://sabathia.oasilsu0829.workers.dev/api/tasks/3 -H 'Content-Type: application/json' --data-binary '{"done":true}'
# 시각·제목 변경 (바꿀 필드만 보낸다. end를 지우려면 "end":null)
curl -s -X PATCH https://sabathia.oasilsu0829.workers.dev/api/tasks/3 -H 'Content-Type: application/json' --data-binary '{"start":"2026-10-29T17:00:00+09:00"}'
# 삭제
curl -s -X DELETE https://sabathia.oasilsu0829.workers.dev/api/tasks/3
```

"끝냈어", "했어"는 삭제가 아니라 완료(`done:true`)로 처리한다. 삭제는 사용자가 지우라고 할 때만 한다.
