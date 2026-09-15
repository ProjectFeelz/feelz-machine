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

  let { user_ids, title, body: msgBody, url = '/', tag = 'feelz', token } = body;
  if (!user_ids?.length || !title) return { statusCode: 400, body: 'user_ids and title required' };

  // ── Two ways in ──────────────────────────────────────────────────────────
  //
  // Only one existed: a shared secret in `x-internal-secret`. That is right
  // for the other functions, which are servers calling a server. It cannot
  // work from a browser — putting INTERNAL_FUNCTION_SECRET in the bundle
  // would hand it to everyone — and the two BROWSER callers
  // (CreateMenuModal.js and ArtistProfilePage.js, both "Message Fans") sent
  //
  //     'x-internal-secret': ''
  //
  // which is the 401 in the console. One of them even carried a comment
  // saying "send-push auth is user-token based". It was not. It is now, and
  // that comment was wrong when it was written — the in-app notification went
  // out and the push never did, every time, since the day it shipped.
  //
  // The user path is deliberately narrower than the internal one: a
  // signed-in ARTIST may push only to people who follow them. A listener
  // cannot push at all, and nobody can push to a list of their choosing —
  // the recipient list is intersected with the caller's real followers
  // server-side, so a tampered request reaches fewer people, never more.
  const secret = event.headers['x-internal-secret'];
  const internalOk = !!secret && secret === process.env.INTERNAL_FUNCTION_SECRET;

  if (!internalOk) {
    if (!token) return { statusCode: 401, body: 'Unauthorized' };

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return { statusCode: 401, body: 'Unauthorized' };

    const { data: artist, error: artistErr } = await supabase
      .from('artists').select('id').eq('user_id', user.id).maybeSingle();
    if (artistErr) {
      console.error('[send-push] artist lookup failed:', artistErr.message);
      return { statusCode: 503, body: 'Could not verify sender' };
    }
    if (!artist) return { statusCode: 403, body: 'Only artists can send push to followers' };

    const { data: follows, error: followErr } = await supabase
      .from('follows').select('follower_id').eq('artist_id', artist.id);
    if (followErr) {
      console.error('[send-push] follower lookup failed:', followErr.message);
      return { statusCode: 503, body: 'Could not resolve followers' };
    }

    const allowed = new Set((follows || []).map(f => f.follower_id));
    user_ids = user_ids.filter(id => allowed.has(id));
    if (!user_ids.length) return { statusCode: 200, body: JSON.stringify({ sent: 0, reason: 'no followers in list' }) };
  }

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