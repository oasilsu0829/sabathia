// Planner 2.0 — 작업(Task)·Big 3·마감 판단. DOM 없음 (test/plan.mjs).
//   작업은 세 곳에서 온다. 저장 문서(sabathia.plan.v1)에는 사용자가 만들거나 고친 것만 남고, 나머지는 읽을 때마다 만든다(중복 생성 없음).
//     manual  직접 입력(Brain Dump)                        id: t_…
//     event   Sabathia 일정의 할 일·마감 (/api/events)      id: ev:<일정 id>   ← 일정 id를 그대로 쓴다
//     block   15577 블록 하나 = 작업 하나(연결이 없을 때)   id: p:<블록 id>    ← 블록 id를 그대로 쓴다
//   블록 ↔ 작업 연결: doc.links[블록 id].task (판단 앱의 decide.v1 ov['p:…'].link 도 읽는다)
//   한 작업을 여러 블록(여러 날)에 나눠도 작업은 하나다.
import { planMin, blocksOn, subjectOf, subjectGuess, addDays, daysBetween, weekStart, keyOf, dateOf } from './blocks.js';

export const PLAN_KEY = 'sabathia.plan.v1';
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
export const tid = () => 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ───────── 문서 ─────────
export function emptyDoc() { return { v: 1, tasks: {}, big3: {}, props: {}, links: {}, cfg: {} }; }
export function ensureDoc(d) {
  const o = obj(d);
  const out = { v: 1 };
  for (const p of ['tasks', 'big3', 'props', 'links', 'cfg']) out[p] = obj(o[p]);
  return out;
}
export const live = (doc, part) => Object.values(doc[part] || {}).filter((x) => x && !x.del);
export const get = (doc, part, id) => { const x = doc[part]?.[id]; return x && !x.del ? x : null; };
export function put(doc, part, item, now = Date.now()) {
  const prev = doc[part][item.id];
  // 같은 밀리초에 두 번 고쳐도 늦은 쪽이 이기게
  const u = Math.max(now, (prev?.u || 0) + 1);
  doc[part][item.id] = { ...item, u };
  return doc[part][item.id];
}
export function del(doc, part, id, now = Date.now()) {
  if (!doc[part][id]) return;
  doc[part][id] = { id, del: 1, u: Math.max(now, (doc[part][id].u || 0) + 1) };
}
export function linkBlock(doc, blockId, taskId, now) { put(doc, 'links', { id: blockId, task: taskId }, now); }

// ───────── 작업 목록 만들기 ─────────
const normTitle = (s) => String(s || '').toLowerCase().replace(/[\s·.,!?()[\]{}~\-_/]+/g, '');

/**
 * @param doc     Planner 문서
 * @param P       15577 기록
 * @param events  Sabathia 일정 목록 (null = 아직 못 읽음)
 * @param ov      decide.v1 ov (읽기만)
 * @returns { tasks, byId, blockTask: Map(블록 id → 작업 id), blocksOf: Map(작업 id → [{b,k}]) }
 */
