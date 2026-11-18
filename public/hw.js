/* 숙제 해석 (15577 · 판단 공용). 숙제의 원본은 일정(/api/events)의 할 일·마감이고, 여기서는 읽기만 한다.
   - count(title, note): 제목에서 문제 수를 센다. "313~395번" → 83, "봄봄 51문제", "어문규정 1 43문제 · 2 29문제" → 72
     확실하지 않으면 certain:false 로 돌려주고 추측으로 확정하지 않는다(선택 풀이, 번호 목록, 일부 범위만 적힌 제목 등)
   - noteLeft(note): OpenClaw가 메모에 남긴 "48문제 남음 (11/4 21:23 기준)"
   - group(ev): 소속(학원·학교·보고서…)과 과목
   - progress(id, days): 15577 블록들의 hw 기록(블록마다 푼 문제 n)을 모은다
   화면은 <script src="/hw.js">, 모듈은 import '/hw.js' 로 불러 globalThis.SabathiaHW 를 쓴다 (test/hw.mjs) */
(() => {
  'use strict';
  const RANGE = /(\d+)\s*[~\-–〜]\s*(\d+)/;
  const ITEM = String.raw`\d+\s*[~\-–〜]\s*\d+|\d+`;
  const NUM_LIST = new RegExp(String.raw`((?:${ITEM})(?:\s*[,·/]\s*(?:${ITEM}))*)\s*번`, 'g');
  const EXPLICIT = /(\d+)\s*(문제|문항)/g;
  const PAGES = new RegExp(String.raw`(?:p\.?\s*((?:${ITEM})(?:\s*,\s*(?:${ITEM}))*))|((?:${ITEM})(?:\s*,\s*(?:${ITEM}))*)\s*(?:쪽|페이지)`, 'gi');

  const stripParens = (s) => s.replace(/\([^)]*\)/g, ' ');

  function sumList(list) {
    let n = 0, ok = true, ranges = 0, singles = 0;
    for (const part of list.split(/[,·/]/)) {
      const p = part.trim();
      if (!p) continue;
      const r = RANGE.exec(p);
      if (r) {
        const a = +r[1], b = +r[2];
        if (b < a || b - a > 500) { ok = false; continue; }
        n += b - a + 1; ranges++;
      } else { n += 1; singles++; }
    }
    return { n, ok, ranges, singles };
  }

  /** 제목에서 분량을 센다. { n, unit, certain, why } 또는 null */
  function count(title, note) {
    const raw = String(title || '');
    const outside = stripParens(raw);
    const why = [];
    let certain = true;
    // 1) "51문제", "43문제 · 29문제" 처럼 개수를 직접 적었으면 그게 우선 (괄호 밖 먼저)
    for (const src of [outside, raw]) {
      const hits = [...src.matchAll(EXPLICIT)].map((m) => +m[1]);
      if (hits.length) {
        const n = hits.reduce((a, b) => a + b, 0);
        why.push(hits.length > 1 ? `${hits.join(' + ')}문제` : `${n}문제라고 적혀 있음`);
        return finish(n, '문제', certain, why, raw);
      }
    }
    // 2) 번호 범위: "313~395번", "1~10, 15~20번", "33, 39번"
    const lists = [...outside.matchAll(NUM_LIST)];
    if (lists.length) {
      let n = 0;
      for (const m of lists) {
        const s = sumList(m[1]);
        n += s.n;
        if (!s.ok) { certain = false; why.push('번호 범위가 이상함'); }
        if (s.singles && !s.ranges) { certain = false; why.push('번호 목록이라 실제 문제 수인지 불확실'); }
        else why.push(m[1].replace(/\s+/g, '') + '번');
      }
      if (lists.length > 0 && n > 0) return finish(n, '문제', certain, why, raw);
    }
    // 3) 쪽수: "95~133쪽, 239~285쪽", "p.126~127"
    const pages = [...outside.matchAll(PAGES)];
    if (pages.length) {
      let n = 0;
      for (const m of pages) {
        const s = sumList(m[1] || m[2] || '');
        n += s.n;
        if (!s.ok) certain = false;
        why.push((m[1] || m[2]).replace(/\s+/g, '') + '쪽');
      }
      if (n > 0) return finish(n, '쪽', certain, why, raw);
    }
    void note;
    return null;
  }

  function finish(n, unit, certain, why, raw) {
    // "교재 3주차 + 자습서 95~133쪽"처럼 분량 없는 덩어리가 같이 있으면 일부만 센 것
    const parts = stripParens(raw).split(/\s[+＋]\s|\s＋|\+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && parts.some((p) => !/\d+\s*(문제|문항|번|쪽|페이지)|p\.?\s*\d/i.test(p))) {
      certain = false;
      why.push('분량이 적히지 않은 부분이 있음');
    }
    if (/홀수|짝수|선택/.test(raw)) {
      certain = false;
      why.push('선택 풀이 표시가 있음');
    }
    return { n, unit, certain, why: why.join(' · ') };
  }

  /** 메모의 "N문제 남음 (11/4 21:23 기준)" → { left, total?, text } */
  function noteLeft(note) {
    const m = /(?:(\d+)\s*문제\s*중\s*)?(\d+)\s*문제\s*남음(?:\s*\(([^)]*기준)\))?/.exec(String(note || ''));
    if (!m) return null;
    return { left: +m[2], total: m[1] ? +m[1] : null, text: m[3] || '' };
  }

  // 소속: 사용자의 학원 이름 (일정 제목·메모에 나오는 말). 새 학원이 생기면 여기에 한 줄
  const ACADEMIES = [
    { key: 'baek', label: '백인대장', subject: 'math', words: ['백인대장'] },
    { key: 'kor', label: '국좋 · 장훈고1', subject: 'korean', words: ['장훈고', '장훈', '국좋', '풀이의 기틀'] },
    { key: 'eng', label: '영어 학원', subject: 'english', words: ['영어 일 저녁반', '저녁반', '능률보카'] },
    { key: 'psh', label: '박상현과학', subject: 'science', words: ['박상현'] },
  ];
  const SUBJ_WORDS = {
    math: ['수학', '함수', '명제', '올림포스', '수평잡기', '프린트', '유리함수', '무리함수', '역함수', '합성함수', '절댓값'],
    korean: ['국어', '문학', '독서', '문법', '어문규정', '봄봄', '언매', '국좋'],
    english: ['영어', '보카', '모고', '단어'],
    science: ['과학', '물리', '화학', '생명', '지구'],
  };
  const SUBJ_LABEL = { math: '수학', korean: '국어', english: '영어', science: '과학', other: '기타' };

  function subjectOf(text) {
    const t = String(text || '');
    for (const [s, ws] of Object.entries(SUBJ_WORDS)) if (ws.some((w) => t.includes(w))) return s;
    return 'other';
  }

  /** 일정 항목의 소속. { key, label, subject } */
  function group(ev) {
    const text = `${ev.title || ''} ${ev.note || ''}`;
    for (const a of ACADEMIES) if (a.words.some((w) => text.includes(w))) return { key: a.key, label: a.label, subject: a.subject };
    const subject = subjectOf(text);
    if (ev.cat === 'school' || /수행/.test(text)) return { key: 'school', label: '학교 · 수행평가', subject };
    if (ev.cat === 'report' || /보고서|리포트|레포트/.test(text)) return { key: 'report', label: '보고서 · 대회', subject };
    if (ev.cat === 'academy') return { key: 'aca-' + subject, label: `${SUBJ_LABEL[subject]} 학원`, subject };
    return { key: 'etc', label: '기타 할 일', subject };
  }

  /** 화면에 보일 짧은 제목: 끝의 "(백인대장)", "(국어, 추정 마감 11/22)" 같은 꼬리를 뗀다 */
  function shortTitle(t) {
    return String(t || '').replace(/\s*\((?:[^)]*(?:백인대장|장훈|추정|마감|검사|국좋)[^)]*)\)\s*$/, '').trim();
  }

  /** 숙제 하나의 15577 기록: 블록마다 { id: 일정 id, n: 이 블록에서 푼 수 } */
  function progress(id, days) {
    const sessions = [];
    for (const [date, list] of Object.entries(days || {})) {
      for (const b of list || []) {
        const h = (b.hw || []).find((x) => x.id === id);
        if (!h) continue;
        const links = (b.hw || []).length;
        sessions.push({ blockId: b.id, date, start: b.start, n: +h.n || 0, done: !!b.done, est: b.est || b.dur || 0, actual: b.done ? b.actual || 0 : 0, links, share: (b.hw || []).reduce((a, x) => a + (+x.n || 0), 0) });
      }
    }
    sessions.sort((a, b) => a.date.localeCompare(b.date) || (a.start || 0) - (b.start || 0));
    return { sessions, solved: sessions.reduce((a, s) => a + s.n, 0) };
  }

  /** 공부가 아닌 준비 일(챙겨가기·지참)은 분량·시간을 따지지 않는다 */
  const isErrand = (t) => /챙겨|지참|가져가|준비물/.test(String(t || ''));

  const api = { count, noteLeft, group, subjectOf, shortTitle, progress, isErrand, ACADEMIES, SUBJ_LABEL };
  globalThis.SabathiaHW = api;
})();
