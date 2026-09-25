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

// ── The picture on the card ──────────────────────────────────────────────────
//
// THIS IS WHY LINKS HAD NO THUMBNAIL.
//
// Everything else about previews was working. The routing was right, this
// function returned the right title and the right image address. Measured on
// the live catalogue, what it was handing over was:
//
//   a track cover      2553 KB   1254 x 1254
//   an album cover     1491 KB   1024 x 1024
//   an artist photo    2668 KB   2204 x 4076
//
// WhatsApp will not draw a preview picture that big. It fetches the image, sees
// the size, and gives up, so you get the card with the words on it and a blank
// space where the artwork should be. That is exactly what was on screen.
// Facebook and X allow more, but they are slower with a heavy file and X
// ignores a picture as tall and narrow as that artist photo.
//
// So the fix is not more routing. It is to stop sending a 2.5 MB original and
// send a picture made for the job.
//
// Supabase resizes on its side and caches the result, the same way the app does
// through src/utils/coverUrl.js. 1200 x 630 is the size every platform asks for.
// `cover` fills that rectangle and crops the overflow, which is right here: a
// social card is a fixed shape, and letterboxing a tall photo into it leaves
// grey bars. The app uses `contain` because it draws its own square.
//
// Measured after this change: around 60 to 120 KB. Comfortably inside every
// platform's limit, and it arrives quickly, which matters because a crawler
// gives up on a slow image.
//
// An address that is not a Supabase public object, our own og-default.png, is
// handed back untouched.
const PUBLIC_PATH = '/storage/v1/object/public/';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Resizing at Supabase is not enough on its own, because Supabase keeps the
// source format and most of the artwork on this platform is PNG. A 1200 x 630
// PNG is still over a megabyte. og-image.js re-encodes it as a JPEG, which is
// what makes it small enough to be drawn. The full reasoning, with the measured
// numbers, is in the header of that file.
//
// Anything that is not a Supabase public object, our own og-default.png, is
// handed back as it is. og-image would refuse it anyway.
function cardImage(url) {
  if (!url || typeof url !== 'string') return DEFAULT_IMAGE;
  if (!url.includes(PUBLIC_PATH)) return url;
  return `${SITE_URL}/.netlify/functions/og-image?u=${encodeURIComponent(url)}`;
}

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
  let description = 'Independent artists. Direct to fans. Stream, support and discover music. No middlemen.';
  let image = DEFAULT_IMAGE;
  let pageUrl = SITE_URL;
  // Structured data. The crawler only ever sees this HTML, so JSON-LD has to
  // be emitted here rather than by the React app, which a crawler never runs.
  let jsonLd = null;

  if (type === 'artist' && slug) {
    const { data: artist } = await supabase
      .from('artists')
      .select('id, artist_name, bio, profile_image_url')
      .eq('slug', slug)
      .maybeSingle();
    if (artist) {
      title = `${artist.artist_name} on Feelz Machine`;
      description = artist.bio ? artist.bio.slice(0, 160) : `Listen to ${artist.artist_name} on Feelz Machine`;

      // An artist with no photo used to get the plain Feelz Machine card, the
      // FM logo and nothing else. On a music platform that is a wasted card:
      // the artist almost always has artwork, it is just on their songs rather
      // than on their face. Measured on the live catalogue, five of the twelve
      // artists checked had no photo, and every one of them had cover art.
      //
      // So we borrow it. Most played first, because that is the song they are
      // known for, then newest as a tie break. Only published tracks, so a
      // draft cover never ends up on a shared link.
      //
      // The generic card is still there for an artist with no photo AND no
      // published music, which is the only case where there is genuinely
      // nothing of theirs to show.
      image = artist.profile_image_url || DEFAULT_IMAGE;
      if (!artist.profile_image_url && artist.id) {
        const { data: fallback } = await supabase
          .from('tracks')
          .select('cover_artwork_url')
          .eq('artist_id', artist.id)
          .eq('is_published', true)
          .not('cover_artwork_url', 'is', null)
          // stream_count, not play_count. play_count exists in this codebase
          // but it is a localStorage key and a notification field, not a column
          // on tracks. Ordering by a column that does not exist makes PostgREST
          // return an error, and the fallback would silently never fire.
          .order('stream_count', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallback?.cover_artwork_url) image = fallback.cover_artwork_url;
      }
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
      title = `${beat.title}, a beat by ${artistName}`;
      description = beat.bpm
        ? `${beat.bpm} BPM${beat.beat_key ? ` · ${beat.beat_key}` : ''}. License this beat on Feelz Machine.`
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
    title = 'School Sessions on Feelz Machine';
    description = comp?.prize_breakdown_text || comp?.prize_description
      || 'A high school music competition on Feelz Machine. Pick a song from the shortlist and cover it. Cash prizes for the winning school and student.';
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

  // Resized here, in one place, rather than at each of the five branches above.
  // Those branches decide WHICH picture; this decides what shape it arrives in.
  // The JSON-LD above deliberately keeps the full size original, because that
  // is structured data about the work, not a card.
  const cardImg = cardImage(image);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <link rel="canonical" href="${esc(pageUrl)}" />
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(cardImg)}" />
  <meta property="og:image:secure_url" content="${esc(cardImg)}" />
  <meta property="og:image:width" content="${OG_WIDTH}" />
  <meta property="og:image:height" content="${OG_HEIGHT}" />
  <meta property="og:image:alt" content="${esc(title)}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Feelz Machine" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(cardImg)}" />
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