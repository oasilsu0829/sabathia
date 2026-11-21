// PLANNER 창 = 15577 '계획' (2026-11-21). 15577에서 타임라인(시간 축·끌기·확대·타이머·뽀모도로)을 빼고
// 계획하는 부분만 WS 디자인으로 옮겼다: 날짜 고르기(주간 줄) · 그날 블록 목록 · 추가/고치기 시트 · 완료 · 순서 바꾸기 · 어제 못 끝낸 것 붙이기.
// 같은 파일이 sabathia public/decide/planpanel.js 와 sabathiaWS ws/planpanel.js 에 있다(둘 다 고칠 것).
// 규칙은 15577 그대로(host.PL = 15577 규칙 모듈): 블록은 시작 순, 겹치면 뒤로, 수업·학원과 겹치면 그 뒤로 민다.
// 기록(blockplanner 모양)은 host가 저장한다. 이 모듈은 고친 뒤 host.changed(msg)만 부른다.
//
// host = {
//   PL,                       15577 규칙 (normalize·layout·commit·statusOf·suggest·addBlock·updateBlock·complete·undone·removeBlock …)
//   get(): P                  지금 15577 기록 (없으면 null)
//   changed(msg)              P를 고친 뒤: updatedAt·저장·다시 그리기는 host가
//   today(): 'YYYY-MM-DD'     nowMin(): 분
//   toast(msg)
//   extra?(b): string         블록 아래 줄에 덧붙일 글(연결된 숙제 등, 이미 esc 된 HTML)
//   side?(k): string          오른쪽 칸 아래에 덧붙일 HTML(엔진 카드 등)
//   fullUrl?: string          15577 전체 화면 주소(있으면 맨 아래 링크)
//   readOnly?(): boolean
// }

