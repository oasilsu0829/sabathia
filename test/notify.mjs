// 알림 후보 고르기(src/notify.js candidates) 검사. 실행: node test/notify.mjs
import assert from 'node:assert/strict';
import { kst, parseSettings, candidates, DEFAULTS } from '../src/notify.js';

const at = (s) => Date.parse(s + '+09:00'); // 한국 시각
const ev = (id, date, time, kind = 'event', extra = {}) => ({ id, title: '제목 ' + id, date, time, end_time: null, kind, done: 0, ...extra });
const run = (when, set, repeats, events, overdue, stale) => {
  const now = at(when);
  return candidates(kst(now), kst(now + 864e5).date, { ...DEFAULTS, ...set }, repeats, events, overdue, stale);
};
const keys = (list) => list.map((c) => c.key);

// 한국 시각 계산
assert.deepEqual(kst(Date.parse('2026-11-10T15:30:00Z')), { date: '2026-11-11', min: 30, wd: 3 });

// 설정 기본값과 끄기
assert.deepEqual(parseSettings(undefined), DEFAULTS);
assert.deepEqual(parseSettings('{"lead":null,"am":"","pm":"21:00"}'), { lead: null, am: '', pm: '21:00' });
assert.deepEqual(parseSettings('{"lead":999,"am":"7시"}'), DEFAULTS);

// 시작 전 알림: 10분 전에 한 번. 놓친 1~2분은 따라잡고, 그 뒤로는 보내지 않는다
const e1 = [ev('a', '2026-11-11', '16:30')];
assert.deepEqual(keys(run('2026-11-11T16:19', {}, [], e1)), []);
assert.deepEqual(keys(run('2026-11-11T16:20', {}, [], e1)), ['lead:a:2026-11-11T16:30']);
assert.deepEqual(keys(run('2026-11-11T16:22', {}, [], e1)), ['lead:a:2026-11-11T16:30']);
assert.deepEqual(keys(run('2026-11-11T16:23', {}, [], e1)), []);
assert.match(run('2026-11-11T16:20', {}, [], e1)[0].body, /16:30 · 10분 뒤 시작/);
// 끔 / 정각 / 1시간 전
assert.deepEqual(run('2026-11-11T16:20', { lead: null }, [], e1), []);
assert.deepEqual(keys(run('2026-11-11T16:30', { lead: 0 }, [], e1)), ['lead:a:2026-11-11T16:30']);
assert.match(run('2026-11-11T15:30', { lead: 60 }, [], [ev('d', '2026-11-11', '16:30', 'deadline')])[0].body, /16:30 마감 · 1시간 남음/);
// 자정을 넘는 일정: 내일 00:05 일정은 오늘 23:55에
assert.deepEqual(keys(run('2026-11-11T23:55', {}, [], [ev('n', '2026-11-12', '00:05')])), ['lead:n:2026-11-12T00:05']);
// 시각 없는 일정·완료한 일정은 빼기
assert.deepEqual(run('2026-11-11T16:20', {}, [], [ev('x', '2026-11-11', null), ev('y', '2026-11-11', '16:30', 'task', { done: 1 })]), []);

// 아침 요약: 07:30부터 10분 안. 오늘 것과 지연만
const day = [
  ev('d1', '2026-11-11', null, 'deadline'), ev('t1', '2026-11-11', null, 'task'), ev('e1', '2026-11-11', '09:00'),
  ev('d2', '2026-11-12', null, 'deadline'), ev('t2', '2026-11-12', null, 'task'),
];
const am = run('2026-11-11T07:30', {}, [], day, 2);
assert.deepEqual(keys(am), ['am:2026-11-11']);
assert.equal(am[0].body.split('\n')[0], '마감 1 · 할 일 1 · 일정 1 · 지연 2');
assert.deepEqual(keys(run('2026-11-11T07:39', {}, [], day)), ['am:2026-11-11']);
assert.deepEqual(run('2026-11-11T07:40', {}, [], day), []);
assert.deepEqual(run('2026-11-11T07:29', {}, [], day), []);
assert.deepEqual(run('2026-11-11T07:30', {}, [], []), [], '아무것도 없으면 보내지 않는다');
assert.deepEqual(run('2026-11-11T07:30', { am: '' }, [], day), []);

// 전날 저녁: 내일 마감
const pm = run('2026-11-11T20:00', {}, [], day);
assert.deepEqual(keys(pm), ['pm:2026-11-11']);
assert.equal(pm[0].title, '내일 마감 1건');
assert.equal(pm[0].body, '제목 d2\n할 일 1');
assert.equal(run('2026-11-11T20:00', {}, [], [ev('t2', '2026-11-12', null, 'task')])[0].title, '내일 일정');
assert.deepEqual(run('2026-11-11T20:00', {}, [], [ev('e1', '2026-11-11', '09:00')]), [], '내일 것이 없으면 보내지 않는다');

// 반복 알림: 요일과 시각이 맞을 때 (2026-11-11은 수요일 = 3)
const reps = [{ id: 1, title: '단어', time: '21:30', days: '135', active: 1 }, { id: 2, title: '주말', time: '21:30', days: '06', active: 1 }];
assert.deepEqual(keys(run('2026-11-11T21:30', {}, reps, [])), ['rep:1:2026-11-11']);
assert.deepEqual(run('2026-11-11T21:29', {}, reps, []), []);
assert.deepEqual(keys(run('2026-11-14T21:31', {}, reps, [])), ['rep:2:2026-11-14']);

// 장부: 오래 손대지 않은 프로젝트는 아침 요약 끝에 한 줄. 일정이 없으면 장부 알림 하나
const amS = run('2026-11-11T07:30', {}, [], day, 0, ['가', '나', '다', '라']);
assert.match(amS[0].body, /\n7일 넘게 그대로 — 가, 나, 다 외 1개$/);
const onlyS = run('2026-11-11T07:30', {}, [], [], 0, ['가']);
assert.equal(onlyS[0].title, '장부');
assert.equal(onlyS[0].url, '/projects/');
assert.deepEqual(run('2026-11-11T12:00', {}, [], [], 0, ['가']), [], '아침 시각이 아니면 없다');

console.log('notify ok');
