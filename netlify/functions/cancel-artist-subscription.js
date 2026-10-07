// netlify/functions/cancel-artist-subscription.js
//
// Cancel an artist's tier subscription, at PayPal as well as in the database.
//
//
// WHY THIS EXISTS
//
// src/pages/TierUpgradePage.js used to cancel like this:
//
//   await supabase.from('artist_tier_subscriptions')
//     .update({ status: 'cancelled' }).eq('artist_id', artist.id)...
//   await supabase.from('artists').update({ tier: 'free' }).eq('id', artist.id);
//
// The first of those was silently refused. artist_tier_subscriptions has no
// UPDATE policy for artists, only for admins, and the result was never read.
// So the only thing that actually happened was the tier write. The artist lost
// their tier, the subscription row stayed at status 'active', and nothing ever
// told PayPal to stop. They kept being charged every month for a plan they
// could no longer use.
//
// Nobody has been hit yet only because every subscription but one is an admin
// grant rather than a card.
//
//
// ORDER OF OPERATIONS, AND WHY
//
// PayPal first, database second, and the database is NOT touched if PayPal
// refuses. Losing access while still being billed is the bug being fixed, and
// doing it in the other order just moves which failure causes it. If PayPal
// cannot be reached, the person keeps their tier and sees an error, which is
// the safe way round: they still have what they paid for.
//
// An admin grant has no PayPal agreement behind it, so it skips straight to
// the database. Those ids are written as 'admin_grant_<epoch>' by the admin
// pages, which is the same prefix expire_stale_subscriptions matches on.
//
// The artists.tier column is NOT written here. trg_sync_artist_tier derives it
// from the active subscription row, so cancelling the row moves the tier by
// itself. Writing it here as well is what let the browser set its own tier.

const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

// Same shape as getPayPalToken in paypal-webhook.js, same env vars, same host
// helper. Deliberately not refactored into a shared module: this is a money
// path and a shared edit would touch the webhook too.
async function getPayPalToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  return new Promise((resolve, reject) => {
    const body = 'grant_type=client_credentials';
    const req = https.request({
      hostname: paypalEnv.hostApi,
      path: '/v1/oauth2/token',
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try {
          const token = JSON.parse(d).access_token;
          if (!token) return reject(new Error('No access_token in PayPal response'));
          resolve(token);
        } catch { reject(new Error('Token parse failed')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// POST /v1/billing/subscriptions/{id}/cancel — the Subscriptions API, which is
// the same family of endpoints verify-subscription.js already reads from
// (GET /v1/billing/subscriptions/{id}). A success is 204 with no body.
async function cancelAtPayPal(subscriptionId, accessToken, reason) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ reason: reason || 'Cancelled by the subscriber' });
    const req = https.request({
      hostname: paypalEnv.hostApi,
      path: `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data || null; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'not_authenticated' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.slice(7).trim()
  );
  if (authErr || !user) return json(401, { error: 'not_authenticated' });

  // The caller's own artist profile. Nothing here takes an artist id from the
  // request, so one artist cannot cancel another's subscription.
  const { data: artist, error: artistErr } = await supabase
    .from('artists')
    .select('id, artist_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (artistErr) {
    console.error('[cancel-artist-subscription] artist lookup failed:', artistErr.message);
    return json(500, { error: 'lookup_failed' });
  }
  if (!artist) return json(404, { error: 'no_artist_profile' });

  const { data: subs, error: subErr } = await supabase
    .from('artist_tier_subscriptions')
    .select('id, paypal_subscription_id, payment_provider, status')
    .eq('artist_id', artist.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);

  if (subErr) {
    console.error('[cancel-artist-subscription] subscription lookup failed:', subErr.message);
    return json(500, { error: 'lookup_failed' });
  }

  const sub = subs?.[0];
  if (!sub) return json(404, { error: 'no_active_subscription' });

  const payPalId = sub.paypal_subscription_id || '';
  const isAdminGrant = sub.payment_provider === 'admin_grant'
    || payPalId.startsWith('admin_grant');

  let paypalResult = 'skipped_admin_grant';

  if (!isAdminGrant) {
    if (!payPalId) {
      // An active row that claims a real payment provider but carries no
      // agreement id. Refusing is right: cancelling the row here would stop
      // access while whatever is billing them carries on.
      console.error('[cancel-artist-subscription] active paid row with no paypal id, sub', sub.id);
      return json(409, { error: 'no_paypal_id_on_subscription' });
    }

    let token;
    try {
      token = await getPayPalToken();
    } catch (e) {
      console.error('[cancel-artist-subscription] PayPal token failed:', e.message);
      return json(502, { error: 'paypal_unavailable' });
    }

    let res;
    try {
      res = await cancelAtPayPal(payPalId, token, 'Cancelled from Feelz Machine');
    } catch (e) {
      console.error('[cancel-artist-subscription] PayPal cancel threw:', e.message);
      return json(502, { error: 'paypal_unavailable' });
    }

    const alreadyGone = res.status === 422
      && JSON.stringify(res.body || '').includes('SUBSCRIPTION_STATUS_INVALID');

    if (res.status === 204 || res.status === 200) {
      paypalResult = 'cancelled';
    } else if (res.status === 404 || alreadyGone) {
      // Already cancelled or expired at PayPal, or no such agreement. Nothing
      // is billing them, so the database should catch up rather than refuse.
      console.warn('[cancel-artist-subscription] PayPal says already inactive',
        payPalId, res.status);
      paypalResult = 'already_inactive';
    } else {
      // Anything else and the database is left alone on purpose. They keep the
      // tier they are still paying for.
      console.error('[cancel-artist-subscription] PayPal refused',
        payPalId, res.status, JSON.stringify(res.body || '').slice(0, 300));
      return json(502, { error: 'paypal_refused', paypalStatus: res.status });
    }
  }

  // Only now. trg_sync_artist_tier moves artists.tier off the back of this.
  const { error: updErr } = await supabase
    .from('artist_tier_subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: 'user_cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', sub.id);

  if (updErr) {
    // PayPal is already cancelled at this point, so say so plainly rather than
    // reporting a clean failure. They are not being billed, but the tier may
    // still show until the webhook's BILLING.SUBSCRIPTION.CANCELLED lands.
    console.error('[cancel-artist-subscription] PayPal cancelled but db update failed:',
      updErr.message, 'sub', sub.id);
    return json(500, { error: 'cancelled_at_paypal_but_not_recorded' });
  }

  return json(200, { cancelled: true, paypal: paypalResult });
};