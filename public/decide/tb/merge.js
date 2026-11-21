/* Planner 2.0 문서 합치기 — 서버(src/plan.js)와 화면(public/decide/tb/store.js)이 같이 쓴다.
   문서 하나: { v: 1, tasks, big3, props, links, cfg } — 각 칸은 {id: 항목}
     tasks  Task       { id, title, subject, deadline, deadlineTime, est, priority, status, src, note, created, u }
     big3   Big3       { id: 'w:YYYY-MM-DD' | 'd:YYYY-MM-DD', periodType, periodStart, taskIds, confirmedByUser, u }
     props  PlanProposal { id, kind, affectedBlockIds, changes, reason, status, created, u }
     links  블록 → 작업 { id: 15577 블록 id, task: 작업 id, u }   (TimeBlock.taskId)
     cfg    설정       { id: 'colors' | ..., ..., u }
   - 항목마다 고친 시각 u. 두 기기 것을 합칠 때 id마다 u가 늦은 쪽이 이긴다
   - 지운 항목은 { id, del: 1, u } 로 남겨 다른 기기에서도 지워지게 한다(180일 뒤 치움)
   일반 스크립트로 불러도(window.PlanMerge), 모듈에서 import 해도(globalThis.PlanMerge) 된다 */
(function (root) {
  'use strict';
  const PARTS = ['tasks', 'big3', 'props', 'links', 'cfg'];
  const ID = /^[\w.:-]{1,80}$/;
  const KEEP_DEL = 180 * 864e5;
  const MAX_ENTRY = 6000;
  const num = (x) => (Number.isFinite(x) ? x : 0);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

  function clean(doc, now) {
    const out = { v: 1 };
    const d = obj(doc);
    for (const P of PARTS) {
      out[P] = {};
      for (const [id, x] of Object.entries(obj(d[P]))) {
        if (!ID.test(id) || !x || typeof x !== 'object' || Array.isArray(x)) continue;
        let u = Math.max(0, Math.floor(num(x.u)));
        if (now) u = Math.min(u, now + 300000);
        if (x.del) {
          if (now && u < now - KEEP_DEL) continue;
          out[P][id] = { id, del: 1, u };
          continue;
        }
        const y = { ...x, id, u };
        if (JSON.stringify(y).length > MAX_ENTRY) continue;
        out[P][id] = y;
      }
    }
    return out;
  }

  function merge(a, b) {
    const out = { v: 1 };
    for (const P of PARTS) {
      const A = obj(a && a[P]), B = obj(b && b[P]);
      out[P] = { ...A };
      for (const [id, x] of Object.entries(B)) {
        if (!(id in A) || num(x.u) > num(A[id].u)) out[P][id] = x;
      }
    }
    return out;
  }

  root.PlanMerge = { clean, merge, PARTS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
