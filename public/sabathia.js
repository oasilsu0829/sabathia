/* Sabathia 공통 스크립트. 모든 앱 페이지가 <script src="/sabathia.js"> 로 불러온다.
   - 런처(안드로이드 WebView)의 뒤로가기·홈 버튼: 앱이 Sabathia.back 으로 시트를 닫고, 닫을 게 없으면 홈으로
   - 앱 상태 보고: 홈 아이콘의 진행률·배지. localStorage 'sabathia.status.<id>' 에 오늘 날짜와 함께 저장
   - 서비스 워커: /sw.js 하나가 전체 주소를 맡는다 */
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
})();
