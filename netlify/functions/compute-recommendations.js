/**
 * netlify/functions/compute-recommendations.js
 *
 * Runs nightly at 03:00 UTC via netlify.toml schedule.
 * Also callable manually via POST for testing.
 *
 * For each active listener (active in last 30 days) computes a scored
 * list of up to 50 tracks and writes them to listener_recommendations.
 *
 * Scoring weights:
 *   +80  track from an artist the user follows
 *   +60  genre/mood matches top listened genre
 *   +40  genre/mood matches secondary genre
 *   +30  high platform engagement_score (top 20% of all tracks)
 *   +25  track is less than 7 days old (new release bonus)
 *   +20  track has low stream_count but good engagement (hidden gem)
 *   +15  mood matches user's stated mood preference
 *   -50  user has already streamed this track (penalise repeats)
 *   -100 user has liked this track (already discovered, skip)
 *
 * Coldstart: users with no stream history fall back to genre_preferences
 * from user_profiles, then pure trending if that's also empty.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE        = 50;   // users per batch
const RECS_PER_USER     = 50;   // tracks to store per user
const ACTIVE_DAYS       = 30;   // consider users active in last N days
const NEW_RELEASE_DAYS  = 7;    // tracks newer than this get new release bonus
const MAX_PER_ARTIST    = 3;    // max tracks from same artist in recs

exports.handler = async (event) => {
  const isManual = event.httpMethod === 'POST';
  console.log(`compute-recommendations running — ${isManual ? 'manual' : 'scheduled'}`);

  try {
    // ── 1. Get all tracks (published, with artist info) ────────────────────
    const { data: allTracks, error: trackErr } = await supabase
      .from('tracks')
      .select('id, artist_id, genre, mood, engagement_score, stream_count, created_at')
      .eq('is_published', true)
      .order('engagement_score', { ascending: false })
      .limit(500);

    if (trackErr) throw trackErr;
    if (!allTracks?.length) {
      console.log('No tracks found');
      return { statusCode: 200, body: 'No tracks' };
    }

    // Pre-compute engagement percentile cutoff (top 20%)
    const sortedEngagement = [...allTracks].sort((a, b) => (b.engagement_score || 0) - (a.engagement_score || 0));
    const top20cutoff = sortedEngagement[Math.floor(sortedEngagement.length * 0.2)]?.engagement_score || 0;

    // Hidden gem: low streams but decent engagement
    const avgStreams = allTracks.reduce((s, t) => s + (t.stream_count || 0), 0) / allTracks.length;
    const hiddenGemThreshold = avgStreams * 0.3;

    const now = Date.now();
    const newReleaseCutoff = new Date(now - NEW_RELEASE_DAYS * 86400000).toISOString();

    // ── 2. Get active listeners ───────────────────────────────────────────
    const activeCutoff = new Date(now - ACTIVE_DAYS * 86400000).toISOString();
    const { data: activeListeners } = await supabase
      .from('listeners')
      .select('user_id')
      .gte('last_seen_at', activeCutoff)
      .limit(2000);

    if (!activeListeners?.length) {
      console.log('No active listeners');
      return { statusCode: 200, body: 'No active listeners' };
    }

    console.log(`Processing ${activeListeners.length} active listeners`);
    let processed = 0;

    // ── 3. Process in batches ─────────────────────────────────────────────
    for (let i = 0; i < activeListeners.length; i += BATCH_SIZE) {
      const batch = activeListeners.slice(i, i + BATCH_SIZE);
      const userIds = batch.map(l => l.user_id);

      // Fetch all data for this batch in parallel
      const [
        { data: streamsData },
        { data: likesData },
        { data: followsData },
        { data: profilesData },
      ] = await Promise.all([
        supabase.from('streams').select('user_id, track_id, tracks(genre, mood)').in('user_id', userIds).limit(5000),
        supabase.from('track_likes').select('user_id, track_id').in('user_id', userIds),
        supabase.from('follows').select('follower_id, artist_id').in('follower_id', userIds),
        supabase.from('user_profiles').select('user_id, genre_preferences, mood').in('user_id', userIds),
      ]);

      // Index by user
      const streamsByUser  = {};
      const likesByUser    = {};
      const followsByUser  = {};
      const profileByUser  = {};

      (streamsData  || []).forEach(s => { (streamsByUser[s.user_id]  = streamsByUser[s.user_id]  || []).push(s); });
      (likesData    || []).forEach(l => { (likesByUser[l.user_id]    = likesByUser[l.user_id]    || new Set()).add(l.track_id); });
      (followsData  || []).forEach(f => { (followsByUser[f.follower_id] = followsByUser[f.follower_id] || new Set()).add(f.artist_id); });
      (profilesData || []).forEach(p => { profileByUser[p.user_id] = p; });

      const upsertRows = [];

      for (const { user_id } of batch) {
        const streams     = streamsByUser[user_id]  || [];
        const liked       = likesByUser[user_id]    || new Set();
        const following   = followsByUser[user_id]  || new Set();
        const profile     = profileByUser[user_id]  || {};

        // Build genre/mood taste profile from streams
        const tagCounts = {};
        const streamedIds = new Set();
        streams.forEach(s => {
          if (s.track_id) streamedIds.add(s.track_id);
          const g = s.tracks?.genre; const m = s.tracks?.mood;
          if (g) tagCounts[g] = (tagCounts[g] || 0) + 1;
          if (m) tagCounts[m] = (tagCounts[m] || 0) + 1;
        });

        // Top genres from listening history, fallback to profile preferences
        let topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(e => e[0]);
        if (topTags.length === 0) topTags = profile.genre_preferences || [];
        const primaryTag   = topTags[0] || null;
        const secondaryTag = topTags[1] || null;
        const moodPref     = profile.mood || null;
        const isColdstart  = streams.length === 0;

        // Score every track
        const scored = allTracks.map(track => {
          // Skip already liked
          if (liked.has(track.id)) return null;

          let score  = 0;
          let reason = 'recommended';

          if (isColdstart) {
            // Coldstart: genre match + trending
            if (primaryTag && (track.genre === primaryTag || track.mood === primaryTag)) { score += 60; reason = 'genre_match'; }
            else { score += (track.engagement_score || 0) * 0.1; reason = 'trending'; }
          } else {
            // From followed artist
            if (following.has(track.artist_id)) { score += 80; reason = 'from_following'; }

            // Genre/mood match
            if (primaryTag   && (track.genre === primaryTag   || track.mood === primaryTag))   { score += 60; if (reason === 'recommended') reason = 'genre_match'; }
            if (secondaryTag && (track.genre === secondaryTag || track.mood === secondaryTag)) { score += 40; if (reason === 'recommended') reason = 'genre_match'; }

            // Mood match
            if (moodPref && track.mood === moodPref) { score += 15; }

            // High engagement
            if ((track.engagement_score || 0) >= top20cutoff) { score += 30; if (reason === 'recommended') reason = 'trending'; }

            // New release bonus
            if (track.created_at >= newReleaseCutoff) { score += 25; if (reason === 'from_following' || reason === 'genre_match') reason = 'new_release'; }

            // Hidden gem: low streams but decent engagement
            if ((track.stream_count || 0) <= hiddenGemThreshold && (track.engagement_score || 0) > 0) {
              score += 20; if (reason === 'recommended') reason = 'hidden_gem';
            }

            // Already streamed penalty
            if (streamedIds.has(track.id)) score -= 50;
          }

          if (score <= 0) return null;
          return { track_id: track.id, artist_id: track.artist_id, score, reason };
        }).filter(Boolean);

        // Sort by score, enforce max per artist, take top N
        scored.sort((a, b) => b.score - a.score);
        const artistCounts = {};
        const top = [];
        for (const item of scored) {
          if (top.length >= RECS_PER_USER) break;
          const ac = artistCounts[item.artist_id] || 0;
          if (ac >= MAX_PER_ARTIST) continue;
          artistCounts[item.artist_id] = ac + 1;
          top.push(item);
        }

        top.forEach(item => {
          upsertRows.push({
            user_id,
            track_id:    item.track_id,
            score:       Math.round(item.score * 10) / 10,
            reason:      item.reason,
            computed_at: new Date().toISOString(),
          });
        });
      }

      // Upsert this batch
      if (upsertRows.length > 0) {
        // Delete old recs for these users first, then insert fresh
        await supabase.from('listener_recommendations').delete().in('user_id', userIds);
        const { error: upsertErr } = await supabase.from('listener_recommendations').insert(upsertRows);
        if (upsertErr) console.error('Upsert error:', upsertErr.message);
      }

      processed += batch.length;
      console.log(`Processed ${processed}/${activeListeners.length} users`);
    }

    console.log(`Done. Processed ${processed} users.`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, processed }) };

  } catch (err) {
    console.error('compute-recommendations error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
