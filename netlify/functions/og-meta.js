// netlify/functions/og-meta.js
// Generates per-page Open Graph / Twitter Card HTML for social crawlers
// (Facebook, Twitter/X, WhatsApp, Slack, Discord, LinkedIn, etc.) — these
// don't execute JavaScript, so they never see the react-helmet-async tags
// the real app sets client-side. This function is what a crawler actually
// gets served, via the social-preview edge function routing it here.
//
// Usage: /.netlify/functions/og-meta?type=artist&slug=xxx
//        /.netlify/functions/og-meta?type=track&slug=xxx
//        /.netlify/functions/og-meta?type=beat&slug=xxx
//        /.netlify/functions/og-meta?type=schoolsessions

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL = 'https://www.feelzmachine.com';
const DEFAULT_IMAGE = `${SITE_URL}/og-default.png`;

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Short links: /t/<code> and /a/<code>.
//
// These are the links the share sheet hands out, and they had no preview at
// all. The short link is resolved in the BROWSER by ShortLinkPage, which
// calls resolve_short_code and then redirects. A crawler never runs that, so
// every shared short link showed the generic homepage card with no artwork.
//
// Resolving the code here turns the short link into the same type and slug
// the long URL would have used, and everything below then works unchanged.
async function resolveShortCode(code) {
  if (!code) return { type: null, slug: null };
  const { data, error } = await supabase.rpc('resolve_short_code', { p_code: code });
  if (error) {
    console.error('[og-meta] resolve_short_code failed:', error.code, error.message);
    return { type: null, slug: null };
  }
  const hit = Array.isArray(data) ? data[0] : data;
  if (!hit) return { type: null, slug: null };

  if (hit.kind === 'track' && hit.slug) return { type: 'track', slug: hit.slug };
  // Albums are looked up by id below, the same way ShortLinkPage redirects to
  // /album/<id>, because an album slug is only unique per artist.
  if (hit.kind === 'album' && hit.id)   return { type: 'album_id', slug: hit.id };
  return { type: null, slug: null };
}

