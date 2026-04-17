/**
 * netlify/functions/monthly-wrapped.js
 *
 * Runs on the 1st of every month at 09:00 UTC.
 * For every listener who streamed last month:
 *   1. Fetches their play history, top artists, top tracks, total time
 *   2. Computes a "Top Supporter" rank across all listeners
 *   3. Calls Claude to write a short personalised wrapped summary
 *   4. Sends an in-app notification of type 'monthly_wrapped'
 *   5. Sends a 'top_supporter' notification to the top 10% of listeners
 *
 * Schedule: netlify.toml  →  "0 9 1 * *"  (1st of month, 9 AM UTC)
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
const BATCH_SIZE = 50;

// ── Date helpers ──────────────────────────────────────────────
function getLastMonthBounds() {
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    start:     firstOfLastMonth.toISOString(),
    end:       firstOfThisMonth.toISOString(),
    yearMonth: `${firstOfLastMonth.getFullYear()}-${String(firstOfLastMonth.getMonth() + 1).padStart(2, '0')}`,
    label:     firstOfLastMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
  };
}

// ── Fetch listener stream stats for last month ────────────────
async function fetchListenerStats(userId, start, end) {
  // All streams in the window
  const { data: streams } = await supabase
    .from('streams')
    .select('track_id, duration_played, created_at, tracks(title, artist_id, genre, mood, artists(artist_name, slug))')
    .eq('user_id', userId)
    .gte('created_at', start)
    .lt('created_at', end)
    .limit(500);

  if (!streams?.length) return null;

  // Aggregate
  const artistCounts  = {};
  const trackCounts   = {};
  const artistNames   = {};
  const artistSlugs   = {};
  let totalSeconds    = 0;

  for (const s of streams) {
    const t   = s.tracks;
    if (!t) continue;
    const aid = t.artist_id;
    const tid = s.track_id;

    artistCounts[aid] = (artistCounts[aid] || 0) + 1;
    trackCounts[tid]  = (trackCounts[tid]  || 0) + 1;
    artistNames[aid]  = t.artists?.artist_name || 'Unknown';
    artistSlugs[aid]  = t.artists?.slug || null;
    totalSeconds     += s.duration_played || 0;
  }

  // Top 3 artists
  const topArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, plays]) => ({ id, plays, name: artistNames[id], slug: artistSlugs[id] }));

  // Top 3 tracks
  const topTrackIds = Object.entries(trackCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  const topTrackDetails = [];
  for (const tid of topTrackIds) {
    const match = streams.find(s => s.track_id === tid);
    if (match?.tracks) {
      topTrackDetails.push({
        id:    tid,
        title: match.tracks.title,
        plays: trackCounts[tid],
        artist: match.tracks.artists?.artist_name || 'Unknown',
      });
    }
  }

  return {
    totalStreams:   streams.length,
    totalMinutes:   Math.round(totalSeconds / 60),
    uniqueArtists:  Object.keys(artistCounts).length,
    uniqueTracks:   Object.keys(trackCounts).length,
    topArtists,
    topTracks:      topTrackDetails,
    totalSeconds,
  };
}

// ── Fetch active competitions for context ─────────────────────
async function getActiveCompetitions() {
  const { data } = await supabase
    .from('competitions')
    .select('id, title, status, entries_close_at, voting_close_at')
    .in('status', ['upcoming', 'open', 'voting'])
    .order('created_at', { ascending: false })
    .limit(3);
  return data || [];
}

// ── Generate personalised wrapped copy via Claude ─────────────
async function generateWrappedCopy(stats, monthLabel, competitions, listenerRank, totalListeners) {
  const isTopSupporter = listenerRank <= Math.ceil(totalListeners * 0.1);
  const rankPercentile = totalListeners > 0
    ? Math.round((1 - listenerRank / totalListeners) * 100)
    : null;

  const competitionContext = competitions.length
    ? `Active competitions right now: ${competitions.map(c => `"${c.title}" (${c.status})`).join(', ')}.`
    : 'No competitions active right now.';

  const systemPrompt = `You are the voice of Feelz Machine — an independent music platform. Write short, authentic, direct copy. Never corporate. You're talking to a real listener who genuinely supports independent artists. Be warm, specific, and make them feel seen. No emojis unless it really fits. Max 2 sentences for each field.`;

  const userPrompt = `Write a personalised monthly wrapped notification for a Feelz Machine listener.

MONTH: ${monthLabel}
STREAMS: ${stats.totalStreams} total streams
TIME: ${stats.totalMinutes} minutes of music
UNIQUE ARTISTS: ${stats.uniqueArtists} artists supported
TOP ARTISTS: ${stats.topArtists.map(a => `${a.name} (${a.plays} plays)`).join(', ')}
TOP TRACK: ${stats.topTracks[0] ? `"${stats.topTracks[0].title}" by ${stats.topTracks[0].artist} (${stats.topTracks[0].plays} plays)` : 'N/A'}
SUPPORTER RANK: ${isTopSupporter ? `Top ${100 - rankPercentile}% supporter this month` : 'active listener'}
PLATFORM CONTEXT: ${competitionContext}

Return ONLY valid JSON, no markdown:
{
  "notification_title": "(max 60 chars — punchy, personal)",
  "notification_body": "(max 120 chars — warm, specific to their listening)",
  "top_supporter_title": "(only if isTopSupporter=true, max 60 chars — celebratory)",
  "top_supporter_body": "(only if isTopSupporter=true, max 120 chars — make them feel elite)"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return { ...JSON.parse(clean), isTopSupporter, rankPercentile };
  } catch {
    console.error('Failed to parse Claude wrapped response:', text);
    return null;
  }
}

// ── Compute top supporter ranks across all listeners ──────────
function rankListeners(listenerStats) {
  // Sort by total streams descending
  return [...listenerStats]
    .sort((a, b) => b.stats.totalStreams - a.stats.totalStreams)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

// ── Main handler ──────────────────────────────────────────────
exports.handler = async (event) => {
  const isManual = event.httpMethod === 'POST';
  const { start, end, yearMonth, label } = getLastMonthBounds();

  console.log(`Monthly Wrapped running for ${label} — ${isManual ? 'manual' : 'scheduled'}`);

  try {
    // 1. Get all listeners who streamed last month
    const { data: activeListenerIds } = await supabase
      .from('streams')
      .select('user_id')
      .gte('created_at', start)
      .lt('created_at', end)
      .not('user_id', 'is', null);

    if (!activeListenerIds?.length) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no streams last month' }) };
    }

    const uniqueUserIds = [...new Set(activeListenerIds.map(r => r.user_id))];
    console.log(`Found ${uniqueUserIds.length} active listeners for ${label}`);

    // 2. Check who already got wrapped this month (idempotency)
    const { data: alreadySent } = await supabase
      .from('monthly_wrapped_log')
      .select('user_id')
      .eq('year_month', yearMonth)
      .in('user_id', uniqueUserIds);

    const sentSet = new Set((alreadySent || []).map(r => r.user_id));
    const eligible = uniqueUserIds.filter(id => !sentSet.has(id));

    if (!eligible.length) {
      return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'all users already received wrapped' }) };
    }

    // 3. Fetch stats for all eligible listeners
    console.log(`Fetching stats for ${eligible.length} listeners...`);
    const allStats = [];

    for (const userId of eligible) {
      const stats = await fetchListenerStats(userId, start, end);
      if (stats) allStats.push({ userId, stats });
    }

    // 4. Rank listeners by streams (for Top Supporter)
    const ranked = rankListeners(allStats);
    const totalListeners = ranked.length;

    // 5. Get competition context once (same for all users)
    const competitions = await getActiveCompetitions();

    // 6. Process each listener
    let wrappedSent = 0;
    let topSupporterSent = 0;

    for (let i = 0; i < ranked.length; i += BATCH_SIZE) {
      const batch = ranked.slice(i, i + BATCH_SIZE);

      for (const item of batch) {
        try {
          const copy = await generateWrappedCopy(
            item.stats, label, competitions, item.rank, totalListeners
          );

          if (!copy) continue;

          const payload = {
            month:           yearMonth,
            monthLabel:      label,
            ...item.stats,
            rank:            item.rank,
            totalListeners,
            isTopSupporter:  copy.isTopSupporter,
            rankPercentile:  copy.rankPercentile,
          };

          // Insert wrapped notification
          await supabase.from('notifications').insert({
            user_id:  item.userId,
            type:     'monthly_wrapped',
            title:    copy.notification_title || `Your ${label} Wrapped`,
            message:  copy.notification_body  || `You streamed ${item.stats.totalStreams} tracks and supported ${item.stats.uniqueArtists} artists.`,
            metadata: { ...payload, ai_generated: true },
          });

          // Insert top_supporter notification if earned
          if (copy.isTopSupporter && copy.top_supporter_title) {
            await supabase.from('notifications').insert({
              user_id:  item.userId,
              type:     'top_supporter',
              title:    copy.top_supporter_title,
              message:  copy.top_supporter_body || `You're in the top ${100 - copy.rankPercentile}% of Feelz Machine supporters this month.`,
              metadata: { rank: item.rank, totalListeners, month: yearMonth, ai_generated: true },
            });

            // Update listener row with badge
            await supabase
              .from('listeners')
              .update({ top_supporter_rank: item.rank, top_supporter_month: yearMonth })
              .eq('user_id', item.userId);

            topSupporterSent++;
          }

          // Log to wrapped_log for idempotency
          await supabase.from('monthly_wrapped_log').insert({
            user_id:    item.userId,
            year_month: yearMonth,
            payload,
          });

          wrappedSent++;

          // Small delay to respect Anthropic rate limits
          await new Promise(r => setTimeout(r, 200));

        } catch (err) {
          console.error(`Wrapped error for user ${item.userId}:`, err.message);
        }
      }
    }

    console.log(`Wrapped complete. Sent: ${wrappedSent} wrapped, ${topSupporterSent} top supporter badges.`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success:          true,
        month:            yearMonth,
        eligibleListeners: eligible.length,
        wrappedSent,
        topSupporterSent,
        runAt:            new Date().toISOString(),
      }),
    };

  } catch (err) {
    console.error('Monthly wrapped error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};