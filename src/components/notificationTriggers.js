// notificationTriggers.js
// Import and call these functions from your existing components
// to automatically create notifications when events happen.

import { createNotification, checkStreamMilestone } from '../contexts/useNotifications';

/**
 * Call when someone sends a collab request (in TrackUploadPanel saveCollaborations)
 */
export async function notifyCollabRequest({ fromArtist, toArtistId, trackTitle, trackId }) {
  await createNotification({
    artistId: toArtistId,
    type: 'collab_request',
    title: `${fromArtist.artist_name} wants to collab`,
    message: `Invited you to collaborate on "${trackTitle}"`,
    fromArtistId: fromArtist.id,
    trackId,
  });
}

/**
 * Call when a collab is accepted (in CollabRequests handleAccept)
 */
export async function notifyCollabAccepted({ fromArtist, toArtistId, trackTitle, trackId }) {
  await createNotification({
    artistId: toArtistId,
    type: 'collab_accepted',
    title: `${fromArtist.artist_name} accepted your collab`,
    message: `Now credited on "${trackTitle}"`,
    fromArtistId: fromArtist.id,
    trackId,
  });
}

/**
 * Call when a collab is declined (in CollabRequests handleDecline)
 */
export async function notifyCollabDeclined({ fromArtist, toArtistId, trackTitle, trackId }) {
  await createNotification({
    artistId: toArtistId,
    type: 'collab_declined',
    title: `${fromArtist.artist_name} declined the collab`,
    message: `Declined collaboration on "${trackTitle}"`,
    fromArtistId: fromArtist.id,
    trackId,
  });
}

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
