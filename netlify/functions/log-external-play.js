// netlify/functions/log-external-play.js
// Logs a track play originating from an external site (e.g. PJF Plugin Gallery).
// Deliberately kept separate from log_stream() / tracks.stream_count, which
// represent real logged-in-fan streams on Feelz Machine itself. This just
// tracks external_play_count per track so we can see which songs are landing
// with visitors coming from other properties, without polluting the real
// stream metric used for artist/investor reporting.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Add any other external properties here as they start sending plays
const ALLOWED_ORIGINS = [
  'https://www.projectfeelz.com',
  'https://projectfeelz.com',
];

const DEDUPE_WINDOW_MINUTES = 30;

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { trackId, source } = JSON.parse(event.body || '{}');
    if (!trackId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'trackId required' }) };
    }

    // Confirm the track exists and is actually published
    const { data: track } = await supabase
      .from('tracks')
      .select('id, is_published')
      .eq('id', trackId)
      .maybeSingle();

    if (!track || !track.is_published) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Track not found' }) };
    }

    const ipHash = crypto.createHash('sha256')
      .update(event.headers['x-forwarded-for'] || 'unknown')
      .digest('hex').slice(0, 16);

    // Light dedupe — the same visitor replaying/re-clicking the same track
    // within the window doesn't count again
    const windowStart = new Date(Date.now() - DEDUPE_WINDOW_MINUTES * 60000).toISOString();
    const { data: recent } = await supabase
      .from('external_plays')
      .select('id')
      .eq('track_id', trackId)
      .eq('ip_hash', ipHash)
      .gte('created_at', windowStart)
      .maybeSingle();

    if (recent) {
      return { statusCode: 200, headers, body: JSON.stringify({ logged: false, reason: 'deduped' }) };
    }

    await supabase.from('external_plays').insert({
      track_id:   trackId,
      source:     source || 'plugin_gallery',
      ip_hash:    ipHash,
      user_agent: event.headers['user-agent']?.slice(0, 200) || '',
    });

    await supabase.rpc('increment_external_play', { p_track_id: trackId });

    return { statusCode: 200, headers, body: JSON.stringify({ logged: true }) };
  } catch (err) {
    console.error('[log-external-play]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};