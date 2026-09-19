/**
 * netlify/functions/daily-spotlight.js
 *
 * Runs daily at 00:05 UTC via netlify.toml schedule.
 * For every active listener, picks SPOTLIGHT_PER_DAY artists they have NEVER
 * streamed and writes a row each to daily_artist_spotlight so the home page
 * can read them.
 *
 * Strategy:
 *   1. Get all artists the user has ever streamed
 *   2. From the remaining artists (published, with tracks), take the ones
 *      with the highest total_streams they haven't seen as a spotlight before
 *   3. Upsert into daily_artist_spotlight
 *      (unique on user_id + spotlight_date + artist_id, migration 136)
 *
 * NOTE: migration 136 must be applied before deploying this. Until it is, the
 * unique key is (user_id, spotlight_date) and the second and third rows would
 * overwrite the first rather than sit beside it. The home page tops itself up
 * client side either way, so a lagging migration shows three artists, just not
 * the personalised ones.
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

// Must match SPOTLIGHT_PER_DAY in src/pages/HomePage.js.
const SPOTLIGHT_PER_DAY = 3;

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
      .eq('is_suspended', false)
      .gt('track_count', 0)
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

    // Count per user, not a bare set: a listener who already has one artist for
    // today still needs the other two.
    const haveToday = {};
    (alreadySpotlit || []).forEach(r => {
      haveToday[r.user_id] = (haveToday[r.user_id] || 0) + 1;
    });
    const eligible = activeListeners.filter(
      l => (haveToday[l.user_id] || 0) < SPOTLIGHT_PER_DAY
    );

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
            .select('artist_id, spotlight_date')
            .eq('user_id', listener.user_id);

          const seenSpotlightIds = new Set((pastSpotlights || []).map(r => r.artist_id));
          // Artists this user already has for TODAY, from a partial earlier run.
          // Seeded into `taken` below so the looser passes cannot pick them
          // again and report an assignment that was really a no-op upsert.
          const todayIds = new Set(
            (pastSpotlights || []).filter(r => r.spotlight_date === TODAY).map(r => r.artist_id)
          );

          // Fill in three tiers of preference, best first, without repeating an
          // artist inside the same day.
          const need   = SPOTLIGHT_PER_DAY - (haveToday[listener.user_id] || 0);
          const chosen = [];
          const taken  = new Set(todayIds);

          const take = (predicate) => {
            for (const a of allArtists) {
              if (chosen.length >= need) return;
              if (taken.has(a.id)) continue;
              if (!predicate(a)) continue;
              taken.add(a.id);
              chosen.push(a);
            }
          };

          // 1. Never streamed and never spotlighted before.
          take(a => !streamedArtistIds.has(a.id) && !seenSpotlightIds.has(a.id));
          // 2. Never streamed, even if spotlighted before.
          take(a => !streamedArtistIds.has(a.id));
          // 3. Anyone, so the row still fills on a small catalogue.
          take(() => true);

          if (!chosen.length) continue;

          const { error: upsertErr } = await supabase
            .from('daily_artist_spotlight')
            .upsert(
              chosen.map(a => ({
                user_id: listener.user_id,
                artist_id: a.id,
                spotlight_date: TODAY,
              })),
              { onConflict: 'user_id,spotlight_date,artist_id' }
            );

          if (upsertErr) {
            console.error(`Spotlight upsert failed for ${listener.user_id}:`, upsertErr.message);
            continue;
          }

          assigned += chosen.length;
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