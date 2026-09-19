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

// Paths that are NOT the single-page app, even though the browser asks for
// them with req.mode === 'navigate'.
//
// The navigation handler below answers every navigation with the cached
// index.html shell. Its comment claims that is always right because Netlify's
// /* -> /index.html rule turns every path into the shell anyway. That is not
// true: netlify.toml has force = true 200-rules serving real files for these
// paths, and the worker was overriding all of them, then caching the HTML
// shell under those keys. Typing /sitemap.xml loaded the app.
//
// Returning without calling respondWith() hands the request back to the
// browser, which fetches it normally.
const PASS_THROUGH_NAVIGATIONS = [
  '/sitemap.xml',
  '/robots.txt',
  '/.well-known/',      // assetlinks.json for the Android app link
  '/manifest.json',
  '/service-worker.js',
];

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

// Precached one at a time, not with addAll.
//
// cache.addAll() is atomic: if a SINGLE url in the list fails — a 404, a
// network blip mid-install, a typo in a filename — the whole call rejects,
// nothing at all is cached, and because skipWaiting() is chained after it
// that never runs either. The worker then controls pages with an empty
// cache, which is how a navigation ends up falling through to the
// synthesised 503 below.
//
// Individually, a missing icon costs you that icon and nothing else. The
// shell is what matters, so it is reported separately when it fails.
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const results = await Promise.allSettled(
      PRECACHE.map(async (url) => {
        // cache: 'reload' so an install never re-caches a stale HTTP-cached
        // copy of the shell from a previous deploy.
        const res = await fetch(url, { cache: 'reload' });
        if (!res || !res.ok) throw new Error(`${url} -> ${res && res.status}`);
        await cache.put(url, res);
        return url;
      })
    );
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? PRECACHE[i] : null))
      .filter(Boolean);
    if (failed.length) console.warn('[SW] precache missed:', failed.join(', '));
    // If the shell itself did not cache, say so loudly: that is the one
    // failure that costs offline support and makes navigation fall through.
    if (!(await cache.match('/index.html'))) {
      console.error('[SW] /index.html did NOT precache — offline navigation will not work.');
    }
    await self.skipWaiting();
  })());
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

  // Not the app. Let the browser fetch it.
  if (req.mode === 'navigate'
      && url.origin === self.location.origin
      && PASS_THROUGH_NAVIGATIONS.some(p => url.pathname === p || url.pathname.startsWith(p))) {
    return;
  }

  // Navigation: cached shell FIRST, network in the background.
  //
  // This was network-first with no timeout, and that is the single biggest
  // reason the app feels slow. Every page load — every one, even with a
  // perfectly good shell already in the cache — sat waiting for a full
  // round trip to Netlify before it could render a single pixel. On a
  // strong connection that is 200ms nobody notices. On a phone on mobile
  // data it is seconds, every time, and it is the first thing that happens
  // so it delays everything after it.
  //
  // Serving the cached shell first is safe HERE, specifically, for two
  // reasons that do not hold in general:
  //
  //   1. This is a single-page app. index.html is an 8KB shell with no
  //      content in it — every artist, track and image arrives later over
  //      the API, which this worker never caches (see NEVER_CACHE_ORIGINS).
  //      So a cached shell cannot show stale CONTENT. It can only reference
  //      an older set of hashed JS files.
  //
  //   2. It cannot even do that for long, because `activate` deletes every
  //      cache whose name is not the current CACHE_VERSION, and
  //      CACHE_VERSION is rewritten on every build. Anything still in this
  //      cache is therefore from the current deploy by construction. The
  //      stale window is one navigation, and the SW_UPDATED message the
  //      activate handler already broadcasts is what closes it.
  //
  // The network copy still gets fetched on every navigation and written
  // back, so the next load has the newest shell. That is the "revalidate"
  // half — the user just is not made to wait for it.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = (await cache.match(req))
                  || (await caches.match('/index.html'));

      // Kick the network off regardless, so the cache is fresh next time.
      const network = fetch(req)
        .then(res => {
          if (res?.status === 200) {
            // Cache it under the requested URL AND as the shell.
            //
            // Every navigation on this SPA returns the same 8KB index.html —
            // Netlify's /* -> /index.html rule sees to that. Seeding the shell
            // key from any successful navigation means the app can survive
            // offline even if the install-time precache of /index.html missed,
            // which is exactly the hole a 503 on /admin/content falls through.
            cache.put(req, res.clone()).catch(() => {});

            // Only seed the shell from something that actually IS the shell.
            // The pass-through list above catches the paths we know about;
            // this catches the next one somebody adds to netlify.toml without
            // remembering this file exists. Caching a sitemap under
            // /index.html would render XML as the whole app, offline, until
            // the next deploy rotated the cache.
            const type = res.headers.get('content-type') || '';
            if (type.includes('text/html')) {
              caches.open(STATIC_CACHE)
                .then(c => c.put('/index.html', res.clone()))
                .catch(() => {});
            }
          }
          return res;
        })
        .catch(() => null);

      if (cached) {
        // Do not let the background fetch die with the response, and do not
        // let its rejection surface as an unhandled error.
        e.waitUntil(network.catch(() => {}));
        return cached;
      }

      // Nothing cached yet — first ever visit, or the precache missed.
      // Wait for the network, and only then fall back.
      const res = await network;
      if (res) return res;

      const shell = (await caches.match('/index.html'))
                 || (await caches.match('/offline.html'));
      if (shell) return shell;

      // No shell, no network.
      //
      // This used to synthesise a 503, and that was wrong in two ways. A 503
      // says "the server is broken" when the truth is "this device has no
      // connection" — so a dropped signal on a page the cache had never seen
      // showed up in the console, and in any error reporting, as a server
      // fault. It is also a REAL response as far as the browser is concerned,
      // which means the page it replaces never gets Chrome's own offline UI,
      // the one people actually recognise and know to retry.
      //
      // Rejecting instead hands the navigation back to the browser, which
      // shows its native offline page. Logged loudly, because reaching here
      // at all means the shell is missing and that is worth knowing.
      console.error('[SW] navigation failed with no cached shell:', req.url,
        '— the precache of /index.html is missing. It will be re-seeded on the next successful load.');
      throw new Error('offline and no cached shell');
    })());
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