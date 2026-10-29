// Sabathia 서비스 워커. 주소 전체(/)를 맡는다: 홈, 15577, 어원 단어, 일정, 사진 PDF.
// 앱 파일은 네트워크를 먼저 쓰고 실패하면 캐시로 연다(오프라인). 글꼴은 캐시 우선. /api/ 는 건드리지 않는다.
const VERSION = 'sabathia-v4';
const SHELL = ['/', '/sabathia.js', '/apps.js', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit || caches.match('/')))
  );
});

// 웹 푸시 (서버 cron이 보낸다)
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: 'Sabathia', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: '/icon-192.png', badge: '/icon-192.png', vibrate: [100, 50, 100],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((cs) => cs.length ? cs[0].focus() : clients.openWindow('/')));
});
