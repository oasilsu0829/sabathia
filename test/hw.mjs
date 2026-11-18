// 숙제 해석·연결·진행률·위험도 검증: node test/hw.mjs
// 일정(할 일) ↔ 15577 블록(b.hw) 연결, 문제 수 인식, 남은 시간 추정, 마감 위험(임박도와 분리)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/hw.js';
import { buildState } from '../public/decide/sources.js';
import { buildHomework, assess, groupHomework } from '../public/decide/homework.js';
import { decide } from '../public/decide/engine/decide.js';
import { DEFAULT_SETTINGS } from '../public/decide/engine/config.js';
import { at } from '../public/decide/engine/time.js';

const H = globalThis.SabathiaHW;
const WED = '2026-11-18', THU = '2026-11-19', FRI = '2026-11-20', SAT = '2026-11-21';
const settings = () => structuredClone(DEFAULT_SETTINGS);
const local = () => ({ settings: settings(), ov: {}, log: [] });

test('문제 수 인식: 범위(양 끝 포함), 직접 적은 개수, 여러 범위, 쪽수, 모호한 경우', () => {
  assert.deepEqual(H.count('수평잡기 함수 313~395번').n, 83);
  assert.equal(H.count('수평잡기 함수 313~395번').certain, true);
  assert.equal(H.count('봄봄 51문제').n, 51);
  assert.equal(H.count('어문규정 1 43문제 · 2 29문제').n, 72);
  assert.equal(H.count('영어 모고 88문제 (모고1 35~39 / 모고2 33, 39)').n, 88); // 직접 적은 개수가 우선
  assert.equal(H.count('프린트 1~10, 15~20번').n, 16);
  assert.equal(H.count('올림포스 유리함수 1~42번 p.132~140').n, 42); // 쪽은 보조 정보
  const pages = H.count('자습서 95~133쪽, 239~285쪽');
  assert.deepEqual([pages.n, pages.unit], [86, '쪽']);
  assert.equal(H.count('국좋 교재 3주차 + 자습서 95~133쪽').certain, false); // 분량 없는 부분
  assert.equal(H.count('올림포스 유리함수 1·2·3번').certain, false); // 번호 목록
  assert.equal(H.count('쎈 1~100번 홀수').certain, false); // 선택 풀이
  assert.equal(H.count('395~313번'), null); // 뒤집힌 범위는 세지 않는다
  assert.equal(H.count('합성함수 프린트 + 개념'), null); // 모르면 null
});

test('메모의 "N문제 남음"과 소속·과목', () => {
  assert.deepEqual(H.noteLeft('수학 유리함수 프린트 1~48번 중 17문제 남음 (11/4 21:23 기준)'), { left: 17, total: null, text: '11/4 21:23 기준' });
  assert.equal(H.group({ title: '수평잡기 함수 396~455번 (백인대장)', cat: 'academy' }).label, '백인대장');
  assert.equal(H.group({ title: '봄봄 51문제', note: '국좋 다음 수업일', cat: 'academy' }).subject, 'korean');
  assert.equal(H.group({ title: '심화아카데미 보고서 제출', cat: 'report' }).key, 'report');
  assert.equal(H.shortTitle('수평잡기 함수 396~455번 (백인대장)'), '수평잡기 함수 396~455번');
});

// 공통 데이터: 수요일 19~21시 블록 하나에 숙제 둘, 함수 숙제는 목요일 블록에도 나눠 둠
const EVENTS = [
  { id: 'm1', title: '수평잡기 명제 오답 및 마무리 313~395번 (백인대장)', date: FRI, kind: 'task', cat: 'academy', note: '' },
  { id: 'm2', title: '수평잡기 함수 396~455번 (백인대장)', date: FRI, kind: 'task', cat: 'academy', note: '' },
  { id: 'k1', title: '봄봄 51문제 (국어, 추정 마감 11/22)', date: SAT, kind: 'task', cat: 'academy', note: '국좋' },
];
const plan = (wedBlock = {}, extraDays = {}) => ({
  cats: [{ id: 'math', name: '수학' }, { id: 'kor', name: '국어' }],
  days: {
    [WED]: [{ id: 'w1', title: '수학 숙제', cat: 'math', est: 120, dur: 120, start: 19 * 60, hw: [{ id: 'm1' }, { id: 'm2' }], ...wedBlock }],
    [THU]: [{ id: 't1', title: '수학 함수', cat: 'math', est: 60, dur: 60, start: 21 * 60, hw: [{ id: 'm2' }] }],
    ...extraDays,
  },
  fixed: [],
  log: [],
});

