// netlify/functions/paypal-webhook.js
// Verifies PayPal webhook signature and handles all relevant events.
//
//
// WHAT THIS FILE LOOKED LIKE IT DID, AND DID NOT
//
// The handlers below were correct and most of them had never run. The webhook
// was subscribed in PayPal to eight BILLING.SUBSCRIPTION.* events and not one
// payment event, so PAYMENT.SALE.COMPLETED was never delivered. That is the
// block holding the renewal extenders, the affiliate commission and the retail
// payment ledger. The result: no subscription ever renewed, no affiliate was
// ever paid, and no refund was ever processed, with nothing in any log to say
// so, because code that is never called does not fail.
//
// The subscription events are fixed in PayPal, not here. What IS fixed here is
// everything that was missing once those events start arriving.
//
//
// THE THREE GAPS THIS FILE NOW CLOSES
//
// 1. Artist and listener payments were never recorded. recordRetailPayment
//    gives venues gross, fee and net keyed on PayPal's sale id. The other two
//    audiences had nothing, and amount_paid on the subscription row was
//    written by no code anywhere, which is why the platform's first real
//    subscription ran for a month and left no record of the money.
//
// 2. A failed payment on an artist or listener subscription did nothing at
//    all. That block touched add-ons and retail only. The artist was not told,
//    not marked, and the nightly expiry sweep moved them to Free the same
//    night while PayPal was still retrying the card.
//
// 3. The first payment told nobody. The welcome receipt was written in the
//    browser by the upgrade page, so it existed only if the buyer's tab
//    survived the round trip back from PayPal.

const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { reportNotify } = require('../lib/notify');
const paypalEnv = require('../lib/paypal-env');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// How long a subscriber keeps their plan after a payment fails, when PayPal
// does not tell us its own retry date. PayPal retries for roughly five days
// before suspending the agreement; six gives the last attempt room to land.
const RETRY_GRACE_DAYS = 6;

