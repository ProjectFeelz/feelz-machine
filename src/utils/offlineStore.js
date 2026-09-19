// src/utils/offlineStore.js
//
// OFFLINE LISTENING — the storage layer
//
// What this is for: keeping the actual audio for a track on the person's
// device so it plays with no network at all. That is a different thing from
// the existing Downloads feature, which hands the browser an .mp3 and puts a
// file in the phone's Downloads folder — outside the app, invisible to the
// player, and no use for listening in Feelz Machine on a plane.
//
//
// WHY IndexedDB AND NOT THE CACHE API
//
// This is the decision that matters most, and getting it wrong would look
// like the feature working perfectly and then losing everybody's music at a
// random moment.
//
// netlify.toml rewrites the service worker's cache name on every single build:
//
//   sed -i "s/feelz-v[0-9]*/feelz-$(date +%Y%m%d%H%M)/g" public/service-worker.js
//
// and the worker's activate handler deletes every cache whose name is not the
// current one. So anything stored in a Cache API bucket is destroyed by the
// next deploy. Music somebody saved for a flight would vanish because an
// unrelated CSS fix went out. IndexedDB is untouched by that cleanup, which
// makes it the only correct home for this.
//
// It is also the better fit anyway: one place holds the audio, the artwork and
// the metadata, so a saved track can be listed, played and shown with a cover
// while completely offline, with no rows read from Supabase.
//
//
// WHY THERE IS A LEASE AND NOT JUST A FILE
//
// Offline entitlement cannot be checked at play time — there is no network,
// that is the entire point. So the check happens once, at save time, on the
// server (netlify/functions/get-offline-url.js), and the answer is written
// next to the audio as an expiry date. Playing offline re-reads that date
// locally; reconnecting renews it silently.
//
// Thirty days is the industry-standard window and it is what the server
// returns today. Without an expiry, one Fan Pro month would buy a permanent
// library, which is a different product.

import { cachedStreamSrc } from './streamUrl';

const DB_NAME    = 'feelz-offline';
const DB_VERSION = 1;

const STORE_META  = 'meta';   // one small record per saved track
const STORE_AUDIO = 'audio';  // the audio blob, kept apart so listing is cheap
const STORE_COVER = 'cover';  // artwork blob, so covers render with no network

// The virtual path the service worker answers from IndexedDB. Same origin, so
// the audio element treats it as an ordinary file and range requests work,
// which is what makes seeking and scrubbing behave normally.
export const OFFLINE_AUDIO_PREFIX = '/offline-audio/';

// ── Opening ───────────────────────────────────────────────────────────────────

let dbPromise = null;

export function openOfflineDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('offline_unsupported'));
      return;
    }

    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        const meta = db.createObjectStore(STORE_META, { keyPath: 'trackId' });
        meta.createIndex('savedAt', 'savedAt');
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'trackId' });
      }
      if (!db.objectStoreNames.contains(STORE_COVER)) {
        db.createObjectStore(STORE_COVER, { keyPath: 'trackId' });
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      // A tab left open through an upgrade would otherwise wedge the next one.
      db.onversionchange = () => { try { db.close(); } catch {} dbPromise = null; };
      resolve(db);
    };

    req.onerror   = () => { dbPromise = null; reject(req.error || new Error('idb_open_failed')); };
    req.onblocked = () => { dbPromise = null; reject(new Error('idb_blocked')); };
  });

  return dbPromise;
}

function tx(db, stores, mode) {
  return db.transaction(stores, mode);
}

function done(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror    = () => reject(transaction.error);
    transaction.onabort    = () => reject(transaction.error || new Error('idb_aborted'));
  });
}

function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

// ── Leases ────────────────────────────────────────────────────────────────────

export function leaseState(meta) {
  if (!meta) return 'missing';
  if (!meta.expiresAt) return 'ok';            // shouldn't happen; fail open
  const ms = Date.parse(meta.expiresAt);
  if (!Number.isFinite(ms)) return 'ok';
  const left = ms - Date.now();
  if (left <= 0) return 'expired';
  if (left < 5 * 86400000) return 'expiring';  // under five days
  return 'ok';
}

export function daysLeft(meta) {
  const ms = Date.parse(meta?.expiresAt || '');
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil((ms - Date.now()) / 86400000));
}

// ── Reading ───────────────────────────────────────────────────────────────────

