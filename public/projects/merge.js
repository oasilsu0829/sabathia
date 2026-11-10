/* 장부 합치기 — 서버(src/projects.js)와 장부 화면(public/projects/index.html)이 같이 쓴다.
   한 프로젝트를 두 기기에서 고쳐도 둘 다 남도록 항목 단위로 합친다.
   - 단계·기록·자료: id로 묶고, 항목마다 고친 시각(u)이 늦은 쪽이 이긴다. 지운 항목은 del[id] = 지운 시각
     (del 시각이 항목의 u보다 늦거나 같으면 지운 것으로 본다. 되살리면 u가 더 늦어져 다시 나타난다)
   - 이름·설명·상태 같은 칸: 칸을 고친 시각(fu)이 늦은 쪽 것을 통째로
   - 단계 순서: 단계마다 o(정렬 값). 순서를 바꾸면 그 단계들의 o와 u가 바뀐다
   일반 스크립트로 불러도(window.PrjMerge), 모듈에서 import 해도(globalThis.PrjMerge) 된다 */
(function (root) {
  'use strict';
  const LISTS = ['steps', 'log', 'links'];
  const FIELDS = ['name', 'desc', 'code', 'cat', 'status', 'pri', 'due'];
  const KEEP_DEL = 180 * 864e5;
  const ID = /^[\w.-]{1,40}$/;
  const num = (x, d) => (Number.isFinite(x) ? x : d);

  // 빠진 칸을 채운다. 같은 입력이면 늘 같은 결과(기기마다 같은 id·시각이 나오게)
  function fill(p) {
    if (!p || typeof p !== 'object') return p;
    const base = num(p.updated, 0);
    p.fu = num(p.fu, base);
    const del = p.del && typeof p.del === 'object' && !Array.isArray(p.del) ? p.del : {};
    p.del = {};
    for (const [k, t] of Object.entries(del)) if (ID.test(k) && Number.isFinite(t)) p.del[k] = t;
    for (const L of LISTS) {
      const arr = Array.isArray(p[L]) ? p[L] : [];
      const used = new Set();
      p[L] = arr.filter((x) => x && typeof x === 'object').map((x, i) => {
        let id = ID.test(String(x.id || '')) ? String(x.id) : `${{ steps: 'm', log: 'l', links: 'k' }[L]}${i}`;
        if (used.has(id)) id = `${id}x${i}`;
        used.add(id);
        const y = { ...x, id };
        y.u = num(x.u, x.at || base);
        if (L === 'steps') y.o = num(x.o, i);
        return y;
      });
    }
    p.steps.sort((a, b) => a.o - b.o);
    return p;
  }

  // a, b: 같은 프로젝트의 두 판. 둘 다 fill 된 것으로 본다. 새 객체를 돌려준다
  function merge(a, b) {
    if (!a) return b;
    if (!b) return a;
    const newer = num(a.updated, 0) >= num(b.updated, 0) ? a : b;
    const older = newer === a ? b : a;
    const out = { ...older, ...newer };
    const F = num(a.fu, 0) >= num(b.fu, 0) ? a : b;
    for (const k of FIELDS) { if (k in F) out[k] = F[k]; else delete out[k]; }
    out.fu = Math.max(num(a.fu, 0), num(b.fu, 0));
    out.updated = Math.max(num(a.updated, 0), num(b.updated, 0));

    const del = { ...a.del };
    for (const [k, t] of Object.entries(b.del || {})) if (!(del[k] >= t)) del[k] = t;
    for (const k of Object.keys(del)) if (del[k] < out.updated - KEEP_DEL) delete del[k];
    out.del = del;

    for (const L of LISTS) {
      const m = new Map();
      for (const src of [a, b]) for (const x of src[L] || []) {
        const prev = m.get(x.id);
        if (!prev || x.u > prev.u || (x.u === prev.u && JSON.stringify(x) > JSON.stringify(prev))) m.set(x.id, x);
      }
      out[L] = [...m.values()].filter((x) => !(del[x.id] >= x.u));
    }
    out.steps.sort((x, y) => x.o - y.o || (x.id < y.id ? -1 : 1));
    out.log.sort((x, y) => y.at - x.at || (x.id < y.id ? -1 : 1));
    out.links.sort((x, y) => num(y.at, 0) - num(x.at, 0) || (x.id < y.id ? -1 : 1));
    return out;
  }

  root.PrjMerge = { fill, merge, LISTS, FIELDS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