async function getPayPalToken() {
  const base = paypalEnv.hostApi;   // see netlify/lib/paypal-env.js
  // Fixed: standardised on PAYPAL_CLIENT_SECRET across all functions
  const creds = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  return new Promise((resolve, reject) => {
    const body = 'grant_type=client_credentials';
    const req = https.request({
      hostname: base, path: '/v1/oauth2/token', method: 'POST',
      headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).access_token); } catch { reject(new Error('Token parse failed')); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

// WHEN THIS RETURNS FALSE, SAY WHY
//
// Every delivery PayPal made on 27 October came back 401 from this function,
// and PayPal's own error log was the only place it showed. From this end it
// was invisible: the handler returned 'Invalid signature' and logged nothing,
// so an activation, a payment failure and a suspension all arrived, were all
// refused, and left no trace anywhere we look.
//
// The three things that can be wrong are now named in the log line:
//
//   verification_status  PayPal's verdict. FAILURE with the right webhook id
//                        points at the payload; the usual cause is this
//                        function round-tripping the body through JSON.parse
//                        and JSON.stringify, which can reorder or reformat it.
//   webhook_id_set       whether PAYPAL_WEBHOOK_ID exists in this deploy at
//                        all. Missing is a FAILURE every single time.
//   webhook_id_tail      the last six characters, enough to tell at a glance
//                        whether it is the webhook registered in PayPal,
//                        without printing a credential into a log.
//
// A 401 that explains itself is the difference between a ten second fix and
// what this one cost: every subscription event since the webhook was set up.
async function verifyPayPalSignature(headers, rawBody) {
  // Netlify base64-encodes some request bodies. paystack-webhook.js and
  // resend-webhook.js both allow for it; this did not, and a parse failure
  // here threw out of the handler as a 500 rather than returning false.
  let parsed;
  try {
    parsed = JSON.parse(typeof rawBody === 'string' ? rawBody : '');
  } catch {
    console.error('[paypal-webhook] body did not parse as JSON, cannot verify signature');
    return false;
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID || '';
  const verifyPayload = {
    auth_algo:         headers['paypal-auth-algo'],
    cert_url:          headers['paypal-cert-url'],
    transmission_id:   headers['paypal-transmission-id'],
    transmission_sig:  headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id:        webhookId,
    webhook_event:     parsed,
  };
  const base = paypalEnv.hostApi;   // see netlify/lib/paypal-env.js
  const token = await getPayPalToken();
  return new Promise((resolve) => {
    const body = JSON.stringify(verifyPayload);
    const req = https.request({
      hostname: base, path: '/v1/notifications/verify-webhook-signature',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let status = null;
        try { status = JSON.parse(d).verification_status; } catch { /* reported below */ }
        if (status !== 'SUCCESS') {
          console.error('[paypal-webhook] signature NOT verified —',
            'event=',               parsed?.event_type || 'unknown',
            'verification_status=', status || `unreadable (http ${res.statusCode})`,
            'webhook_id_set=',      Boolean(webhookId),
            'webhook_id_tail=',     webhookId ? webhookId.slice(-6) : 'none',
            '— if that tail is not the webhook registered in PayPal, that is the fault.');
        }
        resolve(status === 'SUCCESS');
      });
    });
    req.on('error', (e) => {
      console.error('[paypal-webhook] could not reach PayPal to verify:', e.message);
      resolve(false);
    });
    req.write(body); req.end();
  });
}

const money = (n) => `$${Number(n).toFixed(2)}`;
const longDate = (d) => new Date(d).toLocaleDateString('en-GB',
  { day: 'numeric', month: 'long', year: 'numeric' });

// Downgrade artist tier subscription to cancelled/inactive
async function cancelArtistSubscription(subscriptionId, reason) {
  if (!subscriptionId) return;
  const { data: sub } = await supabase
    .from('artist_tier_subscriptions')
    .update({
      status:       'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason || 'paypal_webhook',
      // Billing is over either way, so the retry window stops holding the
      // expiry sweep off this row.
      payment_retry_until: null,
    })
    .eq('paypal_subscription_id', subscriptionId)
    .select('artist_id, artists(user_id, tier)')
    .maybeSingle();

  // Notify the artist their subscription ended
  if (sub?.artist_id) {
    const reasonMsg = reason === 'user_cancelled'
      ? 'You cancelled your subscription. You have been moved to the Free plan.'
      : reason === 'payment_failed'
      ? 'Your subscription payment could not be taken, so your plan has ended and your account is back on Free. Starting a new plan from your profile picks everything back up.'
      : 'Your subscription has ended. You have been moved to the Free plan.';
    // `subscription`, not `tier_granted`. This is a plan ending, and filing it
    // under the type used for grants meant a loss and a gift were the same
    // thing to anything reading these rows, including the preference switches
    // that decide whether somebody hears about it at all.
    await reportNotify('subscription ended (paypal-webhook)', supabase.from('notifications').insert({
      artist_id: sub.artist_id,
      user_id:   sub.artists?.user_id || null,
      type:      'subscription',
      title:     'Your plan has ended',
      message:   reasonMsg,
      email_requested: true,
      metadata:  { kind: 'ended', tier: 'free', reason, audience: 'artist' },
    }));
  }
}

// Reactivate or confirm a subscription
async function activateArtistSubscription(subscriptionId) {
  if (!subscriptionId) return;
  const { error } = await supabase
    .from('artist_tier_subscriptions')
    .update({
      status: 'active', cancelled_at: null, cancel_reason: null,
      // Money arrived, so whatever retry window was open is closed.
      payment_retry_until: null,
    })
    .eq('paypal_subscription_id', subscriptionId);
  if (error) console.error('Activate subscription error:', error);
}

// ── A failed payment, for the two audiences that had no handler ──────────
//
// PayPal sends this on every failed attempt and only sends SUSPENDED once it
// gives up. Until now an artist or listener got nothing from either event
// until the nightly sweep quietly moved them to Free.
//
// Two things happen. The retry window is recorded, which stops
// expire_stale_subscriptions taking the plan away while PayPal is still
// trying. And the person is told, with the date of the next attempt, because
// the one thing worse than a failed payment is a failed payment nobody
// mentions. PayPal emails the PAYER, who is not always the account holder:
// the first real case on this platform had the card in someone else's name,
// so the artist whose plan lapsed was never written to by anybody.
async function subscriptionPaymentFailed(subscriptionId, resource) {
  if (!subscriptionId) return;

  const nextRetry = resource?.next_payment_retry_time || null;
  const retryUntil = nextRetry
    ? new Date(new Date(nextRetry).getTime() + 86400000)      // a day past the attempt
    : new Date(Date.now() + RETRY_GRACE_DAYS * 86400000);
  const patch = {
    payment_retry_until:    retryUntil.toISOString(),
    last_payment_failed_at: new Date().toISOString(),
    updated_at:             new Date().toISOString(),
  };

  const tail = nextRetry
    ? ` PayPal tries again on ${longDate(nextRetry)}.`
    : ' PayPal will try again over the next few days.';
  const message =
    'We could not take your subscription payment.' + tail +
    ' Your plan stays on in the meantime. If the card has changed, update it in your PayPal account.';

  // ── Artist ──
  const { data: artistSub, error: aErr } = await supabase
    .from('artist_tier_subscriptions')
    .update(patch)
    .eq('paypal_subscription_id', subscriptionId)
    .in('status', ['active', 'expired'])
    .select('artist_id, artists(user_id)')
    .maybeSingle();
  if (aErr) {
    console.error('[paypal-webhook] artist payment-failed update refused:', aErr.code, aErr.message);
  } else if (artistSub?.artist_id) {
    await reportNotify('payment failed (paypal-webhook)', supabase.from('notifications').insert({
      artist_id: artistSub.artist_id,
      user_id:   artistSub.artists?.user_id || null,
      type:      'subscription',
      title:     'Your subscription payment did not go through',
      message,
      email_requested: true,
      metadata: {
        kind: 'payment_failed', audience: 'artist',
        next_retry: nextRetry, subscription: subscriptionId,
        attempts: resource?.failed_payments_count ?? null,
      },
    }));
  }

  // ── Listener ──
  const { data: listenerSub, error: lErr } = await supabase
    .from('listener_tier_subscriptions')
    .update(patch)
    .eq('paypal_subscription_id', subscriptionId)
    .in('status', ['active', 'expired'])
    .select('user_id')
    .maybeSingle();
  if (lErr) {
    console.error('[paypal-webhook] listener payment-failed update refused:', lErr.code, lErr.message);
  } else if (listenerSub?.user_id) {
    await reportNotify('payment failed (paypal-webhook)', supabase.from('notifications').insert({
      user_id: listenerSub.user_id,
      type:    'subscription',
      title:   'Your subscription payment did not go through',
      message,
      email_requested: true,
      metadata: {
        kind: 'payment_failed', audience: 'listener',
        next_retry: nextRetry, subscription: subscriptionId,
      },
    }));
  }
}

// ── Artist add-ons (Instagram add-on, migration 153) ──────────────────────
// Matched on the PayPal subscription id; a subscription that is not an add-on
// matches no row and nothing happens.
async function addonEvent(subscriptionId, kind) {
  if (!subscriptionId) return;
  const now = new Date();
  let patch;
  if (kind === 'activated') patch = { status: 'active', activated_at: now.toISOString(), cancelled_at: null };
  else if (kind === 'paid') {
    // A payment covers the next month. PayPal's sale event does not carry the
    // next billing date, so a month plus two days' slack is recorded.
    patch = { status: 'active', current_period_end: new Date(now.getTime() + 33 * 86400000).toISOString(), cancelled_at: null };
  } else if (kind === 'failed') patch = { status: 'past_due' };
  else if (kind === 'cancelled') patch = { status: 'cancelled', cancelled_at: now.toISOString() };
  else return;
  patch.updated_at = now.toISOString();
  let q = supabase.from('artist_addons').update(patch).eq('paypal_subscription_id', subscriptionId);
  if (kind === 'failed') q = q.eq('status', 'active');
  const { error } = await q;
  if (error) console.error('[paypal-webhook] add-on update failed:', kind, subscriptionId, error.message);
}

// ── Retail venue subscriptions ──────────────────────────────────────────
async function activateRetailSubscription(subscriptionId) {
  if (!subscriptionId) return;
  const { data: sub, error: subErr } = await supabase
    .from('retail_subscriptions')
    .update({ status: 'active' })
    .eq('paypal_subscription_id', subscriptionId)
    .select('venue_id')
    .maybeSingle();

  if (subErr) {
    console.error('[paypal-webhook] retail subscription activation failed:',
      subErr.message, subscriptionId);
  }

  // A venue whose payment just went through shouldn't sit waiting on a
  // separate manual admin step to actually turn the player on.
  //
  // THE FILTER WAS `.eq('status', 'pending')`, AND THAT IS THE HOLE.
  //
  // A venue suspended for non-payment has status 'suspended', not 'pending'.
  // So the one case this function exists to handle, they missed a payment,
  // the player went dark, they paid, PayPal charged them again and sent this
  // event, matched no rows and did nothing. The venue stayed suspended while
  // the money kept arriving every month, and the only way back was an admin
  // noticing and flipping it by hand. "Access follows payment in both
  // directions" was true in one direction.
  //
  // `in` rather than no filter at all, so this can never resurrect a venue an
  // admin deliberately closed or a row in some other terminal state, it only
  // reverses the two states billing itself is allowed to have caused.
  if (sub?.venue_id) {
    const { data: reinstated, error: venueErr } = await supabase.from('retail_venues')
      .update({ status: 'active' })
      .eq('id', sub.venue_id)
      .in('status', ['pending', 'suspended'])
      .select('id, status');
    if (venueErr) {
      console.error('[paypal-webhook] venue activation failed:', venueErr.message, sub.venue_id);
    } else if (reinstated?.length) {
      console.log('[paypal-webhook] venue', sub.venue_id, 'is active on payment.');
    }
  }
}

async function cancelRetailSubscription(subscriptionId, reason) {
  if (!subscriptionId) return;
  // Billing has stopped (cancelled by the venue, or suspended by PayPal after
  // failed payments). The venue keeps the music until the end of the period it
  // has already paid for, or the end of its free trial, as the retail terms
  // promise. retail-artist-payouts.js sweeps venues whose paid period has run
  // out every day. Only a venue with nothing paid ahead is suspended now.
  const { data: sub, error: subErr } = await supabase
    .from('retail_subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('paypal_subscription_id', subscriptionId)
    .select('venue_id, current_period_end')
    .maybeSingle();
  if (subErr) {
    console.error('[paypal-webhook] retail cancel failed:', subErr.message, subscriptionId, reason);
    return;
  }
  if (!sub?.venue_id) return;

  const paidUntil = sub.current_period_end ? new Date(sub.current_period_end) : null;
  if (paidUntil && paidUntil > new Date()) {
    console.log('[paypal-webhook] retail venue', sub.venue_id, 'cancelled (' + reason + '), keeps access until',
      paidUntil.toISOString());
    return;
  }
  const { error: venueErr } = await supabase.from('retail_venues')
    .update({ status: 'suspended' })
    .eq('id', sub.venue_id)
    .eq('status', 'active');
  if (venueErr) console.error('[paypal-webhook] retail venue suspend failed:', venueErr.message, sub.venue_id);
}

// Every completed retail subscription payment, as PayPal reports it: the gross,
// PayPal's fee and the net that actually landed. This is the ONLY source the
// monthly artist pool is built from (see migration 145), so it is written from
// PayPal's own numbers, keyed on PayPal's sale id so a repeated webhook cannot
// count a payment twice.
async function recordRetailPayment(resource, subscriptionId) {
  const saleId = resource?.id;
  if (!saleId || !subscriptionId) return;

  const { data: sub } = await supabase
    .from('retail_subscriptions')
    .select('venue_id')
    .eq('paypal_subscription_id', subscriptionId)
    .maybeSingle();
  if (!sub) return;                                   // not a retail subscription

  const gross = Math.round(parseFloat(resource?.amount?.total) * 100) / 100;
  const fee   = Math.round(parseFloat(resource?.transaction_fee?.value || 0) * 100) / 100;
  if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(fee) || fee < 0) {
    console.error('[paypal-webhook] RETAIL PAYMENT NOT RECORDED: unusable amounts',
      JSON.stringify({ saleId, subscriptionId, amount: resource?.amount, fee: resource?.transaction_fee }));
    return;
  }

  const { error } = await supabase.from('retail_payments').upsert({
    paypal_sale_id:         saleId,
    paypal_subscription_id: subscriptionId,
    venue_id:               sub.venue_id,
    gross,
    fee,
    net:                    Math.round((gross - fee) * 100) / 100,
    currency:               resource?.amount?.currency || 'USD',
    paid_at:                resource?.create_time || new Date().toISOString(),
  }, { onConflict: 'paypal_sale_id', ignoreDuplicates: true });

  if (error) {
    // Loud: a retail payment that is not recorded is money the artist pool
    // never sees. Returning an error makes PayPal retry the webhook.
    console.error('[paypal-webhook] RETAIL PAYMENT NOT RECORDED:', error.code, error.message, saleId);
    throw new Error('retail_payment_not_recorded');
  }
}

// ── Artist and listener subscription money ────────────────────────────────
//
// The equivalent of recordRetailPayment for the two audiences that never had
// one. Before this, the only field on the platform that claimed to hold a
// subscription payment was amount_paid, and nothing wrote it, so the platform
// took money for a month and could not say how much.
//
// Keyed on the sale id under a unique index, so a webhook PayPal delivers
// twice records one payment. amount_paid is written too, because a dashboard
// reading the subscription row should not have to join a ledger to show what
// the plan costs.
//
// Returns the audience it matched, or null, which is how the caller knows
// whether this sale belongs to an artist, a listener or neither.
async function recordSubscriptionPayment(resource, subscriptionId) {
  const saleId = resource?.id;
  if (!saleId || !subscriptionId) {
    // Was a silent return. A payment event with no sale id or no agreement id
    // is money arriving that nothing can attribute, and it used to leave no
    // trace at all: the tier would move and the ledger would stay empty, with
    // nothing in any log to say why.
    console.error('[paypal-webhook] SUBSCRIPTION PAYMENT NOT RECORDED: missing identifiers',
      JSON.stringify({ saleId: saleId || null, subscriptionId: subscriptionId || null }));
    return null;
  }

  const gross = Math.round(parseFloat(resource?.amount?.total) * 100) / 100;
  const fee   = Math.round(parseFloat(resource?.transaction_fee?.value || 0) * 100) / 100;
  if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(fee) || fee < 0) {
    console.error('[paypal-webhook] SUBSCRIPTION PAYMENT NOT RECORDED: unusable amounts',
      JSON.stringify({ saleId, subscriptionId, amount: resource?.amount, fee: resource?.transaction_fee }));
    return null;
  }

  // Which audience owns this subscription. Checked in the database rather
  // than guessed from the plan id, because the same column name carries all
  // three and only one will have a row.
  // started_at comes back too, because the receipt that gets written later
  // needs to know whether this subscription is new or has been running. See
  // the note on isRenewal in the handler.
  const [{ data: artistSub }, { data: listenerSub }] = await Promise.all([
    supabase.from('artist_tier_subscriptions')
      .select('id, artist_id, started_at, artists(user_id)')
      .eq('paypal_subscription_id', subscriptionId).maybeSingle(),
    supabase.from('listener_tier_subscriptions')
      .select('id, user_id, started_at')
      .eq('paypal_subscription_id', subscriptionId).maybeSingle(),
  ]);

  let kind = null, artistId = null, userId = null, rowId = null, table = null, startedAt = null;
  if (artistSub) {
    kind = 'artist'; artistId = artistSub.artist_id;
    userId = artistSub.artists?.user_id || null;
    rowId = artistSub.id; table = 'artist_tier_subscriptions';
    startedAt = artistSub.started_at || null;
  } else if (listenerSub) {
    kind = 'listener'; userId = listenerSub.user_id;
    rowId = listenerSub.id; table = 'listener_tier_subscriptions';
    startedAt = listenerSub.started_at || null;
  } else {
    // This used to be a bare return. A venue subscription lands here and is
    // genuinely none of this function's business, so that case stays quiet.
    //
    // Anything that matches none of the three is the case worth shouting
    // about: PayPal has taken money against an agreement this platform cannot
    // identify. Silence there is how a paying subscriber ends up with no
    // record and nobody notices, so it is logged and an admin is told.
    const { data: venueSub } = await supabase.from('retail_subscriptions')
      .select('id').eq('paypal_subscription_id', subscriptionId).maybeSingle();
    if (venueSub) return null;                    // a venue, handled elsewhere

    console.error('[paypal-webhook] UNATTRIBUTABLE SUBSCRIPTION PAYMENT:',
      JSON.stringify({ saleId, subscriptionId, gross, currency: resource?.amount?.currency || 'USD' }),
      '- no artist, listener or venue subscription carries this agreement id. Nothing recorded.');

    // Best effort, and deliberately swallowed: telling somebody must never be
    // the reason a payment path fails.
    try {
      const { data: admins } = await supabase.from('admins').select('user_id');
      const rows = (admins || []).map(a => a.user_id).filter(Boolean).map(uid => ({
        user_id: uid,
        type: 'admin_message',
        title: 'A subscription payment could not be matched',
        message: `PayPal took ${resource?.amount?.currency || 'USD'} ${gross} on agreement `
               + `${subscriptionId}, and no artist, listener or venue subscription carries that id. `
               + 'Nothing was recorded. The sale id is ' + saleId + '.',
        email_requested: true,
        metadata: { kind: 'unattributed_payment', subscription: subscriptionId, sale: saleId, gross },
      }));
      if (rows.length) await supabase.from('notifications').insert(rows);
    } catch (e) {
      console.error('[paypal-webhook] could not alert on the unattributed payment:', e.message);
    }
    return null;
  }

  const { error } = await supabase.from('subscription_payments').upsert({
    paypal_sale_id:         saleId,
    paypal_subscription_id: subscriptionId,
    kind,
    artist_id:              artistId,
    user_id:                userId,
    gross,
    fee,
    net:                    Math.round((gross - fee) * 100) / 100,
    currency:               resource?.amount?.currency || 'USD',
    paid_at:                resource?.create_time || new Date().toISOString(),
  }, { onConflict: 'paypal_sale_id', ignoreDuplicates: true });

  if (error) {
    // Loud, and worth a retry: this is the only record that the money arrived.
    console.error('[paypal-webhook] SUBSCRIPTION PAYMENT NOT RECORDED:',
      error.code, error.message, saleId, kind);
    throw new Error('subscription_payment_not_recorded');
  }

  // What the plan currently costs, on the subscription itself. Not a ledger,
  // and not used for accounting; it is there so a dashboard can show the
  // price without reading the payments table.
  const { error: amtErr } = await supabase.from(table)
    .update({ amount_paid: gross, updated_at: new Date().toISOString() })
    .eq('id', rowId);
  if (amtErr) console.error('[paypal-webhook] amount_paid not written:', amtErr.code, amtErr.message);

  console.log('[paypal-webhook] recorded', kind, 'payment', resource?.amount?.currency || 'USD', gross,
    'fee', fee, 'sale', saleId);
  return { kind, artistId, userId, startedAt };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const valid = await verifyPayPalSignature(event.headers, event.body);
  if (!valid) return { statusCode: 401, body: 'Invalid signature' };

  const evt = JSON.parse(event.body);
  const eventType = evt.event_type;
  const resource  = evt.resource || {};

  console.log(`PayPal webhook: ${eventType}`);

  // ── Track purchase capture completed ──────────────────────────────────────
  if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
    const captureId = resource?.id;
    const orderId   = resource?.supplementary_data?.related_ids?.order_id;
    if (captureId) {
      await supabase.from('payouts').update({ status: 'paid' }).eq('paypal_payout_id', captureId);
      // paypal-order.js writes the CAPTURE id into purchases.paypal_transaction_id.
      // This matched it against the ORDER id, so it has never updated a single
      // row. Harmless only because the row is already inserted as 'completed',
      // but it means this line was not doing the job it appears to do, and a
      // capture that completes later (a pending, bank-funded payment) was never
      // marked. Match on the capture id, with the order id kept as a fallback
      // for any legacy row written before that convention settled.
      await supabase.from('purchases').update({ status: 'completed' })
        .eq('paypal_transaction_id', captureId);
    }
    if (orderId) {
      await supabase.from('purchases').update({ status: 'completed' })
        .eq('paypal_transaction_id', orderId);
    }
  }

  // ── Subscription activated (new sign-up or reactivation) ─────────────────
  if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
    const subscriptionId = resource?.id;
    await activateArtistSubscription(subscriptionId);
    await activateRetailSubscription(subscriptionId);
    await addonEvent(subscriptionId, 'activated');
    // Also handle listener subscription activation
    const { data: listenerSub } = await supabase
      .from('listener_tier_subscriptions')
      .update({ status: 'active', payment_retry_until: null })
      .eq('paypal_subscription_id', subscriptionId)
      .select('user_id').maybeSingle();
    if (listenerSub?.user_id) {
      await supabase.from('listeners')
        .update({ tier: 'fan_pro', updated_at: new Date().toISOString() })
        .eq('user_id', listenerSub.user_id);
    }
  }

  // ── Subscription cancelled by user from PayPal dashboard ─────────────────
  if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
    const subscriptionId = resource?.id;
    await cancelArtistSubscription(subscriptionId, 'user_cancelled');
    await cancelRetailSubscription(subscriptionId, 'user_cancelled');
    await addonEvent(subscriptionId, 'cancelled');
    const { data: listenerSub } = await supabase.from('listener_tier_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'user_cancelled', payment_retry_until: null })
      .eq('paypal_subscription_id', subscriptionId)
      .select('user_id').maybeSingle();
    if (listenerSub?.user_id) {
      await supabase.from('listeners').update({ tier: 'free', tier_expires_at: null }).eq('user_id', listenerSub.user_id);
      await reportNotify('subscription ended (paypal-webhook)', supabase.from('notifications').insert({
        user_id: listenerSub.user_id,
        type:    'subscription',
        title:   'Your plan has ended',
        message: 'You cancelled your subscription. Your account is back on Free.',
        email_requested: true,
        metadata: { kind: 'ended', reason: 'user_cancelled', audience: 'listener' },
      }));
    }
  }

  // ── A payment failed ──────────────────────────────────────────────────────
  //
  // This event was not handled at all, which is why "a failed payment suspends
  // the venue" was not true. PayPal sends BILLING.SUBSCRIPTION.PAYMENT.FAILED
  // on each failed attempt and only sends SUSPENDED once the plan's
  // payment_failure_threshold is reached, 2, in the retail plans this codebase
  // creates. So one failed payment produced no event this function looked at,
  // and nothing anywhere recorded that billing was in trouble.
  //
  // Deliberately NOT suspending on the first failure: a card that fails once and
  // retries successfully the next day is routine, and killing the music in a
  // venue over it is a worse error than a day's grace. What this does is record
  // it and leave a line in the log, so a venue drifting towards suspension is
  // visible before the player goes dark rather than after.
  //
  // The same grace now applies to artists and listeners, and for a sharper
  // reason: the retail branch below at least recorded past_due, while the two
  // personal audiences had no branch at all. They were moved to Free by the
  // nightly sweep on the first night after expiry, mid-retry, without a word.
  if (eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
    const subscriptionId = resource?.id || resource?.billing_agreement_id;
    const attempts = resource?.failed_payments_count ?? null;
    console.warn('[paypal-webhook] subscription payment FAILED',
      { subscriptionId, attempts, nextRetry: resource?.next_payment_retry_time || null });
    if (subscriptionId) {
      await addonEvent(subscriptionId, 'failed');
      await subscriptionPaymentFailed(subscriptionId, resource);
      const { error } = await supabase.from('retail_subscriptions')
        .update({ status: 'past_due' })
        .eq('paypal_subscription_id', subscriptionId)
        .eq('status', 'active');
      // If `past_due` is not an allowed value for this column the update is
      // refused; that is a schema gap to close, not a reason to fail the
      // webhook, so PayPal still gets its 200 and does not retry forever.
      if (error) {
        console.error('[paypal-webhook] could not mark retail subscription past_due:',
          error.code, error.message, ',  if this is a check-constraint violation, add past_due to the allowed statuses.');
      }
    }
  }

  // ── Subscription suspended (payment failed repeatedly) ───────────────────
  if (eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
    const subscriptionId = resource?.id;
    await cancelArtistSubscription(subscriptionId, 'payment_failed');
    await cancelRetailSubscription(subscriptionId, 'payment_failed');
    await addonEvent(subscriptionId, 'cancelled');
    const { data: listenerSub } = await supabase.from('listener_tier_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'payment_failed', payment_retry_until: null })
      .eq('paypal_subscription_id', subscriptionId)
      .select('user_id').maybeSingle();
    if (listenerSub?.user_id) {
      await supabase.from('listeners').update({ tier: 'free', tier_expires_at: null }).eq('user_id', listenerSub.user_id);
      await reportNotify('subscription ended (paypal-webhook)', supabase.from('notifications').insert({
        user_id: listenerSub.user_id,
        type:    'subscription',
        title:   'Your plan has ended',
        message: 'Your subscription payment could not be taken, so your plan has ended and your account is back on Free.',
        email_requested: true,
        metadata: { kind: 'ended', reason: 'payment_failed', audience: 'listener' },
      }));
    }
  }

  // ── Subscription expired ──────────────────────────────────────────────────
  if (eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
    const subscriptionId = resource?.id;
    await cancelArtistSubscription(subscriptionId, 'expired');
    await cancelRetailSubscription(subscriptionId, 'expired');
    await addonEvent(subscriptionId, 'cancelled');
  }

  // ── Subscription payment completed (first payment AND every renewal) ─────
  if (eventType === 'PAYMENT.SALE.COMPLETED') {
    const subscriptionId = resource?.billing_agreement_id;
    if (subscriptionId) {
      // Ensure status is active in case it was briefly suspended
      await activateArtistSubscription(subscriptionId);
      await activateRetailSubscription(subscriptionId);
      await addonEvent(subscriptionId, 'paid');

      // Money in, before anything else is decided. Both of these throw rather
      // than return quietly if they cannot write, which gives PayPal a 500 and
      // another delivery: a payment nobody recorded is the one failure that
      // cannot be reconstructed afterwards.
      let paymentRecord = null;
      try {
        await recordRetailPayment(resource, subscriptionId);
        paymentRecord = await recordSubscriptionPayment(resource, subscriptionId);
      } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: 'payment not recorded, retry' }) };
      }

      // A successful payment closes any retry window on the listener side.
      // The artist side is cleared inside activateArtistSubscription above.
      await supabase.from('listener_tier_subscriptions')
        .update({ payment_retry_until: null })
        .eq('paypal_subscription_id', subscriptionId)
        .not('payment_retry_until', 'is', null);

      // ── Push the expiry out by one billing period ──────────────────────
      //
      // This was missing, and it is the reason a paying subscriber loses
      // access. ListenerUpgradePage sets expires_at to signup + 30 days;
      // nothing ever moved it again. useTier.js reads it and treats an
      // expired row as free. So on day 31 PayPal charges them, this handler
      // fires, the affiliate gets paid, and the subscriber drops to Free
      // while the money keeps leaving their account every month.
      //
      // All three extend functions (migrations 120 and 124) work the same
      // way: from the LATER of now and the current expiry, so an early
      // renewal cannot shorten a subscription and a lapsed one is not
      // credited for the gap; by the row's own billing_cycle, so an annual
      // plan is not renewed by a month; and against the renewal ledger keyed
      // on the sale id, so a webhook PayPal delivers twice does not hand out
      // two periods.
      //
      // ALL THREE ARE CALLED. Only one of them will find a row, the other
      // two return nothing, which is why no row found is not an error here.
      // Calling only the listener one is exactly how artists came to lose
      // Pro on their renewal date while still paying for it.
      const renewalRef = resource?.id || null;   // PayPal's sale id
      const EXTENDERS = [
        ['listener', 'extend_listener_subscription'],
        ['artist',   'extend_artist_subscription'],
        ['retail',   'extend_retail_subscription'],
      ];
      for (const [kind, fn] of EXTENDERS) {
        try {
          const { data: extended, error: extErr } = await supabase.rpc(fn, {
            p_paypal_subscription_id: subscriptionId,
            p_external_ref:           renewalRef,
          });
          if (extErr) {
            console.error(`[paypal-webhook] could not extend ${kind} subscription`,
              subscriptionId, extErr.message);
          } else if (extended?.length) {
            const row = extended[0];
            const until = row.new_expiry || row.new_period_end;
            console.log(`[paypal-webhook] ${kind} subscription extended to`, until,
              'for', row.user_id || row.artist_id || row.venue_id);

            // Tell them, and say the right thing for which payment this is.
            //
            // The first payment fires this event too. The renewal ledger from
            // migration 124 tells the two apart: the extend function claims a
            // row before it writes anything, so one row means this is the
            // first payment and more than one means it is a renewal.
            //
            // The welcome receipt used to be written in the browser by the
            // upgrade page, which meant it existed only if the buyer's tab
            // survived the trip back from PayPal. Written here it does not
            // depend on anybody's connection.
            try {
              const { count } = await supabase
                .from('subscription_renewals')
                .select('id', { count: 'exact', head: true })
                .eq('paypal_subscription_id', subscriptionId);

              // THE LEDGER IS YOUNGER THAN THE SUBSCRIPTIONS IT DESCRIBES
              //
              // Counting rows in subscription_renewals was the whole test, and
              // on its own it misreads every subscription that predates the
              // ledger. Nothing wrote to that table until October 2026, so a
              // plan that has been running since September arrives here with
              // an empty history and is greeted as a brand new signup. The
              // first person this would have happened to is a subscriber whose
              // renewal failed and recovered: they would be told their plan was
              // live, as if they had just joined, a month after they did.
              //
              // So the subscription's own start date is the second opinion. A
              // first payment lands within moments of the row being created;
              // anything older than an hour has been running, whatever the
              // ledger remembers. Both have to agree before this is treated as
              // a first payment, and the default when they disagree is the
              // renewal wording, which is never wrong for somebody who has
              // paid before.
              const startedAt = paymentRecord?.startedAt || null;
              const subscriptionIsNew = startedAt
                ? (Date.now() - Date.parse(startedAt)) < 3600000
                : true;
              const isRenewal = !((count || 0) <= 1 && subscriptionIsNew);
              const who = kind === 'artist'
                ? { artist_id: row.artist_id }
                : kind === 'listener'
                ? { user_id: row.user_id }
                : null;   // a venue has no personal inbox; the admin panel shows it

              // An artist's notification carries the user_id too, so it
              // reaches their inbox and not only the artist feed.
              if (kind === 'artist' && row.artist_id) {
                const { data: a } = await supabase.from('artists')
                  .select('user_id').eq('id', row.artist_id).maybeSingle();
                if (a?.user_id) who.user_id = a.user_id;
              }

              const paid = parseFloat(resource?.amount?.total);
              const amountLine = Number.isFinite(paid) && paid > 0
                ? `${money(paid)} received. ` : 'Payment received. ';

              // src/pages/TierUpgradePage.js writes its own "is live" receipt
              // the moment the buyer gets back from PayPal, because somebody
              // standing in front of the screen should not wait on a webhook.
              // So a first payment usually already has one, and inserting a
              // second would mean two receipts for one purchase.
              //
              // Checked rather than assumed, because that page's receipt is
              // the one that goes missing: it is written in the browser, so a
              // closed tab or a dropped connection on the way back from PayPal
              // leaves the buyer with nothing. When it is absent this writes
              // it, which is the case the client-side one cannot cover.
              let alreadyToldOnSignup = false;
              if (!isRenewal) {
                const { count: existing, error: dupErr } = await supabase
                  .from('notifications')
                  .select('id', { count: 'exact', head: true })
                  .eq('type', 'subscription')
                  .eq('metadata->>subscription', subscriptionId);
                // A failed check writes the receipt rather than skipping it.
                // Two receipts is a tidiness problem; none is a buyer who paid
                // and was told nothing, so the error leans that way on purpose.
                if (dupErr) {
                  console.error('[paypal-webhook] duplicate-receipt check failed, writing anyway:',
                    dupErr.code, dupErr.message);
                }
                alreadyToldOnSignup = !dupErr && (existing || 0) > 0;
                if (alreadyToldOnSignup) {
                  console.log('[paypal-webhook] first-payment receipt already written by the upgrade page, not duplicating.');
                }
              }

              if (who && until && !alreadyToldOnSignup) {
                const when = longDate(until);
                const { error: nErr } = await supabase.from('notifications').insert({
                  ...who,
                  type:    'subscription',
                  title:   isRenewal ? 'Your subscription renewed' : 'Your subscription is live',
                  message: isRenewal
                    ? `${amountLine}You are covered until ${when}.`
                    : `${amountLine}Your plan is active until ${when}, and renews on its own after that.`,
                  metadata: {
                    kind: isRenewal ? 'renewed' : 'started',
                    audience: kind, renewed_until: until,
                    amount: Number.isFinite(paid) ? paid : null,
                    currency: resource?.amount?.currency || 'USD',
                    subscription: subscriptionId,
                  },
                });
                if (nErr) console.error('[paypal-webhook] subscription receipt refused:', nErr.code, nErr.message);
              }
            } catch (e) {
              console.error('[paypal-webhook] subscription receipt threw:', e.message);
            }
          }
        } catch (e) {
          console.error(`[paypal-webhook] ${kind} extend threw:`, e.message);
        }
      }

      // ── Affiliate commission ──────────────────────────────────────────────
      // This is the only place on the platform where affiliate money is
      // earned, and this event is the right one: it is money that has actually
      // arrived, and it fires on the first payment and on every renewal, so a
      // referrer keeps earning for as long as the person they referred keeps
      // paying.
      //
      // 20% of the payment, identical for artist, beatmaker and listener
      // affiliates, see migration 105 for why that rate and not a flat
      // per-signup bounty.
      //
      // PayPal retries webhooks, and a double-paid commission leaves your
      // account rather than just inflating a number. So the sale id goes down
      // with the commission under a unique index and the RPC refuses a repeat.
      // Do not remove that id from this call.
      const saleId   = resource?.id;
      const amount   = parseFloat(resource?.amount?.total);
      const currency = resource?.amount?.currency;

      if (saleId && Number.isFinite(amount) && amount > 0) {
        try {
          const { data: commission, error: commissionError } = await supabase
            .rpc('award_affiliate_commission', {
              p_paypal_subscription_id: subscriptionId,
              p_amount:                 amount,
              p_currency:               currency || 'USD',
              p_external_ref:           saleId,
            });

          // Logged either way. An unread error here is an affiliate quietly
          // not being paid, which is the single worst way for this to fail,
          // nobody notices until somebody asks why their balance is zero.
          if (commissionError) {
            console.error('[paypal-webhook] commission RPC failed:', commissionError.message, { subscriptionId, saleId });
          } else if (commission?.paid) {
            console.log(`[paypal-webhook] affiliate commission ${commission.currency} ${commission.commission} to ${commission.affiliate_role} affiliate ${commission.affiliate_id} on a ${commission.payer_kind} payment of ${commission.sale}`);
          } else {
            // no_referrer is the normal case and not a problem.
            console.log(`[paypal-webhook] no commission: ${commission?.reason}`, { subscriptionId, saleId });
          }
        } catch (err) {
          console.error('[paypal-webhook] commission threw:', err?.message, { subscriptionId, saleId });
        }
      } else {
        console.warn('[paypal-webhook] PAYMENT.SALE.COMPLETED with no usable amount/sale id, no commission awarded', { subscriptionId, saleId, amount, currency });
      }
    }
  }

  // ── Payment reversed / refunded ───────────────────────────────────────────
  if (eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'PAYMENT.CAPTURE.REVERSED') {
    // Order matters, and it was the wrong way round. On a REFUNDED event
    // `resource.id` is the REFUND's id, not the capture's, the capture is in
    // supplementary_data.related_ids.capture_id. Reading resource.id first
    // meant every refund matched nothing: the purchase was never marked
    // refunded and the payout was never flagged for claw-back, so a refunded
    // sale still looked like money the artist had earned.
    const captureId = resource?.supplementary_data?.related_ids?.capture_id || resource?.id;
    if (captureId) {
      // Mark payouts as refunded so admin can claw back
      await supabase.from('payouts')
        .update({ status: 'failed', notes: `Reversed by PayPal: ${eventType}` })
        .eq('paypal_payout_id', captureId);
      // Mark purchase as refunded
      await supabase.from('purchases')
        .update({ status: 'refunded' })
        .eq('paypal_transaction_id', captureId);
    }
  }

  // ── A subscription payment refunded or reversed ──────────────────────────
  // Subscription payments are SALES, not captures, so they arrive as
  // PAYMENT.SALE.*. A refund's own id is not the sale's: the sale is in
  // resource.sale_id. The payment is marked reversed, which takes it out of the
  // artist pool for its month. Months are only closed 14 days after they end,
  // so a refund inside that window never reaches an artist's share.
  if (eventType === 'PAYMENT.SALE.REFUNDED' || eventType === 'PAYMENT.SALE.REVERSED') {
    const saleId = resource?.sale_id || resource?.id;
    if (saleId) {
      const { data: hit, error } = await supabase.from('retail_payments')
        .update({ reversed_at: new Date().toISOString(), reversal_reason: eventType })
        .eq('paypal_sale_id', saleId)
        .is('reversed_at', null)
        .select('paid_at');
      if (error) console.error('[paypal-webhook] retail reversal not recorded:', error.message, saleId);
      else if (hit?.length) {
        const paidAt = new Date(hit[0].paid_at);
        const monthEnd = new Date(Date.UTC(paidAt.getUTCFullYear(), paidAt.getUTCMonth() + 1, 1));
        if (Date.now() > monthEnd.getTime() + 14 * 86400000) {
          console.error('[paypal-webhook] RETAIL REFUND AFTER THE MONTH CLOSED: sale', saleId,
            'was already counted in a paid pool. Adjust by hand.');
        }
      }

      // The same for artist and listener subscription money, which until now
      // had no ledger to reverse. A refunded subscription payment that still
      // reads as received is a figure that will never add up again.
      const { error: sErr } = await supabase.from('subscription_payments')
        .update({ reversed_at: new Date().toISOString(), reversal_reason: eventType })
        .eq('paypal_sale_id', saleId)
        .is('reversed_at', null);
      if (sErr) console.error('[paypal-webhook] subscription reversal not recorded:', sErr.message, saleId);
    }
  }

  // ── Dispute opened, flag for admin review ────────────────────────────────
  if (eventType === 'CUSTOMER.DISPUTE.CREATED') {
    const disputeId = resource?.dispute_id;
    const captureId = resource?.disputed_transactions?.[0]?.seller_transaction_id;
    console.warn(`PayPal dispute opened: ${disputeId}, capture: ${captureId}`);
    if (captureId) {
      await supabase.from('payouts')
        .update({ status: 'failed', notes: `Dispute opened: ${disputeId}` })
        .eq('paypal_payout_id', captureId);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};