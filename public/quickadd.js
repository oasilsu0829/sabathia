/* 한 줄로 일정 넣기 — 일정 앱(/schedule/)과 홈(/)이 같이 쓴다. 검사: node test/quickadd.mjs
   "내일 4시 반 동아리 회의"처럼 쓰면 날짜·시각·종류·묶음을 읽는다. 여러 줄이면 여러 개. AI 없이 규칙만 쓴다(오프라인에서도 읽음)
   - 날짜: 오늘·내일·모레·글피, 12월 3일, 12/3, 28일, (이번 주|다음 주) 화(요일). 안 쓰면 defDate(보통 오늘, 캘린더에선 고른 날)
   - 시각: 4시, 4시 반, 4시 20분, 16:30, 오전/오후/아침/저녁/밤, 4시~6시(범위). 오전·오후 없이 1~7시면 오후로 본다(학생 일정)
   - 종류: 마감·제출·까지 → 마감, 시각 있으면 일정, 없으면 할 일
   - 묶음: 일정 앱 guessCat과 같은 규칙(학원 → 학원 수행, 보고서|리포트|레포트 → 보고서, 수행 → 학교 수행).
     다만 시각이 있는 학원은 수업으로 보고 묶음 없음(수행·숙제·테스트·발표 등이 붙으면 학원 수행). 묶음은 늘 cat으로 정해서 보낸다
     묶음 카드의 '+ 추가'로 열면 그 묶음으로 고정
   일반 스크립트(window.QuickAdd)로도, 모듈 import(globalThis.QuickAdd)로도 쓴다. mount()는 화면에서만 */
