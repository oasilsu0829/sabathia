// 판단 (DEC-09) · Study Workspace
// 창 4개(+설정): NOW(지금 할 블록과 연결된 숙제) · TODAY(남은 시간 블록 그래프) · DEADLINES(소속별 숙제·위험도) · PLANNER(15577)
// 데이터는 sources.js·homework.js가 15577·일정·장부·시험대비에서 읽고, 판단은 engine/decide.js가 한다.
// 이 화면이 쓰는 저장값: decide.v1(판단 보정), decide.layout(창 배치). 15577 기록은 15577이 직접 쓴다(주소로 시트를 열어 줌).
import { decide, fmtLoss } from './engine/decide.js';
import { DEFAULT_SETTINGS, SUBJECTS, KINDS } from './engine/config.js';
import { remainingOf, estimateOf } from './engine/planner.js';
import { fmtTime, fmtDur, relDayLabel, weekdayOf, weekdayLabel, roundTo, toDateStr, addDays, shortDate } from './engine/time.js';
import { buildState, STUDY_EVENTS } from './sources.js';
import { assess, groupHomework, LEVEL } from './homework.js';

const LS = 'decide.v1';
const LAY = 'decide.layout';
const MODE_LABEL = { normal: '평상시', risk: '일정 위험', exam: '시험 집중' };
// 시험대비(/exam/)의 EXAM 상수와 같은 날짜. 다음 시험 때는 설정에서 바꾼다
const DEFAULT_EXAMS = [{ id: 'final-2026-2', name: '2학기 기말고사', date: '2026-12-10', subjects: [] }];
const subjVar = (s) => `var(--${SUBJECTS[s] ? s : 'other'})`;

// ───────── 저장 ─────────
const json = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
function loadLocal() {
  const raw = json(LS) || {};
  const settings = { ...structuredClone(DEFAULT_SETTINGS), ...(raw.settings || {}) };
  settings.thresholds = { ...DEFAULT_SETTINGS.thresholds, ...(raw.settings?.thresholds || {}) };
  if (!raw.settings) settings.exams = structuredClone(DEFAULT_EXAMS);
  return { settings, ov: raw.ov || {}, log: raw.log || [] };
}
let L = loadLocal();
function save() {
  try { localStorage.setItem(LS, JSON.stringify(L)); } catch {}
  render();
}
function setOv(id, patch) {
  L.ov[id] = { ...(L.ov[id] || {}), ...patch };
  for (const k of Object.keys(L.ov[id])) if (L.ov[id][k] == null || L.ov[id][k] === '') delete L.ov[id][k];
  save();
}

const nowMs = () => {
  const q = new URLSearchParams(location.search).get('now'); // 검증용 ?now=2026-11-18T21:00
  const t = q ? new Date(q).getTime() : NaN;
  return Number.isFinite(t) ? t : Date.now();
};

// ───────── DOM ─────────
const isProps = (v) => v != null && typeof v === 'object' && !(v instanceof Node) && !Array.isArray(v);
function h(tag, props, ...kids) {
  if (!isProps(props)) { kids.unshift(props); props = null; }
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style') for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const $ = (s) => document.querySelector(s);
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 3000);
}
const pill = (s) => h('span.pill', { style: { '--c': subjVar(s) } }, SUBJECTS[s]?.label ?? '기타');

