// 15577 규칙 (sabathiaWS ws/planner.js 사본, import 경로와 PLAN_KEY만 다름). WS PLANNER 창(planpanel.js)이 쓴다 (2026-11-21).
//   데이터 모양: 15577 blockplanner.v1 그대로 { cats, days: { 'YYYY-MM-DD': [블록] }, fixed, log, selfDay, schoolOff, updatedAt, ... }
//   블록: { id, title, cat, units, unit, est, dur, start(분), done, actual, review | lecture, progress, created, planStart }
//   배치: 블록은 시작 순으로 놓고 겹치면 뒤로, 수업·학원(고정)과 겹치면 그 뒤로 민다 (15577 layout)
//   저장: Sabathia에서는 15577과 같은 localStorage blockplanner.v1 (ws.js가 저장·온라인 저장 bp.cloudId)
//   (sabathiaWS에서는 처음에 ws/data/15577.json 을 씀. 여기선 쓰지 않음)
import { addDays, weekdayOf, pad } from './engine/time.js';

export const PLAN_KEY = 'blockplanner.v1'; // 15577 /plan/ 과 같은 기록
export const DAY_START = 6 * 60;
const FIRESTORE = { projectId: 'p15577', apiKey: 'AIzaSyCMxJrxsFFEh9A9gDmbT4_rda9XLo8JgPE' };
const docUrl = (id) => `https://firestore.googleapis.com/v1/projects/${FIRESTORE.projectId}/databases/(default)/documents/planners/${id}?key=${FIRESTORE.apiKey}`;
export const ID_RE = /^[a-z0-9_-]{3,24}$/;

