// 잼 모드 (2026-11-12). 음악 앱 위에 화면 전체를 덮는다: 불이 꺼지고 카세트 라디오(3D)와 J카드(손글씨 셋리스트)만 남는다
// - 잼 하나 = Spotify 공동 작업 플레이리스트 하나("JAM 11.12"). 친구는 Spotify 앱에서 곡을 넣고, 나는 J카드 빈 줄을 눌러 곡·앨범을 넣는다
// - 4초마다 플레이리스트를 읽어 새 줄을 손글씨로 적는다. 지금 곡은 형광펜, 들은 곡은 줄을 긋는다. 곡이 바뀌면 앨범 표지 폴라로이드가 데크 옆에 꽂힌다
// - 건반: PLAY 재생 · PAUSE 잠깐 · FF/REW 다음/이전 · REC 장식(녹음 중 표시) · STOP/EJ 멈춤, 멈춘 채 두 번 = 잼 끝(테이프가 튀어나와 JAM 크레이트로)
// - 저장 music.jam = { id, tape, at, name, replay } (새로고침해도 잼이 이어진다), music.jamTape = 바로 전 잼 테이프(겹치지 않게)
// - 음악 앱(index.html)이 window.MusicCore로 api·토큰·기기·크레이트 저장을 넘겨준다
import { createBoombox, tapeFor } from './boombox.js';

