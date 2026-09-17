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
  const { data: sub } = await supabase
    .from('retail_subscriptions')
    .update({ status: 'active' })
    .eq('paypal_subscription_id', subscriptionId)
    .select('venue_id')
    .maybeSingle();
  // A venue whose payment just went through shouldn't sit waiting on a
  // separate manual admin step to actually turn the player on.
  if (sub?.venue_id) {
    await supabase.from('retail_venues')
      .update({ status: 'active' })
      .eq('id', sub.venue_id)
      .eq('status', 'pending');
  }
}

async function cancelRetailSubscription(subscriptionId, reason) {
  if (!subscriptionId) return;
  const { data: sub } = await supabase
    .from('retail_subscriptions')
    .update({ status: 'cancelled' })
    .eq('paypal_subscription_id', subscriptionId)
    .select('venue_id')
    .maybeSingle();
  // Access follows payment — if billing stopped, the player stops too.
  if (sub?.venue_id) {
    await supabase.from('retail_venues')
      .update({ status: 'suspended' })
      .eq('id', sub.venue_id)
      .eq('status', 'active');
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
    }
    if (orderId) {
      await supabase.from('purchases').update({ status: 'completed' }).eq('paypal_transaction_id', orderId).catch(() => {});
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

      // ── Push the expiry out by one billing period ──────────────────────
      //
      // This was missing, and it is the reason a paying subscriber loses
      // access. ListenerUpgradePage sets expires_at to signup + 30 days;
      // nothing ever moved it again. useTier.js reads it and treats an
      // expired row as free. So on day 31 PayPal charges them, this handler
      // fires, the affiliate gets paid — and the subscriber drops to Free
      // while the money keeps leaving their account every month.
      //
      // extend_listener_subscription (migration 120) extends from the LATER
      // of now and the current expiry, so an early renewal cannot shorten a
      // subscription and a duplicated webhook cannot double it. It reads the
      // row's own billing_cycle, so an annual plan is not renewed by a month.
      try {
        const { data: extended, error: extErr } = await supabase
          .rpc('extend_listener_subscription', { p_paypal_subscription_id: subscriptionId });
        if (extErr) {
          console.error('[paypal-webhook] could not extend subscription', subscriptionId, extErr.message);
        } else if (extended?.length) {
          console.log('[paypal-webhook] subscription extended to', extended[0].new_expiry,
            'for user', extended[0].user_id);
        }
        // No row found is normal here — this event also fires for artist and
        // retail subscriptions, which the two calls above already handled.
      } catch (e) {
        console.error('[paypal-webhook] extend threw:', e.message);
      }

      // ── Affiliate commission ──────────────────────────────────────────────
      // This is the only place on the platform where affiliate money is
      // earned, and this event is the right one: it is money that has actually
      // arrived, and it fires on the first payment and on every renewal, so a
      // referrer keeps earning for as long as the person they referred keeps
      // paying.
      //
      // 20% of the payment, identical for artist, beatmaker and listener
      // affiliates — see migration 105 for why that rate and not a flat
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
          // not being paid, which is the single worst way for this to fail —
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
        console.warn('[paypal-webhook] PAYMENT.SALE.COMPLETED with no usable amount/sale id — no commission awarded', { subscriptionId, saleId, amount, currency });
      }
    }
  }

  // ── Payment reversed / refunded ───────────────────────────────────────────
  if (eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'PAYMENT.CAPTURE.REVERSED') {
    const captureId = resource?.id || resource?.supplementary_data?.related_ids?.capture_id;
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

  // ── Dispute opened — flag for admin review ────────────────────────────────
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