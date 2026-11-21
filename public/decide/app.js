// 판단 (DEC-09) 화면. 데이터는 sources.js가 15577·일정·장부·시험대비에서 읽고, 판단은 engine/decide.js가 한다.
// 이 화면이 쓰는 저장값은 decide.v1 하나뿐이다(다른 앱의 기록은 고치지 않는다).
import { decide, fmtLoss, blockRange } from './engine/decide.js';
import { DEFAULT_SETTINGS, SUBJECTS, KINDS } from './engine/config.js';
import { remainingOf, estimateOf } from './engine/planner.js';
import { fmtTime, fmtDur, relDayLabel, weekdayOf, weekdayLabel, roundTo, toDateStr, addDays, shortDate } from './engine/time.js';
import { buildState } from './sources.js';

const LS = 'decide.v1';
const SUBJ_COLOR = { math: '#3E6FD8', korean: '#C2457A', english: '#1E9E7A', science: '#8A5CD1', other: '#7A8699' };
const MODE_LABEL = { normal: '평상시', risk: '일정 위험', exam: '시험 집중' };
const SOURCE = { plan: ['15577', '/plan/'], events: ['일정', '/schedule/'], projects: ['장부', '/projects/'] };
// 시험대비(/exam/)의 EXAM 상수와 같은 날짜. 다음 시험 때는 설정에서 바꾼다
const DEFAULT_EXAMS = [{ id: 'final-2026-2', name: '2학기 기말고사', date: '2026-12-10', subjects: [] }];

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
const setOv = (id, patch) => {
  L.ov[id] = { ...(L.ov[id] || {}), ...patch };
  for (const k of Object.keys(L.ov[id])) if (L.ov[id][k] == null || L.ov[id][k] === '') delete L.ov[id][k];
  save();
};

