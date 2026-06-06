/**
 * compute-recommendations.js
 *
 * Nightly at 03:30 UTC + manual POST trigger.
 *
 * Scoring model (higher = more likely to appear in ForYou feed):
 *
 * AFFINITY SIGNALS (what you already love)
 *   +100  from an artist you follow
 *   +80   exact genre match with top listened genre
 *   +60   exact genre match with secondary genre
 *   +50   mood match with your top mood
 *   +40   BPM within ±10 of your avg BPM preference
 *   +35   same artist as your most-streamed artist
 *   +30   collab track featuring an artist you follow
 *
 * DISCOVERY SIGNALS (things you haven't found yet)
 *   +45   new release (< 7 days) from artist you follow
 *   +35   new release (< 7 days) from any artist
 *   +25   hidden gem (low streams but top 30% engagement score)
 *   +20   trending (top 20% engagement score platform-wide)
 *   +15   serendipity bonus (random ±15 to prevent filter bubble)
 *
 * BEHAVIOUR TAGS (from listener_behavior_profiles)
 *   +20   deep_listener tag + track duration > 3 min
 *   +15   supporter tag + track has high like_count
 *   +15   collector tag + track is downloadable
 *   +10   competition_fan tag + track is competition entry
 *   -10   skip_heavy tag + track duration > 4 min
 *
 * PENALTIES
 *   -60   already streamed this track (penalise repeats)
 *   -30   streamed in last 7 days (recent repeat)
 *   -100  already liked (discovered, skip)
 *   -40   artist over-represented (> MAX_PER_ARTIST already in recs)
 *
 * DIVERSITY RULES
 *   Max 3 tracks per artist
 *   At least 40% of recs must be from non-followed artists (discovery)
 *   At least 20% must be new releases (< 14 days)
 *   At least 10% must be hidden gems
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE       = 30;
const RECS_PER_USER    = 60;   // store 60, serve 30 at a time — always fresh
const ACTIVE_DAYS      = 30;
const NEW_RELEASE_DAYS = 7;
const HOT_RELEASE_DAYS = 14;
const MAX_PER_ARTIST   = 3;
const MIN_DISCOVERY    = 0.40; // 40% from non-followed artists
const MIN_NEW_RELEASE  = 0.20; // 20% new releases
const MIN_HIDDEN_GEM   = 0.10; // 10% hidden gems

exports.handler = async (event) => {
  const isManual = event.httpMethod === 'POST';
  console.log(`[recs] starting — ${isManual ? 'manual' : 'scheduled'} — ${new Date().toISOString()}`);

  try {
    // ── 1. Load all published tracks with full metadata ───────────────────
    const { data: allTracks, error: trackErr } = await supabase
      .from('tracks')
      .select(`
        id, artist_id, genre, mood, engagement_score, stream_count,
        like_count, created_at, duration, download_price, is_downloadable,
        bpm, beat_key, beat_scale,
        collaborations(artist_id)
      `)
      .eq('is_published', true)
      .order('engagement_score', { ascending: false })
      .limit(1000);

    if (trackErr) throw trackErr;
    if (!allTracks?.length) return { statusCode: 200, body: 'No tracks' };

    // Pre-compute platform-wide stats
    const sortedEng    = [...allTracks].sort((a, b) => (b.engagement_score || 0) - (a.engagement_score || 0));
    const top20cutoff  = sortedEng[Math.floor(sortedEng.length * 0.2)]?.engagement_score || 0;
    const avgStreams    = allTracks.reduce((s, t) => s + (t.stream_count || 0), 0) / allTracks.length;
    const hiddenGemMax = avgStreams * 0.3;
    const now          = Date.now();
    const newRelCutoff = new Date(now - NEW_RELEASE_DAYS * 86400000).toISOString();
    const hotRelCutoff = new Date(now - HOT_RELEASE_DAYS * 86400000).toISOString();
    const recent7d     = new Date(now - 7 * 86400000).toISOString();

    // Build collab artist index: track_id → Set of collaborating artist_ids
    const collabIndex = {};
    allTracks.forEach(t => {
      if (t.collaborations?.length) {
        collabIndex[t.id] = new Set((t.collaborations).map(c => c.artist_id).filter(Boolean));
      }
    });

    // ── 2. Get active listeners ───────────────────────────────────────────
    const activeCutoff = new Date(now - ACTIVE_DAYS * 86400000).toISOString();
    const { data: activeListeners } = await supabase
      .from('listeners')
      .select('user_id')
      .gte('last_seen_at', activeCutoff)
      .limit(5000);

    if (!activeListeners?.length) return { statusCode: 200, body: 'No active listeners' };
    console.log(`[recs] ${activeListeners.length} active listeners`);

    let processed = 0;

    // ── 3. Process in batches ─────────────────────────────────────────────
    for (let i = 0; i < activeListeners.length; i += BATCH_SIZE) {
      const batch   = activeListeners.slice(i, i + BATCH_SIZE);
      const userIds = batch.map(l => l.user_id);

      const [
        { data: streamsData },
        { data: recentStreams },
        { data: likesData },
        { data: followsData },
        { data: behaviorData },
        { data: downloadData },
        { data: feedbackData },
      ] = await Promise.all([
        // All-time streams (for genre taste)
        supabase.from('streams').select('user_id, track_id, tracks(genre, mood, bpm, duration, artist_id)')
          .in('user_id', userIds).order('created_at', { ascending: false }).limit(10000),
        // Recent 7d streams (for recency penalty)
        supabase.from('streams').select('user_id, track_id')
          .in('user_id', userIds).gte('created_at', recent7d),
        // Liked tracks
        supabase.from('track_likes').select('user_id, track_id').in('user_id', userIds),
        // Followed artists
        supabase.from('follows').select('follower_id, artist_id').in('follower_id', userIds),
        // Behavior profiles with tags
        supabase.from('listener_behavior_profiles').select(
          'user_id, top_genre, second_genre, top_mood, behavior_tags, top_artist_id, avg_bpm, streams_30d'
        ).in('user_id', userIds),
        // Downloads
        supabase.from('downloads').select('user_id, track_id').in('user_id', userIds),
        // Explicit feedback
        supabase.from('listener_feedback').select('user_id, track_id, artist_id, signal').in('user_id', userIds),
      ]);

      // Index all data by user_id
      const streamsByUser  = {};
      const recentByUser   = {};
      const likesByUser    = {};
      const followsByUser  = {};
      const behaviorByUser = {};
      const downloadsByUser = {};

      (streamsData    || []).forEach(s => { (streamsByUser[s.user_id] = streamsByUser[s.user_id] || []).push(s); });
      (recentStreams  || []).forEach(s => { (recentByUser[s.user_id]  = recentByUser[s.user_id]  || new Set()).add(s.track_id); });
      (likesData      || []).forEach(l => { (likesByUser[l.user_id]   = likesByUser[l.user_id]   || new Set()).add(l.track_id); });
      (followsData    || []).forEach(f => { (followsByUser[f.follower_id] = followsByUser[f.follower_id] || new Set()).add(f.artist_id); });
      (behaviorData   || []).forEach(b => { behaviorByUser[b.user_id] = b; });
      (downloadData   || []).forEach(d => { (downloadsByUser[d.user_id] = downloadsByUser[d.user_id] || new Set()).add(d.track_id); });
      const feedbackByUser = {};
      (feedbackData || []).forEach(f => {
        if (!feedbackByUser[f.user_id]) feedbackByUser[f.user_id] = { notInterested: new Set(), deepListen: new Set(), skipped: new Set(), hiddenArtists: new Set() };
        const fb = feedbackByUser[f.user_id];
        if (f.signal === 'not_interested') { fb.notInterested.add(f.track_id); fb.hiddenArtists.add(f.artist_id); }
        if (f.signal === 'deep_listen') fb.deepListen.add(f.track_id);
        if (f.signal === 'skip') fb.skipped.add(f.track_id);
      });

      const upsertRows = [];

      for (const { user_id } of batch) {
        const streams      = streamsByUser[user_id]   || [];
        const recentIds    = recentByUser[user_id]    || new Set();
        const liked        = likesByUser[user_id]     || new Set();
        const following    = followsByUser[user_id]   || new Set();
        const behavior     = behaviorByUser[user_id]  || {};
        const downloaded   = downloadsByUser[user_id] || new Set();
        const isColdstart  = streams.length === 0;
        const feedback     = feedbackByUser[user_id] || { notInterested: new Set(), deepListen: new Set(), skipped: new Set(), hiddenArtists: new Set() };

        // Build taste profile from stream history
        const genreCounts   = {};
        const moodCounts    = {};
        const bpmSamples    = [];
        const artistStreams = {};
        const streamedIds   = new Set();

        streams.forEach(s => {
          if (s.track_id) streamedIds.add(s.track_id);
          const g = s.tracks?.genre, m = s.tracks?.mood, b = s.tracks?.bpm, a = s.tracks?.artist_id;
          if (g) genreCounts[g]   = (genreCounts[g]   || 0) + 1;
          if (m) moodCounts[m]    = (moodCounts[m]    || 0) + 1;
          if (b) bpmSamples.push(b);
          if (a) artistStreams[a] = (artistStreams[a]  || 0) + 1;
        });

        // Use behavior profile if richer than stream history
        const primaryGenre   = behavior.top_genre    || Object.entries(genreCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
        const secondGenre    = behavior.second_genre  || Object.entries(genreCounts).sort((a,b)=>b[1]-a[1])[1]?.[0] || null;
        const topMood        = behavior.top_mood      || Object.entries(moodCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]  || null;
        const topArtistId    = behavior.top_artist_id || Object.entries(artistStreams).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
        const avgBpm         = behavior.avg_bpm       || (bpmSamples.length ? bpmSamples.reduce((a,b)=>a+b,0)/bpmSamples.length : null);
        const behaviorTags   = new Set(behavior.behavior_tags || []);

        // Score every track
        const scored = allTracks.map(track => {
          if (liked.has(track.id)) return null;
          if (feedback.notInterested.has(track.id)) return null;
          if (feedback.hiddenArtists.has(track.artist_id)) return null;

          let score  = 0;
          let reason = 'recommended';

          if (isColdstart) {
            // Cold start: genre + trending only
            if (primaryGenre && (track.genre === primaryGenre || track.mood === primaryGenre)) {
              score += 60; reason = 'genre_match';
            } else {
              score += (track.engagement_score || 0) * 0.1; reason = 'trending';
            }
            // New release boost for cold start users — show them what's happening
            if (track.created_at >= hotRelCutoff) { score += 30; reason = 'new_release'; }
          } else {
            // ── AFFINITY SIGNALS ─────────────────────────────────────────
            const isFollowed = following.has(track.artist_id);
            if (isFollowed)                                          { score += 100; reason = 'from_following'; }
            if (track.artist_id === topArtistId)                     { score += 35;  if (reason === 'recommended') reason = 'top_artist'; }

            // Genre match
            if (primaryGenre && (track.genre === primaryGenre || track.mood === primaryGenre)) {
              score += 80; if (reason === 'recommended') reason = 'genre_match';
            } else if (secondGenre && (track.genre === secondGenre || track.mood === secondGenre)) {
              score += 60; if (reason === 'recommended') reason = 'genre_match';
            }

            // Mood match
            if (topMood && track.mood === topMood)                   { score += 50; if (reason === 'recommended') reason = 'mood_match'; }

            // BPM affinity (within ±10)
            if (avgBpm && track.bpm && Math.abs(track.bpm - avgBpm) <= 10) { score += 40; }

            // Collab featuring a followed artist
            const collabs = collabIndex[track.id];
            if (collabs) {
              for (const cArtist of collabs) {
                if (following.has(cArtist)) { score += 30; if (reason === 'recommended') reason = 'feat_following'; break; }
              }
            }

            // ── DISCOVERY SIGNALS ─────────────────────────────────────────
            if (track.created_at >= newRelCutoff) {
              score += isFollowed ? 45 : 35;
              if (reason === 'from_following') reason = 'new_release';
              else if (reason === 'recommended') reason = 'new_release';
            } else if (track.created_at >= hotRelCutoff) {
              score += isFollowed ? 30 : 20;
            }

            // Hidden gem
            const isHiddenGem = (track.stream_count || 0) <= hiddenGemThreshold && (track.engagement_score || 0) > 0;
            if (isHiddenGem)                                          { score += 25; if (reason === 'recommended') reason = 'hidden_gem'; }

            // Platform trending
            if ((track.engagement_score || 0) >= top20cutoff)         { score += 20; if (reason === 'recommended') reason = 'trending'; }
            if ((track.velocity_score || 0) >= 70)                    { score += 25; if (reason === 'recommended') reason = 'trending'; }
            else if ((track.velocity_score || 0) >= 40)               { score += 12; }

            // Serendipity: small random nudge to prevent filter bubble locking
            score += (Math.random() * 30) - 15;

            // ── BEHAVIOUR TAG BONUSES ─────────────────────────────────────
            if (behaviorTags.has('deep_listener') && (track.duration || 0) > 180) score += 20;
            if (behaviorTags.has('supporter')     && (track.like_count || 0) > 10) score += 15;
            if (behaviorTags.has('collector')     && track.is_downloadable)        score += 15;
            if (behaviorTags.has('competition_fan') && track.is_competition_entry) score += 10;
            if (behaviorTags.has('skip_heavy')    && (track.duration || 0) > 240)  score -= 10;

            // ── PENALTIES ─────────────────────────────────────────────────
            if (streamedIds.has(track.id)) score -= 60;
            if (recentIds.has(track.id))   score -= 30;
            if (feedback.deepListen.has(track.id)) score += 40;
            if (feedback.skipped.has(track.id))    score -= 40;
          }

          if (score <= 0) return null;
          return { track_id: track.id, artist_id: track.artist_id, score, reason, is_following: following.has(track.artist_id), is_new: track.created_at >= hotRelCutoff, is_gem: (track.stream_count || 0) <= hiddenGemThreshold };
        }).filter(Boolean);

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // ── DIVERSITY ENFORCEMENT ─────────────────────────────────────────
        const artistCounts   = {};
        const result         = [];
        const discoveryPool  = scored.filter(t => !t.is_following);
        const newRelPool     = scored.filter(t => t.is_new);
        const gemPool        = scored.filter(t => t.is_gem);

        const minDiscovery  = Math.floor(RECS_PER_USER * MIN_DISCOVERY);
        const minNewRel     = Math.floor(RECS_PER_USER * MIN_NEW_RELEASE);
        const minGems       = Math.floor(RECS_PER_USER * MIN_HIDDEN_GEM);

        const used = new Set();

        const addTrack = (item) => {
          if (used.has(item.track_id)) return false;
          const ac = artistCounts[item.artist_id] || 0;
          if (ac >= MAX_PER_ARTIST) return false;
          artistCounts[item.artist_id] = ac + 1;
          used.add(item.track_id);
          result.push(item);
          return true;
        };

        // Fill diversity slots first
        let dAdded = 0;
        for (const t of discoveryPool) { if (dAdded >= minDiscovery) break; if (addTrack(t)) dAdded++; }
        let nAdded = 0;
        for (const t of newRelPool)    { if (nAdded >= minNewRel) break;   if (addTrack(t)) nAdded++; }
        let gAdded = 0;
        for (const t of gemPool)       { if (gAdded >= minGems) break;    if (addTrack(t)) gAdded++; }

        // Fill remaining with highest scored
        for (const t of scored) {
          if (result.length >= RECS_PER_USER) break;
          addTrack(t);
        }

        // Shuffle slightly — don't serve in pure score order or it feels mechanical
        // Use a mild Fisher-Yates with bias toward higher scores
        for (let j = result.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * Math.min(j + 1, 8)); // only shuffle within top 8 window
          [result[j], result[k]] = [result[k], result[j]];
        }

        result.forEach((item, idx) => {
          upsertRows.push({
            user_id,
            track_id:    item.track_id,
            score:       Math.round(item.score * 10) / 10,
            reason:      item.reason,
            position:    idx,
            computed_at: new Date().toISOString(),
          });
        });
      }

      if (upsertRows.length > 0) {
        await supabase.from('listener_recommendations').delete().in('user_id', userIds);
        const { error: upsertErr } = await supabase.from('listener_recommendations').insert(upsertRows);
        if (upsertErr) console.error('[recs] upsert error:', upsertErr.message);
      }

      processed += batch.length;
      console.log(`[recs] ${processed}/${activeListeners.length} processed`);
    }

    console.log(`[recs] done — ${processed} users`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, processed }) };

  } catch (err) {
    console.error('[recs] error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};