/** 시간 블록 그래프: 1칸 = 60분, 칸 안을 종류별 비율로 채운다. segs = [{min, k}] */
function blocks(segs, { size } = {}) {
  const total = segs.reduce((a, s) => a + Math.max(0, s.min), 0);
  const n = Math.max(1, Math.ceil(total / 60 - 1e-6));
  const cls = size || (n > 14 ? 'xs' : n > 8 ? 's' : '');
  const wrap = h('div.tb' + (cls ? '.' + cls : ''), { role: 'img', 'aria-label': segs.filter((s) => s.min > 0).map((s) => `${s.label || ''} ${fmtDur(s.min)}`).join(', ') });
  let i = 0, used = 0; // 현재 조각에서 쓴 분
  for (let c = 0; c < n; c++) {
    const cell = h('span.c');
    let room = 60;
    while (room > 0.01 && i < segs.length) {
      const s = segs[i];
      const take = Math.min(room, Math.max(0, s.min) - used);
      if (take > 0.01) cell.append(h('i.' + s.k, { style: { width: `${(take / 60) * 100}%` } }));
      room -= Math.max(0, take);
      used += Math.max(0, take);
      if (used >= Math.max(0, s.min) - 0.01) { i++; used = 0; }
    }
    wrap.append(cell);
  }
  return wrap;
}
const hm = (min) => { const m = Math.max(0, Math.round(min)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

// ───────── 데이터 ─────────
let events = null;
async function loadEvents() {
  try { events = window.SabathiaToday ? await SabathiaToday.events() : []; } catch { events = []; }
  render();
}

let R = null, META = null, TODAY = null, HW = [], HWBY = new Map();
function compute() {
  const now = nowMs();
  const { state, meta } = buildState({
    plan: json('blockplanner.v1'),
    events: events || (json('sab.cache') || {}).events || [],
    projects: json('projects.v1'),
    examDoc: json('exam.v1'),
    local: L,
    today: toDateStr(now),
  });
  META = meta;
  R = decide(state, now);
  R.state = state;
  TODAY = R.today;
  HW = assess(meta.homework, R);
  HWBY = new Map(HW.map((x) => [x.evId, x]));
}
const taskOf = (id) => R.state.tasks.find((t) => t.id === id);

// ───────── 창 배치 ─────────
const WINS = {
  now: { title: 'NOW' },
  today: { title: 'TODAY' },
  deadlines: { title: 'DEADLINES' },
  planner: { title: 'PLANNER', sub: '15577' },
  settings: { title: '설정', closable: true },
};
const phoneQ = matchMedia('(max-width: 699px)');
const isPhone = () => phoneQ.matches;
function loadLayout() {
  const d = { mode: 'grid', free: {}, collapsed: {}, open: { settings: false }, dl: 'group', z: 1 };
  const raw = json(LAY) || {};
  return { ...d, ...raw, free: { ...(raw.free || {}) }, collapsed: { ...(raw.collapsed || {}) }, open: { ...d.open, ...(raw.open || {}) } };
}
let LAYOUT = loadLayout();
const saveLayout = () => { try { localStorage.setItem(LAY, JSON.stringify(LAYOUT)); } catch {} };
const mode = () => (isPhone() ? 'grid' : LAYOUT.mode);
const isOpen = (id) => (WINS[id].closable ? !!LAYOUT.open[id] : true);

const desk = $('#desk');
const col1 = h('div.col1');
const W = {}; // id → { el, body, sub }
function frame(id) {
  const def = WINS[id];
  const sub = h('span.sub', def.sub || '');
  const btnC = h('button', { type: 'button', 'aria-label': '접기', onclick: () => toggleCollapse(id) }, '–');
  const btnF = h('button.hide-phone', { type: 'button', 'aria-label': '크게 보기', onclick: () => toggleFocus(id) }, '⤢');
  const btns = [btnC, btnF];
  if (def.closable) btns.push(h('button', { type: 'button', 'aria-label': '닫기', onclick: () => { LAYOUT.open[id] = false; saveLayout(); arrange(); } }, '✕'));
  const bar = h('div.bar', h('h2', def.title), sub, h('div.wb', btns));
  const body = h('div.body');
  const grip = h('div.grip', { 'aria-hidden': 'true' });
  const el = h('section.win', { 'data-id': id, 'aria-label': def.title }, bar, body, grip);
  bar.addEventListener('pointerdown', (e) => startDrag(e, id, 'move'));
  bar.addEventListener('dblclick', (e) => { if (!e.target.closest('.wb')) toggleCollapse(id); });
  grip.addEventListener('pointerdown', (e) => startDrag(e, id, 'size'));
  el.addEventListener('pointerdown', () => mode() === 'free' && front(id), true);
  W[id] = { el, body, sub, btnC, btnF };
  return el;
}
for (const id of Object.keys(WINS)) frame(id);
desk.append(col1, W.deadlines.el, W.planner.el); // planner는 다시 옮기지 않는다

function defaultFree() {
  const dw = desk.clientWidth, dh = desk.clientHeight, p = 14, g = 14;
  const uw = dw - p * 2, uh = dh - p;
  const c1 = Math.round(uw * 0.29), c2 = Math.round(uw * 0.31), c3 = uw - c1 - c2 - g * 2;
  const nh = Math.round(uh * 0.46);
  return {
    now: { x: p, y: 4, w: c1, h: nh },
    today: { x: p, y: 4 + nh + g, w: c1, h: uh - nh - g },
    deadlines: { x: p + c1 + g, y: 4, w: c2, h: uh },
    planner: { x: p + c1 + c2 + g * 2, y: 4, w: c3, h: uh },
    settings: { x: Math.round(dw / 2 - 220), y: 40, w: 440, h: Math.min(620, uh - 40) },
  };
}
/** 정렬 → 자유로 처음 바꿀 때는 지금 보이는 자리 그대로 시작한다(손실 없는 전환) */
function captureFree() {
  const d = desk.getBoundingClientRect();
  for (const id of Object.keys(WINS)) {
    if (LAYOUT.free[id] || !isOpen(id)) continue;
    const r = W[id].el.getBoundingClientRect();
    if (r.width > 40) LAYOUT.free[id] = { x: Math.round(r.left - d.left), y: Math.round(r.top - d.top), w: Math.round(r.width), h: Math.round(r.height) };
  }
  const def = defaultFree();
  for (const id of Object.keys(WINS)) LAYOUT.free[id] ||= def[id];
}
function clampRect(r) {
  const dw = desk.clientWidth, dh = desk.clientHeight;
  r.w = Math.max(260, Math.min(r.w, dw - 8));
  r.h = Math.max(140, Math.min(r.h, dh - 4));
  r.x = Math.max(-r.w + 90, Math.min(r.x, dw - 90));
  r.y = Math.max(0, Math.min(r.y, dh - 44));
  return r;
}
function place(id) {
  const el = W[id].el, r = LAYOUT.free[id];
  if (mode() !== 'free' || !r) { el.style.left = el.style.top = el.style.width = el.style.height = el.style.zIndex = ''; return; }
  clampRect(r);
  Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: LAYOUT.collapsed[id] ? '' : r.h + 'px', zIndex: String(r.z || 1) });
}
function front(id) {
  const r = LAYOUT.free[id];
  if (!r) return;
  LAYOUT.z = (LAYOUT.z || 1) + 1;
  r.z = LAYOUT.z;
  W[id].el.style.zIndex = String(r.z);
}

function arrange() {
  const m = mode();
  const ws = $('#ws');
  if (m === 'free' && ws.dataset.layout !== 'free') captureFree(); // 정렬 상태의 자리를 재고 나서 바꾼다
  ws.dataset.layout = m;
  for (const b of document.querySelectorAll('#layoutSeg button')) b.setAttribute('aria-pressed', String(b.dataset.layout === m));
  if (m === 'free') {
    captureFree();
    for (const id of ['now', 'today', 'settings']) if (W[id].el.parentNode !== desk) desk.insertBefore(W[id].el, W.planner.el);
    col1.remove();
  } else {
    if (col1.parentNode !== desk) desk.insertBefore(col1, desk.firstChild);
    col1.append(W.now.el, W.today.el);
    if (isOpen('settings')) col1.append(W.settings.el);
  }
  for (const id of Object.keys(WINS)) {
    const el = W[id].el;
    el.hidden = !isOpen(id);
    const col = !!LAYOUT.collapsed[id];
    el.classList.toggle('collapsed', col);
    W[id].btnC.textContent = col ? '+' : '–';
    W[id].btnC.setAttribute('aria-label', col ? '펼치기' : '접기');
    el.classList.toggle('focused', LAYOUT.focus === id);
    W[id].btnF.textContent = LAYOUT.focus === id ? '⤡' : '⤢';
    place(id);
  }
  if (!isOpen('settings') && W.settings.el.parentNode === col1) col1.removeChild(W.settings.el);
  ws.classList.toggle('has-focus', !!LAYOUT.focus && isOpen(LAYOUT.focus));
  ensurePlanner();
  render();
}

