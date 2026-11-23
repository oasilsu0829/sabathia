/* Sabathia 공통 스크립트. 모든 앱 페이지가 <script src="/sabathia.js"> 로 불러온다.
   - 런처(안드로이드 WebView)의 뒤로가기·홈 버튼: 앱이 Sabathia.back 으로 시트를 닫고, 닫을 게 없으면 홈으로
   - 앱 상태 보고: 홈 아이콘의 진행률·배지. localStorage 'sabathia.status.<id>' 에 오늘 날짜와 함께 저장
   - 서비스 워커: /sw.js 하나가 전체 주소를 맡는다
   - 업데이트 확인: 새로 배포되면 위쪽 띠로 알리고 누르면 새로 받아 새로고침 */
(() => {
  'use strict';
  const S = (window.Sabathia = window.Sabathia || {});
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const atHome = location.pathname === '/' || location.pathname === '/index.html';

  S.today = today;
  S.home = () => { if (!atHome) location.href = '/'; };
  S.report = (id, data) => {
    try { localStorage.setItem('sabathia.status.' + id, JSON.stringify({ ...data, date: today(), at: Date.now() })); } catch {}
  };
  // 오늘 보고한 값만 돌려준다. 어제 값은 null
  S.read = (id) => {
    try {
      const v = JSON.parse(localStorage.getItem('sabathia.status.' + id));
      return v && v.date === today() ? v : null;
    } catch { return null; }
  };

  if (!atHome) {
    window.onJarvisBack = () => { if (typeof S.back === 'function' && S.back()) return; S.home(); };
    window.onJarvisHome = S.home;
  }

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  /* ---------- 업데이트 확인 ----------
     /api/version(배포 id)을 열 때·화면으로 돌아올 때·30분마다 본다. 이 기기가 마지막으로 받은 id(sabathia.ver)와
     다르면 위쪽에 '새 버전' 띠. 누르면 지금 화면과 공통 파일을 네트워크에서 다시 받아(서비스 워커 캐시도 갱신) 새로고침.
     처음 보는 기기는 지금 id를 받은 것으로 친다. S.checkUpdate(true)는 버튼용: 결과를 띠로 알려 준다 */
  const VER = 'sabathia.ver';
  const COMMON = ['/sabathia.js', '/theme.css', '/apps.js', '/today.js'];
  let latest = null, bar = null, lastCheck = 0;
  const getVer = () => { try { return localStorage.getItem(VER); } catch { return null; } };
  const setVer = (v) => { try { localStorage.setItem(VER, v); } catch {} };
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  function showBar(text, action) {
    if (!document.body) return;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'sabUpd'; bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:6px;width:max-content;max-width:calc(100vw - 24px);white-space:nowrap;padding:8px 8px 8px 16px;border-radius:999px;background:#191c1e;color:#fff;font:600 14px/20px Inter,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.18)';
      document.body.appendChild(bar);
    }
    bar.innerHTML = '';
    const t = document.createElement('span'); t.style.cssText = 'overflow:hidden;text-overflow:ellipsis;margin-right:4px'; t.textContent = text; bar.appendChild(t);
    const btn = (label, fn, main) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = `flex:none;border:0;border-radius:999px;padding:6px 14px;font:inherit;cursor:pointer;${main ? 'background:#004ac6;color:#fff' : 'background:transparent;color:#c4c6d0'}`; b.onclick = fn; bar.appendChild(b); };
    if (action) btn('새로고침', action, true);
    btn(action ? '나중에' : '닫기', hideBar, false);
  }
  function hideBar() { if (bar) { bar.remove(); bar = null; } }

  async function apply() {
    if (bar) bar.firstChild.textContent = '받는 중…';
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update().catch(() => {});
      await Promise.all([location.pathname, ...COMMON].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
    } catch {}
    if (latest) setVer(latest.id);
    location.reload();
  }

  S.checkUpdate = async (manual) => {
    lastCheck = Date.now();
    try {
      const r = await fetch('/api/version', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      latest = await r.json();
    } catch {
      if (manual) showBar('확인하지 못했어요. 인터넷 연결을 확인하세요');
      return null;
    }
    const mine = getVer();
    if (!mine) { setVer(latest.id); if (manual) showBar('최신 버전이에요'); return false; }
    if (mine !== latest.id) { showBar(`새 버전${latest.at ? ' · ' + when(latest.at) : ''}`, apply); return true; }
    if (manual) showBar(`최신 버전이에요${latest.at ? ' · ' + when(latest.at) : ''}`);
    return false;
  };

  if (navigator.onLine !== false) addEventListener('load', () => setTimeout(() => S.checkUpdate(false), 1500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > 5 * 60e3) S.checkUpdate(false); });
  setInterval(() => { if (!document.hidden) S.checkUpdate(false); }, 30 * 60e3);
})();
