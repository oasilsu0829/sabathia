// 판단 엔진의 입력을 Sabathia의 기존 데이터로 만든다. 다른 앱의 저장값은 읽기만 하고 고치지 않는다.
//   15577 (blockplanner.v1)  블록 = 작업(블록 길이 = 예상 소요 시간), 고정 블록(학교·점심 등) = 바쁜 시간, D-day, 예상→실제 기록(오차 보정)
//   일정 (/api/events)        시각과 끝 시각이 있는 일정 = 바쁜 시간, 할 일·마감 = 마감
//   장부 (projects.v1)        진행 중 프로젝트 = 장기 프로젝트 후보
//   시험대비 (exam.v1)        이번 주 남은 할 일 수 = 과목별 시험 공부 필요도
//   판단 (decide.v1)          이 앱만의 보정: 마감 연결, 남은 시간 수정, 예상 시간, 기상·취침, 시험 목록
import { makeTask, detectSubject, detectKind } from './engine/planner.js';
import { addDays, hmStr, daysBetween, weekdayOf } from './engine/time.js';
import { DEFAULT_UNCERTAINTY } from './engine/config.js';

const CAT_SUBJECT = { math: 'math', eng: 'english', kor: 'korean', sci: 'science', etc: 'other' };

export const isLite = (b) => !!(b.review || b.lecture);
/** 15577과 같은 계산: 정리·인강은 블록 길이, 문풀은 예상 시간 */
export const planMin = (b) => (isLite(b) ? b.dur : b.est || b.dur) || 0;

function subjectOfCat(cat, cats) {
  if (CAT_SUBJECT[cat]) return CAT_SUBJECT[cat];
  const c = (cats || []).find((x) => x.id === cat);
  return c ? detectSubject(c.name) : 'other';
}

/** 15577 고정 블록이 그날 적용되는지 (today.js · 15577과 같은 규칙) */
function fixedApplies(S, f, k) {
  const wd = weekdayOf(k);
  const off = (S.schoolOff || []).includes(k);
  if (!(f.days || []).includes(wd)) return false;
  if (f.only && f.only !== k) return false;
  if (f.from && k < f.from) return false;
  if (f.until && k > f.until) return false;
  if ((f.skip || []).includes(k)) return false;
  if (off && f.school) return false;
  // 자습으로 바꾼 수업은 공부할 수 있는 시간이다
  if (f.selfStudy || (f.school && (S.selfDay || []).includes(k))) return false;
  return true;
}

/**
 * @param S       blockplanner.v1
 * @param ov      decide.v1의 항목별 보정 { [id]: { deadline, deadlineTime, kind, remainingMin, link, ack } }
 * @param range   [시작 날짜, 끝 날짜]
 */
export function fromPlan(S, ov, [from, to], today) {
  const tasks = [];
  const fixed = [];
  if (!S) return { tasks, fixed, dday: null, log: [] };
  for (const [k, list] of Object.entries(S.days || {})) {
    if (!Array.isArray(list) || k > to) continue;
    // 지난 날은 3일 전까지만: 그보다 오래된 미완료는 버린 계획으로 본다
    if (k < from) continue;
    for (const b of list) {
      if (b.buffer) continue;
      const id = 'p:' + b.id;
      const o = ov[id] || {};
      const pm = planMin(b);
      const subject = subjectOfCat(b.cat, S.cats);
      const title = b.title || (b.review ? '정리' : b.lecture ? '인강' : '블록');
      const kind = o.kind || (b.review ? 'review' : b.lecture ? 'other' : detectKind(title, subject === 'other' ? detectSubject(title) : subject));
      const hasBlock = b.start != null;
      // 15577에서 사용자가 직접 누른 진행률만 쓴다. 타이머 경과 시간으로 진행을 추측하지 않는다
      const prog = b.done ? 1 : Math.max(0, Math.min(1, b.progress || 0));
      let remainingMin = o.remainingMin ?? null;
      if (remainingMin == null && prog > 0 && prog < 1) remainingMin = Math.round(pm * (1 - prog));
      tasks.push(
        makeTask({
          id,
          title,
          subject,
          kind,
          date: k,
          start: hasBlock ? hmStr(b.start) : null,
          end: hasBlock ? hmStr(b.start + (pm || 30)) : null,
          estimateMin: hasBlock ? null : pm,
          remainingMin,
          deadline: o.deadline ?? null,
          deadlineTime: o.deadlineTime ?? null,
          status: b.done ? 'done' : b.runningSince ? 'doing' : 'todo',
          completedAt: b.doneAt ?? null,
          examRelated: !!o.examRelated,
          ackAt: o.ackAt ?? null,
        }),
      );
      tasks.at(-1).source = 'plan';
      tasks.at(-1).link = o.link ?? null;
      tasks.at(-1).lite = isLite(b) ? (b.review ? '정리' : '인강') : '문풀';
    }
  }
  // 고정 블록은 날짜마다 펼쳐 둔다 (기간·건너뛰기·자습 규칙을 엔진이 몰라도 되게)
  for (let k = from; k <= to; k = addDays(k, 1)) {
    for (const f of S.fixed || []) {
      if (!fixedApplies(S, f, k)) continue;
      fixed.push({
        id: `pf:${f.id}:${k}`,
        label: f.school ? `${f.period}교시 ${f.title}` : f.title,
        kind: f.school ? 'school' : f.meal ? 'meal' : 'other',
        date: k,
        start: hmStr(f.start),
        end: hmStr(f.start + f.dur),
      });
    }
  }
  const dday = S.dday && S.dday.date && S.dday.date >= today ? S.dday : null;
  return { tasks, fixed, dday, log: Array.isArray(S.log) ? S.log : [], cats: S.cats };
}