// ───────── 시각 (?now=2026-11-18T21:00 으로 고정 가능, 검증용) ─────────
const nowMs = () => {
  const q = new URLSearchParams(location.search).get('now');
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
const pill = (s) => h('span.pill', { style: { '--c': SUBJ_COLOR[s] || SUBJ_COLOR.other } }, SUBJECTS[s]?.label ?? s);
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ───────── 데이터 모으기 ─────────
let events = null;
async function loadEvents() {
  try { events = window.SabathiaToday ? await SabathiaToday.events() : []; } catch { events = []; }
  render();
}

let R = null, META = null, TODAY = null;
function compute() {
  const now = nowMs();
  TODAY = toDateStr(now);
  const { state, meta } = buildState({
    plan: json('blockplanner.v1'),
    events: events || (json('sab.cache') || {}).events || [],
    projects: json('projects.v1'),
    examDoc: json('exam.v1'),
    local: L,
    today: TODAY,
  });
  META = meta;
  R = decide(state, now);
  R.state = state;
  TODAY = R.today;
}

// ───────── 렌더 ─────────
const root = document.getElementById('root');
function render() {
  if (sheetOpen) return; // 시트가 열려 있으면 입력을 지우지 않게 닫힌 뒤에 그린다
  compute();
  document.documentElement.dataset.mode = R.mode;
  const left = [mainCard(), nowStrip(), stats(), sim(), checkins()];
  const right = [timeline(), deadlines(), R.exam.active && needs(), week(), settings()];
  root.replaceChildren(
    h('div.page-head',
      h('h1.page-title', '지금 할 일'),
      h('span.page-sub', R.exam.active ? `${MODE_LABEL[R.mode]} · ${R.exam.during ? '시험 기간' : 'D-' + R.exam.dDay}` : MODE_LABEL[R.mode]),
      h('a.btn.sm.line', { href: '/decide/ws' }, 'WS 화면')),
    h('p.lead', sourceLine()),
    h('div.cols', h('div', left), h('div', right)),
  );
  report();
}

function sourceLine() {
  const c = META.counts;
  const bits = [`15577 블록 ${c.blocks}개`, events == null ? '일정 불러오는 중' : `일정 ${c.events}개`];
  if (c.projects) bits.push(`장부 ${c.projects}개`);
  return bits.join(' · ') + ' — 이 기록을 읽어 판단해. 규칙 기반이라 AI를 부르지 않아.';
}

function taskOf(id) { return R.state.tasks.find((t) => t.id === id); }

function mainCard() {
  const c = R.card;
  const t = c.taskId ? taskOf(c.taskId) : null;
  const acts = [];
  if (t) {
    const [srcName, href] = SOURCE[t.source] || SOURCE.plan;
    acts.push(h('a.btn', { href }, `${srcName}에서 열기`));
    acts.push(h('button.btn.line', { type: 'button', onclick: () => openTask(t.id) }, '시간·마감'));
  }
  if (c.type === 'empty') acts.push(h('a.btn', { href: '/plan/' }, '15577 열기'));
  return h('section.main', { 'data-type': c.type },
    h('div.eyebrow', c.eyebrow),
    h('h2', c.title),
    h('p', c.message),
    t && h('div.meta-row', pill(t.subject), h('span.tag', t.lite || KINDS[t.kind]), h('span.muted', `남은 ${fmtDur(remainingOf(t))}`),
      t.deadline && h('span.tag.amber', `마감 ${relDayLabel(t.deadline, TODAY)}${t.deadlineTime ? ' ' + t.deadlineTime : ''}`)),
    c.type === 'sleep' && c.next && h('p', { style: { marginTop: '10px' } }, `다음: ${relDayLabel(toDateStr(c.next.start), TODAY)} ${fmtTime(c.next.start)} ${c.next.task?.title ?? ''}`),
    acts.length > 0 && h('div.acts', acts));
}

function nowStrip() {
  const p = R.plannedNow, f = R.fixedNow;
  if (!p && !f) return null;
  const STATUS = { todo: '시작 전', doing: '타이머 켜짐', paused: '일시정지', done: '완료' };
  return h('div.now', h('span.dot'),
    f ? h('span', h('b', f.label), h('span.muted', ` 중 · ${fmtTime(f.end)}까지`))
      : h('span', h('span.muted', '계획상 지금 '), h('b', p.title), h('span.muted', ` ${p.start}–${p.end} · 15577 기록: ${STATUS[p.status]}`)));
}

function stats() {
  const t = R.today_;
  const lo = roundTo(t.slack.lo, 5), hi = roundTo(t.slack.hi, 5);
  const stat = (k, v, s) => h('div.stat', h('div.k', k), h('div.v', v), h('div.s', s));
  return h('div.stats',
    stat('남은 가용 시간', fmtDur(t.freeMin), `취침 ${fmtTime(t.end)} 전까지`),
    stat('오늘 배치', fmtDur(t.work.exp), t.work.high - t.work.low >= 5 ? `길어지면 최대 ${fmtDur(t.work.high)}` : '예상대로'),
    stat('여유', lo === hi ? fmtDur(lo) : `${lo}~${hi}분`, lo === 0 && hi === 0 ? '여유 없음' : '오차 범위 반영'));
}

function sim() {
  const d = R.delay;
  if (R.sleeping || !d.per) return null;
  const [hLo, hHi] = d.hardRange, [rLo, rHi] = d.reviewLossRange;
  const row = (k, v, hot) => h('div.sim-row', { class: hot ? 'hot' : '' }, h('span', k), h('b', v));
  const quiet = d.severity === 'none';
  return h('details.sim', { open: !quiet, 'data-sev': d.severity },
    h('summary', h('span', `${R.state.settings.delayMin}분 미루면?`), h('span.verdict', quiet ? '큰 영향 없음' : d.severity === 'low' ? '오래 걸리면 영향' : '영향 있음')),
    h('div.sim-body',
      row('마감 부족', hHi > 1 ? fmtLoss(hLo, d.per.exp.hardDiff, hHi) : '영향 없음', hHi > 1),
      row('복습 가능 시간', rHi > 1 ? `${fmtLoss(rLo, d.per.exp.reviewLoss, rHi)} 감소` : '영향 없음', rHi >= 15),
      d.pushed.length > 0 && row('다음 날로 밀림', d.pushed.slice(0, 3).map((p) => `${taskOf(p.taskId)?.title} ${Math.round(p.minutes)}분`).join(', '), false),
      h('p.hint', { style: { marginTop: '8px' } }, '지금 시작하는 계획과 미룬 계획을 마감까지 여러 날로 비교했어. 과목별 오차 범위를 반영한 값이야.')));
}

function checkins() {
  if (!R.checkins.length) return null;
  return h('section.sec',
    h('div.sec-head', h('h2.sec-title', '확인 필요')),
    h('p.hint', '계획 시간이 지났는데 15577에 완료 표시가 없어. 실제로 어땠는지는 추측하지 않고 남은 일로 계산해.'),
    h('ul.list', R.checkins.map((t) => h('li', h('div.row',
      h('div.bd', h('div.tt', t.title), h('div.sub', `${relDayLabel(t.date, TODAY)} ${t.start}–${t.end}`)),
      h('div.check-acts',
        h('a.btn.sm', { href: '/plan/' }, '15577'),
        h('button.btn.sm.line', { type: 'button', onclick: () => openTask(t.id) }, '남은 시간'),
        h('button.btn.sm.line', { type: 'button', onclick: () => setOv(t.id, { ackAt: Date.now() }) }, '아직')))))));
}

function timeline() {
  const fixed = R.days[0].busy.filter((b) => b.end > R.now);
  const items = [
    ...R.timelineToday.map((p) => ({ s: p.start, e: p.end, p })),
    ...fixed.map((b) => ({ s: Math.max(b.start, R.now), e: b.end, b })),
  ].sort((a, b) => a.s - b.s);
  return h('section.sec',
    h('div.sec-head', h('h2.sec-title', R.sleeping ? '다음 날 계획' : '오늘 배치'), h('span.sec-count.muted', '엔진 추천 순서')),
    items.length
      ? h('ul.list', items.map((x) => x.b
          ? h('li', h('div.row.fixed', h('span.tm', fmtTime(x.s)), h('span.bd.tt', x.b.label), h('span.rt', `~${fmtTime(x.e)}`)))
          : h('li', h('button.row', { type: 'button', onclick: () => openTask(x.p.taskId) },
              h('span.tm', fmtTime(x.s)),
              h('span.bar', { style: { '--c': SUBJ_COLOR[x.p.task.subject] } }),
              h('span.bd', h('div.tt', x.p.task.title), shiftNote(x.p) && h('div.sub', shiftNote(x.p))),
              h('span.rt', fmtDur((x.e - x.s) / 60000))))))
      : h('p.hint', '오늘 남은 작업이 없어.'));
}

function shiftNote(p) {
  const t = p.task, br = blockRange(t);
  const bits = [];
  if (remainingOf(t) !== estimateOf(t)) bits.push(`남은 ${remainingOf(t)}분 / 블록 ${estimateOf(t)}분`);
  if (br && Math.abs(p.start - br.start) >= 15 * 60000 && br.start > R.now) bits.push(`15577 블록 ${t.start}`);
  if (t.source === 'projects') bits.push(t.estimateGuessed ? '장부 · 예상 60분(임시)' : '장부');
  if (t.source === 'events') bits.push('일정 마감');
  return bits.join(' · ');
}

function deadlines() {
  const list = META.deadlines.filter((d) => d.date <= addDays(TODAY, 14));
  if (!list.length) return null;
  const linkCount = (id) => R.state.tasks.filter((t) => t.link === id).length;
  return h('section.sec',
    h('div.sec-head', h('h2.sec-title', '마감'), h('span.sec-count.muted', '일정 앱 · 14일')),
    h('p.hint', '15577 블록과 연결하거나 예상 시간을 넣으면 마감 위험 계산에 들어가.'),
    h('ul.list', list.map((d) => {
      const n = linkCount(d.id);
      const state = n ? h('span.tag.ok', `블록 ${n}개 연결`) : d.estimateMin ? h('span.tag', `예상 ${fmtDur(d.estimateMin)}`) : h('span.tag.amber', '시간 미정');
      const late = R.risks.exp.some((r) => r.task.id === d.id || r.task.link === d.id);
      return h('li', h('button.row', { type: 'button', onclick: () => openDeadline(d) },
        h('span.tm', relDayLabel(d.date, TODAY)),
        h('span.bd', h('div.tt', d.title), h('div.sub', [d.time ? `${d.time}까지` : '', d.kind === 'deadline' ? '마감' : '할 일'].filter(Boolean).join(' · '))),
        late ? h('span.tag.warn', '위험') : state));
    })));
}

function needs() {
  const list = R.needs;
  const max = Math.max(1, ...list.map((n) => n.pending || n.minutes / 30));
  return h('section.sec',
    h('div.sec-head', h('h2.sec-title', `${R.exam.exam.name} 필요도`), h('span.sec-count.muted', R.exam.during ? '시험 기간' : `D-${R.exam.dDay}`)),
    h('p.hint', '고정된 과목 순위보다 실제로 남은 공부량(시험대비 이번 주 할 일, 15577 정리·시험 블록)을 먼저 봐.'),
    list.map((n) => h('div.need', pill(n.subject),
      h('div.track', h('i', { style: { width: `${((n.pending || n.minutes / 30) / max) * 100}%`, '--c': SUBJ_COLOR[n.subject] } })),
      h('span.muted', [n.pending ? `${n.pending}개` : '', n.minutes ? fmtDur(n.minutes) : '', !n.pending && !n.minutes ? '—' : ''].filter(Boolean).join(' · ')))),
    list.some((n) => n.practiceDone >= 180) &&
      h('p.hint', { style: { marginTop: '6px' } }, list.filter((n) => n.practiceDone >= 180).map((n) => `${SUBJECTS[n.subject].label}은 최근 7일 숙제로 ${fmtDur(n.practiceDone)} 풀었어 — 추가 문제풀이 필요도는 낮을 수 있어.`).join(' ')));
}

function week() {
  const max = Math.max(60, ...R.week.map((d) => d.freeMin));
  return h('section.sec',
    h('div.sec-head', h('h2.sec-title', '7일 가용 시간')),
    h('div.week', R.week.map((d) => {
      const wd = weekdayOf(d.date);
      const dues = META.deadlines.filter((x) => x.date === d.date).length + d.dues.filter((t) => t.source === 'plan' && !t.link).length;
      return h('div.wk', { title: `${shortDate(d.date)} 가용 ${fmtDur(d.freeMin)} · 배치 ${fmtDur(d.workMin)}` },
        h('div.col',
          h('i.free', { style: { height: `${(d.freeMin / max) * 100}%` } }),
          h('i.work', { class: d.workMin > d.freeMin + 1 ? 'over' : '', style: { height: `${(Math.min(d.workMin, d.freeMin) / max) * 100}%` } })),
        h('div.lb', { class: wd === 0 || wd === 6 ? 'we' : '' }, d.date === TODAY ? '오늘' : weekdayLabel(wd)),
        h('div.du', dues ? `마감 ${dues}` : ''));
    })),
    h('div.legend', h('span', h('i', { style: { background: 'var(--accent-soft)' } }), '가용'), h('span', h('i', { style: { background: 'var(--mode)' } }), '배치된 작업')));
}

function seg(options, value, onPick) {
  return h('div.seg', options.map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(String(v) === String(value)), onclick: () => onPick(v) }, label)));
}