export function deriveTasks({ doc, P, events, ov = {}, today, back = 7, ahead = 21 }) {
  const stored = new Map(live(doc, 'tasks').map((t) => [t.id, t]));
  const out = new Map();
  const from = addDays(today, -back), to = addDays(today, ahead);

  // 1) 일정의 할 일·마감
  const evIds = new Set();
  for (const e of events || []) {
    if (!e || !e.id || (e.kind !== 'deadline' && e.kind !== 'task')) continue;
    const id = 'ev:' + e.id;
    evIds.add(id);
    if (e.date < addDays(today, -1) && !stored.has(id)) continue;
    if (e.date > to && !stored.has(id)) continue;
    const s = stored.get(id) || {};
    out.set(id, {
      id, src: 'event', stored: stored.has(id),
      title: e.title, deadline: e.date, deadlineTime: e.kind === 'deadline' ? e.time || null : null, evKind: e.kind, evCat: e.cat || '',
      subject: s.subject || subjectGuess(e.title + ' ' + (e.note || '')),
      est: s.est ?? (ov[id]?.estimateMin ?? null), priority: s.priority ?? null, note: s.note || '',
      status: e.done ? 'done' : s.status === 'dropped' ? 'dropped' : s.status === 'done' ? 'done' : 'todo',
      created: s.created || 0,
    });
  }
  // 2) 직접 입력·고친 작업 (일정에서 지워진 일정 작업은 일정을 읽었을 때 뺀다)
  for (const t of stored.values()) {
    if (out.has(t.id)) continue;
    if (t.id.startsWith('ev:') && events) continue;
    out.set(t.id, { src: t.id.startsWith('p:') ? 'block' : t.id.startsWith('ev:') ? 'event' : 'manual', ...t, stored: true });
  }
  // 3) 블록 연결
  const blockTask = new Map();
  for (const l of live(doc, 'links')) if (l.task) blockTask.set(l.id, l.task);
  for (const [k, v] of Object.entries(ov || {})) {
    if (!k.startsWith('p:') || !v || !v.link) continue;
    const bid = k.slice(2);
    if (!blockTask.has(bid)) blockTask.set(bid, v.link);
  }
  const blocksOf = new Map();
  const inRange = [];
  for (const [k, list] of Object.entries(P?.days || {})) {
    if (!Array.isArray(list) || k < from || k > to) continue;
    for (const b of list) if (b && !b.buffer && b.start != null) inRange.push({ b, k });
  }
  const here = new Set(inRange.map((x) => x.b.id));
  // 연결이 유효한지: 작업이 있거나, 다른 블록 작업(p:X)이면 X가 범위 안에 있고 X 자신은 다른 데 연결되지 않아야 한다
  const raw = new Map(blockTask);
  const linkOf = (b) => {
    const t = raw.get(b.id);
    if (!t) return null;
    if (out.has(t)) return t;
    if (t.startsWith('p:')) { const x = t.slice(2); if (x !== b.id && here.has(x) && !raw.get(x)) return t; }
    return null;
  };
  const own = new Map();
  for (const { b, k } of inRange) {
    if (linkOf(b)) continue;
    const t = 'p:' + b.id;
    own.set(b.id, t);
    if (!out.has(t)) {
      const s = stored.get(t) || {};
      out.set(t, {
        id: t, src: 'block', stored: stored.has(t), title: b.title || '블록', subject: subjectOf(P, b.cat, b.title),
        deadline: s.deadline ?? null, deadlineTime: s.deadlineTime ?? null, est: s.est ?? null, priority: s.priority ?? null, note: s.note || '',
        status: s.status === 'dropped' ? 'dropped' : 'todo', created: s.created || 0, blockDate: k,
      });
    }
  }
  {
    for (const { b, k } of inRange) {
      const t = linkOf(b) || own.get(b.id);
      blockTask.set(b.id, t);
      const tt = out.get(t);
      if (tt.src === 'block') { if (!tt.title) tt.title = b.title || '블록'; if (!tt.subject) tt.subject = subjectOf(P, b.cat, b.title); if (!tt.blockDate) tt.blockDate = k; }
      if (!blocksOf.has(t)) blocksOf.set(t, []);
      blocksOf.get(t).push({ b, k });
    }
  }
  // 블록이 없어진 블록 작업은 뺀다
  for (const [id, t] of out) if (t.src === 'block' && !blocksOf.has(id)) out.delete(id);
  // 4) 양 계산
  for (const t of out.values()) {
    t.title = t.title || '(제목 없음)'; t.subject = t.subject || 'etc';
    const bl = blocksOf.get(t.id) || [];
    const doneMin = bl.filter((x) => x.b.done).reduce((s, x) => s + (x.b.actual || planMin(x.b)), 0);
    const open = bl.filter((x) => !x.b.done);
    const placedMin = open.filter((x) => x.k >= today).reduce((s, x) => s + planMin(x.b), 0);
    const lateMin = open.filter((x) => x.k < today).reduce((s, x) => s + planMin(x.b), 0);
    const placedBy = (d) => open.filter((x) => x.k >= today && (!d || x.k <= d)).reduce((s, x) => s + planMin(x.b), 0);
    if (t.src === 'block' && bl.length && bl.every((x) => x.b.done) && t.status !== 'dropped') t.status = 'done';
    const need = t.est != null ? +t.est : bl.length ? doneMin + placedMin + lateMin : null;
    const remaining = t.status !== 'todo' ? 0 : need == null ? null : Math.max(0, need - doneMin);
    t.blocks = bl; t.doneMin = doneMin; t.placedMin = placedMin; t.lateMin = lateMin; t.need = need; t.remaining = remaining;
    t.placedBeforeDeadline = placedBy(t.deadline);
    t.unplaced = remaining == null ? null : Math.max(0, remaining - placedMin);
    t.carry = lateMin > 0 && placedMin === 0 && t.status === 'todo';
  }
  const tasks = [...out.values()].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || (b.priority || 0) - (a.priority || 0) || a.title.localeCompare(b.title));
  return { tasks, byId: out, blockTask, blocksOf, evIds };
}

/** 같은 작업이 이미 있는지 (제목이 같고 마감이 같거나 한쪽이 비었을 때, 끝나지 않은 것) */
export function findDuplicate(tasks, { title, deadline }) {
  const n = normTitle(title);
  if (!n) return null;
  return tasks.find((t) => t.status === 'todo' && normTitle(t.title) === n && (!deadline || !t.deadline || t.deadline === deadline)) || null;
}

