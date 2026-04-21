/**
 * netlify/functions/notify-new-track.js
 *
 * Called by TrackUploadPanel after a track is published.
 * 1. Inserts in-app notifications for ALL followers.
 * 2. Sends web push only to followers who have drop alerts enabled.
 *
 * POST body: { track_id, track_title, artist_id, artist_slug, token }
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

  const { track_id, track_title, artist_id, artist_slug, token } = body;
  if (!track_id || !artist_id || !token) return { statusCode: 400, body: 'Missing fields' };

  // Verify the caller is the artist
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { statusCode: 401, body: 'Unauthorized' };

  const { data: artist } = await supabase
    .from('artists').select('id, artist_name, slug')
    .eq('id', artist_id).eq('user_id', user.id).maybeSingle();
  if (!artist) return { statusCode: 403, body: 'Forbidden' };

  // Get all followers
  const { data: followers } = await supabase
    .from('follows').select('follower_id').eq('artist_id', artist_id);
  if (!followers?.length) return { statusCode: 200, body: JSON.stringify({ notified: 0 }) };

  const followerIds = followers.map(f => f.follower_id);
  const slug = artist_slug || artist.slug;
  const title = track_title || 'a new track';
  const artistName = artist.artist_name;

  // 1. In-app notifications for all followers (use correct 'message' column)
  const notifRows = followerIds.map(uid => ({
    user_id:        uid,
    artist_id:      artist_id,
    type:           'new_track',
    title:          `${artistName} dropped a new track`,
    message:        title,
    track_id:       track_id,
    from_artist_id: artist_id,
    metadata: { track_title: title, artist_name: artistName, artist_slug: slug },
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
        title:    `${artistName} just dropped 🎵`,
        body:     title,
        url:      slug ? `/artist/${slug}` : '/',
        tag:      `new-track-${track_id}`,
      }),
    }).catch(console.error);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ notified: followerIds.length, pushed: followerIds.length }),
  };
};
