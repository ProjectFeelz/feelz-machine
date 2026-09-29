// src/utils/artistAvatar.js
//
// An artist who has never uploaded a profile picture still has artwork: the
// cover of whatever they released last. Showing that beats showing a grey
// music-note icon, which reads as a broken account rather than as an artist.
//
// The rule, in full:
//
//   1. Their profile picture, if they have one.
//   2. Failing that, the cover of their most recent published track.
//   3. Failing that, nothing, and the caller hides them or draws its
//      placeholder. An artist with no picture AND no music is an empty
//      account and has nothing to show either way.
//
// Step 3 is why this returns a map with missing entries rather than a
// placeholder URL. The caller decides between hiding the row and drawing an
// icon, because those are different answers on a rail of suggestions and on a
// list of people you have chosen to follow.
//
// ── WHY THIS IS BATCHED ─────────────────────────────────────────────────────
//
// The obvious version asks per artist, inside the card component. Six cards is
// six round trips on every render of a row that already loaded, which is how a
// page ends up making forty requests to draw one rail. One query for the whole
// list instead, keyed by artist id, cached for the life of the page.

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// artist_id -> cover url. Lives for the page's lifetime. Artists rarely
// release between two renders of the same screen, and a stale cover here is a
// slightly old picture, not a wrong one.
const coverCache = new Map();

export async function fetchArtistFallbackCovers(artistIds) {
  const wanted = [...new Set((artistIds || []).filter(Boolean))];
  const missing = wanted.filter(id => !coverCache.has(id));

  if (missing.length > 0) {
    // Ordered newest first and reduced first-wins, so each artist keeps their
    // most recent cover. Fetching more rows than artists on purpose: one
    // artist's back catalogue must not crowd the others out of the result,
    // and the cap keeps a large follow list from pulling the whole table.
    const { data, error } = await supabase
      .from('tracks')
      .select('artist_id, cover_artwork_url, created_at')
      .in('artist_id', missing)
      .eq('is_published', true)
      .not('cover_artwork_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(Math.min(missing.length * 12, 400));

    if (error) {
      console.error('[artistAvatar] cover lookup failed:', error.code, error.message);
      // Cached as "looked and found nothing" anyway. Without this a failing
      // query is retried on every render for the rest of the session.
      missing.forEach(id => { if (!coverCache.has(id)) coverCache.set(id, null); });
    } else {
      (data || []).forEach(t => {
        if (t.artist_id && !coverCache.has(t.artist_id)) {
          coverCache.set(t.artist_id, t.cover_artwork_url || null);
        }
      });
      missing.forEach(id => { if (!coverCache.has(id)) coverCache.set(id, null); });
    }
  }

  const out = new Map();
  wanted.forEach(id => {
    const url = coverCache.get(id);
    if (url) out.set(id, url);
  });
  return out;
}

// Pass the artists (or anything carrying an id and profile_image_url) and get
// back a map of the ones that need a fallback and have one.
//
// Only artists with NO picture are looked up. Someone who has uploaded one
// costs nothing here, which on most rails is most of them.
export function useArtistFallbackCovers(artists) {
  const [covers, setCovers] = useState(() => new Map());

  const needIds = (artists || [])
    .filter(a => a && a.id && !a.profile_image_url)
    .map(a => a.id);
  const key = needIds.slice().sort().join(',');

  useEffect(() => {
    if (!key) { setCovers(new Map()); return; }
    let cancelled = false;
    fetchArtistFallbackCovers(key.split(','))
      .then(map => { if (!cancelled) setCovers(map); });
    return () => { cancelled = true; };
  }, [key]);

  return covers;
}

// The one place that decides what an artist's picture is, so the rule cannot
// drift between the rails that use it.
export function artistImage(artist, fallbackCovers) {
  if (!artist) return null;
  if (artist.profile_image_url) return artist.profile_image_url;
  return fallbackCovers?.get?.(artist.id) || null;
}