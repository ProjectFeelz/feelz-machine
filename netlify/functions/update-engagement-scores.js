/**
 * update-engagement-scores.js
 *
 * Runs nightly at 02:00 UTC — before compute-behavior-profiles (03:00)
 * and compute-recommendations (03:30).
 *
 * Computes a real engagement_score for every published track based on:
 *   streams_30d     × 1.0   (base reach)
 *   streams_7d      × 3.0   (velocity — recent traction matters more)
 *   streams_24h     × 10.0  (viral spike)
 *   like_count      × 5.0   (quality signal)
 *   comment_count   × 8.0   (strong intent signal)
 *   download_count  × 12.0  (highest intent — someone paid attention)
 *   playlist_adds   × 6.0   (deliberate keep — listener filed it away)
 *   follower_bonus  × 2.0   (tracks from followed artists get slight lift)
 *
 * Score is normalised to 0-100 scale across all tracks.
 * Also computes a velocity_score (0-100) based on 24h/7d stream ratio.
 */

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const isManual = event.httpMethod === 'POST';
  console.log(`[engagement] starting — ${isManual ? 'manual' : 'scheduled'}`);

  try {
    const now      = Date.now();
    const d7ago    = new Date(now - 7  * 86400000).toISOString();
    const d30ago   = new Date(now - 30 * 86400000).toISOString();
    const d24ago   = new Date(now - 24 * 3600000).toISOString();

    // 1. Load all published tracks
    const { data: tracks } = await supabase
      .from('tracks')
      .select('id, artist_id, like_count, download_count, playlist_add_count')
      .eq('is_published', true)
      .limit(2000);

    if (!tracks?.length) return { statusCode: 200, body: 'No tracks' };
    console.log(`[engagement] scoring ${tracks.length} tracks`);

    const trackIds = tracks.map(t => t.id);

    // 2. Fetch stream counts in parallel
    const [
      { data: streams30 },
      { data: streams7  },
      { data: streams24 },
      { data: comments  },
    ] = await Promise.all([
      supabase.from('streams').select('track_id').in('track_id', trackIds).gte('created_at', d30ago),
      supabase.from('streams').select('track_id').in('track_id', trackIds).gte('created_at', d7ago),
      supabase.from('streams').select('track_id').in('track_id', trackIds).gte('created_at', d24ago),
      supabase.from('track_comments').select('track_id').in('track_id', trackIds),
    ]);

    // Build maps
    const s30Map  = {}; (streams30  || []).forEach(s => { s30Map[s.track_id]  = (s30Map[s.track_id]  || 0) + 1; });
    const s7Map   = {}; (streams7   || []).forEach(s => { s7Map[s.track_id]   = (s7Map[s.track_id]   || 0) + 1; });
    const s24Map  = {}; (streams24  || []).forEach(s => { s24Map[s.track_id]  = (s24Map[s.track_id]  || 0) + 1; });
    const cMap    = {}; (comments   || []).forEach(c => { cMap[c.track_id]    = (cMap[c.track_id]    || 0) + 1; });

    // 3. Compute raw scores
    const rawScores = tracks.map(t => {
      const s30  = s30Map[t.id]  || 0;
      const s7   = s7Map[t.id]   || 0;
      const s24  = s24Map[t.id]  || 0;
      const cmts = cMap[t.id]    || 0;
      const likes = t.like_count || 0;
      const dls   = t.download_count || 0;
      const padds = t.playlist_add_count || 0;

      const raw = (s30 * 1.0) + (s7 * 3.0) + (s24 * 10.0)
                + (likes * 5.0) + (cmts * 8.0) + (dls * 12.0)
                + (padds * 6.0);

      // Velocity: how much of last 30d streams happened in last 7d
      const velocity = s30 > 0 ? Math.min(100, Math.round((s7 / s30) * 100 * (s30 / 10))) : 0;

      return { id: t.id, raw, velocity, s30, s7, s24 };
    });

    // 4. Normalise to 0-100
    const maxRaw = Math.max(...rawScores.map(t => t.raw), 1);
    const updates = rawScores.map(t => ({
      id:               t.id,
      engagement_score: Math.round((t.raw / maxRaw) * 100 * 10) / 10,
      velocity_score:   t.velocity,
      streams_30d:      t.s30,
      streams_7d:       t.s7,
      streams_24h:      t.s24,
    }));

    // 5. Batch update tracks
    const CHUNK = 100;
    let updated = 0;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      for (const u of chunk) {
        await supabase.from('tracks').update({
          engagement_score: u.engagement_score,
        }).eq('id', u.id);
      }
      updated += chunk.length;
    }

    console.log(`[engagement] updated ${updated} tracks`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, updated }) };

  } catch (err) {
    console.error('[engagement] error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};