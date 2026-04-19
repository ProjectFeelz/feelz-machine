/**
 * netlify/functions/notify-session-live.js
 *
 * Called when an artist starts a listening session.
 * Notifies followers who have drop alerts enabled (artist_alerts table).
 * Sends both in-app notification and web push.
 *
 * POST body: { session_id: string, artist_id: string, token: string }
 */

const { createClient } = require('@supabase/supabase-js');

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

  // Verify artist owns this session
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return { statusCode: 401, body: 'Unauthorized' };

  const { data: artist } = await supabase
    .from('artists').select('id, artist_name, slug')
    .eq('id', artist_id).eq('user_id', user.id).maybeSingle();
  if (!artist) return { statusCode: 403, body: 'Forbidden' };

  const { data: session } = await supabase
    .from('listening_sessions').select('*')
    .eq('id', session_id).maybeSingle();
  if (!session) return { statusCode: 404, body: 'Session not found' };

  // Get followers with drop alerts enabled
  const { data: alerts } = await supabase
    .from('artist_alerts')
    .select('user_id')
    .eq('artist_id', artist_id);

  if (!alerts?.length) return { statusCode: 200, body: JSON.stringify({ notified: 0 }) };

  const userIds = alerts.map(a => a.user_id);

  // In-app notifications
  const notifRows = userIds.map(uid => ({
    user_id: uid,
    type: 'session_live',
    title: `${artist.artist_name} is live now 🎵`,
    message: session.title,
    from_artist_id: artist.id,
    metadata: {
      session_id,
      artist_slug: artist.slug,
      mode: session.mode,
      url: `/session/${session_id}`,
    },
  }));

  // Batch insert notifications (50 at a time)
  for (let i = 0; i < notifRows.length; i += 50) {
    await supabase.from('notifications').insert(notifRows.slice(i, i + 50));
  }

  // Web push — fire and don't wait for full response
  const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
  fetch(`${siteUrl}/.netlify/functions/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET },
    body: JSON.stringify({
      user_ids: userIds,
      title: `${artist.artist_name} is live 🎵`,
      body: session.title,
      url: `/session/${session_id}`,
      tag: `session-${session_id}`,
    }),
  }).catch(console.error);

  return {
    statusCode: 200,
    body: JSON.stringify({ notified: userIds.length }),
  };
};