const EVENT_KIND = { school: 'performance', report: 'performance', academy: 'homework' };

/**
 * 일정: 시각이 있는 일정은 바쁜 시간, 할 일·마감은 마감 목록.
 * 마감에 예상 시간을 넣었고 15577 블록과 연결하지 않았다면 그 자체로 작업이 된다.
 */
export function fromEvents(events, ov, linkedIds, [from, to], today) {
  const fixed = [];
  const deadlines = [];
  const tasks = [];
  for (const e of events || []) {
    if (!e || !e.date || e.date > to) continue;
    if (e.kind === 'event') {
      if (e.time && e.end_time && e.date >= from)
        fixed.push({ id: 'ev:' + e.id, label: e.title, kind: e.cat === 'academy' ? 'academy' : e.cat === 'school' ? 'school' : 'other', date: e.date, start: e.time, end: e.end_time });
      continue;
    }
    if (e.done || e.date < addDays(today, -1)) continue;
    const id = 'ev:' + e.id;
    const o = ov[id] || {};
    const deadlineTime = e.kind === 'deadline' ? e.time || null : null;
    const linked = linkedIds.has(id);
    const d = { id, title: e.title, date: e.date, time: deadlineTime, cat: e.cat || '', kind: e.kind, linked, estimateMin: o.estimateMin ?? null, source: e.source || '' };
    deadlines.push(d);
    if (!linked && o.estimateMin) {
      const t = makeTask({
        id,
        title: e.title,
        kind: o.kind || EVENT_KIND[e.cat] || detectKind(e.title),
        estimateMin: o.estimateMin,
        remainingMin: o.remainingMin ?? null,
        deadline: e.date,
        deadlineTime,
        ackAt: o.ackAt ?? null,
      });
      t.source = 'events';
      tasks.push(t);
    }
  }
  deadlines.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'));
  return { fixed, deadlines, tasks };
}

/** 장부: 진행 중 프로젝트의 다음 단계를 장기 프로젝트 후보로 */
export function fromProjects(list, ov) {
  const tasks = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || p.demo || p.status !== 'active') continue;
    const id = 'pj:' + p.id;
    const o = ov[id] || {};
    const step = (p.steps || []).find((s) => !s.done);
    const t = makeTask({
      id,
      title: step ? `${p.title} · ${step.t}` : p.title,
      kind: 'project',
      subject: 'other',
      estimateMin: o.estimateMin ?? 60,
      remainingMin: o.remainingMin ?? null,
      value: o.value ?? 2,
      usage: o.usage ?? 2,
      examRelated: !!o.examRelated,
    });
    t.source = 'projects';
    t.estimateGuessed = o.estimateMin == null;
    tasks.push(t);
  }
  return tasks;
}