export async function listOffline() {
  const db = await openOfflineDb();
  const t  = tx(db, [STORE_META], 'readonly');
  const all = await reqAsPromise(t.objectStore(STORE_META).getAll());
  return (all || []).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export async function getOfflineMeta(trackId) {
  if (!trackId) return null;
  const db = await openOfflineDb();
  const t  = tx(db, [STORE_META], 'readonly');
  return (await reqAsPromise(t.objectStore(STORE_META).get(trackId))) || null;
}

export async function isSavedOffline(trackId) {
  const meta = await getOfflineMeta(trackId);
  return !!meta && leaseState(meta) !== 'expired';
}

export async function getOfflineAudioBlob(trackId) {
  const db = await openOfflineDb();
  const t  = tx(db, [STORE_AUDIO], 'readonly');
  const rec = await reqAsPromise(t.objectStore(STORE_AUDIO).get(trackId));
  return rec?.blob || null;
}

export async function getOfflineCoverBlob(trackId) {
  const db = await openOfflineDb();
  const t  = tx(db, [STORE_COVER], 'readonly');
  const rec = await reqAsPromise(t.objectStore(STORE_COVER).get(trackId));
  return rec?.blob || null;
}

export async function offlineUsage() {
  const items = await listOffline();
  const bytes = items.reduce((sum, m) => sum + (m.bytes || 0), 0);

  // The browser's own view of the origin's allowance. Purely informational —
  // never gate a save on it, because the numbers are deliberately fuzzy and a
  // wrong refusal is worse than a failed write we can report.
  let quota = null;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      quota = est?.quota || null;
    }
  } catch { /* not available, not important */ }

  return { count: items.length, bytes, quota };
}

// ── Writing ───────────────────────────────────────────────────────────────────

// Trimmed to what the offline library and the player actually read, so a saved
// track renders and plays with zero Supabase queries. Everything else about a
// track can be fetched when there is a network again.
function snapshotTrack(track, extra) {
  return {
    trackId:     track.id,
    title:       track.title || 'Untitled',
    slug:        track.slug || null,
    artistId:    track.artist_id || track.artist?.id || null,
    artistName:  track.artist?.artist_name || track.artist_name || 'Unknown artist',
    artistSlug:  track.artist?.slug || track.artist_slug || null,
    coverUrl:    track.cover_artwork_url || null,
    duration:    track.duration || null,
    fileUrl:     track.file_url || null,   // for the online path and re-saves
    isBeat:      !!track.is_beat,
    albumId:     track.album_id || null,
    ...extra,
  };
}

/**
 * saveTrackOffline
 *
 * The whole save, start to finish: ask the server whether this person may keep
 * this track, stream the bytes down with progress, store audio + artwork +
 * metadata in one transaction.
 *
 * The transaction is the part worth noticing. Audio and metadata are written
 * together or not at all, so there is never a metadata row promising a track
 * whose audio failed to land — which would show as a song in the library that
 * silently refuses to play.
 *
 * onProgress is called with 0..1, or null when the response has no
 * Content-Length and there is nothing honest to report.
 */
export async function saveTrackOffline(track, { authToken, onProgress, signal } = {}) {
  if (!track?.id) throw new Error('no_track');
  if (!authToken) throw new Error('not_authenticated');

  // 1. Entitlement + a signed URL. This is the only moment the rules are
  //    checked, so it happens on the server, not here.
  const res = await fetch('/.netlify/functions/get-offline-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ trackId: track.id }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `offline_url_failed_${res.status}`);
  }

  const { signedUrl, expiresAt, mimeType } = await res.json();
  if (!signedUrl) throw new Error('offline_url_missing');

  // 2. The audio itself, with progress where the server tells us the size.
  const audioRes = await fetch(signedUrl, { signal });
  if (!audioRes.ok) throw new Error('audio_fetch_failed');

  const total = Number(audioRes.headers.get('content-length')) || 0;
  let blob;

  if (audioRes.body && typeof audioRes.body.getReader === 'function' && total > 0) {
    const reader = audioRes.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      chunks.push(value);
      received += value.length;
      if (onProgress) onProgress(Math.min(1, received / total));
    }
    blob = new Blob(chunks, { type: audioRes.headers.get('content-type') || mimeType || 'audio/mpeg' });
  } else {
    // No stream or no length — Safari and some webviews. Still works, just
    // without a progress bar, which is better than refusing to save.
    if (onProgress) onProgress(null);
    blob = await audioRes.blob();
  }

  if (!blob.size) throw new Error('audio_empty');

  // 3. Artwork. Best effort: a missing cover is a cosmetic problem, and
  //    failing the whole save over it would be absurd.
  let coverBlob = null;
  if (track.cover_artwork_url) {
    try {
      const c = await fetch(track.cover_artwork_url, { signal });
      if (c.ok) coverBlob = await c.blob();
    } catch { /* cosmetic */ }
  }

  // 4. One transaction for all of it.
  const db = await openOfflineDb();
  const t  = tx(db, [STORE_META, STORE_AUDIO, STORE_COVER], 'readwrite');

  const meta = snapshotTrack(track, {
    bytes:     blob.size,
    mimeType:  blob.type || 'audio/mpeg',
    savedAt:   Date.now(),
    expiresAt: expiresAt || null,
  });

  t.objectStore(STORE_META).put(meta);
  t.objectStore(STORE_AUDIO).put({ trackId: track.id, blob });
  if (coverBlob) t.objectStore(STORE_COVER).put({ trackId: track.id, blob: coverBlob });

  try {
    await done(t);
  } catch (err) {
    // QuotaExceededError is the common one and deserves its own name so the
    // UI can say "your phone is full" rather than "something went wrong".
    if (err?.name === 'QuotaExceededError') throw new Error('device_storage_full');
    throw err;
  }

  if (onProgress) onProgress(1);
  return meta;
}

