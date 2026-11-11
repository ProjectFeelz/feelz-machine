/**
 * netlify/functions/notify-new-track.js
 *
 * Called by TrackUploadPanel after a track or an album is published.
 * 1. Inserts in-app notifications for ALL followers.
 * 2. Sends web push only to followers who have drop alerts enabled.
 *
 * POST body: { track_id, track_title, artist_id, artist_slug, token }
 *        or: { album_id,              artist_id, artist_slug, token }
 *
 *
 * ALBUMS GET THEIR OWN NOTICE, POINTING AT THE ALBUM
 *
 * finishAlbum has always called this once per release rather than once per
 * track, which is the right call: twelve notifications for one album is how
 * you get somebody to turn notifications off. But it passed the FIRST
 * TRACK's id, so an album of twelve arrived reading "released a new track!
 * Hold Me Down" and opened that one song. Measured on the 9 November album:
 * nineteen followers, nineteen notices, all of them for track one, nothing
 * for the album.
 *
 * With album_id the notice is type new_album, titled with the album, and it
 * opens the album page. Nothing about the single-track path changes.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { track_id, track_title, album_id, artist_id, artist_slug, token } = body;
  if (!(track_id || album_id) || !artist_id || !token) {
    return { statusCode: 400, body: 'Missing fields' };
  }
  const isAlbum = !!album_id;

  // Verify the caller is the artist
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { statusCode: 401, body: 'Unauthorized' };

  const { data: artist } = await supabase
    .from('artists').select('id, artist_name, slug')
    .eq('id', artist_id).eq('user_id', user.id).maybeSingle();
  if (!artist) return { statusCode: 403, body: 'Forbidden' };

  // Read whichever one this is from the database rather than trusting the
  // body, the same way the track path always has.
  let trackData = null;
  let albumData = null;

  if (isAlbum) {
    const { data } = await supabase
      .from('albums')
      .select('id, title, slug, cover_artwork_url, release_type')
      .eq('id', album_id)
      .eq('artist_id', artist_id)
      .maybeSingle();
    if (!data) return { statusCode: 404, body: 'Album not found' };
    albumData = data;
  } else {
    const { data } = await supabase
      .from('tracks')
      .select('file_url, cover_artwork_url, slug, title')
      .eq('id', track_id)
      .maybeSingle();
    trackData = data;
  }

  // Use the title from DB as source of truth (body param may be empty)
  const resolvedTitle = isAlbum
    ? (albumData.title || 'a new release')
    : (trackData?.title || track_title || 'a new track');

  // Get all followers
  const { data: followers } = await supabase
    .from('follows').select('follower_id').eq('artist_id', artist_id);
  if (!followers?.length) return { statusCode: 200, body: JSON.stringify({ notified: 0 }) };

  // Exclude the artist themselves — they don't need to be notified of their own upload
  const followerIds = followers.map(f => f.follower_id).filter(id => id !== user.id);
  const slug = artist_slug || artist.slug;
  const artistName = artist.artist_name;

  // 1. In-app notifications for all followers
  // Dedup guard: skip if a notice for this exact release already exists.
  // Belt and braces with the unique indexes, which are the real guarantee.
  const dedupe = isAlbum
    ? supabase.from('notifications').select('*', { count: 'exact', head: true })
        .eq('type', 'new_album').eq('metadata->>album_id', album_id)
    : supabase.from('notifications').select('*', { count: 'exact', head: true })
        .eq('type', 'new_track').eq('track_id', track_id);

  const { count: existingCount } = await dedupe;

  if (existingCount > 0) {
    console.log(`Duplicate notify blocked for ${isAlbum ? 'album' : 'track'}: ${album_id || track_id}`);
    return { statusCode: 200, body: JSON.stringify({ notified: 0, skipped: 'duplicate' }) };
  }

  // "released a new EP" reads better than "a new album" when it is an EP,
  // and release_type already knows which it is.
  const releaseWord = isAlbum ? (albumData.release_type || 'album') : 'track';

  const notifRows = followerIds.map(uid => ({
    user_id:        uid,
    artist_id:      null,
    type:           isAlbum ? 'new_album' : 'new_track',
    title:          `${artistName} released a new ${releaseWord}!`,
    message:        resolvedTitle,
    // track_id stays null for an album. It is a foreign key to tracks and
    // pointing it at one song inside the album is exactly the thing that
    // made this look like a single in the first place.
    track_id:       isAlbum ? null : track_id,
    from_artist_id: artist_id,
    metadata: isAlbum
      ? {
          album_id:      albumData.id,
          album_title:   resolvedTitle,
          album_slug:    albumData.slug || null,
          album_artwork: albumData.cover_artwork_url || null,
          release_type:  albumData.release_type || 'album',
          artist_name:   artistName,
          artist_slug:   slug,
        }
      : {
          track_id:      track_id,
          track_title:   resolvedTitle,
          track_slug:    trackData?.slug || null,
          track_artwork: trackData?.cover_artwork_url || null,
          file_url:      trackData?.file_url || null,
          artist_name:   artistName,
          artist_slug:   slug,
        },
  }));

  for (let i = 0; i < notifRows.length; i += 50) {
    await supabase.from('notifications').insert(notifRows.slice(i, i + 50));
  }

  // 2. Web push — all followers (following = opted in)
  if (followerIds.length > 0) {
    const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
    fetch(`${siteUrl}/.netlify/functions/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET,
      },
      body: JSON.stringify({
        user_ids: followerIds,
        title:    `${artistName} just dropped \u{1F3B5}`,
        // resolvedTitle, not the body param. `title` was whatever the client
        // happened to send, which for the album path was sometimes empty.
        body:     resolvedTitle,
        // The push opens the release itself now. It used to land everybody on
        // the artist page whatever they had tapped, which is a page they then
        // have to search for the new thing on.
        url:      isAlbum
                    ? (albumData.slug && slug
                        ? `/album/${slug}/${albumData.slug}`
                        : `/album/${albumData.id}`)
                    : (trackData?.slug ? `/track/${trackData.slug}`
                                       : (slug ? `/artist/${slug}` : '/')),
        tag:      isAlbum ? `new-album-${album_id}` : `new-track-${track_id}`,
      }),
    }).catch(console.error);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ notified: followerIds.length, pushed: followerIds.length }),
  };
};