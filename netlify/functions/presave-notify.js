/**
 * netlify/functions/presave-notify.js
 *
 * Scheduled: runs daily at 09:00 UTC via netlify.toml
 * Checks for tracks that were preorder and are now published (release_date <= now).
 * Notifies all users who presaved them. Marks presaves as notified to prevent re-sends.
 *
 * Schedule: netlify.toml → "0 9 * * *"
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async () => {
  const now = new Date().toISOString();

  // Find presaves for tracks whose release date has passed and haven't been notified yet
  const { data: pendingPresaves } = await supabase
    .from('track_presaves')
    .select('id, user_id, track_id, tracks(id, title, is_published, release_date, artist_id, artists(artist_name, slug))')
    .eq('notified', false)
    .not('tracks.release_date', 'is', null)
    .lte('tracks.release_date', now);

  if (!pendingPresaves?.length) {
    console.log('No presaves to notify');
    return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };
  }

  // Group by track to batch notifications
  const byTrack = {};
  for (const ps of pendingPresaves) {
    const track = ps.tracks;
    if (!track?.is_published) continue; // only notify for actually published tracks
    if (!byTrack[ps.track_id]) byTrack[ps.track_id] = { track, userIds: [], presaveIds: [] };
    byTrack[ps.track_id].userIds.push(ps.user_id);
    byTrack[ps.track_id].presaveIds.push(ps.id);
  }

  let totalSent = 0;
  const siteUrl = process.env.URL || 'https://www.feelzmachine.com';

  for (const [trackId, { track, userIds, presaveIds }] of Object.entries(byTrack)) {
    try {
      const artistName = track.artists?.artist_name || 'An artist';
      const artistSlug = track.artists?.slug;
      const title      = `${artistName} just dropped "${track.title}"`;
      const message    = `You pre-saved this one. Time to listen.`;

      // Insert in-app notifications in batches of 50
      for (let i = 0; i < userIds.length; i += 50) {
        const batch = userIds.slice(i, i + 50);
        await supabase.from('notifications').insert(
          batch.map(uid => ({
            user_id:   uid,
            artist_id: track.artist_id,
            type:      'new_track',
            title,
            message,
            metadata: {
              track_id:    trackId,
              track_title: track.title,
              artist_name: artistName,
              artist_slug: artistSlug,
              from_presave: true,
            },
          }))
        );
      }

      // Fire web push
      fetch(`${siteUrl}/.netlify/functions/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET,
        },
        body: JSON.stringify({
          user_ids: userIds,
          title:    `${artistName} dropped 🎵`,
          body:     `"${track.title}" is out now`,
          url:      artistSlug ? `/artist/${artistSlug}` : '/',
          tag:      `presave-${trackId}`,
        }),
      }).catch(() => {});

      // Mark all presaves as notified
      await supabase.from('track_presaves')
        .update({ notified: true })
        .in('id', presaveIds);

      totalSent += userIds.length;
      console.log(`Notified ${userIds.length} presavers for track: ${track.title}`);
    } catch (err) {
      console.error(`Presave notify error for track ${trackId}:`, err.message);
    }
  }

  console.log(`Presave notify complete: ${totalSent} sent`);
  return { statusCode: 200, body: JSON.stringify({ sent: totalSent, tracks: Object.keys(byTrack).length }) };
};