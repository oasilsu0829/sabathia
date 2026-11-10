/* 시험대비 합치기 — 서버(src/exam.js)와 화면(public/exam/index.html)이 같이 쓴다.
   문서 하나: { v: 1, items: {id: 할 일}, wrongs: {id: 오답}, subj: {id: 과목 정보} }
   - 항목마다 고친 시각 u. 두 기기 것을 합칠 때 id마다 u가 늦은 쪽이 이긴다
   - 지운 항목은 { id, del: 1, u } 로 남겨 다른 기기에서도 지워지게 한다(180일 뒤 치움)
   - 처음 넣는 기본 할 일은 기기마다 같은 id에 u: 0 이라 겹치지 않는다
   일반 스크립트로 불러도(window.ExamMerge), 모듈에서 import 해도(globalThis.ExamMerge) 된다 */
(function (root) {
  'use strict';
  const PARTS = ['items', 'wrongs', 'subj'];
  const ID = /^[\w.-]{1,40}$/;
  const KEEP_DEL = 180 * 864e5;
  const MAX_ENTRY = 4000; // 항목 하나의 JSON 길이
  const num = (x) => (Number.isFinite(x) ? x : 0);
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

  // 어떤 모양이 와도 문서 모양으로 맞춘다. now를 주면 앞서 있는 시계(u)를 now + 5분으로 누르고 오래된 지운 표시를 치운다
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

  // a, b: clean 된 두 문서. 새 문서를 돌려준다. u가 같으면 a 것
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

  root.ExamMerge = { clean, merge, PARTS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
