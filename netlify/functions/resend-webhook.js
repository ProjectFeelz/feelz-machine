// netlify/functions/resend-webhook.js
//
// Resend tells us when an address goes bad. This is the ear.
//
//
// WHY IT MATTERS MORE THAN IT LOOKS
//
// email_suppressions has been read on every send since the billing queue went
// in — four reasons, all four respected — and it has had zero rows in it since
// the day it was created, because nothing on the platform has ever written to
// it. The list was a door with no one on the other side.
//
// That is not a tidiness problem. A sending domain's reputation is scored on
// how often it is handed an address that does not exist, and on how often a
// human presses "this is spam". Keep mailing a dead address and the mailbox
// providers stop trusting the domain; the next password reset for somebody
// real is the one that lands in spam. The suppression list is how a platform
// stops doing that, and it only works if something fills it in.
//
//
// WHAT IT WRITES, AND WHAT IT DELIBERATELY DOES NOT
//
//   email.bounced     -> hard_bounce, but only when Resend says the bounce was
//                        permanent. A soft bounce is a full mailbox or a
//                        greylisting server: the address is fine and will work
//                        tomorrow, and suppressing it would be the platform
//                        punishing someone for going on holiday.
//   email.complained  -> complaint. Someone pressed the spam button. That is
//                        final and is never second-guessed, whatever the
//                        message was.
//   email.failed      -> invalid, when the reason reads like a bad address.
//
// Deliveries, opens and clicks are acknowledged and dropped. They are not this
// function's business and storing them would mean building an analytics table
// nobody asked for.
//
//
// THREE REFUSALS BEFORE IT TRUSTS ANYTHING
//
// Resend signs with Svix. The signature covers the id, the timestamp and the
// exact bytes of the body, so:
//
//   1. the timestamp must be inside five minutes, which stops a captured
//      request being replayed back at us next week,
//   2. the signature must verify against the raw body, compared in constant
//      time, and
//   3. the event has to be one of the three kinds above, read from fields
//      Resend defines rather than anything free-text in the payload.
//
// Nothing in the body is used to decide whether the body is trustworthy.
//
//
// IT IS SAFE TO DELIVER TWICE
//
// Svix retries for days on any non-2xx. email_suppressions has a unique index
// on lower(trim(email)), so the second delivery of the same bounce collides
// and is turned into an update rather than a second row. The handler returns
// 200 for anything it understood, including a repeat, so Resend stops asking.
// It returns 500 only when the database is the thing that failed, which is the
// one case where being asked again actually helps.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Svix's own tolerance. A replay of a request older than this is refused even
// if the signature is perfect.
const TOLERANCE_SECONDS = 5 * 60;

const ok   = (body) => ({ statusCode: 200, body: JSON.stringify(body) });
const deny = (why)  => ({ statusCode: 401, body: JSON.stringify({ error: why }) });

/**
 * Verify a Svix signature over the raw request body.
 *
 * The secret arrives as `whsec_<base64>`. The prefix is a label, not part of
 * the key: the bytes that sign are the base64 after it. Getting that wrong
 * produces a function that rejects every genuine delivery and looks, from the
 * outside, exactly like a misconfigured endpoint.
 */
function signatureIsGood(headers, rawBody) {
  const id        = headers['svix-id']        || headers['webhook-id'];
  const timestamp = headers['svix-timestamp'] || headers['webhook-timestamp'];
  const signature = headers['svix-signature'] || headers['webhook-signature'];
  const secret    = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET is not set; refusing everything.');
    return { good: false, why: 'not_configured' };
  }
  if (!id || !timestamp || !signature) return { good: false, why: 'missing_signature_headers' };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return { good: false, why: 'timestamp_outside_tolerance' };
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // The header can carry several versioned signatures, space separated, as
  // "v1,<sig> v1,<sig>". Any one matching is a pass: that is how Svix rolls a
  // secret without dropping deliveries mid-rotation.
  const offered = String(signature).split(' ')
    .map(part => part.split(',')[1])
    .filter(Boolean);

  const expectedBuf = Buffer.from(expected);
  const good = offered.some((candidate) => {
    const buf = Buffer.from(candidate);
    // timingSafeEqual throws on a length mismatch, so the length is checked
    // first and a wrong-length signature simply fails.
    return buf.length === expectedBuf.length && crypto.timingSafeEqual(buf, expectedBuf);
  });

  return good ? { good: true } : { good: false, why: 'bad_signature' };
}