function settings() {
  const s = L.settings;
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  const cal = META.calibration;
  const unc = R.state.settings.uncertainty;
  const exams = R.state.settings.exams;
  let newName = '', newDate = '';
  return h('section.sec',
    h('details.cfg', { open: !!uiOpenCfg, ontoggle: (e) => (uiOpenCfg = e.target.open) },
      h('summary', h('div.sec-head', h('h2.sec-title', '설정'), h('span.sec-count.muted', '기상·취침 · 시험 · 기준'))),
      h('p.hint', '취침 시각 이후로는 어떤 작업도 배치하지 않아. 학교·점심 같은 고정 블록은 15577에서, 학원 같은 일정은 일정 앱에서 읽어.'),
      ORDER.map((wd) => h('div.sleep',
        h('b', { class: wd === 0 || wd === 6 ? 'we' : '' }, weekdayLabel(wd)),
        h('input.in', { type: 'time', value: s.days[wd].wake, 'aria-label': `${weekdayLabel(wd)} 기상`, onchange: (e) => e.target.value && ((s.days[wd] = { ...s.days[wd], wake: e.target.value }), save()) }),
        h('span.muted', '→'),
        h('input.in', { type: 'time', value: s.days[wd].sleep, 'aria-label': `${weekdayLabel(wd)} 취침`, onchange: (e) => e.target.value && ((s.days[wd] = { ...s.days[wd], sleep: e.target.value }), save()) }))),
      h('div.setting', h('span', '시험'), h('span.muted.small', `D-${s.examModeDays}부터 시험 집중`)),
      h('ul.list', exams.map((e) => h('li', h('div.row',
        h('span.bd', h('div.tt', e.name), h('div.sub', `${shortDate(e.date)}${e.from ? ' · 15577 D-day' : ''}`)),
        !e.from && h('button.btn.sm.line', { type: 'button', onclick: () => { s.exams = s.exams.filter((x) => x.id !== e.id); save(); } }, '삭제'))))),
      h('div.grid2', { style: { marginTop: '6px' } },
        h('input.in', { placeholder: '시험 이름', oninput: (e) => (newName = e.target.value) }),
        h('input.in', { type: 'date', oninput: (e) => (newDate = e.target.value) })),
      h('button.btn.line.block', { type: 'button', style: { marginTop: '8px' }, onclick: () => {
        if (!newName.trim() || !newDate) return toast('시험 이름과 날짜를 넣어 줘.');
        s.exams = [...(s.exams || []), { id: 'e' + Date.now().toString(36), name: newName.trim(), date: newDate, subjects: [] }];
        save();
      } }, '시험 추가'),
      h('div.setting', h('span', '지연 시뮬레이션'), seg([[15, '15분'], [30, '30분'], [60, '60분']], s.delayMin, (v) => ((s.delayMin = v), save()))),
      h('div.setting', h('span', '시험 직전 (복습 우선)'), seg([[3, 'D-3'], [7, 'D-7'], [10, 'D-10']], s.nearExamDays, (v) => ((s.nearExamDays = v), save()))),
      h('div.setting', h('span', '지연 경고 기준'), seg([[10, '10분'], [15, '15분'], [30, '30분']], s.thresholds.reviewLossMin, (v) => ((s.thresholds = { ...s.thresholds, reviewLossMin: v }), save()))),
      h('div.setting', h('span', '과목별 소요 시간 오차'), h('span.muted.small', '15577 예상→실제 기록 5건부터 자동 보정')),
      Object.keys(SUBJECTS).map((k) => {
        const [lo, hi] = unc[k];
        const c = cal[k];
        return h('div.unc', pill(k), h('span', `${Math.round(lo * 100)}% ~ +${Math.round(hi * 100)}%`),
          h('span.muted', c ? `${c.calibrated ? '기록으로 보정' : '임시값'} · 기록 ${c.n}건 · 평균 실제/예상 ${Math.round(c.mean * 100)}%` : '임시값 · 기록 없음'));
      }),
      L.log.length > 0 && h('p.hint', { style: { marginTop: '8px' } }, logSummary())));
}
let uiOpenCfg = false;

