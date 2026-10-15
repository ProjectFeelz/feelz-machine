// netlify/edge-functions/seo-html.js
//
// WHY THIS EXISTS
//
// Search Console, 92 days: 2 pages indexed, 206 not. 35 clicks, 185
// impressions, and every query that produced them was the platform's own name.
// Not a ranking problem. A discovery one.
//
// The cause is visible in one command. Fetch any URL on this site and you get
// the same 5 KB file: the same title, the same description, the same og:title,
// and a body whose only sentence is "You need to enable JavaScript to run
// Feelz Machine." The sitemap offers Google 232 URLs and every one of them
// looks identical until JavaScript runs. Google's own words for that are
// sitting in the coverage report: "Duplicate without user-selected canonical"
// and "Discovered, currently not indexed".
//
// Googlebot can render JavaScript. On a site with no authority yet it largely
// does not bother, because rendering is queued and expensive and it has no
// reason to believe the queue is worth it. social-preview.js lets search
// engines straight through on the assumption that they render. That
// assumption is reasonable and the numbers above are what disprove it.
//
//
// WHAT IT DOES
//
// Takes the real app shell on its way out and fills in the parts that are
// supposed to differ per URL: title, description, canonical, the og and
// twitter tags, JSON-LD, and a block of real text inside #root.
//
//
// WHY EVERYONE GETS THE SAME HTML
//
// No user agent sniffing. Serving crawlers something other than what people
// get is cloaking, and the version of it that is permitted is fiddly to keep
// honest and easy to get wrong. Every visitor gets the same bytes.
//
// For a person this is an improvement rather than a cost. The injected block
// is the page's real heading and description, styled to match, so a slow
// connection shows the name of the thing it is loading instead of a blank
// screen. React replaces it the moment it mounts, because createRoot().render()
// clears whatever is in #root.
//
//
// WHAT IT DELIBERATELY DOES NOT DO
//
// It does not touch social-preview.js, which builds the cards for WhatsApp and
// the rest and is tuned enough that the file says not to. If that function has
// already answered, its stub has no #root in it, and the guard below leaves it
// alone. That guard holds whichever order the two run in.
//
// It never fails the request. Every error path returns the untouched page.

const ROUTE_PATTERNS = [
  { re: /^\/artist\/([^/]+)\/?$/, type: 'artist' },
  { re: /^\/track\/([^/]+)\/?$/, type: 'track' },
  { re: /^\/beat\/([^/]+)\/?$/, type: 'beat' },
  { re: /^\/album\/([^/]+\/[^/]+)\/?$/, type: 'album' },
  { re: /^\/sessions\/?$/, type: 'schoolsessions' },
  { re: /^\/schoolsessions\/?$/, type: 'schoolsessions' },
];

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Replace the content of a meta tag that is already in the shell, or, when the
// shell does not carry that tag, add it. Both halves matter: the shell has
// og:title but no article tags, and a half applied rewrite is worse than none.
function setMeta(html, attr, name, value) {
  const re = new RegExp(`(<meta\\s+${attr}=["']${name}["'][^>]*content=["'])([^"']*)(["'])`, 'i');
  if (re.test(html)) return html.replace(re, `$1${esc(value)}$3`);
  return html.replace(/<\/head>/i, `  <meta ${attr}="${name}" content="${esc(value)}" />\n  </head>`);
}

// Once the body has been read, the original Response object is spent: handing
// it back gives the visitor an empty page. Every exit after the read goes
// through here instead. content-length goes with it, because the length it
// states stopped being true the moment anything was injected.
function serve(html, response) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, { status: response.status, headers });
}