export async function removeOffline(trackId) {
  releaseObjectUrl(trackId);
  const db = await openOfflineDb();
  const t  = tx(db, [STORE_META, STORE_AUDIO, STORE_COVER], 'readwrite');
  t.objectStore(STORE_META).delete(trackId);
  t.objectStore(STORE_AUDIO).delete(trackId);
  t.objectStore(STORE_COVER).delete(trackId);
  await done(t);
}

export async function clearOffline() {
  releaseAllObjectUrls();
  const db = await openOfflineDb();
  const t  = tx(db, [STORE_META, STORE_AUDIO, STORE_COVER], 'readwrite');
  t.objectStore(STORE_META).clear();
  t.objectStore(STORE_AUDIO).clear();
  t.objectStore(STORE_COVER).clear();
  await done(t);
}

/**
 * renewLeases
 *
 * Called when the app has a network again. Re-asks the server about every
 * saved track and writes the new expiry, without re-downloading a byte.
 *
 * The two kinds of refusal are treated differently on purpose:
 *
 *   410 / 404 — the track itself is gone: the artist unpublished it, or it was
 *               deleted. The local copy is removed, because there is nothing
 *               left for it to be a copy of.
 *   403       — the person is not entitled RIGHT NOW: Fan Pro lapsed, or a
 *               paid track's purchase no longer covers it. The copy is LEFT
 *               ALONE and simply stops renewing, so it runs out its remaining
 *               lease instead of vanishing the moment a card is declined.
 *
 * Deleting on 403 would mean a subscription lapsing mid-holiday wipes
 * somebody's music with no warning. Letting the lease expire gives them up to
 * thirty days and a visible countdown, which is the difference between a
 * feature that ends and a feature that punishes.
 */
export async function renewLeases(authToken) {
  if (!authToken) return { renewed: 0, revoked: 0, lapsed: 0, failed: 0 };

  const items = await listOffline();
  let renewed = 0, revoked = 0, lapsed = 0, failed = 0;

  for (const meta of items) {
    try {
      const res = await fetch('/.netlify/functions/get-offline-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        // renew: the server checks entitlement and returns an expiry without
        // signing a URL, so this is cheap and downloads nothing.
        body: JSON.stringify({ trackId: meta.trackId, renew: true }),
      });

      // The track is gone from the platform. Nothing to keep.
      if (res.status === 404 || res.status === 410) {
        await removeOffline(meta.trackId);
        revoked++;
        continue;
      }

      // Not entitled at this moment. Leave the existing lease to run out —
      // see the note above on why this is not a delete.
      if (res.status === 403) { lapsed++; continue; }

      if (!res.ok) { failed++; continue; }

      const { expiresAt } = await res.json();
      if (!expiresAt) { failed++; continue; }

      const db = await openOfflineDb();
      const t  = tx(db, [STORE_META], 'readwrite');
      const store = t.objectStore(STORE_META);
      const current = await reqAsPromise(store.get(meta.trackId));
      if (current) store.put({ ...current, expiresAt });
      await done(t);
      renewed++;
    } catch {
      // Offline again mid-renew, or a transient failure. Leaving the existing
      // expiry alone is right: nothing is lost, and the next reconnect retries.
      failed++;
    }
  }

  return { renewed, revoked, lapsed, failed };
}

// ── Resolving a playable src ───────────────────────────────────────────────────

