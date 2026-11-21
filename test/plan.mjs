// Planner 2.0 (판단 WS 타임박싱) 검증: node --test test/plan.mjs
// 명세 §10 완료 기준 중 화면 없이 확인할 수 있는 것: 블록 저장, 분할 시 중복 없음, 고정 일정 충돌, Big 3 확정, 수정안 승인 전 무변경, 합치기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../public/decide/tb/blocks.js';
import * as TK from '../public/decide/tb/tasks.js';
import * as PL from '../public/decide/tb/plan.js';
import '../public/decide/tb/merge.js';
import { DEFAULT_SETTINGS } from '../public/decide/engine/config.js';

const SAT = '2026-11-21'; // 토요일
const MON = '2026-11-23';
const settings = structuredClone(DEFAULT_SETTINGS); // 토 08:30–23:30, 평일 07:00–23:30
const at = (k, h, m = 0) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), h, m).getTime();

function plan15577() {
  return {
    v: 1, updatedAt: 1,
    cats: [{ id: 'math', name: '수학', color: '#3E6FD8' }, { id: 'eng', name: '영어', color: '#1E9E7A' }, { id: 'kor', name: '국어', color: '#C2457A' }, { id: 'h1', name: '역사', color: '#2A9BB8' }, { id: 'etc', name: '기타', color: '#7A8699' }],
    fixed: [
      { id: 'aca', title: '수학 학원', start: 14 * 60, dur: 180, days: [6] },
      { id: 'lunch', title: '점심', start: 12 * 60, dur: 60, days: [6], meal: true },
      { id: 's1-1', title: '국어', start: 9 * 60, dur: 50, days: [1], school: true, period: 1 },
    ],
    days: {
      [SAT]: [
        { id: 'bm', title: '수학 숙제', cat: 'math', est: 120, dur: 120, start: 19 * 60, done: false, units: 0 },
        { id: 'be', title: '영어 복습', cat: 'eng', est: 60, dur: 60, start: 21 * 60, done: false, review: true },
      ],
      '2026-11-19': [{ id: 'old', title: '국어 개념복습', cat: 'kor', est: 40, dur: 40, start: 20 * 60, done: false }],
    },
    log: [],
  };
}

test('과목: 15577 과목·제목을 Planner 과목으로 (역사 → 사회·역사)', () => {
  const P = plan15577();
  assert.equal(B.subjectOf(P, 'math'), 'math');
  assert.equal(B.subjectOf(P, 'h1'), 'soc');
  assert.equal(B.subjectOf(P, 'etc', '통합사회 보고서'), 'soc');
  assert.equal(B.catForSubject(P, 'soc'), 'h1');
  assert.equal(B.subjectColor('math'), '#4D83DB');
  assert.equal(B.subjectColor('math', { math: '#000000' }), '#000000');
});

test('블록을 옮기거나 늘리면 그 블록만 바뀌고 id는 그대로다 (다른 블록은 밀지 않음)', () => {
  const P = plan15577();
  B.moveBlock(P, 'bm', SAT, 20 * 60 + 2);
  const { b } = B.findB(P, 'bm');
  assert.equal(b.start, 20 * 60); // 5분 단위
  assert.equal(B.findB(P, 'be').b.start, 21 * 60);
  B.resizeBlock(P, 'bm', 90);
  assert.equal(b.dur, 90); assert.equal(b.est, 90);
  B.moveBlock(P, 'bm', MON, 17 * 60);
  assert.equal(B.findB(P, 'bm').k, MON);
  assert.equal(B.findB(P, 'bm').b.id, 'bm');
  assert.equal(P.days[SAT].length, 1);
  // JSON으로 저장했다 읽어도 같다
  const back = JSON.parse(JSON.stringify(P));
  assert.equal(B.findB(back, 'bm').b.start, 17 * 60);
});

