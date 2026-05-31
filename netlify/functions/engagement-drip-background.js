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
      model: 'claude-sonnet-4-6',
      max_tokens: 120,
      system: `Feelz Machine voice. Friend texting about music — casual, warm, real. No em-dashes, no hype. Return ONLY JSON: {"title":"...","body":"..."}. Title ≤60 chars, body ≤120 chars.`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  if (data.error) {
    console.error('Claude API error:', JSON.stringify(data.error));
    return null;
  }
  if (!data.content?.[0]?.text) {
    console.error('Claude unexpected response:', JSON.stringify(data).slice(0, 200));
    return null;
  }
  const text = data.content[0].text;
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch (e) {
    console.error('Claude JSON parse error:', text.slice(0, 100));
    return null;
  }
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
      model: 'claude-sonnet-4-6',
      max_tokens: 280,
      system: `Feelz Machine voice. Casual, warm, real. No em-dashes. Return ONLY JSON array of 3 variants: [{"title":"...","body":"..."},...]`,
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

  // Most streamed track this week
  const { data: trendingData } = await supabase.from('streams')
    .select('track_id, tracks(title, artists(artist_name))')
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .limit(200);

  const trendCounts = {};
  const trendMeta   = {};
  for (const s of (trendingData || [])) {
    if (!s.track_id) continue;
    trendCounts[s.track_id] = (trendCounts[s.track_id] || 0) + 1;
    trendMeta[s.track_id]   = s.tracks;
  }
  const topTrackId = Object.entries(trendCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const trendingTrack = topTrackId && trendMeta[topTrackId]
    ? `${trendMeta[topTrackId].title} by ${trendMeta[topTrackId].artists?.artist_name}`
    : null;

  return {
    raw: competitions || [],
    hasActiveCompetition: (competitions?.length || 0) > 0,
    competitionSummary,
    totalArtists: totalArtists || 0,
    newTracksThisWeek: newThisWeek || 0,
    recentDrops: (recentTracks || []).slice(0, 3).map(t => `"${t.title}" by ${t.artists?.artist_name}`).join(', '),
    trendingTrack,
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
    { data: recentTracks },
    { count: newFollowers },
    { count: pendingCollabs },
    ,
    ,
    { data: artistRow },
    { data: lastSession },
  ] = await Promise.all([
    supabase.from('tracks')
      .select('id, title, created_at, stream_count, download_count')
      .eq('artist_id', artistId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .gte('created_at', weekAgo),
    supabase.from('collab_requests')
      .select('*', { count: 'exact', head: true })
      .eq('to_artist_id', artistId)
      .eq('status', 'pending'),
    Promise.resolve({ count: 0 }), // streams placeholder
    Promise.resolve({ count: 0 }), // downloads placeholder
    supabase.from('artists')
      .select('artist_name, total_streams, follower_count, genre, tier')
      .eq('id', artistId)
      .maybeSingle(),
    supabase.from('listening_sessions')
      .select('created_at')
      .eq('artist_id', artistId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const tracksThisMonth = (recentTracks || []).filter(t =>
    new Date(t.created_at) >= new Date(monthAgo)
  ).length;

  const latestTrack = recentTracks?.[0];

  const trackIds = (recentTracks || []).map(t => t.id);
  let streamsThisWeekActual = 0;
  if (trackIds.length > 0) {
    const { count } = await supabase.from('streams')
      .select('*', { count: 'exact', head: true })
      .in('track_id', trackIds)
      .gte('created_at', weekAgo);
    streamsThisWeekActual = count || 0;
  }

  const daysSinceSession = lastSession?.created_at
    ? Math.floor((Date.now() - new Date(lastSession.created_at)) / 86400000)
    : null;

  return {
    tracksThisMonth,
    totalPublishedTracks: (recentTracks || []).length,
    latestTrackTitle:     latestTrack?.title || null,
    latestTrackStreams:   latestTrack?.stream_count || 0,
    newFollowersWeek:     newFollowers || 0,
    pendingCollabs:       pendingCollabs || 0,
    streamsThisWeek:      streamsThisWeekActual,
    totalStreams:         artistRow?.total_streams || 0,
    totalFollowers:       artistRow?.follower_count || 0,
    tier:                 artistRow?.tier || 'free',
    daysSinceLastSession: daysSinceSession,
  };
}

// ── Build listener prompt ─────────────────────────────────────
function buildListenerPrompt(segment, ctx, platform, learnBlock) {
  const name = ctx.displayName ? `Their name is ${ctx.displayName}.` : '';

  const streakNote = ctx.currentStreak >= 7
    ? `${ctx.currentStreak}-day streak — that's serious dedication, reference it.`
    : ctx.currentStreak >= 3
    ? `${ctx.currentStreak}-day streak going — acknowledge it warmly.`
    : ctx.currentStreak === 0
    ? 'No active streak — soft nudge to start one.'
    : '';

  const discoveryNote = ctx.discoveryStreak >= 3
    ? `Also on a ${ctx.discoveryStreak}-day artist discovery streak.` : '';

  const engagementNote = [
    ctx.likeCount    > 0 && `${ctx.likeCount} liked tracks`,
    ctx.downloadCount > 0 && `${ctx.downloadCount} downloads — they actually support artists`,
  ].filter(Boolean).join(', ');

  const historyNote = ctx.streamsLastMonth > 0
    ? [
        `Last 30 days: ${ctx.streamsLastMonth} streams (${ctx.streamsThisWeek} this week).`,
        ctx.topGenre      && `Top genre: ${ctx.topGenre}.`,
        ctx.topMood       && `Mood they gravitate to: ${ctx.topMood}.`,
        ctx.recentArtists && `Artists they've played: ${ctx.recentArtists}.`,
      ].filter(Boolean).join(' ')
    : 'No recent streams — gone quiet.';

  const followNote = ctx.followCount > 0
    ? `Follows ${ctx.followCount} artists${ctx.followedArtists ? ` including ${ctx.followedArtists}` : ''}.`
    : 'Not following any artists yet — could nudge them to discover someone.';

  const unheardNote = ctx.unheardRecentDrops
    ? `Recent drops they haven't heard yet: ${ctx.unheardRecentDrops}. Reference if relevant.`
    : '';

  const competitionNote = platform.hasActiveCompetition
    ? `Active competition(s): ${platform.competitionSummary}. Weave in if it fits.`
    : '';

  const dormantNote = segment === 'dormant_listener'
    ? "They drifted. No guilt — just something that'll make them want to open the app." : '';

  const parts = [
    name,
    `LISTENING: ${historyNote}`,
    streakNote && `STREAK: ${streakNote}${discoveryNote ? ' ' + discoveryNote : ''}`,
    engagementNote && `ENGAGEMENT: ${engagementNote}`,
    followNote,
    unheardNote,
    competitionNote,
    dormantNote,
    platform.recentDrops && `Fresh drops: ${platform.recentDrops}.`,
  ].filter(Boolean);

  // Add behaviour signals
  const habitNotes = [];
  if (ctx.behaviorTags?.includes('night_owl'))        habitNotes.push('Listens late at night.');
  if (ctx.behaviorTags?.includes('morning_commuter')) habitNotes.push('Streams in the morning.');
  if (ctx.behaviorTags?.includes('weekend_binger'))   habitNotes.push('Weekend binge listener.');
  if (ctx.behaviorTags?.includes('deep_listener'))    habitNotes.push('Finishes almost every track.');
  if (ctx.behaviorTags?.includes('skip_heavy'))       habitNotes.push('Heavy skipper — needs a specific hook.');
  if (ctx.behaviorTags?.includes('genre_loyal') && ctx.topGenre) habitNotes.push(`Loyal to ${ctx.topGenre}.`);
  if (ctx.behaviorTags?.includes('collector'))        habitNotes.push('Downloads tracks — real supporter.');
  if (ctx.behaviorTags?.includes('competition_fan'))  habitNotes.push('Engages with competition entries.');
  if (ctx.behaviorTags?.includes('surging'))          habitNotes.push('Listening surging this week.');
  if (ctx.behaviorTags?.includes('cooling'))          habitNotes.push('Listening drifting off this week.');
  if (ctx.behaviorTags?.includes('churning'))         habitNotes.push('Gone quiet 2+ weeks — needs specific pull, not generic nudge.');
  if (ctx.behaviorSummary) parts.unshift(`BEHAVIOUR: ${ctx.behaviorSummary}`);
  if (habitNotes.length)   parts.push(`LISTENER SIGNALS: ${habitNotes.join(' ')}`);
  if (learnBlock)          parts.push(learnBlock);

  return `Write ONE personalised in-app notification for this listener (${segment.replace(/_/g, ' ')}).
${parts.join('\n')}
Use the specific behaviour signals — be real not generic. JSON only: {"title":"...","body":"..."}. Title ≤55 chars, body ≤110 chars.\`;
}

// ── Build artist prompt ───────────────────────────────────────
function buildArtistPrompt(segment, artist, ctx, platform, learnBlock) {
  const competitionNote = platform.hasActiveCompetition
    ? `Active competition(s): ${platform.competitionSummary}. Nudge toward entering if relevant.`
    : '';

  const sizeNote = ctx.totalFollowers > 0 || ctx.totalStreams > 0
    ? `${ctx.totalFollowers} followers, ${ctx.totalStreams} all-time streams.`
    : 'Just starting out.';

  const weekNote = ctx.streamsThisWeek > 0
    ? `${ctx.streamsThisWeek} streams this week — people are listening right now.`
    : 'No streams this week yet.';

  const latestNote = ctx.latestTrackTitle
    ? `Latest track: "${ctx.latestTrackTitle}" with ${ctx.latestTrackStreams} streams.`
    : 'No published tracks yet.';

  const activityParts = [
    ctx.tracksThisMonth  > 0 && `${ctx.tracksThisMonth} track(s) uploaded this month`,
    ctx.newFollowersWeek > 0 && `${ctx.newFollowersWeek} new follower(s) this week`,
    ctx.pendingCollabs   > 0 && `${ctx.pendingCollabs} pending collab request(s) waiting for a reply`,
  ].filter(Boolean);

  const activityNote = activityParts.length ? activityParts.join(', ') : 'quiet lately';

  const sessionNote = ctx.daysSinceLastSession !== null
    ? ctx.daysSinceLastSession <= 7
      ? 'Went live recently — momentum is there.'
      : `Last live session was ${ctx.daysSinceLastSession} days ago.`
    : 'Never gone live — could be a nudge.';

  const tierNote = ctx.tier === 'free'
    ? "On free plan — could mention Pro/Premium features if relevant, but don't be pushy." : '';

  const dormantNote = segment === 'dormant_artist'
    ? "Been quiet. Re-engagement only — make them feel the platform missed them, not guilty." : '';

  const artistParts = [
    `Artist: ${artist.artist_name || 'Unknown'} (${segment.replace(/_/g, ' ')})`,
    sizeNote,
    weekNote,
    latestNote,
    activityNote !== 'quiet lately' && `Activity: ${activityNote}`,
    artist.genre && `Genre: ${artist.genre}`,
    competitionNote,
    dormantNote,
    tierNote,
  ].filter(Boolean);

  const aHabits = [];
  if (ctx.behaviorTags?.includes('going_viral'))         aHabits.push('Track is blowing up — lean into momentum.');
  if (ctx.behaviorTags?.includes('momentum'))            aHabits.push('Just dropped, gaining streams — encourage continuation.');
  if (ctx.behaviorTags?.includes('stalled'))             aHabits.push('Growth stalled — honest but actionable nudge.');
  if (ctx.behaviorTags?.includes('dormant'))             aHabits.push('Long upload gap — re-engage, no guilt.');
  if (ctx.behaviorTags?.includes('live_performer'))      aHabits.push('Goes live — reference that energy.');
  if (ctx.behaviorTags?.includes('competition_entrant')) aHabits.push('Enters competitions — use if one is active.');
  if (ctx.behaviorTags?.includes('growing'))             aHabits.push(`Gained ${ctx.newFollowersWeek} followers this week.`);
  if (ctx.behaviorSummary)    artistParts.push(`BEHAVIOUR: ${ctx.behaviorSummary}`);
  if (aHabits.length > 0)     artistParts.push(`ARTIST SIGNALS: ${aHabits.join(' ')}`);
  if (learnBlock)             artistParts.push(learnBlock);

  return `Write ONE in-app notification for this artist (${segment.replace(/_/g, ' ')}).
${artistParts.join('\n')}
Peer energy, specific, not corporate. JSON only: {"title":"...","body":"..."}. Title ≤55 chars, body ≤110 chars.\`;
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

// ── Fetch learning context for a user's tag combo ────────────────────────────
async function getLearningContext(segment, tags) {
  if (!tags || tags.length === 0) return null;
  const combo = [...tags].sort().join('+');
  const { data } = await supabase
    .from('engagement_learning')
    .select('conversion_rate, recent_conversion_rate, best_signals, worst_signals, avg_session_quality, total_sends')
    .eq('segment', segment)
    .eq('tag_combo', combo)
    .maybeSingle();
  return data || null;
}

// ── Build learning block for Claude prompt ────────────────────────────────────
function buildLearningBlock(learning) {
  if (!learning || learning.total_sends < 5) return null; // not enough data yet

  const parts = [];

  // Use recent rate if we have it, fall back to all-time
  const rate = learning.recent_conversion_rate > 0
    ? learning.recent_conversion_rate
    : learning.conversion_rate;
  const rateStr = `${Math.round(rate * 100)}%`;
  const qualityStr = learning.avg_session_quality >= 2.5
    ? 'deep listening sessions'
    : learning.avg_session_quality >= 1
    ? 'light engagement'
    : 'mostly bounces';

  parts.push(`WHAT HAS WORKED FOR THIS USER TYPE (${learning.total_sends} sends, ${rateStr} conversion → ${qualityStr}):`);

  if (learning.best_signals?.length > 0) {
    parts.push(`Signals that drove real sessions: ${learning.best_signals.join(', ')}.`);
  }
  if (learning.worst_signals?.length > 0) {
    parts.push(`Signals that flopped (avoid): ${learning.worst_signals.join(', ')}.`);
  }

  if (rate < 0.1) {
    parts.push('Low conversion overall — try a completely different angle, not more of the same.');
  } else if (rate > 0.35) {
    parts.push('This approach converts well — stay in this lane.');
  }

  return parts.join(' ');
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

// ── Process individuals (parallel batches of 5) ──────────────
const PARALLEL_BATCH = 5;

async function processOneUser(user, segmentKey, platform, isArtist) {
  try {
    let prompt;
    let ctx;
    if (isArtist) {
      ctx    = await getArtistContext(user.id);
      // Fetch learning for this artist's behaviour profile
      const learning = await getLearningContext(segmentKey, ctx.behaviorTags);
      const learnBlock = buildLearningBlock(learning);
      prompt = buildArtistPrompt(segmentKey, user, ctx, platform, learnBlock);
    } else {
      ctx    = await getListenerContext(user.user_id);
      const learning = await getLearningContext(segmentKey, ctx.behaviorTags);
      const learnBlock = buildLearningBlock(learning);
      prompt = buildListenerPrompt(segmentKey, ctx, platform, learnBlock);
    }

    const msg = await generateSingleMessage(prompt);
    if (!msg?.title) {
      console.error(`Claude returned no message for ${user.user_id} segment=${segmentKey}`);
      return 0;
    }

    const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
    // Extract which signals were actually used in the prompt
    const signalsUsed = [
      ...(ctx.behaviorTags || []),
      ctx.sessionType ? `session:${ctx.sessionType}` : null,
    ].filter(Boolean);

    const [notifResult, msgResult] = await Promise.all([
      supabase.from('notifications').insert({
        user_id:   user.user_id,
        artist_id: isArtist ? user.id : null,
        type:      'engagement',
        title:     msg.title,
        message:   msg.body,
        metadata:  { segment: segmentKey, message_type: `drip_${segmentKey}`, ai_generated: true, personalised: true, signals_used: signalsUsed },
      }),
      supabase.from('engagement_messages').insert({
        user_id:      user.user_id,
        artist_id:    isArtist ? user.id : null,
        segment:      segmentKey,
        message_type: `drip_${segmentKey}`,
        title:        msg.title,
        body:         msg.body,
        signals_used: signalsUsed,
      }),
    ]);

    if (notifResult.error) console.error(`Notification insert failed for ${user.user_id}:`, JSON.stringify(notifResult.error));
    if (msgResult.error)   console.error(`EngagementMessage insert failed for ${user.user_id}:`, JSON.stringify(msgResult.error));

    // Web push — fire and forget
    fetch(`${siteUrl}/.netlify/functions/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET },
      body: JSON.stringify({ user_ids: [user.user_id], title: msg.title, body: msg.body, url: '/', tag: `drip-${segmentKey}` }),
    }).catch(() => {});

    return (notifResult.error) ? 0 : 1;
  } catch (err) {
    console.error(`Error for ${user.user_id}:`, err.message);
    return 0;
  }
}