const C = window.MusicCore;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const BASE = new URL('./', import.meta.url).href;
const today = () => { const d = new Date(); return { md: `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`, ymd: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` }; };
const fmt = (ms) => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- 화면 ----------
const CSS = `
.jam { position: fixed; inset: 0; z-index: 80; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr); gap: 2vw; padding: max(18px, env(safe-area-inset-top)) max(22px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(22px, env(safe-area-inset-left));
  background: radial-gradient(ellipse 60% 55% at 34% 52%, #2a2723 0%, #121110 55%, #070707 100%); color: #efe9dc; font-family: 'Space Grotesk', 'Noto Sans KR', sans-serif;
  opacity: 0; transition: opacity .7s ease; user-select: none; overflow: hidden; }
.jam.on { opacity: 1; }
.jam::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 34% 40%, rgba(255,236,200,.13), transparent 42%); opacity: 0; transition: opacity .25s ease .75s; }
.jam.lit::before { opacity: 1; }
.jam-stage { position: relative; min-height: 0; opacity: 0; transform: translateY(14px) scale(.98); transition: opacity .5s ease, transform .6s cubic-bezier(.2,.8,.2,1); }
.jam.lit .jam-stage { opacity: 1; transform: none; }
.jam-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
.jam-k { position: absolute; left: 4px; top: 2px; font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .22em; color: rgba(239,233,220,.55); display: flex; align-items: center; gap: 8px; }
.jam-k .rec { width: 8px; height: 8px; border-radius: 50%; background: #3a1414; }
.jam.recording .jam-k .rec { background: #ff3b30; box-shadow: 0 0 10px #ff3b30; animation: jblink 1.4s steps(2) infinite; }
@keyframes jblink { 50% { opacity: .25; } }
/* 폴라로이드(지금 곡 앨범 표지) */
.jam-pola { position: absolute; right: 1%; top: 3%; width: min(24%, 170px); aspect-ratio: .86; pointer-events: none; }
.pola { position: absolute; inset: 0; background: #f6f3ec; padding: 7% 7% 22%; border-radius: 2px; box-shadow: 0 14px 28px rgba(0,0,0,.55), 0 2px 4px rgba(0,0,0,.4); transform-origin: 50% 0;
  animation: pdrop .9s cubic-bezier(.2,.9,.25,1.15) both; transition: transform .6s ease, opacity .6s ease, filter .6s; }
.pola i { display: block; width: 100%; aspect-ratio: 1; background: #222 center/cover; }
.pola b { position: absolute; left: 7%; right: 7%; bottom: 5%; font-family: 'Nanum Pen Script', cursive; font-weight: 400; font-size: clamp(15px, 1.6vw, 21px); color: #2a2622; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; }
.pola::after { content: ''; position: absolute; left: 50%; top: -9px; width: 44px; height: 18px; margin-left: -22px; background: rgba(230,220,190,.75); transform: rotate(-3deg); box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.pola.old { opacity: .0; filter: brightness(.5); }
@keyframes pdrop { 0% { transform: translateY(-140%) rotate(var(--r0)); opacity: 0; } 55% { opacity: 1; } 100% { transform: rotate(var(--r)); } }
/* J카드 */
.jcard { position: relative; align-self: center; max-height: calc(100dvh - 48px); display: flex; flex-direction: column; min-height: 0; background: #f4efe3; color: #2a2622; border-radius: 3px;
  box-shadow: 0 30px 60px rgba(0,0,0,.6), 0 3px 6px rgba(0,0,0,.4), inset 0 0 60px rgba(160,130,80,.12);
  opacity: 0; transform: translateX(60px) rotate(3deg); transition: opacity .5s ease .25s, transform .7s cubic-bezier(.2,.9,.25,1.1) .25s; }
.jam.lit .jcard { opacity: 1; transform: rotate(-.6deg); }
.jcard .band { height: 12px; background: var(--tape, #c8402e); border-radius: 3px 3px 0 0; }
.jcard header { padding: 14px 20px 6px 46px; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; border-bottom: 1.5px solid rgba(40,30,20,.55); }
.jcard h2 { margin: 0; font-family: 'Nanum Pen Script', cursive; font-weight: 400; font-size: 38px; line-height: 1; letter-spacing: .02em; }
.jcard header small { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .18em; color: rgba(42,38,34,.6); text-align: right; }
.jlist { list-style: none; margin: 0; padding: 4px 0 8px; overflow-y: auto; flex: 1; min-height: 120px; scrollbar-width: thin;
  background: linear-gradient(90deg, transparent 37px, rgba(200,60,50,.5) 37px, rgba(200,60,50,.5) 38.5px, transparent 38.5px), repeating-linear-gradient(180deg, transparent 0 39px, rgba(70,110,170,.22) 39px 40px); background-attachment: local; }
.jlist li { position: relative; height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 16px 0 46px; font-family: 'Nanum Pen Script', cursive; font-size: 24px; line-height: 1; cursor: pointer; }
.jlist li .no { position: absolute; left: 10px; width: 22px; text-align: right; font-size: 18px; color: rgba(42,38,34,.55); }
.jlist li .w { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; position: relative; }
.jlist li .w em { font-style: normal; font-size: 19px; color: rgba(42,38,34,.62); }
.jlist li .by { font-size: 16px; color: #6a5a9a; white-space: nowrap; }
.jlist li .d { font-size: 17px; color: rgba(42,38,34,.5); }
.jlist li.new .w { animation: jwrite 1s steps(14) both; }
@keyframes jwrite { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
.jlist li.done .w::after { content: ''; position: absolute; left: 0; right: 0; top: 52%; height: 2px; background: rgba(42,38,34,.7); border-radius: 2px; transform: rotate(-.4deg); animation: jstrike .5s ease both; }
@keyframes jstrike { from { right: 100%; } }
.jlist li.done { color: rgba(42,38,34,.55); }
.jlist li.cur .w { background: linear-gradient(transparent 46%, rgba(255,214,0,.55) 46%, rgba(255,214,0,.55) 88%, transparent 88%); }
.jlist li.cur::before { content: '▶'; position: absolute; left: -2px; font-size: 16px; color: #c8402e; }
.jlist li.pend { color: rgba(42,38,34,.45); }
.jlist li.add { color: rgba(42,38,34,.42); }
.jlist li.add:hover, .jlist li.add:focus-visible { color: #c8402e; outline: none; }
.jcard footer { display: flex; gap: 8px; padding: 10px 14px 14px; border-top: 1px dashed rgba(42,38,34,.3); flex-wrap: wrap; align-items: center; }
.jbtn { appearance: none; border: 1.5px solid rgba(42,38,34,.75); background: transparent; color: #2a2622; font-family: 'Nanum Pen Script', cursive; font-size: 21px; line-height: 1; padding: 6px 12px 5px; border-radius: 6px 4px 7px 3px; cursor: pointer; }
.jbtn:hover { background: rgba(42,38,34,.07); }
.jbtn.k { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .14em; border: 0; color: rgba(42,38,34,.55); padding: 6px 4px; }
.jcard .sum { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: .12em; color: rgba(42,38,34,.55); }
/* 도움말 */
.jam-help { position: absolute; right: max(14px, env(safe-area-inset-right)); top: max(12px, env(safe-area-inset-top)); z-index: 3; width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid rgba(239,233,220,.45); background: rgba(0,0,0,.2); color: #efe9dc; font: 700 15px 'Space Grotesk', sans-serif; cursor: pointer; }
.jam-help[aria-pressed="true"] { background: #efe9dc; color: #121110; }
.jam-notes { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.jam-notes p { position: absolute; margin: 0; width: min(240px, 60vw); padding: 12px 14px 14px; background: #fff27a; color: #2a2622; font-family: 'Nanum Pen Script', cursive; font-size: 22px; line-height: 1.12; box-shadow: 0 10px 18px rgba(0,0,0,.45); transform: rotate(var(--r)); animation: pdrop .55s cubic-bezier(.2,.9,.25,1.2) both; animation-delay: var(--d); pointer-events: auto; }
/* 곡 찾기 */
.jfind { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; background: rgba(0,0,0,.55); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
.jfind .box { width: min(520px, calc(100vw - 28px)); max-height: min(640px, calc(100dvh - 40px)); display: flex; flex-direction: column; background: #f4efe3; color: #2a2622; border-radius: 4px; box-shadow: 0 30px 60px rgba(0,0,0,.6); overflow: hidden; animation: pdrop .45s cubic-bezier(.2,.9,.25,1.1) both; --r: -.5deg; --r0: -4deg; }
.jfind .row { display: flex; gap: 8px; padding: 14px; border-bottom: 1.5px solid rgba(42,38,34,.4); align-items: center; }
.jfind input { flex: 1; min-width: 0; border: 0; background: transparent; font-family: 'Nanum Pen Script', cursive; font-size: 28px; color: #2a2622; outline: none; }
.jfind .tabs { display: flex; gap: 4px; }
.jfind .tabs button { appearance: none; border: 0; background: none; font-family: 'Nanum Pen Script', cursive; font-size: 22px; color: rgba(42,38,34,.5); cursor: pointer; padding: 2px 6px; }
.jfind .tabs button[aria-pressed="true"] { color: #2a2622; text-decoration: underline 2px; text-underline-offset: 4px; }
.jfind ul { list-style: none; margin: 0; padding: 6px 0; overflow-y: auto; }
.jfind li { display: flex; gap: 12px; align-items: center; padding: 8px 14px; cursor: pointer; }
.jfind li:hover, .jfind li:focus-visible { background: rgba(42,38,34,.07); outline: none; }
.jfind li i { width: 44px; height: 44px; flex: none; background: #ccc center/cover; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.jfind li div { min-width: 0; flex: 1; }
.jfind li b { display: block; font-family: 'Nanum Pen Script', cursive; font-weight: 400; font-size: 24px; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jfind li small { display: block; font-size: 12px; color: rgba(42,38,34,.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jfind li .plus { font-family: 'Nanum Pen Script', cursive; font-size: 26px; color: #c8402e; }
.jfind .empty { padding: 26px 16px; text-align: center; font-family: 'Nanum Pen Script', cursive; font-size: 22px; color: rgba(42,38,34,.55); }
.jfind .x { appearance: none; border: 0; background: none; font-size: 22px; cursor: pointer; color: rgba(42,38,34,.6); }
/* 세로 화면 · 폰: 데크 위, J카드 아래 */
@media (max-aspect-ratio: 5/4) {
  .jam { grid-template-columns: 1fr; grid-template-rows: minmax(0, 46fr) minmax(0, 54fr); gap: 10px; }
  .jcard { align-self: stretch; max-height: none; }
  .jam-pola { width: min(26%, 140px); top: 10%; }
  .jcard h2 { font-size: 32px; }
}
@media (prefers-reduced-motion: reduce) { .jam, .jam *, .jam *::before, .jam *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
`;

function mount() {
  if ($('jam')) return;
  if (!document.querySelector('link[data-jam-font]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.jamFont = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&display=swap'; document.head.appendChild(l);
  }
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div');
  el.id = 'jam'; el.className = 'jam'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '잼 모드');
  el.innerHTML = `
    <div class="jam-stage" id="jamStage"><canvas id="jamCv" aria-label="카세트 라디오: 건반을 눌러 조작"></canvas>
      <div class="jam-k"><span class="rec"></span><span id="jamK">JAM SESSION</span></div>
      <div class="jam-pola" id="jamPola"></div></div>
    <aside class="jcard" aria-label="셋리스트">
      <div class="band"></div>
      <header><h2 id="jamTitle">JAM</h2><small id="jamDate"></small></header>
      <ol class="jlist" id="jamList"></ol>
      <footer><button class="jbtn" id="jamAdd" type="button">+ 곡 넣기</button><button class="jbtn" id="jamShare" type="button">친구 부르기</button><span class="sum" id="jamSum"></span><button class="jbtn k" id="jamEnd" type="button">잼 끝 ⏏</button></footer>
    </aside>
    <button class="jam-help" id="jamHelp" type="button" aria-pressed="false" aria-label="잼 모드 도움말">?</button>
    <div class="jam-notes" id="jamNotes" hidden></div>
    <div class="jfind" id="jamFind" hidden><div class="box">
      <div class="row"><input id="jamQ" type="search" placeholder="곡이나 앨범 이름" autocomplete="off" enterkeyhint="search"><div class="tabs"><button type="button" data-t="track" aria-pressed="true">곡</button><button type="button" data-t="album" aria-pressed="false">앨범 통째로</button></div><button class="x" id="jamFindX" type="button" aria-label="닫기">×</button></div>
      <ul id="jamRes"><li class="empty">적을 곡을 찾아 보세요</li></ul></div></div>`;
  document.body.appendChild(el);
  wire();
}

// ---------- 효과음 (Web Audio 합성. 음악 앱의 효과음 설정 music.sfx를 따른다) ----------
const sfx = (() => {
  let ctx = null, nb = null;
  function get() {
    if (C.LS.get('music.sfx') === false) return null;
    try {
      if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  }
  function noise(t0, dur, type, f0, f1, gain, q = 1) {
    const c = get(); if (!c) return;
    const s = c.createBufferSource(); s.buffer = nb; const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, c.currentTime + t0); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime + t0); g.gain.exponentialRampToValueAtTime(gain, c.currentTime + t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(c.currentTime + t0, Math.random() * 0.5); s.stop(c.currentTime + t0 + dur + 0.05);
  }
  function tone(t0, dur, f0, f1, gain, type = 'sine') {
    const c = get(); if (!c) return;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, c.currentTime + t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime + t0); g.gain.exponentialRampToValueAtTime(gain, c.currentTime + t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
  }
  return {
    unlock: get,
    key() { noise(0, 0.05, 'bandpass', 2400, 900, 0.5, 2); tone(0, 0.09, 180, 70, 0.35); noise(0.05, 0.04, 'highpass', 3000, 2000, 0.12); },
    light() { noise(0, 0.03, 'highpass', 5000, 3000, 0.4); tone(0, 0.05, 900, 300, 0.12, 'square'); },
    spot() { tone(0, 0.5, 70, 40, 0.5); noise(0, 0.35, 'lowpass', 900, 120, 0.25); },
    door() { tone(0, 0.22, 520, 260, 0.08, 'triangle'); noise(0, 0.12, 'bandpass', 1800, 600, 0.25, 3); },
    seat() { tone(0, 0.08, 140, 80, 0.45); noise(0, 0.05, 'bandpass', 1400, 500, 0.3, 2); },
    close() { noise(0, 0.04, 'bandpass', 3000, 1200, 0.5, 3); tone(0, 0.06, 260, 120, 0.3); },
    eject() { tone(0, 0.3, 300, 900, 0.07, 'triangle'); noise(0, 0.08, 'bandpass', 2000, 700, 0.4, 2); },
    whirr() { tone(0, 0.5, 300, 900, 0.05, 'sawtooth'); noise(0, 0.5, 'bandpass', 1200, 3500, 0.06, 4); },
    pen(n = 1) { for (let i = 0; i < n * 5; i++) noise(i * 0.075 + Math.random() * 0.02, 0.06, 'bandpass', 3800 + Math.random() * 2000, 2500, 0.05 + Math.random() * 0.03, 3); },
    tape() { noise(0, 0.12, 'lowpass', 700, 200, 0.25); },
  };
})();

// ---------- 상태 ----------
const J = {
  on: false, deck: null, cur: null,   // cur = { id, tape, at, name, replay }
  items: [], seen: new Set(), me: null, names: new Map(), started: false,
  pollT: 0, tickT: 0, lastUri: '', endArm: 0, busy: false, find: { t: 'track', q: '', seq: 0 },
};
const load = () => C.LS.get('music.jam');
const save = () => C.LS.set('music.jam', J.cur);

async function deck() {
  if (J.deck) return J.deck;
  J.deck = await createBoombox($('jamCv'), BASE);
  J.deck.onKey = onKey;
  J.deck.onDoor = () => note('문은 STOP/EJ로 열립니다 — 멈춘 채 두 번 누르면 잼 끝', 2600);
  return J.deck;
}

function note(msg, ms) { C.toast(msg, ms); }

// ---------- 시작 · 이어 하기 · 다시 듣기 ----------
export async function start() {
  if (J.on || J.busy) return;
  if (!C.loggedIn()) { C.openDlg(); return; }
  if (!C.hasScope('playlist-modify-private')) {
    if (confirm('잼은 Spotify 플레이리스트를 만들고 곡을 넣어야 해서, 권한을 한 번 더 받아야 합니다. 다시 로그인할까요?')) C.relogin();
    return;
  }
  J.busy = true; sfx.unlock();
  try {
    mount(); await lightsOff();
    const d = today();
    let pl;
    const body = { name: 'JAM ' + d.md, public: false, collaborative: true, description: 'Sabathia JAM · ' + d.ymd };
    try { pl = await C.api('/me/playlists', { method: 'POST', body }); } catch (e) {
      const me = await me_(); if (!me) throw e;
      pl = await C.api('/users/' + encodeURIComponent(me.id) + '/playlists', { method: 'POST', body });
    }
    if (!pl || !pl.id) throw new Error('플레이리스트를 만들지 못했습니다');
    const tape = tapeFor(pl.id, C.LS.get('music.jamTape'));
    C.LS.set('music.jamTape', tape);
    J.cur = { id: pl.id, tape, at: Date.now(), name: pl.name || body.name, replay: false };
    save();
    await enter(true);
  } catch (e) {
    C.toast('잼을 시작하지 못했습니다: ' + (e.message || e), 6000);
    await lightsOn();
  } finally { J.busy = false; }
}
// 새로고침 뒤 이어 하기
export async function resume() {
  const c = load(); if (!c || !c.id || J.on) return;
  J.cur = c; mount(); await lightsOff(true); await enter(false);
}
// JAM 크레이트의 테이프 다시 듣기
export async function replay(a) {
  if (J.on || J.busy || !a || !a.id) return;
  J.busy = true; sfx.unlock();
  try { J.cur = { id: a.id, tape: a.t || tapeFor(a.id), at: Date.now(), name: a.name || 'JAM', replay: true }; save(); mount(); await lightsOff(); await enter(true, true); }
  finally { J.busy = false; }
}
export const active = () => J.on;

async function lightsOff(quick) {
  const el = $('jam'); el.hidden = false; J.on = true; document.body.classList.add('jamming'); window.MusicJamOn = true;
  if (!quick) sfx.light();
  await sleep(30); el.classList.add('on');
  await sleep(quick ? 100 : 750);
  if (!quick) sfx.spot();
  el.classList.add('lit');
}
async function lightsOn() {
  const el = $('jam'); if (!el) return;
  el.classList.remove('lit', 'recording'); await sleep(250);
  sfx.light(); el.classList.remove('on'); await sleep(700);
  el.hidden = true; J.on = false; document.body.classList.remove('jamming'); window.MusicJamOn = false;
}

async function enter(animate, autoplay) {
  const c = J.cur, d = await deck();
  const dt = new Date(c.at);
  $('jamTitle').textContent = c.name || 'JAM';
  $('jamDate').innerHTML = `SIDE A · ${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}<br>${c.replay ? 'PLAYBACK' : 'C-90 · REC'}`;
  $('jamK').textContent = c.replay ? 'JAM · PLAYBACK' : 'JAM SESSION · REC';
  $('jamShare').hidden = !!c.replay;
  try { const sh = await (await fetch(BASE + 'tapes/shell.json')).json(); document.querySelector('.jcard').style.setProperty('--tape', sh[c.tape] || '#c8402e'); } catch {}
  J.items = []; J.seen = new Set(); J.lastUri = ''; J.started = false; $('jamPola').innerHTML = ''; renderList();
  if (animate) await d.insert(c.tape, (k) => sfx[k] && sfx[k]()); else d.setTape(c.tape);
  if (!c.replay) { d.latch('REC', true); $('jam').classList.add('recording'); }
  await refresh(true);
  if (autoplay && J.items.length) playFrom(0);
  else if (!J.items.length && !c.replay) setTimeout(() => { if (J.on && !J.items.length) { J.autoHelp = true; toggleHelp(true); } }, 900);
  loop();
}

// ---------- 플레이리스트 읽기 ----------
async function me_() { if (J.me) return J.me; try { J.me = await C.api('/me'); } catch {} return J.me; }
async function items(id) {
  for (const path of ['/items', '/tracks']) {
    try {
      const out = []; let url = '/playlists/' + id + path + '?limit=50';
      while (url && out.length < 500) { const j = await C.api(url); out.push(...((j && j.items) || [])); url = j && j.next ? j.next.replace('https://api.spotify.com/v1', '') : ''; }
      return out.map((x) => { const t = x && (x.item || x.track); return t && t.uri ? { uri: t.uri, name: t.name, artist: (t.artists || []).map((a) => a.name).join(', '), img: ((t.album && t.album.images) || []).slice(-2)[0]?.url || ((t.album && t.album.images) || [])[0]?.url || '', big: ((t.album && t.album.images) || [])[0]?.url || '', ms: t.duration_ms || 0, by: x.added_by && x.added_by.id } : null; }).filter(Boolean);
    } catch (e) { if (e.status && e.status !== 404 && e.status !== 403) throw e; }
  }
  return [];
}
async function nameOf(id) {
  if (!id) return '';
  const me = await me_(); if (me && me.id === id) return '';
  if (J.names.has(id)) return J.names.get(id);
  J.names.set(id, '친구');
  try { const u = await C.api('/users/' + encodeURIComponent(id)); if (u && u.display_name) J.names.set(id, u.display_name); } catch {}
  return J.names.get(id);
}
async function refresh(first) {
  if (!J.cur) return;
  let list; try { list = await items(J.cur.id); } catch { return; }
  const fresh = [];
  list.forEach((x, i) => { const k = x.uri + '#' + i; if (!J.seen.has(k)) { J.seen.add(k); if (!first) fresh.push(i); } });
  for (const x of list) if (x.by) x.byName = await nameOf(x.by);
  const grew = list.length > J.items.length;
  J.items = list; renderList(first ? null : new Set(fresh));
  if (fresh.length) sfx.pen(Math.min(3, fresh.length));
  if (list.length && $('jamHelp').getAttribute('aria-pressed') === 'true' && J.autoHelp) { J.autoHelp = false; toggleHelp(false); }
  // 첫 곡이 들어오면 바로 녹음 겸 재생 시작
  if (grew && !J.started && !J.cur.replay && !playingOurs()) playFrom(0);
}

// ---------- 재생 ----------
const ctxUri = () => 'spotify:playlist:' + J.cur.id;
function playingOurs() { const s = C.state(); return !!(s && s.context && s.context.uri === ctxUri() && s.is_playing); }
function curIndex() {
  const s = C.state(); if (!s || !s.item || !s.context || s.context.uri !== ctxUri()) return -1;
  const i = J.items.findIndex((x) => x.uri === s.item.uri); return i;
}
async function playFrom(i) {
  try {
    C.wake(); const dev = await C.targetDevice();
    await C.api('/me/player/play?device_id=' + dev, { method: 'PUT', body: { context_uri: ctxUri(), offset: { position: i } } });
    J.started = true; C.poll(500);
  } catch (e) { C.toast(e.message || String(e)); }
}
async function cmd(path, method = 'POST') { try { await C.api(path, { method }); } catch (e) { C.toast(e.message || String(e)); } C.poll(500); }

async function onKey(k) {
  const d = J.deck; sfx.key();
  const s = C.state(), ours = s && s.context && s.context.uri === ctxUri();
  if (k === 'PLAY') {
    d.tap('PLAY');
    if (!J.items.length) { note('먼저 J카드 빈 줄에 곡을 적으세요'); return; }
    if (ours && s.item) { await cmd('/me/player/play', 'PUT'); } else await playFrom(Math.max(0, curIndex()));
  } else if (k === 'PAUSE') {
    if (s && s.is_playing && ours) { d.latch('PAUSE', true); await cmd('/me/player/pause', 'PUT'); }
    else { d.latch('PAUSE', false); if (ours) await cmd('/me/player/play', 'PUT'); }
  } else if (k === 'FF' || k === 'REW') {
    d.tap(k); sfx.whirr();
    if (ours) await cmd(k === 'FF' ? '/me/player/next' : '/me/player/previous');
  } else if (k === 'REC') {
    d.tap('REC');
    note(J.cur.replay ? '다시 듣는 테이프입니다. 곡을 더 넣으면 이 잼에 같이 적힙니다' : '녹음 중 — 들어오는 곡이 모두 이 테이프에 남습니다', 3000);
  } else if (k === 'STOP/EJ') {
    d.tap('STOP/EJ');
    if (s && s.is_playing && ours) { await cmd('/me/player/pause', 'PUT'); J.endArm = Date.now(); note('멈췄습니다. 한 번 더 누르면 잼을 끝내고 테이프를 꺼냅니다', 3000); return; }
    if (Date.now() - J.endArm < 4000) { end(); return; }
    J.endArm = Date.now(); note('한 번 더 누르면 잼을 끝내고 테이프를 꺼냅니다', 3000);
  }
}

// ---------- 잼 끝: 테이프가 튀어나와 JAM 크레이트로 ----------
async function end() {
  if (!J.on || J.busy) return;
  J.busy = true;
  clearTimeout(J.pollT); clearInterval(J.tickT);
  try {
    if (playingOurs()) C.api('/me/player/pause', { method: 'PUT' }).catch(() => {});
    toggleHelp(false); $('jamFind').hidden = true;
    const d = J.deck; for (const k of ['REC', 'PLAY', 'PAUSE']) d.latch(k, false); d.setPlaying(false);
    $('jam').classList.remove('recording');
    await d.eject((k) => sfx[k] && sfx[k]());
    const c = J.cur;
    if (J.items.length) {
      const dt = new Date(c.at), ymd = `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
      const who = new Set(J.items.map((x) => x.byName).filter(Boolean));
      C.saveJam({ id: c.id, k: 'pl', name: c.name, artist: `${J.items.length}곡${who.size ? ' · ' + [...who].slice(0, 3).join(', ') : ''}`, img: (J.items[0] && J.items[0].big) || '', year: ymd, n: J.items.length, t: c.tape });
      if (!c.replay) C.toast('테이프를 JAM 크레이트에 꽂았습니다', 3500);
    } else if (!c.replay) C.toast('곡이 없어 테이프를 남기지 않았습니다(플레이리스트는 Spotify에 남아 있습니다)', 5000);
    C.LS.del('music.jam'); J.cur = null;
    await lightsOn();
  } finally { J.busy = false; }
}

// ---------- 지금 곡 · 릴 · 폴라로이드 ----------
function loop() {
  clearTimeout(J.pollT); clearInterval(J.tickT);
  const poll = async () => { if (!J.on || !J.cur) return; if (document.visibilityState === 'visible') await refresh(false); J.pollT = setTimeout(poll, 4000); };
  J.pollT = setTimeout(poll, 4000);
  J.tickT = setInterval(tick, 250); tick();
}
function tick() {
  if (!J.on || !J.cur || !J.deck) return;
  const s = C.state(), ours = !!(s && s.context && s.context.uri === ctxUri());
  const on = ours && s.is_playing;
  J.deck.setPlaying(on);
  J.deck.latch('PLAY', on);
  if (on) J.deck.latch('PAUSE', false);
  const i = curIndex();
  if (ours && i >= 0) {
    J.started = true;
    const total = J.items.reduce((a, x) => a + x.ms, 0) || 1;
    let pos = s.progress_ms || 0; if (s.is_playing) pos += Date.now() - s.at;
    const before = J.items.slice(0, i).reduce((a, x) => a + x.ms, 0);
    J.deck.setProgress((before + Math.min(pos, J.items[i].ms)) / total);
    if (J.items[i].uri !== J.lastUri) { J.lastUri = J.items[i].uri; pola(J.items[i]); renderList(); }
  }
  const tot = J.items.reduce((a, x) => a + x.ms, 0);
  $('jamSum').textContent = J.items.length ? `${J.items.length}곡 · ${fmt(tot)}` : '';
}
function pola(x) {
  const box = $('jamPola'); if (!box) return;
  for (const o of box.children) o.classList.add('old');
  while (box.children.length > 2) box.firstChild.remove();
  const p = document.createElement('div'); p.className = 'pola';
  const r = (Math.random() * 10 - 5).toFixed(1); p.style.setProperty('--r', r + 'deg'); p.style.setProperty('--r0', (r * 3) + 'deg');
  p.innerHTML = `<i style="background-image:url('${esc(x.big || x.img)}')"></i><b>${esc(x.name)}</b>`;
  box.appendChild(p); sfx.tape();
  setTimeout(() => { for (const o of [...box.querySelectorAll('.old')]) o.remove(); }, 900);
}

// ---------- J카드 ----------
function renderList(fresh) {
  const ul = $('jamList'); if (!ul) return;
  const ci = curIndex();
  const rows = J.items.map((x, i) => `<li class="${i === ci ? 'cur' : ci > i ? 'done' : ''}${fresh && fresh.has(i) ? ' new' : ''}" data-i="${i}" tabindex="0" title="이 곡부터 듣기"><span class="no">${i + 1}</span><span class="w">${esc(x.name)} <em>— ${esc(x.artist)}</em></span>${x.byName ? `<span class="by">${esc(x.byName)}</span>` : ''}<span class="d">${fmt(x.ms)}</span></li>`);
  const pend = J.pend ? J.pend.map((n) => `<li class="pend"><span class="no">·</span><span class="w">${esc(n)} …</span></li>`) : [];
  ul.innerHTML = rows.join('') + pend.join('') + `<li class="add" data-add="1" tabindex="0"><span class="no">${J.items.length + 1}</span><span class="w">+ 여기를 눌러 곡 적기</span></li>` + '<li aria-hidden="true"></li>'.repeat(Math.max(0, 6 - J.items.length));
  const c = ul.querySelector('li.cur'); if (c && !fresh) c.scrollIntoView({ block: 'nearest' });
  if (fresh && fresh.size) { const n = ul.querySelector('li.new:last-of-type') || ul.querySelector('li.new'); n && n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

// ---------- 곡 찾기 · 넣기 ----------
function openFind() {
  $('jamFind').hidden = false; const q = $('jamQ'); q.value = J.find.q; setTimeout(() => q.focus(), 50);
  if (J.find.q) search();
}
let findT = 0;
async function search() {
  const q = $('jamQ').value.trim(); J.find.q = q; const seq = ++J.find.seq, ul = $('jamRes');
  if (!q) { ul.innerHTML = '<li class="empty">적을 곡을 찾아 보세요</li>'; return; }
  ul.innerHTML = '<li class="empty">찾는 중…</li>';
  try {
    const t = J.find.t, j = await C.api(`/search?type=${t}&limit=10&q=${encodeURIComponent(q)}`);
    if (seq !== J.find.seq) return;
    const L = ((j && j[t + 's'] && j[t + 's'].items) || []).filter(Boolean);
    if (!L.length) { ul.innerHTML = '<li class="empty">못 찾았습니다</li>'; return; }
    ul.innerHTML = L.map((x, i) => {
      const imgs = (t === 'track' ? x.album && x.album.images : x.images) || [];
      const sub = t === 'track' ? `${(x.artists || []).map((a) => a.name).join(', ')} · ${fmt(x.duration_ms)}` : `${(x.artists || []).map((a) => a.name).join(', ')} · ${x.total_tracks || ''}곡 · ${(x.release_date || '').slice(0, 4)}`;
      return `<li tabindex="0" data-i="${i}"><i style="background-image:url('${esc((imgs.slice(-2)[0] || imgs[0] || {}).url || '')}')"></i><div><b>${esc(x.name)}</b><small>${esc(sub)}</small></div><span class="plus">${t === 'album' ? '+ 통째로' : '+'}</span></li>`;
    }).join('');
    ul.onclick = (ev) => { const li = ev.target.closest('li[data-i]'); if (li) add(L[+li.dataset.i], t); };
    ul.onkeydown = (ev) => { if (ev.key === 'Enter') { const li = ev.target.closest('li[data-i]'); if (li) add(L[+li.dataset.i], t); } };
  } catch (e) { if (seq === J.find.seq) ul.innerHTML = `<li class="empty">${esc(e.message || '찾지 못했습니다')}</li>`; }
}
async function add(x, t) {
  if (!x || !J.cur) return;
  $('jamFind').hidden = true;
  let uris = [], label = x.name;
  try {
    if (t === 'album') { const j = await C.api('/albums/' + x.id + '/tracks?limit=50'); uris = ((j && j.items) || []).map((y) => y.uri).filter(Boolean); label = x.name + ` (${uris.length}곡)`; }
    else uris = [x.uri];
    if (!uris.length) return;
    J.pend = [...(J.pend || []), label]; renderList();
    let ok = false;
    for (const path of ['/items', '/tracks']) {
      try { await C.api('/playlists/' + J.cur.id + path, { method: 'POST', body: { uris: uris.slice(0, 100) } }); ok = true; break; } catch (e) { if (e.status !== 404) throw e; }
    }
    if (!ok) throw new Error('곡을 넣지 못했습니다');
  } catch (e) { C.toast(e.status === 403 ? '이 플레이리스트에 곡을 넣을 권한이 없습니다' : (e.message || String(e))); }
  J.pend = (J.pend || []).filter((n) => n !== label);
  await refresh(false);
}

// ---------- 친구 부르기 · 도움말 ----------
async function share() {
  if (!J.cur) return;
  const url = 'https://open.spotify.com/playlist/' + J.cur.id;
  try {
    if (navigator.share) await navigator.share({ title: J.cur.name, text: '같이 잼 하자 — 이 플레이리스트에 곡을 넣어 줘', url });
    else { await navigator.clipboard.writeText(url); C.toast('링크를 복사했습니다'); }
  } catch {}
  C.toast('친구가 곡을 넣으려면 Spotify 앱에서 이 플레이리스트의 "공동 작업자 초대"로 불러야 합니다', 6500);
}
const NOTES = [
  ['J카드 빈 줄을 누르면 곡 적기. "앨범 통째로"도 됩니다', '6%', '58%', -3, 0],
  ['친구는 Spotify 앱에서 이 플레이리스트에 곡을 넣으면 여기 손글씨로 적혀요', '34%', '62%', 2, 0.08],
  ['PLAY 재생 · PAUSE 잠깐 · FF 다음 곡 · REW 이전 곡', '8%', '14%', 2.5, 0.16],
  ['STOP/EJ로 멈춘 뒤 한 번 더 = 잼 끝. 테이프는 JAM 크레이트에 꽂혀요', '36%', '10%', -2, 0.24],
  ['J카드의 곡을 누르면 그 곡부터 다시', '62%', '74%', 3, 0.32],
];
function toggleHelp(on) {
  const b = $('jamHelp'), box = $('jamNotes'); if (!b) return;
  on = on ?? b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on)); box.hidden = !on;
  box.innerHTML = on ? NOTES.map(([t, x, y, r, d]) => `<p style="left:${x};top:${y};--r:${r}deg;--r0:${r * 4}deg;--d:${d}s">${esc(t)}</p>`).join('') : '';
  if (on) sfx.pen(1);
}

function wire() {
  $('jamList').addEventListener('click', (ev) => {
    const li = ev.target.closest('li'); if (!li) return;
    if (li.dataset.add) { openFind(); return; }
    if (li.dataset.i != null) { sfx.key(); playFrom(+li.dataset.i); }
  });
  $('jamList').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.target.click(); });
  $('jamAdd').onclick = openFind;
  $('jamShare').onclick = share;
  $('jamEnd').onclick = () => { if (Date.now() - J.endArm < 4000) end(); else { J.endArm = Date.now(); note('한 번 더 누르면 잼을 끝내고 테이프를 꺼냅니다', 3000); } };
  $('jamHelp').onclick = () => toggleHelp();
  $('jamNotes').addEventListener('click', () => toggleHelp(false));
  $('jamFindX').onclick = () => { $('jamFind').hidden = true; };
  $('jamFind').addEventListener('click', (ev) => { if (ev.target.id === 'jamFind') $('jamFind').hidden = true; });
  $('jamQ').addEventListener('input', () => { clearTimeout(findT); findT = setTimeout(search, 350); });
  $('jamQ').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { clearTimeout(findT); search(); } if (ev.key === 'Escape') $('jamFind').hidden = true; });
  for (const b of document.querySelectorAll('#jamFind .tabs button')) b.onclick = () => {
    J.find.t = b.dataset.t; for (const x of document.querySelectorAll('#jamFind .tabs button')) x.setAttribute('aria-pressed', String(x === b)); search();
  };
  document.addEventListener('keydown', (ev) => {
    if (!J.on || ev.target.closest && ev.target.closest('input')) return;
    if (ev.key === ' ') { ev.preventDefault(); onKey(playingOurs() ? 'PAUSE' : 'PLAY'); }
    else if (ev.key === 'ArrowRight') onKey('FF'); else if (ev.key === 'ArrowLeft') onKey('REW');
    else if (ev.key === '?') toggleHelp();
    else if (ev.key === 'Escape') { if (!$('jamFind').hidden) $('jamFind').hidden = true; else if ($('jamHelp').getAttribute('aria-pressed') === 'true') toggleHelp(false); }
  });
}

window.MusicJam = { start, resume, replay, active };
