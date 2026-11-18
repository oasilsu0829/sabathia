// 다일(多日) 일정 시뮬레이터.
//
// 작업(work item)을 자유 시간 창에 가장 이른 시각부터 차례로 배치한다.
// 배치 순서는 "유효 기한(마감 또는 계획한 날의 끝) → 우선 등급 → 사용자가 계획한 시작 시각 → 과목 순위"이고,
// 다음 작업을 고를 때마다 "이걸 지금 하면 마감이 있는 작업들이 더 늦어지는가?"를 EDF로 검사해
// 마감 보호(최상위 제약)를 지킨다. 수면 시간은 자유 시간 창에 없으므로 절대 배치되지 않는다.
import { MIN } from './time.js';

const CHUNK_MIN = 30;
const MIN_FRAG_MIN = 10; // 이보다 짧은 자투리 시간에는 작업을 쪼개 넣지 않는다
const EPS = 0.01;

export function clipWindows(windows, fromMs) {
  return windows
    .filter((w) => w.end > fromMs)
    .map((w) => ({ start: Math.max(w.start, fromMs), end: w.end }));
}

/** windows 앞에서부터 minutes만큼 채운다. */
function placeInto(windows, minutes) {
  let need = minutes * MIN;
  const segments = [];
  const rest = [];
  for (const w of windows) {
    if (need <= 0) {
      rest.push(w);
      continue;
    }
    const len = w.end - w.start;
    if (len < MIN_FRAG_MIN * MIN && need > len + EPS) {
      rest.push(w);
      continue;
    }
    if (len <= need) {
      segments.push({ start: w.start, end: w.end });
      need -= len;
    } else {
      segments.push({ start: w.start, end: w.start + need });
      rest.push({ start: w.start + need, end: w.end });
      need = 0;
    }
  }
  return { segments, rest, unplacedMin: need / MIN };
}

function minutesBefore(segments, due) {
  let s = 0;
  for (const g of segments) {
    if (g.start >= due) break;
    s += (Math.min(g.end, due) - g.start) / MIN;
  }
  return s;
}

const isHard = (it) => it.hardDue != null;

/** 마감까지 못 끝내는 분. 마감이 계산 범위 밖이면 판단하지 않는다(0). */
function hardLate(it, segments, horizonEnd) {
  if (!isHard(it) || it.hardDue > horizonEnd) return 0;
  return Math.max(0, it.minutes - minutesBefore(segments, it.hardDue));
}

/**
 * 마감 작업만 EDF로 배치했을 때의 부족 분.
 * guard=true면 비관 시나리오 소요 시간(guardMin)으로 계산해, 마감 보호를 보수적으로 판단한다.
 */
function edfShortfall(hardItems, windows, horizonEnd, guard = false) {
  const sorted = [...hardItems].sort((a, b) => a.hardDue - b.hardDue || a.order - b.order);
  let win = windows;
  let total = 0;
  for (const it of sorted) {
    const m = guard ? it.guardMin ?? it.minutes : it.minutes;
    const p = placeInto(win, m);
    total += hardLate({ ...it, minutes: m }, p.segments, horizonEnd);
    win = p.rest;
  }
  return total;
}

const effDue = (it) => Math.min(it.hardDue ?? Infinity, it.softDue ?? Infinity);

export function compareItems(a, b) {
  return (
    effDue(a) - effDue(b) ||
    b.tier - a.tier ||
    (a.plannedStart ?? Infinity) - (b.plannedStart ?? Infinity) ||
    a.subjectRank - b.subjectRank ||
    a.order - b.order
  );
}

/** 긴 작업은 30분 조각으로 나눠 다른 작업과 섞일 수 있게 한다(조각 순서는 유지). */
function chunk(items) {
  const out = [];
  items.forEach((it, idx) => {
    let left = it.minutes;
    let n = 0;
    while (left > EPS) {
      const m = Math.min(CHUNK_MIN, left);
      const ratio = it.guardMin != null && it.minutes > 0 ? it.guardMin / it.minutes : 1;
      out.push({ ...it, minutes: m, guardMin: m * Math.max(1, ratio), chunk: n++, order: idx * 1000 + n });
      left -= m;
    }
  });
  return out;
}

