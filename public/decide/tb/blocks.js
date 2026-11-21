// Planner 2.0 — 시간 블록(TimeBlock) = 15577 블록 그대로.
//   15577 기록(blockplanner.v1)의 days['YYYY-MM-DD'] 배열 안 블록을 같은 모양으로 고친다. id는 바꾸지 않는다.
//   블록: { id, title, cat, units, unit, est, dur, start(분), done, actual, review | lecture, progress, created, planStart, ... }
//   15577은 겹치면 뒤로 미는 배치(layout)를 쓰지만, 여기서는 사용자가 놓은 자리를 그대로 두고 겹침을 '충돌'로 보여 준다.
//   (승인하기 전에는 다른 블록을 움직이지 않는다 — 명세 §4)
// DOM 없음. Node에서 테스트한다(test/plan.mjs).

export const SNAP = 5;
export const DAY_START = 6 * 60;
export const DAY_END = 26 * 60; // 새벽 2시까지 (취침이 자정을 넘는 날)
const pad = (n) => String(n).padStart(2, '0');
export const hm = (m) => `${pad(Math.floor(((m % 1440) + 1440) % 1440 / 60))}:${pad(((Math.round(m) % 60) + 60) % 60)}`;
export const parseHM = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  return m ? +m[1] * 60 + +m[2] : null;
};
export const snap = (m) => Math.round(m / SNAP) * SNAP;
const uidB = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function dateOf(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function addDays(k, n) { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); }
export const weekday = (k) => dateOf(k).getDay();
export const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 864e5);
/** 그 주 월요일 */
export function weekStart(k) { const wd = weekday(k); return addDays(k, wd === 0 ? -6 : 1 - wd); }

// ───────── 15577 기록 ─────────
const DEFAULT_CATS = [
  { id: 'math', name: '수학', color: '#3E6FD8' }, { id: 'eng', name: '영어', color: '#1E9E7A' },
  { id: 'kor', name: '국어', color: '#C2457A' }, { id: 'sci', name: '과학', color: '#8A5CD1' }, { id: 'etc', name: '기타', color: '#7A8699' },
];
/** 빈 칸만 채운다. 15577의 normalize(학교 시간표 넣기 등)는 15577이 열릴 때 한다 */
export function ensureP(P) {
  const o = P && typeof P === 'object' ? P : { v: 1, updatedAt: 0 };
  if (!Array.isArray(o.cats) || !o.cats.length) o.cats = DEFAULT_CATS.map((c) => ({ ...c }));
  if (!o.days || typeof o.days !== 'object') o.days = {};
  if (!Array.isArray(o.fixed)) o.fixed = [];
  if (!Array.isArray(o.log)) o.log = [];
  return o;
}
export const isLite = (b) => !!(b.review || b.lecture);
export const kindOf = (b) => (b.review ? 'review' : b.lecture ? 'lecture' : 'solve');
export const KIND_LABEL = { solve: '문풀', review: '정리', lecture: '인강' };
/** 15577과 같은 계산: 정리·인강은 블록 길이, 문풀은 예상 시간 */
export const planMin = (b) => (isLite(b) ? b.dur : b.est || b.dur) || 0;
const elapsedMs = (b, now = Date.now()) => (b.elapsed || 0) + (b.runningSince ? now - b.runningSince : 0);
/** 실제로 잰 시간(분). 15577 타이머나 사용자가 적은 실제 시간만 쓴다. 없으면 null (추정하지 않는다) */
export function measuredMin(b, now = Date.now()) {
  if (b.done) return b.actual > 0 ? b.actual : null;
  const e = elapsedMs(b, now);
  return e > 0 ? Math.ceil(e / 60000) : null;
}
/** 화면에 그리는 길이: 15577 effDur와 같다 (진행 중 타이머가 블록보다 길면 그만큼) */
export const lenOf = (b, now = Date.now()) => (b.done ? b.dur : Math.max(b.dur || 0, Math.ceil(elapsedMs(b, now) / 60000))) || 30;

export const catOf = (P, id) => (P.cats || []).find((c) => c.id === id) || { id: 'etc', name: '기타', color: '#7A8699' };