// Two ways to play a stored blob, in order of preference.
//
// 1. Through the service worker, at /offline-audio/<id>. The audio element
//    sees a normal same-origin HTTP response with Accept-Ranges, so seeking,
//    scrubbing and duration all work exactly as they do online.
//
// 2. A blob: object URL. Used when no worker is controlling the page yet —
//    a first visit before the worker takes over, or a browser with service
//    workers disabled. Playback works; seeking in a blob URL is less reliable
//    on older iOS, which is why it is the fallback and not the default.

const objectUrls = new Map(); // trackId -> blob: URL
const MAX_OBJECT_URLS = 4;    // crossfade needs two live at once

function releaseObjectUrl(trackId) {
  const url = objectUrls.get(trackId);
  if (url) {
    try { URL.revokeObjectURL(url); } catch {}
    objectUrls.delete(trackId);
  }
}

function releaseAllObjectUrls() {
  for (const id of Array.from(objectUrls.keys())) releaseObjectUrl(id);
}

export function serviceWorkerCanServe() {
  return typeof navigator !== 'undefined'
      && 'serviceWorker' in navigator
      && !!navigator.serviceWorker.controller;
}

export function offlineAudioPath(trackId) {
  return `${OFFLINE_AUDIO_PREFIX}${encodeURIComponent(trackId)}`;
}

/**
 * offlineSrcFor
 *
 * Returns a src the audio element can use, or null if this track is not
 * usable offline. Null is the signal to fall back to the streaming URL — this
 * function never throws into the playback path.
 */
export async function offlineSrcFor(trackId) {
  if (!trackId) return null;

  let meta;
  try {
    meta = await getOfflineMeta(trackId);
  } catch {
    return null;
  }
  if (!meta) return null;
  if (leaseState(meta) === 'expired') return null;

  if (serviceWorkerCanServe()) return offlineAudioPath(trackId);

  const existing = objectUrls.get(trackId);
  if (existing) return existing;

  let blob;
  try {
    blob = await getOfflineAudioBlob(trackId);
  } catch {
    return null;
  }
  if (!blob) return null;

  if (objectUrls.size >= MAX_OBJECT_URLS) {
    releaseObjectUrl(objectUrls.keys().next().value);
  }

  const url = URL.createObjectURL(blob);
  objectUrls.set(trackId, url);
  return url;
}

/**
 * offlineSrcSync / playbackSrc
 *
 * The player sets audio.src synchronously — playTrack, the crossfade and
 * jumpToIndex all do — and that is worth preserving: making every online play
 * wait on an IndexedDB round trip to discover it is not saved would slow down
 * the common case to serve the rare one.
 *
 * So the fast path is entirely synchronous. When a service worker is
 * controlling the page, the local URL is just a string built from the track
 * id — /offline-audio/<id> — and needs no storage read at all, because the
 * worker does the reading when the audio element requests it.
 *
 * The only case that cannot be answered synchronously is a saved track with no
 * worker controlling the page, where a blob: URL has to be created from the
 * stored bytes. offlineSrcSync returns null there and the caller falls back to
 * streaming; PlayerContext then retries asynchronously via offlineSrcFor,
 * which matters when that state coincides with actually being offline.
 */
export function offlineSrcSync(trackId) {
  if (!trackId) return null;
  if (!isSavedOfflineSync(trackId)) return null;
  if (serviceWorkerCanServe()) return offlineAudioPath(trackId);
  return objectUrls.get(trackId) || null;
}

export function playbackSrc(track) {
  // Order matters, and it is: the copy on this device, then a signed
  // streaming URL if one is already cached, then the stored file_url.
  //
  // cachedStreamSrc is a synchronous cache read and returns null unless
  // REACT_APP_PRIVATE_AUDIO is on, so with the flag off this is byte for byte
  // the old behaviour. With it on and the cache cold, file_url is still what
  // gets assigned and PlayerContext swaps in the signed URL a moment later —
  // which is why the bucket must stay public until that swap is proven.
  return offlineSrcSync(track?.id) || cachedStreamSrc(track?.id) || track?.file_url || null;
}

export function isOfflineSrc(src) {
  return typeof src === 'string'
      && (src.startsWith('blob:') || src.includes(OFFLINE_AUDIO_PREFIX));
}

/**
 * A synchronous view of what is saved, for render paths that cannot await.
 *
 * Kept warm by useOfflineLibrary. Read-only and best-effort: an empty set
 * means "not known yet", never "definitely not saved", so nothing should
 * block on it.
 */
let savedIdCache = new Set();

export function primeSavedIds(ids) {
  savedIdCache = new Set(ids);
}

export function savedIdsSnapshot() {
  return savedIdCache;
}

export function isSavedOfflineSync(trackId) {
  return savedIdCache.has(trackId);
}