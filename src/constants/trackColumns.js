// src/constants/trackColumns.js
//
// ONE LIST AND ONE FLATTENER, BECAUSE TWO OF EACH DRIFT.
//
//
// WHY THIS FILE EXISTS
//
// The resume feature was removed on 18 November after it showed a real song
// by a real artist captioned "Unknown artist", with no sound. It had selected
// its own columns with '*' and passed the raw database row straight to the
// player.
//
// Every other path in the app selects an explicit list and then flattens the
// joined artist onto the track before anything else sees it. That list was
// written out six times in ForYouPage.js alone. Six copies of a thing agree
// right up until somebody edits five of them.
//
// So: one list, one flattener, imported by anything that loads a track for
// playback. A page that needs extra fields spreads them on afterwards:
//
//     { ...flattenTrack(row), reason: r.reason }
//
//
// WHY THE ARTIST IS FLATTENED AT ALL
//
// PostgREST returns the join nested, as row.artists.artist_name. The cards,
// the player and the share sheet all read track.artist_name. Nothing in the
// app reads the nested shape, so the nested shape must never leave the
// function that fetched it.

export const TRACK_COLUMNS = 'id, title, slug, short_code, is_podcast, is_competition_entry, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, lyrics_theme, artist_id, is_beat, stream_count, like_count, bpm, beat_key, beat_scale, download_price, engagement_score, is_published, is_preorder, release_date, ai_content, ai_content_admin_override, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)';

// 'Unknown' rather than an empty string, and null for the two that are
// genuinely optional. The card falls back to the handle when artist_slug is
// there, which is better than the word Unknown, so a missing name and a
// missing slug are not the same thing.
export function flattenTrack(row) {
  if (!row) return null;
  return {
    ...row,
    artist_name:  row.artists?.artist_name || 'Unknown',
    artist_slug:  row.artists?.slug || null,
    artist_image: row.artists?.profile_image_url || null,
  };
}

// A track the player can actually do something with. An explicit
// is_published === false is a no; a missing file_url is a no, because
// playTrack returns on its first line without one and the silence that
// follows looks like a broken app rather than a missing file.
export function isPlayableRow(row) {
  return Boolean(row && row.is_published !== false && row.file_url);
}
