// 안하면 병신 — 오늘 꼭 할 일 체크리스트 (2026-11-19 사용자 요청)
// 매일 항목은 날마다 다시 비워지고, 한 번 항목은 끝낸 다음 날 사라진다(안 끝냈으면 남는다).
// 저장: localStorage sabathia.ws.must = { items:[{id,t,daily}], done:{id: 날짜}, warn, notify, lastPing }
export const MUST_KEY = 'sabathia.ws.must';

export function normalize(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  return {
    items: Array.isArray(m.items) ? m.items.filter((x) => x && x.id && typeof x.t === 'string').map((x) => ({ id: String(x.id), t: x.t, daily: x.daily !== false })) : [],
    done: m.done && typeof m.done === 'object' ? { ...m.done } : {},
    warn: m.warn !== false,       // 닫을 때 확인 창(beforeunload)
    notify: !!m.notify,           // 나갈 때 알림(권한 필요)
    lastPing: Number(m.lastPing) || 0,
  };
}

export const isDoneOn = (m, id, day) => m.done[id] === day;

// 날이 바뀌면: 끝낸 한 번 항목은 지우고, 오늘이 아닌 체크 기록은 버린다
export function rollover(m, day) {
  const keep = m.items.filter((x) => x.daily || !m.done[x.id] || m.done[x.id] === day);
  const done = {};
  for (const x of keep) if (m.done[x.id] === day) done[x.id] = day;
  return { ...m, items: keep, done };
}

export function add(m, t, daily = true, id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)) {
  const s = String(t ?? '').trim().slice(0, 80);
  if (!s) return m;
  return { ...m, items: [...m.items, { id, t: s, daily: !!daily }] };
}

export function toggle(m, id, day) {
  const done = { ...m.done };
  if (done[id] === day) delete done[id];
  else done[id] = day;
  return { ...m, done };
}

export function remove(m, id) {
  const done = { ...m.done };
  delete done[id];
  return { ...m, items: m.items.filter((x) => x.id !== id), done };
}

export const left = (m, day) => m.items.filter((x) => !isDoneOn(m, x.id, day));

// 알림 문구: 남은 것 앞에서 3개까지
export function leaveText(m, day) {
  const l = left(m, day);
  if (!l.length) return null;
  const head = l.slice(0, 3).map((x) => x.t).join(' · ');
  return { title: `안하면 병신 · ${l.length}개 남음`, body: l.length > 3 ? `${head} 외 ${l.length - 3}개` : head };
}

// 나갈 때 알림은 30분에 한 번까지 (앱 전환할 때마다 울리지 않게)
export const PING_GAP = 30 * 60_000;
export const shouldPing = (m, now) => m.notify && now - m.lastPing >= PING_GAP;
