// ── Feelz Machine Service Worker ─────────────────────────────────────────────
const CACHE_VERSION = 'feelz-v9';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/logo.png',
  '/icon-192.png',
  '/manifest.json',
];

const NEVER_CACHE_ORIGINS = [
  'supabase.co', 'supabase.com', 'anthropic.com', 'paypal.com',
  'googleapis.com', 'google.com', 'fcm.googleapis.com', 'web.push.apple.com',
];

const NEVER_CACHE_PATHS = ['/.netlify/functions/', '/auth/'];

function shouldNeverCache(url) {
  if (NEVER_CACHE_ORIGINS.some(o => url.hostname.includes(o))) return true;
  if (url.origin === self.location.origin && NEVER_CACHE_PATHS.some(p => url.pathname.startsWith(p))) return true;
  return false;
}

function isHashedAsset(url) {
  return /\.[0-9a-f]{8,}\.(js|css|woff2?)$/i.test(url.pathname);
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }).then(cs =>
        cs.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }))
      ))
  );
});

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data === 'SKIP_WAITING' || e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'CLEAR_CACHE'  || e.data?.type === 'CLEAR_CACHE')
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (shouldNeverCache(url)) return;

  // Navigation: network-first
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res?.status === 200) {
            const toCache = res.clone(); // clone synchronously before async gap
            caches.open(RUNTIME_CACHE).then(c => c.put(req, toCache));
          }
          return res;
        })
        .catch(async () => {
          const r = await caches.match(req) || await caches.match('/index.html') || await caches.match('/offline.html');
          return r || new Response('<h1>Offline</h1>', { status: 503, headers: { 'Content-Type': 'text/html' } });
        })
    );
    return;
  }

  // Hashed JS/CSS: cache-first (immutable)
  if (isHashedAsset(url)) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res?.status === 200) {
          const toCache = res.clone(); // clone synchronously before any async gap
          caches.open(STATIC_CACHE).then(c => c.put(req, toCache));
        }
        return res;
      }))
    );
    return;
  }

  // Same-origin: stale-while-revalidate
  // CRITICAL: always resolve to a valid Response — never undefined
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache  = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);

      // Always fetch fresh in background.
      // Clone BEFORE returning to caller — a Response body can only be read once.
      // We clone first for the cache, then return the original to the browser.
      const networkPromise = fetch(req).then(res => {
        if (res?.status === 200) {
          cache.put(req, res.clone()); // clone goes to cache, original returned below
        }
        return res;
      }).catch(() => null);

      if (cached) {
        // Serve stale immediately; network updates cache in background
        networkPromise.catch(() => {}); // prevent unhandled rejection
        return cached;
      }

      // No cache — wait for network, clone for cache then return original
      const net = await networkPromise;
      if (net?.status === 200) {
        // Already cloned inside networkPromise above — just return the original
        return net;
      }
      if (net) return net; // non-200 pass-through (redirects, etc.)
      return new Response('Not available offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })());
  }
});

// Push
self.addEventListener('push', e => {
  if (!e.data) return;
  let p;
  try { p = e.data.json(); } catch { p = { title: 'Feelz Machine', body: e.data.text() }; }
  e.waitUntil(self.registration.showNotification(p.title || 'Feelz Machine', {
    body: p.body || '', icon: p.icon || '/icon-192.png', badge: '/icon-192.png',
    tag: p.tag || 'feelz-notif', data: { url: p.url || '/' }, vibrate: [100, 50, 100], renotify: true,
  }));
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