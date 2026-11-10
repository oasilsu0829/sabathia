// 장부 합치기(public/projects/merge.js) 검사. 실행: node test/merge.mjs
import assert from 'node:assert/strict';
import '../public/projects/merge.js';
const { fill, merge } = globalThis.PrjMerge;

const base = () => fill({
  id: 'p', name: '보고서', status: 'active', updated: 100, fu: 100,
  steps: [{ id: 'a', t: 'A', done: false, u: 100 }, { id: 'b', t: 'B', done: false, u: 100 }],
  log: [{ id: 'l1', at: 100, kind: 'auto', t: '만듦' }], links: [],
});

// 두 기기가 같은 프로젝트의 다른 항목을 고치면 둘 다 남는다
const phone = base(); phone.steps[0].done = true; phone.steps[0].u = 200; phone.updated = 200;
const pad = base(); pad.log.unshift({ id: 'l2', at: 300, u: 300, kind: 'memo', t: '메모' }); pad.updated = 300;
let m = merge(phone, pad);
assert.equal(m.steps.find((s) => s.id === 'a').done, true, '폰에서 끝낸 단계');
assert.ok(m.log.some((l) => l.id === 'l2'), '패드에서 쓴 메모');
assert.equal(m.updated, 300);
assert.deepEqual(merge(pad, phone), m, '순서와 상관없이 같은 결과');
assert.deepEqual(merge(m, m), m, '같은 것끼리 합쳐도 그대로');

// 같은 단계를 둘 다 고치면 나중 것
const x = base(); x.steps[1].t = 'B1'; x.steps[1].u = 150; x.updated = 150;
const y = base(); y.steps[1].t = 'B2'; y.steps[1].u = 160; y.updated = 160;
assert.equal(merge(x, y).steps[1].t, 'B2');

// 지운 항목은 다른 기기의 예전 판이 와도 되살아나지 않는다. 지운 뒤 다시 고치면 살아난다
const d = base(); d.steps = d.steps.filter((s) => s.id !== 'b'); d.del = { b: 400 }; d.updated = 400;
assert.equal(merge(d, base()).steps.length, 1);
const back = base(); back.steps[1].u = 500; back.updated = 500;
assert.equal(merge(d, back).steps.length, 2);

// 칸(이름·상태)은 fu가 늦은 쪽. 항목만 고친 늦은 판이 칸을 되돌리지 않는다
const r = base(); r.name = '새 이름'; r.fu = 250; r.updated = 250;
const late = base(); late.steps[0].u = 260; late.steps[0].done = true; late.updated = 260;
m = merge(r, late);
assert.equal(m.name, '새 이름');
assert.equal(m.steps[0].done, true);

// 순서: o 값으로
const o = base(); o.steps[0].o = 1; o.steps[1].o = 0; o.steps[0].u = o.steps[1].u = 300; o.updated = 300;
assert.deepEqual(merge(base(), o).steps.map((s) => s.id), ['b', 'a']);

// fill: 빠진 id·시각을 늘 같게 채운다
const raw = { id: 'q', updated: 50, steps: [{ t: 'x' }, { t: 'y' }], log: [{ at: 40, t: 'z' }] };
assert.deepEqual(fill(structuredClone(raw)), fill(structuredClone(raw)));
assert.equal(fill(structuredClone(raw)).steps[1].id, 'm1');
assert.equal(fill(structuredClone(raw)).log[0].u, 40);

console.log('merge ok');
