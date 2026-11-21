// Sabathia WS — Planner 2.0 (2026-11-21). 화면: 주간 타임라인(위) · 일간 타임박싱(가운데) · 마감 사이드바(오른쪽) · 계획 세우기(아래).
//   NOW 창·첫 화면 안내는 없앴다. 지금 시각은 일간 플래너 위의 가로선 하나로만 보인다.
//   데이터
//     15577 기록(blockplanner.v1)  = 시간 블록(TimeBlock). 같은 주소의 15577과 한 기록이다(tb/blocks.js, tb/store.js)
//     Planner 문서(sabathia.plan.v1) = 작업·Big 3·수정안·블록 연결(tb/tasks.js). /api/plan/sync로 기기 간 합침
//     Sabathia 일정(/api/events)    = 마감·할 일(작업이 됨)과 시각 있는 일정(고정 일정이 됨). 읽기만
//     판단 엔진(engine/decide.js)   = 마감 위험(가능한 시간을 다 써도 부족한지)
//   원칙: 다른 블록을 사용자가 승인하기 전에 움직이지 않는다. 실제 시간을 모르면 적지 않는다. AI 호출 없음(규칙 기반).
import { mountCity } from './city.js';
import { decide } from './engine/decide.js';
import { DEFAULT_SETTINGS } from './engine/config.js';
import { toDateStr } from './engine/time.js';
import { buildState } from './sources.js';
import * as MU from './must.js';
import * as B from './tb/blocks.js';
import * as TK from './tb/tasks.js';
import * as PL from './tb/plan.js';
import * as ST from './tb/store.js';

// ---------- 아이콘 ----------
const IC = {
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>', shrink: '<path d="M4 14h6v6M20 10h-6V4M10 14l-6.5 6.5M14 10l6.5-6.5"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
};
const ic = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const paintIcons = (root = document) => root.querySelectorAll('[data-ic]').forEach((el) => (el.outerHTML = ic(el.dataset.ic)));
paintIcons();

// ---------- 시각 ----------
const q = new URLSearchParams(location.search);
const pinned = q.get('now') ? new Date(q.get('now')).getTime() : NaN;
const T0 = Date.now();
const nowMs = () => (Number.isFinite(pinned) ? pinned + (Date.now() - T0) : Date.now());

