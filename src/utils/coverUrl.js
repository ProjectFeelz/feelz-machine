// src/utils/coverUrl.js
//
// Ask Supabase for a picture the size we are actually going to draw it.
//
// WHY
//
// Artwork is uploaded at whatever size the artist exported. Measured on the
// live catalogue, a cover is routinely 2.8 to 3.2 MB, and one artist profile
// picture is 3072 x 4080. The Browse page shows eight of them in the top rail
// alone, which is about 15 MB of PNG before the track list underneath has
// loaded anything.
//
// On a computer that is invisible. On a phone with a weak signal the requests
// time out and the browser draws its broken-image icon, which is what Davu
// was seeing: the small cover on her screen loaded, the four big ones did not.
//
// Supabase can resize on its side and cache the result. A 400px version of
// that same 2.9 MB cover comes back at 905 KB as PNG, and far less than that
// as WebP, which is what a real browser gets because it sends an Accept
// header that says it can take one.
//
// USE
//
//   <img src={coverUrl(track.cover_artwork_url, 300)} />
//
// Pick the width you are DRAWING at, not the width you wish you had. A 2x
// allowance for retina is already generous; asking for 1200 to fill a 150px
// tile is how this problem started.
//
// Anything that is not a Supabase public object is handed back untouched, so
// this is safe to wrap around any src, including nulls and external URLs.

const PUBLIC_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

// BOTH width AND height, with resize=contain. This is not optional.
//
// Passing width on its own does NOT scale the picture. Supabase keeps the
// original height, so a 1254x1254 cover comes back 400x1254: a tall squashed
// strip. The square box it is drawn in then object-covers the middle out of
// that, which looks like the artwork has been zoomed into. Measured on the
// live catalogue before and after:
//
//   original                 2936 KB   1254x1254
//   width only (wrong)        905 KB   400x1254   <- squashed, then cropped
//   contain                   335 KB   400x400
//   contain, as WebP           42 KB   400x400    <- what a browser gets
//
// `contain` fits the picture inside the box and keeps its shape. A square
// cover comes back square; a tall photo comes back tall (2204x4076 becomes
// 216x400). Cropping is left to the layout's own object-cover, exactly as it
// was before any of this.
export function coverUrl(url, width = 400, quality = 72) {
  if (!url || typeof url !== 'string') return url;
  // Already a transform request. Leave it alone rather than stacking params.
  if (url.includes(RENDER_PATH)) return url;
  // Not a Supabase public object: an external image, a data URI, a local
  // asset. Nothing to do.
  if (!url.includes(PUBLIC_PATH)) return url;

  const w = Math.round(width);
  const sep = url.includes('?') ? '&' : '?';
  return `${url.replace(PUBLIC_PATH, RENDER_PATH)}${sep}width=${w}&height=${w}&resize=contain&quality=${quality}`;
}

// Common sizes, named so the numbers are not scattered through the pages.
// Each is roughly twice the drawn size, which covers a retina screen.
export const COVER = {
  row:    120,   // a list row thumbnail, drawn around 40 to 56px
  tile:   400,   // a grid tile or card, drawn around 150 to 200px
  rail:   400,   // the horizontal rails on Home and Browse
  card:   700,   // a big card, an artist photo in a panel
  hero:   1000,  // full width on a phone, the top of a profile
};

export default coverUrl;