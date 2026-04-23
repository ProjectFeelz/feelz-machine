/**
 * netlify/functions/weekly-listener-recap.js
 *
 * Runs every Sunday at 18:00 UTC.
 * Sends each active listener a personalised "Your week in music" notification:
 *   - Total streams this week
 *   - Top artist
 *   - Top genre
 *   - Streak status
 *   - A nudge if they discovered a new artist
 *
 * Schedule: netlify.toml → "0 18 * * 0"
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getWeekBounds() {
  const now  = new Date();
  // Week runs Mon–Sun. End = this Sunday 18:00, Start = last Monday 00:00
  const day  = now.getDay(); // 0 = Sun
  const daysBack = day === 0 ? 6 : day - 1; // days since last Monday
  const start = new Date(now);
  start.setDate(now.getDate() - daysBack);
  start.setHours(0, 0, 0, 0);
  return {
    weekStart: start.toISOString(),
    weekEnd:   now.toISOString(),
  };
}

exports.handler = async () => {
  const { weekStart, weekEnd } = getWeekBounds();

  // Get all streams this week with track + artist info
  const { data: weekStreams } = await supabase
    .from('streams')
    .select('user_id, track_id, created_at, tracks(genre, artists(id, artist_name))')
    .gte('created_at', weekStart)
    .lt('created_at',  weekEnd)
    .limit(10000);

  if (!weekStreams?.length) {
    console.log('No streams this week, skipping recap');
    return { statusCode: 200, body: 'No streams' };
  }

  // Group by listener
  const byUser = {};
  for (const s of weekStreams) {
    if (!s.user_id) continue;
    if (!byUser[s.user_id]) byUser[s.user_id] = { streams: [], artistCounts: {}, genreCounts: {} };
    byUser[s.user_id].streams.push(s);
    const aid   = s.tracks?.artists?.id;
    const aname = s.tracks?.artists?.artist_name;
    const genre = s.tracks?.genre;
    if (aid && aname) byUser[s.user_id].artistCounts[aname] = (byUser[s.user_id].artistCounts[aname] || 0) + 1;
    if (genre)        byUser[s.user_id].genreCounts[genre]  = (byUser[s.user_id].genreCounts[genre]  || 0) + 1;
  }

  // Get streak data for all active users in one query
  const userIds = Object.keys(byUser);
  const { data: streakRows } = await supabase
    .from('user_streaks')
    .select('user_id, current_streak, discovery_streak')
    .in('user_id', userIds);
  const streakMap = {};
  (streakRows || []).forEach(r => { streakMap[r.user_id] = r; });

  // Check which users already got a recap this week (avoid double-send on re-runs)
  const { data: existing } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('type', 'weekly_report')
    .gte('created_at', weekStart);
  const alreadySent = new Set((existing || []).map(r => r.user_id));

  let sent = 0;
  const BATCH = 50;
  const eligible = userIds.filter(uid => !alreadySent.has(uid));

  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH);
    const rows = [];

    for (const uid of batch) {
      const data = byUser[uid];
      const count = data.streams.length;
      if (count < 1) continue;

      // Top artist
      const topArtist = Object.entries(data.artistCounts)
        .sort((a, b) => b[1] - a[1])[0];
      // Top genre
      const topGenre = Object.entries(data.genreCounts)
        .sort((a, b) => b[1] - a[1])[0];

      const streak = streakMap[uid];
      const currentStreak   = streak?.current_streak   || 0;
      const discoveryStreak = streak?.discovery_streak || 0;

      // Build a natural-feeling title
      let title;
      if (count >= 50) {
        title = `Big week — ${count} tracks played`;
      } else if (count >= 20) {
        title = `Solid week — ${count} tracks`;
      } else if (count >= 5) {
        title = `${count} tracks this week`;
      } else {
        title = `You played ${count} track${count !== 1 ? 's' : ''} this week`;
      }

      // Build message body
      const parts = [];
      if (topArtist) parts.push(`Most played: ${topArtist[0]} (${topArtist[1]} plays)`);
      if (topGenre)  parts.push(`Top genre: ${topGenre[0]}`);
      if (currentStreak >= 3) parts.push(`${currentStreak}-day streak going`);
      if (discoveryStreak >= 2) parts.push(`${discoveryStreak} new artists discovered`);

      const message = parts.length
        ? parts.join('. ') + '.'
        : 'Keep the music going next week.';

      rows.push({
        user_id:  uid,
        type:     'weekly_report',
        title,
        message,
        metadata: {
          week_start:       weekStart,
          total_streams:    count,
          top_artist:       topArtist?.[0] || null,
          top_artist_plays: topArtist?.[1] || 0,
          top_genre:        topGenre?.[0]  || null,
          current_streak:   currentStreak,
          discovery_streak: discoveryStreak,
          listener_recap:   true,
        },
      });
    }

    if (rows.length) {
      const { error } = await supabase.from('notifications').insert(rows);
      if (error) console.error('Batch insert error:', JSON.stringify(error));
      else sent += rows.length;
    }
  }

  console.log(`Listener recap: ${sent} sent of ${eligible.length} eligible`);
  return {
    statusCode: 200,
    body: JSON.stringify({ sent, eligible: eligible.length, total_active_users: userIds.length }),
  };
};