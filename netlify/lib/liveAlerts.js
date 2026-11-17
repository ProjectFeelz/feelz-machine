// netlify/lib/liveAlerts.js
//
// Who hears about a live stream, and how. Used by notify-session-live.js
// (scheduled, and going live) and session-reminders.js (15 minutes before).
//
// Who:
//   - A stream hosted by a platform admin's artist account goes to everyone
//     on Feelz Machine. These are the platform's own shows.
//   - Anyone else's stream goes to their followers.
//   - Anyone who tapped "Remind me" on it, always.
// Each person gets one bell notification and, if they allow phone
// notifications for live streams, one push.

const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const PAGE = 1000;

async function allRows(supabase, table, column, apply) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(column).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function isPlatformHost(supabase, artist) {
  if (!artist?.user_id) return false;
  const { data } = await supabase.from('admins').select('user_id').eq('user_id', artist.user_id).maybeSingle();
  return !!data;
}

/** The people to tell about this stream, never including the host. */
async function recipientsFor(supabase, session, artist) {
  const ids = new Set();
  const everyone = await isPlatformHost(supabase, artist);
  if (everyone) {
    (await allRows(supabase, 'user_profiles', 'user_id')).forEach(r => r.user_id && ids.add(r.user_id));
  } else {
    (await allRows(supabase, 'follows', 'follower_id', q => q.eq('artist_id', artist.id))).forEach(r => ids.add(r.follower_id));
    (await allRows(supabase, 'artist_alerts', 'user_id', q => q.eq('artist_id', artist.id))).forEach(r => ids.add(r.user_id));
  }
  (await allRows(supabase, 'session_reminders', 'user_id', q => q.eq('session_id', session.id))).forEach(r => ids.add(r.user_id));
  ids.delete(artist.user_id);
  return { userIds: [...ids], everyone };
}

/** Whether this exact alert already went out, so a retry or double tap sends nothing twice. */
async function alreadySent(supabase, sessionId, kind) {
  const { data } = await supabase.from('notifications').select('id')
    .eq('type', 'session_live')
    .contains('metadata', { session_id: sessionId, kind })
    .limit(1);
  return !!(data && data.length);
}

async function notifyInApp(supabase, userIds, row) {
  let inserted = 0;
  for (let i = 0; i < userIds.length; i += 500) {
    const batch = userIds.slice(i, i + 500).map(uid => ({ ...row, user_id: uid }));
    const { error } = await supabase.from('notifications').insert(batch);
    if (error) console.error('[live-alerts] notification batch failed:', error.message);
    else inserted += batch.length;
  }
  return inserted;
}

async function pushTo(supabase, userIds, payload) {
  if (!userIds.length) return { sent: 0 };
  const want = new Set(userIds);
  const subs = (await allRows(supabase, 'push_subscriptions', 'user_id, endpoint, p256dh, auth'))
    .filter(s => want.has(s.user_id));
  if (!subs.length) return { sent: 0 };

  // Respect "mute push" and muted categories in notification settings.
  const people = [...new Set(subs.map(s => s.user_id))];
  const allowed = new Set();
  for (let i = 0; i < people.length; i += 50) {
    await Promise.all(people.slice(i, i + 50).map(async (id) => {
      const { data: ok } = await supabase.rpc('notification_allowed', { p_user_id: id, p_type: 'session_live', p_channel: 'push' });
      if (ok !== false) allowed.add(id);
    }));
  }

  const body = JSON.stringify({ icon: '/icon-192.png', ...payload });
  let sent = 0;
  const expired = [];
  const list = subs.filter(s => allowed.has(s.user_id));
  for (let i = 0; i < list.length; i += 50) {
    await Promise.all(list.slice(i, i + 50).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        sent++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) expired.push(s.endpoint);
      }
    }));
  }
  if (expired.length) await supabase.from('push_subscriptions').delete().in('endpoint', expired);
  return { sent };
}

/** "Fri 21 Nov, 20:00" in South African time. */
function whenText(iso) {
  return new Date(iso).toLocaleString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Africa/Johannesburg',
  }) + ' SAST';
}

module.exports = { recipientsFor, alreadySent, notifyInApp, pushTo, whenText };
