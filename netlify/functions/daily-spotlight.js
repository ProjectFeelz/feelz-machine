/**
 * netlify/functions/daily-spotlight.js
 *
 * Runs daily at 00:05 UTC via netlify.toml schedule.
 * For every active listener, picks one artist they have NEVER streamed
 * and writes a row to daily_artist_spotlight so the home page can read it.
 *
 * Strategy:
 *   1. Get all artists the user has ever streamed
 *   2. From the remaining artists (published, with tracks), pick the one
 *      with the highest engagement_score they haven't seen as a spotlight before
 *   3. Upsert into daily_artist_spotlight (unique on user_id + spotlight_date)
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 100;
const TODAY = new Date().toISOString().split('T')[0];

exports.handler = async (event) => {
  const isManual = event.httpMethod === 'POST';
  console.log(`Daily spotlight running for ${TODAY} — ${isManual ? 'manual' : 'scheduled'}`);

  try {
    // 1. Get all active listeners (seen in last 60 days)
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: activeListeners } = await supabase
      .from('listeners')
      .select('user_id')
      .gte('last_seen_at', cutoff);

    if (!activeListeners?.length) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no active listeners' }) };
    }

    // 2. Get all artists with at least one published track (eligible for spotlight)
    const { data: allArtists } = await supabase
      .from('artists')
      .select('id, artist_name, slug, profile_image_url, total_streams, follower_count')
      .not('profile_image_url', 'is', null)
      .neq('profile_image_url', '')
      .order('total_streams', { ascending: false })
      .limit(500);

    if (!allArtists?.length) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no eligible artists' }) };
    }

    // 3. Check who already got a spotlight today
    const userIds = activeListeners.map(l => l.user_id);
    const { data: alreadySpotlit } = await supabase
      .from('daily_artist_spotlight')
      .select('user_id')
      .eq('spotlight_date', TODAY)
      .in('user_id', userIds);

    const alreadySet = new Set((alreadySpotlit || []).map(r => r.user_id));
    const eligible = activeListeners.filter(l => !alreadySet.has(l.user_id));

    if (!eligible.length) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'all users already have spotlight today' }) };
    }

    let assigned = 0;

    // Process in batches
    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      const batch = eligible.slice(i, i + BATCH_SIZE);

      for (const listener of batch) {
        try {
          // Get artist IDs this user has streamed
          const { data: streamed } = await supabase
            .from('streams')
            .select('tracks(artist_id)')
            .eq('user_id', listener.user_id)
            .limit(1000);

          const streamedArtistIds = new Set(
            (streamed || []).map(s => s.tracks?.artist_id).filter(Boolean)
          );

          // Get artists this user has already seen as spotlight (avoid repeats)
          const { data: pastSpotlights } = await supabase
            .from('daily_artist_spotlight')
            .select('artist_id')
            .eq('user_id', listener.user_id);

          const seenSpotlightIds = new Set((pastSpotlights || []).map(r => r.artist_id));

          // Pick the highest-ranked undiscovered, unspotlighted artist
          const pick = allArtists.find(a =>
            !streamedArtistIds.has(a.id) && !seenSpotlightIds.has(a.id)
          );

          // Fallback: if they've heard everyone, pick least-recently spotlighted
          const fallback = pick || allArtists.find(a => !streamedArtistIds.has(a.id)) || allArtists[0];

          if (!fallback) continue;

          await supabase.from('daily_artist_spotlight').upsert({
            user_id: listener.user_id,
            artist_id: fallback.id,
            spotlight_date: TODAY,
          }, { onConflict: 'user_id,spotlight_date' });

          assigned++;
        } catch (err) {
          console.error(`Spotlight error for user ${listener.user_id}:`, err.message);
        }
      }
    }

    console.log(`Spotlight complete. Assigned: ${assigned}/${eligible.length}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, date: TODAY, assigned, eligible: eligible.length }),
    };
  } catch (err) {
    console.error('Daily spotlight error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};