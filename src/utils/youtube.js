// src/utils/youtube.js
//
// One place that understands a YouTube link.
//
// youTubeId used to live in src/components/HomeAsideCard.js and is exported
// from here now, with that file re-exporting it so nothing that imports it
// from there breaks. It moved because School Sessions needs it and importing
// it from the home page's aside card would have pulled that whole module, and
// its player and auth hooks, into a page that wants none of them.
//
// There are two more hand-rolled copies of this parser, in
// src/components/PostComposer.js:11 and src/pages/AdminBroadcast.js:15. They
// are left alone here: they work, and changing three things at once on a page
// that goes in front of school kids in five days is not the moment. Worth
// collapsing into this when something next touches them.

/**
 * Accepts whatever gets pasted: watch?v=, youtu.be/, /embed/, /shorts/,
 * /live/, with or without extra query junk, or a bare id. Returns null for
 * anything else, which is what keeps a mistyped link from rendering a broken
 * player.
 */
export function youTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  // A bare id, pasted on its own
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

/**
 * A playlist id, which the original parser had no notion of.
 *
 * It matters here because a course is far more likely to be a playlist of
 * short videos than one long one, and a playlist url usually ALSO carries a
 * v= for whichever video you happened to be watching when you copied it. So
 * this is checked first by the callers below: treating a playlist as its
 * first video would quietly drop the rest of the course.
 */
export function youTubePlaylistId(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/[?&]list=([A-Za-z0-9_-]{12,})/);
  return m ? m[1] : null;
}

/**
 * The src for an inline player, or null when this is not a YouTube link at
 * all and the caller should fall back to an ordinary link.
 *
 * nocookie because the audience is school children. rel=0 so the end card
 * does not offer whatever YouTube feels like next, modestbranding to keep it
 * quiet, playsinline so iOS plays it in the page instead of taking over the
 * screen, which on this page would undo the entire point of embedding it.
 */
export function youTubeEmbedSrc(url, { autoplay = false } = {}) {
  const list = youTubePlaylistId(url);
  const id   = youTubeId(url);
  if (!list && !id) return null;

  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
  });
  if (autoplay) params.set('autoplay', '1');

  if (list) {
    // A playlist url that also names a video starts on that video and keeps
    // the rest queued. A bare playlist url plays it from the top.
    if (id) params.set('list', list);
    else    params.set('listType', 'playlist'), params.set('list', list);
    return id
      ? `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`
      : `https://www.youtube-nocookie.com/embed/videoseries?${params.toString()}`;
  }
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

/**
 * A still to show before anything is loaded. Null for a bare playlist, where
 * there is no single video to take a frame from.
 */
export function youTubeThumb(url) {
  const id = youTubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function isYouTube(url) {
  return !!(youTubeId(url) || youTubePlaylistId(url));
}