export default async (request, context) => {
  const response = await context.next();
  // Held outside the try so the catch can tell "never read it" from "read it
  // and then something went wrong", which are different recoveries.
  let html = null;

  try {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return response;

    const url = new URL(request.url);

    let type = null;
    let slug = null;
    for (const { re, type: t } of ROUTE_PATTERNS) {
      const m = url.pathname.match(re);
      if (m) { type = t; slug = m[1] || null; break; }
    }
    // The home page has no entity behind it. Its meta in the shell is already
    // correct and specific, so there is nothing to rewrite and nothing to gain
    // from pretending otherwise.
    if (!type) return response;

    html = await response.text();

    // The marker that says this is the app shell and not somebody else's
    // answer. social-preview's stub does not have it.
    if (!html.includes('<div id="root">')) return serve(html, response);

    const metaUrl = new URL('/.netlify/functions/og-meta', url.origin);
    metaUrl.searchParams.set('format', 'json');
    metaUrl.searchParams.set('type', type);
    if (slug) metaUrl.searchParams.set('slug', slug);

    // Budgeted the same way social-preview budgets its own call, and for the
    // same reason: this function has no time of its own to give away, and a
    // slow lookup must cost the tags, never the page.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2500);
    let meta = null;
    try {
      const res = await fetch(metaUrl.toString(), { signal: abort.signal });
      if (res.ok) meta = await res.json();
    } catch {
      // Timed out, refused, or threw. Caught here rather than left to the
      // outer catch on purpose: a lookup that does not answer costs this page
      // its tags, and must never cost it the page.
    } finally {
      clearTimeout(timer);
    }

    if (!meta || !meta.title) return serve(html, response);

    const { title, description, cardImage, pageUrl, jsonLd } = meta;

    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
    html = setMeta(html, 'name', 'description', description);
    html = setMeta(html, 'property', 'og:title', title);
    html = setMeta(html, 'property', 'og:description', description);
    html = setMeta(html, 'property', 'og:url', pageUrl);
    html = setMeta(html, 'name', 'twitter:title', title);
    html = setMeta(html, 'name', 'twitter:description', description);
    if (cardImage) {
      html = setMeta(html, 'property', 'og:image', cardImage);
      html = setMeta(html, 'name', 'twitter:image', cardImage);
    }

    // The canonical is the single most load bearing tag here. 232 URLs all
    // claiming to be the home page is literally what the coverage report is
    // complaining about.
    if (pageUrl) {
      const canonRe = /(<link\s+rel=["']canonical["'][^>]*href=["'])([^"']*)(["'])/i;
      html = canonRe.test(html)
        ? html.replace(canonRe, `$1${esc(pageUrl)}$3`)
        : html.replace(/<\/head>/i, `  <link rel="canonical" href="${esc(pageUrl)}" />\n  </head>`);
    }

    // Added rather than replacing the organisation JSON-LD already in the
    // shell. Two blocks on a page is valid and normal; they describe
    // different things.
    if (jsonLd) {
      const block = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;
      html = html.replace(/<\/head>/i, `  ${block}\n  </head>`);
    }

    // Real text, in the document, where a crawler that does not render will
    // still read it. React clears #root on mount, so this is what the page
    // says before the app exists and nothing after it.
    const shell = `<div id="root"><div style="max-width:42rem;margin:0 auto;padding:3rem 1.25rem;` +
      `font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;background:#000;min-height:100vh">` +
      `<h1 style="font-size:1.75rem;font-weight:700;margin:0 0 .75rem">${esc(title)}</h1>` +
      `<p style="font-size:.95rem;line-height:1.6;color:rgba(255,255,255,.55);margin:0">${esc(description)}</p>` +
      `</div></div>`;
    html = html.replace('<div id="root"></div>', shell);

    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    // Everyone gets the same bytes, so there is nothing for a cache to get
    // wrong and no Vary needed.
    headers.set('Cache-Control', 'public, max-age=600');
    headers.delete('content-length');

    return new Response(html, { status: response.status, headers });
  } catch (err) {
    console.error('[seo-html]', err && err.message);
    // If the body was already read, the original response is spent and
    // returning it serves a blank page. This is the case a test caught: a
    // lookup timeout threw after the read, and the visitor would have got
    // nothing at all.
    return html != null ? serve(html, response) : response;
  }
};

// Registered here and nowhere else. netlify.toml says, at length and from
// experience, that declaring an edge function in both places registers it
// twice and produces intermittent 5xx. Do not add an [[edge_functions]] block
// for this one.
export const config = {
  path: ['/artist/*', '/track/*', '/beat/*', '/album/*', '/sessions', '/schoolsessions'],
};