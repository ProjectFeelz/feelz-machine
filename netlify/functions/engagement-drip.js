/**
 * netlify/functions/engagement-drip.js
 *
 * Scheduled function — runs Monday and Thursday at 10:00 AM UTC.
 * Segments all users by behaviour, calls Claude API once per segment
 * to generate personalised in-app notification copy, then inserts
 * notifications into Supabase for each user in that segment.
 *
 * Schedule is set in netlify.toml (added separately).
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_PER_WEEK = 2;
const BATCH_SIZE   = 100;

// ── Claude API call ───────────────────────────────────────────
async function generateMessages(segmentContext) {
  const systemPrompt = `You are the voice of Feelz Machine — an independent music collaboration platform built for real artists. Your tone is direct, authentic, energetic and community-driven. Never corporate. Never cringe. You write short, punchy in-app notification copy that makes artists and listeners feel like they're part of something real.

You will be given a user segment description and context about what's happening on the platform right now. You must return ONLY valid JSON — no markdown, no preamble, no explanation. Return an array of 3 notification options for this segment so we can A/B test them. Each option has: title (max 60 chars) and body (max 120 chars).`;

  const userPrompt = `Generate 3 notification variants for this user segment:

SEGMENT: ${segmentContext.segment}
DESCRIPTION: ${segmentContext.description}
PLATFORM CONTEXT: ${segmentContext.platformContext}
TONE HINT: ${segmentContext.tone}

Return ONLY this JSON structure, nothing else:
[
  { "title": "...", "body": "..." },
  { "title": "...", "body": "..." },
  { "title": "...", "body": "..." }
]`;

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
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '[]';

  try {
    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    console.error('Failed to parse Claude response:', text);
    return null;
  }
}

// ── Get platform context for Claude ──────────────────────────
async function getPlatformContext() {
  const [
    { count: totalArtists },
    { count: activeCompetitions },
    { data: recentTracks },
  ] = await Promise.all([
    supabase.from('artists').select('*', { count: 'exact', head: true }),
    supabase.from('competitions').select('*', { count: 'exact', head: true })
      .in('status', ['open', 'voting']),
    supabase.from('tracks').select('title, artists(artist_name)')
      .order('created_at', { ascending: false }).limit(3),
  ]);

  const trackNames = (recentTracks || [])
    .map(t => `"${t.title}" by ${t.artists?.artist_name}`)
    .join(', ');

  return [
    totalArtists ? `${totalArtists} artists on the platform` : '',
    activeCompetitions ? `${activeCompetitions} competition(s) currently open` : 'no competitions right now',
    trackNames ? `Recent drops: ${trackNames}` : '',
  ].filter(Boolean).join('. ');
}

// ── Check how many messages a user received this week ────────
async function getWeeklyMessageCounts(userIds) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('engagement_messages')
    .select('user_id')
    .in('user_id', userIds)
    .gte('sent_at', weekAgo);

  const counts = {};
  (data || []).forEach(row => {
    counts[row.user_id] = (counts[row.user_id] || 0) + 1;
  });
  return counts;
}

// ── Segment all users ─────────────────────────────────────────
async function segmentUsers() {
  const now = new Date();

  // Read thresholds from engagement_config so admin panel controls actually work
  const { data: configRows } = await supabase
    .from('engagement_config')
    .select('key, value');
  const config = {};
  (configRows || []).forEach(r => { config[r.key] = r.value; });

  const dormantDays = parseInt(config.dormant_threshold_days ?? '5',  10);
  const churnedDays = parseInt(config.churned_threshold_days ?? '30', 10);
  const newDays     = parseInt(config.new_user_threshold_days ?? '14', 10);

  const dormantThreshold  = new Date(now - dormantDays * 24 * 60 * 60 * 1000).toISOString();
  const churnedThreshold  = new Date(now - churnedDays * 24 * 60 * 60 * 1000).toISOString();
  const newUserThreshold  = new Date(now - newDays     * 24 * 60 * 60 * 1000).toISOString();

  const { data: artists } = await supabase
    .from('artists')
    .select('id, user_id, artist_name, genre, tier, follower_count, last_seen_at, created_at, onboarding_step')
    .not('user_id', 'is', null);

  const { data: listeners } = await supabase
    .from('listeners')
    .select('id, user_id, last_seen_at, created_at')
    .not('user_id', 'is', null);

  const segments = {
    new_artist:    [],  // signed up < 14 days ago
    active_artist: [],  // seen in last 5 days
    dormant_artist:[],  // not seen in 5+ days but < 30
    new_listener:  [],
    active_listener:[],
    dormant_listener:[],
  };

  for (const artist of artists || []) {
    const lastSeen   = artist.last_seen_at ? new Date(artist.last_seen_at) : new Date(artist.created_at);
    const isNew      = new Date(artist.created_at) > new Date(newUserThreshold);
    const isActive   = lastSeen > new Date(dormantThreshold);
    const isDormant  = !isActive && lastSeen > new Date(churnedThreshold);

    if (isNew)           segments.new_artist.push(artist);
    else if (isActive)   segments.active_artist.push(artist);
    else if (isDormant)  segments.dormant_artist.push(artist);
    // churned = skip for now, they'll get a separate flow later
  }

  for (const listener of listeners || []) {
    const lastSeen  = listener.last_seen_at ? new Date(listener.last_seen_at) : new Date(listener.created_at);
    const isNew     = new Date(listener.created_at) > new Date(newUserThreshold);
    const isActive  = lastSeen > new Date(dormantThreshold);
    const isDormant = !isActive && lastSeen > new Date(churnedThreshold);

    if (isNew)          segments.new_listener.push(listener);
    else if (isActive)  segments.active_listener.push(listener);
    else if (isDormant) segments.dormant_listener.push(listener);
  }

  return segments;
}

// ── Build segment context for Claude ─────────────────────────
function buildSegmentContext(segmentKey, users, platformContext) {
  const contexts = {
    new_artist: {
      segment: 'New Artist',
      description: 'Artist who joined in the last 14 days. They may not have uploaded yet or explored all features. They need encouragement and orientation.',
      tone: 'Welcoming, exciting, make them feel like they joined something special',
    },
    active_artist: {
      segment: 'Active Artist',
      description: 'Artist who has been active recently. They know the platform. Keep them engaged with community, competitions, and new features.',
      tone: 'Peer-to-peer energy, community hype, FOMO-friendly but not pushy',
    },
    dormant_artist: {
      segment: 'Dormant Artist',
      description: 'Artist who hasn\'t been seen in 5+ days. They drifted away. Pull them back with something real — new activity on their profile, a competition, or community buzz.',
      tone: 'Direct, warm re-engagement. No guilt. Just "yo, something\'s happening"',
    },
    new_listener: {
      segment: 'New Listener',
      description: 'Listener who just joined. They need to discover artists and understand what Feelz Machine is about.',
      tone: 'Inviting, curated, like a friend recommending something fire',
    },
    active_listener: {
      segment: 'Active Listener',
      description: 'Listener who streams regularly. Keep them discovering new music and engaged with the community.',
      tone: 'Music-first, discovery-driven, community-aware',
    },
    dormant_listener: {
      segment: 'Dormant Listener',
      description: 'Listener who hasn\'t opened the app in 5+ days. Bring them back with music they\'ll actually want to hear.',
      tone: 'Casual, no pressure. Just drop something good in their lap',
    },
  };

  return {
    ...contexts[segmentKey],
    platformContext,
  };
}

// ── Insert notifications for a segment ───────────────────────
async function sendToSegment(segmentKey, users, messages, messageType) {
  if (!messages?.length || !users?.length) return 0;

  // Pick one message variant (rotate based on day of week for A/B)
  const variantIndex = new Date().getDay() % messages.length;
  const chosen = messages[variantIndex];

  // Filter out users who've already hit their weekly cap
  const userIds = users.map(u => u.user_id).filter(Boolean);
  const weeklyCounts = await getWeeklyMessageCounts(userIds);
  const eligible = users.filter(u => (weeklyCounts[u.user_id] || 0) < MAX_PER_WEEK);

  if (!eligible.length) {
    console.log(`${segmentKey}: all ${users.length} users at weekly cap, skipping`);
    return 0;
  }

  console.log(`${segmentKey}: sending to ${eligible.length}/${users.length} users`);

  // Batch insert notifications
  let sent = 0;
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);

    // Insert into notifications table (what the bell icon reads)
    const notifRows = batch.map(u => ({
      user_id:   u.user_id,
      artist_id: u.id || null,  // null for listeners
      type:      'engagement',
      title:     chosen.title,
      message:   chosen.body,
      metadata:  { segment: segmentKey, message_type: messageType, ai_generated: true },
    }));

    const { error: notifErr } = await supabase.from('notifications').insert(notifRows);
    if (notifErr) console.error(`Notification insert error (${segmentKey}):`, notifErr);

    // Insert into engagement_messages log (for rate limiting + analytics)
    const logRows = batch.map(u => ({
      user_id:      u.user_id,
      artist_id:    u.id || null,
      segment:      segmentKey,
      message_type: messageType,
      title:        chosen.title,
      body:         chosen.body,
    }));

    const { error: logErr } = await supabase.from('engagement_messages').insert(logRows);
    if (logErr) console.error(`Log insert error (${segmentKey}):`, logErr);

    sent += batch.length;
  }

  return sent;
}

// ── Main handler ──────────────────────────────────────────────
exports.handler = async (event) => {
  // Allow manual trigger via POST (for testing from admin panel)
  const isManual = event.httpMethod === 'POST';

  // Check drip is enabled
  const { data: config } = await supabase
    .from('engagement_config')
    .select('key, value')
    .in('key', ['drip_enabled', 'max_per_week']);

  const configMap = Object.fromEntries((config || []).map(r => [r.key, r.value]));
  if (configMap.drip_enabled === 'false' && !isManual) {
    console.log('Engagement drip is disabled, skipping');
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'disabled' }) };
  }

  console.log(`Engagement drip running — ${new Date().toISOString()} — ${isManual ? 'manual' : 'scheduled'}`);

  try {
    // 1. Get platform context for Claude
    const platformContext = await getPlatformContext();
    console.log('Platform context:', platformContext);

    // 2. Segment users
    const segments = await segmentUsers();
    console.log('Segment sizes:', Object.fromEntries(
      Object.entries(segments).map(([k, v]) => [k, v.length])
    ));

    const results = {};
    let totalSent = 0;

    // 3. For each non-empty segment, call Claude once and blast to segment
    for (const [segmentKey, users] of Object.entries(segments)) {
      if (!users.length) {
        results[segmentKey] = { users: 0, sent: 0 };
        continue;
      }

      const context = buildSegmentContext(segmentKey, users, platformContext);
      console.log(`Generating messages for ${segmentKey} (${users.length} users)...`);

      const messages = await generateMessages(context);
      if (!messages) {
        console.error(`Claude returned no messages for ${segmentKey}`);
        results[segmentKey] = { users: users.length, sent: 0, error: 'Claude generation failed' };
        continue;
      }

      console.log(`${segmentKey} messages:`, messages.map(m => m.title));

      const sent = await sendToSegment(segmentKey, users, messages, `drip_${segmentKey}`);
      results[segmentKey] = { users: users.length, sent };
      totalSent += sent;

      // Small delay between segments to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`Drip complete. Total sent: ${totalSent}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        totalSent,
        segments: results,
        runAt: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error('Engagement drip error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