const ICON = {
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const svg = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${ICON[n]}</svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');
const dOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const kOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addD = (k, n) => { const d = dOf(k); d.setDate(d.getDate() + n); return kOf(d); };
const between = (a, b) => Math.round((dOf(b) - dOf(a)) / 86_400_000);
const durTxt = (m) => { m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}시간 ${r}분` : `${h}시간`) : `${r}분`; };
const hm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m) % 60)}`;
const parseHM = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
const DAY_START = 6 * 60;

const STYLE = `
.pp{--pp-c:var(--ink3);display:flex;flex-direction:column;gap:12px;min-height:100%}
.pp button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;text-align:inherit}
.pp .num{font-family:var(--mono),var(--sans);font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.pp-wk{display:flex;align-items:center;gap:6px}
.pp-nav{flex:none;width:30px;height:30px;display:grid;place-items:center;line-height:0;border-radius:50%;color:var(--ink2);box-shadow:inset 0 0 0 1px var(--line2)}
.pp-nav:hover{background:var(--hover)}
.pp-days{flex:1;min-width:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.pp-wd{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 0 8px;border-radius:10px;color:var(--ink3);transition:background .2s}
.pp-wd:hover{background:var(--hover)}
.pp-wd small{font-size:10.5px;font-weight:600}
.pp-wd b{font-family:var(--mono);font-size:15px;font-weight:600;color:var(--ink2);letter-spacing:-.03em}
.pp-wd i{position:absolute;bottom:3px;width:4px;height:4px;border-radius:50%;background:transparent}
.pp-wd i.on{background:var(--ink3)}
.pp-wd.today b{color:var(--ink)}
.pp-wd.today small{color:var(--ink)}
.pp-wd.sel{background:var(--ink);color:var(--bg)}
.pp-wd.sel b,.pp-wd.sel small{color:var(--bg)}
.pp-wd.sel i.on{background:var(--bg)}
.pp-head{display:flex;align-items:flex-end;gap:12px;padding-top:4px}
.pp-date{display:flex;align-items:baseline;gap:10px;min-width:0}
.pp-date b{font-family:var(--disp);font-weight:400;font-size:34px;line-height:.9;letter-spacing:-.05em}
.pp-date span{font-size:12.5px;font-weight:600;color:var(--ink3);white-space:nowrap}
.pp-date .rel{color:var(--ink)}
.pp-today{height:24px;padding:0 10px;border-radius:999px;font-size:11.5px;font-weight:700;color:var(--ink2);box-shadow:inset 0 0 0 1px var(--line2);align-self:center}
.pp-stat{margin-left:auto;font-size:12px;color:var(--ink3);white-space:nowrap}
.pp-add{flex:none;height:32px;padding:0 14px;display:inline-flex;align-items:center;gap:6px;border-radius:999px;font-size:13px;font-weight:700;background:var(--ink);color:var(--bg)}
.pp-meter{height:3px;border-radius:3px;background:var(--trk);overflow:hidden}
.pp-meter i{display:block;height:100%;background:var(--ink);transition:width .6s var(--spring)}
.pp-note{display:flex;flex-direction:column;gap:6px}
.pp-note button{display:flex;align-items:center;gap:8px;min-height:36px;padding:0 12px;border-radius:10px;font-size:12.5px;font-weight:650;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line2)}
.pp-note button:hover{background:var(--hover)}
.pp-note button svg{margin-left:auto;color:var(--ink3)}
@container (max-width:520px){.pp-stat{display:none}.pp-add{margin-left:auto}.pp-date b{font-size:30px}.pp-n{width:28px}.pp-wd{padding:5px 0 7px}}
.pp-cols{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start}
@container (min-width:720px){.pp-cols{grid-template-columns:minmax(0,1fr) minmax(240px,320px)}}
.pp-main{min-width:0;display:flex;flex-direction:column;gap:10px}
.pp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.pp-row{position:relative;display:flex;align-items:stretch;gap:0;border-radius:12px;background:color-mix(in srgb,var(--c) 7%,var(--surf));box-shadow:inset 3px 0 0 var(--c);transition:background .2s,opacity .2s}
.pp-row:hover{background:color-mix(in srgb,var(--c) 11%,var(--surf))}
.pp-n{flex:none;width:34px;padding-top:13px;text-align:center;font-size:11px;color:var(--ink4)}
.pp-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding:10px 4px 10px 0}
.pp-t{display:flex;align-items:center;gap:8px;font-size:14.5px;font-weight:700;letter-spacing:-.02em;min-width:0}
.pp-t span.tt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pp-m{font-size:11.5px;color:var(--ink3);font-weight:500;line-height:1.4}
.pp-m .late{color:var(--hot);font-weight:700}
.pp-pg{display:block;height:3px;border-radius:3px;background:var(--trk);overflow:hidden;margin-top:3px;max-width:200px}
.pp-pg i{display:block;height:100%;background:var(--c)}
.pp-pill{flex:none;height:19px;padding:0 7px;display:inline-flex;align-items:center;border-radius:999px;font-size:9.5px;font-weight:700;letter-spacing:.02em;color:var(--ink2);box-shadow:inset 0 0 0 1px var(--line2)}
.pp-pill.st-next{color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink2)}
.pp-pill.st-run{background:var(--ink);color:var(--bg);box-shadow:none}
.pp-pill.st-late{background:var(--hot);color:#111;box-shadow:none}
.pp-pill.st-done{color:var(--ink3)}
.pp-pill.carried{color:var(--ink3);box-shadow:inset 0 0 0 1px var(--line)}
.pp-mv{flex:none;display:flex;flex-direction:column;justify-content:center;gap:2px;padding:0 2px}
.pp-mv button{width:26px;height:22px;display:grid;place-items:center;line-height:0;border-radius:6px;color:var(--ink3)}
.pp-mv button:hover:not(:disabled){background:var(--hover);color:var(--ink)}
.pp-mv button:disabled{opacity:.25;cursor:default}
.pp-chk{flex:none;align-self:center;width:30px;height:30px;margin:0 10px 0 4px;border-radius:50%;display:grid;place-items:center;color:transparent;box-shadow:inset 0 0 0 1.5px var(--ink3);transition:background .2s,color .2s}
.pp-chk:hover{color:var(--ink3)}
.pp-chk[aria-pressed="true"]{background:var(--c);color:#fff;box-shadow:none}
.pp-row.st-done{opacity:.5}
.pp-row.st-done .pp-t .tt{text-decoration:line-through;text-decoration-thickness:1px}
.pp-row.st-late{box-shadow:inset 3px 0 0 var(--hot)}
.pp-empty{padding:26px 16px;border-radius:12px;text-align:center;font-size:13px;color:var(--ink3);box-shadow:inset 0 0 0 1px var(--line);line-height:1.6}
.pp-quick{display:flex;gap:6px}
.pp-quick input{flex:1;min-width:0;height:38px;padding:0 12px;border:0;border-radius:10px;background:var(--surf2);color:var(--ink);font:500 13.5px var(--sans);box-shadow:inset 0 0 0 1px var(--line2)}
.pp-quick input::placeholder{color:var(--ink4)}
.pp-quick input:focus{outline:none;box-shadow:inset 0 0 0 1.5px var(--ink2)}
.pp-quick button{flex:none;height:38px;padding:0 14px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:inset 0 0 0 1px var(--line2)}
.pp-side{display:flex;flex-direction:column;gap:12px}
.pp-card{padding:18px;border-radius:14px;background:var(--surf2);box-shadow:inset 0 0 0 1px var(--line)}
.pp-k{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.pp-big{font-family:var(--disp);font-size:30px;line-height:1;letter-spacing:-.04em;margin:8px 0 4px}
.pp-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin-top:12px;font-size:12.5px}
.pp-kv dt{color:var(--ink3)}
.pp-kv dd{margin:0;text-align:right;font-weight:600}
.pp-cats{display:flex;flex-direction:column;gap:7px;margin-top:14px}
.pp-cat{display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:8px;font-size:12px}
.pp-cat .bar{height:6px;border-radius:3px;background:var(--trk);overflow:hidden}
.pp-cat .bar i{display:block;height:100%;background:var(--c)}
.pp-cat .v{color:var(--ink3);font-size:11px}
.pp-full{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink3);text-decoration:none;padding:4px 0}
.pp-full:hover{color:var(--ink)}
.pp-ro{font-size:12px;color:var(--ink3)}

.pp-dlg{position:fixed;inset:0;margin:auto;height:fit-content;max-height:calc(100dvh - 32px);overflow:auto;width:min(480px,calc(100vw - 32px));padding:24px;border:0;border-radius:18px;background:#1B1B1B;color:var(--ink);box-shadow:0 30px 80px -20px #000,inset 0 0 0 1px var(--line2);font-family:var(--sans)}
.pp-dlg::backdrop{background:rgba(0,0,0,.6);backdrop-filter:blur(4px)}
.pp-dlg [hidden]{display:none!important}
.pp-dlg h2{margin:0 0 16px;font:400 24px var(--disp);letter-spacing:-.04em}
.pp-dlg label{display:block;font-size:12.5px;font-weight:600;color:var(--ink2);margin-bottom:12px}
.pp-dlg input[type=text],.pp-dlg input[type=number],.pp-dlg input[type=time],.pp-dlg input[type=date]{display:block;width:100%;height:40px;margin-top:6px;padding:0 12px;border:0;border-radius:10px;background:#111;color:var(--ink);font:500 15px var(--sans);box-shadow:inset 0 0 0 1px var(--line2);color-scheme:dark}
.pp-dlg input:focus{outline:none;box-shadow:inset 0 0 0 1.5px var(--ink2)}
.pp-dlg .lbl{font-size:12.5px;font-weight:600;color:var(--ink2);margin-bottom:6px}
.pp-dlg .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pp-seg{display:flex;gap:4px;padding:3px;margin-bottom:14px;border-radius:999px;box-shadow:inset 0 0 0 1px var(--line2)}
.pp-seg label{flex:1;margin:0}
.pp-seg input,.pp-chips input{position:absolute;opacity:0;pointer-events:none}
.pp-seg span{display:block;height:32px;line-height:32px;text-align:center;border-radius:999px;font-size:13.5px;font-weight:650;color:var(--ink3);cursor:pointer}
.pp-seg input:checked+span{background:var(--ink);color:var(--bg)}
.pp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.pp-chips label{margin:0}
.pp-chips span{display:inline-block;height:30px;line-height:30px;padding:0 12px;border-radius:999px;font-size:13px;font-weight:650;color:var(--ink2);box-shadow:inset 0 0 0 1px var(--line2);cursor:pointer}
.pp-chips input:checked+span{background:color-mix(in srgb,var(--c) 32%,transparent);color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--c)}
.pp-seg input:focus-visible+span,.pp-chips input:focus-visible+span{outline:2px solid var(--ink);outline-offset:2px}
.pp-steps{display:flex;gap:6px;margin:-4px 0 12px;flex-wrap:wrap}
.pp-steps button{height:28px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:650;color:var(--ink2);box-shadow:inset 0 0 0 1px var(--line2)}
.pp-steps button:hover{background:var(--hover)}
.pp-hint{margin:-2px 0 14px;font-size:12px;color:var(--ink3);line-height:1.5}
.pp-hint b{color:var(--ink);font-weight:700}
.pp-chkl{display:flex!important;align-items:center;gap:8px;font-size:14px!important;color:var(--ink)!important}
.pp-chkl input{width:18px;height:18px;margin:0;accent-color:var(--ink)}
.pp-btns{display:flex;align-items:center;gap:8px;margin-top:18px}
.pp-btns span{flex:1}
.pp-btns button{height:38px;padding:0 16px;border-radius:999px;font:700 13.5px var(--sans);color:var(--ink);background:none;border:0;cursor:pointer;box-shadow:inset 0 0 0 1px var(--line2)}
.pp-btns .ok{background:var(--ink);color:var(--bg);box-shadow:none}
.pp-btns .del{color:var(--hot);box-shadow:none;padding:0 8px}
`;

export function mountPlanner(root, host) {
  const PL = host.PL;
  if (!document.getElementById('pp-css')) {
    const s = document.createElement('style');
    s.id = 'pp-css'; s.textContent = STYLE;
    document.head.append(s);
  }
  let day = null; // null = 오늘
  const K = () => day ?? host.today();
  const P = () => host.get();
  const ro = () => !!host.readOnly?.();

  // ───────── 시트 ─────────
  const dlg = document.createElement('dialog');
  dlg.className = 'pp-dlg';
  dlg.setAttribute('aria-labelledby', 'ppH');
  dlg.innerHTML = `<form method="dialog">
    <h2 id="ppH">블록 추가</h2>
    <div class="pp-seg" role="radiogroup" aria-label="종류">
      <label><input type="radio" name="kind" value="solve" checked><span>문풀</span></label>
      <label><input type="radio" name="kind" value="review"><span>정리</span></label>
      <label><input type="radio" name="kind" value="lecture"><span>인강</span></label>
    </div>
    <div class="lbl">과목</div>
    <div class="pp-chips" data-f="cats" role="radiogroup" aria-label="과목"></div>
    <label>제목<input type="text" name="title" autocomplete="off" placeholder="비우면 과목 이름"></label>
    <div class="two" data-f="amt">
      <label>분량<input type="number" name="units" min="0" inputmode="numeric" placeholder="예: 26"></label>
      <label>단위<input type="text" name="unit" autocomplete="off"></label>
    </div>
    <label>예상 시간 (분)<input type="number" name="est" min="5" max="600" step="5" inputmode="numeric"></label>
    <div class="pp-steps" data-f="steps"><button type="button" data-step="-10">−10</button><button type="button" data-step="-5">−5</button><button type="button" data-step="5">+5</button><button type="button" data-step="10">+10</button><button type="button" data-step="30">+30</button></div>
    <p class="pp-hint" data-f="hint"></p>
    <div class="two">
      <label>날짜<input type="date" name="day"></label>
      <label>시작 <small>(비우면 맨 끝)</small><input type="time" name="start" step="300"></label>
    </div>
    <div data-f="progW"><div class="lbl">진행</div>
      <div class="pp-seg" role="radiogroup" aria-label="진행">${[0, 25, 50, 75].map((v) => `<label><input type="radio" name="prog" value="${v}"><span>${v}%</span></label>`).join('')}</div>
    </div>
    <label class="pp-chkl"><input type="checkbox" name="done"> 끝냄</label>
    <label data-f="actW">실제 걸린 시간 (분)<input type="number" name="actual" min="1" inputmode="numeric"></label>
    <p class="pp-hint">수업·학원과 겹치면 15577처럼 그 뒤로 밀려요. 블록 시간 배치(타임라인)는 15577에서.</p>
    <div class="pp-btns"><button value="del" class="del" data-f="del">삭제</button><span></span><button value="cancel" formnovalidate>닫기</button><button value="save" class="ok">저장</button></div>
  </form>`;
  document.body.append(dlg);
  const F = dlg.querySelector('form');
  const fld = (n) => dlg.querySelector(`[data-f="${n}"]`);
  let editId = null;

  function hint() {
    const p = P(), kind = F.kind.value;
    fld('amt').hidden = kind !== 'solve';
    fld('actW').hidden = !F.done.checked || kind !== 'solve';
    fld('progW').hidden = F.done.checked;
    const sg = PL.suggest(p, F.cat.value, kind === 'solve' ? +F.units.value || 0 : 0, F.unit.value);
    fld('hint').innerHTML = sg ? `기록으로 본 예상 <b>${sg.min}분</b> · ${esc(sg.why)}` : `${esc(PL.catOf(p, F.cat.value).name)} 기록이 아직 없어요. 끝낸 뒤 실제 시간을 남기면 다음 예상에 써요.`;
    return sg;
  }
  function open(id, preset = {}) {
    if (ro()) return;
    const p = P(); if (!p) return;
    const found = id ? PL.findB(p, id) : {};
    const b = found.b || null;
    if (id && !b) return;
    editId = id || null;
    dlg.querySelector('#ppH').textContent = b ? '블록 고치기' : '블록 추가';
    fld('cats').innerHTML = p.cats.map((c) => `<label style="--c:${esc(c.color)}"><input type="radio" name="cat" value="${esc(c.id)}"><span>${esc(c.name)}</span></label>`).join('');
    const cat = b?.cat ?? preset.cat ?? (p.cats.some((c) => c.id === p.lastCat) ? p.lastCat : p.cats[0].id);
    (F.querySelector(`input[name=cat][value="${CSS.escape(cat)}"]`) || F.querySelector('input[name=cat]')).checked = true;
    F.kind.value = b ? PL.kindOf(b) : preset.kind || 'solve';
    F.title.value = b?.title ?? preset.title ?? '';
    F.units.value = b?.units || preset.units || '';
    F.unit.value = b?.unit || preset.unit || '문제';
    F.est.value = b ? b.est || b.dur : preset.est || 30;
    F.day.value = found.k || K();
    const k = found.k || K();
    const laid = b ? PL.layout(p, k).find((a) => a.b.id === id)?.s ?? b.start : null;
    F.start.value = b ? hm(laid) : '';
    F.done.checked = !!b?.done;
    F.actual.value = b?.actual || '';
    const pr = Math.round(((b?.progress || 0) * 100) / 25) * 25;
    F.prog.value = String(Math.min(75, pr));
    F.dataset.estTouched = b || preset.est ? '1' : '';
    fld('del').hidden = !b;
    const sg = hint();
    if (!b && !preset.est && sg) F.est.value = sg.min;
    dlg.showModal();
  }
  dlg.addEventListener('input', (e) => {
    if (e.target.name === 'est') F.dataset.estTouched = '1';
    const sg = hint();
    if (!F.dataset.estTouched && sg && ['cat', 'units', 'unit', 'kind'].includes(e.target.name)) F.est.value = sg.min;
  });
  dlg.addEventListener('click', (e) => {
    const s = e.target.closest('[data-step]'); if (!s) return;
    F.est.value = Math.max(5, Math.min(600, (+F.est.value || 0) + +s.dataset.step));
    F.dataset.estTouched = '1';
  });
  dlg.addEventListener('close', () => {
    const v = dlg.returnValue, p = P();
    dlg.returnValue = '';
    if (!p) return;
    if (v === 'del') {
      const b = PL.findB(p, editId).b;
      if (b && confirm(`‘${b.title}’ 블록을 지울까요?`)) { PL.removeBlock(p, editId); host.changed('지웠어요'); }
      return;
    }
    if (v !== 'save') return;
    const d = { title: F.title.value, cat: F.cat.value, kind: F.kind.value, units: +F.units.value || 0, unit: F.unit.value.trim() || '문제',
      est: Math.max(5, Math.min(600, +F.est.value || 30)), start: parseHM(F.start.value), actual: +F.actual.value || null };
    const toDay = /^\d{4}-\d{2}-\d{2}$/.test(F.day.value) ? F.day.value : K();
    const prog = +F.prog.value / 100 || 0;
    if (editId) {
      const { b: was, k: from } = PL.findB(p, editId);
      const wasDone = !!was?.done;
      if (from !== toDay) { moveDay(p, editId, toDay, d.start); d.start = d.start ?? PL.findB(p, editId).b.start; }
      else if (d.start == null) d.start = was.start;
      PL.updateBlock(p, editId, d);
      finish(p, editId, F.done.checked, wasDone, d, prog);
      host.changed(from !== toDay ? `${shortK(toDay)}로 옮겼어요` : '저장했어요');
      if (from !== toDay) day = toDay === host.today() ? null : toDay;
    } else {
      if (d.start == null) d.start = PL.placeStart(p, toDay, host.today(), host.nowMin());
      const b = PL.addBlock(p, toDay, d, host.today());
      finish(p, b.id, F.done.checked, false, d, prog);
      host.changed(`‘${b.title}’ ${shortK(toDay)} ${hm(b.start)}에 넣었어요`);
    }
  });
  // 끝냄 표시: 문풀은 15577처럼 기록(log)에 남기고, 정리·인강은 체크만(15577 rcheck·lcycle)
  function finish(p, id, doneNow, wasDone, d, prog) {
    const b = PL.findB(p, id).b; if (!b) return;
    if (PL.isLite(b)) {
      b.done = doneNow; b.progress = doneNow ? 1 : prog;
      if (b.review && !doneNow) b.progress = 0;
      return;
    }
    if (doneNow && !wasDone) PL.complete(p, id, d.actual ?? d.est);
    else if (!doneNow && wasDone) PL.undone(p, id);
    if (!doneNow) b.progress = prog;
  }
  function moveDay(p, id, to, start) {
    const { b, k } = PL.findB(p, id); if (!b || k === to) return;
    p.days[k] = p.days[k].filter((x) => x.id !== id);
    if (!p.days[k].length) delete p.days[k];
    if (b.runningSince) { b.elapsed = (b.elapsed || 0) + Date.now() - b.runningSince; b.runningSince = null; }
    b.start = start ?? PL.placeStart(p, to, host.today(), host.nowMin());
    PL.dayList(p, to).push(b);
    const l = p.log.find((x) => x.id === id); if (l) l.date = to;
    PL.commit(p, to, id);
  }
  const shortK = (k) => { const d = dOf(k); return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`; };

  // ───────── 순서 바꾸기 (타임라인 끌기 대신 ↑↓) ─────────
  function move(p, k, id, dir) {
    const lay = PL.layout(p, k), i = lay.findIndex((a) => a.b.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= lay.length) return false;
    const [x, y] = dir < 0 ? [lay[i], lay[j]] : [lay[j], lay[i]]; // x가 y 앞으로
    const s = y.s;
    x.b.start = s; y.b.start = s + x.d;
    PL.commit(p, k, x.b.id);
    return true;
  }
  // 어제 못 끝낸 것(정리 제외)을 오늘 끝에 붙이기 (15577 carry)
  function carry(p) {
    const t = host.today(), y = addD(t, -1);
    const rem = (p.days[y] || []).filter((b) => !b.done && !b.review);
    if (!rem.length) return 0;
    p.days[y] = p.days[y].filter((b) => !rem.includes(b));
    if (!p.days[y].length) delete p.days[y];
    let s = PL.placeStart(p, t, t, host.nowMin());
    for (const b of rem) {
      if (b.runningSince) { b.elapsed = (b.elapsed || 0) + Date.now() - b.runningSince; b.runningSince = null; }
      b.start = s; b.planStart = s; s += PL.effDur(b); b.carried = true; PL.dayList(p, t).push(b);
    }
    PL.commit(p, t);
    return rem.length;
  }
  // 빠르게 추가: "수학 26문제 50분", "영어 단어 정리 20분", "국어 인강"
  function quick(p, text) {
    text = text.trim(); if (!text) return null;
    const c = p.cats.find((x) => text.includes(x.name));
    const mm = /(\d+)\s*분/.exec(text), um = /(\d+)\s*(문제|쪽|p|페이지|강|개|문항|지문|세트)/.exec(text);
    const kind = /인강/.test(text) ? 'lecture' : /정리|복습/.test(text) ? 'review' : 'solve';
    const cat = c ? c.id : p.cats.some((x) => x.id === p.lastCat) ? p.lastCat : p.cats[0].id;
    const units = kind === 'solve' && um ? +um[1] : 0, unit = um ? um[2] : '문제';
    const title = text.replace(/(\d+)\s*분/, '').replace(/\s+/g, ' ').trim();
    const sg = PL.suggest(p, cat, units, unit);
    const est = mm ? Math.max(5, Math.min(600, +mm[1])) : sg ? sg.min : 30;
    const k = K();
    const b = PL.addBlock(p, k, { title, cat, kind, units, unit, est, start: PL.placeStart(p, k, host.today(), host.nowMin()) }, host.today());
    return b;
  }

  // ───────── 그리기 ─────────
  function render() {
    const p = P();
    if (!p) { root.innerHTML = '<div class="pp"><p class="pp-empty">15577 기록을 아직 못 읽었어요.</p></div>'; return; }
    const t = host.today(), k = K(), nowM = host.nowMin(), d = dOf(k);
    const lay = PL.layout(p, k), st = PL.statusOf(p, k, t, nowM), prog = PL.dayProg(p, k);
    const wk0 = addD(k, -d.getDay());
    const days = Array.from({ length: 7 }, (_, i) => {
      const x = addD(wk0, i), dd = dOf(x), has = (p.days[x] || []).length > 0;
      return `<button class="pp-wd${x === t ? ' today' : ''}${x === k ? ' sel' : ''}" data-pp="day" data-k="${x}" aria-label="${dd.getMonth() + 1}월 ${dd.getDate()}일 ${WEEK[i]}요일"${x === k ? ' aria-current="date"' : ''}><small>${WEEK[i]}</small><b>${pad(dd.getDate())}</b><i${has ? ' class="on"' : ''}></i></button>`;
    }).join('');
    const rel = k === t ? '오늘' : k === addD(t, 1) ? '내일' : k === addD(t, -1) ? '어제' : between(t, k) > 0 ? `${between(t, k)}일 뒤` : `${-between(t, k)}일 전`;
    const lateD = between(k, t);
    const rows = lay.map((a, i) => {
      const b = a.b, c = PL.catOf(p, b.cat), s = st.get(b.id);
      const amt = !PL.isLite(b) && b.units ? `${b.units}${esc(b.unit || '')}` : '';
      const est = PL.isLite(b) ? `${b.dur}분` : b.done && b.actual ? `예상 ${b.est}분 → 실제 ${b.actual}분` : `예상 ${b.est || b.dur}분`;
      const when = s === 'late' && lateD > 0 ? `<span class="late">${lateD}일 지남</span>` : s === 'late' ? `<span class="late">${hm(a.s)} 지남</span>` : `${hm(a.s)}–${hm(a.s + a.d)}`;
      const meta = [esc(c.name), PL.KIND_LABEL[PL.kindOf(b)], amt, est, when].filter(Boolean).join(' · ');
      const pg = !b.done && b.progress > 0 ? `<span class="pp-pg"><i style="width:${Math.round(b.progress * 100)}%"></i></span>` : '';
      const extra = host.extra?.(b) || '';
      return `<li class="pp-row st-${s}" style="--c:${esc(c.color || 'var(--ink3)')}">
        <span class="pp-n num">${pad(i + 1)}</span>
        <button class="pp-body" data-pp="edit" data-id="${esc(b.id)}" aria-label="${esc(b.title)} 고치기"${ro() ? ' disabled' : ''}>
          <span class="pp-t"><span class="tt">${esc(b.title)}</span><span class="pp-pill st-${s}">${PL.ST_LABEL[s]}</span>${b.carried && !b.done ? '<span class="pp-pill carried">어제에서</span>' : ''}</span>
          <span class="pp-m">${meta}${extra ? ' · ' + extra : ''}</span>${pg}
        </button>
        ${ro() ? '' : `<span class="pp-mv"><button data-pp="up" data-id="${esc(b.id)}" aria-label="앞으로"${i === 0 ? ' disabled' : ''}>${svg('up', 14)}</button><button data-pp="down" data-id="${esc(b.id)}" aria-label="뒤로"${i === lay.length - 1 ? ' disabled' : ''}>${svg('down', 14)}</button></span>
        <button class="pp-chk" data-pp="check" data-id="${esc(b.id)}" aria-pressed="${!!b.done}" aria-label="${esc(b.title)} ${b.done ? '완료 취소' : '완료'}">${svg('check', 15)}</button>`}
      </li>`;
    }).join('');
    const notes = [];
    if (!ro() && k === t) {
      const rem = (p.days[addD(t, -1)] || []).filter((b) => !b.done && !b.review);
      if (rem.length) notes.push(`<button data-pp="carry">어제 못 끝낸 ${rem.length}개를 오늘 끝에 붙이기${svg('arrow', 14)}</button>`);
    }
    if ((p.schoolOff || []).includes(k)) notes.push('<button disabled>이 날은 수업을 뺐어요 (15577 설정)</button>');
    // 요약 카드: 총 계획·남은 시간·과목별
    const planMin = (b) => (PL.isLite(b) ? b.dur : b.est || b.dur);
    const total = lay.reduce((n, a) => n + planMin(a.b), 0);
    const left = lay.reduce((n, a) => n + (a.b.done ? 0 : planMin(a.b) * (1 - Math.max(0, Math.min(1, a.b.progress || 0)))), 0);
    const end = lay.length ? lay[lay.length - 1].s + lay[lay.length - 1].d : null;
    const byCat = new Map();
    for (const a of lay) { const c = PL.catOf(p, a.b.cat); const o = byCat.get(c.id) || { c, m: 0, done: 0 }; o.m += planMin(a.b); if (a.b.done) o.done += planMin(a.b); byCat.set(c.id, o); }
    const maxM = Math.max(1, ...[...byCat.values()].map((o) => o.m));
    const fx = PL.fixedFor(p, k).filter((x) => !x.self && !x.f.meal);
    const dd = p.dday?.date ? between(t, p.dday.date) : null;
    const summary = `<div class="pp-card">
      <div class="pp-k">${k === t ? 'Today plan' : 'Day plan'} · ${shortK(k)}</div>
      <div class="pp-big num">${durTxt(total)}</div>
      <div class="pp-m">블록 ${lay.length}개 · 완료 ${prog.doneN}개</div>
      <dl class="pp-kv">
        <dt>남은 계획</dt><dd class="num">${durTxt(left)}</dd>
        ${end != null ? `<dt>마지막 블록 끝</dt><dd class="num">${hm(end)}</dd>` : ''}
        ${fx.length ? `<dt>수업·학원</dt><dd class="num">${fx.length}개 · ${hm(fx[0].s)}–${hm(fx[fx.length - 1].s + fx[fx.length - 1].d)}</dd>` : ''}
        ${dd != null && dd >= 0 ? `<dt>${esc(p.dday.title || 'D-day')}</dt><dd class="num">${dd === 0 ? 'D-DAY' : 'D-' + dd}</dd>` : ''}
      </dl>
      ${byCat.size ? `<div class="pp-cats">${[...byCat.values()].map((o) => `<div class="pp-cat" style="--c:${esc(o.c.color)}"><span>${esc(o.c.name)}</span><span class="bar"><i style="width:${(o.m / maxM) * 100}%"></i></span><span class="v num">${o.m}분</span></div>`).join('')}</div>` : ''}
    </div>`;
    root.innerHTML = `<div class="pp">
      <div class="pp-wk"><button class="pp-nav" data-pp="wk" data-d="-7" aria-label="지난주">${svg('left', 15)}</button><div class="pp-days">${days}</div><button class="pp-nav" data-pp="wk" data-d="7" aria-label="다음 주">${svg('right', 15)}</button></div>
      <div class="pp-head">
        <div class="pp-date"><b>${d.getMonth() + 1}/${d.getDate()}</b><span>${WEEK[d.getDay()]}요일 · <span class="rel">${rel}</span></span></div>
        ${k !== t ? '<button class="pp-today" data-pp="today">오늘로</button>' : ''}
        <span class="pp-stat num">${prog.doneN}/${prog.n} · ${Math.round(prog.pct)}%</span>
        ${ro() ? '' : `<button class="pp-add" data-pp="add">${svg('plus', 14)}블록</button>`}
      </div>
      <div class="pp-meter"><i style="width:${prog.pct}%"></i></div>
      ${notes.length ? `<div class="pp-note">${notes.join('')}</div>` : ''}
      <div class="pp-cols">
        <div class="pp-main">
          ${lay.length ? `<ol class="pp-list">${rows}</ol>` : `<p class="pp-empty">이 날 계획한 블록이 없어요.${ro() ? '' : '<br>아래에 적거나 ‘+ 블록’으로 넣어 보세요.'}</p>`}
          ${ro() ? '<p class="pp-ro">샘플 데이터라 고칠 수 없어요.</p>' : `<form class="pp-quick" data-pp-quick><input name="q" autocomplete="off" placeholder="빠르게 추가 — 예: 수학 26문제 50분" aria-label="블록 빠르게 추가"><button>추가</button></form>`}
          ${host.fullUrl ? `<a class="pp-full" href="${esc(host.fullUrl)}">15577 전체 화면(타임라인·타이머) 열기 ${svg('arrow', 13)}</a>` : ''}
        </div>
        <aside class="pp-side">${summary}${host.side?.(k) || ''}</aside>
      </div>
    </div>`;
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-pp]'); if (!a || a.disabled) return;
    const p = P(), act = a.dataset.pp, id = a.dataset.id;
    if (act === 'day') { day = a.dataset.k === host.today() ? null : a.dataset.k; render(); return; }
    if (act === 'wk') { const k = addD(K(), +a.dataset.d); day = k === host.today() ? null : k; render(); return; }
    if (act === 'today') { day = null; render(); return; }
    if (!p || ro()) return;
    if (act === 'add') return open(null);
    if (act === 'edit') return open(id);
    if (act === 'up' || act === 'down') { if (move(p, K(), id, act === 'up' ? -1 : 1)) host.changed(); return; }
    if (act === 'carry') { const n = carry(p); if (n) host.changed(`${n}개를 오늘로 옮겼어요`); return; }
    if (act === 'check') {
      const b = PL.findB(p, id).b; if (!b) return;
      if (PL.isLite(b)) { b.done = !b.done; b.progress = b.done ? 1 : 0; host.changed(b.done ? `${b.title} 체크했어요` : '체크를 풀었어요'); return; }
      if (b.done) { PL.undone(p, id); host.changed('완료를 취소했어요'); return; }
      const el = Math.round(((b.elapsed || 0) + (b.runningSince ? Date.now() - b.runningSince : 0)) / 60000);
      PL.complete(p, id, el >= 1 ? el : b.est || b.dur);
      host.changed(`${b.title} 완료 · 예상 ${b.est}분 → 실제 ${b.actual}분 (눌러서 고칠 수 있어요)`);
    }
  });
  root.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-pp-quick]'); if (!f) return;
    e.preventDefault();
    const p = P(); if (!p || ro()) return;
    const b = quick(p, f.q.value);
    if (!b) { open(null); return; }
    f.q.value = '';
    host.changed(`‘${b.title}’ ${hm(b.start)} · 예상 ${b.est}분으로 넣었어요`);
    requestAnimationFrame(() => root.querySelector('[data-pp-quick] input')?.focus());
  });

  return {
    render,
    open,
    day: K,
    setDay(k) { day = !k || k === host.today() ? null : k; render(); },
    openBlock(id) { const p = P(); const f = p && PL.findB(p, id); if (!f?.b) return false; day = f.k === host.today() ? null : f.k; render(); open(id); return true; },
  };
}
