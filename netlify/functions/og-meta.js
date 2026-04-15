const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL = 'https://www.feelzmachine.com';
const DEFAULT_IMAGE = `${SITE_URL}/og-default.png`;

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const artistSlug = params.artist;
  const trackSlug = params.track;

  let title = 'Feelz Machine';
  let description = 'Discover independent artists on Feelz Machine';
  let image = DEFAULT_IMAGE;

  try {
    if (artistSlug) {
      const { data: artist } = await supabase
        .from('artists')
        .select('name, bio, avatar_url, cover_image_url')
        .eq('slug', artistSlug)
        .maybeSingle();

      if (artist) {
        title = `${artist.name} on Feelz Machine`;
        description = artist.bio ? artist.bio.slice(0, 160) : `Listen to ${artist.name} on Feelz Machine`;
        image = artist.cover_image_url || artist.avatar_url || DEFAULT_IMAGE;
      }

      if (trackSlug) {
        const { data: track } = await supabase
          .from('tracks')
          .select('title, cover_artwork_url, artist_name')
          .eq('slug', trackSlug)
          .maybeSingle();

        if (track) {
          title = `${track.title} by ${track.artist_name || artist?.name}`;
          description = `Listen to ${track.title} on Feelz Machine`;
          image = track.cover_artwork_url || image;
        }
      }
    }
  } catch (e) {
    console.error('og-meta error:', e);
  }

  const pageUrl = artistSlug
    ? `${SITE_URL}/artist/${artistSlug}${trackSlug ? `?track=${trackSlug}` : ''}`
    : SITE_URL;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
  <meta http-equiv="refresh" content="0; url=${pageUrl}" />
</head>
<body>Redirecting...</body>
</html>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: html,
  };
};
```

---

**File 2 — `netlify.toml`, add this ABOVE the `/*` catch-all redirect:**

Find:
```
[[redirects]]
  from = "/*"
    to = "/index.html"
      status = 200
```

Replace with:
```
[[redirects]]
  from = "/artist/:slug"
  to = "/.netlify/functions/og-meta?artist=:slug"
  status = 200
  force = true
  conditions = {UserAgent = ["Twitterbot", "facebookexternalhit", "WhatsApp", "LinkedInBot", "Slackbot", "Discordbot", "TelegramBot", "iMessageBot", "Googlebot"]}

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

**File 3 — `public/index.html`, add inside `<head>`:**

Find:
```
<title>Feelz Machine</title>
```

Replace with:
```
<title>Feelz Machine</title>
<meta property="og:title" content="Feelz Machine" />
<meta property="og:description" content="Discover independent artists on Feelz Machine" />
<meta property="og:image" content="https://www.feelzmachine.com/og-default.png" />
<meta property="og:url" content="https://www.feelzmachine.com" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