function toggleCollapse(id) {
  LAYOUT.collapsed[id] = !LAYOUT.collapsed[id];
  if (LAYOUT.collapsed[id] && LAYOUT.focus === id) LAYOUT.focus = null;
  saveLayout();
  arrange();
}
function toggleFocus(id) {
  LAYOUT.focus = LAYOUT.focus === id ? null : id;
  if (LAYOUT.focus) LAYOUT.collapsed[id] = false;
  saveLayout();
  arrange();
}

// 끌기·크기 조절: 제목 줄과 모서리 손잡이에서만 시작하므로 창 안 스크롤·버튼은 그대로 쓴다
function startDrag(e, id, kind) {
  if (mode() !== 'free' || LAYOUT.focus || (e.button != null && e.button > 0)) return;
  if (e.target.closest('.wb, a, input, button')) return;
  const r = LAYOUT.free[id];
  if (!r) return;
  e.preventDefault();
  const tgt = e.currentTarget;
  tgt.setPointerCapture?.(e.pointerId);
  front(id);
  const el = W[id].el, sx = e.clientX, sy = e.clientY, o = { ...r };
  getSelection()?.removeAllRanges();
  desk.classList.add('moving');
  el.classList.add('lift');
  let raf = 0;
  const move = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (kind === 'move') { r.x = o.x + dx; r.y = o.y + dy; } else { r.w = o.w + dx; r.h = o.h + dy; }
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; place(id); });
  };
  const up = () => {
    tgt.removeEventListener('pointermove', move);
    tgt.removeEventListener('pointerup', up);
    tgt.removeEventListener('pointercancel', up);
    desk.classList.remove('moving');
    el.classList.remove('lift');
    place(id);
    saveLayout();
  };
  tgt.addEventListener('pointermove', move);
  tgt.addEventListener('pointerup', up);
  tgt.addEventListener('pointercancel', up);
}

$('#layoutSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-layout]');
  if (!b) return;
  LAYOUT.mode = b.dataset.layout;
  LAYOUT.focus = null;
  saveLayout();
  arrange();
});
$('#resetBtn').addEventListener('click', () => {
  LAYOUT = { ...loadLayout(), free: {}, collapsed: {}, focus: null, open: { settings: false }, mode: LAYOUT.mode };
  if (LAYOUT.mode === 'free') LAYOUT.free = defaultFree();
  saveLayout();
  arrange();
  toast('기본 배치로 돌렸어.');
});
$('#cfgBtn').addEventListener('click', () => {
  LAYOUT.open.settings = !LAYOUT.open.settings;
  LAYOUT.collapsed.settings = false;
  if (LAYOUT.open.settings && mode() === 'free') front('settings');
  saveLayout();
  arrange();
});
addEventListener('resize', () => { if (mode() === 'free') for (const id of Object.keys(WINS)) place(id); });
phoneQ.addEventListener?.('change', arrange);

