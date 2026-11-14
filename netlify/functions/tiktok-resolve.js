// netlify/functions/tiktok-resolve.js
//
// Turn a vm.tiktok.com short link into a video id, once, and remember it.
//
// WHY THIS EXISTS
//
// Every Sessions entry carries a TikTok link, because the entry form demands
// one. Almost none of them can be embedded: of the first 14 entries, 13 were
// vm.tiktok.com short links. That is not carelessness, it is what TikTok's
// share sheet gives you on a phone, and a phone is where these are recorded.
//
// A short link is a redirect. The video id only exists in the Location header
// of the response, and a browser cannot read that cross origin. So it is read
// here, written to school_sessions_entries.tiktok_video_id, and never looked
// up again.
//
// WHAT IT WILL NOT DO
//
// It does not touch tiktok_video_url. Whatever the entrant pasted stays as
// they pasted it, because that is the thing they can check against their own
// TikTok. tiktok_video_id is derived: set it to null and this rebuilds it.
//
// It resolves only rows that have a URL and no id yet, so calling it twice
// costs one database query and nothing else.

const { createClient } = require('@supabase/supabase-js');

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// A long link already carries the id. Checked first so a season where people
// paste proper links never makes a single outbound request.
const LONG = /tiktok\.com\/(?:@[^/]+\/)?(?:video|photo)\/(\d{6,})/i;

// How many redirects to follow before giving up. vm.tiktok.com is normally
// one hop. More than three means something has changed and chasing it further
// is how a function ends up looping on somebody else's server.
const MAX_HOPS = 3;

// TikTok answers short links differently depending on who is asking. With no
// user agent at all some hosts return a 403 rather than a redirect, so this
// says plainly what it is instead of pretending to be a browser.
const UA = 'FeelzMachineBot/1.0 (+https://www.feelzmachine.com)';

async function resolveId(url) {
  const direct = String(url).match(LONG);
  if (direct) return direct[1];

  let current = url;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    let res;
    try {
      res = await fetch(current, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': UA },
      });
    } catch (e) {
      console.warn('[tiktok-resolve] fetch failed', e.message);
      return null;
    }

    const next = res.headers.get('location');
    if (!next) {
      // No redirect left to follow. Either we have arrived, or this was never
      // a short link.
      const m = String(current).match(LONG);
      return m ? m[1] : null;
    }

    const m = String(next).match(LONG);
    if (m) return m[1];

    // Relative redirects are legal and do happen.
    current = next.startsWith('http') ? next : new URL(next, current).toString();
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }

  let competitionId = null;
  try {
    const body = JSON.parse(event.body || '{}');
    competitionId = body.competitionId || null;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_body' }) };
  }

  if (!competitionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'competitionId is required' }) };
  }

  // Only rows that need it. This is the whole reason the result is stored:
  // the second call does this query, finds nothing, and returns.
  let query = admin
    .from('school_sessions_entries')
    .select('id, tiktok_video_url')
    .eq('competition_id', competitionId)
    .is('tiktok_video_id', null)
    .not('tiktok_video_url', 'is', null)
    .limit(25);

  const { data: rows, error } = await query;
  if (error) {
    console.error('[tiktok-resolve] lookup failed:', error.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'lookup_failed' }) };
  }

  if (!rows || rows.length === 0) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ resolved: {}, done: true, checked: 0 }),
    };
  }

  const resolved = {};
  // Sequential on purpose. Twenty five parallel requests to the same host is
  // what rate limiting is for, and this runs once per season in practice.
  for (const row of rows) {
    const id = await resolveId(row.tiktok_video_url);
    if (!id) continue;
    const { error: upErr } = await admin
      .from('school_sessions_entries')
      .update({ tiktok_video_id: id })
      .eq('id', row.id);
    if (upErr) {
      console.error('[tiktok-resolve] write failed for', row.id, upErr.message);
      continue;
    }
    resolved[row.id] = id;
  }

  console.log(`[tiktok-resolve] checked ${rows.length}, resolved ${Object.keys(resolved).length}`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({
      resolved,
      checked: rows.length,
      // The caller asks again if this is false, because the cap is 25 a call.
      done: rows.length < 25,
    }),
  };
};