(function (root) {
  'use strict';
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const WDMAP = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
  const KINDS = ['event', 'task', 'deadline'];
  const KIND = { event: '일정', task: '할 일', deadline: '마감' };
  const CATS = ['none', 'report', 'school', 'academy'];
  const CAT = { none: '묶음 없음', report: '보고서', school: '학교 수행', academy: '학원 수행' };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const ACAD_WORK = /수행|숙제|과제|테스트|시험|발표|제출|마감|까지|평가/;
  const guessCat = (s) => /학원/.test(s) ? 'academy' : /보고서|리포트|레포트/.test(s) ? 'report' : /수행/.test(s) ? 'school' : 'none';

  // 시각 한 개: 16:30 | 4시 | 4시 반 | 4시 20분
  const T = '(\\d{1,2})(?::(\\d{2})|\\s*시\\s*(?:(반)|(\\d{1,2})\\s*분)?)';
  const RANGE = new RegExp(T + '\\s*(?:~|-|–|부터)\\s*' + T);
  const ONE = new RegExp(T);

  // line 한 줄 → { title, date, time, end, kind, cat }. today: 'YYYY-MM-DD'(상대 날짜 기준), defDate: 날짜를 안 썼을 때
  function parse(line, today, defDate, presetCat) {
    const src = String(line || '').trim();
    const base = day(today);
    let s = ' ' + src + ' ', date = null, time = null, end = null, ampm = '';
    const cut = (re) => { const m = s.match(re); if (m) s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length); return m; };
    let m;
    if ((m = cut(/(오늘|내일|모레|글피)/))) date = addDays(base, { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }[m[1]]);
    if (!date && (m = cut(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/))) date = new Date(base.getFullYear(), +m[1] - 1, +m[2]);
    if (!date && (m = cut(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?=\s|까지|에|$)/))) date = new Date(base.getFullYear(), +m[1] - 1, +m[2]);
    if (!date && (m = cut(/(?:^|\s)(\d{1,2})\s*일(?=\s|까지|에|$)/))) {
      date = new Date(base.getFullYear(), base.getMonth(), +m[1]);
      if (date < base) date.setMonth(date.getMonth() + 1);
    }
    if (!date && (m = cut(/(?:^|\s)(?:(이번|다음|담)\s*주\s*)?([일월화수목금토])(?:요일)?(?=\s|까지|에|$)/))) {
      const w = WDMAP[m[2]];
      if (m[1] === '다음' || m[1] === '담') {
        const mon = addDays(base, -((base.getDay() + 6) % 7)); // 이번 주 월요일
        date = addDays(mon, 7 + (w + 6) % 7);
      } else date = addDays(base, (w - base.getDay() + 7) % 7);
    }
    // 두 달 넘게 지난 날짜(12/3을 1월에 쓴 경우 등)는 내년으로
    if (date && date < addDays(base, -60)) date.setFullYear(date.getFullYear() + 1);
    if (!date || isNaN(date)) date = null;

    if (cut(/(오전|아침|새벽)/)) ampm = 'am'; else if (cut(/(오후|저녁|밤)/)) ampm = 'pm';
    const hm = (h, mi, half, mi2) => [+h, half ? 30 : +(mi || mi2 || 0)];
    if ((m = cut(RANGE))) { time = hm(m[1], m[2], m[3], m[4]); end = hm(m[5], m[6], m[7], m[8]); }
    else if ((m = cut(ONE))) time = hm(m[1], m[2], m[3], m[4]);
    const fix = (t) => {
      if (!t) return null;
      let [h, mi] = t;
      if (ampm === 'pm' && h < 12) h += 12;
      else if (ampm === 'am' && h === 12) h = 0;
      else if (!ampm && h >= 1 && h <= 7) h += 12;
      return h > 23 || mi > 59 ? null : [h, mi];
    };
    time = fix(time); end = time ? fix(end) : null;
    if (time && end && end[0] * 60 + end[1] <= time[0] * 60 + time[1]) {
      end = end[0] + 12 <= 23 && end[0] + 12 > time[0] ? [end[0] + 12, end[1]] : null;
    }
    const kind = /마감|제출|까지/.test(src) ? 'deadline' : time ? 'event' : 'task';
    let cat = CATS.includes(presetCat) && presetCat !== 'none' ? presetCat : guessCat(src);
    // 시각이 있는 학원(수업)은 수행이 아니다. 수행·숙제·테스트·발표 같은 말이 있거나 시각이 없을 때만 학원 수행
    if (cat === 'academy' && presetCat !== 'academy' && time && !ACAD_WORK.test(src)) cat = 'none';
    let title = s.replace(/(?:^|\s)(?:까지|에|에서|부터)(?=\s)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title) title = src;
    const f = (t) => (t ? `${pad(t[0])}:${pad(t[1])}` : null);
    return { title, date: date ? ymd(date) : defDate || today, dateSet: !!date, time: f(time), end: f(end), kind, cat };
  }
  const parseText = (text, today, defDate, presetCat) =>
    String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 30).map((l) => ({ line: l, ...parse(l, today, defDate, presetCat) }));

  /* ---------- 화면 ---------- */
  const CSS = `
.qa { display: grid; gap: 8px; background: var(--card); border-radius: var(--radius, 14px); box-shadow: var(--shadow); padding: 12px 14px; }
.qa-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 24px; }
.qa-lbl { font-size: 12px; font-weight: 600; letter-spacing: 0.02em; color: var(--muted); }
.qa-preset { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 2px 4px 2px 10px; }
.qa-preset button { border: 0; background: none; color: inherit; font: inherit; font-weight: 600; min-height: 28px; padding: 0 6px; text-decoration: underline; text-underline-offset: 2px; }
textarea.qa-in { display: block; width: 100%; resize: none; overflow: hidden; min-height: 44px; padding: 10px 12px; font: inherit; font-size: 16px; line-height: 22px; color: var(--ink);
  background: var(--soft, #f3f4f3); border: 1px solid transparent !important; border-radius: 10px; outline: none; }
textarea.qa-in:focus { background: var(--card); border-color: var(--accent) !important; box-shadow: 0 0 0 3px var(--accent-soft); }
.qa-list { display: grid; }
.qa-row { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 8px; padding: 8px 0; border-top: 1px solid var(--hair); }
.qa-row:first-child { border-top: 0; }
.qa-d { font-weight: 700; font-size: 13px; line-height: 18px; font-variant-numeric: tabular-nums; }
.qa-d small { display: block; color: var(--muted); font-weight: 600; font-size: 11px; }
.qa-b { min-width: 0; display: grid; gap: 4px; }
.qa-ttl { font-weight: 600; font-size: 14px; line-height: 20px; overflow-wrap: anywhere; }
.qa-ts { display: flex; flex-wrap: wrap; gap: 4px; }
.qa-t { display: inline-flex; align-items: center; min-height: 26px; padding: 0 9px; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 600; line-height: 1; white-space: nowrap;
  font-variant-numeric: tabular-nums; background: var(--soft-2, #eee); color: var(--ink); border: 0; }
button.qa-t { cursor: pointer; }
button.qa-t::after { content: "▾"; margin-left: 4px; font-size: 10px; opacity: .6; }
.qa-t.k-event { background: var(--accent-soft); color: var(--accent); }
.qa-t.k-deadline { background: #ffdad6; color: var(--warn, #ba1a1a); }
.qa-t.c-on { background: var(--ink); color: var(--card); }
.qa-t.dim { background: none; color: var(--muted); box-shadow: inset 0 0 0 1px var(--hair); }
.qa-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.qa-msg { margin: 0; font-size: 12px; line-height: 16px; color: var(--muted); min-width: 0; }
.qa-msg.err { color: var(--warn, #ba1a1a); font-weight: 600; }
.qa-go { flex: none; min-height: 40px; padding: 0 16px; border: 0; border-radius: 10px; background: var(--accent); color: var(--on-accent, #fff); font: inherit; font-weight: 600; font-size: 14px; }
.qa-go:disabled { background: var(--soft-2, #eee); color: var(--muted); }
`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let n = 0;

  // el 안에 한 줄 입력을 그린다. opts.post(ev) 는 한 개를 저장(실패하면 throw), opts.done(개수) 는 다 넣은 뒤 한 번
  // 돌려주는 node 하나를 화면이 다시 그려도 그대로 옮겨 붙이면 입력 중인 글이 남는다(attach)
  function mount(opts) {
    if (!document.getElementById('qa-css')) {
      const st = document.createElement('style'); st.id = 'qa-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const id = 'qa-in-' + (++n);
    const node = document.createElement('div');
    node.className = 'qa';
    node.innerHTML = `
      <div class="qa-top"><label class="qa-lbl" for="${id}">한 줄로 넣기</label><span class="qa-preset" hidden></span></div>
      <textarea class="qa-in" id="${id}" rows="1" autocomplete="off" spellcheck="false" enterkeyhint="done"
        placeholder="${esc(opts.placeholder || '내일 4시 반 동아리 회의')}"></textarea>
      <div class="qa-list" hidden></div>
      <div class="qa-foot" hidden><p class="qa-msg"></p><button type="button" class="qa-go">추가</button></div>`;
    const ta = node.querySelector('textarea'), list = node.querySelector('.qa-list'), foot = node.querySelector('.qa-foot');
    const msg = node.querySelector('.qa-msg'), go = node.querySelector('.qa-go'), presetEl = node.querySelector('.qa-preset');
    let preset = 'none', ov = {}, items = [], busy = false, note = '', noteErr = false, kept = null;
    const today = () => ymd(new Date());

    function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 220) + 'px'; }
    function render() {
      const t = today(), def = (opts.defDate && opts.defDate()) || t;
      items = parseText(ta.value, t, def, preset).map((it) => Object.assign(it, ov[it.line] || {}));
      presetEl.hidden = preset === 'none';
      presetEl.innerHTML = preset === 'none' ? '' : `${esc(CAT[preset])}에 넣기<button type="button" data-qa="unpreset">해제</button>`;
      list.hidden = !items.length;
      list.innerHTML = items.map((it, i) => {
        const d = day(it.date), rel = Math.round((d - day(t)) / 864e5);
        const relT = rel === 0 ? '오늘' : rel === 1 ? '내일' : rel === 2 ? '모레' : WD[d.getDay()] + '요일';
        return `<div class="qa-row"><div class="qa-d">${d.getMonth() + 1}.${pad(d.getDate())}<small>${relT}</small></div>
          <div class="qa-b"><span class="qa-ttl">${esc(it.title)}</span><span class="qa-ts">
            <button type="button" class="qa-t k-${it.kind}" data-qa="kind" data-i="${i}" aria-label="종류 ${KIND[it.kind]}, 눌러서 바꾸기">${KIND[it.kind]}</button>
            ${it.time ? `<span class="qa-t">${it.time}${it.end ? '–' + it.end : ''}</span>` : '<span class="qa-t dim">시각 없음</span>'}
            <button type="button" class="qa-t${it.cat !== 'none' ? ' c-on' : ' dim'}" data-qa="cat" data-i="${i}" aria-label="묶음 ${CAT[it.cat]}, 눌러서 바꾸기">${CAT[it.cat]}</button>
            ${it.dateSet ? '' : `<span class="qa-t dim">${def === t ? '날짜 안 씀 → 오늘' : '고른 날'}</span>`}
          </span></div></div>`;
      }).join('');
      foot.hidden = !items.length && !note;
      go.disabled = busy || !items.length;
      go.textContent = busy ? '넣는 중' : items.length > 1 ? `${items.length}개 추가` : '추가';
      msg.textContent = note || (items.length ? '틀린 칸은 글을 고치거나 칩을 눌러 바꿉니다' : '');
      msg.classList.toggle('err', noteErr);
    }
    async function submit() {
      if (busy || !items.length) return;
      busy = true; note = ''; noteErr = false; render();
      const failed = []; let ok = 0, lastErr = '';
      for (const it of items) {
        const ev = { title: it.title, date: it.date, time: it.time, end: it.end, kind: it.kind, cat: it.cat, note: '' };
        try { await opts.post(ev); ok++; } catch (e) { failed.push(it.line); lastErr = (e && e.message) || '저장하지 못했습니다'; }
      }
      busy = false;
      ta.value = failed.join('\n'); ov = {}; grow();
      note = failed.length ? `${failed.length}개를 넣지 못했습니다. ${lastErr}` : `${ok}개 넣었습니다`;
      noteErr = !!failed.length;
      render();
      if (ok && opts.done) { try { await opts.done(ok); } catch {} }
      if (!failed.length) setTimeout(() => { if (!ta.value && !busy) { note = ''; render(); } }, 2500);
    }
    ta.addEventListener('input', () => { grow(); if (note && !noteErr) note = ''; render(); });
    ta.addEventListener('keydown', (e) => {
      // 한글 조합 중 Enter는 글자 확정이라 건너뛴다. Shift+Enter = 줄 바꿈
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); }
    });
    go.addEventListener('click', submit);
    node.addEventListener('click', (e) => {
      const b = e.target.closest('[data-qa]');
      if (!b) return;
      const a = b.dataset.qa;
      if (a === 'unpreset') { preset = 'none'; render(); ta.focus(); return; }
      const it = items[+b.dataset.i]; if (!it) return;
      const o = ov[it.line] || (ov[it.line] = {});
      if (a === 'kind') o.kind = KINDS[(KINDS.indexOf(it.kind) + 1) % KINDS.length];
      if (a === 'cat') o.cat = CATS[(CATS.indexOf(it.cat) + 1) % CATS.length];
      render();
    });
    render();
    return {
      node,
      // 화면을 다시 그린 뒤 slot 자리에 다시 붙인다. 입력 중이었으면 커서도 되살린다
      // 화면이 innerHTML로 다시 그려지기 직전에 keep()을 부르면 입력 중이던 커서를 기억한다
      keep() { kept = document.activeElement === ta ? [ta.selectionStart, ta.selectionEnd] : null; },
      attach(slot) {
        const k = kept || (document.activeElement === ta ? [ta.selectionStart, ta.selectionEnd] : null);
        kept = null;
        if (!slot) return;
        slot.replaceWith(node);
        if (k) { ta.focus({ preventScroll: true }); try { ta.setSelectionRange(k[0], k[1]); } catch {} }
        grow();
      },
      // 묶음 카드의 '+ 추가': 그 묶음으로 고정하고 입력 칸으로
      focus(cat) {
        if (cat) preset = CATS.includes(cat) ? cat : 'none';
        ov = {}; render();
        node.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        ta.focus({ preventScroll: true });
      },
      refresh: render,
    };
  }

  root.QuickAdd = { parse, parseText, guessCat, mount, KIND, CAT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
