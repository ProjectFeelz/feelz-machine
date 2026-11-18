// netlify/functions/cf-live.js
//
// Direct streaming through Cloudflare Stream. OBS streams to Cloudflare,
// Feelz Machine plays it, Cloudflare records it for the replay and can copy
// it to YouTube and other platforms at the same time.
//
// Off until these are set in Netlify (Site configuration, Environment
// variables). They stay on the server; nothing here reaches a browser:
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_STREAM_API_TOKEN       (an API token with Stream edit access)
//   CLOUDFLARE_STREAM_CUSTOMER_CODE   (the xxxx in customer-xxxx.cloudflarestream.com)
//
// Who may stream direct (Cloudflare bills for minutes watched and stored):
//   CF_DIRECT_HOSTS          'admins' (default), 'premium' (admins and Premium
//                            artists) or 'all'. Everyone else streams through
//                            YouTube, which costs nothing.
//   CF_ARTIST_RECORDING_DAYS  how long recordings of artists' streams are kept,
//                            30 to 1096 days (default 60). Admins' are kept.
//
// Actions:
//   GET  ?action=config                  anyone   { configured, customerCode }
//   GET  ?action=status&session=<id>     anyone   { live, hls, thumbnail }
//   GET  ?action=replay&session=<id>     anyone   { ready, hls, thumbnail }
//   POST { action: 'can', token }        anyone   { allowed } may this person stream direct
//   POST { action: 'setup', token }      artist   their OBS server and stream key
//   POST { action: 'outputs', token, op: 'list' | 'add' | 'remove', url, streamKey, outputUid }
//                                        artist   copies of the stream to other platforms

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_STREAM_API_TOKEN;
const CODE = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
const configured = () => !!(ACCOUNT && TOKEN && CODE);

// The two *_BASE settings exist only for tests; leave them unset.
const API = () => `${process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4'}/accounts/${ACCOUNT}/stream`;
const media = (uid) => process.env.CLOUDFLARE_MEDIA_BASE
  ? `${process.env.CLOUDFLARE_MEDIA_BASE}/${uid}`
  : `https://customer-${CODE}.cloudflarestream.com/${uid}`;
const hls = (uid) => `${media(uid)}/manifest/video.m3u8`;
const thumbnail = (uid) => `${media(uid)}/thumbnails/thumbnail.jpg`;

const json = (statusCode, body, cache) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...(cache ? { 'Cache-Control': cache } : {}) },
  body: JSON.stringify(body),
});

