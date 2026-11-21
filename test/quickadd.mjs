// 한 줄로 넣기(public/quickadd.js) 읽기 규칙 검사. 실행: node test/quickadd.mjs
import assert from 'node:assert/strict';
import '../public/quickadd.js';
const { parse, parseText } = globalThis.QuickAdd;

const T = '2026-11-21'; // 토요일
const p = (s, def, cat) => { const r = parse(s, T, def || T, cat); delete r.dateSet; return r; };

assert.deepEqual(p('내일 4시 반 동아리 회의'), { title: '동아리 회의', date: '2026-11-22', time: '16:30', end: null, kind: 'event', cat: 'none' });
assert.deepEqual(p('금요일까지 화학 수행 보고서 제출'), { title: '화학 수행 보고서 제출', date: '2026-11-27', time: null, end: null, kind: 'deadline', cat: 'report' });
assert.deepEqual(p('다음 주 화 7시~9시 수학 학원 특강'), { title: '수학 학원 특강', date: '2026-11-24', time: '19:00', end: '21:00', kind: 'event', cat: 'none' });
assert.equal(parse('다음 주 화 7시 학원 영어 발표', T, T).cat, 'academy'); // 시각이 있어도 수행이면
assert.deepEqual(p('12/3 국어 수행 서평 제출'), { title: '국어 수행 서평 제출', date: '2026-12-03', time: null, end: null, kind: 'deadline', cat: 'school' });
assert.deepEqual(p('28일 오전 10시 병원'), { title: '병원', date: '2026-11-28', time: '10:00', end: null, kind: 'event', cat: 'none' });
assert.deepEqual(p('모레 16:30-18:00 스터디'), { title: '스터디', date: '2026-11-23', time: '16:30', end: '18:00', kind: 'event', cat: 'none' });
assert.deepEqual(p('영단어 외우기'), { title: '영단어 외우기', date: T, time: null, end: null, kind: 'task', cat: 'none' });
assert.deepEqual(p('12월 1일 밤 11시 영어 발표 자료'), { title: '영어 발표 자료', date: '2026-12-01', time: '23:00', end: null, kind: 'event', cat: 'none' });
assert.deepEqual(p('3일 학원 영어 수행 테스트'), { title: '학원 영어 수행 테스트', date: '2026-12-03', time: null, end: null, kind: 'task', cat: 'academy' });
assert.deepEqual(p('1/5 방학 특강 시작'), { title: '방학 특강 시작', date: '2027-01-05', time: null, end: null, kind: 'task', cat: 'none' });
assert.deepEqual(p('오늘 8시 30분에 독서실'), { title: '독서실', date: T, time: '08:30', end: null, kind: 'event', cat: 'none' });
assert.deepEqual(p('이번 주 일요일 9시 교회'), { title: '교회', date: '2026-11-22', time: '09:00', end: null, kind: 'event', cat: 'none' });
assert.deepEqual(p('아침 9시 교회 일요일'), { title: '교회', date: '2026-11-22', time: '09:00', end: null, kind: 'event', cat: 'none' });
assert.deepEqual(p('10시~1시 모의고사'), { title: '모의고사', date: T, time: '10:00', end: '13:00', kind: 'event', cat: 'none' });

// 묶음 카드에서 열면 그 묶음으로 고정, 날짜를 안 쓰면 defDate
assert.deepEqual(p('영어 단어 시험 준비', '2026-11-25', 'academy'), { title: '영어 단어 시험 준비', date: '2026-11-25', time: null, end: null, kind: 'task', cat: 'academy' });
assert.equal(parse('목요일까지 독후감', T, T, 'academy').kind, 'deadline');

// 여러 줄
const many = parseText('내일 4시 회의\n\n  금요일 마감 보고서 \n', T, T);
assert.equal(many.length, 2);
assert.equal(many[1].kind, 'deadline');
assert.equal(many[1].cat, 'report');

console.log('quickadd ok');
