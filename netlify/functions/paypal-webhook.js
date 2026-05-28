// netlify/functions/paypal-webhook.js
// Verifies PayPal webhook signature and handles all relevant events.
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getPayPalToken() {
  const base = process.env.PAYPAL_ENV === 'sandbox' ? 'api.sandbox.paypal.com' : 'api.paypal.com';
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
  const base = process.env.PAYPAL_ENV === 'sandbox' ? 'api.sandbox.paypal.com' : 'api.paypal.com';
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
  const { error } = await supabase
    .from('artist_tier_subscriptions')
    .update({
      status:     'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason || 'paypal_webhook',
    })
    .eq('paypal_subscription_id', subscriptionId);
  if (error) console.error('Cancel subscription error:', error);
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
    const orderId = resource?.supplementary_data?.related_ids?.order_id;
    if (orderId) {
      await supabase.from('payouts').update({ status: 'paid' }).eq('transaction_id', orderId);
    }
  }

  // ── Subscription activated (new sign-up or reactivation) ─────────────────
  if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
    const subscriptionId = resource?.id;
    await activateArtistSubscription(subscriptionId);
  }

  // ── Subscription cancelled by user from PayPal dashboard ─────────────────
  if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
    const subscriptionId = resource?.id;
    await cancelArtistSubscription(subscriptionId, 'user_cancelled');
  }

  // ── Subscription suspended (payment failed repeatedly) ───────────────────
  if (eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
    const subscriptionId = resource?.id;
    await cancelArtistSubscription(subscriptionId, 'payment_failed');
  }

  // ── Subscription expired ──────────────────────────────────────────────────
  if (eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
    const subscriptionId = resource?.id;
    await cancelArtistSubscription(subscriptionId, 'expired');
  }

  // ── Subscription payment completed (renewal) ─────────────────────────────
  if (eventType === 'PAYMENT.SALE.COMPLETED') {
    const subscriptionId = resource?.billing_agreement_id;
    if (subscriptionId) {
      // Ensure status is active in case it was briefly suspended
      await activateArtistSubscription(subscriptionId);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};