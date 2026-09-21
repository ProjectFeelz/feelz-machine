// netlify/functions/paypal-webhook.js
// Verifies PayPal webhook signature and handles all relevant events.
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { reportNotify } = require('../lib/notify');
const paypalEnv = require('../lib/paypal-env');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

async function verifyPayPalSignature(headers, rawBody) {
  const verifyPayload = {
    auth_algo:         headers['paypal-auth-algo'],
    cert_url:          headers['paypal-cert-url'],
    transmission_id:   headers['paypal-transmission-id'],
    transmission_sig:  headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id:        process.env.PAYPAL_WEBHOOK_ID,
    webhook_event:     JSON.parse(rawBody),
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
        try { resolve(JSON.parse(d).verification_status === 'SUCCESS'); }
        catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.write(body); req.end();
  });
}

// Downgrade artist tier subscription to cancelled/inactive
async function cancelArtistSubscription(subscriptionId, reason) {
  if (!subscriptionId) return;
  const { data: sub } = await supabase
    .from('artist_tier_subscriptions')
    .update({
      status:       'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason || 'paypal_webhook',
    })
    .eq('paypal_subscription_id', subscriptionId)
    .select('artist_id, artists(user_id, tier)')
    .maybeSingle();

  // Notify the artist their subscription ended
  if (sub?.artist_id) {
    const reasonMsg = reason === 'user_cancelled'
      ? 'You cancelled your subscription. You have been moved to the Free plan.'
      : reason === 'payment_failed'
      ? 'Your subscription payment failed. You have been moved to the Free plan.'
      : 'Your subscription has ended. You have been moved to the Free plan.';
    await reportNotify('tier_granted (paypal-webhook)', supabase.from('notifications').insert({
      artist_id: sub.artist_id,
      user_id:   sub.artists?.user_id || null,
      type:      'tier_granted',
      title:     'Subscription ended',
      message:   reasonMsg,
      metadata:  { tier: 'free', reason },
    }));
  }
}

// Reactivate or confirm a subscription
async function activateArtistSubscription(subscriptionId) {
  if (!subscriptionId) return;
  const { error } = await supabase
    .from('artist_tier_subscriptions')
    .update({ status: 'active', cancelled_at: null, cancel_reason: null })
    .eq('paypal_subscription_id', subscriptionId);
  if (error) console.error('Activate subscription error:', error);
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
    // Also handle listener subscription activation
    const { data: listenerSub } = await supabase
      .from('listener_tier_subscriptions')
      .update({ status: 'active' })
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
    const { data: listenerSub } = await supabase.from('listener_tier_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'user_cancelled' })
      .eq('paypal_subscription_id', subscriptionId)
      .select('user_id').maybeSingle();
    if (listenerSub?.user_id) {
      await supabase.from('listeners').update({ tier: 'free', tier_expires_at: null }).eq('user_id', listenerSub.user_id);
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
  if (eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
    const subscriptionId = resource?.id || resource?.billing_agreement_id;
    const attempts = resource?.failed_payments_count ?? null;
    console.warn('[paypal-webhook] subscription payment FAILED',
      { subscriptionId, attempts, nextRetry: resource?.next_payment_retry_time || null });
    if (subscriptionId) {
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
    const { data: listenerSub } = await supabase.from('listener_tier_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'payment_failed' })
      .eq('paypal_subscription_id', subscriptionId)
      .select('user_id').maybeSingle();
    if (listenerSub?.user_id) {
      await supabase.from('listeners').update({ tier: 'free', tier_expires_at: null }).eq('user_id', listenerSub.user_id);
    }
  }

  // ── Subscription expired ──────────────────────────────────────────────────
  if (eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
    const subscriptionId = resource?.id;
    await cancelArtistSubscription(subscriptionId, 'expired');
    await cancelRetailSubscription(subscriptionId, 'expired');
  }

  // ── Subscription payment completed (first payment AND every renewal) ─────
  if (eventType === 'PAYMENT.SALE.COMPLETED') {
    const subscriptionId = resource?.billing_agreement_id;
    if (subscriptionId) {
      // Ensure status is active in case it was briefly suspended
      await activateArtistSubscription(subscriptionId);
      await activateRetailSubscription(subscriptionId);

      // Retail money in, for the artist pool. Throws if it cannot be saved,
      // which returns a 500 so PayPal delivers the event again.
      try {
        await recordRetailPayment(resource, subscriptionId);
      } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: 'retail payment not recorded, retry' }) };
      }

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

            // Tell them it renewed, but only when it IS a renewal.
            //
            // The first payment of a subscription fires this event too, and
            // the welcome receipt for that one is written by
            // verify-subscription.js (listeners) and TierUpgradePage (artists)
            // the moment the person is standing in front of the screen. The
            // renewal ledger from migration 124 is what tells the two apart:
            // more than one row for this subscription means this is not the
            // first payment.
            try {
              const { count } = await supabase
                .from('subscription_renewals')
                .select('id', { count: 'exact', head: true })
                .eq('paypal_subscription_id', subscriptionId);

              const isRenewal = (count || 0) > 1;
              const who = kind === 'artist'
                ? { artist_id: row.artist_id }
                : kind === 'listener'
                ? { user_id: row.user_id }
                : null;   // a venue has no personal inbox; the admin panel shows it

              if (isRenewal && who && until) {
                const when = new Date(until).toLocaleDateString('en-GB',
                  { day: 'numeric', month: 'long', year: 'numeric' });
                const { error: nErr } = await supabase.from('notifications').insert({
                  ...who,
                  type:    'subscription',
                  title:   'Your subscription renewed',
                  message: `Payment received. You are covered until ${when}.`,
                  metadata: { audience: kind, renewed_until: until, subscription: subscriptionId },
                });
                if (nErr) console.error('[paypal-webhook] renewal receipt refused:', nErr.code, nErr.message);
              }
            } catch (e) {
              console.error('[paypal-webhook] renewal receipt threw:', e.message);
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

  // ── A retail subscription payment refunded or reversed ───────────────────
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