test('한 블록에 숙제 여러 개, 한 숙제를 여러 날에 나눔: 계획 시간은 블록 몫으로 나뉜다', () => {
  const { list, links } = buildHomework({ events: EVENTS, plan: plan(), today: WED, settings: settings() });
  const m1 = list.find((h) => h.evId === 'm1'), m2 = list.find((h) => h.evId === 'm2');
  assert.deepEqual(links.get('w1').ids, ['m1', 'm2']);
  assert.equal(m1.plannedFuture, 60); // 120분 블록의 절반
  assert.equal(m2.plannedFuture, 60 + 60); // 수요일 절반 + 목요일 전부
  assert.equal(m2.blocks.length, 2);
  assert.equal(m1.need, 60); // 아직 기록이 없으면 계획 그대로
  assert.equal(m1.extra, 0);
});

test('83문제 중 40문제 완료 → 진행률 48.2%, 남은 43문제', () => {
  const p = plan({ hw: [{ id: 'm1', n: 40 }, { id: 'm2' }] });
  const { list } = buildHomework({ events: EVENTS, plan: p, today: WED, settings: settings() });
  const m1 = list.find((h) => h.evId === 'm1');
  assert.deepEqual([m1.total, m1.solved, m1.left], [83, 40, 43]);
  assert.equal(Math.round((m1.solved / m1.total) * 1000) / 10, 48.2);
  assert.equal(m1.progressSource, '15577 기록');
});

test('풀이 속도 변화: 빠르게 풀어도 계획을 바로 덮지 않고 절반까지만 섞는다', () => {
  // 100문제를 120분 계획 → 50문제를 40분에 품 (끝낸 블록)
  const ev = [{ id: 'x', title: '쎈 1~100번', date: FRI, kind: 'task', cat: 'academy', note: '' }];
  const p = {
    cats: [], fixed: [], log: [],
    days: {
      [WED]: [{ id: 'a', title: '쎈', cat: 'math', est: 60, dur: 40, start: 19 * 60, done: true, actual: 40, hw: [{ id: 'x', n: 50 }] }],
      [THU]: [{ id: 'b', title: '쎈', cat: 'math', est: 60, dur: 60, start: 19 * 60, hw: [{ id: 'x' }] }],
    },
  };
  const h = buildHomework({ events: ev, plan: p, today: THU, settings: settings() }).list[0];
  // 계획 속도 120/100 = 1.2분, 실제 0.8분, 가중치 0.5 → 1.0분 × 50 = 50분
  assert.ok(Math.abs(h.need - 50) < 0.01, String(h.need));
  assert.equal(h.needSource, '계획 + 실제 속도');
  assert.equal(h.extra, 0); // 목요일 60분 블록이면 충분
  assert.equal(Math.round(h.saved), 10); // 여유 가능 (블록은 그대로 둠)
  // 반대로 느리게 풀었으면(50문제 100분) 남은 50문제에 계획보다 더 필요 → 추가 시간
  p.days[WED][0].actual = 100;
  const slow = buildHomework({ events: ev, plan: p, today: THU, settings: settings() }).list[0];
  assert.ok(slow.need > 60 && slow.extra > 0, String(slow.need));
});

test('메모 기준값: 기록이 없으면 "N문제 남음"을 쓰고 중복으로 더하지 않는다', () => {
  const ev = [{ id: 'y', title: '유리함수 프린트 1~48번', date: FRI, kind: 'task', cat: 'academy', note: '1~48번 중 17문제 남음 (11/4 21:23 기준)' }];
  const h = buildHomework({ events: ev, plan: { days: {} }, today: WED, settings: settings() }).list[0];
  assert.deepEqual([h.total, h.solved, h.left, h.progressSource], [48, 31, 17, '일정 메모']);
  assert.equal(h.need, null); // 계획도 기록도 없으면 시간은 모른다
});

function scenario({ events, planData, now, fixed = [] }) {
  const { state, meta } = buildState({ plan: planData, events, projects: null, examDoc: null, local: local(), today: now.slice(0, 10) });
  state.fixed.push(...fixed);
  const R = decide(state, at(now.slice(0, 10), now.slice(11)));
  return { R, hw: assess(meta.homework, R) };
}

