// 가용 시간 계산: 요일별 기상·취침 + 고정 일정(학교·학원·이동·식사) → 자유 시간 창.
// 수면 시간은 절대 자유 시간에 포함되지 않는다 (최상위 제약).
import { at, addDays, parseHM, toDateStr, weekdayOf, MIN } from './time.js';

/** 해당 날짜의 깨어 있는 구간 [start, end] (ms). 취침이 자정 이후면 다음 날로 넘어간다. */
export function awakeWindow(settings, dateStr) {
  const d = settings.days[weekdayOf(dateStr)];
  const wake = parseHM(d.wake) ?? 420;
  let sleep = parseHM(d.sleep) ?? 1410;
  if (sleep <= wake) sleep += 1440;
  return { start: at(dateStr, wake), end: at(dateStr, sleep) };
}

/** 그날 적용되는 고정 일정 (반복 요일 또는 특정 날짜) */
export function fixedFor(fixed, dateStr) {
  const wd = weekdayOf(dateStr);
  return fixed
    .filter((f) => (f.date ? f.date === dateStr : (f.weekdays ?? []).includes(wd)))
    .filter((f) => !(f.skipDates ?? []).includes(dateStr))
    .map((f) => {
      const s = parseHM(f.start);
      let e = parseHM(f.end);
      if (s == null || e == null) return null;
      if (e <= s) e += 1440;
      return { id: f.id, label: f.label, kind: f.kind, start: at(dateStr, s), end: at(dateStr, e) };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function subtract(window, busy) {
  let free = [{ start: window.start, end: window.end }];
  for (const b of busy) {
    const next = [];
    for (const f of free) {
      if (b.end <= f.start || b.start >= f.end) {
        next.push(f);
        continue;
      }
      if (b.start > f.start) next.push({ start: f.start, end: b.start });
      if (b.end < f.end) next.push({ start: b.end, end: f.end });
    }
    free = next;
  }
  return free;
}

/** 해당 시각이 속한 "논리적 하루" (자정 이후라도 아직 안 잤다면 전날) */
export function logicalDay(settings, nowMs) {
  const today = toDateStr(nowMs);
  const yesterday = addDays(today, -1);
  const y = awakeWindow(settings, yesterday);
  if (nowMs < y.end) return { date: yesterday, sleeping: false };
  const t = awakeWindow(settings, today);
  if (nowMs < t.start) return { date: today, sleeping: true }; // 기상 전
  if (nowMs >= t.end) return { date: addDays(today, 1), sleeping: true }; // 취침 후
  return { date: today, sleeping: false };
}

/**
 * fromMs 이후 horizonDays일 동안의 날짜별 정보.
 * 각 날: { date, awake, busy[], free[] (fromMs 이후만), freeMin }
 */
export function buildDays(state, fromMs, horizonDays) {
  const { settings, fixed } = state;
  const { date: first } = logicalDay(settings, fromMs);
  const minSlot = (settings.minSlotMin ?? 10) * MIN;
  const days = [];
  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(first, i);
    const awake = awakeWindow(settings, date);
    const busy = fixedFor(fixed, date);
    const free = subtract(awake, busy)
      .map((f) => ({ start: Math.max(f.start, fromMs), end: f.end }))
      .filter((f) => f.end - f.start >= minSlot);
    const freeMin = free.reduce((s, f) => s + (f.end - f.start) / MIN, 0);
    days.push({ date, awake, busy, free, freeMin });
  }
  return days;
}

export function flattenFree(days) {
  return days.flatMap((d) => d.free);
}

/** fromMs 이후 처음으로 자유 시간이 시작되는 시각 */
export function firstFreeAt(windows, fromMs) {
  for (const w of windows) {
    if (w.end > fromMs) return Math.max(w.start, fromMs);
  }
  return fromMs;
}
