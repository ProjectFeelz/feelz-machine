/**
 * netlify/functions/notify-session-live.js
 *
 * Called by the host's app when they schedule a stream and when they go live.
 * Tells the right people (netlify/lib/liveAlerts.js): everyone for a stream
 * on a platform admin's account, followers for anyone else, plus anyone who
 * asked to be reminded. In the bell and by push.
 *
 * POST body: { session_id: string, artist_id: string, token: string }
 *
 * Sends each alert once per stream: scheduling twice or tapping Go live twice
 * does not notify anybody twice.
 */

const { createClient } = require('@supabase/supabase-js');
const { recipientsFor, alreadySent, notifyInApp, pushTo, whenText } = require('../lib/liveAlerts');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { session_id, artist_id, token } = body;
  if (!session_id || !artist_id || !token) return { statusCode: 400, body: 'Missing fields' };

  // Only the artist who owns the stream can announce it.
  const { data: { user } = {} } = await supabase.auth.getUser(token);
  if (!user) return { statusCode: 401, body: 'Unauthorized' };

  const { data: artist } = await supabase
    .from('artists').select('id, user_id, artist_name, slug')
    .eq('id', artist_id).eq('user_id', user.id).maybeSingle();
  if (!artist) return { statusCode: 403, body: 'Forbidden' };

  const { data: session } = await supabase
    .from('listening_sessions').select('*')
    .eq('id', session_id).eq('artist_id', artist.id).maybeSingle();
  if (!session) return { statusCode: 404, body: 'Session not found' };
  if (session.status !== 'live' && session.status !== 'scheduled') {
    return { statusCode: 200, body: JSON.stringify({ notified: 0, reason: 'not live or scheduled' }) };
  }

  const scheduled = session.status === 'scheduled';
  const kind = scheduled ? 'live_scheduled' : 'live_now';
  if (await alreadySent(supabase, session.id, kind)) {
    return { statusCode: 200, body: JSON.stringify({ notified: 0, reason: 'already sent' }) };
  }

  try {
    const { userIds, everyone } = await recipientsFor(supabase, session, artist);
    if (!userIds.length) return { statusCode: 200, body: JSON.stringify({ notified: 0 }) };

    const url = `/session/${session.id}`;
    const title = scheduled
      ? `${artist.artist_name} goes live ${whenText(session.scheduled_at)}`
      : `${artist.artist_name} is live now`;
    const message = scheduled
      ? `${session.title || 'Live stream'}. Tap to set a reminder.`
      : (session.title || 'Come and watch.');

    const notified = await notifyInApp(supabase, userIds, {
      type: 'session_live',
      title,
      message,
      from_artist_id: artist.id,
      metadata: { session_id: session.id, artist_slug: artist.slug, mode: session.mode, url, kind },
    });

    const { sent } = await pushTo(supabase, userIds, { title, body: message, url, tag: `session-${session.id}` });

    console.log(`[notify-session-live] ${kind} ${session.id}: ${notified} in app, ${sent} push${everyone ? ', everyone' : ''}`);
    return { statusCode: 200, body: JSON.stringify({ notified, pushed: sent, everyone }) };
  } catch (e) {
    console.error('[notify-session-live] failed:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not send alerts' }) };
  }
};
