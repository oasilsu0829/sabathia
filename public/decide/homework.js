// 숙제 모델: 일정(할 일·마감) + 15577 블록의 연결·기록 → 진행률, 남은 시간 추정, 위험도.
// 원칙
//  - 사용자가 넣은 계획(15577 블록 시간, 문제 범위)이 초기값이다. 실제 풀이 속도는 충분한 근거가 있을 때만 절반까지 섞는다.
//  - 오래 걸린 것을 비효율로 보지 않는다. 위험도는 '마감까지 남은 작업량 대비 확보 가능한 시간'으로만 정한다.
//  - 모르는 값은 모른다고 둔다(certain:false, need:null).
import '../hw.js';
import { at, addDays, MIN } from './engine/time.js';
import { awakeWindow } from './engine/capacity.js';

const H = globalThis.SabathiaHW;
const CAT_SUBJECT = { math: 'math', eng: 'english', kor: 'korean', sci: 'science' };
const KIND_OF_GROUP = { school: 'performance', report: 'performance' };

const planMin = (b) => (b.review || b.lecture ? b.dur : b.est || b.dur) || 0;
const blockLeft = (b) => (b.done ? 0 : planMin(b) * (1 - Math.max(0, Math.min(1, b.progress || 0))));

/** "11/4 21:23 기준" → 날짜 문자열 (기준 연도는 마감일의 연도) */
function noteDate(text, year) {
  const m = /(\d{1,2})\/(\d{1,2})/.exec(text || '');
  return m ? `${year}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` : null;
}

/** 15577 기록으로 과목별 1문제당 분 (5건 이상일 때만) */
export function historyPace(log, subject) {
  const L = (log || []).filter((l) => l.units > 0 && l.actual > 0 && (l.unit || '문제') === '문제' && (CAT_SUBJECT[l.cat] || 'other') === subject);
  if (L.length < 5) return null;
  const min = L.reduce((a, l) => a + l.actual, 0), n = L.reduce((a, l) => a + l.units, 0);
  return n > 0 ? { pace: min / n, n: L.length } : null;
}

/**
 * @param events  /api/events 목록
 * @param plan    blockplanner.v1
 * @param ov      decide.v1 ov (항목별 보정: total, estimateMin)
 * @returns { list: 숙제[], links: Map(블록 id → [{id, share}]), extraTasks: 엔진에 더할 '추가로 필요한 시간' }
 */
