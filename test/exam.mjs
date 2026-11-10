// 시험대비 합치기 검증: node test/exam.mjs
import assert from 'node:assert/strict';
import '../public/exam/merge.js';
const { clean, merge } = globalThis.ExamMerge;

const seed = () => clean({ items: { a: { id: 'a', t: '명제 증명', u: 0 }, b: { id: 'b', t: '산술기하', u: 0 } } });

// 두 기기에서 서로 다른 항목을 고치면 둘 다 남는다
let p = seed(), q = seed();
p.items.a = { ...p.items.a, done: 1, u: 100 };
q.items.b = { ...q.items.b, done: 1, u: 200 };
let m = merge(p, q);
assert.equal(m.items.a.done, 1);
assert.equal(m.items.b.done, 1);
assert.deepEqual(merge(q, p), m, '순서를 바꿔도 같다');

// 같은 항목은 늦게 고친 쪽
p = seed(); q = seed();
p.items.a = { ...p.items.a, done: 1, u: 100 };
q.items.a = { ...q.items.a, done: 0, note: '다시', u: 300 };
assert.equal(merge(p, q).items.a.note, '다시');
assert.equal(merge(q, p).items.a.done, 0);

// 지운 것은 남의 기기 기본 항목(u: 0)을 이긴다. 지운 뒤 다시 고치면 살아난다
p = seed(); q = seed();
p.items.a = { id: 'a', del: 1, u: 500 };
assert.equal(merge(q, p).items.a.del, 1);
q.items.a = { ...q.items.a, t: '되살림', u: 600 };
assert.equal(merge(p, q).items.a.t, '되살림');

// 새 오답은 양쪽 것이 다 들어간다
p = seed(); q = seed();
p.wrongs.x1 = { id: 'x1', t: '32쪽 5번', u: 10 };
q.wrongs.x2 = { id: 'x2', t: '40쪽 2번', u: 20 };
assert.deepEqual(Object.keys(merge(p, q).wrongs).sort(), ['x1', 'x2']);

// clean: 이상한 모양·id·너무 큰 항목은 버리고, 앞선 시계는 누르고, 오래된 지운 표시는 치운다
const now = 1e12;
const c = clean({ items: { 'bad id': { u: 1 }, ok: { t: 'x', u: now + 9e9 }, big: { t: 'x'.repeat(5000), u: 1 }, old: { del: 1, u: now - 200 * 864e5 }, arr: [] }, wrongs: 'no', subj: null }, now);
assert.deepEqual(Object.keys(c.items), ['ok']);
assert.equal(c.items.ok.u, now + 300000);
assert.equal(c.items.ok.id, 'ok');
assert.deepEqual(c.wrongs, {});
assert.deepEqual(clean(null), { v: 1, items: {}, wrongs: {}, subj: {} });

console.log('exam merge ok');