// ───────── PLANNER (15577) ─────────
let iframe = null;
function ensurePlanner() {
  const want = !LAYOUT.collapsed.planner;
  if (want && !iframe) {
    iframe = h('iframe', { src: '/plan/', title: '15577 플래너', loading: 'lazy' });
    W.planner.body.append(iframe);
  }
}
/** 15577을 연다. 워크스페이스 안에 PLANNER 창이 열려 있으면 그 창에서, 아니면 15577로 이동 */
function openPlan(params = '') {
  const url = '/plan/' + (params ? '?' + params : '');
  if (!isPhone() && !LAYOUT.collapsed.planner) {
    ensurePlanner();
    iframe.src = url;
    if (mode() === 'free') front('planner');
    W.planner.el.animate?.([{ boxShadow: '0 0 0 3px var(--mode)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 900 });
    return;
  }
  location.href = url;
}

// ───────── 렌더 ─────────
let sheetOpen = null;
function render() {
  if (sheetOpen) return; // 시트를 닫은 뒤에 그린다(입력 보존)
  compute();
  document.documentElement.dataset.mode = R.mode;
  const d = new Date(R.now);
  $('#clock').textContent = `${d.getMonth() + 1}/${d.getDate()} ${weekdayLabel(d.getDay())} ${fmtTime(R.now)}`;
  $('#modeChip').textContent = R.exam.active ? `${MODE_LABEL[R.mode]} · ${R.exam.during ? '시험 기간' : 'D-' + R.exam.dDay}` : MODE_LABEL[R.mode];
  const fill = (el, kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  fill(W.now.body, nowView());
  fill(W.today.body, todayView());
  fill(W.deadlines.body, deadlinesView());
  if (isOpen('settings')) fill(W.settings.body, settingsView());
  report();
}

// NOW: 지금(또는 다음) 15577 블록 + 그 블록에서 할 숙제
function focusBlock() {
  const p = R.plannedNow;
  if (p && p.source === 'plan' && p.status !== 'done') return { t: p, why: '계획상 지금' };
  const n = R.timelineToday.find((x) => x.end > R.now && x.task.source === 'plan');
  if (n) return { t: n.task, why: `다음 · ${fmtTime(n.start)}`, at: n.start };
  return null;
}

function nowView() {
  const c = R.card;
  const fb = focusBlock();
  const out = [];
  if (!fb) {
    const t = c.taskId ? taskOf(c.taskId) : null;
    out.push(
      h('div.eyebrow', c.eyebrow),
      h('h1.hero', c.title),
      h('p.lead', c.message),
      h('div.acts',
        t && t.source === 'homework' ? h('button.btn.pri', { type: 'button', onclick: () => openPlan(`add=1&hw=${encodeURIComponent(t.hwId.slice(3))}&date=${TODAY}`) }, '15577에 블록 만들기') : null,
        h('button.btn' + (t && t.source === 'homework' ? '' : '.pri'), { type: 'button', onclick: () => openPlan(`add=1&date=${TODAY}`) }, '15577에 블록 추가')),
    );
    out.push(...checkinsView());
    return out;
  }
  const t = fb.t;
  const linked = (t.hwIds || []).map((id) => HWBY.get(id)).filter(Boolean);
  const engineSaysThis = c.taskId === t.id;
  const done = (t.progress || 0) * t.planMin;
  out.push(
    h('div.eyebrow', engineSaysThis ? c.eyebrow : fb.why),
    h('h1.hero', t.title),
    h('div.meta', pill(t.subject), h('span', `${t.start}–${t.end}`), h('span', '15577')),
    h('div', { style: { marginTop: '10px' } }, blocks([{ min: done, k: 'k-done', label: '한 것' }, { min: t.planMin - done, k: 'k-' + (SUBJECTS[t.subject] ? t.subject : 'other'), label: '계획' }])),
    engineSaysThis && ['delay', 'deadline', 'caution'].includes(c.type) ? h('p.lead', { style: { marginTop: '8px', color: 'var(--mode)' } }, c.message) : null,
  );
  out.push(h('div.sec',
    h('div.sec-h', h('h3', '이 블록에서 할 숙제'), h('button.btn.sm', { type: 'button', onclick: () => openPicker(t) }, linked.length ? '바꾸기' : '숙제 고르기')),
    linked.length
      ? linked.map((x) => hwItem(x, { action: h('button.btn.sm.pri', { type: 'button', onclick: (e) => { e.stopPropagation(); openPlan(`block=${t.id.slice(2)}&hw=${encodeURIComponent(x.evId)}`); } }, '시작') }))
      : [h('p.lead.small.muted', '고른 숙제는 15577 블록에 연결돼. 15577에서 푼 문제 수를 넣으면 진행률과 마감 위험에 바로 반영돼.'),
         ...suggestFor(t).slice(0, 3).map((x) => hwItem(x, { action: h('button.btn.sm', { type: 'button', onclick: (e) => { e.stopPropagation(); linkAndOpen(t, x); } }, '연결') }))],
  ));
  out.push(h('div.acts', h('button.btn.pri', { type: 'button', onclick: () => openPlan(`block=${t.id.slice(2)}`) }, '15577에서 시작'), h('button.btn', { type: 'button', onclick: () => openTask(t.id) }, '남은 시간')));
  if (!engineSaysThis && c.type !== 'next') out.push(h('div.card', { style: { marginTop: '14px' } }, h('div.eyebrow', c.eyebrow), h('div', { style: { fontWeight: 600, marginTop: '2px' } }, c.title), h('div.small.muted', c.message)));
  out.push(...checkinsView());
  return out;
}

function suggestFor(t) {
  return HW.filter((x) => x.level !== 'done')
    .map((x) => ({ x, s: (x.subject === t.subject ? 2 : 0) + (x.blocks.some((b) => 'p:' + b.id === t.id) ? 5 : 0) }))
    .sort((a, b) => b.s - a.s || a.x.due - b.x.due)
    .map((y) => y.x);
}
function linkAndOpen(t, x) {
  openPlan(`block=${t.id.slice(2)}&hw=${encodeURIComponent(x.evId)}`);
  toast('15577 시트에서 저장하면 연결돼.');
}

function checkinsView() {
  if (!R.checkins.length) return [];
  return [h('div.sec',
    h('div.sec-h', h('h3', '확인 필요'), h('span.small.muted', '완료 표시가 없는 지난 블록')),
    R.checkins.map((t) => h('div.card', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { style: { fontWeight: 600 } }, t.title), h('div.small.muted', `${relDayLabel(t.date, TODAY)} ${t.start}–${t.end} · 추측하지 않고 남은 일로 계산 중`)),
      t.source === 'plan' && h('button.btn.sm', { type: 'button', onclick: () => openPlan(`block=${t.id.slice(2)}`) }, '15577'),
      h('button.btn.sm', { type: 'button', onclick: () => setOv(t.id, { ackAt: Date.now() }) }, '아직'))))];
}

// 숙제 한 줄: 위험도(채도) · 임박도(바탕 농도) · 문제 진행 · 남은 시간
function hwItem(x, { action } = {}) {
  const lv = LEVEL[x.level];
  const pct = x.total ? (x.solved / x.total) * 100 : 0;
  const cnt = x.total ? `${x.solved}/${x.total}${x.count?.unit === '쪽' ? '쪽' : ''}${x.certain ? '' : '?'}` : x.left != null ? `남은 ${x.left}문제` : '';
  const due = `${relDayLabel(x.date, TODAY)}${x.time ? ' ' + x.time : ''}`;
  if (x.errand) {
    return h('div.hw', { role: 'button', tabindex: '0', 'data-lv': 'errand', 'data-urg': x.urgency, style: { padding: '8px 14px 8px 16px' }, onclick: () => openHw(x) },
      h('div.info', { style: { marginTop: 0 } }, h('span', { style: { color: 'var(--ink-2)', fontWeight: 600 } }, x.short), h('span.due', due)));
  }
  // 모르는 값은 한 번만 말한다
  const timeTxt = x.level === 'done' ? '다 했어'
    : x.need != null ? `남은 약 ${fmtDur(x.need)}${x.extra >= 10 ? ` · 계획보다 ${fmtDur(x.extra)} 더` : x.saved >= 10 ? ` · ${fmtDur(x.saved)} 여유 가능` : ''}`
    : x.total || x.left != null ? '시간 미정 · 블록을 잡으면 계산돼' : '분량·시간 미정';
  return h('div.hw', { role: 'button', tabindex: '0', 'data-lv': x.level, 'data-urg': x.urgency, 'aria-label': `${x.short}, ${LEVEL[x.level].label}, ${cnt}`, onclick: () => openHw(x), onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); openHw(x); } } },
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
      h('div.t', { style: { flex: 1, minWidth: 0 } }, x.short),
      action || null),
    h('div.row',
      x.total ? h('div.pbar', h('i', { style: { width: pct + '%', '--c': subjVar(x.subject) } })) : null,
      cnt ? h('span.cnt', cnt) : null),
    h('div.info', h('span', timeTxt), h('span', h('span.due', due), x.level !== 'unknown' ? ['  ', h('span.lvl', lv.label)] : null)));
}

