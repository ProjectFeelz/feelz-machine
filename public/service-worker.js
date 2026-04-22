// ── Feelz Machine Service Worker ─────────────────────────────────────────────
// Strategy:
//   - Navigation (HTML):      network-first, offline fallback
//   - Hashed JS/CSS chunks:   cache-first (immutable — hash changes on deploy)
//   - Non-hashed assets:      stale-while-revalidate (serve fast, refresh in bg)
//   - API / Supabase / CDN:   network-only (never cache)
//   - Push notifications:     full handling with click-to-navigate

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

// Origins we never want to cache
const NEVER_CACHE_ORIGINS = [
  'supabase.co',
  'supabase.com',
  'anthropic.com',
  'paypal.com',
  'googleapis.com',
  'google.com',
  'fcm.googleapis.com',
  'web.push.apple.com',
];

// Paths on our own origin we never cache
const NEVER_CACHE_PATHS = [
  '/.netlify/functions/',
  '/auth/',
];

function shouldNeverCache(url) {
  if (NEVER_CACHE_ORIGINS.some(o => url.hostname.includes(o))) return true;
  if (url.origin === self.location.origin && NEVER_CACHE_PATHS.some(p => url.pathname.startsWith(p))) return true;
  return false;
}

// Hashed chunk: filename contains a content hash (8+ hex chars before extension)
function isHashedAsset(url) {
  return /\.[0-9a-f]{8,}\.(js|css|woff2?)$/i.test(url.pathname);
}

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => {
        // Take over immediately — don't wait for existing tabs to close
        self.skipWaiting();
      })
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => {
            console.log('[SW] Removing old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => {
      console.log('[SW] Activated', CACHE_VERSION);
      // Claim all open clients so the new SW controls them immediately
      return self.clients.claim();
    }).then(() => {
      // Tell all open tabs a new version is active
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
      });
    })
  );
});

// ── Messages from the app ─────────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data === 'SKIP_WAITING' || e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data === 'CLEAR_CACHE' || e.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Never intercept non-cacheable origins or paths
  if (shouldNeverCache(url)) return;

  // ── 1. Navigation requests: network-first ──────────────────────────────────
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then(r => r || caches.match('/index.html'))
            .then(r => r || caches.match('/offline.html'))
            .then(r => r || new Response('<h1>Offline</h1>', {
              status: 503,
              headers: { 'Content-Type': 'text/html' },
            }))
        )
    );
    return;
  }

  // ── 2. Hashed JS/CSS chunks: cache-first (immutable) ──────────────────────
  if (isHashedAsset(url)) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then(c => c.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // ── 3. Everything else on our origin: stale-while-revalidate ──────────────
  // Serve cached version instantly, then fetch fresh in background.
  // This is the key fix for iPhone stale cache — user always gets fast response
  // but the cache updates silently for the next load.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const networkFetch = fetch(req).then(res => {
            if (res && res.status === 200) {
              cache.put(req, res.clone());
            }
            return res;
          }).catch(() => cached); // if offline, fall back to what we have

          // Return cached immediately if available, otherwise wait for network
          return cached || networkFetch;
        })
      )
    );
    return;
  }
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); }
  catch { payload = { title: 'Feelz Machine', body: e.data.text() }; }

  const { title, body, icon, url, tag } = payload;
  e.waitUntil(
    self.registration.showNotification(title || 'Feelz Machine', {
      body:    body || '',
      icon:    icon || '/icon-192.png',
      badge:   '/icon-192.png',
      tag:     tag  || 'feelz-notif',
      data:    { url: url || '/' },
      vibrate: [100, 50, 100],
      // renotify: true means a new notification with the same tag replaces the old one
      // and still fires the vibration/sound — important for engagement drip
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(target);
      } else {
        clients.openWindow(target);
      }
    })
  );
});