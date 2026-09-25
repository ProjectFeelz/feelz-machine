// src/utils/shareLink.js
//
// One place that decides what a shared link looks like.
//
// WHY THIS EXISTS
//
// Seven different screens were each building their own share URL, and every
// one of them ended in the same fallback:
//
//     `/track/${track?.slug || track?.id}`
//
// When a screen had selected the track without its `slug` column, that
// fallback quietly produced
//
//     /track/10a17a25-734b-4488-88c9-02659a459639
//
// which is worse than useless. It is long, it says nothing about the song,
// and og-meta looks tracks up BY SLUG, so a link like that also arrives with
// no artwork on it. The fallback was hiding a missing column behind a URL
// that still technically worked.
//
// WHAT WE SHARE NOW
//
//   1. /track/<slug>   the song's name is in the link
//   2. /t/<code>       short, if there is no slug for some reason
//   3. nothing         we go and fetch the slug rather than send a UUID
//
// The readable one leads on purpose. A person seeing a link in a message
// should be able to tell what it is before they tap it, and it is the URL
// Google indexes, so sharing it is worth more than sharing a redirect.

const SITE = 'https://www.feelzmachine.com';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// True for the thing we must never hand to a person.
export function isRawId(value) {
  return UUID_RE.test(String(value || '').trim());
}

// True if a finished URL ends in a raw id.
export function urlEndsInId(url) {
  if (!url) return true;
  const last = String(url).split('?')[0].replace(/\/+$/, '').split('/').pop();
  return isRawId(last);
}

// Build from what we already have. Returns null when nothing good is
// available, which is the signal to go and look the slug up.
export function buildShareUrl({ kind = 'track', slug, shortCode, artistSlug }) {
  if (kind === 'artist') {
    return slug && !isRawId(slug) ? `${SITE}/artist/${slug}` : null;
  }
  if (kind === 'album') {
    // An album slug is only unique per artist, so it needs both parts to be
    // unambiguous. With only one of them, the short code is the safer link.
    if (artistSlug && slug && !isRawId(slug)) return `${SITE}/album/${artistSlug}/${slug}`;
    if (shortCode) return `${SITE}/a/${shortCode}`;
    return null;
  }
  // track or beat
  if (slug && !isRawId(slug)) return `${SITE}/${kind === 'beat' ? 'beat' : 'track'}/${slug}`;
  if (shortCode) return `${SITE}/t/${shortCode}`;
  return null;
}

// The one to call. Hands back a link with the song's name in it, going to the
// database for the slug only when the screen that opened the share sheet did
// not select it.
export async function resolveShareUrl({ supabase, track, artist, given }) {
  // A link the caller built is KEPT, as long as it is not a raw id.
  //
  // This check has to come first. Some screens share something other than the
  // obvious thing: the Share button on a For You card shares the ARTIST, as
  // /@handle, while still handing the sheet the track it was pressed on. An
  // earlier version of this function saw the track and rebuilt the link as
  // /track/<slug>, quietly changing what that button did. Only bad links get
  // replaced here; good ones are left exactly as the screen intended.
  if (given && !urlEndsInId(given)) return given;

  if (artist && !track) {
    const fromArtist = buildShareUrl({ kind: 'artist', slug: artist.slug });
    if (fromArtist) return fromArtist;
  }

  if (track) {
    const kind = track.is_beat ? 'beat' : 'track';
    const direct = buildShareUrl({ kind, slug: track.slug, shortCode: track.short_code });
    if (direct) return direct;

    if (track.id && supabase) {
      try {
        const { data } = await supabase
          .from('tracks')
          .select('slug, short_code, is_beat')
          .eq('id', track.id)
          .maybeSingle();
        if (data) {
          const fetched = buildShareUrl({
            kind: data.is_beat ? 'beat' : 'track',
            slug: data.slug,
            shortCode: data.short_code,
          });
          if (fetched) return fetched;
        }
      } catch { /* fall through to whatever we were given */ }
    }
  }

  // Last resort. Use what the caller passed only if it is not a raw id, and
  // the current page otherwise.
  if (given && !urlEndsInId(given)) return given;
  return typeof window !== 'undefined' ? window.location.href : SITE;
}