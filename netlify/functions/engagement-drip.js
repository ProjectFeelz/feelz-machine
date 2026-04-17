/**
 * netlify/functions/engagement-drip.js  (v2 — individual-level AI)
 *
 * Scheduled: Monday and Thursday at 10:00 AM UTC
 * Can be manually triggered via POST.
 *
 * v2 changes from v1:
 * - Per-user Claude calls for active/dormant listeners (uses their real play history)
 * - Competition context shifts message tone when a competition is live
 * - Streak awareness — messages reference or encourage streak behaviour
 * - Artist engagement includes their collab activity and recent upload stats
 * - Segment-level Claude call kept for new users (no history yet)
 * - Weekly cap (2/week) still enforced
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_PER_WEEK  = 2;
const BATCH_SIZE    = 50;

// ── Claude: single personalised message ──────────────────────
async function generateSingleMessage(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: `You are the voice of Feelz Machine — an independent music platform. Direct, authentic, energetic. Never corporate. Write ONE in-app notification. Return ONLY valid JSON: {"title":"...","body":"..."}. Title max 60 chars. Body max 120 chars.`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { return null; }
}

// ── Claude: segment-level 3-variant messages (new users) ─────
async function generateSegmentMessages(ctx) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are the voice of Feelz Machine. Write short in-app notification copy. Return ONLY a JSON array of 3 variants: [{"title":"...","body":"..."},...]`,
      messages: [{ role: 'user', content: `Segment: ${ctx.segment}\nDescription: ${ctx.description}\nPlatform: ${ctx.platformContext}\nTone: ${ctx.tone}` }],
    }),
  });
  const data = await response.json();
  const text = data.content?.[0]?.text || '[]';
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { return null; }
}

// ── Platform context ──────────────────────────────────────────
async function getPlatformContext() {
  const [
    { count: totalArtists },
    { data: competitions },
    { data: recentTracks },
    { count: newThisWeek },
  ] = await Promise.all([
    supabase.from('artists').select('*', { count: 'exact', head: true }),
    supabase.from('competitions')
      .select('id, title, status, entries_close_at')
      .in('status', ['upcoming', 'open', 'voting'])
      .order('entries_close_at', { ascending: true })
      .limit(3),
    supabase.from('tracks')
      .select('title, artists(artist_name)')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('tracks')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true)
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  const competitionSummary = competitions?.length
    ? competitions.map(c => {
        const daysLeft = c.entries_close_at
          ? Math.max(0, Math.ceil((new Date(c.entries_close_at) - new Date()) / 86400000))
          : null;
        return `"${c.title}" (${c.status}${daysLeft !== null ? `, ${daysLeft}d left` : ''})`;
      }).join(' | ')
    : null;

  return {
    raw: competitions || [],
    hasActiveCompetition: (competitions?.length || 0) > 0,
    competitionSummary,
    totalArtists: totalArtists || 0,
    newTracksThisWeek: newThisWeek || 0,
    recentDrops: (recentTracks || []).map(t => `"${t.title}" by ${t.artists?.artist_name}`).join(', '),
  };
}

// ── Individual listener context ───────────────────────────────
async function getListenerContext(userId) {
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const weekAgo  = new Date(Date.now() -  7 * 86400000).toISOString();

  const [
    { data: recentStreams },
    { data: streakRow },
    { data: follows },
  ] = await Promise.all([
    supabase.from('streams')
      .select('track_id, created_at, tracks(genre, artists(artist_name))')
      .eq('user_id', userId)
      .gte('created_at', monthAgo)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('user_streaks')
      .select('current_streak, longest_streak')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('follows')
      .select('artist_id')
      .eq('follower_id', userId)
      .limit(10),
  ]);

  const genreCounts = {};
  const artistNames = new Set();
  let streamsThisWeek = 0;

  for (const s of (recentStreams || [])) {
    const g = s.tracks?.genre;
    const a = s.tracks?.artists?.artist_name;
    if (g) genreCounts[g] = (genreCounts[g] || 0) + 1;
    if (a) artistNames.add(a);
    if (s.created_at >= weekAgo) streamsThisWeek++;
  }

  const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    streamsLastMonth: (recentStreams || []).length,
    streamsThisWeek,
    topGenre:         topGenre || null,
    recentArtists:    [...artistNames].slice(0, 3).join(', ') || null,
    followCount:      (follows || []).length,
    currentStreak:    streakRow?.current_streak || 0,
  };
}

// ── Individual artist context ─────────────────────────────────
async function getArtistContext(artistId) {
  const weekAgo  = new Date(Date.now() -  7 * 86400000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [
    { count: tracksThisMonth },
    { count: newFollowers },
    { count: pendingCollabs },
  ] = await Promise.all([
    supabase.from('tracks')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .gte('created_at', monthAgo),
    supabase.from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .gte('created_at', weekAgo),
    supabase.from('collab_requests')
      .select('*', { count: 'exact', head: true })
      .eq('to_artist_id', artistId)
      .eq('status', 'pending'),
  ]);

  return {
    tracksThisMonth:  tracksThisMonth  || 0,
    newFollowersWeek: newFollowers     || 0,
    pendingCollabs:   pendingCollabs   || 0,
  };
}

// ── Build listener prompt ─────────────────────────────────────
function buildListenerPrompt(segment, ctx, platform) {
  const streakNote = ctx.currentStreak >= 3
    ? `They have a ${ctx.currentStreak}-day streak going — acknowledge it.`
    : ctx.currentStreak === 0 ? 'No streak — could be a nudge to come back.' : '';

  const competitionNote = platform.hasActiveCompetition
    ? `Active competition(s): ${platform.competitionSummary}. Weave this in if it fits naturally.`
    : '';

  const historyNote = ctx.streamsLastMonth > 0
    ? `Last 30 days: ${ctx.streamsLastMonth} streams. Top genre: ${ctx.topGenre || 'mixed'}. Artists they've played: ${ctx.recentArtists || 'various'}.`
    : 'No recent streams — gone quiet.';

  const dormantNote = segment === 'dormant_listener'
    ? 'They drifted. No guilt — just drop something they\'d actually want to see.' : '';

  return `Write ONE personalised in-app notification for a ${segment.replace(/_/g, ' ')}.

LISTENING HISTORY: ${historyNote}
STREAK: ${streakNote || 'No notable streak.'}
FOLLOWS: ${ctx.followCount} artists followed
${competitionNote}
${dormantNote}
PLATFORM: ${platform.recentDrops ? `Fresh drops — ${platform.recentDrops}.` : ''} ${platform.newTracksThisWeek} new tracks this week.

Reference their genre or recent artists if you have them. Warm and direct.`;
}

// ── Build artist prompt ───────────────────────────────────────
function buildArtistPrompt(segment, artist, ctx, platform) {
  const competitionNote = platform.hasActiveCompetition
    ? `Active competition(s): ${platform.competitionSummary}. Nudge them toward entering or voting if relevant.`
    : '';

  const activityParts = [
    ctx.tracksThisMonth  > 0 && `${ctx.tracksThisMonth} track(s) uploaded this month`,
    ctx.newFollowersWeek > 0 && `${ctx.newFollowersWeek} new follower(s) this week`,
    ctx.pendingCollabs   > 0 && `${ctx.pendingCollabs} pending collab request(s)`,
  ].filter(Boolean);

  const activityNote = activityParts.length ? activityParts.join(', ') : 'quiet lately';
  const dormantNote  = segment === 'dormant_artist'
    ? 'They\'ve been MIA. Real re-engagement only — no guilt.' : '';

  return `Write ONE in-app notification for ${artist.artist_name || 'an artist'} (${segment.replace(/_/g, ' ')}).

THEIR ACTIVITY: ${activityNote}
GENRE: ${artist.genre || 'not set'}
${competitionNote}
${dormantNote}
PLATFORM: ${platform.totalArtists} artists, ${platform.newTracksThisWeek} new tracks this week.

Peer energy. Community-first. Make them feel part of something.`;
}

// ── Weekly cap helper ─────────────────────────────────────────
async function getWeeklyMessageCounts(userIds) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data } = await supabase
    .from('engagement_messages')
    .select('user_id')
    .in('user_id', userIds)
    .gte('sent_at', weekAgo);
  const counts = {};
  (data || []).forEach(r => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
  return counts;
}

// ── Segment users ─────────────────────────────────────────────
async function segmentUsers() {
  const now = new Date();
  const { data: configRows } = await supabase.from('engagement_config').select('key, value');
  const config = Object.fromEntries((configRows || []).map(r => [r.key, r.value]));

  const dormantDays = parseInt(config.dormant_threshold_days  ?? '5',  10);
  const churnedDays = parseInt(config.churned_threshold_days  ?? '30', 10);
  const newDays     = parseInt(config.new_user_threshold_days ?? '14', 10);

  const dT = new Date(now - dormantDays * 86400000).toISOString();
  const cT = new Date(now - churnedDays * 86400000).toISOString();
  const nT = new Date(now - newDays     * 86400000).toISOString();

  const [{ data: artists }, { data: listeners }] = await Promise.all([
    supabase.from('artists').select('id, user_id, artist_name, genre, tier, follower_count, last_seen_at, created_at').not('user_id', 'is', null),
    supabase.from('listeners').select('id, user_id, last_seen_at, created_at').not('user_id', 'is', null),
  ]);

  const segs = { new_artist: [], active_artist: [], dormant_artist: [], new_listener: [], active_listener: [], dormant_listener: [] };

  for (const a of artists || []) {
    const ls = a.last_seen_at ? new Date(a.last_seen_at) : new Date(a.created_at);
    if (new Date(a.created_at) > new Date(nT)) segs.new_artist.push(a);
    else if (ls > new Date(dT))                segs.active_artist.push(a);
    else if (ls > new Date(cT))                segs.dormant_artist.push(a);
  }
  for (const l of listeners || []) {
    const ls = l.last_seen_at ? new Date(l.last_seen_at) : new Date(l.created_at);
    if (new Date(l.created_at) > new Date(nT)) segs.new_listener.push(l);
    else if (ls > new Date(dT))                segs.active_listener.push(l);
    else if (ls > new Date(cT))                segs.dormant_listener.push(l);
  }

  return segs;
}

// ── Process individuals (personalised per-user Claude call) ───
async function processIndividuals(users, segmentKey, platform, isArtist) {
  if (!users.length) return 0;
  const userIds = users.map(u => u.user_id).filter(Boolean);
  const weeklyCounts = await getWeeklyMessageCounts(userIds);
  const eligible = users.filter(u => (weeklyCounts[u.user_id] || 0) < MAX_PER_WEEK);
  if (!eligible.length) return 0;

  let sent = 0;
  for (const user of eligible) {
    try {
      let prompt;
      if (isArtist) {
        const ctx = await getArtistContext(user.id);
        prompt = buildArtistPrompt(segmentKey, user, ctx, platform);
      } else {
        const ctx = await getListenerContext(user.user_id);
        prompt = buildListenerPrompt(segmentKey, ctx, platform);
      }

      const msg = await generateSingleMessage(prompt);
      if (!msg?.title) continue;

      await Promise.all([
        supabase.from('notifications').insert({
          user_id:   user.user_id,
          artist_id: isArtist ? user.id : null,
          type:      'engagement',
          title:     msg.title,
          message:   msg.body,
          metadata:  { segment: segmentKey, message_type: `drip_${segmentKey}`, ai_generated: true, personalised: true },
        }),
        supabase.from('engagement_messages').insert({
          user_id:      user.user_id,
          artist_id:    isArtist ? user.id : null,
          segment:      segmentKey,
          message_type: `drip_${segmentKey}`,
          title:        msg.title,
          body:         msg.body,
        }),
      ]);

      sent++;
      await new Promise(r => setTimeout(r, 300)); // rate limit
    } catch (err) {
      console.error(`Error for ${user.user_id}:`, err.message);
    }
  }
  return sent;
}

// ── Process new users (segment-level, one Claude call) ────────
async function processNewUsers(users, segmentKey, platform) {
  if (!users.length) return 0;

  const NEW_CTX = {
    new_artist:   { segment: 'New Artist',   description: 'Just joined. May not have uploaded yet.',   tone: 'Welcoming, exciting' },
    new_listener: { segment: 'New Listener', description: 'Just signed up. Needs to discover artists.', tone: 'Inviting, like a friend recommending something' },
  };

  const ctx = {
    ...NEW_CTX[segmentKey],
    platformContext: [
      `${platform.totalArtists} artists on the platform`,
      platform.hasActiveCompetition && `Competition live: ${platform.competitionSummary}`,
      platform.recentDrops && `Fresh drops: ${platform.recentDrops}`,
    ].filter(Boolean).join('. '),
  };

  const messages = await generateSegmentMessages(ctx);
  if (!messages?.length) return 0;

  const userIds = users.map(u => u.user_id).filter(Boolean);
  const weeklyCounts = await getWeeklyMessageCounts(userIds);
  const eligible = users.filter(u => (weeklyCounts[u.user_id] || 0) < MAX_PER_WEEK);
  if (!eligible.length) return 0;

  const chosen = messages[new Date().getDay() % messages.length];

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    await supabase.from('notifications').insert(batch.map(u => ({
      user_id: u.user_id, artist_id: u.id || null, type: 'engagement',
      title: chosen.title, message: chosen.body,
      metadata: { segment: segmentKey, message_type: `drip_${segmentKey}`, ai_generated: true, personalised: false },
    })));
    await supabase.from('engagement_messages').insert(batch.map(u => ({
      user_id: u.user_id, artist_id: u.id || null,
      segment: segmentKey, message_type: `drip_${segmentKey}`,
      title: chosen.title, body: chosen.body,
    })));
  }

  return eligible.length;
}

// ── Main handler ──────────────────────────────────────────────
exports.handler = async (event) => {
  const isManual = event.httpMethod === 'POST';

  const { data: config } = await supabase
    .from('engagement_config').select('key, value').in('key', ['drip_enabled']);
  const configMap = Object.fromEntries((config || []).map(r => [r.key, r.value]));
  if (configMap.drip_enabled === 'false' && !isManual) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'disabled' }) };
  }

  console.log(`Engagement drip v2 — ${new Date().toISOString()} — ${isManual ? 'manual' : 'scheduled'}`);

  try {
    const [platform, segments] = await Promise.all([getPlatformContext(), segmentUsers()]);

    console.log('Competitions:', platform.competitionSummary || 'none active');
    console.log('Segments:', Object.fromEntries(Object.entries(segments).map(([k, v]) => [k, v.length])));

    const results = {};
    let totalSent = 0;

    // New users — segment-level (one Claude call per segment)
    for (const key of ['new_artist', 'new_listener']) {
      const sent = await processNewUsers(segments[key], key, platform);
      results[key] = { users: segments[key].length, sent };
      totalSent += sent;
    }

    // Active & dormant — individual-level (personalised Claude call per user)
    for (const [key, isArtist] of [
      ['active_artist', true], ['dormant_artist', true],
      ['active_listener', false], ['dormant_listener', false],
    ]) {
      const sent = await processIndividuals(segments[key], key, platform, isArtist);
      results[key] = { users: segments[key].length, sent };
      totalSent += sent;
    }

    console.log(`Drip v2 complete — ${totalSent} sent`);
    return { statusCode: 200, body: JSON.stringify({ success: true, totalSent, segments: results, runAt: new Date().toISOString() }) };

  } catch (err) {
    console.error('Drip error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};