// ───────── 과목 (Planner 2.0 색) ─────────
export const SUBJECTS = [
  { id: 'math', name: '수학', color: '#4D83DB' },
  { id: 'kor', name: '국어', color: '#54A49A' },
  { id: 'eng', name: '영어', color: '#C69A51' },
  { id: 'sci', name: '과학', color: '#8673CA' },
  { id: 'soc', name: '사회·역사', color: '#C87B86' },
  { id: 'etc', name: '기타', color: '#8995A3' },
];
const SUBJ_RE = [
  ['math', /수학|math|미적|기하|확통|수1|수2|함수|올림포스|쎈|백인대장|수평잡기/i],
  ['kor', /국어|문학|독서|비문학|언매|화작|문법|국좋|봄봄|어문/],
  ['eng', /영어|영단어|보카|voca|리딩|듣기|eng|능률/i],
  ['sci', /과학|물리|화학|생명|생물|지구|실험|sci/i],
  ['soc', /사회|역사|한국사|국사|통사|지리|윤리|정치|경제|soc/i],
];
/** 15577 과목(cat id·이름) 또는 제목 → Planner 과목 id */
export function subjectOf(P, catId, title = '') {
  if (['math', 'kor', 'eng', 'sci', 'etc'].includes(catId) && catId !== 'etc') return catId;
  const name = catId ? catOf(P, catId).name : '';
  for (const [id, re] of SUBJ_RE) if (re.test(name)) return id;
  for (const [id, re] of SUBJ_RE) if (re.test(title)) return id;
  return 'etc';
}
export function subjectGuess(title = '') {
  for (const [id, re] of SUBJ_RE) if (re.test(title)) return id;
  return 'etc';
}
/** Planner 과목 → 15577 과목 id (없으면 이름이 맞는 것, 그래도 없으면 etc) */
export function catForSubject(P, subj) {
  if (['math', 'kor', 'eng', 'sci'].includes(subj) && (P.cats || []).some((c) => c.id === subj)) return subj;
  const name = (SUBJECTS.find((s) => s.id === subj) || {}).name || '';
  const re = SUBJ_RE.find(([id]) => id === subj)?.[1];
  const hit = (P.cats || []).find((c) => c.name === name || (re && re.test(c.name)));
  return hit ? hit.id : 'etc';
}
export function subjectColor(id, overrides = {}) {
  return overrides[id] || (SUBJECTS.find((s) => s.id === id) || SUBJECTS[5]).color;
}

// ───────── 블록 찾기·나열 ─────────
export const dayList = (P, k) => (P.days[k] ||= []);
export function findB(P, id) {
  for (const k in P.days) {
    const list = P.days[k];
    if (!Array.isArray(list)) continue;
    const b = list.find((x) => x.id === id);
    if (b) return { b, k };
  }
  return {};
}
/** 그날 블록 (시작 순). 시작이 없는 블록은 15577에서도 쓰지 않으므로 뺀다 */
export function blocksOn(P, k) {
  return (P.days[k] || []).filter((b) => b && !b.buffer && b.start != null).slice().sort((a, b) => a.start - b.start);
}

// ───────── 고정 일정 (15577 fixedFor + Sabathia 일정의 시각 있는 일정) ─────────
function isSelf(P, f, k) {
  const base = !!f.selfStudy || (!!f.school && (P.selfDay || []).includes(k));
  const flip = ((P.selfFlip || {})[k] || []).includes(f.id);
  return base !== flip;
}
export function fixedOf(P, k) {
  const wd = weekday(k);
  const off = (P.schoolOff || []).includes(k);
  return (P.fixed || [])
    .filter((f) => (f.days || []).includes(wd) && (!f.only || f.only === k) && (!f.from || k >= f.from) && (!f.until || k <= f.until) && !(f.skip || []).includes(k) && !(off && f.school))
    .map((f) => ({ f, s: f.start, d: f.dur, self: isSelf(P, f, k) }))
    .sort((a, b) => a.s - b.s);
}
/**
 * 그날의 바쁜 시간. hard = 블록을 둘 수 없는 시간(수업·학원·일정), soft = 식사(겹쳐도 충돌로 보지 않음).
 * 자습으로 바꾼 수업은 빈 시간이다.
 */