function logSummary() {
  const up = L.log.filter((l) => l.scheduleCostMin > 0);
  const total = up.reduce((a, l) => a + l.scheduleCostMin, 0);
  const learn = up.filter((l) => l.learning).reduce((a, l) => a + l.scheduleCostMin, 0);
  return `남은 시간 수정 ${L.log.length}건. 늘어난 일정 비용 ${total}분 중 ${learn}분은 개념 확인(학습)으로 기록됐어.`;
}

// ───────── 시트 ─────────
let sheetOpen = null;
function openSheet(title, body) {
  closeSheet(true);
  const scrim = h('div.scrim', { onclick: () => closeSheet() });
  const sheet = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.sheet-head', h('h2', title), h('button.x', { type: 'button', 'aria-label': '닫기', onclick: () => closeSheet() }, '✕')),
    body);
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
Sabathia.back = () => closeSheet();
addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());

function chips(options, value, onPick) {
  const wrap = h('div.chips');
  const paint = (v) => wrap.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  for (const [v, label] of options) wrap.append(h('button.chip', { type: 'button', 'data-v': String(v), onclick: () => { paint(v); onPick(v); } }, label));
  paint(value);
  return wrap;
}

function stepper(start, onChange) {
  let v = start;
  const out = h('output', String(v));
  const step = (n) => { v = Math.max(0, v + n); out.textContent = String(v); onChange(v); };
  return h('div.stepper',
    h('button.chip', { type: 'button', onclick: () => step(-10) }, '−10'),
    out, h('span.muted', '분'),
    h('button.chip', { type: 'button', onclick: () => step(10) }, '+10'),
    h('button.chip', { type: 'button', onclick: () => step(30) }, '+30'));
}