test('고정 일정(학원)·다른 블록·취침과의 충돌을 감지한다 (식사는 충돌 아님)', () => {
  const P = plan15577();
  B.moveBlock(P, 'bm', SAT, 15 * 60); // 학원 14–17시와 겹침
  let c = B.conflictsOn(P, SAT, [], settings);
  assert.equal(c.get('bm')[0].type, 'fixed');
  B.moveBlock(P, 'bm', SAT, 12 * 60 + 10); // 점심과 겹침, 학원 14시 전 끝
  B.resizeBlock(P, 'bm', 60);
  c = B.conflictsOn(P, SAT, [], settings);
  assert.equal(c.has('bm'), false);
  B.moveBlock(P, 'bm', SAT, 20 * 60 + 30); // 영어 21시와 겹침
  c = B.conflictsOn(P, SAT, [], settings);
  assert.equal(c.get('bm')[0].type, 'block');
  assert.equal(c.get('be')[0].type, 'block');
  B.moveBlock(P, 'be', SAT, 23 * 60); // 23:30 취침 넘김
  c = B.conflictsOn(P, SAT, [], settings);
  assert.ok(c.get('be').some((x) => x.type === 'sleep'));
  // 일정 앱의 시각 있는 일정도 고정 일정이다
  const ev = [{ id: 'x', kind: 'event', date: SAT, time: '20:00', end_time: '21:00', title: '영어 학원' }];
  c = B.conflictsOn(P, SAT, ev, settings);
  assert.ok(c.get('bm').some((x) => x.type === 'fixed' && x.label === '영어 학원'));
});

test('하나의 작업을 여러 블록으로 나눠도 작업은 하나다 (중복 생성 없음)', () => {
  const P = plan15577();
  const doc = TK.emptyDoc();
  const n = B.splitBlock(P, 'bm', 60);
  assert.ok(n);
  assert.equal(B.findB(P, 'bm').b.est, 60);
  assert.equal(n.est, 60);
  TK.linkBlock(doc, n.id, 'p:bm');
  B.moveBlock(P, n.id, '2026-11-22', 18 * 60); // 다음 날로
  const { tasks, blockTask } = TK.deriveTasks({ doc, P, events: [], today: SAT });
  const math = tasks.filter((t) => t.title === '수학 숙제');
  assert.equal(math.length, 1);
  assert.equal(math[0].blocks.length, 2);
  assert.equal(math[0].placedMin, 120);
  assert.equal(blockTask.get(n.id), 'p:bm');
});

test('Brain Dump: 일정 마감은 일정 id로, 같은 작업을 다시 넣으면 만들지 않는다', () => {
  const P = plan15577();
  const doc = TK.emptyDoc();
  const events = [
    { id: 'e1', kind: 'deadline', date: '2026-11-24', time: '18:00', title: '국어 수행 보고서', cat: 'school' },
    { id: 'e2', kind: 'event', date: SAT, time: '10:00', end_time: '11:00', title: '병원' },
  ];
  let D = TK.deriveTasks({ doc, P, events, today: SAT });
  const ev = D.byId.get('ev:e1');
  assert.equal(ev.deadline, '2026-11-24'); assert.equal(ev.deadlineTime, '18:00'); assert.equal(ev.subject, 'kor');
  assert.equal(D.byId.has('ev:e2'), false); // 시각 있는 일정은 작업이 아니라 고정 일정
  // 지난 미완료 블록은 이월 후보
  assert.equal(D.byId.get('p:old').carry, true);
  // 같은 작업 다시 입력
  const r = TK.addTask(doc, D.tasks, { title: '국어 수행 보고서', deadline: '2026-11-24' });
  assert.equal(r.dup, true); assert.equal(r.task.id, 'ev:e1');
  const r2 = TK.addTask(doc, D.tasks, { title: '과학 실험 보고서', est: 50 });
  assert.equal(r2.dup, false);
  D = TK.deriveTasks({ doc, P, events, today: SAT });
  assert.equal(TK.addTask(doc, D.tasks, { title: '과학  실험 보고서' }).dup, true);
  // 일정 작업에 예상 시간을 넣어도 id·제목은 일정 것
  TK.updateTask(doc, D.byId.get('ev:e1'), { est: 90, title: '다른 제목' });
  D = TK.deriveTasks({ doc, P, events, today: SAT });
  assert.equal(D.byId.get('ev:e1').title, '국어 수행 보고서');
  assert.equal(D.byId.get('ev:e1').est, 90);
  assert.equal(D.byId.get('ev:e1').unplaced, 90);
});

test('빠른 입력: 시간·마감·중요도를 읽는다', () => {
  const q = TK.parseQuick('수학 숙제 1시간 30분 11/24 !!', SAT);
  assert.deepEqual([q.title, q.subject, q.est, q.deadline, q.priority], ['수학 숙제', 'math', 90, '2026-11-24', 2]);
  const q2 = TK.parseQuick('영단어 40분 내일', SAT);
  assert.deepEqual([q2.title, q2.est, q2.deadline], ['영단어', 40, '2026-11-22']);
  const q3 = TK.parseQuick('통사 보고서 화요일까지', SAT);
  assert.equal(q3.deadline, '2026-11-24'); assert.equal(q3.subject, 'soc');
});