test('마감은 멀지만 작업량이 많으면 위험, 마감은 가깝지만 거의 끝났으면 여유', () => {
  const events = [
    { id: 'far', title: '모고 1~400번', date: SAT, kind: 'task', cat: 'academy', note: '' },
    { id: 'near', title: '단어 1~50번', date: THU, time: '08:00', kind: 'deadline', cat: 'academy', note: '' },
  ];
  const planData = {
    cats: [], fixed: [], log: [],
    days: {
      [WED]: [
        { id: 'f1', title: '모고', cat: 'eng', est: 120, dur: 120, start: 19 * 60, hw: [{ id: 'far' }] },
        { id: 'n1', title: '단어', cat: 'eng', est: 30, dur: 30, start: 21 * 60 + 30, hw: [{ id: 'near', n: 48 }] },
      ],
      [THU]: [{ id: 'f2', title: '모고', cat: 'eng', est: 120, dur: 120, start: 19 * 60, hw: [{ id: 'far' }] }],
      [FRI]: [{ id: 'f3', title: '모고', cat: 'eng', est: 120, dur: 120, start: 19 * 60, hw: [{ id: 'far' }] }],
    },
  };
  // 평일 학교 + 저녁 학원, 토요일은 하루 종일 일정 → 토요일 마감까지 가용 시간이 4시간 30분뿐
  const fixed = [
    ...[WED, THU, FRI].flatMap((d) => [
      { id: 's' + d, label: '학교', kind: 'school', date: d, start: '07:00', end: '16:30' },
      { id: 'a' + d, label: '학원', kind: 'academy', date: d, start: '17:00', end: '22:30' },
    ]),
    { id: 'sat', label: '대회', kind: 'other', date: SAT, start: '07:00', end: '23:30' },
  ];
  const { hw } = scenario({ events, planData, now: `${WED}T16:30`, fixed });
  const far = hw.find((h) => h.evId === 'far'), near = hw.find((h) => h.evId === 'near');
  assert.equal(far.urgency, 'far'); // 마감은 3일 뒤
  assert.equal(far.level, 'danger'); // 6시간 필요 > 4시간 30분 가용
  assert.equal(near.urgency, 'now'); // 내일 아침 마감
  assert.equal(near.level, 'calm'); // 50문제 중 48문제 끝
});

test('소속별 묶음: 위험한 묶음이 위, 묶음 안은 마감순', () => {
  const { hw } = scenario({ events: EVENTS, planData: plan(), now: `${WED}T18:00` });
  const groups = groupHomework(hw);
  const baek = groups.find((g) => g.label === '백인대장');
  assert.equal(baek.items.length, 2);
  assert.ok(groups.some((g) => g.label === '국좋 · 장훈고1'));
  const kor = groups.find((g) => g.label === '국좋 · 장훈고1').items[0];
  assert.equal(kor.level, 'unknown'); // 블록도 기록도 없는 51문제: 시간은 모름 → 위험으로 단정하지 않음
});

test('연결된 블록은 숙제의 마감을 이어받아 마감 계산에 들어간다', () => {
  const { R } = scenario({ events: EVENTS, planData: plan(), now: `${WED}T18:00` });
  const t = R.state ? null : null; void t;
  const w1 = R.scenarios.exp.items.find((i) => i.taskId === 'p:w1');
  assert.ok(w1.hardDue != null);
});

test('진행 중인 블록에서 푼 문제는 그 블록의 남은 계획 시간에서도 빠진다 (가짜 여유를 만들지 않음)', () => {
  // 함수 60문제: 수 120분 블록(숙제 2개라 몫 60분) + 목 60분 = 120분 계획(1문제 2분), 수요일 블록에서 12문제 푼 중
  const p = plan({ hw: [{ id: 'm1' }, { id: 'm2', n: 12 }] });
  const m2 = buildHomework({ events: EVENTS, plan: p, today: WED, settings: settings() }).list.find((h) => h.evId === 'm2');
  assert.deepEqual([m2.solved, m2.left], [12, 48]);
  assert.equal(m2.need, 96); // 48 × 2분
  assert.equal(m2.futureLeft, 96); // 120 − 12 × 2
  assert.equal(m2.saved, 0);
  assert.equal(m2.extra, 0);
});