function openTask(id) {
  const t = taskOf(id);
  if (!t) return;
  const est = estimateOf(t);
  const base = remainingOf(t) || est;
  let remain = base, reason = null;
  const delta = h('div.delta'), note = h('p.note');
  const paint = () => {
    const d = remain - base;
    delta.textContent = d === 0 ? '변경 없음' : d > 0 ? `+${d}분 · 이후 일정을 다시 계산해` : `${d}분 · 여유가 생겨`;
    delta.className = 'delta' + (d > 0 ? ' up' : d < 0 ? ' down' : '');
    note.textContent = d > 0 && reason === 'concept'
      ? '늘어난 시간은 일정 비용으로 계산하지만, 개념을 다시 본 시간은 낭비가 아니라 학습으로 기록해.'
      : d > 0 ? '늘어난 시간만큼 뒤 일정의 가능 시간이 줄어들어 (일정 비용).' : '';
  };
  paint();
  const [srcName, href] = SOURCE[t.source] || SOURCE.plan;
  const ov = L.ov[id] || {};
  let dl = ov.deadline || '', dlt = ov.deadlineTime || '';

  const linkable = META.deadlines.filter((d) => d.date >= (t.date || TODAY));
  const score = (d) => (d.title.includes(SUBJECTS[t.subject]?.label ?? '@@') ? 2 : 0) + (t.title.split(/\s+/).some((w) => w.length >= 2 && d.title.includes(w)) ? 1 : 0);
  linkable.sort((a, b) => score(b) - score(a) || a.date.localeCompare(b.date));

  const body = [
    h('div.meta-row', pill(t.subject), h('span.tag', t.lite || KINDS[t.kind]),
      t.date && h('span.muted', relDayLabel(t.date, TODAY)), t.start && h('span.muted', `${t.start}–${t.end}`),
      h('span.tag', `출처 ${srcName}`)),
    t.source === 'plan' && h('p.hint', { style: { marginTop: '10px' } }, '완료·진행률·블록 시간은 15577에서 바꿔. 여기서는 판단에만 쓰는 값만 고쳐.'),
    t.status !== 'done' && [
      h('div.f', h('span', `남은 필요 시간 · 계획 ${fmtDur(est)}`), stepper(base, (v) => { remain = v; paint(); }), delta,
        chips([['difficulty', '문제가 어려움'], ['concept', '개념 다시 확인'], ['faster', '생각보다 빠름'], ['other', '기타']], null, (v) => { reason = v; paint(); }), note),
    ],
    t.source === 'plan' && h('div.f', h('span', '마감 — 일정 앱의 할 일·마감과 연결'),
      linkable.length
        ? chips([['', '연결 안 함'], ...linkable.slice(0, 8).map((d) => [d.id, `${relDayLabel(d.date, TODAY)} ${d.title}`])], ov.link || '', (v) => (ov.link = v || null))
        : h('p.hint', '연결할 일정 마감이 없어. 아래에 직접 넣어도 돼.')),
    t.source !== 'events' && h('div.f', h('span', '마감 직접 입력 (선택)'),
      h('div.grid2',
        h('input.in', { type: 'date', value: dl, oninput: (e) => (dl = e.target.value) }),
        h('input.in', { type: 'time', value: dlt, oninput: (e) => (dlt = e.target.value) })),
      h('span.muted.small', '시각이 없으면 그날 취침 전까지로 계산해.')),
    t.source !== 'events' && h('div.f', h('span', '종류'),
      chips(Object.entries(KINDS), ov.kind || t.kind, (v) => (ov.kind = v))),
    t.kind === 'project' && h('div.f', h('span', '장기 가치 · 실사용 가능성'),
      chips([[1, '가치 낮음'], [2, '가치 보통'], [3, '가치 높음']], ov.value ?? 2, (v) => (ov.value = v)),
      chips([[1, '쓸 일 적음'], [2, '보통'], [3, '자주 씀']], ov.usage ?? 2, (v) => (ov.usage = v)),
      h('label.chips', h('input', { type: 'checkbox', checked: !!ov.examRelated, onchange: (e) => (ov.examRelated = e.target.checked) }), h('span', '지금 시험 준비에 필요한 도구 (시험 기간에도 허용)'))),
    h('div.acts', { style: { marginTop: '18px' } },
      h('a.btn.line', { href }, `${srcName} 열기`),
      h('button.btn', { type: 'button', onclick: () => {
        const patch = { link: ov.link ?? null, kind: ov.kind ?? null, deadline: dl || null, deadlineTime: dl && dlt ? dlt : null };
        if (t.kind === 'project' || ov.kind === 'project') Object.assign(patch, { value: ov.value ?? null, usage: ov.usage ?? null, examRelated: ov.examRelated || null });
        if (remain !== base) {
          if (t.source === 'projects' && t.estimateGuessed) patch.estimateMin = remain;
          else patch.remainingMin = remain;
          L.log.push({ at: Date.now(), id, subject: t.subject, kind: t.kind, estimate: est, from: base, to: remain, scheduleCostMin: remain - base, learning: reason === 'concept', reason: reason || 'other' });
          if (L.log.length > 300) L.log.splice(0, L.log.length - 300);
        }
        sheetOpen && closeSheet(true);
        setOv(id, patch);
        toast(remain !== base ? '남은 시간을 반영해서 이후 일정을 다시 계산했어.' : '저장했어.');
      } }, '저장'))];
  openSheet(t.title, body);
}