export function buildHomework({ events, plan, ov = {}, today, settings }) {
  const days = (plan && plan.days) || {};
  const list = [];
  const links = new Map();
  // 블록 → 연결된 숙제 (15577의 b.hw, 예전 판단 앱의 ov.link도 같이)
  for (const [date, blocks] of Object.entries(days)) {
    for (const b of blocks || []) {
      const ids = (b.hw || []).map((h) => h.id);
      const old = (ov['p:' + b.id] || {}).link;
      if (old && old.startsWith('ev:') && !ids.includes(old.slice(3))) ids.push(old.slice(3));
      if (ids.length) links.set(b.id, { date, block: b, ids });
    }
  }

  for (const e of events || []) {
    if (!e || e.kind === 'event' || !e.date) continue;
    if (e.done || e.date < addDays(today, -3)) continue;
    const id = 'ev:' + e.id;
    const o = ov[id] || {};
    const group = H.group(e);
    const parsed = H.count(e.title, e.note);
    const count = o.total
      ? { n: o.total, unit: '문제', certain: true, why: '직접 입력' }
      : parsed;
    const nl = H.noteLeft(e.note);
    const { sessions, solved: recSolved } = H.progress(e.id, days);

    // 진행: 15577 기록 합계. 메모의 "N문제 남음"이 있으면 그 시점 기준값과 비교해 큰 쪽(중복으로 더하지 않음)
    let total = count ? count.n : nl && nl.total ? nl.total : null;
    let solved = recSolved;
    let left = null;
    let progressSource = sessions.some((s) => s.n) ? '15577 기록' : null;
    if (total != null) {
      if (nl) {
        const base = Math.max(0, total - nl.left);
        if (base > solved) { solved = base; progressSource = '일정 메모'; }
      }
      solved = Math.min(solved, total);
      left = total - solved;
    } else if (nl) {
      const after = noteDate(nl.text, e.date.slice(0, 4));
      const since = sessions.filter((s) => !after || s.date > after).reduce((a, s) => a + s.n, 0);
      left = Math.max(0, nl.left - since);
      progressSource = '일정 메모';
    }

    // 연결된 블록: 몫은 한 블록에 연결된 숙제 수로 나눈다(앞으로 할 블록은 푼 수를 아직 모르므로)
    const blocks = [];
    for (const [bid, L] of links) {
      if (!L.ids.includes(e.id)) continue;
      const share = 1 / L.ids.length;
      blocks.push({ id: bid, date: L.date, block: L.block, share });
    }
    const future = blocks.filter((x) => !x.block.done && x.date >= addDays(today, -3));
    const plannedFuture = future.reduce((a, x) => a + blockLeft(x.block) * x.share, 0);
    const plannedTotal = blocks.reduce((a, x) => a + planMin(x.block) * x.share, 0);

    // 관찰된 속도: 끝낸 블록의 실제 시간을 그 블록에서 푼 문제 비율로 나눈다
    let obsMin = 0, obsN = 0;
    for (const s of sessions) {
      if (!s.done || !(s.actual > 0) || !(s.n > 0) || !(s.share > 0)) continue;
      obsMin += s.actual * (s.n / s.share);
      obsN += s.n;
    }
    const obs = obsN >= 10 && obsMin >= 20 ? obsMin / obsN : null;

    // 남은 작업에 필요한 시간 (우선순위: 직접 입력 → 계획 블록 → 같은 숙제의 실제 속도 → 과거 기록 → 모름)
    let need = null, needSource = null, certain = !!(count && count.certain);
    let pace = null;
    if (o.estimateMin) {
      need = o.estimateMin; needSource = '직접 입력'; certain = true;
    } else if (left != null && total) {
      const userPace = plannedTotal > 0 && count ? plannedTotal / total : null;
      if (userPace) {
        const w = obs ? Math.min(0.5, solved / total) : 0; // 처음 몇 문제만으로 계획을 뒤집지 않는다
        pace = userPace * (1 - w) + (obs || 0) * w;
        needSource = obs && w > 0.05 ? '계획 + 실제 속도' : '계획';
      } else if (obs) {
        pace = obs; needSource = '이 숙제의 실제 속도'; certain = false;
      } else {
        const hist = historyPace(plan && plan.log, group.subject);
        if (hist) { pace = hist.pace; needSource = `15577 기록 ${hist.n}건`; certain = false; }
      }
      if (pace != null) need = left * pace;
      else if (plannedFuture > 0) { need = plannedFuture; needSource = '계획'; }
    } else if (left === 0) {
      need = 0; needSource = '완료';
    } else if (plannedFuture > 0) {
      need = plannedFuture; needSource = '계획 (분량 미확인)'; certain = false;
    }

    // 진행 중인 블록에서 이미 푼 만큼은 그 블록의 계획 시간에서도 썼다고 본다(남은 계획 시간을 부풀리지 않게)
    const inProgN = sessions.filter((s) => !s.done).reduce((a, s) => a + s.n, 0);
    const usedPace = pace ?? (plannedTotal > 0 && total ? plannedTotal / total : null);
    const futureLeft = usedPace && inProgN ? Math.max(0, plannedFuture - inProgN * usedPace) : plannedFuture;
    const extra = need != null ? Math.max(0, need - futureLeft) : 0;
    const due = e.kind === 'deadline' && e.time ? at(e.date, e.time) : awakeWindow(settings, e.date).end;
    list.push({
      id, evId: e.id, title: e.title, short: H.shortTitle(e.title), date: e.date, time: e.kind === 'deadline' ? e.time : null,
      kind: e.kind, cat: e.cat || '', note: e.note || '', group, subject: group.subject,
      count, total, solved, left, progressSource, sessions, blocks, plannedFuture, plannedTotal,
      obsPace: obs, pace, need, needSource, certain, extra, due,
      errand: H.isErrand(e.title),
      saved: need != null && futureLeft > need + 5 ? futureLeft - need : 0,
      futureLeft,
    });
  }

  const extraTasks = list
    .filter((x) => x.extra >= 10)
    .map((x) => ({
      id: 'hx:' + x.evId,
      title: `${x.short} · 추가로 필요`,
      subject: x.subject,
      kind: KIND_OF_GROUP[x.group.key] || 'homework',
      estimateMin: Math.round(x.extra),
      deadline: x.date,
      deadlineTime: x.time,
      source: 'homework',
      hwId: x.id,
    }));

  return { list, links, extraTasks };
}

