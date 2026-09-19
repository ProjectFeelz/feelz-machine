// netlify/lib/unsubscribeToken.js
//
// A signed, self-contained unsubscribe token.
//
//
// WHY THIS EXISTS
//
// Feelz Machine opts people in by default and lets them opt out. That is a
// lawful arrangement — POPIA section 69 permits it for people you already have
// a relationship with — but it is lawful CONDITIONALLY, and one of the
// conditions is that objecting must be possible "free of charge and without
// unnecessary effort", at the time the details are collected AND in every
// message sent afterwards.
//
// Every newsletter already carried an unsubscribe link. It pointed at
// /contact-preferences, which requires a sign-in. So the only way out of the
// mail was to remember a password — which is exactly the "unnecessary effort"
// the section is about, and it is the difference between a defensible opt-out
// regime and an indefensible one. It also meant the sender could not honestly
// claim List-Unsubscribe-Post, because a one-click header must resolve without
// authentication (see the note in netlify/lib/email.js).
//
// This token closes that. It is signed rather than stored, so:
//
//   * there is no table to keep, expire or clean up;
//   * a link cannot be guessed, because forging one needs the secret;
//   * the address is inside the payload rather than in a readable query
//     parameter, so it does not appear as plain text in access logs, referer
//     headers or a shoulder-glance at the address bar.
//
// Be accurate about that last one: the payload is base64, NOT encryption.
// Anyone holding the link can decode the address from it. What the signature
// buys is that they cannot MINT one for a different address, and what the
// encoding buys is that the address is not lying around in plain text. The
// link is only ever sent to that address, which is the same assumption every
// unsubscribe link on the internet makes.
//
//
// WHAT IT DELIBERATELY DOES NOT DO
//
// No expiry. An unsubscribe link in a two-year-old email must still work —
// that is the whole point of it, and an expired one puts the person back to
// needing a password. The token stays valid until the secret is rotated, and
// rotating the secret is therefore a decision about old mail, not just about
// keys.
//
// The scope is either the platform or one artist. It is never "everything for
// everyone", so a leaked token cannot be replayed against another address.

const crypto = require('crypto');

function secret() {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.INTERNAL_FUNCTION_SECRET;
  if (!s) {
    // Loud rather than silently issuing tokens signed with "undefined", which
    // would verify against each other and look like it worked.
    throw new Error(
      'UNSUBSCRIBE_SECRET (or INTERNAL_FUNCTION_SECRET) is not set — refusing to sign an unsubscribe token'
    );
  }
  return s;
}

const b64u = {
  encode: (buf) => Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: (str) => Buffer.from(String(str).replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
};

function sign(payloadB64) {
  return b64u.encode(
    crypto.createHmac('sha256', secret()).update(payloadB64).digest()
  );
}

/**
 * scope is 'platform' or `artist:<uuid>`.
 * Returns the opaque token that goes in the link.
 */
function makeToken(email, scope) {
  const payload = b64u.encode(JSON.stringify({
    e: String(email || '').trim().toLowerCase(),
    s: scope || 'platform',
    v: 1,
  }));
  return `${payload}.${sign(payload)}`;
}

/**
 * Returns { email, scope } or null. Never throws on malformed input: a broken
 * link is a 400 page, not a 500.
 */
function readToken(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;

    const expected = sign(payload);
    // Length check first: timingSafeEqual throws on a length mismatch, and
    // comparing lengths is not the secret anyway.
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

    const data = JSON.parse(b64u.decode(payload).toString('utf8'));
    if (!data?.e) return null;
    return { email: String(data.e).toLowerCase(), scope: data.s || 'platform' };
  } catch {
    return null;
  }
}

function unsubscribeUrl(siteUrl, email, scope) {
  return `${String(siteUrl).replace(/\/$/, '')}/.netlify/functions/unsubscribe`
       + `?t=${encodeURIComponent(makeToken(email, scope))}`;
}

module.exports = { makeToken, readToken, unsubscribeUrl };