function openDeadline(d) {
  const ov = L.ov[d.id] || {};
  const linked = R.state.tasks.filter((t) => t.link === d.id);
  let est = ov.estimateMin || 0;
  openSheet(d.title, [
    h('div.meta-row', h('span.tag.amber', `${relDayLabel(d.date, TODAY)}${d.time ? ' ' + d.time : ''}까지`), d.cat && h('span.tag', { academy: '학원 수행', school: '학교 수행', report: '보고서' }[d.cat] || d.cat)),
    linked.length
      ? h('p.hint', { style: { marginTop: '12px' } }, `15577 블록 ${linked.map((t) => `${relDayLabel(t.date, TODAY)} ${t.title}`).join(', ')}이 이 마감의 작업이야.`)
      : [
          h('p.hint', { style: { marginTop: '12px' } }, '15577 블록을 열어 이 마감에 연결하거나, 따로 할 일이면 예상 시간을 넣어 줘. 0분이면 계산에서 빠져.'),
          h('div.f', h('span', '예상 시간'), stepper(est, (v) => (est = v))),
        ],
    h('div.acts', { style: { marginTop: '18px' } },
      h('a.btn.line', { href: '/schedule/' }, '일정 열기'),
      !linked.length && h('button.btn', { type: 'button', onclick: () => { closeSheet(true); setOv(d.id, { estimateMin: est || null }); toast('저장했어.'); } }, '저장')),
  ]);
}

// ───────── 홈 아이콘 보고 ─────────
function report() {
  const t = R.today_;
  const planned = t.work.exp + R.state.tasks.filter((x) => x.status === 'done' && x.date === TODAY).reduce((a, x) => a + estimateOf(x), 0);
  const done = planned - t.work.exp;
  Sabathia.report('decide', {
    mode: R.mode,
    title: R.card.title,
    badge: R.risks.exp.length,
    pct: planned ? (done / planned) * 100 : 0,
  });
}

// ───────── 시작 ─────────
render();
loadEvents();
setInterval(() => { if (document.visibilityState === 'visible') render(); }, 30_000);
setInterval(() => { if (document.visibilityState === 'visible') loadEvents(); }, 120_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { L = loadLocal(); loadEvents(); } });
addEventListener('storage', (e) => { if (['blockplanner.v1', 'projects.v1', 'exam.v1', LS].includes(e.key)) { L = loadLocal(); render(); } });