// TODAY: 남은 시간을 블록으로
function todayView() {
  const t = R.today_;
  const todayEnd = t.end;
  const work = R.timelineToday.filter((p) => p.start < todayEnd);
  const segs = work.map((p) => ({ min: (Math.min(p.end, todayEnd) - p.start) / 60000, k: p.task.source === 'homework' ? 'k-extra' : 'k-' + (SUBJECTS[p.task.subject] ? p.task.subject : 'other'), label: p.task.title }));
  const placed = segs.reduce((a, s) => a + s.min, 0);
  segs.push({ min: Math.max(0, t.freeMin - placed), k: 'k-free', label: '여유' });
  const subjects = [...new Set(work.map((p) => (p.task.source === 'homework' ? 'extra' : p.task.subject)))];
  W.today.sub.textContent = R.sleeping ? '쉬는 시간' : `남은 ${hm(t.freeMin)}`;

  const doneToday = R.state.tasks.filter((x) => x.source === 'plan' && x.status === 'done' && x.date === TODAY);
  const lo = roundTo(t.slack.lo, 5), hi = roundTo(t.slack.hi, 5);
  const out = [
    h('div.eyebrow', R.sleeping ? 'REST' : '오늘 남은 시간'),
    h('div', { style: { marginTop: '10px' } }, blocks(segs)),
    h('div.legend',
      subjects.map((s) => s === 'extra' ? h('span', h('i.k-extra'), '추가 필요') : h('span', h('i', { style: { background: subjVar(s) } }), SUBJECTS[s]?.label ?? '기타')),
      h('span', h('i', { style: { background: 'rgba(20,24,31,0.06)' } }), '여유')),
    h('p.small.faint', { style: { margin: '6px 0 0' } }, `가용 ${hm(t.freeMin)} · 배치 ${hm(t.work.exp)} · 여유 ${lo === hi ? hm(lo) : `${hm(lo)}~${hm(hi)}`} · 취침 ${fmtTime(t.end)}`),
  ];
  const dl = R.delay;
  if (!R.sleeping && dl.per) {
    const [rLo, rHi] = dl.reviewLossRange, [hLo, hHi] = dl.hardRange;
    const txt = dl.severity === 'none' ? '큰 영향 없음' : hHi > 1 ? `마감 ${fmtLoss(hLo, dl.per.exp.hardDiff, hHi)} 부족` : `복습 ${fmtLoss(rLo, dl.per.exp.reviewLoss, rHi)} 감소`;
    out.push(h('div.delay', { 'data-sev': dl.severity, style: { marginTop: '12px' } }, h('span', `${R.state.settings.delayMin}분 미루면`), h('b', txt)));
  }
  // 오늘 배치
  const fixed = R.days[0].busy.filter((b) => b.end > R.now);
  const rows = [
    ...work.map((p) => ({ s: p.start, p })),
    ...fixed.map((b) => ({ s: Math.max(b.start, R.now), b })),
  ].sort((a, b) => a.s - b.s);
  out.push(h('div.sec', h('div.sec-h', h('h3', R.sleeping ? '다음 날 계획' : '오늘 배치'), h('span.small.muted', '엔진 추천 순서')),
    rows.length
      ? h('ul.tl', rows.map((r) => r.b
          ? h('li.fixed', h('span.tm', fmtTime(r.s)), h('span.tt', r.b.label), h('span.rt', `~${fmtTime(r.b.end)}`))
          : h('li.clickable', { onclick: () => (r.p.task.source === 'homework' ? openHw(HWBY.get(r.p.task.hwId.slice(3))) : openTask(r.p.taskId)) },
              h('span.tm', fmtTime(r.p.start)),
              h('span.tt', r.p.task.title),
              h('span.rt', hm((r.p.end - r.p.start) / 60000)),
              h('span.sb', blocks([{ min: (r.p.end - r.p.start) / 60000, k: r.p.task.source === 'homework' ? 'k-extra' : 'k-' + (SUBJECTS[r.p.task.subject] ? r.p.task.subject : 'other') }], { size: 'xs' }),
                rowNote(r.p)))))
      : h('p.small.muted', '오늘 남은 작업이 없어.')));
  // 오늘 끝낸 블록: 계획 vs 실제 (더 걸린 시간을 낭비로 보지 않는다)
  if (doneToday.length) {
    out.push(h('div.sec', h('div.sec-h', h('h3', '오늘 끝낸 블록')),
      h('ul.tl', doneToday.map((x) => {
        const plan = x.planMin || estimateOf(x), act = x.actual;
        const segsD = act == null ? [{ min: plan, k: 'k-done' }]
          : act <= plan ? [{ min: act, k: 'k-done' }, { min: plan - act, k: 'k-saved' }]
          : [{ min: plan, k: 'k-done' }, { min: act - plan, k: 'k-over' }];
        const note = act == null ? `계획 ${hm(plan)} · 실제 시간 기록 없음`
          : act < plan - 2 ? `계획 ${hm(plan)} → ${hm(act)} · ${fmtDur(plan - act)} 여유 생김`
          : act > plan + 2 ? `계획 ${hm(plan)} → ${hm(act)} · ${fmtDur(act - plan)} 더 씀 (난도·개념 확인일 수 있어)`
          : `계획대로 ${hm(act)}`;
        return h('li', h('span.tm', '✓'), h('span.tt', x.title), h('span.rt', ''), h('span.sb', blocks(segsD, { size: 'xs' }), note));
      }))));
  }
  if (R.exam.active) out.push(needsView());
  out.push(weekView());
  return out;
}
function rowNote(p) {
  const t = p.task;
  if (t.source === 'homework') return '계획 블록 밖에서 더 필요한 시간';
  const bits = [];
  if (remainingOf(t) !== estimateOf(t)) bits.push(`남은 ${hm(remainingOf(t))} / 계획 ${hm(estimateOf(t))}`);
  if (t.hwIds?.length) bits.push(`숙제 ${t.hwIds.length}`);
  if (t.source === 'projects') bits.push('장부');
  return bits.join(' · ');
}

