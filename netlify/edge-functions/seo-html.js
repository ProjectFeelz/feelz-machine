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

// `meta` says whether og-meta.js knows about this type and should be asked for
// the title, description and JSON-LD. `links` says whether seo-links.js should
// be asked for the anchors to put in the body. Most pages want both; the hubs
// have no entity behind them, so seo-links supplies their words as well.
const ROUTE_PATTERNS = [
  { re: /^\/artist\/([^/]+)\/?$/, type: 'artist', meta: true, links: true },
  { re: /^\/track\/([^/]+)\/?$/, type: 'track', meta: true, links: true },
  { re: /^\/beat\/([^/]+)\/?$/, type: 'beat', meta: true, links: true },
  { re: /^\/album\/([^/]+\/[^/]+)\/?$/, type: 'album', meta: true, links: true },
  { re: /^\/sessions\/?$/, type: 'schoolsessions', meta: true, links: false },
  { re: /^\/schoolsessions\/?$/, type: 'schoolsessions', meta: true, links: false },

  // ── The hubs, and why they are the whole point of this change ────────────
  //
  // Search Console: 233 URLs "Discovered, currently not indexed", and
  // /artist/stevecsa with a last-crawl date of N/A. Google had found these
  // pages and never fetched one of them.
  //
  // It had no reason to. This function filled in the artist and track pages
  // beautifully and the home page was left serving the bare shell, whose body
  // text is "You need to enable JavaScript to run Feelz Machine" and which
  // contains not one anchor. So there was no path from the home page to any of
  // the 269 content pages. The sitemap offered them; nothing on the site
  // seconded it.
  //
  // These four routes are that path. /artists and /genres/:slug are new pages,
  // with React routes of their own so a person clicking one gets a real
  // screen, and every artist, track, album and genre is reachable from the
  // home page in two clicks of plain HTML.
  // The newsletter posts are here for a reason of their own. They are the only
  // pages besides the home page that Google has ever shown to anyone, and all
  // eighteen of them were serving the home page's title and description,
  // because og-meta.js has no newsletter type. Eighteen pages claiming to be
  // the same page is what "Duplicate, Google chose different canonical" means
  // in the coverage report. seo-links gives each one its own words and points
  // it at the catalogue, which is the only authority on this domain that has
  // anywhere to flow.
  { re: /^\/newsletter\/([^/]+)\/?$/, type: 'newsletter', meta: false, links: true },

  { re: /^\/$/, type: 'home', meta: false, links: true },
  { re: /^\/browse\/?$/, type: 'browse', meta: false, links: true },
  { re: /^\/artists\/?$/, type: 'artists', meta: false, links: true },
  { re: /^\/genres\/([^/]+)\/?$/, type: 'genre', meta: false, links: true },
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
    let wantMeta = false;
    let wantLinks = false;
    for (const route of ROUTE_PATTERNS) {
      const m = url.pathname.match(route.re);
      if (m) {
        type = route.type;
        slug = m[1] || null;
        wantMeta = route.meta;
        wantLinks = route.links;
        break;
      }
    }
    if (!type) return response;

    html = await response.text();

    // The marker that says this is the app shell and not somebody else's
    // answer. social-preview's stub does not have it.
    if (!html.includes('<div id="root">')) return serve(html, response);

    const metaUrl = new URL('/.netlify/functions/og-meta', url.origin);
    metaUrl.searchParams.set('format', 'json');
    metaUrl.searchParams.set('type', type);
    if (slug) metaUrl.searchParams.set('slug', slug);

    const linksUrl = new URL('/.netlify/functions/seo-links', url.origin);
    linksUrl.searchParams.set('type', type);
    if (slug) linksUrl.searchParams.set('slug', slug);

    // One budget for both calls, spent in parallel. This function has no time
    // of its own to give away, and a slow lookup must cost the tags or the
    // links, never the page.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2500);
    let meta = null;
    let linkData = null;
    try {
      const [metaRes, linksRes] = await Promise.all([
        wantMeta ? fetch(metaUrl.toString(), { signal: abort.signal }).catch(() => null) : null,
        wantLinks ? fetch(linksUrl.toString(), { signal: abort.signal }).catch(() => null) : null,
      ]);
      if (metaRes && metaRes.ok) meta = await metaRes.json();
      if (linksRes && linksRes.ok) linkData = await linksRes.json();
    } catch {
      // Timed out, refused, or threw. Caught here rather than left to the
      // outer catch on purpose: a lookup that does not answer costs this page
      // its tags, and must never cost it the page.
    } finally {
      clearTimeout(timer);
    }

    // The hubs have no og-meta entry, so their words come from seo-links. An
    // entity page keeps og-meta as the authority, and takes only anchors from
    // seo-links.
    if (!meta && linkData && linkData.title) {
      meta = {
        title: linkData.title,
        description: linkData.description || '',
        pageUrl: linkData.canonical || null,
        cardImage: null,
        jsonLd: null,
      };
    }

    // The home page and /browse are the case where there is nothing to rewrite
    // and everything to add: their meta in the shell is already correct and
    // specific, and what they were missing was links. So a page with links and
    // no meta is still worth serving; only a page with neither is given back
    // untouched.
    const hasLinks = Boolean(linkData && Array.isArray(linkData.sections)
      && linkData.sections.some(s => s && Array.isArray(s.links) && s.links.length));
    if ((!meta || !meta.title) && !hasLinks) return serve(html, response);

    const { title, description, cardImage, pageUrl, jsonLd } = meta || {};

    if (title) {
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

    // Real text and real links, in the document, where a crawler that does not
    // render will still read them. React clears #root on mount, so this is
    // what the page says before the app exists and nothing after it.
    //
    // The links are the part that matters. A heading and a paragraph told
    // Google what a page was about; they never told it the page existed, and
    // 233 URLs sat discovered and uncrawled because nothing on this site
    // pointed at them. Anchors are the pointing.
    const heading = (linkData && linkData.heading) || title || '';
    const intro = (linkData && linkData.intro) || description || '';

    let body = '';
    if (heading) {
      body += `<h1 style="font-size:1.75rem;font-weight:700;margin:0 0 .75rem">${esc(heading)}</h1>`;
    }
    if (intro) {
      body += `<p style="font-size:.95rem;line-height:1.6;color:rgba(255,255,255,.55);margin:0 0 2rem">${esc(intro)}</p>`;
    }

    if (hasLinks) {
      for (const section of linkData.sections) {
        if (!section || !Array.isArray(section.links) || !section.links.length) continue;
        body += `<h2 style="font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;` +
          `color:rgba(255,255,255,.4);margin:2rem 0 .75rem">${esc(section.heading || '')}</h2>`;
        body += '<ul style="list-style:none;margin:0;padding:0">';
        for (const link of section.links) {
          if (!link || !link.href || !link.label) continue;
          // A relative href on purpose. The canonical host is www, the app is
          // served on it, and a relative link cannot disagree with the page it
          // is on about which host it belongs to.
          body += `<li style="margin:0 0 .4rem"><a href="${esc(link.href)}" ` +
            `style="color:#c4b5fd;text-decoration:none">${esc(link.label)}</a>`;
          if (link.sub) {
            body += `<span style="color:rgba(255,255,255,.3);font-size:.85rem"> ${esc(link.sub)}</span>`;
          }
          body += '</li>';
        }
        body += '</ul>';
      }
    }

    const shell = `<div id="root"><div style="max-width:42rem;margin:0 auto;padding:3rem 1.25rem;` +
      `font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;background:#000;min-height:100vh">` +
      body +
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
  path: [
    '/artist/*', '/track/*', '/beat/*', '/album/*', '/sessions', '/schoolsessions',
    // The hubs. '/' is the important one: it is the only page Google reliably
    // crawls on this site, and until now it handed back a document with no
    // links in it, so a crawl of it discovered nothing.
    '/', '/browse', '/artists', '/genres/*',
    // '/newsletter/compose' matches this path too. It falls through harmlessly:
    // seo-links finds no post with that slug, answers 404, and the page is
    // served exactly as it arrived.
    '/newsletter/*',
  ],
};