test('Big 3는 추천만 하고, 사용자가 확정해야 저장된다', () => {
  const P = plan15577();
  const doc = TK.emptyDoc();
  const events = [{ id: 'e1', kind: 'deadline', date: '2026-11-22', title: '영어 단어 시험 준비', cat: 'academy' }];
  const D = TK.deriveTasks({ doc, P, events, today: SAT });
  const rec = TK.recommendBig3(D.tasks, { today: SAT, type: 'daily', freeToday: 300 });
  assert.ok(rec.length >= 2);
  assert.equal(rec[0].task.id, 'ev:e1'); // 내일 마감
  assert.equal(TK.getBig3(doc, 'daily', SAT), null); // 추천만으로는 아무것도 저장 안 됨
  TK.confirmBig3(doc, 'daily', SAT, rec.slice(0, 3).map((x) => x.task.id).concat(['x', 'y']));
  const b = TK.getBig3(doc, 'daily', SAT);
  assert.equal(b.confirmedByUser, true);
  assert.equal(b.taskIds.length, 3);
});

test('시간 배분: 빈 시간에만, 마감 전까지, 여러 날로 나눠 제안한다', () => {
  const P = plan15577();
  const doc = TK.emptyDoc();
  const events = [{ id: 'e1', kind: 'deadline', date: '2026-11-22', time: '20:00', title: '과학 보고서', cat: 'school' }];
  TK.updateTask(doc, { id: 'ev:e1', src: 'event' }, { est: 500 });
  const D = TK.deriveTasks({ doc, P, events, today: SAT });
  const before = JSON.stringify(P);
  const { changes, left } = PL.allocate({ tasks: D.tasks, P, events, settings, today: SAT, nowMin: 10 * 60, only: ['ev:e1'] });
  assert.equal(JSON.stringify(P), before); // 제안은 기록을 바꾸지 않는다
  const sum = changes.reduce((s, c) => s + c.dur, 0);
  assert.equal(sum + left.reduce((s, x) => s + x.min, 0), 500);
  for (const c of changes) {
    assert.ok(c.date <= '2026-11-22');
    const it = { s: c.start, e: c.start + c.dur };
    for (const f of B.busyOn(P, c.date, events)) assert.ok(!(it.s < f.e && f.s < it.e), '고정 일정과 겹침');
    for (const b of B.blocksOn(P, c.date)) assert.ok(!(it.s < b.start + b.dur && b.start < it.e), '블록과 겹침');
    if (c.date === SAT) assert.ok(c.start >= 10 * 60);
    if (c.date === '2026-11-22') assert.ok(it.e <= 20 * 60);
    assert.ok(c.dur <= 90);
  }
  assert.ok(new Set(changes.map((c) => c.date)).size >= 2);
  // 적용하면 블록이 생기고 작업은 여전히 하나
  for (const c of changes) PL.applyAlloc(P, doc, c);
  const D2 = TK.deriveTasks({ doc, P, events, today: SAT });
  assert.equal(D2.tasks.filter((t) => t.title === '과학 보고서').length, 1);
  assert.equal(D2.byId.get('ev:e1').placedMin, sum);
});

test('시간 초과: 뒤 일정과 겹칠 때만 수정안, 승인 전에는 계획이 그대로다', () => {
  const P = plan15577();
  const now = at(SAT, 21, 25);
  // 예상 시간 안에 끝났으면 문제 없음
  B.completeBlock(P, 'bm', 115);
  assert.equal(PL.overrunIssues({ P, k: SAT, events: [], settings, now }).length, 0);
  B.undoneBlock(P, 'bm');
  // 실제 150분(30분 초과) → 영어 복습과 겹침
  B.completeBlock(P, 'bm', 150);
  const iss = PL.overrunIssues({ P, k: SAT, events: [], settings, now });
  assert.equal(iss.length, 1); assert.equal(iss[0].over, 30);
  const before = JSON.stringify(P.days);
  const prop = PL.shiftProposal({ P, k: SAT, events: [], settings, srcId: 'bm', now });
  assert.match(prop.reason, /수학 숙제.*30분 늦어졌습니다/);
  assert.match(prop.reason, /영어 복습.*30분 뒤로/);
  assert.equal(JSON.stringify(P.days), before); // 아직 바뀌지 않음
  const r = PL.applyProposal(P, prop);
  assert.equal(r.ok, true);
  assert.equal(B.findB(P, 'be').b.start, 21 * 60 + 30);
  // 실제 시간을 모르면 초과로 보지 않는다
  const P2 = plan15577();
  B.completeBlock(P2, 'bm', null);
  assert.equal(B.findB(P2, 'bm').b.actual, undefined);
  assert.equal(P2.log.length, 0);
  assert.equal(PL.overrunIssues({ P: P2, k: SAT, events: [], settings, now }).length, 0);
});

