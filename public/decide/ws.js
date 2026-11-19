import { mountCity } from './city.js';
// 판단 · WS 화면. 기존 판단(/decide/)과 같은 데이터(sources.js: 15577·일정·장부·시험대비)와 같은 엔진(engine/decide.js)을 쓰고,
// 화면만 WS 창(NOW · TODAY · DEADLINES · PLANNER)으로 그린다. 저장값은 읽기만 한다(decide.v1 보정은 기존 화면에서).
import { decide } from './engine/decide.js';
import { DEFAULT_SETTINGS } from './engine/config.js';
import { remainingOf, estimateOf } from './engine/planner.js';
import { fmtTime, fmtDur, toDateStr, addDays, daysBetween, weekdayOf, weekdayLabel, roundTo } from './engine/time.js';
import { buildState } from './sources.js';

// ---------- Icons ----------
const P = {
  chevron: '<path d="M6 9l6 6 6-6"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>',
  shrink: '<path d="M4 14h6v6M20 10h-6V4M10 14l-6.5 6.5M14 10l6.5-6.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  free: '<rect x="3.5" y="4.5" width="10" height="8"/><rect x="10.5" y="11.5" width="10" height="8"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
const ic = (n, s = 16) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${P[n]}</svg>`;
document.querySelectorAll('[data-ic]').forEach((el) => (el.outerHTML = ic(el.dataset.ic)));

// ---------- 데이터 (기존 판단과 같은 방식) ----------
const LS = 'decide.v1';
const DEFAULT_EXAMS = [{ id: 'final-2026-2', name: '2학기 기말고사', date: '2026-12-10', subjects: [] }];
const json = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
function loadLocal() {
  const raw = json(LS) || {};
  const settings = { ...structuredClone(DEFAULT_SETTINGS), ...(raw.settings || {}) };
  settings.thresholds = { ...DEFAULT_SETTINGS.thresholds, ...(raw.settings?.thresholds || {}) };
  if (!raw.settings) settings.exams = structuredClone(DEFAULT_EXAMS);
  return { settings, ov: raw.ov || {}, log: raw.log || [] };
}
const q = new URLSearchParams(location.search);
const pinned = q.get('now') ? new Date(q.get('now')).getTime() : NaN;
const T0 = Date.now();
const nowMs = () => (Number.isFinite(pinned) ? pinned + (Date.now() - T0) : Date.now());
const MINMS = 60_000;

let events = null;
async function loadEvents() {
  try { events = window.SabathiaToday ? await SabathiaToday.events() : []; } catch { events = []; }
  render();
}

let R, META, TODAY, STATE;
function compute() {
  const now = nowMs();
  const today = toDateStr(now);
  const { state, meta } = buildState({
    plan: json('blockplanner.v1'),
    events: events || (json('sab.cache') || {}).events || [],
    projects: json('projects.v1'),
    examDoc: json('exam.v1'),
    local: loadLocal(),
    today,
  });
  META = meta;
  STATE = state;
  R = decide(state, now);
  TODAY = R.today;
}

// ---------- Helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dur = (m) => fmtDur(Math.max(0, Math.round(m)));
const r5 = (v) => Math.max(5, roundTo(v, 5));
const hmShort = (m) => `${Math.floor(m / 60)}:${String(Math.round(m) % 60).padStart(2, '0')}`;
const SUBJ_COLOR = { math: 'var(--math)', korean: 'var(--kor)', english: 'var(--eng)', science: 'var(--eng)', other: 'var(--school)' };
const taskOf = (id) => STATE.tasks.find((t) => t.id === id);
const ddayTxt = (d) => (d == null ? '' : d < 0 ? '지남' : d === 0 ? '오늘' : d === 1 ? '내일' : `D-${d}`);
const at = (date, hm) => { const [y, m, d] = date.split('-').map(Number); const [hh, mm] = hm.split(':').map(Number); return new Date(y, m - 1, d, hh, mm).getTime(); };
const blockOf = (t) => (t.date && t.start && t.end ? { start: at(t.date, t.start), end: at(t.date, t.end) <= at(t.date, t.start) ? at(t.date, t.end) + 86_400_000 : at(t.date, t.end) } : null);
const stateOf = (b, t) => (t.status === 'done' ? 'done' : b.end <= R.now ? 'past' : b.start <= R.now ? 'now' : 'next');
const dateLabel = (ds) => { const [, m, d] = ds.split('-').map(Number); return { m, d, w: weekdayLabel(weekdayOf(ds)) }; };

// 학원·학교 묶음 (일정 제목으로)
const GROUPS = [
  { id: 'baekin', name: '백인대장', sub: '수학', badge: '백', color: 'var(--math)', re: /백인대장|수평잡기|올림포스|합성함수|역함수|유리함수|무리함수|명제|절댓값|수학/ },
  { id: 'kor', name: '국어 학원', sub: '국어하기 좋은날', badge: '국', color: 'var(--kor)', re: /국좋|국어|봄봄|어문규정|풀이의 기틀/ },
  { id: 'eng', name: '영어 학원', sub: '일 저녁반', badge: '영', color: 'var(--eng)', re: /영어|능률보카|모고/ },
  { id: 'sci', name: '과학', sub: '', badge: '과', color: 'var(--eng)', re: /과학|박상현/ },
  { id: 'school', name: '학교', sub: '수행·보고서', badge: '학', color: 'var(--school)', re: /수행|보고서|심카|통합사회|한국사|스피치/ },
  { id: 'etc', name: '기타', sub: '', badge: '기', color: 'var(--ink4)', re: /.*/ },
];
const groupOfDeadline = (d) => (d.cat === 'school' || d.cat === 'report' ? GROUPS[4] : GROUPS.find((g) => g.re.test(d.title)));

// 마감별 판단: 엔진의 위험 목록 + 연결된 15577 블록
function judgeDeadline(d) {
  const linked = STATE.tasks.filter((t) => t.link === d.id || t.id === d.id);
  const hit = (list) => list.find((r) => r.task.id === d.id || r.task.link === d.id);
  const exp = hit(R.risks.exp), hi = hit(R.risks.highOnly);
  const rem = linked.reduce((s, t) => s + (t.status === 'done' ? 0 : remainingOf(t)), 0);
  const total = linked.reduce((s, t) => s + estimateOf(t), 0);
  const doneN = linked.filter((t) => t.status === 'done').length;
  const dday = daysBetween(TODAY, d.date);
  let status, note = null;
  if (exp) { status = 'risk'; note = `가능한 시간을 다 써도 마감 전 약 ${dur(r5(exp.exp))} 부족`; }
  else if (hi) { status = 'tight'; note = `오래 걸리면 마감 전 최대 약 ${dur(r5(hi.high))} 부족할 수 있음`; }
  else if (!linked.length && !d.estimateMin) { status = 'unknown'; note = '15577 블록 연결 또는 예상 시간이 없어 계산에서 빠짐'; }
  else status = 'ok';
  const urgency = status === 'risk' || dday < 0 ? 'risk' : dday <= 1 ? 'near' : status === 'tight' || dday <= 3 ? 'attention' : 'calm';
  return { status, note, urgency, dday, linked, rem, total, doneN };
}

// ---------- UI state ----------
const TOP = 76, PAD = 20, GAP = 12, HEAD = 48;
// 화면 모양 (2026-11-19): 예전엔 1366×1024(패드 가로) 무대를 폭에 맞춰 줄이기만 했다.
// 이제 무대 크기를 화면 비율에 맞춘다. wide = 가로 화면(두 줄 배치), tall = 세로 태블릿, phone = 폰(한 줄로 쌓고 아래로 스크롤).
let W = 1366, H = 1024, VH = 1024, FORM = 'wide', scale = 1;
function measure() {
  const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight || vw;
  if (vw >= vh * 1.05) {
    FORM = 'wide';
    scale = Math.min(vw / 1100, vh < 640 ? vh / 640 : vh > 1100 ? vh / 1100 : 1);
  } else {
    FORM = vw < 600 ? 'phone' : 'tall';
    scale = Math.min(1, vw / (FORM === 'phone' ? 360 : 600));
  }
  W = Math.round(vw / scale); VH = Math.round(vh / scale); H = VH;
}
measure();
const ids = ['now', 'today', 'dl', 'pl'];
const NAMES = { now: 'NOW', today: 'TODAY', dl: 'DEADLINES', pl: 'PLANNER' };
const freeDefault = () => {
  if (FORM !== 'wide') {
    const w = Math.min(W - PAD * 2 - 42, 640), h = Math.max(320, Math.min(560, VH - TOP - 200));
    return Object.fromEntries(ids.map((id, i) => [id, { x: PAD + i * 14, y: TOP + 12 + i * 46, w, h }]));
  }
  const sx = W / 1366, sy = H / 1024, r = (x, y, w, h) => ({ x: Math.round(x * sx), y: Math.round(y * sy), w: Math.round(w * sx), h: Math.round(h * sy) });
  return { now: r(48, 96, 560, 540), today: r(640, 88, 680, 268), dl: r(690, 384, 640, 540), pl: r(132, 580, 520, 360) };
};
const S = { mode: 'organized', focus: null, collapsed: {}, closed: Object.fromEntries(ids.map((id) => [id, true])), order: ['pl', 'dl', 'today', 'now'], free: freeDefault(), selBlock: null, sort: 'group', open: {} };
const anyClosed = () => ids.some((id) => S.closed[id]);

// 창 내용 높이(머리 + 본문). 내용이 STACK보다 짧으면 그만큼만 차지한다
function natural(id) {
  const wb = win(id).querySelector('.wb');
  let end = 0;
  for (const c of wb.children) end = Math.max(end, c.offsetTop - wb.offsetTop + c.offsetHeight);
  return end ? HEAD + end + 22 : STACK[id];
}
const restack = () => { if (FORM !== 'wide' && S.mode === 'organized' && !S.focus) applyLayout(); };
// 폰·세로 화면: 열린 창을 한 줄로 쌓는다. 화면보다 짧으면 남는 높이를 나눠 채운다.
const STACK = { now: 640, today: 330, dl: 560, pl: 620 };
function stackRects() {
  const open = ids.filter((id) => !S.closed[id]);
  const avail = VH - TOP - PAD - (anyClosed() ? 64 : 0);
  const want = open.map((id) => (S.collapsed[id] ? HEAD : Math.min(STACK[id], natural(id))));
  const used = want.reduce((a, b) => a + b, 0) + GAP * Math.max(0, open.length - 1);
  const grow = open.filter((id) => !S.collapsed[id]).length;
  const extra = used < avail && grow ? (avail - used) / grow : 0;
  const out = {};
  let y = TOP;
  open.forEach((id, i) => { const h = Math.round(want[i] + (S.collapsed[id] ? 0 : extra)); out[id] = { x: PAD, y, w: W - PAD * 2, h }; y += h + GAP; });
  return out;
}
function orgRects() {
  if (FORM !== 'wide') return stackRects();
  const avail = H - TOP - PAD - (anyClosed() ? 64 : 0);
  const L = ['now', 'pl'].filter((id) => !S.closed[id]), Rr = ['today', 'dl'].filter((id) => !S.closed[id]);
  const full = W - PAD * 2;
  let lw = Math.round(clamp(full * 0.443, 480, 820)), rx = PAD + lw + GAP, rw = full - lw - GAP;
  if (!L.length) { rx = PAD; rw = full; }
  if (!Rr.length) lw = full;
  const pref = { now: Math.round(avail * 0.7), today: Math.round(avail * 0.343) };
  const col = (list, x, w) => {
    if (!list.length) return {};
    if (list.length === 1) { const a = list[0]; return { [a]: { x, y: TOP, w, h: S.collapsed[a] ? HEAD : avail } }; }
    const [a, b] = list, ca = S.collapsed[a], cb = S.collapsed[b];
    const ha = ca ? HEAD : cb ? avail - GAP - HEAD : pref[a];
    const hb = cb ? HEAD : avail - GAP - ha;
    return { [a]: { x, y: TOP, w, h: ha }, [b]: { x, y: TOP + ha + GAP, w, h: hb } };
  };
  return { ...col(L, PAD, lw), ...col(Rr, rx, rw) };
}
function focusRect() {
  if (FORM === 'wide') return { x: Math.round(W * 0.088), y: 88, w: Math.round(W * 0.824), h: H - 144 };
  const sy = scrollY / scale, y = Math.max(TOP, Math.round(sy + 12));
  return { x: 10, y, w: W - 20, h: Math.round(sy + VH - 12 - y) };
}
const stage = document.getElementById('stage');
const win = (id) => document.getElementById('w-' + id);
const brief = document.getElementById('brief');
let briefDismissed = false;
brief.addEventListener('click', () => {
  briefDismissed = true;
  document.querySelector('#dock button')?.focus({ preventScroll: true });
  if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    brief.classList.add('leaving');
    setTimeout(() => { brief.hidden = true; }, 320);
  } else {
    brief.hidden = true;
  }
});
function applyLayout() {
  if (FORM === 'phone' && S.mode === 'free') S.mode = 'organized';
  stage.className = (S.mode === 'free' ? 'free' : 'organized') + ' f-' + FORM;
  stage.classList.toggle('has-closed', anyClosed());
  if (ids.some((id) => !S.closed[id])) {
    briefDismissed = true;
    brief.hidden = true;
  }
  const org = S.mode === 'organized' ? orgRects() : null;
  const fr = S.focus ? focusRect() : null;
  // 무대 높이: 가로 화면은 화면 높이 그대로, 폰·세로는 쌓인 창 길이만큼 늘어난다(페이지 스크롤)
  let bottom = 0;
  if (FORM !== 'wide') ids.forEach((id) => { if (S.closed[id]) return; const r = org ? org[id] : S.free[id]; bottom = Math.max(bottom, r.y + (org || !S.collapsed[id] ? r.h : HEAD)); });
  H = Math.max(VH, bottom ? bottom + PAD + (anyClosed() ? 64 : 0) : 0);
  sizeStage();
  ids.forEach((id) => {
    const el = win(id), closed = !!S.closed[id];
    el.classList.toggle('closed', closed);
    el.inert = closed;
    if (!closed) {
      const r = S.focus === id ? fr : org ? org[id] : { ...S.free[id], h: S.collapsed[id] ? HEAD : S.free[id].h };
      Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    }
    el.style.zIndex = S.focus === id ? 100 : 10 + S.order.indexOf(id);
    el.classList.toggle('collapsed', !!S.collapsed[id] && S.focus !== id);
    el.classList.toggle('focused', S.focus === id);
    el.classList.toggle('dim', !!S.focus && S.focus !== id);
    el.classList.toggle('front', S.mode === 'free' && S.order[S.order.length - 1] === id);
    const fb = el.querySelector('.foc');
    fb.innerHTML = ic(S.focus === id ? 'shrink' : 'expand');
    el.querySelector('.col').setAttribute('aria-expanded', String(!S.collapsed[id]));
  });
  if (plFramed && S.focus !== 'pl') plFrame(false); // 크게 보기를 풀면 요약으로
  document.getElementById('scrim').classList.toggle('on', !!S.focus);
  document.querySelectorAll('[data-act="mode"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  renderDock();
}
const front = (id) => { S.order = S.order.filter((x) => x !== id).concat(id); };

const prevW = {};
const bar = (p, key, c) => `<div class="track" style="--c:${c}"><i class="fill" data-k="${key}" data-p="${clamp(p, 0, 100)}" style="width:${prevW[key] ?? 0}%"></i></div>`;
const RAIL = { calm: 'var(--line2)', attention: 'var(--ink3)', near: 'var(--ink)', risk: 'var(--hot)' };
const DUE = { calm: ['rgba(241,240,236,.07)', 'var(--ink3)'], attention: ['rgba(241,240,236,.18)', 'var(--ink)'], near: ['var(--ink)', 'var(--bg)'], risk: ['var(--hot)', '#111'] };

// 오늘 15577 블록
const todayBlocks = () =>
  STATE.tasks.filter((t) => t.source === 'plan' && t.date === TODAY && t.start).map((t) => ({ t, ...blockOf(t) })).sort((a, b) => a.start - b.start);

// ---------- NOW ----------
function judgeBanner() {
  const c = R.card;
  const warn = ['deadline', 'delay', 'caution'].includes(c.type);
  const d = R.delay;
  const delayLine = d && d.per ? (d.severity === 'none' ? `${STATE.settings.delayMin}분 미뤄도 큰 영향 없음` : d.severity === 'low' ? `${STATE.settings.delayMin}분 미루면 오래 걸릴 때 영향` : `${STATE.settings.delayMin}분 미루면 영향 있음`) : null;
  return `<div class="judge${warn ? ' hot' : ''}">
    <div class="judge-k"><span>${esc(c.eyebrow)}</span>${S.selBlock ? '<button data-act="follow">판단 따르기</button>' : ''}</div>
    <div class="judge-t">${esc(c.title)}</div>
    <div class="judge-m">${esc(c.message)}</div>
    ${delayLine ? `<div class="judge-d${d.severity === 'high' || d.severity === 'medium' ? ' warn' : ''}"><i></i>${esc(delayLine)}</div>` : ''}
  </div>`;
}
function taskCard(t, on) {
  const rem = remainingOf(t), est = estimateOf(t);
  const p = t.status === 'done' ? 100 : est ? ((est - rem) / est) * 100 : 0;
  return `<a class="hw${t.status === 'done' ? ' complete' : ''}" role="radio" aria-checked="${on}" href="/plan/" data-task="${esc(t.id)}" style="text-decoration:none">
    <span class="hw-head"><span class="radio"></span><span class="hw-title">${esc(t.title)}</span></span>
    ${t.deadline ? `<span class="hw-note">마감 ${ddayTxt(daysBetween(TODAY, t.deadline))}${t.deadlineTime ? ' ' + esc(t.deadlineTime) : ''}</span>` : ''}
    ${bar(p, 'now-' + t.id, SUBJ_COLOR[t.subject])}
    <span class="hw-sub"><span class="num"><b>${Math.round(p)}</b>%</span><span>남은 ${dur(rem)}</span></span>
  </a>`;
}
// 배경: Unsplash 사진 한 장(bg.webp, ran liwen). 주소 끝 #city 를 붙이면 예전 도시 24시간 사진(city.js)
if (/city/.test(location.hash)) mountCity(document.getElementById('city'),nowMs);
else {
  const bg = new Image();
  bg.className = 'ws-bg'; bg.alt = ''; bg.draggable = false; bg.decoding = 'async';
  bg.src = new URL('./bg.webp', import.meta.url).href;
  document.getElementById('city').replaceWith(bg);
}

function renderNow() {
  if (!briefDismissed) {
    const bt = document.getElementById('briefTitle');
    bt.textContent = R.card.title;
    // 긴 제목은 글자를 줄인다(두 줄 안쪽으로): 10자까지 그대로, 길수록 작게
    bt.style.setProperty('--fit', String(Math.max(0.5, Math.min(1, 10 / Math.max(10, [...bt.textContent].length * 0.82)))));
    document.getElementById('briefDetail').textContent = R.card.message;
    brief.hidden = false;
  }
  const box = document.getElementById('b-now'), link = document.getElementById('nowLink');
  const n = R.now, blocks = todayBlocks();
  const sel = S.selBlock && blocks.find((b) => b.t.id === S.selBlock);
  const cardTask = R.card.taskId ? taskOf(R.card.taskId) : null;
  const cur = sel || blocks.find((b) => b.start <= n && n < b.end) || (cardTask && blockOf(cardTask) && cardTask.date === TODAY ? { t: cardTask, ...blockOf(cardTask) } : null) || blocks.find((b) => b.start > n);
  const next = blocks.find((b) => b.start > (cur ? cur.start : n));
  const nextRow = next ? `<button class="next-row" data-act="selblock" data-id="${esc(next.t.id)}" style="--c:${SUBJ_COLOR[next.t.subject]}"><span class="k">NEXT</span><span class="sw"></span><b>${esc(next.t.title)}</b><span class="num">${fmtTime(next.start)}</span><span class="arr">${ic('arrow', 15)}</span></button>` : '';
  if (cur) {
    const st = stateOf(cur, cur.t), len = (cur.end - cur.start) / MINMS, el = clamp((n - cur.start) / MINMS, 0, len);
    const pill = st === 'now' ? '<span class="pill live"><i></i>Live · 지금</span>' : st === 'done' ? `<span class="pill done">${ic('check', 12)}완료</span>` : st === 'past' ? '<span class="pill">지난 블록</span>' : '<span class="pill">Next · 다음 예정</span>';
    const big = st === 'now' ? { v: Math.ceil(len - el), k: 'MIN LEFT', s: '남음' } : st === 'next' ? { v: Math.round((cur.start - n) / MINMS), k: 'MIN TO GO', s: '후 시작' } : { v: '—', k: 'ENDED', s: '블록 종료' };
    const pips = Array.from({ length: Math.ceil(len / 15) }, (_, i) => {
      const f = clamp((el - i * 15) / Math.min(15, len - i * 15), 0, 1) * 100;
      return `<span class="pip"><i data-k="pip-${i}" data-p="${f}" style="width:${prevW['pip-' + i] ?? 0}%"></i></span>`;
    }).join('');
    const list = [cur.t, ...(cardTask && cardTask.id !== cur.t.id ? [cardTask] : [])];
    box.innerHTML = `
      <div class="now-top">${pill}<span class="now-time num">${fmtTime(cur.start)}–${fmtTime(cur.end)}</span><span class="now-plan num">PLAN ${dur(len)}</span></div>
      <div class="now-hero"><h2 class="now-title${cur.t.title.length > 8 ? ' sm' : ''}">${esc(cur.t.title)}</h2>
        <div class="now-left"><span class="big num">${big.v}</span><span class="cap"><b>${big.k}</b>${big.s}</span></div></div>
      <div class="pips"><span class="lbl">15′ × ${Math.ceil(len / 15)}</span>${pips}</div>
      ${judgeBanner()}
      <div class="sec-label"><span class="kr">${list.length > 1 ? '이 블록 · 판단이 고른 작업' : '이 블록'}</span><span>[${String(list.length).padStart(2, '0')}]</span></div>
      <div class="hw-list">${list.map((t, i) => taskCard(t, i === 0)).join('')}</div>
      <div class="now-actions"><a class="btn-primary" href="/plan/" style="text-decoration:none">${ic('play', 15)}15577에서 시작·완료<small>${esc(cur.t.title)}</small></a></div>
      ${nextRow}`;
    link.innerHTML = `${ic('link', 12)}15577 ${fmtTime(cur.start)}`;
  } else {
    box.innerHTML = `
      <div class="now-top"><span class="pill">${esc(R.card.eyebrow)}</span><span class="now-time num">${fmtTime(n)}</span></div>
      <div class="now-hero"><h2 class="now-title sm">${esc(R.card.title)}</h2></div>
      ${judgeBanner()}
      ${cardTask ? `<div class="sec-label"><span class="kr">판단이 고른 작업</span><span>[01]</span></div><div class="hw-list">${taskCard(cardTask, true)}</div>` : ''}
      <div class="now-actions"><a class="btn-primary" href="/plan/" style="text-decoration:none">${ic('play', 15)}15577 열기<small>블록 추가·시작</small></a></div>
      ${nextRow}`;
    link.innerHTML = `${ic('link', 12)}${esc(R.card.eyebrow)}`;
  }
  document.getElementById('clock').textContent = fmtTime(nowMs());
}

// ---------- TODAY ----------
function tile(segs, key, past) {
  const qs = [25, 50, 75].map((p) => `<span class="q${past ? '' : ' dk'}" style="left:${p}%"></span>`).join('');
  return `<div class="tile">${segs.map((s, i) => `<span class="s ${s.t}" data-k="${key}-${i}" data-p="${s.w}" style="left:${s.l}%;width:${prevW[key + '-' + i] ?? 0}%"></span>`).join('')}${qs}</div>`;
}
function renderToday() {
  const t = R.today_;
  const avail = R.sleeping ? 0 : t.freeMin, work = Math.min(avail, t.work.exp);
  const completed = STATE.tasks.filter((x) => x.source === 'plan' && x.date === TODAY && x.status === 'done').reduce((s, x) => s + estimateOf(x), 0);
  const over = Math.max(0, t.work.high - avail);
  let html = '';
  const pastN = Math.max(1, Math.ceil(completed / 60));
  for (let i = 0; i < pastN; i++) html += `<div class="tile-wrap" style="flex:.8">${tile([{ t: 'done', l: 0, w: (clamp(completed - i * 60, 0, 60) / 60) * 100 }], 'tp' + i, true)}<span class="tile-lbl">${i === 0 ? 'DONE' : ''}</span></div>`;
  html += `<span class="now-mark" aria-hidden="true"><span class="num">${fmtTime(R.now)}</span></span>`;
  const nT = Math.max(1, Math.ceil(avail / 60));
  for (let i = 0; i < nT; i++) {
    const a = i * 60, segs = [];
    const p = clamp(work - a, 0, 60), f = clamp(avail - a, 0, 60);
    if (p > 0) segs.push({ t: 'plan', l: 0, w: (p / 60) * 100 });
    if (f > p) segs.push({ t: 'free', l: (p / 60) * 100, w: ((f - p) / 60) * 100 });
    const rest = avail - a;
    html += `<div class="tile-wrap">${tile(segs, 'tf' + i, false)}<span class="tile-lbl">${rest >= 60 ? `+${i + 1}H` : `+${Math.round(rest)}M`}</span></div>`;
  }
  const lo = roundTo(t.slack.lo, 5), hi = roundTo(t.slack.hi, 5);
  const risky = R.risks.exp.length;
  const line = risky ? { warn: true, txt: `마감 위험 ${risky}개 · ${R.risks.exp[0].task.title}` }
    : over > 5 ? { warn: true, txt: `오래 걸리면 오늘 시간이 약 ${dur(r5(over))} 모자라요` }
    : { warn: false, txt: `여유 ${lo === hi ? dur(lo) : `${lo}~${hi}분`} · 오늘 배치대로면 마감 위험 없음` };
  document.getElementById('b-today').innerHTML = `
    <div class="td-head"><span class="td-big num">${hmShort(avail)}</span><span class="td-cap"><b>H:MM AVAILABLE</b>남은 가용 시간 · 취침 ${fmtTime(t.end)}까지</span><span class="td-key"><i></i>1 Block = 1H</span></div>
    <div class="tiles">${html}</div>
    <div class="legend">
      <span class="done"><i></i>완료 <b class="num">${dur(completed)}</b></span>
      <span class="plan"><i></i>오늘 배치 <b class="num">${dur(t.work.exp)}</b>${t.work.high - t.work.low >= 5 ? `<span class="of">/ 길어지면 ${dur(t.work.high)}</span>` : ''}</span>
      <span class="free"><i></i>여유 <b class="num">${dur(Math.max(0, avail - work))}</b></span>
    </div>
    <div class="td-judge${line.warn ? ' warn' : ''}"><i></i>${esc(line.txt)}</div>`;
}

// ---------- DEADLINES ----------
function dlRow(d, tag) {
  const j = judgeDeadline(d), [dbg, dfg] = DUE[j.urgency];
  const p = j.total ? ((j.total - j.rem) / j.total) * 100 : 0;
  const note = j.note ? `<div class="dl-note ${j.status === 'risk' ? 'risk' : 'watch'}"><i></i>${esc(j.note)}</div>` : '';
  const { m, d: dd, w } = dateLabel(d.date);
  return `<a class="dl-row lv-${j.urgency}" href="/schedule/" style="text-decoration:none;color:inherit;--rail:${RAIL[j.urgency]};--dbg:${dbg};--dfg:${dfg}">
    <span class="rail"></span>
    <div style="min-width:0">${tag ? `<div class="dl-tag">${esc(tag)}</div>` : ''}<div class="dl-title">${esc(d.title)}</div>${note}</div>
    <div class="dl-prog">${bar(p, 'dl-' + d.id, 'var(--ink)')}<span class="dl-count num"><span>${j.linked.length ? `블록 <b>${j.doneN}</b> / ${j.linked.length}` : d.estimateMin ? `예상 ${dur(d.estimateMin)}` : '시간 미정'}</span><span>${Math.round(p)}%</span></span></div>
    <div class="dl-due"><span class="due-chip">${ddayTxt(j.dday)}</span><span class="due-date">${m}/${dd} ${w}${d.time ? ' ' + esc(d.time) : ''}</span></div>
    <div class="dl-est">${j.rem ? `약 ${dur(r5(j.rem))}` : j.status === 'unknown' ? '—' : '0분'}<small>${j.linked.length ? '15577 남은 시간' : j.status === 'unknown' ? '연결 필요' : '예상'}</small></div>
  </a>`;
}
function renderDl() {
  const list = META.deadlines.filter((d) => d.date <= addDays(TODAY, 21));
  let html = '';
  if (!list.length) html = `<p class="empty-hero">${events == null ? '일정 불러오는 중…' : '21일 안에 마감이 없어요.'}</p>`;
  else if (S.sort === 'group') {
    for (const g of GROUPS) {
      const ds = list.filter((d) => groupOfDeadline(d).id === g.id);
      if (!ds.length) continue;
      const js = ds.map(judgeDeadline);
      const rem = js.reduce((s, j) => s + j.rem, 0), unknown = js.filter((j) => j.status === 'unknown').length;
      const soon = Math.min(...js.map((j) => j.dday));
      const flag = js.some((j) => j.status === 'risk') ? '<span class="warn">마감 위험</span>' : js.some((j) => j.status === 'tight') ? '빠듯할 수 있음' : unknown ? `시간 미정 ${unknown}개` : '';
      if (S.open[g.id] == null) S.open[g.id] = true;
      html += `<div class="grp${S.open[g.id] ? ' open' : ''}" style="--c:${g.color}">
        <button class="grp-h" data-act="group" data-id="${g.id}" aria-expanded="${!!S.open[g.id]}">
          <span class="badge">${g.badge}</span>
          <span><div class="grp-name">${g.name}${g.sub ? `<em> · ${g.sub}</em>` : ''}</div>
          <div class="grp-meta">마감 ${ds.length}개${rem ? ` · 약 ${dur(r5(rem))}` : ''} · 가장 빠른 마감 ${ddayTxt(soon)}${flag ? ' · ' + flag : ''}</div></span>
          <span class="grp-right"><span class="chev">${ic('chevron', 18)}</span></span>
        </button>
        <div class="grp-b"><div><div class="grp-items">${ds.map((d) => dlRow(d)).join('')}</div></div></div></div>`;
    }
  } else {
    html = `<div class="grp open"><div class="grp-items">${list.map((d) => dlRow(d, groupOfDeadline(d).name)).join('')}</div></div>`;
  }
  html += `<div class="dl-legend"><span><i style="background:${RAIL.calm}"></i>여유</span><span><i style="background:${RAIL.attention}"></i>주의</span><span><i style="background:${RAIL.near}"></i>임박</span><span class="sep"></span><span><i style="background:var(--red)"></i>마감 전 끝내기 어려움</span></div>`;
  document.getElementById('b-dl').innerHTML = html;
  document.querySelectorAll('[data-act="sort"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sort === S.sort)));
}

// ---------- PLANNER ----------
function renderPl() {
  const n = R.now, blocks = todayBlocks();
  const busy = (R.days[0]?.busy || []).filter((b) => b.end > (blocks[0]?.start ?? n) - 30 * MINMS && b.start < R.today_.end);
  const order = new Map(R.timelineToday.map((p, i) => [p.taskId, i]));
  const items = [...busy.map((b) => ({ ...b, fixed: true })), ...blocks].sort((a, b) => a.start - b.start);
  const rows = items.map((x) => {
    const len = (x.end - x.start) / MINMS;
    if (x.fixed) return `<div class="pl-row fixed small" style="--c:var(--ink4)"><span class="pl-time num">${fmtTime(x.start)}</span><span class="pl-rail"><i></i></span><span class="pl-card"><span class="pl-title">${esc(x.label)} · ${dur(len)}</span></span></div>`;
    const st = stateOf(x, x.t), map = { done: 'done', past: 'done', now: 'now', next: 'next' }[st];
    const pill = st === 'now' ? '<span class="pill live"><i></i>Now</span>' : st === 'done' ? `<span class="pill done">${ic('check', 11)}Done</span>` : st === 'past' ? '<span class="pill">미완료</span>' : '';
    const nowbar = st === 'now' ? `<span class="pl-nowbar"><i data-k="pl-nb" data-p="${((n - x.start) / (x.end - x.start)) * 100}" style="width:${prevW['pl-nb'] ?? 0}%"></i></span>` : '';
    const rec = order.has(x.t.id) ? `엔진 순서 ${order.get(x.t.id) + 1}` : st === 'done' ? '완료' : '';
    const sel = S.selBlock === x.t.id;
    return `<button class="pl-row st-${map}${sel ? ' sel' : ''}" data-act="pledit" aria-label="15577에서 ${esc(x.t.title)} 편집" data-id="${esc(x.t.id)}" style="--c:${SUBJ_COLOR[x.t.subject]};--h:${Math.max(64, len * 1.35)}px">
      <span class="pl-time num">${fmtTime(x.start)}<small>${fmtTime(x.end)}</small></span><span class="pl-rail"><i></i></span>
      <span class="pl-card"><span class="pl-title">${esc(x.t.title)}${pill}</span><span class="pl-sub">${dur(len)} · ${esc(x.t.lite || '')}${remainingOf(x.t) !== estimateOf(x.t) && x.t.status !== 'done' ? ` · 남은 ${dur(remainingOf(x.t))}` : ''}${rec ? ' · ' + rec : ''}</span>${nowbar}</span>
    </button>`;
  });
  rows.push(`<div class="pl-row fixed small" style="--c:var(--ink)"><span class="pl-time num">${fmtTime(R.today_.end)}</span><span class="pl-rail"><i></i></span><span class="pl-card"><span class="pl-title">취침</span></span></div>`);
  const unplaced = R.timelineToday.filter((p) => !blocks.some((b) => b.t.id === p.taskId));
  const detail = `<div class="pl-detail-card">
    <div class="pd-k">엔진이 오늘 넣은 순서</div>
    <div class="pd-t">${R.timelineToday.length ? `${R.timelineToday.length}개` : '없음'}</div>
    <div class="pd-m num">15577 블록 ${blocks.length}개 · 일정 ${META.counts.events}개</div>
    <div class="sec-label"><span class="kr">추천 순서</span><span>[${String(R.timelineToday.length).padStart(2, '0')}]</span></div>
    ${R.timelineToday.slice(0, 8).map((p) => `<div class="pd-task"><span class="t">${esc(p.task.title)}</span><span class="a"><span class="num">${fmtTime(p.start)}–${fmtTime(p.end)}</span><span>${dur((p.end - p.start) / MINMS)}</span></span>${p.task.deadline ? `<span class="n">마감 ${ddayTxt(daysBetween(TODAY, p.task.deadline))}</span>` : ''}</div>`).join('')}
    ${unplaced.length ? `<div class="pd-slack">블록 없이 빈 시간에 넣은 작업 ${unplaced.length}개</div>` : ''}
  </div>`;
  document.getElementById('pl-sum').innerHTML = blocks.length || busy.length ? rows.join('') : '<p class="empty-hero">오늘 15577 블록이 없어요. <button data-act="pledit" style="color:inherit;text-decoration:underline">15577 열기</button></p>';
  document.getElementById('pl-side').innerHTML = detail;
}

// ---------- PLANNER 창 안의 15577 ----------
// 평소엔 요약. 블록을 누르면 창을 크게 열고 /plan/?embed=1 에서 그 블록 편집 시트를 연다('15577 편집'은 그날 화면).
// 같은 주소라 15577 기록(blockplanner.v1)이 하나이고, 저장하면 storage 이벤트로 WS가 바로 다시 계산한다
let plFramed = false;
document.getElementById('plEdit').hidden = false;
function plFrame(show, blockId) {
  const box = document.getElementById('pl-frame');
  const id = blockId ? String(blockId).replace(/^p:/, '') : '';
  if (show) {
    let f = box.querySelector('iframe');
    if (!f) {
      f = document.createElement('iframe');
      f.title = '15577 플래너';
      f.src = '/plan/?embed=1' + (id ? '&edit=' + encodeURIComponent(id) : '');
      box.append(f);
    } else if (id) {
      f.contentWindow?.postMessage({ sab: 'plan-edit', id }, location.origin);
    }
  }
  plFramed = show;
  box.hidden = !show;
  document.getElementById('pl-sum').hidden = show;
  document.getElementById('b-pl').classList.toggle('framed', show);
  const btn = document.getElementById('plEdit');
  btn.textContent = show ? '요약으로' : '15577 편집';
  btn.setAttribute('aria-pressed', String(show));
}
function plOpen(blockId) {
  S.closed.pl = false; S.collapsed.pl = false; S.focus = 'pl'; front('pl');
  plFrame(true, blockId); applyLayout();
}
function plClose() {
  if (S.focus === 'pl') S.focus = null;
  plFrame(false); applyLayout();
}

function renderDock() {
  document.getElementById('dock').innerHTML = Object.keys(NAMES).map((id) => {
    const off = !!S.closed[id];
    const minimized = S.collapsed[id] && !off;
    return `<button data-act="dock" data-id="${id}" class="${minimized ? 'min' : ''}" aria-label="${NAMES[id]} ${off ? '창 다시 열기' : '창 앞으로'}">${NAMES[id]}</button>`;
  }).join('');
}

function render() {
  compute();
  const { m, d, w } = dateLabel(TODAY);
  document.getElementById('dateTxt').textContent = `${m}월 ${d}일 ${w}요일`;
  document.getElementById('plSub').textContent = `${m}/${d} (${w}) 15577`;
  document.getElementById('volTag').textContent = `Vol.${TODAY.slice(2, 4)} / No.${m}`;
  document.getElementById('volMeta').textContent = `Vol.${TODAY.slice(2, 4)} No.${m}`;
  renderNow(); renderToday(); renderDl(); renderPl();
  restack();
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('[data-k]').forEach((el) => { el.style.width = el.dataset.p + '%'; prevW[el.dataset.k] = +el.dataset.p; })));
  try { window.Sabathia?.report?.('decide', { mode: R.mode, badge: R.risks.exp.length || '' }); } catch {}
}

let tt;
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2400); }
function toFree(msg) {
  if (S.mode === 'free') return;
  const o = orgRects();
  ids.forEach((id) => { if (o[id]) S.free[id] = { ...o[id] }; });
  S.mode = 'free'; applyLayout(); if (msg) toast(msg);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act, w = a.closest('.win'), wid = w && w.dataset.id;
  switch (act) {
    case 'mode': if (a.dataset.mode === 'free') toFree(); else { S.mode = 'organized'; applyLayout(); } break;
    case 'reset': S.free = freeDefault(); S.collapsed = {}; S.closed = {}; applyLayout(); break;
    case 'collapse': if (S.focus === wid) S.focus = null; S.collapsed[wid] = !S.collapsed[wid]; applyLayout(); break;
    case 'focus': S.focus = S.focus === wid ? null : wid; if (S.focus) front(wid); applyLayout(); break;
    case 'close': if (S.focus === wid) S.focus = null; S.closed[wid] = true; applyLayout(); toast(`${NAMES[wid]} 창을 닫았어요 · 아래 독에서 다시 열 수 있어요`); break;
    case 'unfocus': S.focus = null; applyLayout(); break;
    case 'dock': { const id = a.dataset.id; S.closed[id] = false; S.collapsed[id] = false; front(id); applyLayout(); break; }
    case 'sort': S.sort = a.dataset.sort; render(); break;
    case 'group': { const g = a.dataset.id; S.open[g] = !S.open[g]; a.closest('.grp').classList.toggle('open', S.open[g]); setTimeout(restack, 520); break; }
    case 'selblock': S.selBlock = a.dataset.id; render(); break;
    case 'pledit': if (plFramed && !a.dataset.id) plClose(); else plOpen(a.dataset.id); break;
    case 'follow': S.selBlock = null; render(); break;
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.focus) { S.focus = null; applyLayout(); } });

stage.addEventListener('pointerdown', (e) => {
  const w = e.target.closest('.win'); if (!w) return;
  const id = w.dataset.id;
  if (S.mode === 'free' && !S.focus) { front(id); ids.forEach((x) => { win(x).style.zIndex = 10 + S.order.indexOf(x); }); }
  const head = e.target.closest('.wh'), rz = e.target.closest('.rz');
  if ((!head && !rz) || e.target.closest('button,a') || S.focus || FORM === 'phone') return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  let started = false, r0;
  const move = (ev) => {
    const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
    if (!started) { if (Math.hypot(dx, dy) < 4) return; started = true; toFree(head ? '자유 모드로 전환했어요' : null); r0 = { ...S.free[id] }; w.classList.add(head ? 'dragging' : 'resizing'); }
    const r = S.free[id];
    if (head) { r.x = clamp(r0.x + dx, -r.w + 120, W - 120); r.y = clamp(r0.y + dy, TOP - 10, H - HEAD); w.style.left = r.x + 'px'; w.style.top = r.y + 'px'; }
    else { r.w = clamp(r0.w + dx, 340, W - r.x - 8); r.h = clamp(r0.h + dy, 200, H - r.y - 8); w.style.width = r.w + 'px'; w.style.height = r.h + 'px'; }
  };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); w.classList.remove('dragging', 'resizing'); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
});
function sizeStage() {
  Object.assign(stage.style, { width: W + 'px', height: H + 'px', transform: scale === 1 ? 'none' : `scale(${scale})` });
  stage.style.setProperty('--W', W + 'px'); stage.style.setProperty('--VH', VH + 'px'); stage.style.setProperty('--SH', H + 'px');
  document.body.style.height = Math.ceil(H * scale) + 'px';
}
function fit() {
  const was = FORM;
  measure();
  if (was !== FORM) S.free = freeDefault();
  else ids.forEach((id) => { const r = S.free[id]; r.w = Math.min(r.w, W - 16); r.h = Math.min(r.h, Math.max(200, H - TOP - 8)); r.x = clamp(r.x, 0, W - r.w); r.y = clamp(r.y, TOP - 10, Math.max(TOP, H - r.h)); });
  sizeStage();
}
let fitT;
window.addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(() => { fit(); applyLayout(); }, 80); });
window.addEventListener('storage', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); loadEvents(); } });
setInterval(() => { document.getElementById('clock').textContent = fmtTime(nowMs()); }, 1000);
setInterval(render, 60_000);
fit(); applyLayout(); render(); loadEvents();
document.fonts && document.fonts.ready.then(applyLayout);