function needsView() {
  const max = Math.max(1, ...R.needs.map((n) => n.pending || n.minutes / 30));
  return h('div.sec', h('div.sec-h', h('h3', `${R.exam.exam.name} 필요도`), h('span.small.muted', '남은 공부량 기준')),
    R.needs.map((n) => h('div', { style: { display: 'grid', gridTemplateColumns: '52px 1fr auto', gap: '10px', alignItems: 'center', padding: '4px 0' } },
      pill(n.subject),
      h('div.pbar.thin', h('i', { style: { width: `${((n.pending || n.minutes / 30) / max) * 100}%`, '--c': subjVar(n.subject) } })),
      h('span.small.muted', [n.pending ? `${n.pending}개` : '', n.minutes ? hm(n.minutes) : ''].filter(Boolean).join(' · ') || '—'))));
}

function weekView() {
  const max = Math.max(60, ...R.week.map((d) => d.freeMin));
  return h('div.sec', h('div.sec-h', h('h3', '7일'), h('span.small.muted', '가용 · 배치')),
    h('div.week', R.week.map((d) => {
      const wd = weekdayOf(d.date);
      const dues = HW.filter((x) => x.date === d.date && x.level !== 'done').length;
      return h('div.wk', { title: `${shortDate(d.date)} 가용 ${hm(d.freeMin)} · 배치 ${hm(d.workMin)}` },
        h('div.colb', h('i.fr', { style: { height: `${(d.freeMin / max) * 100}%` } }), h('i.wo', { style: { height: `${(Math.min(d.workMin, d.freeMin) / max) * 100}%` } })),
        h('div.lb', { class: wd === 0 || wd === 6 ? 'we' : '' }, d.date === TODAY ? '오늘' : weekdayLabel(wd)),
        h('div.du', dues ? `마감 ${dues}` : ''));
    })));
}

// DEADLINES: 소속별(기본) 또는 마감순
function deadlinesView() {
  const active = HW.filter((x) => x.level !== 'done' || x.date >= TODAY);
  W.deadlines.sub.textContent = `${active.filter((x) => x.level !== 'done').length}개`;
  const seg = h('div.seg', { style: { marginBottom: '10px' } },
    [['group', '소속별'], ['due', '마감순']].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(LAYOUT.dl === v), onclick: () => { LAYOUT.dl = v; saveLayout(); render(); } }, l)));
  if (!active.length) return [seg, h('p.lead.muted', events == null ? '일정 불러오는 중…' : '남은 숙제가 없어. 일정 앱에 할 일·마감으로 들어온 숙제가 여기 모여.')];
  if (LAYOUT.dl === 'due') return [seg, ...[...active].sort((a, b) => a.due - b.due).map((x) => hwItem(x))];
  return [seg, ...groupHomework(active).map((g) => {
    const need = g.need ? `약 ${fmtDur(g.need)}` : '';
    return h('div.grp', { 'data-lv': g.worst },
      h('div.grp-h', h('span.dot'), h('b', g.label), h('span.sum', [need, `${g.items.length}개`, g.unknown ? `${g.unknown}개 시간 미정` : ''].filter(Boolean).join(' · '))),
      g.items.map((x) => hwItem(x)));
  }), h('p.small.faint', { style: { marginTop: '12px' } }, '색이 진할수록 남은 작업에 비해 마감 전 시간이 모자라. 바탕이 진할수록 마감이 가까워.')];
}

// 설정
function seg(options, value, onPick) {
  return h('div.seg', options.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(String(v) === String(value)), onclick: () => onPick(v) }, label)));
}
function settingsView() {
  const s = L.settings;
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  const cal = META.calibration;
  const unc = R.state.settings.uncertainty;
  let newName = '', newDate = '';
  return [
    h('p.small.muted', `취침 시각 이후로는 배치하지 않아. 학교·점심 고정 블록은 15577, 학원 일정은 일정 앱에서 읽어. '${STUDY_EVENTS.join(', ')}'이 든 일정은 공부할 수 있는 시간으로 봐.`),
    ORDER.map((wd) => h('div.sleep',
      h('b', { style: { color: wd === 0 || wd === 6 ? 'var(--red)' : '' } }, weekdayLabel(wd)),
      h('input.in', { type: 'time', value: s.days[wd].wake, 'aria-label': `${weekdayLabel(wd)} 기상`, onchange: (e) => e.target.value && ((s.days[wd] = { ...s.days[wd], wake: e.target.value }), save()) }),
      h('span.muted', '→'),
      h('input.in', { type: 'time', value: s.days[wd].sleep, 'aria-label': `${weekdayLabel(wd)} 취침`, onchange: (e) => e.target.value && ((s.days[wd] = { ...s.days[wd], sleep: e.target.value }), save()) }))),
    h('div.set', h('span', '시험'), h('span.small.muted', `D-${s.examModeDays}부터 시험 집중`)),
    R.state.settings.exams.map((e) => h('div.set', h('span', h('b', e.name), h('span.small.muted', ` ${shortDate(e.date)}${e.from ? ' · 15577 D-day' : ''}`)),
      !e.from && h('button.btn.sm', { type: 'button', onclick: () => { s.exams = s.exams.filter((x) => x.id !== e.id); save(); } }, '삭제'))),
    h('div.grid2', { style: { marginTop: '6px' } }, h('input.in', { placeholder: '시험 이름', oninput: (e) => (newName = e.target.value) }), h('input.in', { type: 'date', oninput: (e) => (newDate = e.target.value) })),
    h('button.btn.sm', { type: 'button', style: { marginTop: '8px' }, onclick: () => {
      if (!newName.trim() || !newDate) return toast('시험 이름과 날짜를 넣어 줘.');
      s.exams = [...(s.exams || []), { id: 'e' + Date.now().toString(36), name: newName.trim(), date: newDate, subjects: [] }];
      save();
    } }, '시험 추가'),
    h('div.set', h('span', '지연 시뮬레이션'), seg([[15, '15분'], [30, '30분'], [60, '60분']], s.delayMin, (v) => ((s.delayMin = v), save()))),
    h('div.set', h('span', '시험 직전 (복습 우선)'), seg([[3, 'D-3'], [7, 'D-7'], [10, 'D-10']], s.nearExamDays, (v) => ((s.nearExamDays = v), save()))),
    h('div.set', h('span', '지연 경고 기준'), seg([[10, '10분'], [15, '15분'], [30, '30분']], s.thresholds.reviewLossMin, (v) => ((s.thresholds = { ...s.thresholds, reviewLossMin: v }), save()))),
    h('div.set', h('span', '과목별 소요 시간 오차'), h('span.small.muted', '15577 예상→실제 기록 5건부터 자동 보정')),
    Object.keys(SUBJECTS).map((k) => {
      const [lo, hi] = unc[k], c = cal[k];
      return h('div', { style: { display: 'grid', gridTemplateColumns: '52px 1fr', gap: '2px 10px', padding: '4px 0', fontSize: '13px' } },
        pill(k), h('span', `${Math.round(lo * 100)}% ~ +${Math.round(hi * 100)}%`),
        h('span.small.muted', { style: { gridColumn: '2' } }, c ? `${c.calibrated ? '기록으로 보정' : '임시값'} · 기록 ${c.n}건 · 평균 ${Math.round(c.mean * 100)}%` : '임시값 · 기록 없음'));
    }),
  ];
}

