// netlify/edge-functions/social-preview.js
// Social crawlers (Facebook, Twitter/X, WhatsApp, Slack, Discord, LinkedIn,
// Telegram) don't run JavaScript — they only ever see whatever HTML this
// request returns. Everything else (real browsers, Googlebot, which does
// run JS) falls through to the normal React app untouched.
//
// Without this, every shared link — an artist profile, a track, a beat, the
// School Sessions page — showed the same generic homepage preview, because
// the per-page meta tags react-helmet-async sets are invisible to a crawler
// that never executes the JS that sets them.

const CRAWLER_PATTERN = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|Slackbot|Discordbot|LinkedInBot|TelegramBot|Pinterest|redditbot|vkShare|SkypeUriPreview|W3C_Validator/i;

const ROUTE_PATTERNS = [
  { re: /^\/artist\/([^/]+)\/?$/, type: 'artist' },
  { re: /^\/track\/([^/]+)\/?$/, type: 'track' },
  { re: /^\/beat\/([^/]+)\/?$/, type: 'beat' },
  // Albums are two segments: /album/:artistSlug/:albumSlug. They are in the
  // sitemap, so crawlers were being pointed at pages that served the generic
  // homepage meta.
  { re: /^\/album\/([^/]+\/[^/]+)\/?$/, type: 'album' },
  { re: /^\/schoolsessions\/?$/, type: 'schoolsessions' },
  // The short links the share sheet hands out. These had no preview at all:
  // /t/<code> is resolved in the browser by ShortLinkPage, which a crawler
  // never runs, so every shared short link showed the generic homepage card
  // with no artwork on it. og-meta resolves the code server side instead.
  { re: /^\/t\/([^/]+)\/?$/, type: 'short' },
  { re: /^\/a\/([^/]+)\/?$/, type: 'short' },
];

export default async (request, context) => {
  const userAgent = request.headers.get('user-agent') || '';
  if (!CRAWLER_PATTERN.test(userAgent)) {
    return context.next();
  }

  const url = new URL(request.url);
  let type = null;
  let slug = null;

  for (const { re, type: t } of ROUTE_PATTERNS) {
    const match = url.pathname.match(re);
    if (match) {
      type = t;
      slug = match[1] || null;
      break;
    }
  }

  if (!type) {
    return context.next();
  }

  const ogUrl = new URL('/.netlify/functions/og-meta', url.origin);
  ogUrl.searchParams.set('type', type);
  if (slug) ogUrl.searchParams.set('slug', slug);

  // Budgeted, because this function has no budget of its own.
  //
  // og-meta does a Supabase round trip and runs on Netlify's 10 second default.
  // This fetch had no timeout and no res.ok check, so a slow og-meta held the
  // edge invocation open until the PLATFORM killed it — and a platform kill is
  // a 5xx that never reaches the catch below, because nothing was thrown.
  // Three seconds is well inside the edge limit and far more than a healthy
  // og-meta needs; past that, the crawler gets the app rather than an error.
  const abort = AbortController ? new AbortController() : null;
  const timer = abort ? setTimeout(() => abort.abort(), 3000) : null;

  try {
    const res = await fetch(ogUrl.toString(), abort ? { signal: abort.signal } : undefined);
    if (!res.ok) {
      // A 500 from og-meta used to be returned to the crawler AS the page,
      // with status 200 and an error body, which is worse than no preview.
      return context.next();
    }
    const html = await res.text();
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
    });
  } catch {
    // Timed out, refused, or threw. Fall through to the normal app rather
    // than showing an error to the crawler.
    return context.next();
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const config = {
  path: ['/artist/*', '/track/*', '/beat/*', '/album/*', '/schoolsessions', '/t/*', '/a/*'],
};