const CACHE = 'feelz-v7';
const OFFLINE_URL = '/player/index.html';

const PRECACHE = [
  '/player/',
  '/player/index.html',
  '/logo.png',
  '/icon.png',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(OFFLINE_URL)
          .then(r => r || caches.match('/player/'))
          .then(r => r || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
      )
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() =>
        cached || new Response('Not available offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      );
    })
  );
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { payload = { title: 'Feelz Machine', body: e.data.text() }; }

  const { title, body, icon, url, tag } = payload;
  e.waitUntil(
    self.registration.showNotification(title || 'Feelz Machine', {
      body:    body || '',
      icon:    icon || '/icon-192.png',
      badge:   '/icon-192.png',
      tag:     tag || 'feelz-notif',
      data:    { url: url || '/' },
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(target); }
      else clients.openWindow(target);
    })
  );
});