// ───────── 시트 ─────────
function openSheet(title, body) {
  closeSheet(true);
  const scrim = h('div.scrim', { onclick: () => closeSheet() });
  const sheet = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.sh', h('h2', title), h('button.x', { type: 'button', 'aria-label': '닫기', onclick: () => closeSheet() }, '✕')), body);
  document.body.append(scrim, sheet);
  sheetOpen = { scrim, sheet };
}
function closeSheet(silent) {
  if (!sheetOpen) return false;
  sheetOpen.scrim.remove();
  sheetOpen.sheet.remove();
  sheetOpen = null;
  if (!silent) render();
  return true;
}
Sabathia.back = () => closeSheet() || (LAYOUT.focus ? (toggleFocus(LAYOUT.focus), true) : false);
addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!closeSheet() && LAYOUT.focus) toggleFocus(LAYOUT.focus); } });

function chips(options, value, onPick) {
  const wrap = h('div.chips');
  const paint = (v) => wrap.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  for (const [v, label] of options) wrap.append(h('button.chip', { type: 'button', 'data-v': String(v), onclick: () => { paint(v); onPick(v); } }, label));
  paint(value);
  return wrap;
}
function stepper(start, onChange, steps = [-10, 10, 30]) {
  let v = start;
  const out = h('output', String(v));
  const step = (n) => { v = Math.max(0, v + n); out.textContent = String(v); onChange(v); };
  return h('div.stepper', h('button.chip', { type: 'button', onclick: () => step(steps[0]) }, String(steps[0]).replace('-', '−')), out,
    ...steps.slice(1).map((n) => h('button.chip', { type: 'button', onclick: () => step(n) }, '+' + n)));
}

// 숙제 상세: 분량 해석 · 진행 기록 · 남은 시간 근거
function openHw(x) {
  if (!x) return;
  const o = L.ov[x.id] || {};
  let total = o.total || x.total || 0, est = o.estimateMin || 0;
  const body = [
    h('div.meta', pill(x.subject), h('span', x.group.label), h('span', `${relDayLabel(x.date, TODAY)}${x.time ? ' ' + x.time : ''}까지`), h('span.lvl', { style: { color: `var(--lv)` }, 'data-lv': x.level }, LEVEL[x.level].label)),
    x.total ? h('div', { style: { marginTop: '12px' } }, h('div.pbar', h('i', { style: { width: `${(x.solved / x.total) * 100}%`, '--c': subjVar(x.subject) } })),
      h('div.small.muted', { style: { marginTop: '4px' } }, `${x.solved} / ${x.total}${x.count?.unit === '쪽' ? '쪽' : '문제'} · ${Math.round((x.solved / x.total) * 1000) / 10}%${x.progressSource ? ' · ' + x.progressSource : ''}`)) : null,
    h('dl.kv',
      h('dt', '분량'), h('dd', x.count ? `${x.count.n}${x.count.unit}${x.count.certain ? '' : ' (확인 필요)'} — ${x.count.why}` : x.left != null ? `메모 기준 ${x.left}문제 남음` : '제목에서 분량을 못 찾았어'),
      h('dt', '남은 시간'), h('dd', x.need != null ? `약 ${fmtDur(x.need)} · ${x.needSource}` : '모름 (계획 블록·기록이 없음)'),
      h('dt', '계획 블록'), h('dd', x.blocks.length ? `${x.blocks.length}개 · 앞으로 ${fmtDur(x.plannedFuture)}` : '없음'),
      x.obsPace ? [h('dt', '실제 속도'), h('dd', `1${x.count?.unit === '쪽' ? '쪽' : '문제'}당 약 ${x.obsPace.toFixed(1)}분 (끝낸 블록 기준)`)] : null,
      x.extra >= 10 ? [h('dt', '계획 밖'), h('dd', `약 ${fmtDur(x.extra)} 더 필요해 보여. 블록은 고치지 않았어.`)] : null,
      h('dt', '마감 전 가용'), h('dd', `${fmtDur(x.freeBefore)} (이 마감까지 끝낼 작업 비중 ${Number.isFinite(x.load) ? Math.round(x.load * 100) + '%' : '—'})`)),
    x.sessions.length ? h('div.f', h('span', '15577 기록'), x.sessions.map((s) => h('div.small', `${relDayLabel(s.date, TODAY)} · ${s.n}개${s.done && s.actual ? ` · ${s.actual}분 블록` : s.done ? '' : ' · 진행 중'}`))) : null,
    h('div.f', h('span', '전체 문제 수 고치기 (제목과 다를 때만)'), stepper(total, (v) => (total = v), [-10, 1, 10])),
    h('div.f', h('span', '남은 시간 직접 넣기 (선택, 0이면 자동)'), stepper(est, (v) => (est = v), [-10, 10, 30])),
    h('div.acts', { style: { marginTop: '18px', justifyContent: 'flex-end' } },
      h('a.btn', { href: '/schedule/' }, '일정 열기'),
      h('button.btn', { type: 'button', onclick: () => { closeSheet(true); openPlan(`add=1&hw=${encodeURIComponent(x.evId)}&date=${TODAY}`); } }, '15577 블록 만들기'),
      h('button.btn.pri', { type: 'button', onclick: () => { closeSheet(true); setOv(x.id, { total: total && total !== x.count?.n ? total : null, estimateMin: est || null }); toast('저장했어.'); } }, '저장')),
  ];
  openSheet(x.short, body);
}

