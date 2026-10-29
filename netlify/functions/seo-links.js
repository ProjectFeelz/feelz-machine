/**
 * netlify/functions/seo-links.js
 *
 * The link graph, as JSON, for netlify/edge-functions/seo-html.js to inject
 * into the page before React mounts.
 *
 *
 * WHAT PROBLEM THIS SOLVES
 *
 * Google has crawled 20 of this site's 261 known pages. 233 are "Discovered,
 * currently not indexed": found, never fetched. The reason is in
 * netlify/lib/seoCatalogue.js at length, and it comes to one thing: there was
 * no crawlable path from the home page to anything. The shell has no links in
 * it, so a crawler that does not run JavaScript saw a site with exactly one
 * page.
 *
 * This answers, for any given page, "what else should a reader be able to get
 * to from here", and seo-html.js writes those out as real anchors. A visitor
 * sees them for the moment before React mounts and clears #root; a crawler
 * that never renders sees them as the whole page.
 *
 *
 * WHY EVERY PAGE GETS LINKS AND NOT JUST THE HUBS
 *
 * A hub page alone gives Google one route in and a flat site. Cross-links are
 * what make a catalogue look like a catalogue: an artist page listing that
 * artist's tracks, a track linking back to its artist and its genre. That is
 * also what a reader would expect to find, which is the test worth applying,
 * because anything built only for the crawler is cloaking with extra steps.
 *
 *
 * CACHING
 *
 * The whole catalogue is 119 artists and 136 tracks, so a page build is one
 * round of three queries. It is still cached in module scope for five minutes,
 * because a crawl arrives as a burst of requests against the same warm
 * instance and there is no reason for each of them to re-read the catalogue.
 * The cache is per instance and dies with it, which is the right lifetime for
 * something with no invalidation.
 */

const { createClient } = require('@supabase/supabase-js');
const { BASE_URL, genreSlug, loadCatalogue } = require('../lib/seoCatalogue');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };

async function catalogue() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await loadCatalogue(supabase);
  cache = { at: Date.now(), data };
  return data;
}

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    // Ten minutes, matching the Cache-Control seo-html puts on the page it
    // injects this into. A link list that is ten minutes stale is a link list
    // missing at most one new release.
    'Cache-Control': 'public, max-age=600',
  },
  body: JSON.stringify(body),
});

// How many links a single section carries. Not a performance limit: a list of
// four hundred links on one page reads as a link farm, and the point is a page
// a person could use. The catalogue is small enough that nothing is cut today.
const SECTION_CAP = 60;

const artistHref = a => `/artist/${a.slug}`;
const trackHref  = t => `/track/${t.slug}`;
const beatHref   = b => `/beat/${b.slug}`;
const albumHref  = a => `/album/${a.artists.slug}/${a.slug}`;
const genreHref  = g => `/genres/${g.slug}`;

function artistLinks(artists) {
  return artists.slice(0, SECTION_CAP).map(a => ({
    href: artistHref(a),
    label: a.artist_name || a.slug,
  }));
}

