/**
 * netlify/functions/weekly-artist-report.js
 *
 * Runs every Monday at 08:00 UTC.
 * Sends each artist a weekly breakdown:
 *   - Top track this week
 *   - Total streams vs last week
 *   - New followers
 *   - Top listener (most streams)
 *   - Best day
 *
 * Schedule: netlify.toml → "0 8 * * 1"
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getWeekBounds() {
  const now = new Date();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  thisMonday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const twoWeeksAgo = new Date(thisMonday);
  twoWeeksAgo.setDate(thisMonday.getDate() - 14);
  return {
    thisWeekStart: lastMonday.toISOString(),
    thisWeekEnd:   thisMonday.toISOString(),
    lastWeekStart: twoWeeksAgo.toISOString(),
    lastWeekEnd:   lastMonday.toISOString(),
  };
}

exports.handler = async () => {
  const { thisWeekStart, thisWeekEnd, lastWeekStart, lastWeekEnd } = getWeekBounds();

  // Get all artists with at least one stream this week
  const { data: activeStreams } = await supabase
    .from('streams')
    .select('track_id, user_id, created_at, tracks!inner(artist_id, title)')
    .gte('created_at', thisWeekStart)
    .lt('created_at', thisWeekEnd)
    .limit(5000);

  if (!activeStreams?.length) return { statusCode: 200, body: 'No streams this week' };

  // Group by artist
  const byArtist = {};
  for (const s of activeStreams) {
    const aid = s.tracks?.artist_id;
    if (!aid) continue;
    if (!byArtist[aid]) byArtist[aid] = { streams: [], trackCounts: {}, userCounts: {}, dayCounts: {} };
    byArtist[aid].streams.push(s);
    byArtist[aid].trackCounts[s.track_id] = (byArtist[aid].trackCounts[s.track_id] || 0) + 1;
    byArtist[aid].userCounts[s.user_id]   = (byArtist[aid].userCounts[s.user_id] || 0) + 1;
    const day = new Date(s.created_at).toLocaleDateString('en-US', { weekday: 'long' });
    byArtist[aid].dayCounts[day] = (byArtist[aid].dayCounts[day] || 0) + 1;
  }

  // Last week stream counts for comparison
  const { data: lastWeekStreams } = await supabase
    .from('streams')
    .select('tracks!inner(artist_id)')
    .gte('created_at', lastWeekStart)
    .lt('created_at', lastWeekEnd)
    .limit(5000);

  const lastWeekByArtist = {};
  for (const s of lastWeekStreams || []) {
    const aid = s.tracks?.artist_id;
    if (aid) lastWeekByArtist[aid] = (lastWeekByArtist[aid] || 0) + 1;
  }

  let sent = 0;

  for (const [artistId, data] of Object.entries(byArtist)) {
    try {
      // Get artist info
      const { data: artist } = await supabase
        .from('artists').select('id, artist_name').eq('id', artistId).maybeSingle();
      if (!artist) continue;

      const thisWeekCount = data.streams.length;
      const lastWeekCount = lastWeekByArtist[artistId] || 0;
      const delta = thisWeekCount - lastWeekCount;
      const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

      // Top track
      const topTrackId = Object.entries(data.trackCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const topTrackStream = data.streams.find(s => s.track_id === topTrackId);
      const topTrackTitle = topTrackStream?.tracks?.title || 'Unknown';
      const topTrackPlays = data.trackCounts[topTrackId] || 0;

      // Best day
      const bestDay = Object.entries(data.dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

      // New followers this week
      const { count: newFollowers } = await supabase
        .from('follows').select('*', { count: 'exact', head: true })
        .eq('artist_id', artistId).gte('created_at', thisWeekStart).lt('created_at', thisWeekEnd);

      await supabase.from('notifications').insert({
        artist_id: artistId,
        type: 'weekly_report',
        title: `Your week: ${thisWeekCount} stream${thisWeekCount !== 1 ? 's' : ''} (${deltaStr} vs last week)`,
        message: `Top track: "${topTrackTitle}" with ${topTrackPlays} plays. Best day: ${bestDay}. ${newFollowers || 0} new follower${newFollowers !== 1 ? 's' : ''}.`,
        metadata: {
          thisWeekStreams: thisWeekCount,
          lastWeekStreams: lastWeekCount,
          delta,
          topTrack: { id: topTrackId, title: topTrackTitle, plays: topTrackPlays },
          bestDay,
          newFollowers: newFollowers || 0,
          weekStart: thisWeekStart,
        },
      });

      sent++;
    } catch (err) {
      console.error(`Report error for artist ${artistId}:`, err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ sent, artists: Object.keys(byArtist).length }) };
};