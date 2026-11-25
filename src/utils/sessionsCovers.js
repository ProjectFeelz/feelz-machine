// src/utils/sessionsCovers.js
//
// Which tracks are covers of the current Sessions song.
//
// The competition song is a real song with a real artist, and during a
// competition the catalogue fills with other people's versions of it - partly
// as proper entries, partly as ordinary uploads by people who meant to enter
// and never found the toggle. The entries are already kept out of the feed
// (is_competition_entry). The accidental ones are not, and a feed that plays
// eleven versions of the same song in a row is not a feed.
//
// The original stays. It is named by the competition row itself
// (reference_track), so nothing here needs to know a title or an artist, and
// changing the competition song changes what this hides.

export const titleKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Build the test from the active shortlist rows.
 *
 *   rows: [{ title, reference_track: { id } }]
 *
 * Answers a function: given a track, is it somebody else's version of the
 * competition song? Returns false for everything when there is no live
 * competition, so the feed is untouched the rest of the year.
 */
export function makeSessionsCoverTest(rows) {
  const keys = (rows || [])
    .map(r => titleKey(r && r.title))
    .filter(k => k.length >= 4);
  const keep = new Set(
    (rows || []).map(r => r && r.reference_track && r.reference_track.id).filter(Boolean)
  );
  if (!keys.length) return () => false;

  return (track) => {
    if (!track || !track.id) return false;
    if (keep.has(track.id)) return false;          // the original, always stays
    const k = titleKey(track.title);
    if (k.length < 4) return false;
    // The track must contain the WHOLE competition title. Not the reverse:
    // that would hide a song called "Zero" the moment the competition song
    // happened to end with the word.
    return keys.some(s => k.includes(s));
  };
}