async function processIndividuals(users, segmentKey, platform, isArtist) {
  if (!users.length) return 0;
  const userIds = users.map(u => u.user_id).filter(Boolean);
  const weeklyCounts = await getWeeklyMessageCounts(userIds);
  const eligible = users.filter(u => (weeklyCounts[u.user_id] || 0) < MAX_PER_WEEK);
  if (!eligible.length) return 0;

  let sent = 0;
  for (let i = 0; i < eligible.length; i += PARALLEL_BATCH) {
    const batch = eligible.slice(i, i + PARALLEL_BATCH);
    const results = await Promise.all(batch.map(user => processOneUser(user, segmentKey, platform, isArtist)));
    sent += results.reduce((a, b) => a + b, 0);
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
  const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
  const isArtistSegment = segmentKey.includes('artist');

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);

    const { error: notifErr } = await supabase.from('notifications').insert(batch.map(u => ({
      user_id:   u.user_id,
      artist_id: isArtistSegment ? u.id : null,
      type:      'engagement',
      title:     chosen.title,
      message:   chosen.body,
      metadata:  { segment: segmentKey, message_type: `drip_${segmentKey}`, ai_generated: true, personalised: false },
    })));
    if (notifErr) console.error(`New user notification batch insert failed (${segmentKey}):`, JSON.stringify(notifErr));

    const { error: msgErr } = await supabase.from('engagement_messages').insert(batch.map(u => ({
      user_id:      u.user_id,
      artist_id:    isArtistSegment ? u.id : null,
      segment:      segmentKey,
      message_type: `drip_${segmentKey}`,
      title:        chosen.title,
      body:         chosen.body,
    })));
    if (msgErr) console.error(`New user engagement_messages batch insert failed (${segmentKey}):`, JSON.stringify(msgErr));

    fetch(`${siteUrl}/.netlify/functions/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET },
      body: JSON.stringify({ user_ids: batch.map(u => u.user_id), title: chosen.title, body: chosen.body, url: '/', tag: `drip-${segmentKey}` }),
    }).catch(() => {});
  }

  return eligible.length;
}

// ── Main handler ──────────────────────────────────────────────
exports.handler = async (event) => {
  // Scheduled functions arrive via GET from Netlify internally.
  // Manual triggers from admin panel or cron arrive via POST with the internal secret.
  const isScheduled = event.httpMethod === 'GET';
  const isManual    = event.httpMethod === 'POST';

  if (!isScheduled && !isManual) {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Require secret on all POST calls (admin panel + cron)
  if (isManual) {
    const incomingSecret = event.headers['x-internal-secret'];
    if (!incomingSecret || incomingSecret !== process.env.INTERNAL_FUNCTION_SECRET) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const { data: config } = await supabase
    .from('engagement_config').select('key, value').in('key', ['drip_enabled']);
  const configMap = Object.fromEntries((config || []).map(r => [r.key, r.value]));
  if (configMap.drip_enabled === 'false' && !isManual) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'disabled' }) };
  }

  console.log(`Engagement drip v2 — ${new Date().toISOString()} — ${isManual ? 'manual' : 'scheduled'}`);

  try {
    console.log('Computing behaviour profiles…');
    try { await computeAllProfiles(); } catch (e) { console.warn('Profile compute (non-fatal):', e.message); }
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