/** 블록의 마감 = 연결된 숙제 중 가장 이른 마감 */
export function deadlineFor(blockId, links, byEvId) {
  const L = links.get(blockId);
  if (!L) return null;
  let best = null;
  for (const id of L.ids) {
    const h = byEvId.get(id);
    if (h && (!best || h.due < best.due)) best = h;
  }
  return best ? { date: best.date, time: best.time } : null;
}

/**
 * 위험도: 마감 임박도(남은 시각)와 실제 위험도(작업량 대비 확보 가능한 시간)를 따로 낸다.
 * @param R decide() 결과
 */
export function assess(list, R) {
  const now = R.now;
  const exp = R.scenarios.exp.base, high = R.scenarios.high.base;
  const freeBefore = (due) => {
    let m = 0;
    for (const d of R.days) for (const w of d.free) { const a = Math.max(w.start, now), b = Math.min(w.end, due); if (b > a) m += (b - a) / MIN; }
    return m;
  };
  // 이 마감보다 먼저(또는 같이) 끝내야 하는 작업만 센다. 마감이 더 먼 작업은 뒤로 밀 수 있으므로 부담이 아니다
  const hardDue = new Map(R.scenarios.exp.items.map((i) => [i.taskId, i.hardDue]));
  const workBefore = (due) =>
    exp.timeline.reduce((a, p) => {
      const d = hardDue.get(p.taskId);
      if (d == null || d > due) return a;
      return a + Math.max(0, (Math.min(p.end, due) - Math.max(p.start, now)) / MIN);
    }, 0);
  for (const h of list) {
    let lateE = 0, lateH = 0;
    for (const b of h.blocks) {
      const id = 'p:' + b.id;
      lateE += (exp.byTask.get(id)?.hardLateMin || 0) * b.share;
      lateH += (high.byTask.get(id)?.hardLateMin || 0) * b.share;
    }
    lateE += exp.byTask.get('hx:' + h.evId)?.hardLateMin || 0;
    lateH += high.byTask.get('hx:' + h.evId)?.hardLateMin || 0;
    const hours = (h.due - now) / 3_600_000;
    const free = freeBefore(h.due), work = workBefore(h.due);
    const load = free > 0 ? work / free : work > 0 ? Infinity : 0;
    h.urgency = hours < 0 ? 'past' : hours < 24 ? 'now' : hours < 72 ? 'soon' : 'far';
    h.hoursLeft = hours;
    h.freeBefore = free;
    h.load = load;
    h.late = { exp: lateE, high: lateH };
    const pending = h.need == null && !h.blocks.some((b) => !b.block.done);
    h.level =
      h.errand ? 'errand'
      : h.left === 0 || h.need === 0 ? 'done'
      : pending ? 'unknown'
      : lateE > 1 || h.urgency === 'past' ? 'danger'
      : lateH > 1 || load >= 0.9 ? 'warn'
      : load >= 0.7 ? 'tight'
      : 'calm';
  }
  return list;
}

export const LEVEL = {
  danger: { label: '위험', rank: 5 },
  warn: { label: '주의', rank: 4 },
  tight: { label: '빠듯', rank: 3 },
  unknown: { label: '시간 미정', rank: 2 },
  errand: { label: '준비물', rank: 0 },
  calm: { label: '여유', rank: 1 },
  done: { label: '완료', rank: 0 },
};

/** 소속별 묶음. 묶음 안은 마감순 */
export function groupHomework(list) {
  const G = new Map();
  for (const h of list) {
    const g = G.get(h.group.key) || { key: h.group.key, label: h.group.label, subject: h.group.subject, items: [], need: 0, unknown: 0, worst: 'done' };
    g.items.push(h);
    if (h.need != null) g.need += h.need; else if (!h.errand) g.unknown++;
    if (LEVEL[h.level].rank > LEVEL[g.worst].rank) g.worst = h.level;
    G.set(h.group.key, g);
  }
  const groups = [...G.values()];
  for (const g of groups) g.items.sort((a, b) => a.errand - b.errand || a.due - b.due);
  groups.sort((a, b) => LEVEL[b.worst].rank - LEVEL[a.worst].rank || a.items[0].due - b.items[0].due);
  return groups;
}
