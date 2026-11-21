// Planner 2.0 — 시간 배분 제안·시간 초과 판단·수정안(PlanProposal). DOM 없음 (test/plan.mjs).
//   제안은 항상 '제안'으로만 만든다. 15577 기록은 applyProposal을 부를 때(사용자가 적용을 눌렀을 때)만 바뀐다.
import {
  blocksOn, busyOn, freeSlots, awake, lenOf, planMin, findB, moveBlock, addBlock, catForSubject, measuredMin, addDays, daysBetween, parseHM, snap, hm,
} from './blocks.js';
import { linkBlock, put } from './tasks.js';

const pid = () => 'pp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const overlap = (a, b) => a.s < b.e && b.s < a.e;

// ───────── 시간 배분 (Time Allocation) ─────────
/**
 * 아직 배치 안 된 작업 시간을 빈 시간에 나눠 넣는 제안.
 *   - 고정 일정·일정·기존 블록·수면은 피한다. 블록 사이 gap분을 띄운다
 *   - 마감 순 → 중요도 → Big 3. 마감 날을 넘기지 않는다(마감 시각이 있으면 그 전까지)
 *   - 한 덩어리는 chunkMin~chunkMax분. 여러 날로 나뉠 수 있다(작업은 하나)
 * @returns { changes: [{ taskId, title, subject, date, start, dur }], left: [{ taskId, title, min }] }
 */
export function allocate({ tasks, P, events, settings, today, nowMin = 0, days = 7, only = null, big3 = [], chunkMin = 25, chunkMax = 90, gap = 10, now = Date.now() }) {
  const list = tasks
    .filter((t) => t.status === 'todo' && t.unplaced > 0 && !t.carry && (!only || only.includes(t.id))) // 지난 미완료는 새로 만들지 않고 '이월'(같은 블록 옮기기)로
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || (b.priority || 0) - (a.priority || 0) || (big3.includes(b.id) ? 1 : 0) - (big3.includes(a.id) ? 1 : 0));
  const taken = {}; // 날짜 → 이번 제안으로 찬 시간
  const changes = [], left = [];
  for (const t of list) {
    let need = t.unplaced;
    const last = t.deadline && t.deadline >= today ? (daysBetween(today, t.deadline) < days ? t.deadline : addDays(today, days - 1)) : addDays(today, days - 1);
    for (let k = today; k <= last && need > 0; k = addDays(k, 1)) {
      const from = k === today ? snap(nowMin + 4) : 0;
      // 배분 제안은 식사 시간도 피한다 (충돌로 보지는 않지만 공부를 넣지는 않음)
      const meals = busyOn(P, k, events).filter((x) => x.soft);
      let slots = freeSlots(P, k, events, settings, { fromMin: from, minLen: Math.min(chunkMin, need), extra: [...meals, ...(taken[k] || [])], now });
      if (k === t.deadline && t.deadlineTime) {
        const cut = parseHM(t.deadlineTime);
        if (cut != null) slots = slots.map((x) => ({ s: x.s, e: Math.min(x.e, cut) })).filter((x) => x.e - x.s >= Math.min(chunkMin, need));
      }
      for (const sl of slots) {
        if (need <= 0) break;
        let s = sl.s;
        // 앞 블록과 붙어 있으면 gap만큼 띄운다
        if (blocksOn(P, k).some((b) => b.start + lenOf(b, now) === s) || (taken[k] || []).some((x) => x.e - gap === s)) s += gap;
        let room = sl.e - s;
        while (need > 0 && room >= Math.min(chunkMin, need)) {
          let d = Math.min(need, chunkMax, room);
          // 끝에 chunkMin보다 작은 조각이 남지 않게: 다 들어가면 다 넣고, 아니면 chunkMin을 남겨 둔다
          if (need - d > 0 && need - d < chunkMin) d = room >= need && need - chunkMax < chunkMin ? need : need - chunkMin;
          d = Math.floor(d / 5) * 5;
          if (d < Math.min(chunkMin, need)) break;
          changes.push({ taskId: t.id, title: t.title, subject: t.subject, date: k, start: s, dur: d });
          (taken[k] ||= []).push({ s, e: s + d + gap });
          need -= d; s += d + gap; room = sl.e - s;
        }
      }
    }
    if (need > 0) left.push({ taskId: t.id, title: t.title, min: need });
  }
  return { changes, left };
}