/** 작업 만들기(Brain Dump). 이미 같은 작업이 있으면 만들지 않고 그것을 돌려준다 */
export function addTask(doc, tasks, d, now = Date.now()) {
  const dup = findDuplicate(tasks, d);
  if (dup) return { task: dup, dup: true };
  const t = put(doc, 'tasks', {
    id: tid(), title: String(d.title || '').trim(), subject: d.subject || subjectGuess(d.title), deadline: d.deadline || null, deadlineTime: d.deadlineTime || null,
    est: d.est > 0 ? Math.round(d.est) : null, priority: d.priority || null, status: 'todo', note: d.note || '', created: now,
  }, now);
  return { task: t, dup: false };
}
/** 작업 고치기. 일정·블록에서 온 작업도 사용자가 고친 칸만 저장한다(원본 id 유지) */
export function updateTask(doc, task, patch, now = Date.now()) {
  const keep = ['title', 'subject', 'deadline', 'deadlineTime', 'est', 'priority', 'status', 'note', 'created'];
  const base = get(doc, 'tasks', task.id) || { id: task.id, created: now };
  const next = { ...base };
  for (const k of keep) if (k in patch) next[k] = patch[k];
  if (task.src === 'event') { delete next.title; delete next.deadline; delete next.deadlineTime; } // 일정 앱이 원본
  if (task.src === 'block') delete next.title; // 제목은 15577 블록이 원본
  return put(doc, 'tasks', next, now);
}

// ───────── 빠른 입력 ─────────
const WD = '일월화수목금토';
/** "수학 숙제 1시간 30분 11/24 !!" → { title, subject, est, deadline, priority } */
export function parseQuick(text, today) {
  let s = ` ${String(text || '').trim()} `;
  let est = null, deadline = null, priority = null;
  const take = (re, fn) => { const m = re.exec(s); if (m) { fn(m); s = s.replace(m[0], ' '); } };
  take(/\s(\d+(?:\.\d+)?)\s*(?:시간|h)\s*(?:(\d+)\s*분)?(?=\s)/i, (m) => { est = Math.round(parseFloat(m[1]) * 60 + (+m[2] || 0)); });
  if (est == null) take(/\s(\d+)\s*(?:분|m|min)(?=\s)/i, (m) => { est = +m[1]; });
  take(/\s(\d{1,2})\s*[/.월]\s*(\d{1,2})\s*일?(?:\s*까지)?(?=\s)/, (m) => {
    const y = +today.slice(0, 4), mm = String(+m[1]).padStart(2, '0'), dd = String(+m[2]).padStart(2, '0');
    let k = `${y}-${mm}-${dd}`;
    if (daysBetween(today, k) < -60) k = `${y + 1}-${mm}-${dd}`;
    deadline = k;
  });
  if (!deadline) take(/\s(오늘|내일|모레)(?:\s*까지)?(?=\s)/, (m) => { deadline = addDays(today, { 오늘: 0, 내일: 1, 모레: 2 }[m[1]]); });
  if (!deadline) take(/\s(다음\s*주\s*)?([일월화수목금토])요일?(?:\s*까지)?(?=\s)/, (m) => {
    const want = WD.indexOf(m[2]); const cur = dateOf(today).getDay();
    let n = (want - cur + 7) % 7; if (m[1]) n += 7;
    deadline = addDays(today, n);
  });
  take(/\s(!{1,3}|중요)(?=\s)/, (m) => { priority = m[1] === '중요' ? 3 : m[1].length; });
  const title = s.replace(/\s+/g, ' ').trim();
  return { title, subject: subjectGuess(title), est, deadline, priority };
}

// ───────── Big 3 ─────────
export const big3Key = (type, start) => (type === 'weekly' ? 'w:' : 'd:') + start;
export function getBig3(doc, type, start) { return get(doc, 'big3', big3Key(type, start)); }
/** 사용자가 고른 것만 확정한다. 추천은 저장하지 않는다(명세 §3.2) */
export function confirmBig3(doc, type, start, taskIds, now = Date.now()) {
  const ids = [...new Set(taskIds)].slice(0, 3);
  return put(doc, 'big3', { id: big3Key(type, start), periodType: type, periodStart: start, taskIds: ids, confirmedByUser: true }, now);
}
export function clearBig3(doc, type, start, now) { del(doc, 'big3', big3Key(type, start), now); }

/**
 * Big 3 후보 (규칙 기반). 점수와 이유를 같이 준다. 확정은 사용자가 한다.
 * ctx = { today, type, weekly: 확정된 주간 Big 3 id[], risk: Map(작업 id → 'risk'|'tight'), freeToday(분), weekEnd }
 */
