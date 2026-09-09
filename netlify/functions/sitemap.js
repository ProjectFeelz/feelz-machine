// netlify/functions/sitemap.js
// Generates a dynamic sitemap including all published artist profiles,
// albums, tracks, beats and newsletter posts.
// Access at: https://www.feelzmachine.com/sitemap.xml (via netlify.toml redirect)

const { createClient } = require('@supabase/supabase-js');

const BASE_URL = 'https://www.feelzmachine.com';

// ── The thing that breaks a whole sitemap ────────────────────────────────────
//
// Slugs went into the XML unescaped. One slug containing an ampersand makes
// the entire document invalid — not one bad URL, the whole file — and Search
// Console reports it as "Couldn't read" or a parse error with no indication of
// which line. Album and newsletter slugs are derived from titles, so an
// ampersand is a matter of when, not if.
//
// There are two layers against that now, and the ORDER matters. usableSlug
// below rejects such a slug outright, which is the better answer: a slug
// containing an ampersand or a space does not correspond to a route that
// exists, so escaping it would put a URL in the sitemap that 404s. Escaping is
// the second layer, for any value that does reach the output.
//
// Five characters have to be escaped in XML text, and & must be handled first
// or it would double-escape the entities the others produce.
function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// A slug that would produce a URL Google cannot fetch. Rejected rather than
// escaped, because the problem is the URL, not the encoding: a slug with a
// slash or a space in it points at a route that does not exist, and a
// submitted URL that 404s is its own Search Console error.
function usableSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  const s = slug.trim();
  if (!s || s === 'null' || s === 'undefined') return false;
  return /^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(s);
}

// The auto-generated names AuthContext used to create during the signup race —
// "jane-y9h0qq". Five are still on the platform. Their profile pages have no
// name and usually no music, so submitting them to Google earns a "Crawled,
// currently not indexed" at best and a soft 404 at worst.
const PLACEHOLDER_NAME = /^[a-z0-9]+-[a-z0-9]{6}$/;

const ISO_DAY = v => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);

