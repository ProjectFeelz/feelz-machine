/**
 * netlify/lib/seoCatalogue.js
 *
 * The catalogue, filtered down to the pages that are worth pointing a crawler
 * at, in one place so the sitemap and the on-page links cannot disagree.
 *
 *
 * WHY THIS EXISTS
 *
 * Search Console, today: 20 pages indexed, 241 not, and 233 of those 241 are
 * "Discovered, currently not indexed", which means Google found the URL and
 * has never once fetched it. /artist/stevecsa has a last-crawl date of N/A. In
 * ninety days not one artist, track, album or beat page has had a single
 * impression; every click the site has ever had went to the home page or a
 * newsletter post.
 *
 * The sitemap is not the problem. It is read daily and reports 276 URLs,
 * Success. A sitemap is a suggestion. What makes Google spend a crawl on a URL
 * is evidence that the page matters, and the strongest evidence is other pages
 * linking to it.
 *
 * This site had none. seo-html.js injects real content, but only on
 * /artist/*, /track/*, /beat/*, /album/* and /sessions. The home page served
 * the bare React shell, whose entire body text is "You need to enable
 * JavaScript to run Feelz Machine" and which contains no links at all. So
 * Googlebot's only route to any of the 269 content pages was the sitemap and
 * two links on projectfeelz.com. There was no path through the site itself.
 *
 *
 * WHY THE FILTERS HAVE TO MATCH THE SITEMAP'S
 *
 * Linking to a page the sitemap leaves out, or leaving out a page the sitemap
 * submits, is two contradictory signals about the same URL. The predicates the
 * sitemap already uses are defined here and required by both, rather than
 * written twice and allowed to drift.
 *
 * The catalogue is small enough that every page fits: 119 artists, 136
 * published tracks, 14 albums, 14 genres. Nothing needs paging, and every
 * content page can be reached from the home page in two clicks.
 */

const BASE_URL = 'https://www.feelzmachine.com';

// A slug that would produce a URL Google cannot fetch. Rejected rather than
// escaped, because the problem is the URL and not the encoding: a slug with a
// slash or a space in it points at a route that does not exist.
function usableSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const s = slug.trim();
  if (!s || s === 'null' || s === 'undefined') return false;
  return /^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(s);
}

// The auto-generated names the signup race used to create, "jane-y9h0qq".
// Their profile pages have no name and usually no music.
const PLACEHOLDER_NAME = /^[a-z0-9]+-[a-z0-9]{6}$/;

/**
 * A genre's URL segment.
 *
 * Ampersand becomes "and" rather than being dropped, because "R&B" and "R B"
 * would otherwise both slug to "r-b" and two genres would share one page.
 * Live genres today: R&B, Hip Hop, Trap, Dancehall, Lo-Fi, Other, Afrobeat,
 * Drill, Neo Soul, Tech House, Pop, Drum & Bass, Deep House, Boom Bap.
 *
 * src/pages/GenrePage.js carries the same function, because the browser cannot
 * require this file. If one changes, the other has to. The React page finds a
 * genre by slugging every genre it loads and comparing, so the two only have
 * to agree with each other and never with a stored value.
 */
function genreSlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Everything the link graph is built from, in one round of parallel queries.
 *
 * Returns artists, tracks, beats and albums already filtered exactly as the
 * sitemap filters them, plus the genre list derived from the tracks that
 * survived. An artist with no published music is dropped: a profile page with
 * nothing on it is a page Google will crawl once and never return to, and
 * linking to it spends the little crawl budget this site has on an empty room.
 */
async function loadCatalogue(supabase) {
  const [
    { data: artists, error: artistsError },
    { data: allTracks, error: tracksError },
    { data: albums, error: albumsError },
  ] = await Promise.all([
    supabase.from('artists')
      .select('id, slug, artist_name, genre, follower_count, updated_at')
      .not('slug', 'is', null)
      .limit(5000),

    // Beats and tracks come back together and are split here, because they
    // live at different routes (/beat/:slug and /track/:slug) and the one
    // query is cheaper than two.
    supabase.from('tracks')
      .select('id, slug, title, artist_id, genre, is_beat, created_at')
      .eq('is_published', true)
      .not('slug', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20000),

    supabase.from('albums')
      .select('slug, title, artist_id, created_at, artists(slug, artist_name)')
      .eq('is_published', true)
      .not('slug', 'is', null)
      .limit(5000),
  ]);

  // Logged rather than swallowed. A missing section is survivable; not knowing
  // which one failed is not.
  [['artists', artistsError], ['tracks', tracksError], ['albums', albumsError]]
    .filter(([, e]) => e)
    .forEach(([name, e]) => console.error(`[seo-catalogue] ${name} query failed:`, e.message));

  const tracks = (allTracks || []).filter(t => !t.is_beat && usableSlug(t.slug));
  const beats  = (allTracks || []).filter(t => t.is_beat && usableSlug(t.slug));

  const hasMusic = new Set([...tracks, ...beats].map(t => t.artist_id).filter(Boolean));

  const liveArtists = (artists || [])
    .filter(a => usableSlug(a.slug))
    .filter(a => hasMusic.has(a.id))
    .filter(a => !(a.artist_name && PLACEHOLDER_NAME.test(a.artist_name)))
    .sort((a, b) => String(a.artist_name || '').localeCompare(String(b.artist_name || '')));

  const liveAlbums = (albums || [])
    .filter(a => usableSlug(a.slug) && usableSlug(a.artists && a.artists.slug));

  // Genres come from the tracks rather than from a fixed list, so a genre page
  // only exists while something is actually in it. An empty genre page is the
  // same wasted crawl as an empty artist page.
  const genreCounts = new Map();
  tracks.forEach(t => {
    const g = (t.genre || '').trim();
    if (!g) return;
    genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
  });
  const genres = [...genreCounts.entries()]
    .map(([name, count]) => ({ name, slug: genreSlug(name), count }))
    .filter(g => g.slug)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { artists: liveArtists, tracks, beats, albums: liveAlbums, genres };
}

module.exports = {
  BASE_URL,
  usableSlug,
  PLACEHOLDER_NAME,
  genreSlug,
  loadCatalogue,
};
