/**
 * score-engagement-outcomes.js
 *
 * Runs daily at 03:30 UTC — after behaviour profiles are refreshed (03:00)
 * but before the drip fires (08:00).
 *
 * For every engagement message sent in the last 48h:
 *   1. Check if the user came back (last_seen_at > sent_at within 24h window)
 *   2. Check how good the session was (streams in the 2h after conversion)
 *   3. Write/update engagement_outcomes row
 *   4. Roll up per-segment/tag-combo learning into engagement_learning
 *
 * Session quality scale:
 *   none     — didn't come back
 *   bounce   — came back, 0 streams (opened and left)
 *   light    — 1-2 streams
 *   engaged  — 3-6 streams
 *   deep     — 7+ streams
 *
 * Baseline correction:
 *   If a user was already opening the app daily (is_baseline_active),
 *   their conversion is neutral — we don't credit the message.
 *   Only dormant/cooling users who convert give a positive signal.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CONVERSION_WINDOW_MS  = 24 * 60 * 60 * 1000; // 24h
const SESSION_WINDOW_MS     =  2 * 60 * 60 * 1000; // 2h post-conversion
const QUALITY_THRESHOLDS    = { bounce: 0, light: 2, engaged: 6 };

function sessionQualityLabel(streams) {
  if (streams === 0)                        return 'bounce';
  if (streams <= QUALITY_THRESHOLDS.light)  return 'light';
  if (streams <= QUALITY_THRESHOLDS.engaged) return 'engaged';
  return 'deep';
}

function qualityScore(label) {
  return { none: 0, bounce: 0.5, light: 1, engaged: 2.5, deep: 4 }[label] || 0;
}

// ── Score a single message ────────────────────────────────────────────────────
async function scoreMessage(msg) {
  const sentAt    = new Date(msg.sent_at);
  const windowEnd = new Date(sentAt.getTime() + CONVERSION_WINDOW_MS);
  const now       = new Date();

  // Too recent to score (need to wait for the conversion window to close)
  if (now < windowEnd) return null;

  // Was already scored?
  const { data: existing } = await supabase
    .from('engagement_outcomes')
    .select('id, scored')
    .eq('user_id', msg.user_id)
    .eq('sent_at', msg.sent_at)
    .maybeSingle();

  if (existing?.scored) return null; // already done

  // Get user's last_seen_at
  const isArtist = !!msg.artist_id;
  let lastSeenAt = null;
  let baseline   = false;

  if (isArtist) {
    const { data: a } = await supabase
      .from('artists')
      .select('last_seen_at')
      .eq('id', msg.artist_id)
      .maybeSingle();
    lastSeenAt = a?.last_seen_at;
  } else {
    const { data: l } = await supabase
      .from('listeners')
      .select('last_seen_at')
      .eq('user_id', msg.user_id)
      .maybeSingle();
    lastSeenAt = l?.last_seen_at;
  }

  // Check if they were already a daily opener (baseline active)
  // Proxy: had a stream in the 24h BEFORE the message was sent
  const dayBefore = new Date(sentAt.getTime() - CONVERSION_WINDOW_MS).toISOString();
  const { count: streamsBeforeSend } = await supabase
    .from('streams')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', msg.user_id)
    .gte('created_at', dayBefore)
    .lt('created_at', msg.sent_at);
  baseline = (streamsBeforeSend || 0) > 0;

  // Did they convert?
  const converted = lastSeenAt
    ? new Date(lastSeenAt) > sentAt && new Date(lastSeenAt) <= windowEnd
    : false;
  const convertedAt = converted ? lastSeenAt : null;

  // Session quality: streams in 2h after conversion
  let sessionStreams = 0;
  if (converted && convertedAt) {
    const sessionEnd = new Date(new Date(convertedAt).getTime() + SESSION_WINDOW_MS).toISOString();
    const { count } = await supabase
      .from('streams')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', msg.user_id)
      .gte('created_at', convertedAt)
      .lte('created_at', sessionEnd);
    sessionStreams = count || 0;
  }

  const quality = converted ? sessionQualityLabel(sessionStreams) : 'none';

  // Get tags at send time from behaviour profile
  const { data: profile } = isArtist
    ? await supabase.from('artist_behavior_profiles').select('tags').eq('artist_id', msg.artist_id).maybeSingle()
    : await supabase.from('listener_behavior_profiles').select('tags').eq('user_id', msg.user_id).maybeSingle();

  const tagsAtSend = profile?.tags || [];

  // Upsert outcome row
  await supabase.from('engagement_outcomes').upsert({
    user_id:             msg.user_id,
    notification_id:     msg.notification_id || null,
    sent_at:             msg.sent_at,
    segment:             msg.segment,
    tags_at_send:        tagsAtSend,
    signals_used:        msg.signals_used || [],
    converted:           converted && !baseline, // only credit non-baseline conversions
    converted_at:        convertedAt,
    session_streams:     sessionStreams,
    session_quality:     quality,
    days_dormant_at_send: 0, // populated by profile at send time — leaving for future
    is_baseline_active:  baseline,
    scored:              true,
    scored_at:           new Date().toISOString(),
  }, { onConflict: 'user_id,notification_id' });

  return {
    converted: converted && !baseline,
    quality,
    segment: msg.segment,
    tags: tagsAtSend,
    signals: msg.signals_used || [],
  };
}

// ── Roll up learning per segment+tag_combo ────────────────────────────────────
async function rollupLearning() {
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString();

  // Fetch all scored outcomes
  const { data: outcomes } = await supabase
    .from('engagement_outcomes')
    .select('segment, tags_at_send, signals_used, converted, session_quality, sent_at')
    .eq('scored', true)
    .not('tags_at_send', 'is', null);

  if (!outcomes?.length) return 0;

  // Group by segment + sorted tag combo
  const groups = {};
  for (const o of outcomes) {
    const combo = (o.tags_at_send || []).slice().sort().join('+') || 'untagged';
    const key   = `${o.segment}||${combo}`;
    if (!groups[key]) groups[key] = { segment: o.segment, combo, all: [], recent: [] };
    groups[key].all.push(o);
    if (o.sent_at >= d30) groups[key].recent.push(o);
  }

  let updated = 0;

  for (const { segment, combo, all, recent } of Object.values(groups)) {
    const totalSends       = all.length;
    const totalConversions = all.filter(o => o.converted).length;
    const convRate         = totalSends > 0 ? totalConversions / totalSends : 0;
    const avgQuality       = all.reduce((s, o) => s + qualityScore(o.session_quality), 0) / Math.max(totalSends, 1);

    const recentSends       = recent.length;
    const recentConversions = recent.filter(o => o.converted).length;
    const recentConvRate    = recentSends > 0 ? recentConversions / recentSends : 0;

    // Signal performance: which signals appeared more in converted vs not converted
    const signalConversions = {};
    const signalSends       = {};
    for (const o of all) {
      for (const sig of (o.signals_used || [])) {
        signalSends[sig]       = (signalSends[sig] || 0) + 1;
        if (o.converted) signalConversions[sig] = (signalConversions[sig] || 0) + 1;
      }
    }
    const signalRates = Object.entries(signalSends)
      .filter(([, sends]) => sends >= 3) // minimum sample size
      .map(([sig, sends]) => ({
        sig,
        rate: (signalConversions[sig] || 0) / sends,
        sends,
      }))
      .sort((a, b) => b.rate - a.rate);

    const bestSignals  = signalRates.slice(0, 5).map(s => s.sig);
    const worstSignals = signalRates.slice(-3).filter(s => s.rate < 0.1).map(s => s.sig);

    // Top converting message titles (from outcomes that converted with deep/engaged quality)
    const topTitles = all
      .filter(o => o.converted && ['deep','engaged'].includes(o.session_quality))
      .flatMap(o => o.signals_used || [])
      .filter(Boolean)
      .slice(0, 5);

    await supabase.from('engagement_learning').upsert({
      segment,
      tag_combo:             combo,
      total_sends:           totalSends,
      total_conversions:     totalConversions,
      conversion_rate:       parseFloat(convRate.toFixed(4)),
      avg_session_quality:   parseFloat(avgQuality.toFixed(2)),
      best_signals:          bestSignals,
      worst_signals:         worstSignals,
      top_converting_titles: topTitles,
      recent_sends:          recentSends,
      recent_conversions:    recentConversions,
      recent_conversion_rate: parseFloat(recentConvRate.toFixed(4)),
      last_updated:          new Date().toISOString(),
    }, { onConflict: 'segment,tag_combo' });

    updated++;
  }

  return updated;
}

// ── Main handler ───────────────────────────────────────────────────────────────
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
    console.log('[score-outcomes] Starting…');

    // Fetch messages sent in last 48h that haven't been scored
    const d48 = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: messages } = await supabase
      .from('engagement_messages')
      .select('user_id, artist_id, sent_at, segment, signals_used, notification_id')
      .gte('sent_at', d48)
      .order('sent_at', { ascending: false });

    const toScore = messages || [];
    console.log(`[score-outcomes] ${toScore.length} messages to score`);

    let scored    = 0;
    let converted = 0;

    for (const msg of toScore) {
      const result = await scoreMessage(msg);
      if (result) {
        scored++;
        if (result.converted) converted++;
      }
    }

    // Roll up learning tables
    const learningRows = await rollupLearning();

    console.log(`[score-outcomes] Scored: ${scored}, Converted: ${converted}, Learning rows: ${learningRows}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, scored, converted, learningRows }),
    };
  } catch (err) {
    console.error('[score-outcomes] Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
