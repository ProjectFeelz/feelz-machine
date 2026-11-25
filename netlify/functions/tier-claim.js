// netlify/functions/tier-claim.js
//
// "I paid, and nothing happened."
//
// WHAT THIS IS FOR
//
// A card subscription is switched on by paystack-webhook, which runs when
// Paystack tells us the charge succeeded. Until that message arrives the buyer
// is on their old plan. usePaystackReturn now waits about 95 seconds for it,
// which covers a slow message.
//
// It does not cover a message that never arrives. Paystack retries for three
// days, but a webhook that is refused every time - a bad signature after a key
// rotation, a deploy that was down, a function erroring on something unrelated
// - ends with somebody charged and holding nothing. Nobody finds out unless
// they complain. That is the shape of the PayPal capture bug from September.
//
// So the browser stops waiting to be told, and asks instead. It comes back
// from Paystack holding the reference; this takes that reference, asks
// PAYSTACK whether it was paid, and if it was, records the subscription.
//
// WHY THIS DOES NOT TOUCH paystack-webhook.js
//
// Because it does not have to. The recording already lives in a lib - the
// webhook's whole tier branch is verify, check the domain, call
// handleCharge - so this does the same three things by requiring the same lib.
// The money path is not refactored, moved or re-tested. It is reused.
//
// WHY IT IS SAFE TO CALL A SECOND TIME
//
// Four independent reasons, not one:
//
//   1. handleCharge is idempotent on the reference. It looks for an existing
//      row by paystack_reference and only inserts when there is none, because
//      Paystack redelivers and a redelivery must not hand somebody two
//      subscriptions. A claim racing the webhook loses harmlessly.
//   2. Nothing is taken on trust from the caller. The amount, the status and
//      the domain all come from Paystack's own verify response, and
//      handleCharge refuses anything whose tx.status is not 'success'.
//   3. The reference must have an intent row this site wrote. A made-up
//      reference buys nothing, which is the same rule the webhook relies on.
//   4. The intent must belong to the caller, checked below against their own
//      signed-in id rather than anything in the request body. Somebody else's
//      reference claims somebody else's plan onto their own account, otherwise.
//
// WHAT IT DELIBERATELY WILL NOT DO
//
// Grant anything when Paystack says the charge is not successful, and switch
// off the webhook. The webhook stays the primary path: it is the one that
// works when the buyer closes the tab.

const { createClient } = require('@supabase/supabase-js');
const tierSub = require('../lib/tierPaystackSub');

const PAYSTACK_BASE = 'https://api.paystack.co';
const SECRET        = process.env.PAYSTACK_SECRET_KEY;
// Same switch and same spelling as paystack-webhook.js. A test charge costs an
// attacker nothing, because Paystack's test card is public.
const ALLOW_TEST    = process.env.PAYSTACK_ALLOW_TEST === 'true';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Identical to the webhook's helper, on purpose. A claim that verified more
// loosely than the webhook would be a second, weaker door to the same room.
async function verifyTransaction(reference) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.status !== true || !body.data) {
    const err = new Error((body && body.message) || `verify returned ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return body.data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  if (!SECRET) {
    console.error('[tier-claim] PAYSTACK_SECRET_KEY is not set, refusing every claim');
    return json(503, { error: 'not_configured' });
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'Not signed in' });
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json(401, { error: 'Not signed in' });

  let reference;
  try {
    reference = String(JSON.parse(event.body || '{}').reference || '').trim();
  } catch {
    return json(400, { error: 'bad_body' });
  }
  // Bounded before it reaches a URL or a query. Paystack references are short.
  if (!reference || reference.length > 120) return json(400, { error: 'bad_reference' });

  // The prefix only chooses which subject's table and owner column to use. It
  // grants nothing: the intent row below is what decides whether this
  // reference means anything at all.
  const subject = tierSub.SUBJECTS.find(s => reference.startsWith(s.REF_PREFIX));
  if (!subject) return json(400, { error: 'not_a_tier_reference' });

  // ── Is this the caller's own payment? ───────────────────────────────────
  //
  // Read before Paystack is asked anything, so a reference fished from
  // somewhere else costs one cheap query and no API call.
  const { data: intent, error: intentErr } = await admin
    .from('paystack_intents')
    .select('reference, artist_id, user_id, tier_id')
    .eq('reference', reference)
    .maybeSingle();
  if (intentErr) {
    console.error('[tier-claim] intent lookup failed:', intentErr.code, intentErr.message);
    return json(500, { error: 'lookup_failed' });
  }
  if (!intent) return json(404, { error: 'unknown_reference' });

  let mine = false;
  if (subject.ownerCol === 'user_id') {
    mine = intent.user_id === user.id;
  } else {
    // An artist plan belongs to an artist row, and that row belongs to a user.
    // Checked against the signed-in id, never against anything in the body.
    const { data: a } = await admin
      .from('artists').select('id').eq('id', intent.artist_id)
      .eq('user_id', user.id).maybeSingle();
    mine = !!a;
  }
  if (!mine) {
    // 404 rather than 403: whether a reference exists is not the caller's
    // business when it is not theirs.
    console.warn('[tier-claim] reference', reference, 'claimed by a user it does not belong to');
    return json(404, { error: 'unknown_reference' });
  }

  // ── Paystack's own answer ───────────────────────────────────────────────
  let tx;
  try {
    tx = await verifyTransaction(reference);
  } catch (err) {
    console.error('[tier-claim] verify failed for', reference, ':', err.message);
    // Not a refusal of the payment, just no answer yet. The webhook is still
    // the primary path and Paystack is still retrying it.
    return json(502, { error: 'verify_failed', pending: true });
  }

  if (!ALLOW_TEST && tx.domain !== 'live') {
    console.error('[tier-claim] REFUSED a charge on domain', tx.domain, reference);
    return json(400, { error: 'not_live' });
  }

  if (String(tx.status) !== 'success') {
    // Said plainly rather than dressed up: the money has not arrived.
    return json(200, { ok: false, status: tx.status, note: 'not_successful' });
  }

  const out = await subject.handleCharge({ admin, reference, tx });

  if (!out.ok) {
    console.error('[tier-claim]', subject.label, 'handleCharge refused', reference, out.note);
    // retry:true means a transient failure its own side, so tell the browser
    // to keep waiting rather than to tell the buyer anything is wrong.
    return json(out.retry ? 503 : 200, {
      ok: false, note: out.note || 'not_recorded', pending: !!out.retry,
    });
  }

  console.log('[tier-claim]', subject.label, 'claimed', reference, out.note || '');
  return json(200, { ok: true, subject: subject.label, note: out.note || 'recorded' });
};
