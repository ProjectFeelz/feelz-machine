/**
 * compute-behavior-profiles.js
 *
 * Builds listener and artist behaviour profiles from raw activity data.
 * Runs before the engagement drip so Claude has rich context.
 * Also runs on its own schedule (daily at 03:00 UTC).
 *
 * Exported as a named function so engagement-drip-background can call it inline.
 *
 * Behaviour tags assigned:
 *
 * LISTENER
 *   night_owl          — majority of streams between 22:00-04:00
 *   morning_commuter   — majority of streams between 06:00-09:00
 *   weekend_binger     — 70%+ of streams on Fri-Sun
 *   sporadic           — no clear temporal pattern
 *   genre_loyal        — 80%+ of streams in one genre
 *   genre_hopper       — 4+ distinct genres in 30 days
 *   artist_obsessive   — 60%+ of streams from one artist
 *   deep_listener      — avg listen depth > 80%
 *   skip_heavy         — skip rate > 50%
 *   collector          — download rate > 0.05 (downloads many tracks)
 *   supporter          — like rate > 0.15 (actively likes)
 *   social             — follows 10+ artists
 *   loner              — follows 0-1 artists
 *   competition_fan    — streamed competition entries
 *   cooling            — streams down 50%+ week over week
 *   surging            — streams up 50%+ week over week
 *   just_arrived       — joined < 7 days ago
 *   churning           — no stream in 14-29 days
 *
 * ARTIST
 *   prolific           — 3+ tracks/month
 *   steady             — 1-2 tracks/month
 *   sporadic_uploader  — less than 1/month
 *   going_viral        — stream velocity > 100/day on latest track
 *   growing            — follower growth > 5 this week
 *   stalled            — 0 followers this week AND < 10 streams
 *   live_performer     — used live sessions in last 30 days
 *   collab_active      — pending or accepted collabs
 *   competition_entrant — entered a competition
 *   dormant            — no upload in 30+ days
 *   momentum           — uploaded in last 7 days AND streams up
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Tag derivation helpers ────────────────────────────────────────────────────

function deriveListenerTags({
  peakHour, peakDay, sessionType,
  avgListenPct, skipRate, repeatRate,
  likeRate, downloadRate,
  genreLoyalty, artistLoyalty,
  totalStreams30d, totalStreams7d, totalStreams14dPrev,
  totalDownloads, totalFollows,
  daysSinceLast, joinedDaysAgo,
  competitionStreams,
}) {
  const tags = [];

  // Temporal
  if (sessionType) tags.push(sessionType);

  // Listening depth
  if (avgListenPct > 80)  tags.push('deep_listener');
  if (skipRate     > 50)  tags.push('skip_heavy');

  // Genre/artist loyalty
  if (genreLoyalty  >= 80) tags.push('genre_loyal');
  if (genreLoyalty  <= 30 && totalStreams30d >= 10) tags.push('genre_hopper');
  if (artistLoyalty >= 60) tags.push('artist_obsessive');

  // Engagement quality
  if (downloadRate > 0.05)  tags.push('collector');
  if (likeRate     > 0.15)  tags.push('supporter');

  // Social
  if (totalFollows >= 10) tags.push('social');
  if (totalFollows <= 1)  tags.push('loner');

  // Trajectory
  if (totalStreams30d > 0 && totalStreams14dPrev > 0) {
    const recentRate = totalStreams7d * 2;            // annualise to 14d
    const change     = (recentRate - totalStreams14dPrev) / Math.max(totalStreams14dPrev, 1);
    if (change >= 0.5)  tags.push('surging');
    if (change <= -0.5) tags.push('cooling');
  }

  // Competition
  if (competitionStreams > 0) tags.push('competition_fan');

  // Lifecycle
  if (joinedDaysAgo  < 7)  tags.push('just_arrived');
  if (daysSinceLast >= 14 && daysSinceLast < 30) tags.push('churning');

  return [...new Set(tags)];
}

function deriveArtistTags({
  uploadFrequency, daysSinceUpload,
  streamVelocity, followerGrowth7d, streams7d, streams30d,
  usesLiveSessions, collabActivity,
  competitionEntries, daysSinceJoined,
}) {
  const tags = [];

  // Upload cadence
  if (uploadFrequency >= 3)                 tags.push('prolific');
  else if (uploadFrequency >= 1)            tags.push('steady');
  else if (daysSinceUpload > 30)            tags.push('dormant');
  else                                      tags.push('sporadic_uploader');

  // Momentum
  if (daysSinceUpload <= 7 && streams7d > 0) tags.push('momentum');

  // Growth
  if (streamVelocity   > 100)              tags.push('going_viral');
  if (followerGrowth7d >= 5)               tags.push('growing');
  if (followerGrowth7d === 0 && streams7d < 10) tags.push('stalled');

  // Platform use
  if (usesLiveSessions)                    tags.push('live_performer');
  if (collabActivity === 'active')         tags.push('collab_active');
  if (competitionEntries > 0)              tags.push('competition_entrant');

  return [...new Set(tags)];
}

// ── Session type from hourly distribution ─────────────────────────────────────
function classifySessionType(hourCounts) {
  if (!hourCounts || Object.keys(hourCounts).length === 0) return 'sporadic';
  const total = Object.values(hourCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return 'sporadic';

  const nightPct   = [22,23,0,1,2,3,4].reduce((s,h)   => s + (hourCounts[h] || 0), 0) / total;
  const morningPct = [6,7,8,9].reduce((s,h)            => s + (hourCounts[h] || 0), 0) / total;
  const weekendIdx = Object.entries(hourCounts).reduce((best, [h, c]) => {
    // This needs day info — fall back to sporadic if we don't have it
    return best;
  }, null);

  if (nightPct   >= 0.45) return 'night_owl';
  if (morningPct >= 0.35) return 'morning_commuter';
  return 'sporadic';
}

function classifySessionTypeWithDays(dayCounts, hourCounts) {
  const total = Object.values(hourCounts || {}).reduce((a, b) => a + b, 0);
  if (total === 0) return 'sporadic';

  const nightPct   = [22,23,0,1,2,3,4].reduce((s,h)  => s + (hourCounts[h] || 0), 0) / total;
  const morningPct = [6,7,8,9].reduce((s,h)           => s + (hourCounts[h] || 0), 0) / total;

  const dayTotal   = Object.values(dayCounts || {}).reduce((a, b) => a + b, 0);
  const weekendPct = dayTotal > 0
    ? ([5,6,0].reduce((s, d) => s + (dayCounts[d] || 0), 0)) / dayTotal
    : 0;

  if (nightPct   >= 0.45) return 'night_owl';
  if (morningPct >= 0.35) return 'morning_commuter';
  if (weekendPct >= 0.7)  return 'weekend_binger';
  return 'sporadic';
}

// ── Build human-readable summary for Claude ───────────────────────────────────
function buildListenerSummary(profile) {
  const parts = [];

  if (profile.session_type && profile.session_type !== 'sporadic') {
    const labels = {
      night_owl:         'streams mostly late at night',
      morning_commuter:  'streams in the morning',
      weekend_binger:    'binge-listens on weekends',
    };
    parts.push(labels[profile.session_type] || profile.session_type);
  }

  if (profile.avg_listen_pct >= 80) parts.push('finishes almost every track they start');
  else if (profile.skip_rate >= 50) parts.push('skips heavily — hard to hold attention past the hook');

  if (profile.genre_loyalty >= 80 && profile.top_genres?.[0]) {
    parts.push(`deeply loyal to ${profile.top_genres[0]}`);
  } else if (profile.top_genres?.length >= 3) {
    parts.push(`broad taste: ${profile.top_genres.slice(0,3).join(', ')}`);
  }

  if (profile.tags?.includes('artist_obsessive') && profile.followed_artists?.[0]) {
    parts.push(`fixated on ${profile.followed_artists[0]}`);
  }

  if (profile.tags?.includes('collector'))  parts.push('downloads tracks — actively supports artists');
  if (profile.tags?.includes('supporter'))  parts.push('likes tracks often');
  if (profile.tags?.includes('surging'))    parts.push('listening more than ever this week');
  if (profile.tags?.includes('cooling'))    parts.push('listening less than usual — starting to drift');
  if (profile.tags?.includes('churning'))   parts.push('gone quiet — last listened 2+ weeks ago');
  if (profile.tags?.includes('competition_fan')) parts.push('engages with competition tracks');
  if (profile.tags?.includes('social'))     parts.push(`follows ${profile.total_follows} artists`);
  if (profile.tags?.includes('loner'))      parts.push('hasn\'t followed many artists yet');

  const activityLine = profile.total_streams_7d > 0
    ? `${profile.total_streams_7d} streams this week`
    : profile.total_streams_30d > 0
    ? `${profile.total_streams_30d} streams last month, none this week`
    : 'no recent activity';

  parts.push(activityLine);

  return parts.join('. ') + '.';
}

function buildArtistSummary(profile) {
  const parts = [];

  if (profile.tags?.includes('prolific'))          parts.push('uploads frequently');
  else if (profile.tags?.includes('steady'))       parts.push('uploads regularly');
  else if (profile.tags?.includes('dormant'))      parts.push(`hasn't uploaded in ${profile.days_since_upload} days`);
  else if (profile.tags?.includes('momentum'))     parts.push('just dropped something and it\'s gaining traction');

  if (profile.tags?.includes('going_viral'))       parts.push(`latest track getting ${Math.round(profile.stream_velocity)} streams/day`);
  if (profile.tags?.includes('growing'))           parts.push(`gaining ${profile.follower_growth_7d} followers this week`);
  if (profile.tags?.includes('stalled'))           parts.push('growth has stalled — no followers or streams this week');
  if (profile.tags?.includes('live_performer'))    parts.push('goes live regularly');
  if (profile.tags?.includes('collab_active'))     parts.push('active in collaborations');
  if (profile.tags?.includes('competition_entrant')) parts.push('enters competitions');

  parts.push(`${profile.streams_7d || 0} streams this week, ${profile.streams_30d || 0} this month`);

  return parts.join('. ') + '.';
}

// ── Compute ONE listener profile ──────────────────────────────────────────────
async function computeListenerProfile(userId) {
  const now    = new Date();
  const d30    = new Date(now - 30 * 86400000).toISOString();
  const d14    = new Date(now - 14 * 86400000).toISOString();
  const d7     = new Date(now -  7 * 86400000).toISOString();
  const d60    = new Date(now - 60 * 86400000).toISOString();

  const [
    { data: streams30 },
    { data: streams7 },
    { data: streams14to28 },
    { data: likes },
    { data: downloads },
    { data: follows },
    { data: listener },
    { data: competitionStreams },
    { data: listeningEvents },
  ] = await Promise.all([
    supabase.from('streams')
      .select('track_id, created_at, duration_played, tracks(genre, mood, is_beat, bpm, artist_id, artists(artist_name))')
      .eq('user_id', userId)
      .gte('created_at', d30)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('streams')
      .select('track_id, created_at')
      .eq('user_id', userId)
      .gte('created_at', d7),
    supabase.from('streams')
      .select('track_id, created_at')
      .eq('user_id', userId)
      .gte('created_at', d14)
      .lt('created_at', d7),
    supabase.from('track_likes')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', d60),
    supabase.from('downloads')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', d60),
    supabase.from('follows')
      .select('artist_id, artists(artist_name)')
      .eq('follower_id', userId)
      .limit(20),
    supabase.from('listeners')
      .select('created_at, display_name')
      .eq('user_id', userId)
      .maybeSingle(),
    // Check if any of their streams were competition tracks
    supabase.from('streams')
      .select('track_id, competition_entries!inner(id)')
      .eq('user_id', userId)
      .gte('created_at', d30)
      .limit(5),
    // Real completion data. This is the only source of it: streams
    // carries a constant ~30s duration_played by construction, so it can
    // never tell us how far anyone actually got.
    supabase.from('listening_events')
      .select('track_id, artist_id, genre, mood, bpm, completion_pct, listened_seconds, end_reason')
      .eq('user_id', userId)
      .gte('created_at', d30)
      .order('created_at', { ascending: false })
      .limit(300),
  ]);

  const allStreams = streams30 || [];
  if (allStreams.length === 0 && (follows?.length || 0) === 0) return null; // skip empty profiles

  // Temporal analysis
  const hourCounts = {};
  const dayCounts  = {};
  for (const s of allStreams) {
    const d = new Date(s.created_at);
    const h = d.getHours();
    const day = d.getDay();
    hourCounts[h]   = (hourCounts[h]   || 0) + 1;
    dayCounts[day]  = (dayCounts[day]  || 0) + 1;
  }
  const peakHour    = Object.entries(hourCounts).sort((a,b) => b[1]-a[1])[0]?.[0] ?? null;
  const peakDay     = Object.entries(dayCounts).sort((a,b) => b[1]-a[1])[0]?.[0]  ?? null;
  const sessionType = classifySessionTypeWithDays(dayCounts, hourCounts);

  // Genre loyalty
  const genreCounts  = {};
  const moodCounts   = {};
  const artistCounts = {};
  let totalWithMeta  = 0;

  for (const s of allStreams) {
    const g = s.tracks?.genre;
    const m = s.tracks?.mood;
    const a = s.tracks?.artists?.artist_name;
    if (g) { genreCounts[g] = (genreCounts[g] || 0) + 1; totalWithMeta++; }
    if (m) moodCounts[m]  = (moodCounts[m]  || 0) + 1;
    if (a) artistCounts[a] = (artistCounts[a] || 0) + 1;
  }

  const topGenres  = Object.entries(genreCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([g]) => g);
  const topMoods   = Object.entries(moodCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([m]) => m);
  const topArtist  = Object.entries(artistCounts).sort((a,b) => b[1]-a[1])[0];

  const genreTotal   = Object.values(genreCounts).reduce((s,n) => s+n, 0);
  const topGenreCount = Object.values(genreCounts).sort((a,b) => b-a)[0] || 0;
  const genreLoyalty  = genreTotal > 0 ? (topGenreCount / genreTotal) * 100 : 0;
  const artistLoyalty = allStreams.length > 0
    ? ((topArtist?.[1] || 0) / allStreams.length) * 100 : 0;

  // Repeat rate — how many track_ids appear more than once
  const trackFreq = {};
  allStreams.forEach(s => { if (s.track_id) trackFreq[s.track_id] = (trackFreq[s.track_id]||0)+1; });
  const repeatStreams = Object.values(trackFreq).filter(n => n > 1).reduce((s,n) => s + n - 1, 0);
  const repeatRate = allStreams.length > 0 ? (repeatStreams / allStreams.length) * 100 : 0;

  // ── Completion, from listening_events ───────────────────────────────────
  // The old skip rate here counted streams with duration_played < 30. That
  // column is always about 30 by construction, because PlayerContext writes
  // one stream row at the 30 second mark using the playhead at that instant.
  // So the comparison was never true and skip_rate was always 0, which also
  // meant the skip_heavy tag could never fire.
  //
  // listening_events carries the real playhead. Until it has data this
  // falls back to null rather than to the old broken number, so a profile
  // says "unknown" instead of confidently saying "never skips".
  const events = listeningEvents || [];
  const eventsWithPct = events.filter(e => e.completion_pct !== null && e.completion_pct !== undefined);

  // Below 10 percent is an abandon. Steve's rule: a fast skip is mostly
  // noise about today's mood, so it counts here for the profile summary
  // but is deliberately NOT used as a negative taste signal anywhere.
  const abandons = eventsWithPct.filter(e => e.completion_pct < 10).length;
  const skipRate = eventsWithPct.length >= 5
    ? (abandons / eventsWithPct.length) * 100
    : 0;

  const avgCompletionPct = eventsWithPct.length >= 5
    ? eventsWithPct.reduce((s, e) => s + Number(e.completion_pct), 0) / eventsWithPct.length
    : null;

  // ── BPM affinity ────────────────────────────────────────────────────────
  // Weighted toward tracks actually finished. Someone who abandons every
  // fast track should not read as a fast-track listener just because those
  // tracks were served to them.
  const bpmSamples = [];
  eventsWithPct.forEach(e => {
    if (!e.bpm) return;
    const weight = e.completion_pct >= 80 ? 3 : e.completion_pct >= 40 ? 1 : 0;
    for (let i = 0; i < weight; i++) bpmSamples.push(e.bpm);
  });
  // Fall back to plain stream history when there are no events yet.
  if (bpmSamples.length === 0) {
    allStreams.forEach(s => { if (s.tracks?.bpm) bpmSamples.push(s.tracks.bpm); });
  }
  const avgBpm = bpmSamples.length > 0
    ? Math.round(bpmSamples.reduce((a, b) => a + b, 0) / bpmSamples.length)
    : null;

  // ── Top artist ──────────────────────────────────────────────────────────
  // Prefer completed listens, fall back to raw stream counts.
  const artistPlayCounts = {};
  eventsWithPct.forEach(e => {
    if (!e.artist_id || e.completion_pct < 40) return;
    artistPlayCounts[e.artist_id] = (artistPlayCounts[e.artist_id] || 0) + 1;
  });
  if (Object.keys(artistPlayCounts).length === 0) {
    allStreams.forEach(s => {
      const a = s.tracks?.artist_id;
      if (a) artistPlayCounts[a] = (artistPlayCounts[a] || 0) + 1;
    });
  }
  const topArtistId = Object.entries(artistPlayCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Engagement rates
  const streamBase = Math.max(allStreams.length, 1);
  const likeRate     = (likes?.length || 0) / streamBase;
  const downloadRate = (downloads?.length || 0) / streamBase;

  // Recency
  const lastStreamDate = allStreams[0]?.created_at
    ? new Date(allStreams[0].created_at) : null;
  const daysSinceLast  = lastStreamDate
    ? Math.floor((now - lastStreamDate) / 86400000) : 999;

  const joinedAt   = listener?.created_at ? new Date(listener.created_at) : now;
  const joinedDaysAgo = Math.floor((now - joinedAt) / 86400000);

  // Follow data
  const followedArtists = (follows || [])
    .map(f => f.artists?.artist_name)
    .filter(Boolean)
    .slice(0, 5);

  // Tags
  const tags = deriveListenerTags({
    peakHour:         parseInt(peakHour),
    sessionType,
    avgListenPct:     0, // not tracked per stream currently
    skipRate,
    repeatRate,
    likeRate,
    downloadRate,
    genreLoyalty,
    artistLoyalty,
    totalStreams30d:   allStreams.length,
    totalStreams7d:    (streams7 || []).length,
    totalStreams14dPrev: (streams14to28 || []).length,
    totalDownloads:   downloads?.length || 0,
    totalFollows:     follows?.length || 0,
    daysSinceLast,
    joinedDaysAgo,
    competitionStreams: (competitionStreams || []).length,
  });

  const profile = {
    user_id:           userId,
    peak_hour:         peakHour !== null ? parseInt(peakHour) : null,
    peak_day:          peakDay  !== null ? parseInt(peakDay)  : null,
    session_type:      sessionType,
    avg_listen_pct:    null, // requires per-track duration data
    skip_rate:         parseFloat(skipRate.toFixed(2)),
    avg_completion_pct: avgCompletionPct !== null ? parseFloat(avgCompletionPct.toFixed(2)) : null,
    events_sampled:     eventsWithPct.length,
    avg_bpm:            avgBpm,
    top_artist_id:      topArtistId,
    repeat_rate:       parseFloat(repeatRate.toFixed(2)),
    like_rate:         parseFloat(likeRate.toFixed(4)),
    download_rate:     parseFloat(downloadRate.toFixed(4)),
    genre_loyalty:     parseFloat(genreLoyalty.toFixed(2)),
    artist_loyalty:    parseFloat(artistLoyalty.toFixed(2)),
    top_genres:        topGenres,
    top_moods:         topMoods,
    followed_artists:  followedArtists,
    total_streams_30d: allStreams.length,
    total_streams_7d:  (streams7 || []).length,
    total_downloads:   downloads?.length || 0,
    total_likes:       likes?.length || 0,
    total_follows:     follows?.length || 0,
    days_since_last:   daysSinceLast === 999 ? null : daysSinceLast,
    tags,
    computed_at:       now.toISOString(),
  };

  profile.behavior_summary = buildListenerSummary(profile);

  return profile;
}

// ── Compute ONE artist profile ────────────────────────────────────────────────
async function computeArtistProfile(artist) {
  const now   = new Date();
  const d7    = new Date(now -  7 * 86400000).toISOString();
  const d30   = new Date(now - 30 * 86400000).toISOString();
  const d90   = new Date(now - 90 * 86400000).toISOString();

  const [
    { data: tracks },
    { data: recentSessions },
    { count: pendingCollabs },
    { count: acceptedCollabs },
    { count: compEntries },
    { count: followers7d },
    { count: followers30d },
  ] = await Promise.all([
    supabase.from('tracks')
      .select('id, created_at, stream_count')
      .eq('artist_id', artist.id)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('listening_sessions')
      .select('id')
      .eq('artist_id', artist.id)
      .gte('created_at', d30),
    supabase.from('collab_requests')
      .select('*', { count: 'exact', head: true })
      .eq('to_artist_id', artist.id)
      .eq('status', 'pending'),
    supabase.from('collab_requests')
      .select('*', { count: 'exact', head: true })
      .or(`from_artist_id.eq.${artist.id},to_artist_id.eq.${artist.id}`)
      .eq('status', 'accepted'),
    supabase.from('competition_entries')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id),
    supabase.from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id)
      .gte('created_at', d7),
    supabase.from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artist.id)
      .gte('created_at', d30),
  ]);

  const tracksArr   = tracks || [];
  const latestTrack = tracksArr[0];

  // Upload frequency (tracks per month over 90 days)
  const tracks90d = tracksArr.filter(t => new Date(t.created_at) >= new Date(d90)).length;
  const uploadFrequency = parseFloat((tracks90d / 3).toFixed(2)); // per month

  const daysSinceUpload = latestTrack
    ? Math.floor((now - new Date(latestTrack.created_at)) / 86400000)
    : 999;

  // Stream counts from track data
  const streams7d  = latestTrack?.stream_count
    ? Math.min(latestTrack.stream_count, 9999) // best estimate
    : 0;
  const streams30d = tracksArr.slice(0,5).reduce((s,t) => s + (t.stream_count||0), 0);

  // Stream velocity on latest track (streams per day since published)
  const trackAgeDays = latestTrack
    ? Math.max(1, Math.floor((now - new Date(latestTrack.created_at)) / 86400000))
    : 1;
  const streamVelocity = latestTrack
    ? parseFloat(((latestTrack.stream_count || 0) / trackAgeDays).toFixed(2))
    : 0;

  const uploadConsistency =
    uploadFrequency >= 3    ? 'prolific'  :
    uploadFrequency >= 1    ? 'steady'    :
    daysSinceUpload > 30    ? 'inactive'  : 'sporadic';

  const collabActivity =
    (pendingCollabs || 0) > 0 || (acceptedCollabs || 0) > 0
      ? 'active' : 'none';

  const tags = deriveArtistTags({
    uploadFrequency,
    daysSinceUpload,
    streamVelocity,
    followerGrowth7d:  followers7d  || 0,
    streams7d,
    streams30d,
    usesLiveSessions:  (recentSessions || []).length > 0,
    collabActivity,
    competitionEntries: compEntries || 0,
  });

  const profile = {
    artist_id:          artist.id,
    user_id:            artist.user_id,
    upload_frequency:   uploadFrequency,
    upload_consistency: uploadConsistency,
    days_since_upload:  daysSinceUpload === 999 ? null : daysSinceUpload,
    stream_velocity:    streamVelocity,
    collab_activity:    collabActivity,
    uses_live_sessions: (recentSessions || []).length > 0,
    competition_entries: compEntries || 0,
    follower_growth_7d:  followers7d  || 0,
    follower_growth_30d: followers30d || 0,
    streams_7d:          streams7d,
    streams_30d:         streams30d,
    tags,
    computed_at:         now.toISOString(),
  };

  profile.behavior_summary = buildArtistSummary(profile);

  return profile;
}

// ── Main export — compute profiles for all active users ──────────────────────
async function computeAllProfiles() {
  const [
    { data: listeners },
    { data: artists },
  ] = await Promise.all([
    supabase.from('listeners').select('user_id').not('user_id', 'is', null),
    supabase.from('artists').select('id, user_id, artist_name').not('user_id', 'is', null),
  ]);

  let listenerCount = 0;
  let artistCount   = 0;
  const errors      = [];

  // Process listeners in batches of 10
  const BATCH = 10;
  for (let i = 0; i < (listeners || []).length; i += BATCH) {
    const batch = listeners.slice(i, i + BATCH);
    const profiles = await Promise.all(batch.map(l => computeListenerProfile(l.user_id).catch(e => {
      errors.push({ user: l.user_id, err: e.message }); return null;
    })));
    const valid = profiles.filter(Boolean);
    if (valid.length > 0) {
      const { error } = await supabase
        .from('listener_behavior_profiles')
        .upsert(valid, { onConflict: 'user_id' });
      if (error) console.error('Listener upsert error:', error.message);
      else listenerCount += valid.length;
    }
  }

  // Process artists in batches of 10
  for (let i = 0; i < (artists || []).length; i += BATCH) {
    const batch = artists.slice(i, i + BATCH);
    const profiles = await Promise.all(batch.map(a => computeArtistProfile(a).catch(e => {
      errors.push({ artist: a.id, err: e.message }); return null;
    })));
    const valid = profiles.filter(Boolean);
    if (valid.length > 0) {
      const { error } = await supabase
        .from('artist_behavior_profiles')
        .upsert(valid, { onConflict: 'artist_id' });
      if (error) console.error('Artist upsert error:', error.message);
      else artistCount += valid.length;
    }
  }

  return { listenerCount, artistCount, errors: errors.length };
}

// ── Netlify handler ───────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (event.httpMethod === 'POST') {
    const secret = event.headers['x-internal-secret'];
    if (!secret || secret !== process.env.INTERNAL_FUNCTION_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }
  try {
    const result = await computeAllProfiles();
    return { statusCode: 200, body: JSON.stringify({ success: true, ...result }) };
  } catch (err) {
    console.error('compute-behavior-profiles error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// Named export for inline use from engagement drip
exports.computeAllProfiles      = computeAllProfiles;
exports.computeListenerProfile  = computeListenerProfile;
exports.computeArtistProfile    = computeArtistProfile;