/** 배분 제안 하나를 15577 블록으로 만든다. 새 블록은 작업에 연결된다(작업은 그대로 하나) */
export function applyAlloc(P, doc, ch, now = Date.now()) {
  const b = addBlock(P, ch.date, { title: ch.title, cat: catForSubject(P, ch.subject), kind: 'solve', est: ch.dur, start: ch.start }, ch.date);
  linkBlock(doc, b.id, ch.taskId, now);
  return b;
}

// ───────── 시간 초과 · 충돌 → 수정안 ─────────
/** 블록이 예상보다 늘어난 분(15577 타이머 또는 사용자가 적은 실제 시간·늘린 길이만). 모르면 null */
export function overrunOf(b, now = Date.now()) {
  const plan = b.est || b.dur;
  const m = measuredMin(b, now);
  if (m != null && m > plan) return m - plan;
  if (!b.done && b.dur > plan) return b.dur - plan;
  return null;
}

/**
 * 블록 src가 끝나는 시각 이후로 겹치는 뒤 블록들을 미는 수정안.
 *   - 뒤 블록이 수업·학원·일정에 걸리면 그 뒤로
 *   - 취침 시간을 넘기면 다음 날 빈 시간으로 (마감이 그날이면 '마감 영향'으로 표시)
 * @returns PlanProposal 또는 null(겹치는 블록이 없을 때)
 */
export function shiftProposal({ P, k, events, settings, srcId, deadlines = new Map(), fromMin = 0, now = Date.now() }) {
  const src = findB(P, srcId).b;
  if (!src) return null;
  const hard = busyOn(P, k, events).filter((x) => !x.soft);
  const aw = awake(settings, k);
  let cursor = src.start + lenOf(src, now);
  const after = blocksOn(P, k).filter((b) => b.id !== src.id && !b.done && b.start >= src.start);
  const changes = [], deadlineHit = [];
  let toTomorrow = [], lifted = false;
  for (const b of after) {
    if (b.start >= cursor) break;
    const len = lenOf(b, now);
    if (fromMin > cursor) lifted = true;
    let s = Math.max(cursor, fromMin); // 오늘이면 이미 지난 시각으로는 옮기지 않는다
    let moved = true;
    while (moved) { moved = false; for (const f of hard) if (overlap({ s, e: s + len }, f)) { s = f.e; moved = true; } }
    if (s + len > aw.e) { toTomorrow.push(b); continue; }
    changes.push({ blockId: b.id, title: b.title, from: { date: k, start: b.start }, to: { date: k, start: s } });
    cursor = s + len;
  }
  // 오늘 안에 못 들어가는 블록은 다음 날 빈 시간으로
  if (toTomorrow.length) {
    const nk = addDays(k, 1);
    const extra = [];
    for (const b of toTomorrow) {
      const len = lenOf(b, now);
      const slot = freeSlots(P, nk, events, settings, { minLen: len, extra }).find((x) => x.e - x.s >= len);
      if (!slot) continue;
      changes.push({ blockId: b.id, title: b.title, from: { date: k, start: b.start }, to: { date: nk, start: slot.s } });
      extra.push({ s: slot.s, e: slot.s + len + 10 });
      const dl = deadlines.get(b.id);
      if (dl && dl <= k) deadlineHit.push(b.title);
    }
  }
  if (!changes.length) return null;
  const over = overrunOf(src, now);
  const first = changes[0];
  const delta = first.to.date === first.from.date ? first.to.start - first.from.start : null;
  const names = changes.map((c) => c.title).slice(0, 2).join('·') + (changes.length > 2 ? ` 외 ${changes.length - 2}개` : '');
  const head = over != null ? `${src.title}이(가) 예상보다 ${Math.round(over)}분 늦어졌습니다.` : `${src.title}이(가) 뒤 블록과 겹칩니다.`;
  const tail = changes.every((c) => c.to.date === k)
    ? lifted ? `${names}을(를) 지금(${hm(changes[0].to.start)})부터 이어서 하도록 옮기는 방안을 추천합니다.` : `${names}을(를) ${delta}분 뒤로 이동하는 방안을 추천합니다.`
    : `${names}을(를) 뒤로 미루고, 오늘 안에 못 들어가는 블록은 ${md(addDays(k, 1))} 빈 시간으로 옮기는 방안을 추천합니다.`;
  return {
    id: pid(), kind: 'shift', date: k, source: src.id, affectedBlockIds: changes.map((c) => c.blockId), changes,
    reason: `${head} ${tail}`, impact: { deadline: deadlineHit, tomorrow: changes.filter((c) => c.to.date !== k).length },
    status: 'pending', sig: sigOf(src, k, now, after), created: now,
  };
}
const md = (k) => { const [, m, d] = k.split('-').map(Number); return `${m}/${d}`; };
/** 같은 상황인지 알아보는 표시: '유지'를 고른 상황은 다시 묻지 않는다 */
export function sigOf(src, k, now, after) {
  return `${k}|${src.id}|${src.start}+${lenOf(src, now)}|` + after.filter((b) => !b.done).map((b) => `${b.id}@${b.start}`).join(',');
}

