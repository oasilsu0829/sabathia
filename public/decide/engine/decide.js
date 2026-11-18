// 판단 엔진: 규칙 기반 (AI 호출 없음).
//   1) 최상위 제약: 수면 · 고정 일정 · 마감 · 수행평가 · 실현 가능성
//   2) 시험 집중 모드 (D-21)
//   3) 과목/종류별 우선 등급 (동점 비교용)
//   4) 기준 계획 vs 지연 계획 비교 → 시간 손실(불확실성 범위 포함)
//   5) 홈 메인 카드 자동 선택
import { MIN, at, addDays, daysBetween, fmtTime, toDateStr } from './time.js';
import { SUBJECT_KEYS, MANDATORY_RANK, AUTONOMOUS_RANK, DEFAULT_UNCERTAINTY, KINDS } from './config.js';
import { remainingOf, estimateOf } from './planner.js';
import { awakeWindow, buildDays, flattenFree, firstFreeAt, logicalDay } from './capacity.js';
import { simulate, minutesInRange } from './simulate.js';

const SCENARIOS = ['low', 'exp', 'high'];
const AUTONOMOUS = new Set(['review', 'exam_prep']);
const MANDATORY = new Set(['homework', 'performance']);

export function examContext(settings, todayStr) {
  const exams = (settings.exams ?? [])
    .filter((e) => e.date && (e.endDate || e.date) >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  const exam = exams[0];
  if (!exam) return { active: false, near: false, exam: null, subjects: [] };
  const dDay = Math.max(0, daysBetween(todayStr, exam.date));
  return {
    exam,
    dDay,
    during: todayStr >= exam.date,
    active: dDay <= (settings.examModeDays ?? 21),
    near: dDay <= (settings.nearExamDays ?? 7),
    subjects: exam.subjects?.length ? exam.subjects : SUBJECT_KEYS,
  };
}

/** 우선 등급. 숫자가 클수록 먼저. (마감 보호는 시뮬레이터가 별도로 보장) */
export function tierOf(task, ex) {
  const examSubject = ex.active && ex.subjects.includes(task.subject);
  switch (task.kind) {
    case 'performance':
      return 100;
    case 'homework':
      return 80;
    case 'exam_prep':
      return ex.near && examSubject ? 92 : examSubject ? 78 : 60;
    case 'review':
      return ex.near && examSubject ? 90 : examSubject ? 72 : 50;
    case 'project':
      if (!ex.active) return 30;
      return task.examRelated ? 65 : 5;
    default:
      return 40;
  }
}

function subjectRank(task) {
  const order = AUTONOMOUS.has(task.kind) ? AUTONOMOUS_RANK : MANDATORY_RANK;
  const i = order.indexOf(task.subject);
  return i < 0 ? order.length : i;
}

function scenarioFactor(task, scenario, uncertainty) {
  if (scenario === 'exp') return 1;
  const [lo, hi] = uncertainty[task.subject] ?? uncertainty.other ?? [-0.1, 0.25];
  // 사용자가 방금 "남은 시간"을 직접 고쳤다면 그 값을 더 신뢰한다.
  const k = task.remainingMin != null ? 0.5 : 1;
  return 1 + (scenario === 'low' ? lo : hi) * k;
}

export function hardDueOf(task, settings, ex) {
  if (task.deadline) {
    return task.deadlineTime ? at(task.deadline, task.deadlineTime) : awakeWindow(settings, task.deadline).end;
  }
  if (task.kind === 'exam_prep' && ex.exam && ex.subjects.includes(task.subject)) {
    return awakeWindow(settings, ex.exam.date).start; // 시험 당일 아침 전까지
  }
  return null;
}

function softDueOf(task, settings, ex) {
  if (task.kind === 'project' && ex.active && !task.examRelated) return null; // 시험 집중: 프로젝트 보류
  return task.date ? awakeWindow(settings, task.date).end : null;
}

export function buildItems(tasks, scenario, settings, ex) {
  const unc = { ...DEFAULT_UNCERTAINTY, ...(settings.uncertainty ?? {}) };
  return tasks.map((t) => ({
    taskId: t.id,
    kind: t.kind,
    subject: t.subject,
    minutes: remainingOf(t) * scenarioFactor(t, scenario, unc),
    guardMin: remainingOf(t) * Math.max(scenarioFactor(t, 'high', unc), scenarioFactor(t, scenario, unc)),
    hardDue: hardDueOf(t, settings, ex),
    softDue: softDueOf(t, settings, ex),
    tier: tierOf(t, ex),
    plannedStart: t.date && t.start ? at(t.date, t.start) : null,
    subjectRank: subjectRank(t),
  }));
}

function horizonFor(tasks, settings, today, ex) {
  let far = settings.horizonDays ?? 7;
  for (const t of tasks) {
    for (const d of [t.deadline, t.date]) if (d) far = Math.max(far, daysBetween(today, d) + 1);
  }
  if (ex.exam) far = Math.max(far, daysBetween(today, ex.exam.date) + 1);
  return Math.min(Math.max(far, settings.horizonDays ?? 7), 28);
}

export const blockRange = (t) => {
  if (!t.date || !t.start || !t.end) return null;
  const s = at(t.date, t.start);
  let e = at(t.date, t.end);
  if (e <= s) e += 86_400_000;
  return { start: s, end: e };
};

const range = (vals) => [Math.min(...vals), Math.max(...vals)];

function delayImpact(sc, tasksById, settings) {
  const per = {};
  for (const k of SCENARIOS) {
    const { base, delayed } = sc[k];
    let reviewLoss = 0;
    const pushed = [];
    for (const [id, b] of base.byTask) {
      const d = delayed.byTask.get(id);
      const t = tasksById.get(id);
      if (AUTONOMOUS.has(t.kind) && b.softDue != null) reviewLoss += Math.max(0, b.doneBySoftDue - d.doneBySoftDue);
      if (d.softLateMin - b.softLateMin > 5) pushed.push({ taskId: id, minutes: d.softLateMin - b.softLateMin });
    }
    per[k] = { hardDiff: Math.max(0, delayed.hardShortfall - base.hardShortfall), reviewLoss, pushed };
  }
  const th = settings.thresholds?.reviewLossMin ?? 15;
  let severity = 'none';
  if (per.exp.hardDiff > 1) severity = 'high';
  else if (per.high.hardDiff > 1 || per.exp.reviewLoss >= th) severity = 'medium';
  else if (per.high.reviewLoss >= th) severity = 'low';
  return {
    severity,
    per,
    hardRange: range(SCENARIOS.map((k) => per[k].hardDiff)),
    reviewLossRange: range(SCENARIOS.map((k) => per[k].reviewLoss)),
    pushed: per.exp.pushed,
    hardAffected: [...sc.exp.delayed.byTask.values()]
      .filter((d) => d.hardLateMin - (sc.exp.base.byTask.get(d.taskId)?.hardLateMin ?? 0) > 1)
      .map((d) => d.taskId),
  };
}

function reasonFor(task, today, ex) {
  const bits = [];
  if (task.kind === 'performance') bits.push('수행평가');
  if (task.deadline) {
    const diff = daysBetween(today, task.deadline);
    const when = diff === 0 ? '오늘' : diff === 1 ? '내일' : diff === 2 ? '모레' : `D-${diff}`;
    bits.push(`마감 ${when}${task.deadlineTime ? ' ' + task.deadlineTime : ''}`);
  } else if (task.kind === 'exam_prep' && ex.exam) bits.push(`${ex.exam.name} 대비`);
  if (task.date === today) bits.push('오늘 계획');
  else if (task.date && task.date < today) bits.push('지난 계획 미완료');
  return bits.join(' · ') || KINDS[task.kind];
}

/**
 * @returns 홈 화면과 플래너가 사용하는 판단 결과 전체
 */
export function decide(state, nowMs) {
  const settings = state.settings;
  const { date: today, sleeping } = logicalDay(settings, nowMs);
  const ex = examContext(settings, today);
  const tasksById = new Map(state.tasks.map((t) => [t.id, t]));
  const open = state.tasks.filter((t) => t.status !== 'done' && remainingOf(t) > 0);
  // 시험 집중 모드: 시험과 직접 관련 없는 프로젝트는 보류 (배치·추천하지 않음)
  const isHeld = (t) => ex.active && t.kind === 'project' && !t.examRelated;
  const held = open.filter(isHeld);
  const active = open.filter((t) => !isHeld(t));

  const horizon = horizonFor(active, settings, today, ex);
  const days = buildDays(state, nowMs, horizon);
  const windows = flattenFree(days);
  const horizonEnd = days.at(-1).awake.end;
  const todayInfo = days[0];
  const todayEnd = todayInfo.awake.end;

  // 기준 계획(지금 시작) vs 지연 계획(N분 후 시작), 각각 낙관/예상/비관 시나리오
  const startFree = firstFreeAt(windows, nowMs);
  const delayStart = startFree + (settings.delayMin ?? 30) * MIN;
  const canDelayToday = !sleeping && startFree < todayEnd;
  const sc = {};
  for (const k of SCENARIOS) {
    const items = buildItems(active, k, settings, ex);
    sc[k] = {
      items,
      base: simulate(items, windows, nowMs, horizonEnd),
      delayed: canDelayToday ? simulate(items, windows, delayStart, horizonEnd) : null,
    };
  }
  const delay = canDelayToday
    ? delayImpact(sc, tasksById, settings)
    : {
        severity: 'none',
        per: null,
        hardRange: [0, 0],
        reviewLossRange: [0, 0],
        pushed: [],
        hardAffected: [],
      };

  // 마감 위험 (지연과 무관하게 이미 부족한 경우)
  const risks = active
    .map((t) => ({
      task: t,
      exp: sc.exp.base.byTask.get(t.id).hardLateMin,
      high: sc.high.base.byTask.get(t.id).hardLateMin,
      low: sc.low.base.byTask.get(t.id).hardLateMin,
    }))
    .filter((r) => r.high > 1)
    .sort((a, b) => hardDueOf(a.task, settings, ex) - hardDueOf(b.task, settings, ex));
  const expRisks = risks.filter((r) => r.exp > 1);
  const highOnlyRisks = risks.filter((r) => r.exp <= 1);

  // 오늘 요약
  const todayWork = Object.fromEntries(
    SCENARIOS.map((k) => [k, minutesInRange(sc[k].base.timeline, nowMs, todayEnd)]),
  );
  const freeToday = todayInfo.freeMin;
  const slack = {
    lo: Math.max(0, freeToday - todayWork.high),
    exp: Math.max(0, freeToday - todayWork.exp),
    hi: Math.max(0, freeToday - todayWork.low),
  };

  const timelineToday = sc.exp.base.timeline
    .filter((p) => p.start < todayEnd)
    .map((p) => ({ ...p, task: tasksById.get(p.taskId) }));

  // 주간 개요
  const week = days.slice(0, 7).map((d) => {
    const work = minutesInRange(sc.exp.base.timeline, d.awake.start, d.awake.end);
    const dues = active.filter((t) => t.deadline === d.date);
    return { date: d.date, freeMin: d.freeMin, workMin: work, busy: d.busy, dues };
  });

  // 플래너 상 "지금" 블록 — 기록된 상태만 보여주고 진행 여부는 추측하지 않는다.
  const plannedNow = state.tasks.find((t) => {
    const r = blockRange(t);
    return r && r.start <= nowMs && nowMs < r.end;
  });
  const fixedNow = todayInfo.busy.find((b) => b.start <= nowMs && nowMs < b.end) ?? null;

  // 확인 필요: 계획 시간이 지났지만 완료 표시가 없는 블록
  const checkins = state.tasks
    .filter((t) => t.status !== 'done')
    .filter((t) => {
      const r = blockRange(t);
      return r && r.end <= nowMs && (!t.ackAt || t.ackAt < r.end) && nowMs - r.end < 3 * 86_400_000;
    })
    .slice(0, 4);

  // 시험 공부 필요도 (고정 순위보다 실제 남은 학습량 우선)
  const needs = ex.active
    ? ex.subjects
        .map((s) => ({
          subject: s,
          minutes: active
            .filter((t) => t.subject === s && AUTONOMOUS.has(t.kind))
            .reduce((m, t) => m + remainingOf(t), 0),
          pending: state.examPending?.[s] ?? 0, // 시험대비 앱의 이번 주 남은 할 일 수
          practiceDone: state.tasks
            .filter(
              (t) =>
                t.subject === s &&
                t.kind === 'homework' &&
                t.status === 'done' &&
                t.completedAt &&
                nowMs - t.completedAt < 7 * 86_400_000,
            )
            .reduce((m, t) => m + estimateOf(t), 0),
        }))
        .sort(
          (a, b) =>
            b.pending - a.pending ||
            b.minutes - a.minutes ||
            AUTONOMOUS_RANK.indexOf(a.subject) - AUTONOMOUS_RANK.indexOf(b.subject),
        )
    : [];

  // 장기 프로젝트 후보
  const projects = active
    .filter((t) => t.kind === 'project')
    .filter((t) => (ex.active ? t.examRelated && remainingOf(t) <= 45 : true))
    .map((t) => ({
      task: t,
      score: (Number(t.value) || 2) * (Number(t.usage) || 2),
      feasible: (sc.exp.base.byTask.get(t.id)?.unplacedMin ?? 0) < 1,
    }))
    .sort((a, b) => b.score - a.score || remainingOf(a.task) - remainingOf(b.task));

  const next = timelineToday.find((p) => p.end > nowMs) ?? null;
  const tomorrowFirst = sc.exp.base.timeline.find((p) => p.start >= todayEnd);

  // ───────── 메인 카드 선택 ─────────
  const th = settings.thresholds ?? {};
  let card;
  if (sleeping || (freeToday <= 0 && startFree >= todayEnd)) {
    card = {
      type: 'sleep',
      eyebrow: 'REST',
      title: sleeping ? '지금은 쉬는 시간' : '오늘 가용 시간 종료',
      message: '수면 시간은 줄이지 않아. 남은 작업은 다음 일정에 이미 반영해 뒀어.',
      next: tomorrowFirst ? { ...tomorrowFirst, task: tasksById.get(tomorrowFirst.taskId) } : null,
    };
  } else if (expRisks.length) {
    const r = expRisks[0];
    const isExam = r.task.kind === 'exam_prep' && !r.task.deadline;
    card = {
      type: 'deadline',
      eyebrow: 'DEADLINE RISK',
      title: isExam ? `${ex.exam.name} 전 시험 공부 시간 부족` : `${r.task.title} 마감 위험`,
      message: `가능한 시간을 모두 써도 ${isExam ? '시험 전까지' : '마감까지'} ${fmtLoss(r.low, r.exp, r.high)}이 모자라. 수면 시간을 줄이는 계획은 추천하지 않아. 다른 작업을 줄이거나 마감 조정이 필요해.`,
      taskId: r.task.id,
      others: expRisks.slice(1).map((x) => x.task.id),
    };
  } else if (delay.severity === 'high' || delay.severity === 'medium') {
    const target = next?.task;
    const d = delay.per;
    const parts = [];
    if (d.exp.hardDiff > 1) parts.push(`마감까지 ${fmtLoss(d.low.hardDiff, d.exp.hardDiff, d.high.hardDiff)}이 부족해져.`);
    else if (d.high.hardDiff > 1)
      parts.push(`작업이 예상보다 길어질 경우 마감까지 ${fmtLoss(0, 0, d.high.hardDiff)}이 부족할 수 있어.`);
    const [rLo, rHi] = delay.reviewLossRange;
    if (rHi >= (th.reviewLossMin ?? 15)) parts.push(`복습 가능 시간은 ${fmtLoss(rLo, d.exp.reviewLoss, rHi)} 줄어들 수 있어.`);
    card = {
      type: 'delay',
      eyebrow: 'START NOW',
      title: target ? `${target.title} 지금 시작` : '지금 시작하는 게 좋아',
      message: `${settings.delayMin}분 미루면, ${parts.join(' ')}`,
      taskId: target?.id,
    };
  } else if (highOnlyRisks.length) {
    const r = highOnlyRisks[0];
    card = {
      type: 'caution',
      eyebrow: 'HEADS UP',
      title: `${r.task.title} 빠듯할 수 있어`,
      message: `예상보다 오래 걸리면 마감까지 ${fmtLoss(0, 0, r.high)}이 부족할 수 있어. 지금 계획대로면 괜찮아.`,
      taskId: r.task.id,
    };
  } else if (ex.active) {
    const top = needs.find((n) => n.pending > 0 || n.minutes > 0);
    const needText = top
      ? top.pending
        ? `시험대비 이번 주 남은 할 일이 가장 많은 과목은 ${subjLabel(top.subject)}(${top.pending}개).`
        : `남은 시험 공부가 가장 많은 과목은 ${subjLabel(top.subject)}(${Math.round(top.minutes)}분).`
      : '';
    card = {
      type: 'exam',
      eyebrow: `EXAM FOCUS · ${ex.during ? '시험 기간' : `D-${ex.dDay}`}`,
      title: next?.task ? next.task.title : top ? `${subjLabel(top.subject)} 시험 공부` : ex.exam.name,
      subject: top?.subject ?? null,
      message: top
        ? `${needText} 시험과 직접 관련 없는 프로젝트는 잠시 뒤로 미뤘어.`
        : '시험 공부 계획이 아직 없어. 15577에 과목별 시험 공부 블록을 넣으면 필요도에 맞춰 배치할게.',
      taskId: next?.task?.id,
    };
  } else if (
    projects.length &&
    slack.exp >= (th.projectSlackMin ?? 30) &&
    !active.some((t) => t.date === today && MANDATORY.has(t.kind) && sc.exp.base.byTask.get(t.id).softLateMin > 0)
  ) {
    const p = projects[0].task;
    card = {
      type: 'project',
      eyebrow: 'MAIN PRIORITY · PROJECT',
      title: p.title,
      message: '현재 필수 일정에 여유가 있어. 장기적인 가치가 있는 작업을 진행할 수 있어.',
      taskId: p.id,
    };
  } else if (next) {
    card = {
      type: 'next',
      eyebrow: 'NEXT',
      title: next.task.title,
      message: `${fmtTime(next.start)}부터 · ${reasonFor(next.task, today, ex)}`,
      taskId: next.task.id,
    };
  } else if (!state.tasks.length) {
    card = {
      type: 'empty',
      eyebrow: 'WELCOME',
      title: '플래너를 채워 줘',
      message: '15577에 평소처럼 블록을 넣으면 돼. 블록 길이를 예상 소요 시간으로 읽어서 판단할게.',
    };
  } else {
    card = {
      type: 'free',
      eyebrow: 'ALL CLEAR',
      title: '오늘 필수 작업 끝',
      message: `남은 시간 ${Math.round(freeToday)}분. 복습이나 휴식, 장기 프로젝트에 써도 좋아.`,
    };
  }

  const mode = ['deadline', 'delay', 'caution'].includes(card.type) ? 'risk' : ex.active ? 'exam' : 'normal';

  return {
    now: nowMs,
    today,
    sleeping,
    mode,
    card,
    exam: ex,
    needs,
    today_: { freeMin: freeToday, work: todayWork, slack, end: todayEnd, start: todayInfo.awake.start },
    timelineToday,
    next,
    delay,
    risks: { exp: expRisks, highOnly: highOnlyRisks },
    week,
    days,
    plannedNow: plannedNow ?? null,
    fixedNow,
    checkins,
    projects,
    held,
    horizon,
    scenarios: sc,
    reasonFor: (t) => reasonFor(t, today, ex),
  };
}

/**
 * 불확실성을 반영한 손실 표현. 확정적인 숫자 대신 범위로 말한다.
 *   낙관 시나리오도 손실 → "약 20~40분"
 *   예상 시나리오부터 손실 → "약 {예상}~{비관}분"
 *   비관 시나리오에서만 손실 → "최대 약 30분"
 */
export function fmtLoss(lo, mid, hi) {
  const r = (v) => Math.round(v / 5) * 5;
  const b = Math.max(5, r(hi));
  const a = lo >= 5 ? r(lo) : mid >= 5 ? r(mid) : null;
  if (a == null) return `최대 약 ${b}분`;
  if (a >= b) return `약 ${b}분`;
  return `약 ${a}~${b}분`;
}

const SUBJ = { math: '수학', korean: '국어', english: '영어', science: '과학', other: '기타' };
const subjLabel = (s) => SUBJ[s] ?? s;

export { toDateStr, addDays };
