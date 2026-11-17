// netlify/functions/chat-push.js
//
// A phone notification when someone posts in a chat room you are in.
//
// The bell already gets a row for it (the notify_chat_room_members trigger on
// chat_messages). This sends the push, so members hear about it without the
// app open. ChatRoomView calls it after a message is saved.
//
// POST { messageId }   Authorization: Bearer <the sender's access token>
//
// Who gets one: every member of the room except the sender, unless they muted
// the room, muted push in their notification settings, or were already pushed
// about this room and have not opened it since (then one push covers it, for
// up to 30 minutes). Someone @mentioned always gets one.
//
// The notification has tag chat-<room>, so a newer one replaces the older one
// on the phone instead of stacking.

const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const REPEAT_AFTER_MS = 30 * 60 * 1000;
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '').trim();
  if (!token) return json(401, { error: 'unauthorized' });

  let messageId;
  try { messageId = JSON.parse(event.body || '{}').messageId; } catch { return json(400, { error: 'invalid_body' }); }
  if (!messageId) return json(400, { error: 'messageId required' });

  const { data: { user } = {}, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json(401, { error: 'unauthorized' });

  // Only the sender can ask for their own message to be announced, and only
  // while it is fresh, so this cannot be used to push old or other people's text.
  const { data: msg } = await supabase
    .from('chat_messages')
    .select('id, room_id, user_id, content, created_at, is_deleted')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg || msg.user_id !== user.id || msg.is_deleted) return json(404, { error: 'not_found' });
  if (Date.now() - new Date(msg.created_at).getTime() > MAX_MESSAGE_AGE_MS) return json(200, { sent: 0, reason: 'old' });

  const [{ data: room }, { data: artist }, { data: profile }, { data: members }] = await Promise.all([
    supabase.from('chat_rooms').select('id, name').eq('id', msg.room_id).maybeSingle(),
    supabase.from('artists').select('artist_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_profiles').select('name').eq('user_id', user.id).maybeSingle(),
    supabase.from('chat_room_members')
      .select('user_id, last_read_at, last_pushed_at, is_muted, muted_until')
      .eq('room_id', msg.room_id),
  ]);
  if (!room) return json(404, { error: 'room_not_found' });

  const senderName = artist?.artist_name || (profile?.name || '').trim() || 'Someone';
  const now = Date.now();

  // Names that count as an @mention of each member.
  const memberIds = (members || []).map(m => m.user_id).filter(id => id && id !== user.id);
  const { data: memberArtists } = memberIds.length
    ? await supabase.from('artists').select('user_id, artist_name').in('user_id', memberIds)
    : { data: [] };
  const nameOf = new Map((memberArtists || []).map(a => [a.user_id, a.artist_name]));
  const text = (msg.content || '').toLowerCase();

  const candidates = (members || []).filter(m => {
    if (!m.user_id || m.user_id === user.id) return false;
    if (m.is_muted) return false;
    if (m.muted_until && new Date(m.muted_until).getTime() > now) return false;
    const name = nameOf.get(m.user_id);
    if (name && text.includes('@' + name.toLowerCase())) return true;
    if (!m.last_pushed_at) return true;
    const pushed = new Date(m.last_pushed_at).getTime();
    const read = m.last_read_at ? new Date(m.last_read_at).getTime() : 0;
    return read > pushed || now - pushed > REPEAT_AFTER_MS;
  }).map(m => m.user_id);

  if (!candidates.length) return json(200, { sent: 0 });

  // Respect "mute push" and muted categories in notification settings.
  const allowed = [];
  await Promise.all(candidates.map(async (id) => {
    const { data: ok } = await supabase.rpc('notification_allowed', {
      p_user_id: id, p_type: 'chat_message', p_channel: 'push',
    });
    if (ok !== false) allowed.push(id);
  }));
  if (!allowed.length) return json(200, { sent: 0 });

  const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', allowed);
  if (!subs?.length) return json(200, { sent: 0 });

  const body = (msg.content || '').length > 120 ? msg.content.slice(0, 117) + '...' : (msg.content || '');
  const payload = JSON.stringify({
    title: `${senderName} in ${room.name || 'your chat room'}`,
    body,
    url: `/chat/${room.id}`,
    tag: `chat-${room.id}`,
    icon: '/icon-192.png',
  });

  let sent = 0;
  let failed = 0;
  const reached = new Set();
  const expired = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
      reached.add(sub.user_id);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) expired.push(sub.endpoint);
      failed++;
    }
  }));

  if (expired.length) await supabase.from('push_subscriptions').delete().in('endpoint', expired);
  if (reached.size) {
    await supabase.from('chat_room_members')
      .update({ last_pushed_at: new Date().toISOString() })
      .eq('room_id', room.id)
      .in('user_id', Array.from(reached));
  }

  return json(200, { sent, failed });
};