async function cf(path, init = {}) {
  const res = await fetch(`${API()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const msg = (body.errors || []).map(e => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`Cloudflare: ${msg}`);
  }
  return body.result;
}

async function artistFor(token) {
  if (!token) return null;
  const { data: { user } = {} } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: artist } = await supabase.from('artists').select('id, user_id, artist_name').eq('user_id', user.id).maybeSingle();
  return artist || null;
}

async function isAdmin(userId) {
  const { data } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}

/** Whether this artist may stream direct, by CF_DIRECT_HOSTS. */
async function canHost(artist) {
  const mode = (process.env.CF_DIRECT_HOSTS || 'admins').toLowerCase();
  if (mode === 'all') return true;
  if (await isAdmin(artist.user_id)) return true;
  if (mode === 'premium') {
    const { data } = await supabase.from('artists').select('tier').eq('id', artist.id).maybeSingle();
    return data?.tier === 'premium';
  }
  return false;
}

/** The artist's live input, made the first time they ask. */
async function liveInputFor(artist) {
  const { data: row } = await supabase.from('artist_live_inputs').select('cf_uid').eq('artist_id', artist.id).maybeSingle();
  if (row?.cf_uid) {
    try { return await cf(`/live_inputs/${row.cf_uid}`); }
    catch (e) { console.warn('[cf-live] stored input missing, making a new one:', e.message); }
  }
  const input = await cf('/live_inputs', {
    method: 'POST',
    body: JSON.stringify({
      meta: { name: `${artist.artist_name} (Feelz Machine)`, artist_id: artist.id },
      recording: { mode: 'automatic' },
      // Artists' recordings are removed after a while to keep storage costs
      // down; the platform's own shows are kept.
      ...(await isAdmin(artist.user_id)
        ? {}
        : { deleteRecordingAfterDays: Math.min(1096, Math.max(30, Number(process.env.CF_ARTIST_RECORDING_DAYS) || 60)) }),
    }),
  });
  await supabase.from('artist_live_inputs').upsert({ artist_id: artist.id, cf_uid: input.uid }, { onConflict: 'artist_id' });
  return input;
}

async function sessionRow(id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from('listening_sessions')
    .select('id, status, mode, cf_live_uid, cf_replay_uid, started_at, ended_at').eq('id', id).maybeSingle();
  return data;
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  let body = {};
  if (event.httpMethod === 'POST') {
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  }
  const action = q.action || body.action;

  if (action === 'config') {
    return json(200, { configured: configured(), customerCode: configured() ? CODE : null }, 'public, max-age=300');
  }
  if (!configured()) return json(200, { configured: false });

  try {
    // ── Is the direct stream on air? ──────────────────────────────────────
    if (action === 'status') {
      const s = await sessionRow(q.session);
      if (!s?.cf_live_uid) return json(404, { error: 'not a direct stream' });
      const res = await fetch(`${media(s.cf_live_uid)}/lifecycle`);
      const life = await res.json().catch(() => ({}));
      return json(200, { live: !!life.live, hls: hls(s.cf_live_uid), thumbnail: life.videoUID ? thumbnail(life.videoUID) : null }, 'public, max-age=5');
    }

    // ── The recording of an ended direct stream ───────────────────────────
    if (action === 'replay') {
      const s = await sessionRow(q.session);
      if (!s?.cf_live_uid) return json(404, { error: 'not a direct stream' });
      if (s.cf_replay_uid) return json(200, { ready: true, hls: hls(s.cf_replay_uid), thumbnail: thumbnail(s.cf_replay_uid) }, 'public, max-age=300');
      if (s.status !== 'ended') return json(200, { ready: false });

      // The recording made between this stream's start and end.
      const videos = await cf(`/live_inputs/${s.cf_live_uid}/videos`);
      const from = new Date(s.started_at || 0).getTime() - 10 * 60000;
      const to = new Date(s.ended_at || Date.now()).getTime() + 10 * 60000;
      const match = (videos || [])
        .filter(v => { const t = new Date(v.created).getTime(); return t >= from && t <= to; })
        .sort((a, b) => new Date(b.created) - new Date(a.created))[0];
      if (!match) return json(200, { ready: false });
      const ready = match.readyToStream || match.status?.state === 'ready';
      if (ready) await supabase.from('listening_sessions').update({ cf_replay_uid: match.uid }).eq('id', s.id);
      return json(200, { ready: !!ready, hls: hls(match.uid), thumbnail: thumbnail(match.uid) });
    }

    // ── Host only from here ───────────────────────────────────────────────
    const artist = await artistFor(body.token);
    if (action === 'can') return json(200, { allowed: !!artist && await canHost(artist) });
    if (!artist) return json(401, { error: 'Sign in as an artist' });
    if (!(await canHost(artist))) return json(403, { error: 'Direct streaming is not available on your account yet. Stream through YouTube instead.' });

    if (action === 'setup') {
      const input = await liveInputFor(artist);
      return json(200, {
        configured: true,
        uid: input.uid,
        rtmps: { url: input.rtmps?.url, streamKey: input.rtmps?.streamKey },
        srt: input.srt ? { url: input.srt.url, streamId: input.srt.streamId, passphrase: input.srt.passphrase } : null,
      });
    }

    if (action === 'outputs') {
      const input = await liveInputFor(artist);
      const base = `/live_inputs/${input.uid}/outputs`;
      if (body.op === 'add') {
        if (!/^rtmps?:\/\//i.test(body.url || '') || !body.streamKey) return json(400, { error: 'Server URL and stream key needed' });
        await cf(base, { method: 'POST', body: JSON.stringify({ url: body.url.trim(), streamKey: body.streamKey.trim(), enabled: true }) });
      } else if (body.op === 'remove') {
        if (!/^[0-9a-f]{32}$/i.test(body.outputUid || '')) return json(400, { error: 'Which output?' });
        await cf(`${base}/${body.outputUid}`, { method: 'DELETE' });
      }
      const list = await cf(base);
      // Keys are not sent back, only where each copy goes.
      return json(200, { outputs: (list || []).map(o => ({ uid: o.uid, url: o.url, enabled: o.enabled !== false })) });
    }

    return json(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[cf-live]', action, e.message);
    return json(502, { error: 'Cloudflare did not answer. Try again in a moment.' });
  }
};
