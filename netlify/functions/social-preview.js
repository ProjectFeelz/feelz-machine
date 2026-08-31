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

const CRAWLER_PATTERN = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|Slackbot|Discordbot|LinkedInBot|TelegramBot|Pinterest|redditbot|vkShare|SkypeUriPreview|W3C_Validator|Googlebot/i;

const ROUTE_PATTERNS = [
  { re: /^\/artist\/([^/]+)\/?$/, type: 'artist' },
  { re: /^\/track\/([^/]+)\/?$/, type: 'track' },
  { re: /^\/beat\/([^/]+)\/?$/, type: 'beat' },
  { re: /^\/schoolsessions\/?$/, type: 'schoolsessions' },
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

  try {
    const res = await fetch(ogUrl.toString());
    const html = await res.text();
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
    });
  } catch {
    // If the meta function fails for any reason, fall through to the
    // normal app rather than showing an error to the crawler.
    return context.next();
  }
};

export const config = {
  path: ['/artist/*', '/track/*', '/beat/*', '/schoolsessions'],
};