/**
 * @param items  [{ taskId, minutes, guardMin, hardDue, softDue, tier, plannedStart, subjectRank, kind }]
 * @param windows 자유 시간 창 (정렬됨)
 * @param startMs 시뮬레이션 시작 시각
 * @param horizonEnd 계산 범위의 끝 (ms)
 */
export function simulate(items, windows, startMs, horizonEnd) {
  let win = clipWindows(windows, startMs);
  let pending = chunk(items.filter((i) => i.minutes > EPS)).sort(compareItems);
  const placed = []; // { taskId, start, end }
  const byTask = new Map();
  for (const it of items) {
    byTask.set(it.taskId, {
      taskId: it.taskId,
      minutes: it.minutes,
      segments: [],
      unplacedMin: 0,
      hardDue: it.hardDue,
      softDue: it.softDue,
      kind: it.kind,
    });
  }

  while (pending.length) {
    const base = edfShortfall(pending.filter(isHard), win, horizonEnd, true);
    let chosen = null;
    let place = null;
    for (const c of pending) {
      const p = placeInto(win, c.minutes);
      const others = pending.filter((x) => x !== c && isHard(x));
      const own = isHard(c) ? hardLate({ ...c, minutes: c.guardMin ?? c.minutes }, placeInto(win, c.guardMin ?? c.minutes).segments, horizonEnd) : 0;
      const sf = edfShortfall(others, p.rest, horizonEnd, true) + own;
      if (sf <= base + EPS) {
        chosen = c;
        place = p;
        break;
      }
    }
    if (!chosen) {
      // 이론상 도달하지 않지만, 안전하게 가장 이른 마감 작업을 고른다.
      chosen = [...pending].sort((a, b) => (a.hardDue ?? Infinity) - (b.hardDue ?? Infinity))[0];
      place = placeInto(win, chosen.minutes);
    }
    const rec = byTask.get(chosen.taskId);
    rec.segments.push(...place.segments);
    rec.unplacedMin += place.unplacedMin;
    for (const g of place.segments) placed.push({ taskId: chosen.taskId, start: g.start, end: g.end });
    win = place.rest;
    pending = pending.filter((x) => x !== chosen);
  }

  let hardShortfall = 0;
  for (const rec of byTask.values()) {
    rec.segments.sort((a, b) => a.start - b.start);
    rec.finish = rec.unplacedMin > EPS ? null : rec.segments.at(-1)?.end ?? null;
    rec.hardLateMin = hardLate(rec, rec.segments, horizonEnd);
    rec.doneBySoftDue = rec.softDue == null ? rec.minutes : minutesBefore(rec.segments, rec.softDue);
    rec.softLateMin = rec.softDue == null ? 0 : Math.max(0, rec.minutes - rec.doneBySoftDue);
    hardShortfall += rec.hardLateMin;
  }

  return { byTask, timeline: mergeTimeline(placed), hardShortfall, freeLeft: win };
}

function mergeTimeline(placed) {
  const sorted = [...placed].sort((a, b) => a.start - b.start);
  const out = [];
  for (const p of sorted) {
    const last = out.at(-1);
    if (last && last.taskId === p.taskId && last.end === p.start) last.end = p.end;
    else out.push({ ...p });
  }
  return out;
}

/** [from, to) 구간에 배치된 분 (필터 조건에 맞는 작업만) */
export function minutesInRange(timeline, from, to, filter = () => true) {
  let s = 0;
  for (const t of timeline) {
    if (!filter(t)) continue;
    const a = Math.max(t.start, from);
    const b = Math.min(t.end, to);
    if (b > a) s += (b - a) / MIN;
  }
  return s;
}
