// netlify/functions/sitemap.js
// Generates a dynamic sitemap including all published artist profiles,
// albums, tracks, beats, and School Sessions.
// Access at: https://www.feelzmachine.com/sitemap.xml (via netlify.toml redirect)

const { createClient } = require('@supabase/supabase-js');

const BASE_URL = 'https://www.feelzmachine.com';

exports.handler = async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Static pages
  const staticPages = [
    { url: '/',             priority: '1.0', changefreq: 'daily'   },
    { url: '/browse',       priority: '0.9', changefreq: 'daily'   },
    { url: '/about',        priority: '0.6', changefreq: 'monthly' },
    { url: '/schoolsessions', priority: '0.8', changefreq: 'weekly' },
    { url: '/retail',       priority: '0.8', changefreq: 'monthly' },
    { url: '/retail/terms',   priority: '0.3', changefreq: 'monthly' },
    { url: '/retail/privacy', priority: '0.3', changefreq: 'monthly' },
    { url: '/competitions', priority: '0.7', changefreq: 'weekly'  },
    { url: '/terms-of-use', priority: '0.3', changefreq: 'monthly' },
    { url: '/privacy-policy', priority: '0.3', changefreq: 'monthly' },
    { url: '/vs/spotify',      priority: '0.7', changefreq: 'monthly' },
    { url: '/vs/soundcloud',   priority: '0.7', changefreq: 'monthly' },
    { url: '/vs/bandcamp',     priority: '0.7', changefreq: 'monthly' },
    { url: '/vs/apple-music',  priority: '0.7', changefreq: 'monthly' },
  ];

  // Fetch all published artists
  const { data: artists } = await supabase
    .from('artists')
    .select('slug, updated_at')
    .not('slug', 'is', null)
    .limit(5000);

  // Fetch all published albums
  const { data: albums } = await supabase
    .from('albums')
    .select('slug, updated_at, artists(slug)')
    .eq('is_published', true)
    .not('slug', 'is', null)
    .limit(5000);

  // Fetch all published, non-beat tracks — these live at /track/:slug.
  // Sitemap protocol caps at 50,000 URLs per file; if track count ever
  // approaches that, this needs to split into a sitemap index instead of
  // one flat file. Not a concern at current scale.
  const { data: tracks } = await supabase
    .from('tracks')
    .select('slug, updated_at')
    .eq('is_published', true)
    .eq('is_beat', false)
    .not('slug', 'is', null)
    .limit(20000);

  // Beats live at /beat/:slug, not /track/:slug — kept separate so each
  // only appears once in the sitemap, at its actual canonical URL.
  const { data: beats } = await supabase
    .from('tracks')
    .select('slug, updated_at')
    .eq('is_published', true)
    .eq('is_beat', true)
    .not('slug', 'is', null)
    .limit(20000);

  // Newsletter posts — genuinely public content regardless of which
  // audience they were originally sent to, so both audiences' posts are
  // included here.
  const { data: newsletterPosts } = await supabase
    .from('newsletter_posts')
    .select('slug, created_at')
    .limit(5000);

  const now = new Date().toISOString().split('T')[0];

  const urls = [
    ...staticPages.map(p => `
  <url>
    <loc>${BASE_URL}${p.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),

    ...(artists || []).map(a => `
  <url>
    <loc>${BASE_URL}/artist/${a.slug}</loc>
    <lastmod>${a.updated_at ? a.updated_at.split('T')[0] : now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`),

    ...(albums || []).filter(a => a.artists?.slug && a.slug).map(a => `
  <url>
    <loc>${BASE_URL}/album/${a.artists.slug}/${a.slug}</loc>
    <lastmod>${a.updated_at ? a.updated_at.split('T')[0] : now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`),

    ...(tracks || []).map(t => `
  <url>
    <loc>${BASE_URL}/track/${t.slug}</loc>
    <lastmod>${t.updated_at ? t.updated_at.split('T')[0] : now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`),

    ...(beats || []).map(b => `
  <url>
    <loc>${BASE_URL}/beat/${b.slug}</loc>
    <lastmod>${b.updated_at ? b.updated_at.split('T')[0] : now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`),

    ...(newsletterPosts || []).map(n => `
  <url>
    <loc>${BASE_URL}/newsletter/${n.slug}</loc>
    <lastmod>${n.created_at ? n.created_at.split('T')[0] : now}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.5</priority>
  </url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('')}
</urlset>`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
    body: xml,
  };
};