/**
 * 그날 실질적인 문제가 있는 시간 초과만 고른다(명세 §4: 예상보다 길어졌다는 이유만으로는 알리지 않음).
 *   뒤 블록과 겹치거나, 수업·학원과 겹치거나, 취침을 넘길 때.
 * @returns [{ srcId, over, kind: 'block'|'fixed'|'sleep' }]
 */
export function overrunIssues({ P, k, events, settings, now = Date.now() }) {
  const out = [];
  const hard = busyOn(P, k, events).filter((x) => !x.soft);
  const aw = awake(settings, k);
  const list = blocksOn(P, k);
  for (const b of list) {
    const over = overrunOf(b, now);
    if (over == null || over < 5) continue;
    const it = { s: b.start, e: b.start + lenOf(b, now) };
    const nextHit = list.some((x) => x.id !== b.id && !x.done && x.start >= b.start && x.start < it.e);
    const fixedHit = !b.done && hard.some((f) => overlap(it, f));
    const sleepHit = !b.done && it.e > aw.e;
    if (nextHit || fixedHit || sleepHit) out.push({ srcId: b.id, over, kind: nextHit ? 'block' : fixedHit ? 'fixed' : 'sleep' });
  }
  return out;
}

/** 수정안 적용. 블록이 제안 때와 다른 자리에 있으면(그 사이 고쳤으면) 적용하지 않는다 */
export function applyProposal(P, prop) {
  for (const c of prop.changes) {
    const { b, k } = findB(P, c.blockId);
    if (!b || b.done || k !== c.from.date || b.start !== c.from.start) return { ok: false, why: `${c.title} 블록이 그 사이 바뀌었어요` };
  }
  for (const c of prop.changes) moveBlock(P, c.blockId, c.to.date, c.to.start);
  return { ok: true };
}
/** 수정안 상태 기록 (applied · kept · dismissed) */
export function settle(doc, prop, status, now = Date.now()) {
  return put(doc, 'props', { ...prop, status, settledAt: now }, now);
}

/** 충돌한 블록 하나를 가장 가까운 빈 시간으로 옮기는 자리 (그날 안, 없으면 null) */
export function nearestFree({ P, k, events, settings, id, now = Date.now() }) {
  const b = findB(P, id).b;
  if (!b) return null;
  const len = lenOf(b, now);
  const slots = freeSlots(P, k, events, settings, { minLen: len, ignore: id, now });
  let best = null;
  for (const sl of slots) for (const s of [sl.s, sl.e - len]) {
    if (s < sl.s || s + len > sl.e) continue;
    if (best == null || Math.abs(s - b.start) < Math.abs(best - b.start)) best = s;
  }
  return best == null ? null : snap(best);
}

/** 마감까지 빈 시간(분): 오늘은 지금 이후, 마감 날은 마감 시각까지 */
export function freeUntil({ P, events, settings, today, nowMin, deadline, deadlineTime, maxDays = 21, now = Date.now() }) {
  if (!deadline || deadline < today) return 0;
  let sum = 0;
  const last = daysBetween(today, deadline) > maxDays ? addDays(today, maxDays) : deadline;
  for (let k = today; k <= last; k = addDays(k, 1)) {
    let sl = freeSlots(P, k, events, settings, { fromMin: k === today ? nowMin : 0, minLen: 15, now });
    if (k === deadline && deadlineTime) { const c = parseHM(deadlineTime); if (c != null) sl = sl.map((x) => ({ s: x.s, e: Math.min(x.e, c) })).filter((x) => x.e > x.s); }
    sum += sl.reduce((a, x) => a + x.e - x.s, 0);
  }
  return sum;
}

export { hm, planMin };
