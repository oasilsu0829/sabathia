// Sabathia 서비스 워커. 주소 전체(/)를 맡는다: 홈, 15577, 어원 단어, 일정, 사진 PDF, 수업 녹음, 장부, 집중, 시험대비, 음악.
// - 앱 파일: 캐시를 먼저 보여 주고 뒤에서 새 파일을 받아 둔다(다음에 열 때 반영). 신호가 약해도 바로 뜨고 오프라인에서도 열린다
// - 새로고침(당겨서 새로고침)과 앱의 "최신 버전 확인"은 네트워크를 먼저 쓴다
// - 설치할 때 모든 앱 화면을 미리 받아 둔다. 한 번도 안 연 앱도 오프라인에서 열린다
// - 글꼴·jsPDF는 따로 캐시해서 VERSION을 올려도 다시 받지 않는다. /api/ 는 건드리지 않는다
// 공통 파일(theme.css, sabathia.js, today.js, apps.js)이나 여러 화면을 함께 고쳤으면 VERSION을 올린다
const VERSION = 'sabathia-v18';
const FONTS = 'sabathia-fonts-1';
const CDN = 'sabathia-cdn-1';
const KEEP = [VERSION, FONTS, CDN];
const SHELL = [
  '/', '/plan/', '/vocab/', '/schedule/', '/pdf/', '/lecture/', '/projects/', '/focus/', '/exam/', '/music/',
  '/theme.css', '/sabathia.js', '/today.js', '/apps.js', '/projects/merge.js', '/exam/merge.js', '/music/merge.js', '/manifest.webmanifest', '/icon-192.png',
];

const storable = (res) => res.ok && res.type === 'basic' && !res.redirected;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // 홈은 꼭 받아야 설치된다. 나머지는 하나가 실패해도 넘어간다(열 때 다시 받는다)
    await Promise.all(SHELL.map(async (u) => {
      try {
        const res = await fetch(new Request(u, { cache: 'reload' }));
        if (storable(res)) await c.put(u, res);
        else if (u === '/') throw new Error('home ' + res.status);
      } catch (err) { if (u === '/') throw err; }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 캐시에 있으면 그것만 쓴다 (주소에 버전이 든 파일: 글꼴 파일, jsPDF)
async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') c.put(req, res.clone());
  return res;
}

// 캐시를 먼저 돌려주고 뒤에서 새로 받아 둔다. 캐시에 없으면 네트워크, 그것도 안 되면 fallback
async function staleWhileRevalidate(e, name, key, matchOpt, keep, fallback) {
  const c = await caches.open(name);
  const hit = await c.match(key, matchOpt);
  const net = fetch(e.request).then((res) => {
    if (keep(res)) return c.put(key, res.clone()).then(() => res, () => res);
    return res;
  });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  try { return await net; } catch (err) {
    const fb = fallback && await fallback();
    if (fb) return fb;
    throw err;
  }
}

async function networkFirst(req, key, matchOpt) {
  const c = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (storable(res)) c.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(key, matchOpt);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.gstatic.com') { e.respondWith(cacheFirst(req, FONTS)); return; }
  if (url.hostname === 'cdnjs.cloudflare.com') { e.respondWith(cacheFirst(req, CDN)); return; }
  if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(staleWhileRevalidate(e, FONTS, req, undefined, (r) => r.ok || r.type === 'opaque'));
    return;
  }

  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // 화면(HTML)은 ?theme=… 같은 꼬리를 떼고 주소 하나로 저장한다
  const nav = req.mode === 'navigate';
  const key = nav ? url.origin + url.pathname : req;
  const opt = nav ? { ignoreSearch: true } : undefined;
  const home = () => (nav ? caches.match('/') : null);

  if (req.cache === 'no-store' || req.cache === 'reload' || req.cache === 'no-cache') {
    e.respondWith(networkFirst(req, key, opt).catch(async (err) => (await home()) || Promise.reject(err)));
    return;
  }
  e.respondWith(staleWhileRevalidate(e, VERSION, key, opt, storable, home));
});

// 웹 푸시 (서버 cron이 보낸다). { title, body, url, tag }
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const opt = {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', vibrate: [100, 50, 100],
    data: { url: d.url || '/' },
  };
  if (d.tag) { opt.tag = d.tag; opt.renotify = true; }
  e.waitUntil(self.registration.showNotification(d.title || 'Sabathia', opt));
});

// 알림을 누르면 열려 있는 Sabathia 창을 그 화면으로 보내고, 없으면 새로 연다
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '/', location.origin).href;
  e.waitUntil((async () => {
    const cs = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = cs.find((x) => x.url === target) || cs[0];
    if (!c) return clients.openWindow(target);
    await c.focus().catch(() => {});
    if (c.url !== target && c.navigate) await c.navigate(target).catch(() => clients.openWindow(target));
  })());
});