/**
 * Decide what, if anything, this event means for an address.
 * Returns null for everything that is not a reason to stop writing to someone.
 */
function classify(type, data) {
  const bounce = data?.bounce || {};
  // Resend reports the class as "Permanent" or "Transient", and older payloads
  // carry it on bounce.type instead. Both are read; anything else is treated
  // as transient, because the failure mode of guessing wrong in that direction
  // is one undelivered email, and in the other direction it is a real person
  // silently cut off from the platform's mail for good.
  const severity = String(bounce.type || bounce.subType || data?.type || '').toLowerCase();

  if (type === 'email.bounced') {
    if (severity.includes('permanent') || severity.includes('hard')) {
      return { reason: 'hard_bounce', detail: bounce.message || bounce.subType || 'permanent bounce' };
    }
    return null;
  }

  if (type === 'email.complained') {
    return { reason: 'complaint', detail: 'marked as spam by the recipient' };
  }

  if (type === 'email.failed') {
    const why = String(data?.failed?.reason || data?.reason || '').toLowerCase();
    if (why.includes('invalid') || why.includes('does not exist') || why.includes('no such')) {
      return { reason: 'invalid', detail: data?.failed?.reason || data?.reason || 'invalid recipient' };
    }
    return null;
  }

  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // The signature is over the bytes that were sent. Netlify base64-encodes a
  // body it thinks is binary, and decoding it after hashing — or hashing the
  // re-serialised JSON — gives a different string and a signature that never
  // matches.
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );

  const check = signatureIsGood(headers, rawBody);
  if (!check.good) {
    console.warn('[resend-webhook] refused:', check.why);
    return deny(check.why);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signed and unreadable should never happen, and retrying will not change
    // it, so this is a 200 with a complaint in the log rather than a loop.
    console.error('[resend-webhook] signed body was not JSON');
    return ok({ ignored: 'unparseable' });
  }

  const type = payload?.type;
  const data = payload?.data || {};
  const verdict = classify(type, data);

  if (!verdict) {
    // Delivered, opened, clicked, delivery_delayed, a soft bounce. All fine,
    // none of them ours.
    return ok({ ignored: type || 'unknown' });
  }

  // `to` is an array on Resend's payloads. One bad address in a message sent
  // to several should suppress that address and leave the others alone, so
  // every recipient on the event is written.
  const recipients = []
    .concat(data.to || [])
    .concat(data.email ? [data.email] : [])
    .map(a => String(a || '').trim().toLowerCase())
    .filter(a => a.includes('@'));

  if (!recipients.length) {
    console.warn('[resend-webhook]', type, 'carried no recipient address');
    return ok({ ignored: 'no_recipient' });
  }

  let written = 0;
  for (const email of recipients) {
    const row = {
      email,
      reason: verdict.reason,
      detail: String(verdict.detail || '').slice(0, 500),
      provider_id: data.email_id || payload.id || null,
    };

    const { error } = await supabase.from('email_suppressions').insert(row);

    if (!error) { written++; continue; }

    if (error.code === '23505') {
      // Already on the list. Keep the newest reason and detail: an address
      // that hard bounced and then had a complaint filed should read as the
      // complaint, and a redelivery of the same event is a harmless no-op.
      const { error: updErr } = await supabase
        .from('email_suppressions')
        .update({ reason: row.reason, detail: row.detail, provider_id: row.provider_id })
        .eq('email', email);
      if (updErr) {
        console.error('[resend-webhook] could not refresh existing suppression:', updErr.code, updErr.message);
        return { statusCode: 500, body: JSON.stringify({ error: updErr.message }) };
      }
      written++;
      continue;
    }

    console.error('[resend-webhook] could not record suppression:', error.code, error.message);
    // A 500 asks Svix to try again, which is the right answer when the
    // database is what failed.
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  console.log('[resend-webhook]', JSON.stringify({
    type,
    reason: verdict.reason,
    recipients: recipients.length,
    written,
  }));

  return ok({ received: true, type, reason: verdict.reason, suppressed: written });
};