// ---------- 도우미 ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r5 = (v) => Math.round(v / 5) * 5;
const dur = (m) => { m = Math.max(0, Math.round(m)); if (m < 60) return `${m}분`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h}시간 ${r}분` : `${h}시간`; };
const hmm = (m) => { m = Math.max(0, Math.round(m)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const WK = '일월화수목금토';
const md = (k) => { const [, m, d] = k.split('-').map(Number); return `${m}/${d}`; };
const mdw = (k) => `${md(k)} ${WK[B.weekday(k)]}`;
const json = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const SUBJ = Object.fromEntries(B.SUBJECTS.map((s) => [s.id, s]));
const colorOf = (subj) => B.subjectColor(subj, (TK.get(DOC, 'cfg', 'colors') || {}).map || {});

// ---------- 데이터 ----------
const LS = 'decide.v1';
const DEFAULT_EXAMS = [{ id: 'final-2026-2', name: '2학기 기말고사', date: '2026-12-10', subjects: [] }];
function loadLocal() {
  const raw = json(LS) || {};
  const settings = { ...structuredClone(DEFAULT_SETTINGS), ...(raw.settings || {}) };
  settings.thresholds = { ...DEFAULT_SETTINGS.thresholds, ...(raw.settings?.thresholds || {}) };
  if (!raw.settings) settings.exams = structuredClone(DEFAULT_EXAMS);
  return { settings, ov: raw.ov || {}, log: raw.log || [] };
}
let P = ST.loadP();            // 15577 기록 (없을 수 있음)
let DOC = ST.loadDoc();        // Planner 문서
let EVENTS = null;             // 일정 (null = 아직)
let pReady = !ST.cloudId();    // 15577 온라인 기록과 맞췄는지
let R, TODAY, SET, D, NOWMIN, DL = [], ENGRISK = new Map();
const PV = () => P || B.ensureP(null);

async function loadEvents() {
  try { EVENTS = window.SabathiaToday ? await SabathiaToday.events() : []; } catch { EVENTS = []; }
  render();
}
const evList = () => EVENTS || (json('sab.cache') || {}).events || [];

function compute() {
  const now = nowMs();
  const local = loadLocal();
  // 판단 엔진도 블록 ↔ 일정 연결을 알게 한다 (decide.v1에는 쓰지 않음)
  const ov = { ...local.ov };
  for (const l of TK.live(DOC, 'links')) if (l.task && l.task.startsWith('ev:')) ov['p:' + l.id] = { ...(ov['p:' + l.id] || {}), link: l.task };
  const { state } = buildState({ plan: P, events: evList(), projects: json('projects.v1'), examDoc: json('exam.v1'), local: { ...local, ov }, today: toDateStr(now) });
  R = decide(state, now);
  TODAY = R.today;
  SET = state.settings;
  const [y, m, d] = TODAY.split('-').map(Number);
  NOWMIN = Math.round((now - new Date(y, m - 1, d).getTime()) / 60000);
  D = TK.deriveTasks({ doc: DOC, P: PV(), events: EVENTS ?? (json('sab.cache') || {}).events ?? null, ov: local.ov, today: TODAY });
  // 엔진 위험 → 작업별
  ENGRISK = new Map();
  const add = (eid, k, v) => {
    const tid = eid.startsWith('p:') ? D.blockTask.get(eid.slice(2)) || eid : eid;
    const cur = ENGRISK.get(tid) || { exp: 0, high: 0 };
    cur[k] = Math.max(cur[k], v); ENGRISK.set(tid, cur);
  };
  for (const r of R.risks.exp) { add(r.task.id, 'exp', r.exp); add(r.task.id, 'high', r.high); if (r.task.link) add(r.task.link, 'exp', r.exp); }
  for (const r of R.risks.highOnly) { add(r.task.id, 'high', r.high); if (r.task.link) add(r.task.link, 'high', r.high); }
  // 마감 목록 (21일 안, 끝나지 않은 것)
  const freeCache = new Map();
  const lim = B.addDays(TODAY, 21);
  DL = D.tasks.filter((t) => t.deadline && t.status === 'todo' && t.deadline <= lim).map((t) => {
    const key = t.deadline + '|' + (t.deadlineTime || '');
    if (!freeCache.has(key)) freeCache.set(key, PL.freeUntil({ P: PV(), events: evList(), settings: SET, today: TODAY, nowMin: NOWMIN, deadline: t.deadline, deadlineTime: t.deadlineTime, now }));
    return { t, info: TK.deadlineInfo(t, { today: TODAY, free: freeCache.get(key), eng: ENGRISK.get(t.id) || null }) };
  }).sort((a, b) => a.t.deadline.localeCompare(b.t.deadline) || (a.t.deadlineTime || '99').localeCompare(b.t.deadlineTime || '99'));
}

// ---------- 화면 상태 ----------
const S = {
  mode: 'organized', day: null, dlOpen: false, dlSel: null, sel: null, pick: null, tray: false, step: 1,
  free: null, hide: new Set(), b3sel: {}, alloc: null,
};
const LAYOUT_KEY = 'sabathia.ws.layout2';
try { const L = json(LAYOUT_KEY); if (L) { if (L.mode) S.mode = L.mode; if (L.free && L.form) S._saved = L; } } catch {}
const saveLayout = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify({ mode: S.mode, free: S.free, form: FORM })); } catch {} };

// ---------- 무대 크기 (화면 비율에 맞춤) ----------
let W = 1366, VH = 1024, FORM = 'wide', scale = 1;
function measure() {
  const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight || vw;
  if (vw >= vh * 1.05 && vw >= 900) { FORM = 'wide'; scale = Math.min(vw / 1180, vh / 760, vh > 1100 ? vh / 1100 : 1); if (vw / scale < 1100) scale = vw / 1100; }
  else { FORM = vw < 600 ? 'phone' : 'tall'; scale = Math.min(1, vw / (FORM === 'phone' ? 360 : 700)); }
  scale = Math.min(scale, 1.35);
  W = Math.round(vw / scale); VH = Math.round(vh / scale);
}
const stage = $('#stage');
const PAD = 16, GAP = 12;
const TOPY = () => (FORM === 'phone' ? 64 : 72);
function orgRects() {
  const top = TOPY(), barH = 58, bottom = VH - PAD - barH - 10;
  if (FORM === 'wide') {
    const wkH = 150, y2 = top + wkH + GAP, dlC = W >= 1250 ? 330 : 300;
    const dlW = S.dlOpen ? clamp(Math.round(W * 0.54), 560, 760) : dlC;
    return { week: { x: PAD, y: top, w: W - 2 * PAD, h: wkH }, day: { x: PAD, y: y2, w: W - 2 * PAD - dlC + 44, h: bottom - y2 }, dl: { x: W - PAD - dlW, y: y2, w: dlW, h: bottom - y2 } };
  }
  if (FORM === 'tall') {
    const wkH = 176, y2 = top + wkH + GAP, rail = 78;
    const dlW = S.dlOpen ? Math.min(W - 2 * PAD - 30, 600) : rail;
    return { week: { x: PAD, y: top, w: W - 2 * PAD, h: wkH }, day: { x: PAD, y: y2, w: W - 2 * PAD - rail + 26, h: bottom - y2 }, dl: { x: W - PAD - dlW, y: y2, w: dlW, h: bottom - y2 } };
  }
  const wkH = 176, sy = top + wkH + 8, stripH = 50, y2 = sy + stripH + 8;
  return { week: { x: 8, y: top, w: W - 16, h: wkH }, day: { x: 8, y: y2, w: W - 16, h: bottom - y2 }, dl: S.dlOpen ? { x: 8, y: sy, w: W - 16, h: bottom - sy } : { x: 8, y: sy, w: W - 16, h: stripH } };
}
const panel = (id) => document.getElementById('p-' + id);
const IDS = ['week', 'day', 'dl'];
function freeDefault() {
  const o = orgRects();
  const r = Object.fromEntries(IDS.map((id) => [id, { ...o[id] }]));
  // 정돈 모드에선 사이드바 곡면이 플래너 오른쪽을 살짝 덮는다. 자유 모드에선 겹치지 않게
  if (FORM !== 'phone') r.day.w = o.dl.x - GAP - o.day.x;
  return r;
}
function applyLayout() {
  if (FORM === 'phone' && S.mode === 'free') S.mode = 'organized';
  stage.className = `${S.mode} f-${FORM}`;
  if (!S.free) S.free = freeDefault();
  const o = S.mode === 'organized' ? orgRects() : null;
  for (const id of IDS) {
    let r = o ? o[id] : S.free[id];
    if (!o && id === 'dl' && S.dlOpen) r = { ...r, w: Math.max(r.w, Math.min(640, W - r.x - 8)) };
    Object.assign(panel(id).style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  }
  panel('dl').classList.toggle('open', S.dlOpen);
  $('#dlToggle').setAttribute('aria-expanded', String(S.dlOpen));
  $('#dlToggle').innerHTML = ic(S.dlOpen ? 'shrink' : 'expand');
  const bar = $('#planbar');
  bar.style.top = VH - PAD - 58 + 'px';
  document.querySelectorAll('[data-act="mode"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  $('#resetBtn').hidden = S.mode !== 'free';
  Object.assign(stage.style, { width: W + 'px', height: VH + 'px', transform: scale === 1 ? 'none' : `scale(${scale})` });
  saveLayout();
}
function fit() {
  const was = FORM;
  measure();
  if (S._saved) { const L = S._saved; delete S._saved; if (L.form === FORM) S.free = { ...freeDefault(), ...L.free }; }
  else if (was !== FORM || !S.free) S.free = freeDefault();
  for (const id of IDS) { const r = S.free[id]; r.w = Math.min(r.w, W - 8); r.h = Math.min(r.h, VH - 80); r.x = clamp(r.x, 0, W - r.w); r.y = clamp(r.y, TOPY() - 8, VH - 80); }
}

// ---------- 배경 ----------
if (/city/.test(location.hash)) mountCity($('#city'), nowMs);
else {
  const bg = new Image();
  bg.className = 'ws-bg'; bg.alt = ''; bg.draggable = false; bg.decoding = 'async';
  bg.src = new URL('./bg.webp', import.meta.url).href;
  $('#city').replaceWith(bg);
}

// ---------- 저장 · 되돌리기 ----------
let undoSnap = null;
function snapshot() { return { P: P ? JSON.stringify({ days: P.days, log: P.log }) : null, DOC: JSON.stringify(DOC) }; }
/** 15577 기록을 고친다. 고치기 전 상태를 남겨 '되돌리기'를 할 수 있게 한다 */
function mutate(fn, msg, { undo = true } = {}) {
  if (!P) {
    if (!pReady) { toast('15577 온라인 기록을 불러오는 중이에요. 잠시 뒤 다시 해 주세요'); return false; }
    P = B.ensureP(null);
  }
  const snap = snapshot();
  const r = fn(P, DOC);
  if (r === false) return false;
  ST.saveP(P); ST.saveDoc(DOC, render);
  undoSnap = undo ? snap : null;
  render();
  if (msg) toast(msg, undo ? { label: '되돌리기', fn: doUndo } : null);
  return true;
}
function mutateDoc(fn, msg) {
  fn(DOC);
  ST.saveDoc(DOC, render);
  render();
  if (msg) toast(msg);
}
function doUndo() {
  if (!undoSnap) return;
  const s = undoSnap; undoSnap = null;
  if (s.P && P) { const o = JSON.parse(s.P); P.days = o.days; P.log = o.log; ST.saveP(P); }
  const d = JSON.parse(s.DOC);
  // 되돌릴 때도 고친 시각을 올려 다른 기기 것보다 늦게 만든다
  const now = Date.now();
  for (const part of ['tasks', 'big3', 'props', 'links', 'cfg']) {
    const all = new Set([...Object.keys(DOC[part]), ...Object.keys(d[part])]);
    for (const id of all) {
      const a = DOC[part][id], b = d[part][id];
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      if (b && !b.del) TK.put(DOC, part, b, now); else TK.del(DOC, part, id, now);
    }
  }
  ST.saveDoc(DOC, render);
  render(); toast('되돌렸어요');
}

let tt;
function toast(msg, action = null) {
  $('#toastMsg').textContent = msg;
  const b = $('#toastAct');
  b.hidden = !action;
  if (action) { b.textContent = action.label; b.onclick = () => { $('#toast').classList.remove('on'); action.fn(); }; }
  $('#toast').classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => $('#toast').classList.remove('on'), action ? 5000 : 2600);
}

// ---------- 공통 계산 ----------
const big3Ids = (type, start) => (TK.getBig3(DOC, type, start)?.taskIds || []);
const taskOfBlock = (bid) => D.byId.get(D.blockTask.get(bid));
function dayStats(k) {
  const blocks = B.blocksOn(PV(), k);
  const bySubj = {};
  let plan = 0, done = 0, left = 0;
  for (const b of blocks) {
    const m = B.planMin(b);
    const s = taskOfBlock(b.id)?.subject || B.subjectOf(PV(), b.cat, b.title);
    bySubj[s] = (bySubj[s] || 0) + m;
    plan += m;
    if (b.done) done += b.actual || m; else left += m;
  }
  const aw = B.awake(SET, k);
  const hard = B.busyOn(PV(), k, evList()).filter((x) => !x.soft);
  let avail = aw.e - aw.s;
  for (const h of hard) avail -= Math.max(0, Math.min(h.e, aw.e) - Math.max(h.s, aw.s));
  const free = B.freeSlots(PV(), k, evList(), SET, { fromMin: k === TODAY ? NOWMIN : 0, minLen: 15 }).reduce((s, x) => s + x.e - x.s, 0);
  return { blocks, bySubj, plan, done, left, avail: Math.max(0, avail), free: k < TODAY ? 0 : free };
}

// ---------- 주간 타임라인 ----------
function renderWeek() {
  const ws = B.weekStart(S.day), we = B.addDays(ws, 6);
  $('#weekSub').textContent = `${md(ws)} – ${md(we)}`;
  const wIds = big3Ids('weekly', ws);
  const b3rows = wIds.map((id) => D.byId.get(id)).filter(Boolean);
  const b3 = `<div class="wk-b3"><h3>Weekly Big 3<button data-act="plan" data-step="2">${b3rows.length ? '바꾸기' : '고르기'}</button></h3>
    ${b3rows.length ? b3rows.map(b3row).join('') : `<p class="b3empty">이번 주 가장 중요한 세 가지를 아직 정하지 않았어요.</p>`}</div>`;
  const stats = [];
  for (let i = 0; i < 7; i++) stats.push(dayStats(B.addDays(ws, i)));
  const maxM = Math.max(240, ...stats.map((s) => s.plan));
  const cols = stats.map((s, i) => {
    const k = B.addDays(ws, i);
    const dls = DL.filter((x) => x.t.deadline === k);
    const segs = Object.entries(s.bySubj).sort((a, b) => b[1] - a[1]).map(([sj, m]) => `<i style="--c:${colorOf(sj)};width:${(m / maxM) * 100}%" title="${esc(SUBJ[sj]?.name)} ${dur(m)}"></i>`).join('');
    const pct = s.plan ? Math.round((s.done / Math.max(s.plan, 1)) * 100) : 0;
    const label = `${mdw(k)} · 계획 ${dur(s.plan)} · 완료 ${pct}%${dls.length ? ` · 마감 ${dls.length}개` : ''}`;
    return `<button class="dcol${k === S.day ? ' sel' : ''}${k === TODAY ? ' today' : ''}${k < TODAY ? ' past' : ''}" data-act="pickday" data-day="${k}" data-drop="${k}" aria-label="${esc(label)}" aria-pressed="${k === S.day}">
      <span class="dh"><span class="w">${WK[B.weekday(k)]}</span><span class="d">${+k.slice(8)}</span>${k === TODAY ? '<span class="tt">오늘</span>' : ''}</span>
      <span class="stack" aria-hidden="true">${segs}</span>
      <span class="dm"><b>${hmm(s.plan)}</b><span>${s.plan ? `완료 ${pct}%` : k >= TODAY ? `빈 ${hmm(s.free)}` : ''}</span></span>
      <span class="ddl${dls.some((x) => x.info.level === 'risk') ? ' hasrisk' : ''}" data-n="${dls.length ? '마감 ' + dls.length : ''}">${dls.slice(0, 2).map((x) => `<span class="${x.info.level}">${x.info.level === 'risk' ? '! ' : ''}${esc(x.t.title)}</span>`).join('')}${dls.length > 2 ? `<span>+${dls.length - 2}</span>` : ''}</span>
    </button>`;
  }).join('');
  $('#b-week').innerHTML = b3 + `<div class="days">${cols}</div>`;
  $('#b3strip').innerHTML = b3rows.length
    ? b3rows.map((t) => `<button class="chip" data-act="task" data-id="${esc(t.id)}"><span class="dot" style="--c:${colorOf(t.subject)}"></span>${esc(t.title)} <span class="num">${progOf(t)}%</span></button>`).join('')
    : `<button class="chip" data-act="plan" data-step="2">주간 Big 3 고르기</button>`;
}
const progOf = (t) => (t.status === 'done' ? 100 : t.need ? Math.round((t.doneMin / t.need) * 100) : 0);
function b3row(t) {
  const p = progOf(t);
  return `<button class="b3row${t.status === 'done' ? ' done' : ''}" data-act="task" data-id="${esc(t.id)}" aria-label="${esc(t.title)} ${p}%"><span class="dot" style="--c:${colorOf(t.subject)}"></span><span class="t">${esc(t.title)}</span><span class="mini" style="--c:${colorOf(t.subject)}"><i style="width:${p}%"></i></span></button>`;
}

// ---------- 일간 타임박싱 ----------
let PXM = 1.3, T0M = 360;
const yOf = (m) => (m - T0M) * PXM + 10;
function renderDay() {
  const k = S.day, Pv = PV(), evs = evList();
  const isToday = k === TODAY;
  const [y, m, d] = k.split('-').map(Number);
  $('#dayTitle').textContent = isToday ? 'TODAY' : `${m}.${d}`;
  $('#daySub').textContent = `${m}월 ${d}일 ${WK[B.weekday(k)]}요일${isToday ? '' : k < TODAY ? ' · 지난 날' : ''}`;
  const st = dayStats(k);
  const conf = B.conflictsOn(Pv, k, evs, SET, nowMs());
  const nConf = [...conf.keys()].length;
  $('#metrics').innerHTML = `
    <span class="met"><b>${hmm(st.left)}</b><small>${isToday ? '남은 공부' : '계획'}</small></span>
    <span class="met"><b>${hmm(st.free)}</b><small>빈 시간</small></span>
    <span class="met"><b>${hmm(st.done)}</b><small>완료</small></span>
    ${nConf ? `<span class="met hot"><b>${nConf}</b><small>충돌</small></span>` : ''}`;
  const unpl = D.tasks.filter((t) => t.status === 'todo' && t.unplaced > 0 && !t.carry);
  $('#trayBtn').textContent = `미배치 ${unpl.length}`;
  $('#trayBtn').setAttribute('aria-pressed', String(S.tray));
  $('#trayBtn').classList.toggle('on', S.tray);

  // 시간 범위
  PXM = FORM === 'phone' ? 1.05 : FORM === 'tall' ? 1.2 : 1.3;
  const aw = B.awake(SET, k);
  const busy = B.busyOn(Pv, k, evs);
  const blocks = st.blocks;
  const ends = blocks.map((b) => b.start + B.lenOf(b));
  const lo = Math.min(aw.s, ...blocks.map((b) => b.start), ...busy.map((x) => x.s));
  const hi = Math.max(aw.e, ...ends, ...busy.map((x) => x.e));
  T0M = Math.max(0, Math.floor(lo / 60) * 60);
  const T1 = Math.min(B.DAY_END + 60, Math.ceil(hi / 60) * 60);
  const H = (T1 - T0M) * PXM + 24;
  let html = '';
  for (let t = T0M; t <= T1; t += 30) {
    const half = t % 60 !== 0;
    html += `<div class="hr${half ? ' half' : ''}" style="top:${yOf(t)}px"></div>`;
    if (!half) html += `<span class="hl" style="top:${yOf(t)}px">${String(Math.floor(t / 60) % 24).padStart(2, '0')}:00</span>`;
  }
  if (aw.s > T0M) html += `<div class="awk" style="top:${yOf(T0M)}px;height:${(aw.s - T0M) * PXM}px"><span style="bottom:4px">기상 전</span></div>`;
  if (aw.e < T1) html += `<div class="awk" style="top:${yOf(aw.e)}px;height:${(T1 - aw.e) * PXM}px"><span style="top:4px">취침 ${B.hm(aw.e)}</span></div>`;
  for (const f of busy) {
    const h = Math.max(16, (f.e - f.s) * PXM - 2);
    html += `<div class="fx${f.soft ? ' meal' : ''}" style="top:${yOf(f.s) + 1}px;height:${h}px" title="${esc(f.label)}"><b>${esc(f.label)}</b> <span class="num">${B.hm(f.s)}–${B.hm(f.e)}</span>${f.soft ? '' : ' · 고정'}</div>`;
  }
  // 빈 시간
  if (k >= TODAY) {
    const gaps = B.freeSlots(Pv, k, evs, SET, { fromMin: isToday ? NOWMIN : 0, minLen: 30 });
    const ghostsHere = (S.alloc?.changes || []).filter((c) => c.date === k && c.sel);
    for (const g of gaps) {
      const covered = ghostsHere.some((c) => c.start < g.e && g.s < c.start + c.dur);
      if (covered) continue;
      const h = (g.e - g.s) * PXM - 6;
      if (h < 26) continue;
      const pickT = S.pick && D.byId.get(S.pick);
      html += `<button class="gap${pickT ? ' pick' : ''}" data-act="gap" data-s="${g.s}" data-e="${g.e}" style="top:${yOf(g.s) + 3}px;height:${h}px" aria-label="빈 시간 ${B.hm(g.s)}부터 ${dur(g.e - g.s)}${pickT ? ` — ${esc(pickT.title)} 넣기` : ' — 블록 추가'}">${ic('plus', 13)}빈 시간 <span class="num">${hmm(g.e - g.s)}</span>${pickT ? ` · 여기에 ‘${esc(pickT.title)}’` : ''}</button>`;
    }
    for (const c of ghostsHere) html += `<div class="blk ghost" style="--c:${colorOf(c.subject)};top:${yOf(c.start)}px;height:${Math.max(22, c.dur * PXM - 3)}px;left:58px;right:6px"><span class="bt">${esc(c.title)}</span><span class="bmeta"><span class="num">${B.hm(c.start)}–${B.hm(c.start + c.dur)}</span> · 배치 제안</span></div>`;
  }
  // 블록 (겹치면 옆으로 나눠 보여 준다)
  const items = blocks.map((b) => ({ b, s: b.start, e: b.start + B.lenOf(b) })).sort((a, b) => a.s - b.s || a.e - b.e);
  const lanes = [];
  let cluster = [], cEnd = -1;
  const flush = () => { const n = Math.max(...cluster.map((x) => x.lane)) + 1; cluster.forEach((x) => (x.n = n)); cluster = []; };
  for (const it of items) {
    if (it.s >= cEnd && cluster.length) { flush(); lanes.length = 0; }
    let lane = lanes.findIndex((e) => e <= it.s);
    if (lane < 0) { lane = lanes.length; lanes.push(it.e); } else lanes[lane] = it.e;
    it.lane = lane; cluster.push(it); cEnd = Math.max(cEnd, it.e);
  }
  if (cluster.length) flush();
  const dB3 = big3Ids('daily', k);
  for (const it of items) html += blockHTML(it, k, conf.get(it.b.id), dB3);
  if (isToday && NOWMIN >= T0M && NOWMIN <= T1) {
    html += `<div class="nowline" style="top:${yOf(NOWMIN)}px" aria-label="지금 ${B.hm(NOWMIN)}"><span>${B.hm(NOWMIN)}</span></div>`;
  }
  const track = $('#track');
  track.style.height = H + 'px';
  track.innerHTML = html;
  if (S._scrollTo !== k) {
    S._scrollTo = k;
    const target = isToday ? NOWMIN - 90 : (blocks[0]?.start ?? aw.s) - 30;
    $('#tscroll').scrollTop = Math.max(0, yOf(target));
  }
  renderProp();
  renderSide();
}
function blockHTML(it, k, cf, dB3) {
  const b = it.b, t = taskOfBlock(b.id);
  const subj = t?.subject || B.subjectOf(PV(), b.cat, b.title);
  const len = it.e - it.s, h = Math.max(22, len * PXM - 3);
  const isNow = k === TODAY && !b.done && it.s <= NOWMIN && NOWMIN < it.e;
  const late = !b.done && (k < TODAY || (k === TODAY && it.e <= NOWMIN));
  const tags = [];
  if (t && dB3.includes(t.id)) tags.push('<span class="btag b3" title="오늘 Big 3" aria-label="오늘 Big 3">★</span>');
  if (isNow) tags.push('<span class="btag">NOW</span>');
  else if (late) tags.push('<span class="btag late">지연</span>');
  const dl = t?.deadline ? ` · 마감 ${TK.ddayTxt(B.daysBetween(TODAY, t.deadline))}` : '';
  const split = t && t.blocks.length > 1 ? ` · ${t.blocks.findIndex((x) => x.b.id === b.id) + 1}/${t.blocks.length}` : '';
  const kind = B.KIND_LABEL[B.kindOf(b)];
  const meas = b.done && b.actual ? ` · 실제 ${dur(b.actual)}` : '';
  const warn = cf && cf.length ? cf.map((c) => c.type === 'fixed' ? `${c.label}과 ${c.min}분 겹침` : c.type === 'sleep' ? `${c.label} ${c.min}분 침범` : `‘${c.label}’과 ${c.min}분 겹침`)[0] : '';
  const short = h < 46;
  const cls = ['blk', b.done && 'done', isNow && 'now', warn && 'cf', S.sel === b.id && 'sel', short && 'short'].filter(Boolean).join(' ');
  const left = `calc(58px + (100% - 64px) * ${it.lane} / ${it.n})`, width = `calc((100% - 64px) / ${it.n} - 4px)`;
  const label = `${b.title}, ${B.hm(it.s)}부터 ${B.hm(it.e)}까지, ${SUBJ[subj]?.name || ''}${b.done ? ', 완료' : isNow ? ', 지금' : late ? ', 지연' : ''}${warn ? ', 충돌: ' + warn : ''}`;
  return `<div class="${cls}" data-id="${esc(b.id)}" style="--c:${colorOf(subj)};top:${yOf(it.s)}px;height:${h}px;left:${left};width:${width}" role="button" tabindex="0" aria-label="${esc(label)}">
    <div class="btop"><button class="bchk" data-act="bdone" data-id="${esc(b.id)}" aria-label="${b.done ? '완료 취소' : '완료 표시'}" aria-pressed="${!!b.done}">${b.done ? ic('check', 12) : ''}</button><span class="bt">${esc(b.title)}</span>${tags.join('')}</div>
    <div class="bmeta"><span class="num">${B.hm(it.s)}–${B.hm(it.e)}</span> · ${dur(len)} · ${kind}${meas}${dl}${split}</div>
    ${warn && !short ? `<div class="bwarn">${ic('warn', 11)} ${esc(warn)}</div>` : ''}
    ${b.done ? '' : `<span class="bh" data-id="${esc(b.id)}" aria-hidden="true"></span>`}
  </div>`;
}

// ---------- 일간 옆 칸: 오늘 Big 3 · 미배치 · 요약 ----------
function renderSide() {
  const k = S.day;
  const ids = big3Ids('daily', k);
  const rows = ids.map((id) => D.byId.get(id)).filter(Boolean);
  let b3;
  if (rows.length) b3 = rows.map(b3row).join('');
  else {
    const rec = TK.recommendBig3(D.tasks, { today: k, type: 'daily', weekly: big3Ids('weekly', B.weekStart(k)), risk: riskMap(), freeToday: dayStats(k).free }).slice(0, 3);
    b3 = rec.length ? `<p class="hint" style="margin-bottom:6px">추천 (확정 전)</p>${rec.map((x) => `<div class="trow"><span class="dot" style="--c:${colorOf(x.task.subject)}"></span><span class="t">${esc(x.task.title)}</span><small>${esc(x.why[0] || '')}</small></div>`).join('')}`
      : '<p class="hint">고를 작업이 없어요. 아래 ‘계획 세우기’에서 할 일을 모아 보세요.</p>';
  }
  const unpl = D.tasks.filter((t) => t.status === 'todo' && t.unplaced > 0 && !t.carry).slice(0, 12);
  const carryN = D.tasks.filter((t) => t.carry).length;
  const tray = unpl.length ? unpl.map((t) => {
    const dd = t.deadline ? TK.ddayTxt(B.daysBetween(TODAY, t.deadline)) : '';
    return `<button class="trow${S.pick === t.id ? ' on' : ''}" data-act="pick" data-id="${esc(t.id)}" aria-pressed="${S.pick === t.id}"><span class="dot" style="--c:${colorOf(t.subject)}"></span><span class="t">${esc(t.title)}</span><small>${dur(t.unplaced)}${dd ? ' · ' + dd : ''}</small></button>`;
  }).join('') : '<p class="hint">모든 작업이 배치됐어요. (예상 시간이 없는 작업은 계산에서 빠져요)</p>';
  const carryRow = carryN ? `<button class="trow" data-act="plan" data-step="1"><span class="t" style="color:var(--ink3)">지난 미완료 ${carryN}개 — 이월할지 고르기</span><small>${ic('arrow', 12)}</small></button>` : '';
  const pickHint = S.pick ? `<p class="hint" style="margin-top:6px">플래너의 ‘빈 시간’을 누르면 거기에 넣어요. <button class="chip" data-act="pick" data-id="">그만</button></p>` : '';
  $('#daySide').innerHTML = `
    <div class="card"><h3><span class="kr">오늘 Big 3</span>${k !== TODAY ? `<span>${md(k)}</span>` : ''}<button data-act="plan" data-step="2">${rows.length ? '바꾸기' : '확정하기'}</button></h3>${b3}</div>
    <div class="card"><h3><span class="kr">미배치 작업</span><span>${unpl.length}</span><button data-act="plan" data-step="3">시간 배분</button></h3><div class="tblist">${tray}${carryRow}</div>${pickHint}</div>`;
  $('#daySide').classList.toggle('show', S.tray);
}
const riskMap = () => new Map(DL.filter((x) => x.info.level === 'risk' || x.info.level === 'tight').map((x) => [x.t.id, x.info.level]));

// 미배치 작업을 고른 동안: 어디에 넣을지 안내
function pickBar() {
  const t = S.pick && D.byId.get(S.pick);
  if (!t) return '';
  return `<div class="propbar pickbar" role="status"><p><b>배치 중</b>‘${esc(t.title)}’ ${t.unplaced ? dur(Math.min(t.unplaced, 90)) : ''} — 플래너의 ‘빈 시간’을 누르면 거기에 넣어요. 다른 날은 위 주간에서 날짜를 먼저 고르세요.</p><div class="acts"><button class="btn" data-act="pick" data-id="">그만</button></div></div>`;
}

// ---------- 시간 초과 수정안 ----------
let PROP = null;
function renderProp() {
  PROP = null;
  const k = S.day;
  if (k < TODAY || !P) { $('#propBar').innerHTML = pickBar(); return; }
  const kept = new Set(TK.live(DOC, 'props').filter((p) => p.sig && p.status !== 'pending').map((p) => p.sig));
  const deadlines = new Map();
  for (const b of B.blocksOn(P, k)) { const t = taskOfBlock(b.id); if (t?.deadline) deadlines.set(b.id, t.deadline); }
  for (const iss of PL.overrunIssues({ P, k, events: evList(), settings: SET, now: nowMs() })) {
    const p = PL.shiftProposal({ P, k, events: evList(), settings: SET, srcId: iss.srcId, deadlines, fromMin: k === TODAY ? B.snap(NOWMIN + 2) : 0, now: nowMs() });
    if (!p || kept.has(p.sig) || S.hide.has(p.sig)) continue;
    PROP = p; break;
  }
  if (!PROP) { $('#propBar').innerHTML = pickBar(); return; }
  const imp = PROP.impact.deadline.length ? ` 마감 영향: ${PROP.impact.deadline.join(', ')}.` : '';
  $('#propBar').innerHTML = pickBar() + `<div class="propbar" role="region" aria-label="수정안"><p><b>수정안 · 승인 전에는 바뀌지 않아요</b>${esc(PROP.reason)}${esc(imp)}</p>
    <div class="acts"><button class="btn pri" data-act="papply">수정안 적용</button><button class="btn" data-act="pkeep">기존 계획 유지</button><button class="btn" data-act="pedit">직접 수정</button></div></div>`;
}

// ---------- 마감 사이드바 ----------
const LV_TXT = { risk: '위험', tight: '빠듯', plan: '배치 필요', ok: '여유', unknown: '시간 미정', done: '완료' };
function ddClass(x) { const d = x.info.dday; return x.info.level === 'risk' ? 'risk' : x.info.level === 'tight' ? 'tight' : d != null && d <= 1 ? 'near' : ''; }
function renderDl() {
  const n = DL.length, risky = DL.filter((x) => x.info.level === 'risk').length;
  $('#dlSub').textContent = n ? `${n}개${risky ? ` · 위험 ${risky}` : ''}` : '';
  if (S.dlSel && !DL.some((x) => x.t.id === S.dlSel)) S.dlSel = null;
  if (S.dlOpen && !S.dlSel && DL[0]) S.dlSel = DL[0].t.id;
  const show = S.dlOpen ? DL : DL.slice(0, 8);
  const rows = show.map((x) => {
    const t = x.t;
    return `<button class="dlrow${S.dlOpen && S.dlSel === t.id ? ' on' : ''}" data-act="dlsel" data-id="${esc(t.id)}" aria-label="${esc(`${t.title}, ${TK.ddayTxt(x.info.dday)}, ${LV_TXT[x.info.level]}: ${x.info.text}`)}">
      <span class="dd ${ddClass(x)}">${TK.ddayTxt(x.info.dday)}</span>
      <span class="t">${esc(t.title)}</span>
      <span class="s"><span class="lv lv-${x.info.level}">${LV_TXT[x.info.level]}</span><span class="dot" style="--c:${colorOf(t.subject)}"></span><span>${esc(x.info.text)}</span></span>
    </button>`;
  }).join('');
  const more = !S.dlOpen && DL.length > show.length ? `<button class="chip" data-act="dlopen" style="align-self:flex-start;margin-left:8px">+${DL.length - show.length}개 더</button>` : '';
  $('#dlList').innerHTML = (rows || `<p class="dlempty">${EVENTS == null ? '일정 불러오는 중…' : '3주 안에 마감이 없어요.'}</p>`) + more + mustHTML();
  $('#dlRail').innerHTML = DL.slice(0, 9).map((x) => `<button class="${ddClass(x)}" data-act="dlsel" data-id="${esc(x.t.id)}" aria-label="${esc(x.t.title + ' ' + TK.ddayTxt(x.info.dday) + ' ' + LV_TXT[x.info.level])}">${TK.ddayTxt(x.info.dday)}<small>${esc(x.t.title)}</small></button>`).join('') || '<span class="hint" style="writing-mode:vertical-rl">마감 없음</span>';
  const left = mustLeft();
  $('#dlStrip').innerHTML = DL.slice(0, 8).map((x) => `<button data-act="dlsel" data-id="${esc(x.t.id)}"><b class="${ddClass(x)}">${TK.ddayTxt(x.info.dday)}</b><span>${esc(x.t.title)}</span></button>`).join('')
    + `<button data-act="dlopen"><b class="${left ? 'risk' : ''}">${left}</b><span>오늘 꼭</span></button>` + (DL.length ? '' : '<span class="hint">마감 없음</span>');
  $('#dlDetail').innerHTML = S.dlOpen ? dlDetailHTML(DL.find((x) => x.t.id === S.dlSel)) : '';
}
function dlDetailHTML(x) {
  if (!x) return '<p class="dlempty">마감을 고르면 자세히 보여 줘요.</p>';
  const t = x.t, i = x.info;
  const when = `${mdw(t.deadline)}${t.deadlineTime ? ' ' + t.deadlineTime : ''}`;
  const src = t.src === 'event' ? '일정 앱' : t.src === 'block' ? '15577 블록' : '직접 입력';
  const bl = (t.blocks || []).slice().sort((a, b) => a.k.localeCompare(b.k) || a.b.start - b.b.start);
  const blocks = bl.length ? bl.map(({ b, k }) => `<button class="trow${b.done ? ' done' : ''}" data-act="goblock" data-id="${esc(b.id)}" data-day="${k}"><span class="dot" style="--c:${colorOf(t.subject)}"></span><span class="t">${esc(b.title)}</span><small class="num">${mdw(k)} ${B.hm(b.start)} · ${dur(B.planMin(b))}${b.done ? ' · 완료' : k > t.deadline ? ' · 마감 뒤' : ''}</small></button>`).join('')
    : '<p class="hint">아직 플래너에 놓인 블록이 없어요.</p>';
  const v = (m) => (m == null ? '—' : hmm(m));
  return `<div class="dd-title">${esc(t.title)}</div>
    <div class="dd-sub"><span class="lv lv-${i.level}">${LV_TXT[i.level]}</span><span class="num">${TK.ddayTxt(i.dday)}</span><span>${esc(when)}</span><span class="dot" style="--c:${colorOf(t.subject)}"></span><span>${esc(SUBJ[t.subject]?.name || '')}</span><span>· ${src}</span>${t.priority ? `<span>· ${'★'.repeat(t.priority)}</span>` : ''}</div>
    <div class="riskline ${i.level}">${esc(i.text)}${i.level === 'risk' || i.level === 'tight' ? ' — 남은 양과 실제 빈 시간으로 판단했어요.' : ''}</div>
    <div class="stats">
      <div class="stat"><b>${v(t.remaining)}</b><small>남은 작업</small></div>
      <div class="stat"><b>${v(t.need)}</b><small>예상 필요 시간${t.est == null && t.need != null ? ' (블록 합)' : ''}</small></div>
      <div class="stat"><b>${v(t.placedBeforeDeadline)}</b><small>마감 전 배치된 시간</small></div>
      <div class="stat"><b>${v(i.free)}</b><small>마감 전 빈 시간</small></div>
    </div>
    <div class="acts-row">
      <button class="btn" data-act="task" data-id="${esc(t.id)}">${t.est == null ? '예상 시간 넣기' : '작업 고치기'}</button>
      ${t.unplaced > 0 ? `<button class="btn pri" data-act="allocone" data-id="${esc(t.id)}">배치 제안 받기</button><button class="btn" data-act="pick" data-id="${esc(t.id)}">직접 배치</button>` : ''}
      ${t.src === 'event' ? '<a class="btn" href="/schedule/" style="display:inline-flex;align-items:center;text-decoration:none">일정 앱</a>' : ''}
    </div>
    <div class="grp" style="margin-top:4px"><span class="kr">관련 블록</span></div>
    <div class="tblist">${blocks}</div>`;
}

// ---------- 안하면 병신 (오늘 꼭, must.js) — 사이드바 아래 ----------
let MUST = (() => { try { return MU.normalize(JSON.parse(localStorage.getItem(MU.MUST_KEY))); } catch { return MU.normalize(null); } })();
const mustDay = () => TODAY || toDateStr(nowMs());
const saveMust = () => { try { localStorage.setItem(MU.MUST_KEY, JSON.stringify(MUST)); } catch {} };
const mustLeft = () => MU.left(MUST, mustDay()).length;
function mustHTML() {
  const day = mustDay();
  const rolled = MU.rollover(MUST, day);
  if (JSON.stringify(rolled) !== JSON.stringify(MUST)) { MUST = rolled; saveMust(); }
  const n = MUST.items.length, l = mustLeft();
  const items = S.dlOpen ? MUST.items : MUST.items.filter((x) => !MU.isDoneOn(MUST, x.id, day)).slice(0, 3);
  const rows = items.map((x) => {
    const on = MU.isDoneOn(MUST, x.id, day);
    return `<div style="display:flex;align-items:center"><button class="mrow${on ? ' done' : ''}" data-act="mtog" data-id="${esc(x.id)}" aria-pressed="${on}"><span class="box">${on ? ic('check', 12) : ''}</span><span class="t">${esc(x.t)}</span>${x.daily ? '' : '<span class="once">한 번</span>'}</button>${S.dlOpen ? `<button class="x mrow" style="width:auto" data-act="mdel" data-id="${esc(x.id)}" aria-label="${esc(x.t)} 지우기">${ic('close', 12)}</button>` : ''}</div>`;
  }).join('');
  const notifyOn = MUST.notify && 'Notification' in window && Notification.permission === 'granted';
  return `<div class="must"><h3>안하면 병신 <span class="n${l ? ' left' : ''}">${n ? `${l}/${n}` : '0'}</span></h3>
    ${rows || `<p class="hint">${n ? '오늘 꼭 할 건 다 했어요.' : '오늘 꼭 할 것을 적어 두세요.'}</p>`}
    ${S.dlOpen ? `<form class="madd" id="mustAdd" autocomplete="off"><input type="text" name="t" maxlength="80" placeholder="꼭 할 것 (예: 영단어 50개)" aria-label="꼭 할 것"><label><input type="checkbox" name="daily" checked>매일</label><button class="btn" type="submit">추가</button></form>
      <div class="mopts"><button data-act="mwarn" aria-pressed="${MUST.warn}">닫을 때 확인 ${MUST.warn ? '켬' : '끔'}</button><button data-act="mnotify" aria-pressed="${notifyOn}">나갈 때 알림 ${notifyOn ? '켬' : '끔'}</button></div>` : ''}</div>`;
}
async function mustAction(act, a) {
  const day = mustDay();
  if (act === 'mtog') { MUST = MU.toggle(MUST, a.dataset.id, day); if (!mustLeft() && MUST.items.length) toast('오늘 꼭 할 건 다 했어요'); }
  else if (act === 'mdel') { const x = MUST.items.find((i) => i.id === a.dataset.id); if (x && !confirm(`‘${x.t}’을(를) 목록에서 지울까요?`)) return; MUST = MU.remove(MUST, a.dataset.id); }
  else if (act === 'mwarn') { MUST = { ...MUST, warn: !MUST.warn }; toast(MUST.warn ? '남은 게 있으면 창을 닫기 전에 한 번 묻습니다 (컴퓨터 브라우저)' : '닫을 때 확인을 껐어요'); }
  else if (act === 'mnotify') {
    if (MUST.notify && 'Notification' in window && Notification.permission === 'granted') { MUST = { ...MUST, notify: false }; toast('나갈 때 알림을 껐어요'); }
    else if (!('Notification' in window) || !navigator.serviceWorker) toast('이 브라우저는 알림을 못 써요 · 아이폰·아이패드는 홈 화면에 추가한 앱에서만 돼요');
    else { const p = await Notification.requestPermission(); if (p === 'granted') { MUST = { ...MUST, notify: true, lastPing: 0 }; toast('앱을 나갈 때 남은 걸 알림으로 알려 줄게요 (30분에 한 번까지)'); } else toast('알림 권한이 꺼져 있어요'); }
  }
  saveMust(); renderDl();
}
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'mustAdd') return;
  e.preventDefault();
  const f = e.target, t = f.t.value.trim();
  if (!t) return;
  MUST = MU.add(MUST, t, f.daily.checked); saveMust(); renderDl();
  $('#mustAdd input[name=t]')?.focus();
});
addEventListener('beforeunload', (e) => { if (!MUST.warn || !mustLeft()) return; e.preventDefault(); e.returnValue = ''; });
let swReg = null;
navigator.serviceWorker?.ready.then((r) => { swReg = r; }).catch(() => {});
function pingLeave() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  if (!MU.shouldPing(MUST, now)) return;
  const tx = MU.leaveText(MUST, mustDay());
  if (!tx) return;
  MUST = { ...MUST, lastPing: now }; saveMust();
  const opt = { body: tx.body, tag: 'sabathia-must', renotify: true, data: { url: location.pathname + location.search } };
  try { if (swReg) swReg.showNotification(tx.title, opt); else new Notification(tx.title, opt); } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pingLeave(); });
addEventListener('pagehide', pingLeave);

// ---------- 그리기 ----------
function render() {
  compute();
  if (!S.day) S.day = TODAY;
  const [, m, d] = TODAY.split('-').map(Number);
  $('#dateTxt').textContent = `${m}월 ${d}일 ${WK[B.weekday(TODAY)]}요일`;
  $('#volTag').textContent = `Vol.${TODAY.slice(2, 4)} / No.${m}`;
  const dB3 = big3Ids('daily', TODAY);
  $('#b3chip').textContent = dB3.length ? `Big 3 ${dB3.filter((id) => D.byId.get(id)?.status === 'done').length}/${dB3.length}` : 'Big 3 정하기';
  renderWeek(); renderDay(); renderDl();
  if ($('#planDlg').open) renderPlan();
  $('#clock').textContent = B.hm(NOWMIN);
  try { window.Sabathia?.report?.('decide', { mode: R.mode, badge: DL.filter((x) => x.info.level === 'risk').length || '' }); } catch {}
}

// ---------- 블록 고치기 대화상자 ----------
const blkDlg = $('#blkDlg'), blkForm = $('#blkForm');
let blkId = null;
function catChips(sel) {
  return PV().cats.map((c) => { const sj = B.subjectOf(PV(), c.id); return `<label><input type="radio" name="cat" value="${esc(c.id)}"${c.id === sel ? ' checked' : ''}><span><i class="dot" style="--c:${colorOf(sj)}"></i>${esc(c.name)}</span></label>`; }).join('');
}
function taskOptions(cur, selfId) {
  const opts = D.tasks.filter((t) => t.status === 'todo' && (t.src !== 'block' || t.id === cur) && t.id !== 'p:' + selfId);
  return `<option value="">이 블록 하나가 작업</option>` + opts.map((t) => `<option value="${esc(t.id)}"${t.id === cur ? ' selected' : ''}>${esc(t.title)}${t.deadline ? ' · 마감 ' + md(t.deadline) : ''}</option>`).join('');
}
function openBlock(id, preset = {}) {
  blkId = id;
  const f = blkForm;
  const found = id ? B.findB(PV(), id) : {};
  const b = found.b;
  if (id && !b) return;
  const t = b ? taskOfBlock(b.id) : preset.task ? D.byId.get(preset.task) : null;
  $('#blkH').textContent = b ? '블록' : '블록 추가';
  f.title.value = b ? b.title : preset.title || t?.title || '';
  const cat = b ? b.cat : preset.cat || (t ? B.catForSubject(PV(), t.subject) : PV().lastCat || PV().cats[0]?.id);
  $('#blkCats').innerHTML = catChips(cat);
  f.kind.value = b ? B.kindOf(b) : 'solve';
  f.date.value = found.k || preset.date || S.day;
  f.start.value = B.hm(b ? b.start : preset.start ?? 16 * 60);
  f.dur.value = b ? b.dur : preset.dur || 60;
  const linked = b ? D.blockTask.get(b.id) : preset.task || '';
  $('#blkTask').innerHTML = taskOptions(linked && linked !== 'p:' + id ? linked : '', id || '');
  f.done.checked = !!b?.done;
  f.actual.value = b?.actual || '';
  $('#actW').hidden = !b;
  for (const x of ['bExtend', 'bSplit', 'bCarry', 'bDel', 'bOpen15577']) $('#' + x).hidden = !b;
  if (b) { $('#bExtend').hidden = !!b.done; $('#bSplit').hidden = !!b.done; }
  const cf = b ? B.conflictsOn(PV(), found.k, evList(), SET).get(b.id) : null;
  const w = $('#blkWarn');
  w.hidden = !cf;
  if (cf) {
    const c = cf[0];
    const spot = PL.nearestFree({ P: PV(), k: found.k, events: evList(), settings: SET, id: b.id });
    w.innerHTML = `${ic('warn', 14)} ${esc(c.type === 'fixed' ? `${c.label}과 ${c.min}분 겹쳐요` : c.type === 'sleep' ? `${c.label}을 ${c.min}분 침범해요` : `‘${c.label}’과 ${c.min}분 겹쳐요`)}${spot != null ? ` <button type="button" class="btn" data-bact="fix" data-s="${spot}">${B.hm(spot)} 빈 시간으로 옮기기</button>` : ''}`;
  }
  blkDlg.showModal();
}
blkDlg.addEventListener('click', (e) => {
  const a = e.target.closest('[data-bact]');
  if (!a || !blkId) return;
  const id = blkId, act = a.dataset.bact;
  const { b, k } = B.findB(PV(), id);
  if (!b) return;
  blkDlg.close('cancel');
  if (act === 'extend') mutate((P) => B.extendBlock(P, id, 15) && true, `${b.title} 15분 늘렸어요 · 뒤 일정과 겹치면 수정안을 보여 줘요`);
  else if (act === 'split') {
    const total = B.planMin(b), first = Math.max(10, r5(total / 2));
    mutate((P, doc) => {
      const tid = D.blockTask.get(id) || 'p:' + id;
      const n = B.splitBlock(P, id, first);
      if (!n) return false;
      TK.linkBlock(doc, n.id, tid);
      return true;
    }, `${dur(first)} + ${dur(total - first)}로 나눴어요 · 같은 작업이에요. 뒤 블록을 끌어 다른 시간·날로 옮길 수 있어요`);
  } else if (act === 'carry') {
    const nk = B.addDays(k, 1);
    const len = B.lenOf(b);
    const slot = B.freeSlots(PV(), nk, evList(), SET, { minLen: len }).find((x) => x.e - x.s >= len);
    mutate((P) => B.moveBlock(P, id, nk, slot ? slot.s : b.start) && true, `${mdw(nk)} ${B.hm(slot ? slot.s : b.start)}로 옮겼어요`);
  } else if (act === 'fix') mutate((P) => B.moveBlock(P, id, k, +a.dataset.s) && true, `${B.hm(+a.dataset.s)}로 옮겼어요`);
});
blkDlg.addEventListener('close', () => {
  const v = blkDlg.returnValue, f = blkForm, id = blkId;
  blkDlg.returnValue = '';
  if (v !== 'save' && v !== 'del') return;
  if (v === 'del') {
    const b = B.findB(PV(), id).b;
    if (!b) return;
    mutate((P, doc) => { B.removeBlock(P, id); if (doc.links[id]) TK.del(doc, 'links', id); if (S.sel === id) S.sel = null; return true; }, `‘${b.title}’ 블록을 지웠어요`);
    return;
  }
  const start = B.parseHM(f.start.value), durV = +f.dur.value, date = f.date.value;
  if (start == null || !(durV >= 10) || !date) { toast('날짜·시작·시간을 확인해 주세요'); return; }
  const cat = f.cat?.value || 'etc', kind = f.kind.value, task = $('#blkTask').value;
  const actual = +f.actual.value || null;
  mutate((P, doc) => {
    let b;
    if (!id) {
      b = B.addBlock(P, date, { title: f.title.value, cat, kind, est: durV, start }, TODAY);
      P.lastCat = cat;
    } else {
      b = B.editBlock(P, id, { title: f.title.value, cat, kind, dur: B.findB(P, id).b.done ? undefined : durV, start, date });
      if (!b) return false;
      if (f.done.checked && !b.done) B.completeBlock(P, id, actual ?? B.measuredMin(b));
      else if (f.done.checked && b.done && actual && actual !== b.actual) B.completeBlock(P, id, actual);
      else if (!f.done.checked && b.done) B.undoneBlock(P, id);
    }
    if (task) TK.linkBlock(doc, b.id, task); else if (doc.links[b.id] && !doc.links[b.id].del) TK.del(doc, 'links', b.id);
    S.sel = b.id;
    return true;
  }, id ? '저장했어요' : '블록을 넣었어요');
});

// ---------- 작업 대화상자 ----------
const taskDlg = $('#taskDlg'), taskForm = $('#taskForm');
let taskCur = null;
function openTask(id) {
  const t = D.byId.get(id);
  if (!t) return;
  taskCur = t;
  const f = taskForm;
  $('#taskH').textContent = '작업';
  $('#taskSrc').textContent = t.src === 'event' ? '일정 앱에서 온 작업이에요. 제목·마감은 일정 앱에서 고쳐요.' : t.src === 'block' ? '15577 블록에서 온 작업이에요. 제목은 블록에서 고쳐요.' : '직접 넣은 작업이에요.';
  f.title.value = t.title; f.title.disabled = t.src !== 'manual';
  $('#taskSubj').innerHTML = B.SUBJECTS.map((s) => `<label><input type="radio" name="subject" value="${s.id}"${s.id === t.subject ? ' checked' : ''}><span><i class="dot" style="--c:${colorOf(s.id)}"></i>${s.name}</span></label>`).join('');
  f.est.value = t.est ?? '';
  f.deadline.value = t.deadline || ''; f.deadlineTime.value = t.deadlineTime || '';
  f.deadline.disabled = f.deadlineTime.disabled = t.src === 'event';
  f.priority.value = t.priority ? String(t.priority) : '';
  f.note.value = t.note || '';
  f.done.checked = t.status === 'done';
  f.done.disabled = t.src === 'event';
  $('#tDrop').hidden = t.src === 'event';
  taskDlg.showModal();
}
taskDlg.addEventListener('close', () => {
  const v = taskDlg.returnValue, f = taskForm, t = taskCur;
  taskDlg.returnValue = '';
  if (!t || (v !== 'save' && v !== 'drop')) return;
  if (v === 'drop') { mutateDoc((doc) => TK.updateTask(doc, t, { status: 'dropped' }), `‘${t.title}’을(를) 목록에서 뺐어요`); return; }
  const patch = { subject: f.subject.value || t.subject, est: +f.est.value > 0 ? +f.est.value : null, priority: +f.priority.value || null, note: f.note.value.trim() };
  if (t.src === 'manual') Object.assign(patch, { title: f.title.value.trim() || t.title });
  if (t.src !== 'event') Object.assign(patch, { deadline: f.deadline.value || null, deadlineTime: f.deadlineTime.value || null, status: f.done.checked ? 'done' : 'todo' });
  mutateDoc((doc) => TK.updateTask(doc, t, patch), '작업을 저장했어요');
});

// ---------- 계획 세우기 (Brain Dump → Big 3 → 시간 배분 → 타임박싱) ----------
const planDlg = $('#planDlg');
function openPlan(step) { S.step = step || 1; renderPlan(); if (!planDlg.open) planDlg.showModal(); }
function renderPlan() {
  document.querySelectorAll('#steps button').forEach((b) => (b.getAttribute('data-step') == S.step ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
  const body = $('#planBody'), foot = $('#planFoot');
  const keepScroll = body.scrollTop;
  body.innerHTML = [null, stepDump, stepBig3, stepAlloc, stepBox][S.step]();
  body.scrollTop = keepScroll;
  foot.innerHTML = `${S.step > 1 ? `<button class="btn" data-act="step" data-step="${S.step - 1}">이전</button>` : ''}<span class="sp"></span>
    <span class="hint">언제든 플래너에 바로 블록을 넣어도 돼요. 이 순서는 필요할 때만.</span>
    ${S.step < 4 ? `<button class="btn pri" data-act="step" data-step="${S.step + 1}">다음</button>` : '<button class="btn pri" data-act="planclose">플래너에서 실행</button>'}`;
}
const SUBJ_OPTS = (sel) => B.SUBJECTS.map((s) => `<option value="${s.id}"${s.id === sel ? ' selected' : ''}>${s.name}</option>`).join('');
function dumpRow(t) {
  const evt = t.src === 'event';
  const sub = [t.src === 'event' ? '일정 앱' : t.src === 'block' ? `15577 ${t.blockDate ? md(t.blockDate) : ''}` : '직접 입력'];
  if (t.placedMin) sub.push(`배치 ${dur(t.placedMin)}`);
  if (t.doneMin) sub.push(`한 것 ${dur(t.doneMin)}`);
  if (t.carry) sub.push(`지난 미완료 ${dur(t.lateMin)}`);
  return `<div class="bdrow${t.status === 'done' ? ' done' : ''}" data-id="${esc(t.id)}">
    <button class="boxchk${t.status === 'done' ? ' on' : ''}" data-act="tdone" data-id="${esc(t.id)}" aria-label="${esc(t.title)} 끝냄 표시" aria-pressed="${t.status === 'done'}" ${evt || t.src === 'block' ? 'disabled title="일정 앱·15577에서 완료"' : ''}>${t.status === 'done' ? ic('check', 12) : ''}</button>
    <button class="ttl" data-act="task" data-id="${esc(t.id)}" style="text-align:left"><span>${esc(t.title)}</span><small>${esc(sub.join(' · '))}</small></button>
    <select data-tf="subject" aria-label="과목">${SUBJ_OPTS(t.subject)}</select>
    <input data-tf="est" type="number" min="5" step="5" inputmode="numeric" value="${t.est ?? ''}" placeholder="분" aria-label="예상 시간(분)">
    <input data-tf="deadline" type="date" value="${t.deadline || ''}" aria-label="마감" ${evt ? 'disabled' : ''}>
    <span class="stars" role="group" aria-label="중요도">${[1, 2, 3].map((n) => `<button data-act="tprio" data-id="${esc(t.id)}" data-n="${n}" class="${(t.priority || 0) >= n ? 'on' : ''}" aria-label="중요도 ${n}">★</button>`).join('')}</span>
    ${t.carry ? `<button class="x" data-act="tcarry" data-id="${esc(t.id)}">오늘로 이월</button>` : t.src === 'manual' ? `<button class="x" data-act="tdrop" data-id="${esc(t.id)}">빼기</button>` : '<span></span>'}
  </div>`;
}
function stepDump() {
  const todo = D.tasks.filter((t) => t.status === 'todo');
  const g = (name, list, note = '') => list.length ? `<div class="grp"><span class="kr">${name}</span><span>${list.length}</span></div>${note}${list.map(dumpRow).join('')}` : '';
  const ev = todo.filter((t) => t.src === 'event');
  const man = todo.filter((t) => t.src === 'manual');
  const carry = todo.filter((t) => t.carry);
  const placed = todo.filter((t) => t.src === 'block' && !t.carry && t.blocks.some((x) => x.k >= TODAY));
  const done = D.tasks.filter((t) => t.status === 'done' && t.src === 'manual');
  return `<p class="sh-lead">해야 할 일을 빠르게 모아요. 제목만 넣어도 되고, 시간·마감·중요도는 나중에 채워도 돼요. 같은 작업은 두 번 만들어지지 않아요.</p>
    <form class="bd-add" id="dumpAdd" autocomplete="off"><input name="q" placeholder="예: 통사 보고서 2시간 화요일까지 !!" aria-label="작업 추가"><button class="btn pri" type="submit">추가</button></form>
    ${g('직접 입력', man)}
    ${g('일정 앱의 마감·할 일', ev)}
    ${g('이월 후보 — 지난 미완료 블록', carry, '<p class="hint" style="margin:0 6px 4px">‘오늘로 이월’은 같은 블록을 오늘 빈 시간으로 옮겨요(복사하지 않음).</p>')}
    ${g('이미 플래너에 있는 블록', placed)}
    ${done.length ? `<div class="grp"><span class="kr">끝낸 것</span><span>${done.length}</span></div>${done.map(dumpRow).join('')}` : ''}
    ${!todo.length ? '<p class="hint">아직 작업이 없어요. 위에 적어 보세요.</p>' : ''}`;
}
function b3Box(type, start, label) {
  const conf = TK.getBig3(DOC, type, start);
  const key = type + start;
  const rec = TK.recommendBig3(D.tasks, { today: type === 'weekly' ? (TODAY >= start ? TODAY : start) : start, type, weekly: big3Ids('weekly', B.weekStart(start)), risk: riskMap(), freeToday: dayStats(type === 'weekly' ? TODAY : start).free });
  if (!S.b3sel[key]) S.b3sel[key] = conf ? [...conf.taskIds] : rec.slice(0, 3).map((x) => x.task.id);
  const sel = S.b3sel[key];
  const pool = [...rec.slice(0, 7)];
  for (const id of [...(conf?.taskIds || []), ...sel]) if (!pool.some((x) => x.task.id === id) && D.byId.get(id)) pool.push({ task: D.byId.get(id), score: 0, why: ['직접 고름'] });
  const same = conf && conf.taskIds.join() === sel.join();
  const rows = pool.map((x) => {
    const on = sel.includes(x.task.id);
    return `<button class="cand" data-act="b3tog" data-key="${key}" data-id="${esc(x.task.id)}" aria-pressed="${on}"><span class="boxchk${on ? ' on' : ''}">${on ? ic('check', 12) : ''}</span><span class="t">${esc(x.task.title)}</span><span class="sc">${x.score ? '추천 ' + x.score : ''}</span><span class="why">${esc(x.why.join(' · ') || '—')}</span></button>`;
  }).join('') || '<p class="hint">후보가 없어요. Brain Dump에서 작업을 모아 보세요.</p>';
  return `<div class="b3box"><h3>${label} <span class="state ${conf ? 'ok' : 'no'}">${conf ? (same ? '확정됨' : '바뀜 · 다시 확정') : '추천 · 확정 전'}</span></h3>
    <p class="hint" style="margin-bottom:8px">${sel.length}/3 골랐어요. 추천은 마감 임박도·위험·중요도·남은 양·가용 시간으로 계산했어요.</p>${rows}
    <div class="acts-row" style="margin-top:10px"><button class="btn pri" data-act="b3ok" data-type="${type}" data-start="${start}" data-key="${key}" ${!sel.length || same ? 'disabled' : ''}>${conf ? '다시 확정' : '확정'}</button>${conf ? `<button class="btn" data-act="b3clr" data-type="${type}" data-start="${start}" data-key="${key}">확정 취소</button>` : ''}</div></div>`;
}
function stepBig3() {
  const ws = B.weekStart(S.day);
  const dk = S.day < TODAY ? TODAY : S.day;
  return `<p class="sh-lead">추천은 미리 골라 두기만 해요. ‘확정’을 눌러야 플래너에 반영돼요. 주간과 일간이 같을 필요는 없어요.</p>
    <div class="b3grid">${b3Box('weekly', ws, `이번 주 Big 3 <span class="hint">${md(ws)}–${md(B.addDays(ws, 6))}</span>`)}${b3Box('daily', dk, `${dk === TODAY ? '오늘' : mdw(dk)} Big 3`)}</div>`;
}
function stepAlloc() {
  const list = D.tasks.filter((t) => t.status === 'todo' && (t.remaining ?? 0) > 0).sort((a, b) => (a.carry ? 1 : 0) - (b.carry ? 1 : 0)).slice(0, 30);
  const noEst = D.tasks.filter((t) => t.status === 'todo' && t.need == null);
  const caps = [];
  for (let i = 0; i < 7; i++) {
    const k = B.addDays(TODAY, i), st = dayStats(k);
    const ghost = (S.alloc?.changes || []).filter((c) => c.date === k && c.sel).reduce((s, c) => s + c.dur, 0);
    const tot = Math.max(st.left + st.free, 1);
    caps.push(`<div class="cap"><span>${WK[B.weekday(k)]} ${+k.slice(8)}</span><span class="capbar" title="배치 ${dur(st.left)} · 제안 ${dur(ghost)} · 빈 ${dur(st.free)}"><i class="p" style="width:${(st.left / tot) * 100}%"></i><i class="g" style="width:${(Math.min(ghost, st.free) / tot) * 100}%"></i></span><span class="num">빈 ${hmm(Math.max(0, st.free - ghost))}</span></div>`);
  }
  const need = list.map((t) => `<div class="need"><span class="t"><span class="dot" style="--c:${colorOf(t.subject)}"></span>${esc(t.title)}${t.deadline ? ` <small class="hint">${TK.ddayTxt(B.daysBetween(TODAY, t.deadline))}</small>` : ''}</span><span class="num">${hmm(t.remaining)}</span><span class="num">${hmm(t.placedMin)}</span><span class="num" style="${t.unplaced ? 'color:var(--warn)' : ''}">${hmm(t.unplaced)}</span>
    <span>${t.carry ? `<button class="chip" data-act="tcarry" data-id="${esc(t.id)}">오늘로 이월</button>` : t.unplaced ? `<button class="chip" data-act="pick" data-id="${esc(t.id)}">직접</button>` : ''}</span></div>`).join('');
  const al = S.alloc;
  const prop = al ? (al.changes.length ? al.changes.map((c, i) => `<button class="prow" data-act="altog" data-i="${i}" aria-pressed="${c.sel}"><span class="boxchk${c.sel ? ' on' : ''}">${c.sel ? ic('check', 12) : ''}</span><span class="num">${mdw(c.date)} ${B.hm(c.start)}</span><span style="display:flex;gap:6px;align-items:center;min-width:0"><span class="dot" style="--c:${colorOf(c.subject)}"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.title)}</span></span><span class="num">${dur(c.dur)}</span></button>`).join('') : '<p class="hint">넣을 작업이 없어요.</p>')
    + (al.left.length ? `<div class="left-note">빈 시간이 모자라 못 넣은 것: ${al.left.map((x) => `${esc(x.title)} ${dur(x.min)}`).join(', ')}. 다른 작업을 줄이거나 마감 조정이 필요해요. 수면 시간은 쓰지 않아요.</div>` : '')
    + `<div class="acts-row" style="margin-top:10px"><button class="btn pri" data-act="alapply" ${al.changes.some((c) => c.sel) ? '' : 'disabled'}>선택한 ${al.changes.filter((c) => c.sel).length}개 적용</button><button class="btn" data-act="aldrop">제안 버리기</button></div>`
    : '<p class="hint">‘자동 배치 제안’을 누르면 고정 일정·수면을 피해 빈 시간에 나눠 넣는 안을 보여 줘요. 적용하기 전에는 플래너가 바뀌지 않아요.</p>';
  return `<p class="sh-lead">예상 시간과 이미 놓은 블록으로 마감까지 필요한 시간을 계산해요. 블록 길이가 곧 예상 시간이라 따로 다시 묻지 않아요.</p>
    <div class="altbl"><div>
      <div class="need head"><span>작업</span><span class="num">남은</span><span class="num">배치됨</span><span class="num">미배치</span><span></span></div>${need || '<p class="hint">남은 작업이 없어요.</p>'}
      ${noEst.length ? `<p class="hint" style="margin-top:8px">예상 시간이 없는 작업 ${noEst.length}개는 계산에서 빠졌어요: ${noEst.slice(0, 4).map((t) => `<button class="chip" data-act="task" data-id="${esc(t.id)}">${esc(t.title)}</button>`).join(' ')}</p>` : ''}
    </div><div>
      <div class="grp" style="margin-top:0"><span class="kr">7일 가용 시간</span></div>${caps.join('')}
      <div class="grp"><span class="kr">배치 제안</span></div>
      <div class="acts-row" style="margin-bottom:8px"><button class="btn${al ? '' : ' pri'}" data-act="alrun">${al ? '다시 제안' : '자동 배치 제안'}</button></div>${prop}
    </div></div>`;
}
function stepBox() {
  const k = S.day < TODAY ? TODAY : S.day;
  const st = dayStats(k), conf = B.conflictsOn(PV(), k, evList(), SET);
  const ids = big3Ids('daily', k);
  const rows = st.blocks.map((b) => { const t = taskOfBlock(b.id); return `<button class="trow${b.done ? ' done' : ''}" data-act="goblock" data-id="${esc(b.id)}" data-day="${k}"><span class="dot" style="--c:${colorOf(t?.subject || 'etc')}"></span><span class="num" style="font-size:12px">${B.hm(b.start)}</span><span class="t">${esc(b.title)}${t && ids.includes(t.id) ? ' ★' : ''}</span><small>${dur(B.lenOf(b))}${conf.has(b.id) ? ' · 충돌' : ''}</small></button>`; }).join('');
  const warn = [];
  if (!ids.length) warn.push('오늘 Big 3가 아직 확정되지 않았어요.');
  if (conf.size) warn.push(`충돌하는 블록 ${conf.size}개가 있어요. 블록을 눌러 고칠 수 있어요.`);
  const un = D.tasks.filter((t) => t.status === 'todo' && t.unplaced > 0).length;
  if (un) warn.push(`아직 배치 안 된 작업 ${un}개.`);
  return `<p class="sh-lead">${k === TODAY ? '오늘' : mdw(k)} 계획 ${dur(st.plan)} · 빈 시간 ${dur(st.free)}. 실행은 플래너에서: 동그라미로 완료, 끌어서 옮기기, 아래 끝을 끌어 길이 바꾸기. 늦어지면 블록을 눌러 ‘아직 안 끝남’ — 뒤 일정과 겹칠 때만 수정안을 보여 줘요.</p>
    ${warn.length ? `<div class="riskline tight" style="margin-bottom:10px">${warn.map(esc).join(' ')}</div>` : '<div class="riskline ok" style="margin-bottom:10px">준비됐어요.</div>'}
    <div class="tblist">${rows || '<p class="hint">이 날 블록이 없어요.</p>'}</div>`;
}
$('#steps').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) { S.step = +b.dataset.step; renderPlan(); } });
planDlg.addEventListener('submit', (e) => {
  if (e.target.id !== 'dumpAdd') return;
  e.preventDefault();
  addQuick(e.target.q.value, () => { e.target.q.value = ''; renderPlan(); $('#dumpAdd input')?.focus(); });
});
planDlg.addEventListener('change', (e) => {
  const el = e.target.closest('[data-tf]'); if (!el) return;
  const row = el.closest('.bdrow'), t = D.byId.get(row?.dataset.id); if (!t) return;
  const f = el.dataset.tf;
  const v = f === 'est' ? (+el.value > 0 ? +el.value : null) : el.value || null;
  mutateDoc((doc) => TK.updateTask(doc, t, { [f]: v }));
});
function addQuick(text, done) {
  const p = TK.parseQuick(text, TODAY);
  if (!p.title) { toast('제목을 적어 주세요'); return; }
  const before = JSON.stringify(DOC.tasks);
  const r = TK.addTask(DOC, D.tasks, p);
  if (r.dup) { toast(`이미 있는 작업이에요: ${r.task.title}`); return; }
  if (JSON.stringify(DOC.tasks) !== before) { ST.saveDoc(DOC, render); render(); }
  const bits = [p.est ? dur(p.est) : null, p.deadline ? `마감 ${mdw(p.deadline)}` : null, p.priority ? '★'.repeat(p.priority) : null].filter(Boolean);
  toast(`‘${p.title}’ 추가${bits.length ? ' · ' + bits.join(' · ') : ''}`);
  done && done();
}
$('#quickAdd').addEventListener('submit', (e) => { e.preventDefault(); addQuick(e.target.q.value, () => { e.target.q.value = ''; }); });

// ---------- 누르기 ----------
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
  const act = a.dataset.act, id = a.dataset.id;
  switch (act) {
    case 'mode':
      if (a.dataset.mode === 'free') { if (S.mode !== 'free') S.free = freeDefault(); S.mode = 'free'; toast('자유 모드 · 패널 위쪽을 끌어 옮기고 오른쪽 아래 모서리로 크기를 바꿔요'); }
      else S.mode = 'organized';
      applyLayout(); render(); break;
    case 'reset': S.free = freeDefault(); applyLayout(); toast('패널 배치를 처음대로 돌렸어요'); break;
    case 'today': S.day = TODAY; S._scrollTo = null; render(); break;
    case 'wk': S.day = B.addDays(S.day, +a.dataset.d); render(); break;
    case 'dayby': S.day = B.addDays(S.day, +a.dataset.d); render(); break;
    case 'pickday': S.day = a.dataset.day; render(); break;
    case 'tray': S.tray = !S.tray; renderDay(); break;
    case 'newblock': {
      const k = S.day, from = k === TODAY ? NOWMIN : 0;
      const slot = B.freeSlots(PV(), k, evList(), SET, { fromMin: from, minLen: 30 })[0];
      openBlock(null, { date: k, start: slot ? B.snap(slot.s) : 16 * 60, dur: 60 }); break;
    }
    case 'gap': {
      const s = +a.dataset.s, e2 = +a.dataset.e;
      const t = S.pick && D.byId.get(S.pick);
      if (t) {
        const d = Math.min(t.unplaced || 60, 90, e2 - s);
        mutate((P, doc) => {
          const ch = { taskId: t.id, title: t.title, subject: t.subject, date: S.day, start: B.snap(s), dur: Math.max(10, r5(d)) };
          if (t.src === 'block' && t.blocks.length) { // 블록 작업이면 같은 작업으로 이어 붙인다
            const b = B.addBlock(P, ch.date, { title: t.title, cat: t.blocks[0].b.cat, kind: B.kindOf(t.blocks[0].b), est: ch.dur, start: ch.start }, TODAY);
            TK.linkBlock(doc, b.id, t.id);
          } else PL.applyAlloc(P, doc, ch);
          return true;
        }, `‘${t.title}’ ${dur(Math.max(10, r5(d)))}을 ${B.hm(s)}에 넣었어요`);
        if ((D.byId.get(t.id)?.unplaced || 0) <= 0) S.pick = null;
        render();
      } else openBlock(null, { date: S.day, start: B.snap(s), dur: Math.min(60, e2 - s) });
      break;
    }
    case 'pick': S.pick = id && S.pick !== id ? id : null; if (S.pick) { S.tray = FORM === 'wide'; if (planDlg.open) planDlg.close(); if (FORM !== 'wide' && S.dlOpen) S.dlOpen = false; applyLayout(); toast('플래너의 ‘빈 시간’을 누르면 거기에 넣어요'); } render(); break;
    case 'bdone': {
      e.stopPropagation();
      const { b } = B.findB(PV(), id); if (!b) break;
      if (b.done) mutate((P) => !!B.undoneBlock(P, id), '완료를 취소했어요');
      else {
        const m = B.measuredMin(b);
        mutate((P) => !!B.completeBlock(P, id, m), m ? `완료 · 15577 타이머로 잰 ${dur(m)}을 실제 시간으로 적었어요` : '완료 · 실제 시간은 블록을 눌러 적을 수 있어요 (모르면 비워 둬요)');
      }
      break;
    }
    case 'dlopen': S.dlOpen = !S.dlOpen; applyLayout(); renderDl(); break;
    case 'dlsel': S.dlSel = id; if (!S.dlOpen) { S.dlOpen = true; applyLayout(); } renderDl(); break;
    case 'goblock': S.day = a.dataset.day; S.sel = id; S._scrollTo = null; if (FORM !== 'wide') S.dlOpen = false; if (planDlg.open) planDlg.close(); applyLayout(); render(); scrollToBlock(id); break;
    case 'task': openTask(id); break;
    case 'allocone': S.alloc = { ...PL.allocate({ tasks: D.tasks, P: PV(), events: evList(), settings: SET, today: TODAY, nowMin: NOWMIN, only: [id] }) }; S.alloc.changes.forEach((c) => (c.sel = true)); openPlan(3); break;
    case 'plan': openPlan(+a.dataset.step || 1); break;
    case 'planclose': planDlg.close(); break;
    case 'step': S.step = +a.dataset.step; renderPlan(); $('#planBody').scrollTop = 0; break;
    case 'tdone': { const t = D.byId.get(id); if (t) mutateDoc((doc) => TK.updateTask(doc, t, { status: t.status === 'done' ? 'todo' : 'done' })); break; }
    case 'tdrop': { const t = D.byId.get(id); if (t) mutateDoc((doc) => TK.updateTask(doc, t, { status: 'dropped' }), `‘${t.title}’을(를) 뺐어요`); break; }
    case 'tprio': { const t = D.byId.get(id), n = +a.dataset.n; if (t) mutateDoc((doc) => TK.updateTask(doc, t, { priority: t.priority === n ? null : n })); break; }
    case 'tcarry': {
      const t = D.byId.get(id); if (!t) break;
      const late = t.blocks.filter((x) => !x.b.done && x.k < TODAY);
      mutate((P) => {
        const extra = [];
        for (const { b } of late) {
          const len = B.lenOf(b);
          const sl = B.freeSlots(P, TODAY, evList(), SET, { fromMin: NOWMIN, minLen: len, extra }).find((x) => x.e - x.s >= len);
          const s = sl ? B.snap(sl.s) : Math.max(NOWMIN, b.start);
          B.moveBlock(P, b.id, TODAY, s); extra.push({ s, e: s + len + 10 });
        }
        return true;
      }, `‘${t.title}’을(를) 오늘로 옮겼어요`);
      break;
    }
    case 'b3tog': {
      const key = a.dataset.key, sel = S.b3sel[key] || [];
      S.b3sel[key] = sel.includes(id) ? sel.filter((x) => x !== id) : sel.length >= 3 ? (toast('Big 3는 세 개까지예요'), sel) : [...sel, id];
      renderPlan(); break;
    }
    case 'b3ok': mutateDoc((doc) => TK.confirmBig3(doc, a.dataset.type, a.dataset.start, S.b3sel[a.dataset.key]), `${a.dataset.type === 'weekly' ? '이번 주' : '오늘'} Big 3를 확정했어요`); break;
    case 'b3clr': delete S.b3sel[a.dataset.key]; mutateDoc((doc) => TK.clearBig3(doc, a.dataset.type, a.dataset.start), '확정을 취소했어요'); break;
    case 'alrun': {
      const ids = [...big3Ids('weekly', B.weekStart(TODAY)), ...big3Ids('daily', TODAY)];
      S.alloc = PL.allocate({ tasks: D.tasks, P: PV(), events: evList(), settings: SET, today: TODAY, nowMin: NOWMIN, big3: ids });
      S.alloc.changes.forEach((c) => (c.sel = true));
      render(); break;
    }
    case 'altog': { const c = S.alloc?.changes[+a.dataset.i]; if (c) { c.sel = !c.sel; render(); } break; }
    case 'aldrop': S.alloc = null; render(); break;
    case 'alapply': {
      const sel = S.alloc.changes.filter((c) => c.sel);
      mutate((P, doc) => { for (const c of sel) PL.applyAlloc(P, doc, c); return true; }, `블록 ${sel.length}개를 넣었어요`);
      S.alloc = null; render(); break;
    }
    case 'papply': {
      if (!PROP) break;
      const p = PROP;
      let res;
      mutate((P, doc) => { res = PL.applyProposal(P, p); if (!res.ok) return false; PL.settle(doc, p, 'applied'); return true; }, '수정안을 적용했어요');
      if (res && !res.ok) toast(res.why);
      break;
    }
    case 'pkeep': if (PROP) mutateDoc((doc) => PL.settle(doc, PROP, 'kept'), '기존 계획을 유지해요 · 같은 상황은 다시 묻지 않아요'); break;
    case 'pedit': if (PROP) { S.hide.add(PROP.sig); S.sel = PROP.source; render(); openBlock(PROP.source); } break;
    case 'mtog': case 'mdel': case 'mwarn': case 'mnotify': mustAction(act, a); break;
  }
});
function scrollToBlock(id) {
  const b = B.findB(PV(), id).b;
  if (b) $('#tscroll').scrollTo({ top: Math.max(0, yOf(b.start) - 80), behavior: 'smooth' });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
    if (S.pick) { S.pick = null; render(); } else if (S.dlOpen) { S.dlOpen = false; applyLayout(); renderDl(); }
  }
  if (e.key === 'Enter' && e.target.classList?.contains('blk')) openBlock(e.target.dataset.id);
});
window.Sabathia = window.Sabathia || {};
window.Sabathia.back = () => {
  const d = document.querySelector('dialog[open]');
  if (d) { d.close(); return true; }
  if (S.pick) { S.pick = null; render(); return true; }
  if (S.dlOpen) { S.dlOpen = false; applyLayout(); renderDl(); return true; }
  return false;
};

// ---------- 블록 끌기·길이 바꾸기 ----------
$('#track').addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  const el = e.target.closest('.blk'); if (!el || el.classList.contains('ghost') || e.target.closest('.bchk')) return;
  const id = el.dataset.id, mode = e.target.closest('.bh') ? 'resize' : 'move';
  const found = B.findB(PV(), id); if (!found.b) return;
  const b = found.b, s0 = b.start, d0 = b.dur || B.lenOf(b), len = B.lenOf(b);
  const sc = $('#tscroll'), st0 = sc.scrollTop, x0 = e.clientX, y0 = e.clientY;
  let moved = false, ns = s0, nd = d0, overDay = null, tip = null, raf = 0, lastY = y0;
  const dyOf = (cy) => (cy - y0) / scale + (sc.scrollTop - st0);
  const paint = () => {
    const dy = dyOf(lastY);
    if (mode === 'move') { ns = clamp(B.snap(s0 + dy / PXM), 0, B.DAY_END - 10); el.style.top = yOf(ns) + 'px'; tip.textContent = `${B.hm(ns)}–${B.hm(ns + len)}${overDay ? ` → ${mdw(overDay)}` : ''}`; tip.style.top = yOf(ns) + 'px'; }
    else { nd = Math.max(10, B.snap(d0 + dy / PXM)); el.style.height = Math.max(22, nd * PXM - 3) + 'px'; tip.textContent = `${B.hm(s0)}–${B.hm(s0 + nd)} · ${dur(nd)}`; tip.style.top = yOf(s0) + 'px'; }
  };
  const auto = () => {
    if (!moved) return;
    const r = sc.getBoundingClientRect();
    const v = lastY < r.top + 40 ? -8 : lastY > r.bottom - 40 ? 8 : 0;
    if (v) { sc.scrollTop += v; paint(); }
    raf = requestAnimationFrame(auto);
  };
  const move = (ev) => {
    lastY = ev.clientY;
    if (!moved) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      moved = true; el.classList.add('drag');
      tip = document.createElement('div'); tip.className = 'dragtip'; $('#track').append(tip);
      raf = requestAnimationFrame(auto);
    }
    ev.preventDefault();
    if (mode === 'move') {
      const hit = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.dataset?.drop);
      const nd2 = hit && hit.dataset.drop !== S.day ? hit.dataset.drop : null;
      if (nd2 !== overDay) { document.querySelectorAll('.dcol.drop').forEach((x) => x.classList.remove('drop')); if (nd2) hit.classList.add('drop'); overDay = nd2; }
    }
    paint();
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    cancelAnimationFrame(raf); tip?.remove();
    document.querySelectorAll('.dcol.drop').forEach((x) => x.classList.remove('drop'));
    if (!moved) { S.sel = id; openBlock(id); return; }
    if (mode === 'move') {
      const toDay = overDay || found.k;
      if (toDay === found.k && ns === s0) { render(); return; }
      mutate((P) => !!B.moveBlock(P, id, toDay, ns), overDay ? `${mdw(toDay)} ${B.hm(ns)}로 옮겼어요` : `${B.hm(ns)}로 옮겼어요`);
    } else {
      if (nd === d0) { render(); return; }
      mutate((P) => !!B.resizeBlock(P, id, nd), `예상 시간 ${dur(nd)}`);
    }
  };
  addEventListener('pointermove', move, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', up);
});

// ---------- 자유 모드: 패널 옮기기·크기 ----------
stage.addEventListener('pointerdown', (e) => {
  if (S.mode !== 'free') return;
  const pn = e.target.closest('.panel'); if (!pn) return;
  const head = e.target.closest('.ph'), rz = e.target.closest('.rz');
  if ((!head && !rz) || (head && e.target.closest('button,a,input'))) return;
  e.preventDefault();
  const id = pn.dataset.id, r = S.free[id], r0 = { ...r }, x0 = e.clientX, y0 = e.clientY;
  pn.classList.add(rz ? 'resizing' : 'dragging');
  IDS.forEach((x) => (panel(x).style.zIndex = x === id ? 35 : ''));
  const move = (ev) => {
    const dx = (ev.clientX - x0) / scale, dy = (ev.clientY - y0) / scale;
    if (rz) { r.w = clamp(r0.w + dx, 260, W - r0.x - 4); r.h = clamp(r0.h + dy, 120, VH - r0.y - 4); }
    else { r.x = clamp(r0.x + dx, -r.w + 120, W - 120); r.y = clamp(r0.y + dy, TOPY() - 8, VH - 60); }
    Object.assign(pn.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); pn.classList.remove('dragging', 'resizing'); saveLayout(); if (rz) render(); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
});

// ---------- 시작 ----------
let fitT;
addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(() => { fit(); applyLayout(); S._scrollTo = null; render(); }, 80); });
addEventListener('storage', (e) => {
  if (e.key === ST.P_KEY) { P = ST.loadP(); render(); }
  else if (e.key === TK.PLAN_KEY) { DOC = ST.loadDoc(); render(); }
  else if (['decide.v1', 'sab.cache', 'projects.v1', 'exam.v1'].includes(e.key)) render();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  render(); loadEvents();
  ST.pullP(P).then((r) => { if (r) { P = r; render(); } });
});
setInterval(() => { $('#clock').textContent = B.hm(Math.round((nowMs() - new Date(...TODAY.split('-').map((x, i) => (i === 1 ? +x - 1 : +x))).getTime()) / 60000)); }, 1000);
let lastMin = Math.floor(nowMs() / 60000);
setInterval(() => { const m = Math.floor(nowMs() / 60000); if (m !== lastMin && !document.querySelector('.blk.drag') && !document.querySelector('dialog[open]')) { lastMin = m; render(); } }, 5000);
fit(); applyLayout(); render(); loadEvents();
ST.pullP(P).then((r) => { pReady = true; if (r) { P = r; render(); toast('15577 온라인 기록과 맞췄어요'); } });
setTimeout(() => ST.syncDoc(DOC, render), 1200);
document.fonts && document.fonts.ready.then(() => applyLayout());
