// netlify/edge-functions/social-preview-handle.js
//
// Previews for the /@handle links.
//
// WHY THIS IS A SEPARATE FILE
//
// This is the same job as social-preview.js and the code below is nearly the
// same. It is not merged into that file on purpose.
//
// social-preview.js says which paths it wants in its own `export const config`,
// as a list of URL patterns. Adding '/@*' to that list stopped the whole
// function being registered: not just the handle links, ALL of them. Songs,
// artists, albums, every preview on the platform went back to the plain
// homepage card overnight, while the thing that builds the card carried on
// answering perfectly when called directly. The "@" is not something that list
// will take.
//
// So the handle paths are claimed a different way, by a plain regular
// expression in netlify.toml, which never goes near a URL pattern. And they are
// claimed by THIS function rather than that one, so that if the regular
// expression is wrong the only thing that stops working is handle links.
// social-preview.js cannot be taken down by anything written here.
//
// That is the whole point of the split. Please keep it.

const CRAWLER_PATTERN = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|Slackbot|Discordbot|LinkedInBot|TelegramBot|Pinterest|redditbot|vkShare|SkypeUriPreview|W3C_Validator/i;

// Longest first. /@h/album/s has to be tested before /@h, or the bare handle
// would swallow it.
//
// og-meta's album branch splits its slug on "/" and expects artist/album,
// which is exactly the shape the handle form already has.
const ROUTE_PATTERNS = [
  { re: /^\/@([^/]+)\/(?:single|track)\/([^/]+)\/?$/, type: 'track',  slug: (m) => m[2] },
  { re: /^\/@([^/]+)\/beat\/([^/]+)\/?$/,             type: 'beat',   slug: (m) => m[2] },
  { re: /^\/@([^/]+)\/album\/([^/]+)\/?$/,            type: 'album',  slug: (m) => `${m[1]}/${m[2]}` },
  { re: /^\/@([^/]+)\/?$/,                            type: 'artist', slug: (m) => m[1] },
];

export default async (request, context) => {
  const url = new URL(request.url);

  // Same test switch as social-preview.js. Put ?_preview=1 on a handle link in
  // any browser and you see exactly what WhatsApp sees.
  //
  //   feelzmachine.com/@<handle>?_preview=1
  //
  // A page of meta tags means this function is running. The normal app means
  // it is not registered, and the netlify.toml pattern is what to look at.
  const forced = url.searchParams.get('_preview') === '1';

  const userAgent = request.headers.get('user-agent') || '';
  if (!forced && !CRAWLER_PATTERN.test(userAgent)) {
    return context.next();
  }

  let type = null;
  let slug = null;

  for (const { re, type: t, slug: pick } of ROUTE_PATTERNS) {
    const match = url.pathname.match(re);
    if (match) {
      type = t;
      slug = pick(match) || null;
      break;
    }
  }

  // A /@ path we do not recognise, /@handle/settings say. Hand it back.
  if (!type || !slug) {
    return context.next();
  }

  const ogUrl = new URL('/.netlify/functions/og-meta', url.origin);
  ogUrl.searchParams.set('type', type);
  ogUrl.searchParams.set('slug', slug);

  // Budgeted, for the same reason social-preview.js is. This function has no
  // time limit of its own, so a slow og-meta would hold it open until the
  // platform killed it, and a platform kill is a 5xx the catch below never
  // sees, because nothing was thrown. Three seconds is far more than a healthy
  // og-meta needs. Past that the crawler gets the app instead of an error.
  const abort = AbortController ? new AbortController() : null;
  const timer = abort ? setTimeout(() => abort.abort(), 3000) : null;

  try {
    const res = await fetch(ogUrl.toString(), abort ? { signal: abort.signal } : undefined);
    if (!res.ok) return context.next();
    const html = await res.text();
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
    });
  } catch {
    return context.next();
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// NO `export const config` HERE, ON PURPOSE.
//
// The paths this function answers on are declared in netlify.toml, as a regular
// expression, because a URL pattern will not take the "@". See the
// [[edge_functions]] block there.