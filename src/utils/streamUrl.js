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
 *
 * THE BUCKET IS NOW PRIVATE, AND THAT CHANGES WHAT A FALLBACK IS
 *
 * This file used to promise that "every failure path falls back to file_url"
 * and that "a signing outage degrades to today's behaviour, not to silence".
 * Both were true while feelz-samples was public. Neither is true now.
 *
 * Every one of the stored file_url values is a /storage/v1/object/public/ link
 * into a bucket that is private, and such a link answers 400. So a "fallback"
 * to file_url is not a fallback at all: it assigns a URL that cannot load, the
 * element errors, and the player treats the error as a track that ran dry and
 * skips. A signing outage would silently skip the whole queue, and the only
 * clue would be a 400 in somebody's network tab.
 *
 * playbackSrc() in src/utils/offlineStore.js already refuses that fallback.
 * The functions here now do the same, through playableFallback() below: an
 * external link, a YouTube URL for instance, is still a real fallback and is
 * handed back, while a dead storage link resolves to null so the caller can
 * say nothing-to-play instead of pretending.
 *
 * Three things this has to get right, because playback is unforgiving:
 *
 *   1. It must be readable SYNCHRONOUSLY. playbackSrc() is called on the same
 *      tick as audio.src = ..., and making it async would put a network round
 *      trip in front of every tap. So the cache is a plain object read
 *      synchronously, and filling it is what is asynchronous.
 *   2. It must fail honestly. Where there is a real fallback it is taken; where
 *      there is not, this returns null and says so in the console, rather than
 *      handing back a URL that will 400 and look like a dead track.
 *   3. It must not stampede. Twenty cards rendering at once must produce one
 *      request, not twenty, so in-flight ids are batched and deduplicated.
 */

import { supabase } from '../supabaseClient';

export const PRIVATE_AUDIO = process.env.REACT_APP_PRIVATE_AUDIO === '1';

/**
 * Is this stored URL still worth assigning to a media element?
 *
 * With signing off, every stored URL is as good as it ever was. With signing
 * on, a public-object link into a private bucket is worse than nothing: it
 * loads far enough to fail and then looks like a broken track. A link to
 * anywhere else, YouTube above all, is untouched by any of this.
 *
 * Exported because several screens do `(await resolveStreamSrc(t)) ||
 * t.file_url`, and that second half is the dead fallback written out by hand.
 * Wrapping it is a smaller change than restructuring six call sites, and it
 * keeps the rule in one place.
 */
export function playableFallback(url) {
  if (!url) return null;
  if (!PRIVATE_AUDIO) return url;
  if (String(url).includes('/storage/v1/object/public/')) {
    console.warn('[stream-url] not falling back to a public storage URL:',
      'the bucket is private and that link answers 400. Nothing to play.');
    return null;
  }
  return url;
}

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

// ── Video ────────────────────────────────────────────────────────────────
//
// Uploaded MP4s live in the track-videos bucket and their public URL is stored
// in tracks.youtube_url, alongside genuine YouTube links. They get their own
// cache rather than sharing the audio one, because the same track id maps to
// two different assets and one cache keyed by id alone would hand the video
// URL to the audio element.
//
// A real YouTube link is not a storage URL, so the function hands it straight
// back unsigned and this is a no-op for it.
const videoCache = new Map();
const videoInFlight = new Map();

/**
 * Resolve a playable URL for a track's uploaded video. Returns the stored
 * youtube_url unchanged when signing is off or fails, so a YouTube embed and a
 * signing outage both behave exactly as they did before.
 */
export async function resolveVideoSrc(track) {
  if (!track?.id) return null;
  if (!PRIVATE_AUDIO) return track.youtube_url || null;

  const hit = videoCache.get(track.id);
  if (live(hit)) return hit.url;

  let promise = videoInFlight.get(track.id);
  if (!promise) {
    promise = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({ trackId: track.id, kind: 'video' }),
      });
      if (!res.ok) throw new Error(`stream-url video ${res.status}`);

      const { tracks } = await res.json();
      const r = tracks?.[track.id];
      if (r?.url) {
        videoCache.set(track.id, {
          url: r.url,
          expiresAt: r.expiresAt ? Date.parse(r.expiresAt) : Date.now() + 60 * 60 * 1000,
        });
      }
      return r?.url || null;
    })()
      .catch(err => {
        console.warn('[stream-url] could not sign video for', track.id, err.message);
        return null;
      })
      .finally(() => { videoInFlight.delete(track.id); });

    videoInFlight.set(track.id, promise);
  }

  // An uploaded MP4's youtube_url is a public link into the private
  // track-videos bucket, so it is only a fallback for a genuine YouTube link.
  return (await promise) || playableFallback(track.youtube_url);
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
      // Logged once per batch, not per track, and never rethrown. This used to
      // add that the caller's fallback was file_url and that it still worked.
      // It is not and it does not: see the note at the top. A failed batch now
      // means those tracks have nothing to play until the next attempt, which
      // is why this is a warning with a count in it rather than a shrug.
      console.warn('[stream-url] could not sign', batch.length, 'track(s):', err.message,
        '- those tracks have no playable URL until this succeeds.');
      return {};
    })
    .finally(() => { batch.forEach(id => inFlight.delete(id)); });

  batch.forEach(id => inFlight.set(id, promise));
  return promise;
}

/**
 * The async resolve, for callers that can wait.
 *
 * Returns a signed URL; with signing off, the track's own file_url. With
 * signing on and no signature to be had, null, because the only thing left to
 * return would be a dead storage link. Callers must handle null rather than
 * reaching for file_url themselves: playableFallback() is there for the ones
 * that genuinely have an external URL to fall back to.
 */
export async function resolveStreamSrc(track) {
  if (!track?.id) return null;
  if (!PRIVATE_AUDIO) return track.file_url || null;

  const hit = cachedStreamSrc(track.id);
  if (hit) return hit;

  const pending = inFlight.get(track.id);
  if (pending) { await pending; return cachedStreamSrc(track.id) || playableFallback(track.file_url); }

  await warmStreamUrls([track.id]);
  return cachedStreamSrc(track.id) || playableFallback(track.file_url);
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
  }).catch(() => { /* whatever is on the element stays; never break playback over this */ });
}

/** Test seam, and a way to drop everything on sign out. */
export function clearStreamUrlCache() {
  cache.clear();
  inFlight.clear();
}