export const hm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m) % 60)}`;
export const parseHM = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
const round5 = (x) => Math.max(5, Math.round(x / 5) * 5);
const ceil5 = (x) => Math.ceil(x / 5) * 5;
const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const isLite = (b) => !!(b.review || b.lecture);
export const kindOf = (b) => (b.review ? 'review' : b.lecture ? 'lecture' : 'solve');
export const KIND_LABEL = { solve: '문풀', review: '정리', lecture: '인강' };
const elapsedMs = (b) => (b.elapsed || 0) + (b.runningSince ? Date.now() - b.runningSince : 0);
export const effDur = (b) => (b.done ? b.dur : Math.max(b.dur, Math.ceil(elapsedMs(b) / 60000)));

export function normalize(o) {
  o = o && typeof o === 'object' ? o : {};
  o.v = 1;
  o.cats = Array.isArray(o.cats) && o.cats.length ? o.cats : [{ id: 'math', name: '수학', color: '#3E6FD8' }, { id: 'eng', name: '영어', color: '#1E9E7A' }, { id: 'kor', name: '국어', color: '#C2457A' }, { id: 'etc', name: '기타', color: '#7A8699' }];
  o.days = o.days && typeof o.days === 'object' ? o.days : {};
  o.fixed = Array.isArray(o.fixed) ? o.fixed : [];
  o.log = Array.isArray(o.log) ? o.log : [];
  o.schoolOff = Array.isArray(o.schoolOff) ? o.schoolOff : [];
  o.updatedAt = o.updatedAt || 0;
  return o;
}
export const catOf = (P, id) => P.cats.find((c) => c.id === id) || { id: 'etc', name: '기타', color: '#7A8699' };
export const dayList = (P, k) => (P.days[k] ||= []);
export function findB(P, id) {
  for (const k in P.days) { const b = P.days[k].find((x) => x.id === id); if (b) return { b, k }; }
  return {};
}

// ───────── 고정 일정 (15577 fixedFor) ─────────
function isSelf(P, f, k) {
  const base = !!f.selfStudy || (!!f.school && (P.selfDay || []).includes(k));
  const flip = ((P.selfFlip || {})[k] || []).includes(f.id);
  return base !== flip;
}
export function fixedFor(P, k) {
  const wd = weekdayOf(k);
  const off = (P.schoolOff || []).includes(k);
  return P.fixed
    .filter((f) => (f.days || []).includes(wd) && (!f.only || f.only === k) && (!f.from || k >= f.from) && (!f.until || k <= f.until) && !(f.skip || []).includes(k) && !(off && f.school))
    .map((f) => ({ f, s: f.start, d: f.dur, self: isSelf(P, f, k) }))
    .sort((a, b) => a.s - b.s);
}

// ───────── 배치 (15577 layout) ─────────
export function layout(P, k, pin) {
  const fx = fixedFor(P, k).filter((x) => !x.self && !x.f.meal);
  const arr = (P.days[k] || []).map((b) => ({ b, s: b.start, d: effDur(b) }));
  arr.sort((x, y) => x.s - y.s || (x.b.id === pin ? -1 : y.b.id === pin ? 1 : 0));
  let end = -Infinity;
  const free = (t, d, lo) => t >= lo && !fx.some((f) => t < f.s + f.d && t + d > f.s);
  for (const a of arr) {
    if (a.s < end) a.s = end;
    // 옮긴 블록이 수업과 겹치면 가장 가까운 빈 칸(수업 앞이나 뒤)에 붙인다
    if (pin && a.b.id === pin && !free(a.s, a.d, end)) {
      let best = null;
      for (const f of fx) for (const c of [f.s - a.d, f.s + f.d]) if (free(c, a.d, Math.max(end, DAY_START)) && (best === null || Math.abs(c - a.s) < Math.abs(best - a.s))) best = c;
      if (best !== null) a.s = best;
    }
    let hit = true;
    while (hit) { hit = false; for (const f of fx) if (a.s < f.s + f.d && a.s + a.d > f.s) { a.s = f.s + f.d; hit = true; } }
    end = a.s + a.d;
  }
  return arr;
}
export const commit = (P, k, pin) => layout(P, k, pin).forEach((a) => { a.b.start = a.s; });
export function placeStart(P, k, today, nowMin) {
  const a = layout(P, k);
  const last = a.length ? a[a.length - 1].s + a[a.length - 1].d : null;
  if (k === today) return Math.max(last ?? 0, Math.max(DAY_START, ceil5(nowMin)));
  return last ?? 16 * 60;
}

// ───────── 상태·예상 (15577 statusOf · suggest) ─────────
export function statusOf(P, k, today, nowMin) {
  const out = new Map();
  let next = false;
  for (const a of layout(P, k)) {
    const b = a.b;
    let s = 'wait';
    if (b.done) s = 'done';
    else if (b.runningSince) s = 'run';
    else if (k < today || (k === today && a.s + a.d <= nowMin)) s = 'late';
    else if (k === today && !next) { s = 'next'; next = true; }
    out.set(b.id, s);
  }
  return out;
}
export const ST_LABEL = { late: '지연', run: '진행', next: '다음', wait: '대기', done: '완료' };
const sum = (a, f) => a.reduce((t, x) => t + (+x[f] || 0), 0);
export function suggest(P, cat, units, unit) {
  const L = P.log.filter((l) => l.cat === cat);
  if (!L.length) return null;
  const name = catOf(P, cat).name;
  if (units > 0) {
    const U = L.filter((l) => l.units > 0 && l.unit === unit);
    if (U.length) { const per = sum(U, 'actual') / sum(U, 'units'); return { min: round5(per * units), why: `${name} ${unit}당 평균 ${per.toFixed(1)}분 × ${units}` }; }
  }
  const avg = sum(L, 'actual') / L.length;
  return { min: round5(avg), why: `${name} 한 번에 평균 ${Math.round(avg)}분 (기록 ${L.length}개)` };
}
export function dayProg(P, k) {
  const items = P.days[k] || [];
  let T = 0, D = 0;
  for (const b of items) { const p = isLite(b) ? b.dur : b.est || b.dur; T += p; D += p * (b.done ? 1 : Math.max(0, Math.min(1, b.progress || 0))); }
  return { n: items.length, doneN: items.filter((b) => b.done).length, pct: T ? (D / T) * 100 : 0 };
}

// ───────── 고치기 (15577 saveSheet · complete · undone) ─────────
/** d = { title, cat, kind: solve|review|lecture, units, unit, est, start(분), actual } */
export function addBlock(P, k, d, today) {
  const review = d.kind !== 'solve', lecture = d.kind === 'lecture';
  const name = catOf(P, d.cat).name;
  const title = (d.title || '').trim() || (lecture ? name + ' 인강' : review ? name + ' 정리' : name);
  const start = Math.max(DAY_START, d.start ?? 16 * 60);
  const b = { id: uid(), title, cat: d.cat, units: review ? 0 : +d.units || 0, unit: d.unit || '문제', est: d.est, dur: d.est, start,
    elapsed: 0, runningSince: null, done: false, created: today, planStart: start };
  if (lecture) { b.lecture = true; b.progress = 0; } else if (review) b.review = true;
  dayList(P, k).push(b);
  P.lastCat = d.cat;
  commit(P, k, b.id);
  return b;
}
export function updateBlock(P, id, d) {
  const { b, k } = findB(P, id); if (!b) return null;
  const name = catOf(P, d.cat).name;
  b.review = d.kind === 'review' || undefined; b.lecture = d.kind === 'lecture' || undefined;
  if (!b.review) delete b.review; if (!b.lecture) delete b.lecture;
  b.title = (d.title || '').trim() || (b.lecture ? name + ' 인강' : b.review ? name + ' 정리' : name);
  b.cat = d.cat;
  if (!isLite(b)) { b.units = +d.units || 0; b.unit = d.unit || '문제'; } else b.units = 0;
  if (!b.done || isLite(b)) { b.est = d.est; b.dur = d.est; }
  if (d.start != null) b.start = Math.max(DAY_START, d.start);
  if (b.done && +d.actual > 0) {
    b.actual = Math.round(+d.actual); b.dur = Math.max(b.actual, 10);
    const l = P.log.find((x) => x.id === b.id);
    if (l) Object.assign(l, { title: b.title, cat: b.cat, units: b.units, unit: b.unit, actual: b.actual });
  }
  commit(P, k, b.id);
  return b;
}
export function complete(P, id, actual) {
  const { b, k } = findB(P, id); if (!b) return null;
  if (b.runningSince) { b.elapsed = elapsedMs(b); b.runningSince = null; }
  const act = Math.max(1, Math.round(actual ?? b.est ?? b.dur));
  b.done = true; b.actual = act; b.dur = Math.max(act, 10); b.doneAt = Date.now();
  if (b.lecture) b.progress = 1;
  P.log = P.log.filter((l) => l.id !== b.id);
  P.log.unshift({ id: b.id, date: k, title: b.title, cat: b.cat, units: b.units || 0, unit: b.unit || '', est: b.est, actual: act });
  if (P.log.length > 1500) P.log.length = 1500;
  commit(P, k, id);
  return b;
}
export function undone(P, id) {
  const { b, k } = findB(P, id); if (!b) return null;
  b.done = false; b.actual = null; b.dur = b.est; if (b.lecture) b.progress = 0;
  P.log = P.log.filter((l) => l.id !== id);
  commit(P, k, id);
  return b;
}
export function removeBlock(P, id) {
  const { k } = findB(P, id); if (!k) return false;
  P.days[k] = P.days[k].filter((b) => b.id !== id);
  P.log = P.log.filter((l) => l.id !== id);
  if (!P.days[k].length) delete P.days[k];
  return true;
}

// ───────── 저장 ─────────
export function loadLocal() {
  try { const r = localStorage.getItem(PLAN_KEY); return r ? normalize(JSON.parse(r)) : null; } catch { return null; }
}
export function saveLocal(P) { try { localStorage.setItem(PLAN_KEY, JSON.stringify(P)); } catch {} }
export async function loadSeed(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? normalize(await r.json()) : null; } catch { return null; }
}
export async function cloudGet(id) {
  const r = await fetch(docUrl(id), { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('15577 ' + r.status);
  const doc = await r.json();
  return normalize(JSON.parse(doc.fields?.data?.stringValue || '{}'));
}
export async function cloudPut(id, P) {
  const body = { fields: { data: { stringValue: JSON.stringify(P) }, updatedAt: { integerValue: String(P.updatedAt || 0) } } };
  const r = await fetch(docUrl(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('15577 저장 ' + r.status);
}
/** 두 기록 중 updatedAt이 새로운 쪽 */
export const newer = (a, b) => (!a ? b : !b ? a : (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a);

export { addDays };
