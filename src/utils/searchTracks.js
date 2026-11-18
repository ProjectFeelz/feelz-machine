/**
 * src/utils/searchTracks.js
 *
 * Finds published tracks on Feelz Machine by song title or by artist name,
 * for picking music in live streams (listening party queue, review polls).
 * Title matches come first, then tracks by artists whose name matches.
 *
 *   const rows = await searchTracks(supabase, 'koda', { exclude: [id, ...] });
 *   // [{ id, title, cover_artwork_url, duration, artist_id, artist_name }]
 */

const clean = (q) => String(q || '').trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ');

export async function searchTracks(supabase, query, { limit = 12, exclude = [] } = {}) {
  const q = clean(query);
  if (q.length < 2) return [];
  const cols = 'id, title, cover_artwork_url, duration, artist_id, artists(artist_name)';

  const [byTitle, artistsRes] = await Promise.all([
    supabase.from('tracks').select(cols)
      .eq('is_published', true).ilike('title', `%${q}%`)
      .order('stream_count', { ascending: false, nullsFirst: false }).limit(limit),
    supabase.from('artists').select('id').ilike('artist_name', `%${q}%`).limit(10),
  ]);

  const artistIds = (artistsRes.data || []).map(a => a.id);
  const byArtist = artistIds.length
    ? await supabase.from('tracks').select(cols)
        .eq('is_published', true).in('artist_id', artistIds)
        .order('stream_count', { ascending: false, nullsFirst: false }).limit(limit)
    : { data: [] };

  const skip = new Set(exclude);
  const seen = new Set();
  const out = [];
  for (const t of [...(byTitle.data || []), ...(byArtist.data || [])]) {
    if (seen.has(t.id) || skip.has(t.id)) continue;
    seen.add(t.id);
    out.push({ ...t, artist_name: t.artists?.artist_name || '' });
    if (out.length >= limit) break;
  }
  return out;
}

export default searchTracks;
