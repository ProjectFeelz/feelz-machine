// netlify/functions/og-image.js
//
// Turns a piece of Feelz Machine artwork into a picture a link preview will
// actually draw.
//
// WHY THIS EXISTS
//
// Previews were correct in every other way and still showed no artwork. The
// routing was right, og-meta returned the right title and the right image
// address, and the image loaded perfectly in a browser. The problem was the
// size of it. Measured on the live catalogue:
//
//   track cover      2553 KB   1254 x 1254   PNG
//   album cover      1491 KB   1024 x 1024   PNG
//   artist photo     2668 KB   2204 x 4076   JPEG
//
// WhatsApp will not draw a preview picture that heavy. It asks for the image,
// sees what is coming, and gives up, leaving the card with the words on it and
// a blank space where the artwork belongs. That is exactly what was on screen.
//
// Asking Supabase to resize helped only half the catalogue, and this is the
// part that is easy to miss:
//
//   Supabase keeps the source format. It has no option to output JPEG,
//   format=jpeg is rejected with a 400, and `quality` does nothing to a PNG.
//
// So a 1254 x 1254 PNG asked for at 1200 x 630 comes back as a 1200 x 630 PNG,
// still 1247 KB. Fifteen of the twenty tracks and albums checked were PNGs, and
// every one of them was still over 880 KB after resizing. The five JPEGs came
// back between 50 and 120 KB and were fine all along, which is why some links
// showed a picture and most did not.
//
// Supabase WILL return WebP, but only to something that says it accepts WebP in
// its request, and a crawler does not reliably do that. Facebook does not
// recommend WebP either.
//
// This function closes the gap: it takes the resized picture from Supabase and
// re-encodes it as a JPEG, which every platform accepts. Around 60 to 120 KB.
//
// IF ANYTHING HERE FAILS, IT REDIRECTS TO THE SUPABASE PICTURE INSTEAD.
//
// That matters more than the rest of the file. Previews on this platform have
// been broken twice by a change that looked safe, so this one cannot fail
// closed. The worst case is the picture we would have sent yesterday.

const ALLOWED_HOST = 'bycdnwenbjusxpowojdb.supabase.co';

const PUBLIC_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

// The size every platform asks for. Facebook, X, LinkedIn and Slack all want a
// wide card; WhatsApp is happy with one.
const W = 1200;
const H = 630;

// Ask Supabase to do the resizing. It caches the result on its side, so we are
// re-encoding a small picture rather than pulling three megabytes every time.
function supabaseResized(url) {
  if (!url.includes(PUBLIC_PATH)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url.replace(PUBLIC_PATH, RENDER_PATH)}${sep}width=${W}&height=${H}&resize=cover&quality=80`;
}

exports.handler = async (event) => {
  const raw = event.queryStringParameters?.u;
  if (!raw) return { statusCode: 400, body: 'Missing u' };

  // Exact host match, https only. Whole hostname, never endsWith or includes:
  // this function fetches whatever it is pointed at and hands back the body, so
  // a loose check here is a server side request forgery. The same mistake was
  // found and fixed in image-proxy.js; do not reintroduce it.
  let parsed;
  try { parsed = new URL(raw); } catch { return { statusCode: 400, body: 'Invalid u' }; }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== ALLOWED_HOST) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  const resized = supabaseResized(raw);

  // A year, and immutable. Artwork at a given address never changes: a new
  // cover is a new upload with a new name. Crawlers re-check links constantly,
  // and there is no reason for any of them to pay for this twice.
  const CACHE = 'public, max-age=31536000, immutable';

  // The escape hatch, used for every failure below.
  const fallback = { statusCode: 302, headers: { Location: resized, 'Cache-Control': 'public, max-age=300' }, body: '' };

  try {
    // Ask for WebP as well. If sharp is unavailable and we end up redirecting,
    // this is the cheaper thing for the crawler to receive; if sharp works, it
    // reads WebP perfectly well and we have pulled far fewer bytes to get here.
    const res = await fetch(resized, { headers: { Accept: 'image/webp,image/*,*/*' } });
    if (!res.ok) return fallback;

    const input = Buffer.from(await res.arrayBuffer());

    // sharp is required lazily and inside the try on purpose. If the module is
    // missing or fails to load on this platform, we redirect rather than
    // returning a 500, and links keep the picture they had before.
    let sharp;
    try { sharp = require('sharp'); } catch { return fallback; }

    const jpeg = await sharp(input)
      // Artwork is often square and the card is wide, so it is going to be
      // cropped. Crop toward the middle, which is where the subject of a cover
      // almost always is.
      .resize(W, H, { fit: 'cover', position: 'centre', withoutEnlargement: false })
      // Flattened onto black, because a transparent PNG re-encoded as JPEG
      // otherwise fills its clear areas with white, and every card on this
      // platform sits on a dark background.
      .flatten({ background: '#000000' })
      .jpeg({ quality: 78, progressive: true, mozjpeg: true })
      .toBuffer();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': CACHE, 'Content-Length': String(jpeg.length) },
      body: jpeg.toString('base64'),
      isBase64Encoded: true,
    };
  } catch {
    return fallback;
  }
};