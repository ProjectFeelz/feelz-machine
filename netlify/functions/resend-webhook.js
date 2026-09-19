// netlify/functions/resend-webhook.js
//
// Bounces and spam complaints, which nothing has been listening for.
//
// Feelz Machine sends through Resend and consumes none of the result. Grep the
// repo for "bounce" before this file and every hit is about listening
// behaviour. So an address that does not exist is mailed again next week, and
// the week after; and somebody who hits "report spam" in Gmail is never told
// about and keeps being mailed, which is the fastest way there is to lose a
// sending domain for everybody else on it.
//
// Point a Resend webhook at this function and both stop being invisible.
//
//
// SIGNATURE VERIFICATION IS NOT OPTIONAL HERE
//
// This endpoint takes an address and stops mail going to it. Unverified, it is
// a way for anyone on the internet to unsubscribe any address they can guess —
// quieter and more damaging than defacing something, because nobody notices
// until an artist asks why their list stopped growing.
//
// Resend signs with Svix. Verified against Svix's own documentation rather
// than from memory:
//
//   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
//   key            = base64 decode of the part after `whsec_`
//   algorithm      = HMAC SHA-256, compared base64
//   header         = space delimited `v1,<sig>` pairs, any one may match
//
// The RAW body matters. Parse it and re-stringify it and the signature fails,
// because key order and whitespace are not preserved.
//
//
// WHAT THIS DELIBERATELY DOES NOT DO YET, AND WHY
//
// A complaint is unambiguous: the event type itself carries the meaning, so
// `email.complained` suppresses, full stop.
//
// A bounce is not. Only a PERMANENT bounce should suppress — a full mailbox or
// a greylisting is temporary, and suppressing on one loses a real subscriber
// over a bad afternoon. I could not verify the exact shape of Resend's bounce
// payload (their docs delegate the detail, and I could not reach the page), so
// this checks the field names that are plausible, acts when one of them
// clearly says permanent, and REFUSES TO ACT when none of them is present —
// logging the whole payload instead, loudly, so the real shape can be read off
// one log line and this function finished properly.
//
// Guessing the field name would mean either suppressing transient bounces or
// silently ignoring permanent ones, and both of those fail quietly. An
// unrecognised payload that says so in the log does not.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Svix's own recommended tolerance. Older than this and it is a replay.
const TOLERANCE_SECONDS = 5 * 60;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function verify(rawBody, headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) throw new Error('RESEND_WEBHOOK_SECRET is not set');

  // Netlify lower-cases header names, but not every proxy in front of it does.
  const h = (name) => headers[name] || headers[name.toLowerCase()] || '';
  const id        = h('svix-id');
  const timestamp = h('svix-timestamp');
  const signature = h('svix-signature');

  if (!id || !timestamp || !signature) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // The header carries a space delimited list; any version may match.
  return signature.split(' ').some((part) => {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    if (!sig || sig.length !== expected.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

/**
 * Is this bounce permanent?
 *
 * Returns true, false, or null for "the payload did not say in any shape I
 * recognise". Null is the important one: it is the difference between a
 * decision and a guess, and the caller treats it as "do nothing, say so".
 */
function isPermanentBounce(data) {
  const candidates = [
    data?.bounce?.type,
    data?.bounce?.bounceType,
    data?.bounce_type,
    data?.type,
    data?.severity,
  ].filter((v) => typeof v === 'string');

  if (!candidates.length) return null;

  const v = candidates[0].toLowerCase();
  if (v.includes('permanent') || v === 'hard') return true;
  if (v.includes('transient') || v.includes('temporary') || v === 'soft') return false;
  if (v.includes('undetermined')) return false;   // err towards keeping them
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Netlify may hand the body back base64 encoded. The signature is over the
  // raw bytes, so decode before verifying rather than after.
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  let ok = false;
  try {
    ok = verify(rawBody, event.headers || {});
  } catch (err) {
    console.error('[resend-webhook] cannot verify:', err.message);
    return json(500, { error: 'not_configured' });
  }
  if (!ok) {
    console.warn('[resend-webhook] rejected an unverified request');
    return json(401, { error: 'bad_signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const type = payload?.type;
  const data = payload?.data || {};

  // Resend sends `to` as an array. One event can cover several recipients.
  const recipients = []
    .concat(data.to || data.email || [])
    .filter((v) => typeof v === 'string' && v.includes('@'))
    .map((v) => v.trim().toLowerCase());

  if (!recipients.length) {
    console.warn('[resend-webhook]', type, 'carried no usable address');
    return json(200, { ok: true, noted: 'no_recipient' });
  }

  let reason = null;
  let detail = null;

  if (type === 'email.complained') {
    // Unambiguous, and the one that actually costs you the domain. Somebody
    // who reaches for the spam button rather than the unsubscribe link is also
    // telling you the link was not obvious enough, which is worth knowing
    // separately from an ordinary opt-out.
    reason = 'complaint';
    detail = 'marked as spam by the recipient';
  } else if (type === 'email.bounced') {
    const permanent = isPermanentBounce(data);

    if (permanent === true) {
      reason = 'hard_bounce';
      detail = JSON.stringify(data.bounce || data).slice(0, 500);
    } else if (permanent === false) {
      console.log('[resend-webhook] transient bounce, not suppressing:', recipients.join(', '));
      return json(200, { ok: true, noted: 'transient_bounce' });
    } else {
      // The honest branch. Nothing is suppressed on a payload whose shape was
      // not confirmed — send me this log line and I will finish the mapping.
      console.error(
        '[resend-webhook] UNRECOGNISED BOUNCE SHAPE — nothing suppressed. ' +
        'Full payload follows so the permanence field can be identified:',
        JSON.stringify(payload).slice(0, 2000)
      );
      return json(200, { ok: true, noted: 'unrecognised_bounce_shape' });
    }
  } else {
    // delivered, sent, opened, clicked, delivery_delayed. Acknowledged so
    // Resend stops retrying, and otherwise ignored.
    return json(200, { ok: true, ignored: type });
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const rows = recipients.map((email) => ({
    email,
    reason,
    detail,
    provider_id: data.email_id || payload.data?.email_id || null,
  }));

  // The unique index is on lower(trim(email)), so a second report for the same
  // address is a no-op rather than an error. A mailbox that bounces every week
  // should not fill the table with a row per week.
  const { error } = await admin
    .from('email_suppressions')
    .upsert(rows, { onConflict: 'email', ignoreDuplicates: true });

  if (error) {
    // 500 on purpose: Resend retries, and a suppression that failed to write
    // is one we want to see again rather than lose.
    console.error('[resend-webhook] suppression write failed:', error.code, error.message);
    return json(500, { error: 'write_failed' });
  }

  console.log(`[resend-webhook] suppressed ${rows.length} address(es) as ${reason}`);
  return json(200, { ok: true, suppressed: rows.length, reason });
};