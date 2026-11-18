// 시간 유틸리티. 엔진 내부의 모든 시각은 로컬 기준 epoch ms, 길이는 분 단위.
export const MIN = 60_000;
export const DAY_MS = 86_400_000;

export const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "19:30" → 1170. "24:30"처럼 24시 이후 표기도 허용한다. */
export function parseHM(s) {
  if (typeof s === 'number') return s;
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(s ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 30 || mi > 59) return null;
  return h * 60 + mi;
}

export function hmStr(mins) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** 날짜 + 하루 시작 기준 분 → epoch ms (분이 1440을 넘으면 다음 날로 넘어간다) */
export function at(dateStr, hm) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const mins = typeof hm === 'number' ? hm : parseHM(hm);
  return new Date(y, mo - 1, d, 0, mins ?? 0).getTime();
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + n).getTime());
}

export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function daysBetween(a, b) {
  return Math.round((at(b, 0) - at(a, 0)) / DAY_MS);
}

export function fmtTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDur(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}시간 ${r}분` : `${h}시간`;
}

/** 범위를 사람이 읽을 수 있게: [20, 40] → "약 20~40분", 둘이 같으면 "약 30분" */
export function fmtRange(lo, hi) {
  const a = roundTo(lo, 5);
  const b = roundTo(hi, 5);
  if (a === b) return `약 ${fmtDur(a)}`;
  if (b < 60) return `약 ${a}~${b}분`;
  return `약 ${fmtDur(a)}~${fmtDur(b)}`;
}

export function roundTo(v, step) {
  return Math.round(v / step) * step;
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
export const weekdayLabel = (i) => WEEK[i];

export function relDayLabel(dateStr, todayStr) {
  const diff = daysBetween(todayStr, dateStr);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === 2) return '모레';
  if (diff === -1) return '어제';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}(${WEEK[weekdayOf(dateStr)]})`;
}

export function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}