export function busyOn(P, k, events = []) {
  const out = [];
  for (const x of fixedOf(P, k)) {
    if (x.self) continue;
    const f = x.f;
    out.push({ id: 'pf:' + f.id, label: f.school ? `${f.period}교시 ${f.title}` : f.title, s: x.s, e: x.s + x.d, kind: f.school ? 'school' : f.meal ? 'meal' : 'fixed', soft: !!f.meal });
  }
  for (const e of events || []) {
    if (!e || e.date !== k || e.kind !== 'event' || !e.time || !e.end_time) continue;
    const s = parseHM(e.time); let en = parseHM(e.end_time);
    if (s == null || en == null) continue;
    if (en <= s) en += 1440;
    out.push({ id: 'ev:' + e.id, label: e.title, s, e: en, kind: e.cat === 'academy' ? 'academy' : 'event', soft: false });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** 깨어 있는 시간 [기상, 취침] (분). settings.days[요일] = { wake, sleep } */
export function awake(settings, k) {
  const d = (settings && settings.days && settings.days[weekday(k)]) || { wake: '07:00', sleep: '23:30' };
  const w = parseHM(d.wake) ?? 420;
  let s = parseHM(d.sleep) ?? 1410;
  if (s <= w) s += 1440;
  return { s: w, e: s };
}

// ───────── 충돌 ─────────
const overlap = (a, b) => a.s < b.e && b.s < a.e;
/**
 * 블록마다 충돌 목록. type: fixed(수업·학원·일정과 겹침) · block(다른 블록과 겹침) · sleep(취침 이후·기상 전)
 * @returns Map<blockId, [{type, label, min}]>
 */
export function conflictsOn(P, k, events, settings, now = Date.now()) {
  const res = new Map();
  const hard = busyOn(P, k, events).filter((x) => !x.soft);
  const aw = awake(settings, k);
  const items = blocksOn(P, k).map((b) => ({ b, s: b.start, e: b.start + lenOf(b, now) }));
  const add = (id, c) => { if (!res.has(id)) res.set(id, []); res.get(id).push(c); };
  for (const it of items) {
    if (it.b.done) continue;
    for (const f of hard) if (overlap(it, f)) add(it.b.id, { type: 'fixed', label: f.label, min: Math.min(it.e, f.e) - Math.max(it.s, f.s) });
    if (it.e > aw.e) add(it.b.id, { type: 'sleep', label: '취침 시간', min: it.e - Math.max(it.s, aw.e) });
    else if (it.s < aw.s) add(it.b.id, { type: 'sleep', label: '기상 전', min: Math.min(it.e, aw.s) - it.s });
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (!overlap(a, b)) continue;
    const m = Math.min(a.e, b.e) - Math.max(a.s, b.s);
    if (!a.b.done) add(a.b.id, { type: 'block', label: b.b.title, id: b.b.id, min: m });
    if (!b.b.done) add(b.b.id, { type: 'block', label: a.b.title, id: a.b.id, min: m });
  }
  return res;
}

/**
 * 빈 시간: 깨어 있는 시간 − 수업·학원·일정 − 블록 (fromMin 이후). 식사는 비워 둔다(15577에서도 블록을 막지 않음).
 * @returns [{s, e}] 분 단위
 */
export function freeSlots(P, k, events, settings, { fromMin = 0, minLen = 15, ignore = null, extra = [], now = Date.now() } = {}) {
  const aw = awake(settings, k);
  let free = [{ s: Math.max(aw.s, fromMin), e: aw.e }];
  const busy = [
    ...busyOn(P, k, events).filter((x) => !x.soft),
    ...blocksOn(P, k).filter((b) => b.id !== ignore).map((b) => ({ s: b.start, e: b.start + lenOf(b, now) })),
    ...extra,
  ];
  for (const b of busy) {
    const next = [];
    for (const f of free) {
      if (b.e <= f.s || b.s >= f.e) { next.push(f); continue; }
      if (b.s > f.s) next.push({ s: f.s, e: b.s });
      if (b.e < f.e) next.push({ s: b.e, e: f.e });
    }
    free = next;
  }
  return free.filter((f) => f.e - f.s >= minLen).sort((a, b) => a.s - b.s);
}

// ───────── 고치기 ─────────
/** d = { title, cat, kind: solve|review|lecture, est, start(분), units, unit } — 다른 블록은 움직이지 않는다 */
export function addBlock(P, k, d, today = k) {
  const lite = d.kind === 'review' || d.kind === 'lecture';
  const name = catOf(P, d.cat).name;
  const est = Math.max(10, snap(+d.est || 60));
  const start = Math.max(0, snap(d.start ?? 16 * 60));
  const b = {
    id: d.id || uidB(), title: (d.title || '').trim() || (d.kind === 'lecture' ? name + ' 인강' : lite ? name + ' 정리' : name), cat: d.cat || 'etc',
    units: lite ? 0 : +d.units || 0, unit: d.unit || '문제', est, dur: est, start, elapsed: 0, runningSince: null, done: false, created: today, planStart: start,
  };
  if (d.kind === 'lecture') { b.lecture = true; b.progress = 0; } else if (d.kind === 'review') b.review = true;
  dayList(P, k).push(b);
  return b;
}
/** 옮기기: 날짜·시작만 바꾼다. 겹쳐도 밀지 않는다(충돌로 표시) */
export function moveBlock(P, id, toKey, start) {
  const { b, k } = findB(P, id);
  if (!b) return null;
  b.start = Math.max(0, Math.min(DAY_END - SNAP, snap(start)));
  if (toKey && toKey !== k) {
    P.days[k] = P.days[k].filter((x) => x.id !== id);
    if (!P.days[k].length) delete P.days[k];
    dayList(P, toKey).push(b);
  }
  return b;
}
/** 길이 바꾸기 = 예상 소요 시간 바꾸기. 끝낸 블록은 실제 시간이 따로 있어서 길이만 바꾼다 */
export function resizeBlock(P, id, dur) {
  const { b } = findB(P, id);
  if (!b) return null;
  const d = Math.max(10, snap(dur));
  b.dur = d;
  if (!b.done) b.est = d; // 15577 시트와 같다: 끝나지 않은 블록의 길이 = 예상 시간
  return b;
}
/** '아직 안 끝남': 예상 시간(est)은 그대로 두고 블록만 늘린다 → 늘어난 만큼이 시간 초과 */
export function extendBlock(P, id, min) {
  const { b } = findB(P, id);
  if (!b || b.done) return null;
  b.dur = Math.max(10, snap((b.dur || b.est || 30) + min));
  return b;
}
export function editBlock(P, id, d) {
  const { b, k } = findB(P, id);
  if (!b) return null;
  if (d.title != null) b.title = String(d.title).trim() || b.title;
  if (d.cat) b.cat = d.cat;
  if (d.kind) {
    delete b.review; delete b.lecture;
    if (d.kind === 'review') b.review = true;
    if (d.kind === 'lecture') { b.lecture = true; b.progress = b.progress || 0; }
  }
  if (d.dur != null) resizeBlock(P, id, d.dur);
  if (d.start != null || (d.date && d.date !== k)) moveBlock(P, id, d.date || k, d.start ?? b.start);
  return b;
}
/** 완료. actual(분)이 없으면 실제 시간을 적지 않는다 — 추정해서 기록하지 않음(명세 §3.4) */
export function completeBlock(P, id, actual = null) {
  const { b, k } = findB(P, id);
  if (!b) return null;
  if (b.runningSince) { b.elapsed = elapsedMs(b); b.runningSince = null; }
  b.done = true; b.doneAt = Date.now();
  if (b.lecture) b.progress = 1;
  P.log = (P.log || []).filter((l) => l.id !== b.id);
  const act = actual > 0 ? Math.round(actual) : null;
  if (act) {
    b.actual = act; b.dur = Math.max(act, 10);
    P.log.unshift({ id: b.id, date: k, title: b.title, cat: b.cat, units: b.units || 0, unit: b.unit || '', est: b.est, actual: act });
    if (P.log.length > 1500) P.log.length = 1500;
  } else delete b.actual;
  return b;
}
export function undoneBlock(P, id) {
  const { b } = findB(P, id);
  if (!b) return null;
  b.done = false; delete b.doneAt;
  if (b.actual) { b.dur = b.est || b.dur; delete b.actual; }
  if (b.lecture) b.progress = 0;
  P.log = (P.log || []).filter((l) => l.id !== id);
  return b;
}
export function removeBlock(P, id) {
  const { k } = findB(P, id);
  if (!k) return false;
  P.days[k] = P.days[k].filter((b) => b.id !== id);
  P.log = (P.log || []).filter((l) => l.id !== id);
  if (!P.days[k].length) delete P.days[k];
  return true;
}
/** 나누기: 앞 블록을 firstMin으로 줄이고 나머지를 새 블록으로(같은 작업). 새 블록은 바로 뒤에 둔다 */
export function splitBlock(P, id, firstMin) {
  const { b, k } = findB(P, id);
  if (!b || b.done) return null;
  const total = isLite(b) ? b.dur : b.est || b.dur;
  const a = Math.max(10, snap(firstMin));
  if (a >= total) return null;
  const rest = total - a;
  resizeBlock(P, id, a);
  const n = addBlock(P, k, { title: b.title, cat: b.cat, kind: kindOf(b), est: rest, start: b.start + a, unit: b.unit }, b.created);
  if (b.units > 0) { const u = Math.round((b.units * a) / total); n.units = b.units - u; b.units = u; }
  return n;
}
