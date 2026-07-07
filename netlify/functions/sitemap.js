// netlify/functions/sitemap.js
// Generates a dynamic sitemap including all published artist profiles and albums
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