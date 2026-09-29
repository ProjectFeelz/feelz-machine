// src/utils/spreadByArtist.js
//
// No artist gets a row to themselves.
//
// One account uploading an album in one sitting takes over anything ordered
// by created_at, and anything ordered by engagement too, because a burst of
// new tracks from one artist scores as a burst of new tracks. This deals the
// list out like cards instead, one track per artist per round, in whatever
// order it arrived in.
//
// Nothing is dropped and nothing is reordered within an artist. An artist with
// nine tracks still has all nine, spaced out, with everyone else's music in
// between.
//
// Lifted out of ForYouPage so the Library rails can use the same one rather
// than growing a second copy that drifts from it.
//
// ── THE PART THAT IS EASY TO GET WRONG ──────────────────────────────────────
//
// Spreading a list that has ALREADY been cut to the length of the row does
// nothing at all. Six tracks by one artist, spread, are still six tracks by
// one artist. The fetch has to over-fetch, spread the pool, and only then cut
// to length. Every caller here does that, and a new one must too.
//
// The bucket key is artist_id. A row selected as `artists(artist_name)` has
// the name nested under `artists`, not at `artist_name`, so without artist_id
// in the select every row keys to 'unknown', they all land in one bucket, and
// this function silently returns the list untouched. That is the failure that
// looks like the fix not working.
export default function spreadByArtist(list) {
  if (!Array.isArray(list) || list.length < 3) return list || [];

  const buckets = new Map();   // artist -> their tracks, in arrival order
  list.forEach(t => {
    const key = t.artist_id || t.artist_name || t.artists?.artist_name || 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  });
  if (buckets.size === 1) return list;

  const queues = [...buckets.values()];
  const out = [];
  while (out.length < list.length) {
    let placedThisRound = false;
    for (const q of queues) {
      if (!q.length) continue;
      out.push(q.shift());
      placedThisRound = true;
    }
    if (!placedThisRound) break;   // belt and braces, never loop forever
  }
  return out;
}