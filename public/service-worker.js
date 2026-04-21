const CACHE = 'feelz-v8';
const OFFLINE_URL = '/player/index.html';

const PRECACHE = [
  '/player/',
  '/player/index.html',
  '/logo.png',
  '/icon.png',
  '/manifest.json',
];

// ── Install: cache shell assets and take over immediately ─────────────────────
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

// ── Activate: wipe ALL old caches, then claim all open clients ────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => {
        console.log('[SW] Deleting old cache:', k);
        return caches.delete(k);
      }))
    ).then(() => self.clients.claim())
  );
});

// ── Message: allow the app to trigger a forced update ─────────────────────────
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});

// ── Fetch: network-first for navigation, cache-first for assets ───────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Navigation requests: always try network first so new deploys are picked up
  // immediately — only fall back to cache when truly offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() =>
          caches.match(e.request)
            .then(r => r || caches.match(OFFLINE_URL))
            .then(r => r || caches.match('/player/'))
            .then(r => r || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
        )
    );
    return;
  }

  // Static assets: cache-first for speed, fall back to network
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
        new Response('Not available offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
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