/** 시험대비: 지금 주차의 끝나지 않은 할 일 수 (과목별) */
export function examPending(doc, today) {
  const out = {};
  if (!doc || !doc.items) return out;
  const week = (doc.weeks || DEFAULT_WEEKS).find((w) => today <= w.to) || null;
  for (const x of Object.values(doc.items)) {
    if (!x || x.del || x.done) continue;
    if (week && x.g !== week.id) continue;
    if (x.n && (x.c || 0) >= x.n) continue;
    const s = CAT_SUBJECT[x.s] || detectSubject(x.s || '');
    out[s] = (out[s] || 0) + 1;
  }
  return out;
}
// /exam/ 의 WEEKS와 같은 날짜 (apps.js exam()과 같이 바꿀 것)
const DEFAULT_WEEKS = [
  { id: 'w1', to: '2026-11-13' },
  { id: 'w2', to: '2026-11-22' },
  { id: 'w3', to: '2026-11-29' },
  { id: 'w4', to: '2026-12-06' },
  { id: 'w5', to: '2026-12-09' },
];

/**
 * 15577 기록(예상 → 실제)으로 과목별 오차 범위를 보정한다.
 * 과목별 5건 이상이면 실제/예상 비율의 하위 10%·상위 90%를 범위로 쓰고, 모자라면 임시값을 쓴다.
 */
export function calibrate(log, cats, base = DEFAULT_UNCERTAINTY) {
  const ratios = {};
  for (const l of log || []) {
    if (!(l.est > 0) || !(l.actual > 0)) continue;
    const s = subjectOfCat(l.cat, cats);
    (ratios[s] ||= []).push(l.actual / l.est);
  }
  const unc = { ...base };
  const info = {};
  for (const [s, r] of Object.entries(ratios)) {
    r.sort((a, b) => a - b);
    const q = (p) => r[Math.min(r.length - 1, Math.max(0, Math.round((r.length - 1) * p)))];
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    info[s] = { n: r.length, mean };
    if (r.length >= 5) {
      const lo = Math.max(-0.5, Math.min(0, q(0.1) - 1));
      const hi = Math.min(1.5, Math.max(0.05, q(0.9) - 1));
      unc[s] = [lo, hi];
      info[s].calibrated = true;
    }
  }
  return { uncertainty: unc, info };
}

/**
 * 판단 엔진 상태를 만든다.
 * @returns { state, meta } — state는 decide()가 받는 모양, meta는 화면에 보여줄 출처 정보
 */
export function buildState({ plan, events, projects, examDoc, local, today }) {
  const ov = local.ov || {};
  const range = [addDays(today, -3), addDays(today, 29)];
  const P = fromPlan(plan, ov, range, today);
  const linkedIds = new Set(P.tasks.map((t) => t.link).filter(Boolean));
  const E = fromEvents(events, ov, linkedIds, range, today);
  const evById = new Map(E.deadlines.map((d) => [d.id, d]));

  // 15577 블록을 일정의 마감과 연결했다면 그 마감을 블록의 마감으로
  for (const t of P.tasks) {
    if (!t.deadline && t.link && evById.has(t.link)) {
      const d = evById.get(t.link);
      t.deadline = d.date;
      t.deadlineTime = d.time;
    }
  }

  const cal = calibrate(P.log, P.cats);
  const settings = { ...local.settings, uncertainty: { ...cal.uncertainty, ...(local.settings.uncertaintyOverride || {}) } };

  // 시험: 이 앱의 시험 목록 + 15577 D-day(시험·고사일 때)
  const exams = [...(settings.exams || [])];
  if (P.dday && /시험|고사|평가/.test(P.dday.title || '') && !exams.some((e) => e.date === P.dday.date))
    exams.push({ id: 'dday', name: P.dday.title, date: P.dday.date, subjects: [], from: '15577' });
  settings.exams = exams;

  const tasks = [...P.tasks, ...E.tasks, ...fromProjects(projects, ov)];
  return {
    state: { settings, fixed: [...P.fixed, ...E.fixed], tasks, examPending: examPending(examDoc, today) },
    meta: {
      deadlines: E.deadlines,
      calibration: cal.info,
      counts: { blocks: P.tasks.length, events: (events || []).length, projects: tasks.filter((t) => t.source === 'projects').length },
      hasPlan: !!plan,
      daysToExam: exams.length ? Math.min(...exams.map((e) => daysBetween(today, e.date)).filter((d) => d >= 0)) : null,
    },
  };
}
