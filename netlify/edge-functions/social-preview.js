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

// ── Who gets the preview ─────────────────────────────────────────────────────
//
// The old list named thirteen crawlers. Anything not on it got the app, which
// for something that does not run JavaScript means the plain Feelz Machine
// card with no artwork. Tested against a real third party unfurler: the same
// link showed the full card with ?_preview=1 forcing the crawler path, and the
// generic card without it. The pipeline was never the problem. The list was.
//
// A named list cannot be kept complete. New apps appear, existing ones change
// their user agent, and each time a link quietly stops carrying its picture
// with nothing to show that anything broke.
//
// So there are now three ways in, and a way out.
//
// 1. A much wider pattern, including the generic words a fetcher almost always
//    puts in its user agent.
// 2. A header test. Every real browser sends Accept-Language, and every browser
//    of the last several years sends Sec-Fetch-Mode on a page load. Almost no
//    crawler sends either. Missing BOTH is a strong signal.
// 3. ?_preview=1, for testing.
//
// Being wrong in the generous direction is close to free here. The HTML this
// serves carries a meta refresh to the real page, so a person who somehow
// landed on it is bounced straight to the app. A missed crawler costs a
// preview; a false positive costs a blink.
//
// THE EXCEPTION IS SEARCH. Googlebot and bingbot run JavaScript and should
// index the real page, not a stub with a redirect on it. They are let through
// before anything else is considered.
const SEARCH_ENGINE = /Googlebot|Google-InspectionTool|Google Page Speed|Chrome-Lighthouse|bingbot|AdsBot-Google|Storebot-Google|DuckDuckBot|Applebot-Extended/i;

const CRAWLER_PATTERN = new RegExp([
  // The ones we know by name.
  'facebookexternalhit', 'facebookcatalog', 'Facebot', 'Twitterbot', 'WhatsApp',
  'Slackbot', 'Slack-ImgProxy', 'Discordbot', 'LinkedInBot', 'TelegramBot',
  'Pinterest', 'redditbot', 'vkShare', 'SkypeUriPreview', 'W3C_Validator',
  'Applebot', 'Embedly', 'Iframely', 'Quora Link Preview', 'Outbrain',
  'Snapchat', 'Viber', 'Line\\/', 'Mastodon', 'Threads', 'Signal',
  'SkypeRoutingBot', 'Yahoo Link Preview', 'Google-AMPHTML',
  // And the words a fetcher we have never heard of tends to use anyway.
  'bot', 'crawler', 'spider', 'preview', 'unfurl', 'opengraph', 'metainspector',
  'link-?check', 'scraper', 'fetcher',
].join('|'), 'i');

// Missing both of these is close to proof that nothing with a screen is asking.
function looksAutomated(request) {
  return !request.headers.get('accept-language') && !request.headers.get('sec-fetch-mode');
}

// Each entry gives the type og-meta needs and how to get the slug out of the
// path. `slug` defaults to the first capture group; give it a function when
// the useful part is somewhere else.
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

  // The handle forms.
  //
  // THESE NEVER RUN. /@* is not in `config.path` below, on purpose, and the
  // reason is written out down there. They are kept because they are correct
  // and cost nothing: if the registration problem is ever solved, the matching
  // is already here and right.
  //
  // Nothing shares a /@ link any more. ArtistProfilePage and ForYouPage both
  // hand out /artist/<slug>, which is the first pattern in this list.
  //
  // Longest first. /@h/album/s must be tested before /@h, or the bare handle
  // pattern would never see it.
  { re: /^\/@([^/]+)\/(?:single|track)\/([^/]+)\/?$/, type: 'track', slug: (m) => m[2] },
  { re: /^\/@([^/]+)\/beat\/([^/]+)\/?$/,             type: 'beat',  slug: (m) => m[2] },
  // og-meta's album branch splits the slug on "/" and expects
  // artistSlug/albumSlug, which is exactly what the handle form already has.
  { re: /^\/@([^/]+)\/album\/([^/]+)\/?$/,            type: 'album', slug: (m) => `${m[1]}/${m[2]}` },
  { re: /^\/@([^/]+)\/?$/,                             type: 'artist' },
];

export default async (request, context) => {
  const url = new URL(request.url);

  // ?_preview=1 — the switch that means nobody has to guess again.
  //
  // Everything in this file only happens for a crawler, and a crawler is not
  // something you can be. So when previews broke there was no way to see
  // whether this function was even running: the only test was to paste a link
  // into WhatsApp and look at the result, which takes a minute, caches for a
  // day, and tells you nothing about WHY.
  //
  // Add ?_preview=1 to any link and you get exactly what a crawler gets.
  //
  //   feelzmachine.com/track/<slug>?_preview=1   a page of meta tags  = working
  //   feelzmachine.com/@<handle>?_preview=1      the normal app       = NOT working
  //
  // If you see the app, this function is not registered on that path, and no
  // amount of fixing og-meta will help.
  const forced = url.searchParams.get('_preview') === '1';

  const userAgent = request.headers.get('user-agent') || '';

  // Search engines run JavaScript. They get the real page.
  if (!forced && SEARCH_ENGINE.test(userAgent)) return context.next();

  if (!forced && !CRAWLER_PATTERN.test(userAgent) && !looksAutomated(request)) {
    return context.next();
  }

  let type = null;
  let slug = null;

  for (const { re, type: t, slug: pick } of ROUTE_PATTERNS) {
    const match = url.pathname.match(re);
    if (match) {
      type = t;
      slug = (pick ? pick(match) : match[1]) || null;
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
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=1800',
        // One URL now has two possible answers, this card or the app, and which
        // one you get depends on your user agent. Without Vary a cache is free
        // to hand the app to a crawler, or this stub to a person.
        'Vary': 'User-Agent',
      },
    });
  } catch {
    // Timed out, refused, or threw. Fall through to the normal app rather
    // than showing an error to the crawler.
    return context.next();
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// '/@*' IS DELIBERATELY NOT IN THIS LIST.
//
// Adding it took every preview on the site down: songs, artists and albums
// all fell back to the plain homepage card, while og-meta itself carried on
// answering correctly when called directly. The edge function was simply no
// longer being handed the request. An "@" in a Netlify path pattern is not
// worth debugging in production, and the cost of getting it wrong is every
// shared link on the platform.
//
// The handle forms are handled on the app's side instead, which cannot break
// anything here: the two places that shared a /@ link, the Share button on an
// artist profile and the one on a For You card, now hand out /artist/<slug>.
// That path is already in this list and already has a working preview, so the
// problem is solved without asking this file to match an "@" at all.
//
// /@handle still works for anyone who types it or has one saved. It just is
// not what we hand to other people any more.
//
// If you ever want to put it back, deploy it on its own and paste a track
// link into WhatsApp before anything else ships behind it.
export const config = {
  path: ['/artist/*', '/track/*', '/beat/*', '/album/*', '/schoolsessions', '/t/*', '/a/*'],
};