export function recommendBig3(tasks, ctx) {
  const { today, type, weekly = [], risk = new Map(), freeToday = 0 } = ctx;
  const wEnd = addDays(weekStart(today), 6);
  const cands = [];
  for (const t of tasks) {
    if (t.status !== 'todo') continue;
    if (t.remaining === 0) continue;
    const why = [];
    let sc = 0;
    const dd = t.deadline ? daysBetween(today, t.deadline) : null;
    if (dd != null) {
      if (dd < 0) { sc += 34; why.push('마감 지남'); }
      else { sc += dd === 0 ? 40 : dd === 1 ? 32 : dd === 2 ? 26 : dd <= 4 ? 18 : dd <= 7 ? 10 : 4; why.push(dd === 0 ? '오늘 마감' : dd === 1 ? '내일 마감' : `D-${dd}`); }
    }
    const r = risk.get(t.id);
    if (r === 'risk') { sc += 30; why.push('마감 위험'); } else if (r === 'tight') { sc += 14; why.push('빠듯함'); }
    if (t.priority) { sc += (t.priority - 1) * 8; if (t.priority >= 2) why.push('중요도 ' + '★'.repeat(t.priority)); }
    const rem = t.remaining ?? t.need ?? 0;
    if (type === 'weekly') {
      if (dd != null && t.deadline > wEnd) sc -= 6;
      if (rem >= 120) { sc += 8; why.push(`남은 ${Math.round(rem / 6) / 10}시간`); } else if (rem >= 60) sc += 4;
    } else {
      if (weekly.includes(t.id)) { sc += 12; why.push('주간 Big 3'); }
      if (t.blocks?.some((x) => x.k === today && !x.b.done)) { sc += 10; why.push('오늘 배치됨'); }
      if (t.carry) { sc += 6; why.push('이월'); }
      if (rem && freeToday && rem > freeToday) sc -= 6; // 오늘 시간보다 큰 일은 조금 뒤로
      if (dd != null && dd > 7 && !weekly.includes(t.id) && !t.blocks?.some((x) => x.k === today)) continue;
    }
    if (sc <= 0 && !t.priority) continue;
    cands.push({ task: t, score: sc, why });
  }
  return cands.sort((a, b) => b.score - a.score || (a.task.deadline || '9').localeCompare(b.task.deadline || '9'));
}

// ───────── 마감 판단 ─────────
/**
 * D-day만이 아니라 남은 양과 실제 빈 시간을 같이 본다.
 * @param t     deriveTasks의 작업
 * @param free  오늘(지금 이후)부터 마감까지 블록·고정 일정 밖의 빈 시간(분)
 * @param eng   판단 엔진 결과 { exp: 부족 분, high: 길어질 때 부족 분 } (없으면 null)
 */
export function deadlineInfo(t, { today, free = 0, eng = null }) {
  const dday = t.deadline ? daysBetween(today, t.deadline) : null;
  if (t.status === 'done') return { level: 'done', dday, text: '완료' };
  const unknown = t.need == null;
  const after = t.blocks ? t.blocks.filter((x) => !x.b.done && t.deadline && x.k > t.deadline).reduce((s, x) => s + planMin(x.b), 0) : 0;
  const unplaced = unknown ? null : Math.max(0, (t.remaining || 0) - (t.placedBeforeDeadline || 0));
  let level, text;
  if (dday != null && dday < 0) { level = 'risk'; text = '마감이 지났어요'; }
  else if (eng && eng.exp > 1) { level = 'risk'; text = `가능한 시간을 다 써도 약 ${r5(eng.exp)}분 부족`; }
  else if (unknown) { level = 'unknown'; text = '예상 시간이 없어 계산에서 빠짐'; }
  else if (unplaced > 0 && unplaced > free) { level = 'risk'; text = `마감 전 빈 시간 ${r5(free)}분 < 남은 ${r5(unplaced)}분`; }
  else if ((eng && eng.high > 1) || (unplaced > 0 && unplaced > free * 0.7)) { level = 'tight'; text = eng && eng.high > 1 ? `길어지면 최대 약 ${r5(eng.high)}분 부족` : '빈 시간을 거의 다 써야 함'; }
  else if (after > 0) { level = 'tight'; text = `마감 뒤에 놓인 블록 ${r5(after)}분`; }
  else if (unplaced > 0) { level = 'plan'; text = `${r5(unplaced)}분 더 배치하면 됨`; }
  else { level = 'ok'; text = t.remaining ? '배치 완료' : '남은 작업 없음'; }
  return { level, dday, text, unplaced, after, free };
}
const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);

/** 화면용: D-day 글자 */
export const ddayTxt = (d) => (d == null ? '' : d < 0 ? `D+${-d}` : d === 0 ? 'D-day' : `D-${d}`);
export { keyOf };