function trackLinks(tracks, artistById) {
  return tracks.slice(0, SECTION_CAP).map(t => {
    const a = artistById.get(t.artist_id);
    return {
      href: t.is_beat ? beatHref(t) : trackHref(t),
      label: t.title || t.slug,
      sub: a ? (a.artist_name || a.slug) : undefined,
    };
  });
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const type = String(q.type || '');
  const slug = q.slug ? String(q.slug) : null;

  try {
    const cat = await catalogue();
    const artistById = new Map(cat.artists.map(a => [a.id, a]));
    const artistBySlug = new Map(cat.artists.map(a => [a.slug, a]));

    const genreSection = {
      heading: 'Browse by genre',
      links: cat.genres.map(g => ({
        href: genreHref(g),
        label: g.name,
        sub: `${g.count} ${g.count === 1 ? 'track' : 'tracks'}`,
      })),
    };

    const newestTracks = {
      heading: 'New releases',
      links: trackLinks(cat.tracks.slice(0, 24), artistById),
    };

    const allArtists = {
      heading: 'Artists',
      links: artistLinks(cat.artists),
    };

    // ── The hubs ────────────────────────────────────────────────────────────

    if (type === 'home') {
      return json(200, {
        // The home page's own title and description in the shell are correct
        // and specific, so they are left alone. Only the links are new.
        sections: [
          genreSection,
          { heading: 'Artists', links: [{ href: '/artists', label: 'All artists on Feelz Machine', sub: `${cat.artists.length} artists` }, ...artistLinks(cat.artists.slice(0, 24))] },
          newestTracks,
          {
            heading: 'More',
            links: [
              { href: '/browse', label: 'Browse everything' },
              { href: '/sessions', label: 'School Sessions' },
              { href: '/retail', label: 'Feelz Retail, music for your business' },
              { href: '/about', label: 'About Feelz Machine' },
            ],
          },
        ],
      });
    }

    if (type === 'artists') {
      // Grouped A to Z, because 119 names in one run is a wall and the letter
      // headings are how a person actually finds somebody.
      const groups = new Map();
      cat.artists.forEach(a => {
        const first = String(a.artist_name || a.slug).trim().charAt(0).toUpperCase();
        const key = /[A-Z]/.test(first) ? first : '#';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(a);
      });
      const letters = [...groups.keys()].sort((x, y) => (x === '#' ? 1 : y === '#' ? -1 : x.localeCompare(y)));

      return json(200, {
        title: 'Artists on Feelz Machine',
        description: `Every artist releasing music on Feelz Machine, ${cat.artists.length} of them, listed A to Z. Independent music, paid directly to the people who made it.`,
        canonical: `${BASE_URL}/artists`,
        heading: 'Artists on Feelz Machine',
        intro: `${cat.artists.length} artists, listed A to Z.`,
        sections: letters.map(letter => ({
          heading: letter,
          links: groups.get(letter).map(a => ({ href: artistHref(a), label: a.artist_name || a.slug })),
        })),
      });
    }

    if (type === 'genre') {
      const genre = cat.genres.find(g => g.slug === slug);
      if (!genre) return json(404, { error: 'unknown_genre' });

      const inGenre = cat.tracks.filter(t => (t.genre || '').trim() === genre.name);
      const artistIds = new Set(inGenre.map(t => t.artist_id));
      const genreArtists = cat.artists.filter(a => artistIds.has(a.id));

      return json(200, {
        title: `${genre.name} on Feelz Machine`,
        description: `${genre.count} ${genre.name} ${genre.count === 1 ? 'track' : 'tracks'} from ${genreArtists.length} independent ${genreArtists.length === 1 ? 'artist' : 'artists'}, streaming and available to buy on Feelz Machine.`,
        canonical: `${BASE_URL}/genres/${genre.slug}`,
        heading: `${genre.name}`,
        intro: `${genre.count} ${genre.count === 1 ? 'track' : 'tracks'} from ${genreArtists.length} ${genreArtists.length === 1 ? 'artist' : 'artists'}.`,
        sections: [
          { heading: `${genre.name} tracks`, links: trackLinks(inGenre, artistById) },
          { heading: `Artists making ${genre.name}`, links: artistLinks(genreArtists) },
          { heading: 'Other genres', links: cat.genres.filter(g => g.slug !== genre.slug).map(g => ({ href: genreHref(g), label: g.name })) },
        ],
      });
    }

    if (type === 'browse') {
      return json(200, {
        sections: [
          genreSection,
          { heading: 'All tracks', links: trackLinks(cat.tracks, artistById) },
          { heading: 'Artists', links: [{ href: '/artists', label: 'All artists', sub: `${cat.artists.length} artists` }, ...artistLinks(cat.artists.slice(0, 24))] },
        ],
      });
    }

    // ── Cross-links on the entity pages ─────────────────────────────────────

    if (type === 'artist') {
      const artist = artistBySlug.get(slug);
      if (!artist) return json(404, { error: 'unknown_artist' });

      const theirTracks = cat.tracks.filter(t => t.artist_id === artist.id);
      const theirBeats  = cat.beats.filter(b => b.artist_id === artist.id);
      const theirAlbums = cat.albums.filter(a => a.artist_id === artist.id);
      const genres = [...new Set(theirTracks.map(t => (t.genre || '').trim()).filter(Boolean))];

      const sections = [];
      if (theirTracks.length) sections.push({ heading: `Tracks by ${artist.artist_name || artist.slug}`, links: trackLinks(theirTracks, artistById) });
      if (theirAlbums.length) sections.push({ heading: 'Releases', links: theirAlbums.map(a => ({ href: albumHref(a), label: a.title || a.slug })) });
      if (theirBeats.length)  sections.push({ heading: 'Beats', links: trackLinks(theirBeats, artistById) });
      if (genres.length)      sections.push({ heading: 'Genres', links: genres.map(g => ({ href: `/genres/${genreSlug(g)}`, label: g })) });
      sections.push({ heading: 'More on Feelz Machine', links: [{ href: '/artists', label: 'All artists' }, { href: '/browse', label: 'Browse everything' }] });

      return json(200, { sections });
    }

    if (type === 'track' || type === 'beat') {
      const pool = type === 'beat' ? cat.beats : cat.tracks;
      const item = pool.find(t => t.slug === slug);
      if (!item) return json(404, { error: 'unknown_track' });

      const artist = artistById.get(item.artist_id);
      const siblings = pool.filter(t => t.artist_id === item.artist_id && t.slug !== item.slug);
      const genre = (item.genre || '').trim();

      const sections = [];
      if (artist) sections.push({ heading: 'Artist', links: [{ href: artistHref(artist), label: artist.artist_name || artist.slug }] });
      if (siblings.length && artist) sections.push({ heading: `More from ${artist.artist_name || artist.slug}`, links: trackLinks(siblings, artistById) });
      if (genre) sections.push({ heading: 'Genre', links: [{ href: `/genres/${genreSlug(genre)}`, label: genre }] });
      sections.push({ heading: 'More on Feelz Machine', links: [{ href: '/artists', label: 'All artists' }, { href: '/browse', label: 'Browse everything' }] });

      return json(200, { sections });
    }

    if (type === 'album') {
      // The album slug arrives as "artistSlug/albumSlug", the shape its route
      // uses.
      const parts = String(slug || '').split('/');
      const album = cat.albums.find(a => a.artists.slug === parts[0] && a.slug === parts[1]);
      if (!album) return json(404, { error: 'unknown_album' });

      const artist = artistById.get(album.artist_id);
      const sections = [];
      if (artist) sections.push({ heading: 'Artist', links: [{ href: artistHref(artist), label: artist.artist_name || artist.slug }] });
      if (artist) {
        const theirTracks = cat.tracks.filter(t => t.artist_id === artist.id);
        if (theirTracks.length) sections.push({ heading: `Tracks by ${artist.artist_name || artist.slug}`, links: trackLinks(theirTracks, artistById) });
      }
      sections.push({ heading: 'More on Feelz Machine', links: [{ href: '/artists', label: 'All artists' }, { href: '/browse', label: 'Browse everything' }] });

      return json(200, { sections });
    }

    // ── The newsletter ──────────────────────────────────────────────────────
    //
    // These eighteen pages matter more than their traffic suggests. They are
    // the only pages on this site other than the home page that Google has
    // ever put in front of anybody: 90 days of Search Console shows the home
    // page and eighteen newsletter posts, and nothing else. Whatever small
    // standing the domain has is sitting in them.
    //
    // Until now they linked to nothing and they had no meta of their own
    // either, because og-meta.js has no newsletter type, so all eighteen
    // served the same title and the same description as the home page. Three
    // of the "not indexed" reasons in the coverage report are duplicate
    // canonicals, which is exactly what eighteen identical pages look like.
    //
    // So each post now carries its own title and excerpt, and links out to the
    // catalogue. That is both the honest thing for a reader at the end of an
    // article and the one place on this site with any authority to pass on.
    if (type === 'newsletter') {
      const post = cat.posts.find(p => p.slug === slug);
      if (!post) return json(404, { error: 'unknown_post' });

      const others = cat.posts.filter(p => p.slug !== post.slug).slice(0, 10);
      const excerpt = (post.excerpt || '').trim();

      return json(200, {
        title: `${post.title || post.slug} | Feelz Machine`,
        description: excerpt
          || `${post.title || 'An update'} from Feelz Machine, the independent music platform where artists keep what they earn.`,
        canonical: `${BASE_URL}/newsletter/${post.slug}`,
        heading: post.title || post.slug,
        intro: excerpt,
        sections: [
          newestTracks,
          { heading: 'Artists on Feelz Machine', links: [{ href: '/artists', label: 'All artists', sub: `${cat.artists.length} artists` }, ...artistLinks(cat.artists.slice(0, 18))] },
          genreSection,
          ...(others.length ? [{
            heading: 'More from the newsletter',
            links: others.map(p => ({ href: `/newsletter/${p.slug}`, label: p.title || p.slug })),
          }] : []),
        ],
      });
    }

    // Used by the sitemap to learn which genre pages exist, so the two cannot
    // disagree about which ones are real.
    if (type === 'genre-index') {
      return json(200, { genres: cat.genres });
    }

    return json(400, { error: 'unknown_type' });

  } catch (err) {
    // Never fatal to the page: seo-html treats any failure here as "no links
    // this time" and serves the page untouched.
    console.error('[seo-links]', err && err.message);
    return json(500, { error: 'failed' });
  }
};
