// ── Feelz Machine Service Worker ─────────────────────────────────────────────
// CACHE_VERSION is injected at build time by Netlify via an environment variable.
// If REACT_APP_BUILD_ID isn't set, fall back to a timestamp so it's always unique.
const CACHE_VERSION = 'feelz-v10';
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

// ── Offline listening ────────────────────────────────────────────────────────
// Saved music lives in IndexedDB (see src/utils/offlineStore.js for why it is
// not in a Cache bucket: the build rewrites CACHE_VERSION on every deploy and
// activate deletes every other cache, so cached audio would be destroyed by
// an unrelated CSS fix).
//
// This worker's job is to hand that stored blob back as a normal HTTP
// response. The audio element then gets Accept-Ranges and a real
// Content-Length, so seeking, scrubbing and duration behave exactly as they do
// when streaming. Handing the element a blob: URL instead works for straight
// playback but seeking in one is unreliable on older iOS.
const OFFLINE_DB     = 'feelz-offline';
const OFFLINE_PREFIX = '/offline-audio/';

function offlineDb() {
  return new Promise((resolve, reject) => {
    // Opened WITHOUT a version on purpose. The app owns the schema; the worker
    // only reads. Passing a version here could trigger an upgrade from the
    // worker and race the page.
    let req;
    try { req = indexedDB.open(OFFLINE_DB); } catch (e) { reject(e); return; }
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

function offlineGet(db, store, key) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(store)) { resolve(null); return; }
    let r;
    try { r = db.transaction([store], 'readonly').objectStore(store).get(key); }
    catch (e) { reject(e); return; }
    r.onsuccess = () => resolve(r.result || null);
    r.onerror   = () => reject(r.error);
  });
}

// Range: bytes=0-1023 | bytes=1024- | bytes=-512
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  let start, end;
  if (rawStart === '') {
    if (rawEnd === '') return null;
    const suffix = parseInt(rawEnd, 10);
    if (!suffix) return null;
    start = Math.max(0, size - suffix);
    end   = size - 1;
  } else {
    start = parseInt(rawStart, 10);
    end   = rawEnd === '' ? size - 1 : parseInt(rawEnd, 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function serveOfflineAudio(req, trackId) {
  let db;
  try { db = await offlineDb(); } catch {
    return new Response('Offline store unavailable', { status: 503 });
  }

  let meta, audio;
  try {
    meta  = await offlineGet(db, 'meta', trackId);
    audio = await offlineGet(db, 'audio', trackId);
  } catch {
    return new Response('Offline store read failed', { status: 503 });
  }

  if (!audio || !audio.blob) {
    // Not saved on this device. 404 rather than a synthesised silence so the
    // player's error handler can fall back to streaming.
    return new Response('Not saved offline', { status: 404 });
  }

  // The lease. Entitlement cannot be re-checked with no network, so the answer
  // the server gave at save time is honoured until it expires. 410 is
  // deliberately distinct from 404: the app can tell "you never saved this"
  // from "reconnect to keep this".
  if (meta && meta.expiresAt) {
    const ms = Date.parse(meta.expiresAt);
    if (Number.isFinite(ms) && ms <= Date.now()) {
      return new Response('Offline lease expired', { status: 410 });
    }
  }

  const blob = audio.blob;
  const size = blob.size;
  const type = (meta && meta.mimeType) || blob.type || 'audio/mpeg';

  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const range = parseRange(rangeHeader, size);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
      });
    }
    const chunk = blob.slice(range.start, range.end + 1);
    return new Response(chunk, {
      status: 206,
      headers: {
        'Content-Type':   type,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range':  `bytes ${range.start}-${range.end}/${size}`,
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'no-store',
      },
    });
  }

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type':   type,
      'Content-Length': String(size),
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'no-store',
    },
  });
}

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

  // Saved music, before anything else. This must come ahead of the
  // same-origin stale-while-revalidate branch below, which would otherwise
  // try to fetch /offline-audio/<id> from the network — a path that exists on
  // no server — and hand back the SPA's index.html as an audio file.
  if (url.origin === self.location.origin && url.pathname.startsWith(OFFLINE_PREFIX)) {
    const trackId = decodeURIComponent(url.pathname.slice(OFFLINE_PREFIX.length));
    e.respondWith(serveOfflineAudio(req, trackId));
    return;
  }

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