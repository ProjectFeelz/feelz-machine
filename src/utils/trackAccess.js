/**
 * trackAccess.js
 *
 * One place that decides whether a track may be played, and why not.
 *
 * WHY THIS EXISTS
 *
 * Two ways to hear something you should not have:
 *
 *   1. An unreleased pre-order. These are listed in every feed (the feeds
 *      filter on is_published alone), and Steve's decision is that they stay
 *      listed — visible but not playable, with the release date on the card.
 *      Fan Pro is the exception: early access to pre-orders is what they pay
 *      for, and ArtistProfilePage has always honoured that.
 *
 *   2. A track the artist has hidden from fans by unpublishing it. RLS stops a
 *      listener from READING one ("Published tracks are publicly viewable" is
 *      is_published = true), but a notification created while the track was
 *      live has file_url copied into its metadata. Playing straight from that
 *      metadata bypasses the database entirely, so an unpublished track kept
 *      playing from a stale notification.
 *
 * TWO HALVES, AND NEITHER IS ENOUGH ALONE
 *
 * This module is the synchronous half: it blocks anything whose own fields say
 * it is unavailable. That covers feeds, rails, queues and action sheets, at no
 * cost, because those objects come from the tracks table and carry the fields.
 *
 * It cannot catch the stale-notification case, because notification metadata
 * has no is_published to inspect. That is fixed at the source instead —
 * NotificationsPage resolves the live row before playing, and RLS then does
 * the work. See the comment on the track pill there.
 *
 * BLOCK ONLY ON POSITIVE EVIDENCE
 *
 * There are 39 playTrack call sites and their selects differ; most do not ask
 * for is_published or is_preorder at all. So a missing field means "unknown",
 * and unknown is allowed. Only an explicit `is_published === false`, or an
 * explicit pre-order flag with a future date, blocks. A gate that blocked on
 * absent fields would silently stop playback across most of the app.
 */

// ── Viewer entitlement ──────────────────────────────────────────────────────
//
// PlayerProvider wraps TierProvider in AppRouter, so PlayerContext cannot
// consume the tier context — it is the outer provider. Rather than reorder the
// providers (which risks a great deal more than it fixes), TierProvider
// publishes what the gate needs here and the gate reads it synchronously.
//
// Same shape as the existing window.__feelz_* handoffs in PlayerContext, but
// module-scoped rather than on window, so nothing outside the app can set it.
let entitlement = {
  isListenerPro: false,   // Fan Pro / pro / premium listener — early access
  artistId:      null,    // the viewer's own artists.id, if they are an artist
  isAdmin:       false,
};

export function setViewerEntitlement(partial) {
  entitlement = { ...entitlement, ...partial };
}

export function getViewerEntitlement() {
  return entitlement;
}

// ── Availability ────────────────────────────────────────────────────────────

/** True when the track is a pre-order whose release date has not arrived. */
export function isUnreleasedPreorder(track) {
  if (!track?.is_preorder) return false;
  if (!track.release_date) return false;
  const d = new Date(track.release_date);
  if (isNaN(d.getTime())) return false;   // a bad date is not a lock
  return d.getTime() > Date.now();
}

/** "12 Oct" this year, "12 Oct 2027" beyond it. */
export function formatReleaseDate(track) {
  if (!track?.release_date) return '';
  const d = new Date(track.release_date);
  if (isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * Can this track be played, and if not, what should the person be told?
 *
 * Returns { playable, reason, message, releaseDate }.
 *   reason: null | 'unpublished' | 'unreleased'
 */
export function getTrackAvailability(track) {
  const { isListenerPro, artistId, isAdmin } = entitlement;

  // The artist's own material and admin are never gated. An artist has to be
  // able to hear their own unreleased or unpublished upload, or they cannot
  // check what they just uploaded.
  const isOwnWork = !!(artistId && track?.artist_id && track.artist_id === artistId);
  if (isOwnWork || isAdmin) {
    return { playable: true, reason: null, message: null, releaseDate: formatReleaseDate(track) };
  }

  // Explicitly unpublished. Absent means unknown, which is allowed.
  if (track?.is_published === false) {
    return {
      playable: false,
      reason: 'unpublished',
      message: 'This track is no longer available.',
      releaseDate: '',
    };
  }

  if (isUnreleasedPreorder(track)) {
    const when = formatReleaseDate(track);
    if (isListenerPro) {
      return { playable: true, reason: null, message: null, releaseDate: when };
    }
    return {
      playable: false,
      reason: 'unreleased',
      message: when ? `Out ${when}. Fan Pro gets it early.` : 'Not released yet.',
      releaseDate: when,
    };
  }

  return { playable: true, reason: null, message: null, releaseDate: formatReleaseDate(track) };
}