async function buildMeta(type, slug) {
  let title = 'Feelz Machine';
  let description = 'Independent artists. Direct to fans. Stream, support and discover music — no middlemen.';
  let image = DEFAULT_IMAGE;
  let pageUrl = SITE_URL;
  // Structured data. The crawler only ever sees this HTML, so JSON-LD has to
  // be emitted here rather than by the React app, which a crawler never runs.
  let jsonLd = null;

  if (type === 'artist' && slug) {
    const { data: artist } = await supabase
      .from('artists')
      .select('artist_name, bio, profile_image_url')
      .eq('slug', slug)
      .maybeSingle();
    if (artist) {
      title = `${artist.artist_name} on Feelz Machine`;
      description = artist.bio ? artist.bio.slice(0, 160) : `Listen to ${artist.artist_name} on Feelz Machine`;
      image = artist.profile_image_url || DEFAULT_IMAGE;
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'MusicGroup',
        name: artist.artist_name,
        ...(artist.bio ? { description: artist.bio.slice(0, 300) } : {}),
        ...(artist.profile_image_url ? { image: artist.profile_image_url } : {}),
        url: `${SITE_URL}/artist/${slug}`,
      };
    }
    pageUrl = `${SITE_URL}/artist/${slug}`;
  }

  if (type === 'track' && slug) {
    const { data: track } = await supabase
      .from('tracks')
      .select('title, cover_artwork_url, artists(artist_name)')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (track) {
      const artistName = track.artists?.artist_name || 'Feelz Machine';
      title = `${track.title} by ${artistName}`;
      description = `Listen to "${track.title}" by ${artistName} on Feelz Machine`;
      image = track.cover_artwork_url || DEFAULT_IMAGE;
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'MusicRecording',
        name: track.title,
        byArtist: { '@type': 'MusicGroup', name: artistName },
        ...(track.cover_artwork_url ? { image: track.cover_artwork_url } : {}),
        url: `${SITE_URL}/track/${slug}`,
      };
    }
    pageUrl = `${SITE_URL}/track/${slug}`;
  }

  if (type === 'beat' && slug) {
    const { data: beat } = await supabase
      .from('tracks')
      .select('title, cover_artwork_url, bpm, beat_key, artists(artist_name)')
      .eq('slug', slug)
      .eq('is_published', true)
      .eq('is_beat', true)
      .maybeSingle();
    if (beat) {
      const artistName = beat.artists?.artist_name || 'Feelz Machine';
      title = `${beat.title} — beat by ${artistName}`;
      description = beat.bpm
        ? `${beat.bpm} BPM${beat.beat_key ? ` · ${beat.beat_key}` : ''} — license this beat on Feelz Machine`
        : `License "${beat.title}" by ${artistName} on Feelz Machine`;
      image = beat.cover_artwork_url || DEFAULT_IMAGE;
    }
    pageUrl = `${SITE_URL}/beat/${slug}`;
  }

  // Albums are listed in the sitemap but had no branch here, so every album
  // URL served the generic homepage title and description to crawlers.
  // Album routes carry two segments: /album/:artistSlug/:albumSlug
  if (type === 'album' && slug) {
    const [artistSlug, albumSlug] = slug.split('/');
    const { data: album } = await supabase
      .from('albums')
      .select('title, description, cover_artwork_url, release_date, release_type, artists(artist_name)')
      .eq('slug', albumSlug)
      .maybeSingle();
    if (album) {
      const artistName = album.artists?.artist_name || 'Feelz Machine';
      title = `${album.title} by ${artistName}`;
      description = album.description
        ? album.description.slice(0, 160)
        : `Listen to ${album.title} by ${artistName} on Feelz Machine`;
      image = album.cover_artwork_url || DEFAULT_IMAGE;
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'MusicAlbum',
        name: album.title,
        byArtist: { '@type': 'MusicGroup', name: artistName },
        ...(album.cover_artwork_url ? { image: album.cover_artwork_url } : {}),
        ...(album.release_date ? { datePublished: album.release_date } : {}),
        url: `${SITE_URL}/album/${artistSlug}/${albumSlug}`,
      };
    }
    pageUrl = `${SITE_URL}/album/${slug}`;
  }

  // An album reached through a short link, where all we have is its id.
  // Same card as the branch above, looked up a different way.
  if (type === 'album_id' && slug) {
    const { data: album } = await supabase
      .from('albums')
      .select('title, slug, description, cover_artwork_url, release_date, artists(artist_name, slug)')
      .eq('id', slug)
      .maybeSingle();
    if (album) {
      const artistName = album.artists?.artist_name || 'Feelz Machine';
      title = `${album.title} by ${artistName}`;
      description = album.description
        ? album.description.slice(0, 160)
        : `Listen to ${album.title} by ${artistName} on Feelz Machine`;
      image = album.cover_artwork_url || DEFAULT_IMAGE;
      pageUrl = album.artists?.slug && album.slug
        ? `${SITE_URL}/album/${album.artists.slug}/${album.slug}`
        : `${SITE_URL}/album/${slug}`;
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'MusicAlbum',
        name: album.title,
        byArtist: { '@type': 'MusicGroup', name: artistName },
        ...(album.cover_artwork_url ? { image: album.cover_artwork_url } : {}),
        ...(album.release_date ? { datePublished: album.release_date } : {}),
        url: pageUrl,
      };
    } else {
      pageUrl = `${SITE_URL}/album/${slug}`;
    }
  }

  if (type === 'schoolsessions') {
    const { data: comp } = await supabase
      .from('competitions')
      .select('prize_description, prize_breakdown_text')
      .eq('is_school_sessions', true)
      .maybeSingle();
    title = 'School Sessions — Feelz Machine';
    description = comp?.prize_breakdown_text || comp?.prize_description
      || 'A high school music competition on Feelz Machine. Pick a song from the shortlist and cover it — cash prizes for the winning school and student.';
    pageUrl = `${SITE_URL}/schoolsessions`;
  }

  return { title, description, image, pageUrl, jsonLd };
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  let type = params.type;
  let slug = params.slug;

  let meta;
  try {
    // A short link carries a code, not a slug. Turn it into the real thing
    // first, then the rest of this function does not need to know the
    // difference.
    if (type === 'short') {
      const resolved = await resolveShortCode(slug);
      type = resolved.type;
      slug = resolved.slug;
    }
    meta = await buildMeta(type, slug);
  } catch (e) {
    console.error('og-meta error:', e);
    meta = { title: 'Feelz Machine', description: 'Independent artists. Direct to fans.', image: DEFAULT_IMAGE, pageUrl: SITE_URL, jsonLd: null };
  }

  const { title, description, image, pageUrl, jsonLd } = meta;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <link rel="canonical" href="${esc(pageUrl)}" />
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Feelz Machine" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  <meta http-equiv="refresh" content="0; url=${esc(pageUrl)}" />
</head>
<body>Redirecting...</body>
</html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=1800' },
    body: html,
  };
};