function urlNode({ loc, lastmod, changefreq, priority }) {
  return `
  <url>
    <loc>${xmlEscape(loc)}</loc>${lastmod ? `
    <lastmod>${xmlEscape(lastmod)}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

// Google reported "Sitemap is HTML". That happens when this function throws:
// Netlify then serves its own error page, and Google sees HTML where XML
// should be. Every query is guarded and the whole thing is wrapped, so a
// failure still returns valid XML containing the static pages. A sitemap
// missing the artist URLs is a bad day. A sitemap that is actually an HTML
// error page is rejected outright.
exports.handler = async () => {
  try {
    return await buildSitemap();
  } catch (err) {
    console.error('[sitemap] failed, serving static-only sitemap:', err);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${BASE_URL}/</loc><priority>1.0</priority></url>
  <url><loc>${BASE_URL}/browse</loc><priority>0.9</priority></url>
  <url><loc>${BASE_URL}/schoolsessions</loc><priority>0.8</priority></url>
  <url><loc>${BASE_URL}/retail</loc><priority>0.8</priority></url>
  <url><loc>${BASE_URL}/about</loc><priority>0.6</priority></url>
</urlset>`,
    };
  }
};

async function buildSitemap() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Every one of these must have a canonical tag on the page that matches the
  // URL here. A page submitted in the sitemap that canonicals to somewhere
  // else is telling Google two contradictory things, and Google resolves it by
  // dropping the page — which is what "Alternate page with proper canonical
  // tag" means in the Pages report.
  const staticPages = [
    { url: '/',                priority: '1.0', changefreq: 'daily'   },
    { url: '/browse',          priority: '0.9', changefreq: 'daily'   },
    { url: '/about',           priority: '0.6', changefreq: 'monthly' },
    { url: '/schoolsessions',  priority: '0.8', changefreq: 'weekly'  },
    { url: '/retail',          priority: '0.8', changefreq: 'monthly' },
    { url: '/retail/terms',    priority: '0.3', changefreq: 'monthly' },
    { url: '/retail/privacy',  priority: '0.3', changefreq: 'monthly' },
    { url: '/competitions',    priority: '0.7', changefreq: 'weekly'  },
    { url: '/terms-of-use',    priority: '0.3', changefreq: 'monthly' },
    { url: '/privacy-policy',  priority: '0.3', changefreq: 'monthly' },
    { url: '/vs/spotify',      priority: '0.7', changefreq: 'monthly' },
    { url: '/vs/soundcloud',   priority: '0.7', changefreq: 'monthly' },
    { url: '/vs/bandcamp',     priority: '0.7', changefreq: 'monthly' },
    { url: '/vs/apple-music',  priority: '0.7', changefreq: 'monthly' },
  ];

  // In parallel. These were five sequential awaits, which is five round trips
  // stacked end to end inside a function with a ten-second budget — the shape
  // that turns into "Couldn't fetch" the moment the catalogue grows.
  const [
    { data: artists,         error: artistsError },
    { data: albums,          error: albumsError },
    { data: tracks,          error: tracksError },
    { data: beats,           error: beatsError },
    { data: newsletterPosts, error: newsletterError },
  ] = await Promise.all([
    // artist_name is selected so placeholder profiles can be filtered out, and
    // id so an artist can be checked for actually having music.
    supabase.from('artists')
      .select('id, slug, artist_name, updated_at')
      .not('slug', 'is', null)
      .limit(5000),

    supabase.from('albums')
      .select('slug, updated_at, artists(slug)')
      .eq('is_published', true)
      .not('slug', 'is', null)
      .limit(5000),

    // Published, non-beat tracks live at /track/:slug.
    // The sitemap protocol caps a single file at 50,000 URLs; if the catalogue
    // approaches that this has to become a sitemap index rather than one flat
    // file. Not a concern at current scale.
    supabase.from('tracks')
      .select('slug, artist_id, updated_at')
      .eq('is_published', true)
      .eq('is_beat', false)
      .not('slug', 'is', null)
      .limit(20000),

    // Beats live at /beat/:slug, not /track/:slug — kept separate so each
    // appears once, at its real canonical URL.
    supabase.from('tracks')
      .select('slug, artist_id, updated_at')
      .eq('is_published', true)
      .eq('is_beat', true)
      .not('slug', 'is', null)
      .limit(20000),

    // Newsletter posts are genuinely public whichever audience they were sent
    // to. `.not('slug','is',null)` matters: without it a draft with no slug
    // produced <loc>.../newsletter/null</loc>, a URL that 404s and gets
    // reported as "Submitted URL not found".
    supabase.from('newsletter_posts')
      .select('slug, created_at')
      .not('slug', 'is', null)
      .limit(5000),
  ]);

  // Logged rather than swallowed. A missing section is survivable; not knowing
  // which one failed is not.
  [['artists', artistsError], ['albums', albumsError], ['tracks', tracksError],
   ['beats', beatsError], ['newsletter', newsletterError]]
    .filter(([, e]) => e)
    .forEach(([name, e]) => console.error(`[sitemap] ${name} query failed:`, e.message));

  const now = new Date().toISOString().slice(0, 10);

  // Which artists actually have something on the page. An artist profile with
  // no published music is a real page with nothing on it, and submitting it
  // asks Google to index an empty result.
  const artistsWithMusic = new Set(
    [...(tracks || []), ...(beats || [])].map(t => t.artist_id).filter(Boolean)
  );

  const artistUrls = (artists || [])
    .filter(a => usableSlug(a.slug))
    .filter(a => artistsWithMusic.has(a.id))
    .filter(a => !(a.artist_name && PLACEHOLDER_NAME.test(a.artist_name)))
    .map(a => urlNode({
      loc: `${BASE_URL}/artist/${a.slug}`,
      lastmod: ISO_DAY(a.updated_at) || now,
      changefreq: 'weekly',
      priority: '0.8',
    }));

  const skippedArtists = (artists || []).length - artistUrls.length;
  if (skippedArtists > 0) {
    console.log(`[sitemap] ${skippedArtists} artist profile(s) left out: no published music, a placeholder name, or an unusable slug`);
  }

  const urls = [
    ...staticPages.map(p => urlNode({
      loc: `${BASE_URL}${p.url}`,
      lastmod: now,
      changefreq: p.changefreq,
      priority: p.priority,
    })),

    ...artistUrls,

    ...(albums || [])
      .filter(a => usableSlug(a.slug) && usableSlug(a.artists?.slug))
      .map(a => urlNode({
        loc: `${BASE_URL}/album/${a.artists.slug}/${a.slug}`,
        lastmod: ISO_DAY(a.updated_at) || now,
        changefreq: 'monthly',
        priority: '0.7',
      })),

    ...(tracks || [])
      .filter(t => usableSlug(t.slug))
      .map(t => urlNode({
        loc: `${BASE_URL}/track/${t.slug}`,
        lastmod: ISO_DAY(t.updated_at) || now,
        changefreq: 'monthly',
        priority: '0.6',
      })),

    ...(beats || [])
      .filter(b => usableSlug(b.slug))
      .map(b => urlNode({
        loc: `${BASE_URL}/beat/${b.slug}`,
        lastmod: ISO_DAY(b.updated_at) || now,
        changefreq: 'monthly',
        priority: '0.6',
      })),

    ...(newsletterPosts || [])
      .filter(n => usableSlug(n.slug))
      .map(n => urlNode({
        loc: `${BASE_URL}/newsletter/${n.slug}`,
        lastmod: ISO_DAY(n.created_at) || now,
        changefreq: 'never',
        priority: '0.5',
      })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}
</urlset>`;

  console.log(`[sitemap] ${urls.length} URLs, ${Buffer.byteLength(xml)} bytes`);

  return {
    statusCode: 200,
    headers: {
      // charset spelled out. Search Console is stricter about the sitemap's
      // content type than a browser is, and the document declares UTF-8 in its
      // prolog — the header should agree with it.
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Robots-Tag': 'noindex',
    },
    body: xml,
  };
}