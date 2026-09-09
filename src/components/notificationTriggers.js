// notificationTriggers.js
//
// Import and call these functions from your existing components
// to automatically create notifications when events happen.
//
//
// THE COLLAB HELPERS ARE NOW NO-OPS — READ THIS BEFORE RE-ENABLING THEM
//
// notifyCollabRequest / Accepted / Declined each built a notification
// addressed to the OTHER artist: artist_id = their profile, user_id = null.
// The only INSERT policy on notifications is
//
//   auth.uid() = user_id OR artist_id in (my own artists)
//
// so both branches were false and every one of these calls came back
// 403 (42501). Accepting a few collabs produced a wall of them in the console
// while the collab itself succeeded — the other artist was credited and never
// told.
//
// Migration 96 moved all three server-side, onto triggers on collab_requests:
// inserting a request notifies the recipient, and a status change to
// accepted/declined notifies the sender. Derived from the row rather than
// supplied by the client, so it cannot be forged and cannot be refused.
//
// These are kept as no-ops rather than deleted so the two call sites
// (TrackUploadPanel, CollabRequests) need no edit and nothing silently loses
// a step. If you ever remove the trigger, remember the client cannot do this
// job — widening that RLS policy would let any user write anything into
// anyone else's notifications.

import { createNotification, checkStreamMilestone } from '../contexts/useNotifications';

/**
 * Call when someone sends a collab request (in TrackUploadPanel saveCollaborations)
 */
// Handled by the collab_requests triggers (migration 96). See the note above.
export async function notifyCollabRequest() { /* no-op */ }

/**
 * Call when a collab is accepted (in CollabRequests handleAccept)
 */
// Handled by the collab_requests triggers (migration 96). See the note above.
export async function notifyCollabAccepted() { /* no-op */ }

/**
 * Call when a collab is declined (in CollabRequests handleDecline)
 */
// Handled by the collab_requests triggers (migration 96). See the note above.
export async function notifyCollabDeclined() { /* no-op */ }

/**
 * Call when someone follows an artist
 */
export async function notifyNewFollower({ followerArtist, followedArtistId }) {
  await createNotification({
    artistId: followedArtistId,
    type: 'new_follower',
    title: `${followerArtist.artist_name} started following you`,
    fromArtistId: followerArtist.id,
  });
}

/**
 * Call when someone likes a track
 */
export async function notifyTrackLiked({ likerArtist, trackOwnerId, trackTitle, trackId }) {
  // Don't notify if you liked your own track
  if (likerArtist.id === trackOwnerId) return;
  await createNotification({
    artistId: trackOwnerId,
    type: 'track_liked',
    title: `${likerArtist.artist_name} liked your track`,
    message: `"${trackTitle}"`,
    fromArtistId: likerArtist.id,
    trackId,
  });
}

/**
 * Call when someone comments on a track
 */
export async function notifyTrackCommented({ commenterArtist, trackOwnerId, trackTitle, trackId, commentPreview }) {
  if (commenterArtist.id === trackOwnerId) return;
  await createNotification({
    artistId: trackOwnerId,
    type: 'track_commented',
    title: `${commenterArtist.artist_name} commented on "${trackTitle}"`,
    message: commentPreview?.slice(0, 100) || '',
    fromArtistId: commenterArtist.id,
    trackId,
  });
}

/**
 * Call after incrementing stream count to check milestones
 */
export async function notifyStreamMilestone({ trackId, trackTitle, artistId, streamCount }) {
  await checkStreamMilestone(trackId, trackTitle, artistId, streamCount);
}