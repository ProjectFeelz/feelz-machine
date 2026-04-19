/**
 * netlify/functions/send-push.js
 *
 * Sends Web Push notifications to subscribed users.
 * Called internally by other functions (listening session live, drop alert, tip, etc.)
 *
 * POST body:
 *   { user_ids: string[], title: string, body: string, url?: string, tag?: string }
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT  (mailto:you@feelzmachine.com)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const webpush  = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const secret = event.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_FUNCTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }
  const { user_ids, title, body: msgBody, url = '/', tag = 'feelz' } = body;
  if (!user_ids?.length || !title) return { statusCode: 400, body: 'user_ids and title required' };

  // Fetch all push subscriptions for these users
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', user_ids);

  if (!subs?.length) return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };

  const payload = JSON.stringify({ title, body: msgBody, url, tag, icon: '/icon-192.png' });
  let sent = 0, failed = 0;
  const expiredEndpoints = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err) {
      // 410 Gone = subscription expired, remove it
      if (err.statusCode === 410 || err.statusCode === 404) {
        expiredEndpoints.push(sub.endpoint);
      }
      failed++;
    }
  }));

  // Clean up expired subscriptions
  if (expiredEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ sent, failed, expired: expiredEndpoints.length }),
  };
};