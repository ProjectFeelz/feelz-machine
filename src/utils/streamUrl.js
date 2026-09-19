/**
 * src/utils/streamUrl.js
 *
 * Short lived signed streaming URLs, so tracks.file_url stops being a
 * permanent public link to the master audio. See netlify/functions/stream-url.js
 * for why, and for the order the bucket must be flipped in.
 *
 * Off by default. With REACT_APP_PRIVATE_AUDIO unset, every function here is a
 * no-op and playback uses file_url exactly as it does today. That is
 * deliberate: this ships dark, gets switched on, gets tested against a bucket
 * that is still public and therefore still forgiving, and only then is the
 * bucket made private.
 *
 * Three things this has to get right, because playback is unforgiving:
 *
 *   1. It must be readable SYNCHRONOUSLY. playbackSrc() is called on the same
 *      tick as audio.src = ..., and making it async would put a network round
 *      trip in front of every tap. So the cache is a plain object read
 *      synchronously, and filling it is what is asynchronous.
 *   2. It must never be the reason a track does not play. Every failure path
 *      falls back to file_url. A signing outage degrades to today's behaviour,
 *      not to silence.
 *   3. It must not stampede. Twenty cards rendering at once must produce one
 *      request, not twenty, so in-flight ids are batched and deduplicated.
 */

import { supabase } from '../supabaseClient';

export const PRIVATE_AUDIO = process.env.REACT_APP_PRIVATE_AUDIO === '1';

const ENDPOINT = '/.netlify/functions/stream-url';

// Re-sign a few minutes before the server's expiry rather than at it, so a
// track that starts playing just under the wire does not die mid-song.
const RENEW_MARGIN_MS = 5 * 60 * 1000;

// trackId -> { url, expiresAt: epoch ms }
const cache = new Map();
// trackId -> Promise, so concurrent callers share one request
const inFlight = new Map();

function live(entry) {
  return entry && entry.url && entry.expiresAt - RENEW_MARGIN_MS > Date.now();
}

/**
 * The synchronous read. Returns a signed URL only if one is already cached and
 * still good; never fetches, never blocks.
 */
export function cachedStreamSrc(trackId) {
  if (!PRIVATE_AUDIO || !trackId) return null;
  const entry = cache.get(trackId);
  return live(entry) ? entry.url : null;
}

async function fetchBatch(ids) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ trackIds: ids }),
  });
  if (!res.ok) throw new Error(`stream-url ${res.status}`);

  const { tracks } = await res.json();
  Object.entries(tracks || {}).forEach(([id, r]) => {
    if (!r?.url) return;
    cache.set(id, {
      url: r.url,
      // An unsigned passthrough (an external host) has no expiry; treat it as
      // good for an hour so it is not re-requested on every skip.
      expiresAt: r.expiresAt ? Date.parse(r.expiresAt) : Date.now() + 60 * 60 * 1000,
    });
  });
  return tracks || {};
}

/**
 * Warm the cache for one or more tracks. Safe to call often and from render
 * paths: it batches, deduplicates, and swallows its own failures.
 */
export function warmStreamUrls(trackIds) {
  if (!PRIVATE_AUDIO) return Promise.resolve();

  const ids = [...new Set((Array.isArray(trackIds) ? trackIds : [trackIds]).filter(Boolean))]
    .filter(id => !live(cache.get(id)) && !inFlight.has(id));

  if (!ids.length) return Promise.resolve();

  const batch = ids.slice(0, 25);
  const promise = fetchBatch(batch)
    .catch(err => {
      // Logged once per batch, not per track, and never rethrown: the caller's
      // fallback is file_url and that still works.
      console.warn('[stream-url] could not sign', batch.length, 'track(s):', err.message);
      return {};
    })
    .finally(() => { batch.forEach(id => inFlight.delete(id)); });

  batch.forEach(id => inFlight.set(id, promise));
  return promise;
}

/**
 * The async resolve, for callers that can wait. Returns a signed URL, or the
 * track's own file_url if signing is off or fails.
 */
export async function resolveStreamSrc(track) {
  if (!track?.id) return null;
  if (!PRIVATE_AUDIO) return track.file_url || null;

  const hit = cachedStreamSrc(track.id);
  if (hit) return hit;

  const pending = inFlight.get(track.id);
  if (pending) { await pending; return cachedStreamSrc(track.id) || track.file_url || null; }

  await warmStreamUrls([track.id]);
  return cachedStreamSrc(track.id) || track.file_url || null;
}

/**
 * The swap, modelled exactly on resolveLocalLater in PlayerContext.
 *
 * The element already has file_url assigned and may already be playing. This
 * fetches the signed URL and, if the element is still on the same track,
 * swaps it in and restores the playhead. If it is already on a signed or a
 * local URL, it does nothing.
 */
export function resolveStreamLater(audio, track, { onSwap } = {}) {
  if (!PRIVATE_AUDIO || !audio || !track?.id) return;
  // Already local, or already signed: leave it alone.
  if (audio.src && (audio.src.includes('/offline-audio/') || audio.src.startsWith('blob:'))) return;
  if (audio.src && audio.src.includes('/object/sign/')) return;

  resolveStreamSrc(track).then(src => {
    if (!src || src === audio.src) return;
    // The listener may have moved on while this was in flight. Only swap if
    // this element is still pointed at the track we resolved for.
    if (audio.dataset.feelzTrackId !== String(track.id)) return;
    if (audio.src && audio.src.includes('/offline-audio/')) return;

    const at = audio.currentTime;
    const wasPlaying = !audio.paused;
    audio.src = src;
    audio.load();

    const restore = () => {
      try { if (at > 0) audio.currentTime = at; } catch {}
      if (wasPlaying) audio.play().catch(() => {});
      audio.removeEventListener('loadedmetadata', restore);
    };
    audio.addEventListener('loadedmetadata', restore);

    onSwap?.(src);
  }).catch(() => { /* file_url stays; never break playback over this */ });
}

/** Test seam, and a way to drop everything on sign out. */
export function clearStreamUrlCache() {
  cache.clear();
  inFlight.clear();
}