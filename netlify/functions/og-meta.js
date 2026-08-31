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

async function buildMeta(type, slug) {
  let title = 'Feelz Machine';
  let description = 'Independent artists. Direct to fans. Stream, support and discover music — no middlemen.';
  let image = DEFAULT_IMAGE;
  let pageUrl = SITE_URL;

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

  return { title, description, image, pageUrl };
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const type = params.type;
  const slug = params.slug;

  let meta;
  try {
    meta = await buildMeta(type, slug);
  } catch (e) {
    console.error('og-meta error:', e);
    meta = { title: 'Feelz Machine', description: 'Independent artists. Direct to fans.', image: DEFAULT_IMAGE, pageUrl: SITE_URL };
  }

  const { title, description, image, pageUrl } = meta;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
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