test('시간 초과: 취침을 넘기면 다음 날로 옮기는 안, 그 사이 블록을 고쳤으면 적용 안 함', () => {
  const P = plan15577();
  B.moveBlock(P, 'be', SAT, 22 * 60 + 30);
  B.extendBlock(P, 'bm', 240); // 19:00–01:00 (아직 안 끝남)
  const prop = PL.shiftProposal({ P, k: SAT, events: [], settings, srcId: 'bm' });
  assert.equal(prop.changes[0].to.date, '2026-11-22');
  assert.ok(prop.impact.tomorrow === 1);
  B.moveBlock(P, 'be', SAT, 18 * 60);
  assert.equal(PL.applyProposal(P, prop).ok, false);
  assert.equal(B.findB(P, 'be').k, SAT);
});

test('마감 판단은 D-day가 아니라 남은 양과 빈 시간으로', () => {
  const P = plan15577();
  const doc = TK.emptyDoc();
  const events = [{ id: 'e1', kind: 'deadline', date: SAT, time: '23:00', title: '수행 보고서', cat: 'school' }];
  TK.updateTask(doc, { id: 'ev:e1', src: 'event' }, { est: 240 });
  let D = TK.deriveTasks({ doc, P, events, today: SAT });
  const nowMin = 20 * 60;
  let free = PL.freeUntil({ P, events, settings, today: SAT, nowMin, deadline: SAT, deadlineTime: '23:00' });
  let info = TK.deadlineInfo(D.byId.get('ev:e1'), { today: SAT, free });
  assert.equal(info.level, 'risk');
  TK.updateTask(doc, { id: 'ev:e1', src: 'event' }, { est: 20 });
  D = TK.deriveTasks({ doc, P, events, today: SAT });
  info = TK.deadlineInfo(D.byId.get('ev:e1'), { today: SAT, free: 120 });
  assert.equal(info.level, 'plan');
  TK.updateTask(doc, { id: 'ev:e1', src: 'event' }, { est: null });
  D = TK.deriveTasks({ doc, P, events, today: SAT });
  assert.equal(TK.deadlineInfo(D.byId.get('ev:e1'), { today: SAT, free: 120 }).level, 'unknown');
});

test('합치기: 두 기기에서 고친 것은 늦은 쪽이 이기고 지운 것은 지워진다', () => {
  const { clean, merge } = globalThis.PlanMerge;
  const a = TK.emptyDoc(), b = TK.emptyDoc();
  TK.put(a, 'tasks', { id: 't1', title: 'A' }, 1000);
  TK.put(b, 'tasks', { id: 't1', title: 'B' }, 2000);
  TK.put(a, 'tasks', { id: 't2', title: 'x' }, 1000);
  TK.del(b, 'tasks', 't2', 3000);
  TK.put(b, 'tasks', { id: 't2', title: 'x' }, 1000);
  TK.del(b, 'tasks', 't2', 3000);
  const m = merge(clean(a), clean(b));
  assert.equal(m.tasks.t1.title, 'B');
  assert.equal(m.tasks.t2.del, 1);
  assert.equal(TK.live(m, 'tasks').length, 1);
});

test('시간 배분: 지난 미완료(이월 후보)는 새 블록을 만들지 않고, 5분짜리 조각을 만들지 않는다', () => {
  const P = plan15577();
  const doc = TK.emptyDoc();
  TK.addTask(doc, [], { title: '국어 숙제', est: 45 });
  const D = TK.deriveTasks({ doc, P, events: [], today: SAT });
  assert.equal(D.byId.get('p:old').carry, true);
  const { changes } = PL.allocate({ tasks: D.tasks, P, events: [], settings, today: SAT, nowMin: 9 * 60 + 20, chunkMax: 40 });
  assert.ok(!changes.some((c) => c.taskId === 'p:old'));
  assert.ok(changes.every((c) => c.dur >= 25), changes.map((c) => c.dur).join(','));
  assert.equal(changes.filter((c) => c.title === '국어 숙제').reduce((s, c) => s + c.dur, 0), 45);
});