// 블록에 숙제 고르기 → 15577 시트로 연결
function openPicker(t) {
  const list = suggestFor(t);
  openSheet('숙제 고르기', [
    h('p.small.muted', `${t.title} (${t.start}–${t.end}) 블록에 연결할 숙제. 고르면 15577 시트가 열리고, 저장하면 연결돼.`),
    list.length ? list.map((x) => h('div', { style: { marginTop: '6px' } }, hwItem(x, { action: h('button.btn.sm.pri', { type: 'button', onclick: (e) => { e.stopPropagation(); closeSheet(true); linkAndOpen(t, x); render(); } }, '연결') })))
      : h('p.lead.muted', '남은 숙제가 없어.'),
  ]);
}

// 블록의 판단 보정 (남은 시간 · 종류 · 직접 마감 · 프로젝트 값)
function openTask(id) {
  const t = taskOf(id);
  if (!t) return;
  const est = estimateOf(t), base = remainingOf(t) || est;
  let remain = base, reason = null;
  const ov = L.ov[id] || {};
  let dl = ov.deadline || '', dlt = ov.deadlineTime || '';
  const note = h('p.note');
  const paint = () => {
    const d = remain - base;
    note.textContent = d > 0 && reason === 'concept' ? '늘어난 시간은 일정 비용으로 계산하지만, 개념을 다시 본 시간은 학습으로 기록해.' : d > 0 ? '늘어난 만큼 뒤 일정의 가능 시간이 줄어 (일정 비용).' : d < 0 ? '줄어든 만큼 여유가 생겨.' : '';
  };
  openSheet(t.title, [
    h('div.meta', pill(t.subject), h('span', t.lite || KINDS[t.kind]), t.start && h('span', `${t.start}–${t.end}`), h('span', t.source === 'plan' ? '15577' : t.source)),
    t.source === 'plan' && h('p.small.muted', { style: { marginTop: '8px' } }, '완료·진행률·블록 시간·푼 문제 수는 15577에서 바꿔. 여기 값은 판단에만 써.'),
    t.status !== 'done' && h('div.f', h('span', `남은 필요 시간 · 계획 ${fmtDur(est)}`), stepper(base, (v) => { remain = v; paint(); }),
      chips([['difficulty', '문제가 어려움'], ['concept', '개념 다시 확인'], ['faster', '생각보다 빠름'], ['other', '기타']], null, (v) => { reason = v; paint(); }), note),
    t.hwIds?.length ? h('div.f', h('span', '마감'), h('span.small.muted', '연결된 숙제의 가장 이른 마감을 써.')) : h('div.f', h('span', '마감 직접 입력 (선택)'),
      h('div.grid2', h('input.in', { type: 'date', value: dl, oninput: (e) => (dl = e.target.value) }), h('input.in', { type: 'time', value: dlt, oninput: (e) => (dlt = e.target.value) }))),
    h('div.f', h('span', '종류'), chips(Object.entries(KINDS), ov.kind || t.kind, (v) => (ov.kind = v))),
    t.kind === 'project' && h('div.f', h('span', '장기 가치 · 실사용'),
      chips([[1, '가치 낮음'], [2, '보통'], [3, '높음']], ov.value ?? 2, (v) => (ov.value = v)),
      chips([[1, '쓸 일 적음'], [2, '보통'], [3, '자주 씀']], ov.usage ?? 2, (v) => (ov.usage = v))),
    h('div.acts', { style: { marginTop: '18px', justifyContent: 'flex-end' } },
      t.source === 'plan' && h('button.btn', { type: 'button', onclick: () => { closeSheet(true); openPlan(`block=${t.id.slice(2)}`); } }, '15577 열기'),
      h('button.btn.pri', { type: 'button', onclick: () => {
        const patch = { kind: ov.kind ?? null, deadline: dl || null, deadlineTime: dl && dlt ? dlt : null };
        if (t.kind === 'project') Object.assign(patch, { value: ov.value ?? null, usage: ov.usage ?? null });
        if (remain !== base) {
          if (t.source === 'projects' && t.estimateGuessed) patch.estimateMin = remain; else patch.remainingMin = remain;
          L.log.push({ at: Date.now(), id, subject: t.subject, kind: t.kind, estimate: est, from: base, to: remain, scheduleCostMin: remain - base, learning: reason === 'concept', reason: reason || 'other' });
          if (L.log.length > 300) L.log.splice(0, L.log.length - 300);
        }
        closeSheet(true);
        setOv(id, patch);
        toast(remain !== base ? '남은 시간을 반영해서 다시 계산했어.' : '저장했어.');
      } }, '저장')),
  ]);
}

// ───────── 홈 아이콘 보고 ─────────
function report() {
  Sabathia.report('decide', { mode: R.mode, title: R.card.title, badge: HW.filter((x) => x.level === 'danger').length, pct: 0 });
}

// ───────── 시작 ─────────
arrange();
document.querySelectorAll('.win').forEach((w) => w.classList.add('enter'));
loadEvents();
setInterval(() => { if (document.visibilityState === 'visible') render(); }, 30_000);
setInterval(() => { if (document.visibilityState === 'visible') loadEvents(); }, 120_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { L = loadLocal(); loadEvents(); } });
// PLANNER 창(15577)에서 기록하면 localStorage가 바뀌고 storage 이벤트로 바로 다시 계산한다
addEventListener('storage', (e) => { if (['blockplanner.v1', 'projects.v1', 'exam.v1', 'sab.cache', LS].includes(e.key)) { L = loadLocal(); render(); } });
