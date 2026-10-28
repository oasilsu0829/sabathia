#!/usr/bin/env node
// Sabathia 일정 API용 작은 CLI. Node 18 이상(fetch 내장)에서 Windows·macOS·Linux 모두 동작.
// 환경 변수: SABATHIA_TOKEN (필수), SABATHIA_URL (선택, 기본 https://sabathia.oasilsu0829.workers.dev)
// 출력은 토큰 절약을 위해 한 줄 요약으로 낸다.

const BASE = (process.env.SABATHIA_URL || 'https://sabathia.oasilsu0829.workers.dev').replace(/\/+$/, '');
const TOKEN = process.env.SABATHIA_TOKEN || '';
const TZ = 'Asia/Seoul';
const KIND = { event: '일정', task: '할 일', deadline: '마감' };
const WD = ['일', '월', '화', '수', '목', '금', '토'];

const HELP = `사용법: node sched.mjs <명령> [옵션]
  agenda [--days 7]                  지연된 일 + 오늘부터 N일
  list [--from D] [--to D]           기간 조회 (기본: 오늘~14일 뒤)
  add --title T --date D [--time HH:MM] [--end HH:MM] [--kind event|task|deadline] [--note N] [--source S] [--id ID]
  update <id> [--title ..] [--date ..] [--time ..|none] [--end ..|none] [--kind ..] [--note ..]
  done <id> | undo <id> | remove <id>
  import <file.json>                 배열 또는 {"events":[...]} 를 한 번에 넣기 (id가 같으면 덮어씀)
날짜 D: YYYY-MM-DD, today, tomorrow, 오늘, 내일, 모레, +3, -1`;

function flags(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) o[k] = true;
      else { o[k] = v; i++; }
    } else o._.push(a);
  }
  return o;
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shift = (date, n) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
function resolveDate(s) {
  if (s === undefined || s === true) return undefined;
  const t = today();
  const map = { today: 0, '오늘': 0, tomorrow: 1, '내일': 1, '모레': 2, yesterday: -1, '어제': -1 };
  if (s in map) return shift(t, map[s]);
  if (/^[+-]\d+$/.test(s)) return shift(t, Number(s));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  fail(`날짜를 알아볼 수 없습니다: ${s} (YYYY-MM-DD, today, +3 같은 형식)`);
}
const nullable = (v) => (v === 'none' || v === '' ? null : v);

function fail(msg) {
  console.error('오류: ' + msg);
  process.exit(1);
}

async function call(path, opt = {}) {
  if (!TOKEN) fail('SABATHIA_TOKEN 환경 변수가 필요합니다 (Windows 사용자 환경 변수 또는 openclaw.json의 skills.entries.sabathia-schedule.apiKey)');
  let r;
  try {
    r = await fetch(BASE + path, { ...opt, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN } });
  } catch (e) {
    fail(`서버에 연결할 수 없습니다 (${BASE}): ${e.message}`);
  }
  let body = null;
  try { body = await r.json(); } catch {}
  if (r.status === 401) fail('토큰이 맞지 않습니다');
  if (!r.ok) fail((body && body.error) || `HTTP ${r.status}`);
  return body;
}

function line(e, t = today()) {
  const [y, m, d] = e.date.split('-').map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const time = e.time ? ` ${e.time}${e.end ? '–' + e.end : ''}` : '';
  let flag = '';
  if (e.done) flag = ' (완료)';
  else if (e.kind !== 'event' && e.date < t) flag = ' (지연)';
  const note = e.note ? ` — ${e.note}` : '';
  return `${e.id}  ${e.date}(${wd})${time}  [${KIND[e.kind] || e.kind}] ${e.title}${flag}${note}`;
}

function eventFrom(f) {
  const o = {};
  if (f.title !== undefined) o.title = String(f.title);
  if (f.date !== undefined) o.date = resolveDate(f.date);
  if (f.time !== undefined) o.time = nullable(f.time);
  if (f.end !== undefined) o.end = nullable(f.end);
  if (f.kind !== undefined) o.kind = f.kind;
  if (f.note !== undefined) o.note = f.note === true ? '' : String(f.note);
  if (f.source !== undefined) o.source = String(f.source);
  if (f.id !== undefined) o.id = String(f.id);
  if (f.done !== undefined) o.done = f.done === true || f.done === 'true';
  return o;
}

const [cmd, ...rest] = process.argv.slice(2);
const f = flags(rest);
const t = today();

switch (cmd) {
  case 'agenda': {
    const days = Number(f.days || 7);
    const { events } = await call(`/api/events?from=${shift(t, -60)}&to=${shift(t, days)}`);
    const late = events.filter((e) => !e.done && e.kind !== 'event' && e.date < t);
    const ahead = events.filter((e) => e.date >= t);
    console.log(`오늘 ${t} · 지연 ${late.length}개 · 앞으로 ${days}일 ${ahead.length}개`);
    for (const e of [...late, ...ahead]) console.log(line(e, t));
    break;
  }
  case 'list': {
    const from = resolveDate(f.from) || t;
    const to = resolveDate(f.to) || shift(from, 14);
    const { events } = await call(`/api/events?from=${from}&to=${to}`);
    console.log(`${from} ~ ${to} · ${events.length}개`);
    for (const e of events) console.log(line(e, t));
    break;
  }
  case 'add': {
    const e = eventFrom(f);
    if (!e.title || !e.date) fail('add에는 --title 과 --date 가 필요합니다');
    if (!e.source) e.source = 'openclaw';
    const { events } = await call('/api/events', { method: 'POST', body: JSON.stringify(e) });
    console.log('추가: ' + line(events[0], t));
    break;
  }
  case 'update': {
    const id = f._[0];
    if (!id) fail('update <id> 형식으로 id를 주세요');
    const patch = eventFrom(f);
    delete patch.id;
    if (!Object.keys(patch).length) fail('바꿀 필드가 없습니다 (--title, --date, --time 등)');
    const { event } = await call('/api/events/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(patch) });
    console.log('수정: ' + line(event, t));
    break;
  }
  case 'done':
  case 'undo': {
    const id = f._[0];
    if (!id) fail(`${cmd} <id> 형식으로 id를 주세요`);
    const { event } = await call('/api/events/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ done: cmd === 'done' }) });
    console.log((cmd === 'done' ? '완료: ' : '되돌림: ') + line(event, t));
    break;
  }
  case 'remove': {
    const id = f._[0];
    if (!id) fail('remove <id> 형식으로 id를 주세요');
    await call('/api/events/' + encodeURIComponent(id), { method: 'DELETE' });
    console.log('삭제: ' + id);
    break;
  }
  case 'import': {
    const file = f._[0];
    if (!file) fail('import <file.json> 형식으로 파일을 주세요');
    const { readFile } = await import('node:fs/promises');
    let data;
    try { data = JSON.parse(await readFile(file, 'utf8')); } catch (e) { fail(`JSON 파일을 읽을 수 없습니다: ${e.message}`); }
    const items = (Array.isArray(data) ? data : data.events || []).map((x) => ({ source: 'openclaw', ...x, date: resolveDate(x.date) || x.date }));
    const { events } = await call('/api/events', { method: 'POST', body: JSON.stringify(items) });
    console.log(`가져옴 ${events.length}개`);
    for (const e of events) console.log(line(e, t));
    break;
  }
  default:
    console.log(HELP);
    if (cmd && cmd !== 'help') process.exit(1);
}
