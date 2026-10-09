self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: '자비스', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: '/icon-192.png', badge: '/icon-192.png', vibrate: [100, 50, 100],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then((cs) => cs.length ? cs[0].focus() : clients.openWindow('/')));
});
