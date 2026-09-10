// netlify/functions/retail-paypal-subscription.js
// Feelz Retail billing. Unlike the artist/listener tiers (fixed, pre-created
// PayPal Plan IDs for published prices), retail pricing is negotiated per
// venue, so the Plan itself is created dynamically here, priced at exactly
// what's in retail_subscriptions.monthly_fee — never trusted from the
// client. Requires: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV
// (optional, 'sandbox' or unset for live), SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// PAYPAL_ENV is not set in Netlify; PAYPAL_SANDBOX is. Reading the wrong one
// meant this function was always on live while payouts followed a different
// flag. See netlify/lib/paypal-env.js.
function paypalHost() {
  return paypalEnv.hostApi;
}

async function getPayPalAccessToken() {
  return new Promise((resolve, reject) => {
    const credentials = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');
    const payload = 'grant_type=client_credentials';
    const req = https.request({
      hostname: paypalHost(),
      path: '/v1/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.access_token) resolve(result.access_token);
          else reject(new Error('No access token: ' + data));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function paypalRequest(method, path, body, accessToken) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: paypalHost(),
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { action, venueId, subscriptionId } = body;
  if (!action || !venueId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'action and venueId required' }) };
  }

  // ── AUTHENTICATION ─────────────────────────────────────────────────────────
  //
  // There was none. This endpoint holds the service role key and, with
  // action:'link', flips retail_subscriptions and retail_venues to active for
  // any venueId the caller names. Anyone could activate any venue.
  //
  // The caller must now be signed in AND own the venue, or be an admin.
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  const { data: { user: caller }, error: authError } =
    await supabase.auth.getUser(authHeader.slice(7).trim());
  if (authError || !caller) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const [{ data: venueRow }, { data: adminRow }] = await Promise.all([
    supabase.from('retail_venues').select('id, user_id').eq('id', venueId).maybeSingle(),
    supabase.from('admins').select('id').eq('user_id', caller.id).maybeSingle(),
  ]);
  if (!venueRow) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Venue not found' }) };
  }
  if (venueRow.user_id !== caller.id && !adminRow) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Not your venue' }) };
  }

  try {
    // ========== GET OR CREATE PLAN ==========
    if (action === 'get-plan') {
      const { data: sub, error: subErr } = await supabase
        .from('retail_subscriptions')
        .select('id, venue_id, monthly_fee, paypal_plan_id, paypal_product_id, paypal_billed_usd, retail_venues(business_name)')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subErr || !sub) {
        return { statusCode: 404, body: JSON.stringify({ error: 'No subscription record for this venue — an admin needs to set one up first' }) };
      }
      if (!sub.monthly_fee || sub.monthly_fee <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'No fee set for this venue yet' }) };
      }
      if (sub.paypal_plan_id) {
        return { statusCode: 200, body: JSON.stringify({ planId: sub.paypal_plan_id, usdAmount: sub.paypal_billed_usd }) };
      }

      const accessToken = await getPayPalAccessToken();
      const venueName = sub.retail_venues?.business_name || 'Venue';

      // monthly_fee is entered and negotiated in ZAR, but the actual PayPal
      // charge has to be USD — ZAR-denominated billing plans didn't work
      // on this PayPal account when tried for artist tiers, so this
      // mirrors the same approach already proven there: negotiate and
      // display in ZAR, bill in USD behind the scenes.
      let usdAmount = parseFloat(sub.monthly_fee);
      try {
        const rateRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const rateData = await rateRes.json();
        const rate = rateData?.rates?.ZAR;
        if (rate && rate > 0) usdAmount = parseFloat(sub.monthly_fee) / rate;
      } catch (e) {
        console.error('Exchange rate fetch failed, billing raw ZAR figure as USD:', e.message);
      }
      const safeAmount = usdAmount.toFixed(2);

      let productId = sub.paypal_product_id;
      if (!productId) {
        const productResult = await paypalRequest('POST', '/v1/catalogs/products', {
          name: `Feelz Retail — ${venueName}`,
          type: 'SERVICE',
          category: 'SOFTWARE',
        }, accessToken);
        if (productResult.status !== 201) {
          return { statusCode: 400, body: JSON.stringify({ error: 'Failed to create PayPal product', details: productResult.body }) };
        }
        productId = productResult.body.id;
      }

      const planResult = await paypalRequest('POST', '/v1/billing/plans', {
        product_id: productId,
        name: `Feelz Retail Monthly — ${venueName}`,
        billing_cycles: [{
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: safeAmount, currency_code: 'USD' } },
        }],
        payment_preferences: {
          auto_bill_outstanding: true,
          payment_failure_threshold: 2,
        },
      }, accessToken);

      if (planResult.status !== 201) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Failed to create PayPal plan', details: planResult.body }) };
      }

      await supabase.from('retail_subscriptions')
        .update({ paypal_plan_id: planResult.body.id, paypal_product_id: productId, paypal_billed_usd: usdAmount })
        .eq('id', sub.id);

      return { statusCode: 200, body: JSON.stringify({ planId: planResult.body.id, usdAmount }) };
    }

    // ========== LINK APPROVED SUBSCRIPTION ==========
    if (action === 'link') {
      if (!subscriptionId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'subscriptionId required' }) };
      }

      const accessToken = await getPayPalAccessToken();
      const verify = await paypalRequest('GET', `/v1/billing/subscriptions/${subscriptionId}`, null, accessToken);
      if (verify.status !== 200) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Could not verify subscription with PayPal' }) };
      }

      const paypalStatus = verify.body.status; // APPROVAL_PENDING, APPROVED, ACTIVE, etc.

      // Both branches of this used to be 'active':
      //
      //     paypalStatus === 'ACTIVE' ? 'active' : 'active'
      //
      // so the PayPal status was computed and then thrown away, and an
      // APPROVAL_PENDING subscription — one nobody has paid for — activated
      // the venue and switched its player on. The comment said the webhook
      // would "confirm or correct later"; BILLING.SUBSCRIPTION.ACTIVATED only
      // ever sets active, so nothing ever corrected it.
      //
      // ACTIVE is a paid, running subscription. APPROVED means the payer
      // approved it but the first payment has not settled, so it waits for
      // the webhook — which is exactly the event that will set it active.
      if (paypalStatus !== 'ACTIVE' && paypalStatus !== 'APPROVED') {
        return {
          statusCode: 402,
          body: JSON.stringify({
            error: 'subscription_not_paid',
            paypal_status: paypalStatus,
            message: 'PayPal has not confirmed payment for this subscription yet.',
          }),
        };
      }
      const mappedStatus = paypalStatus === 'ACTIVE' ? 'active' : 'pending';

      const { error } = await supabase.from('retail_subscriptions')
        .update({ paypal_subscription_id: subscriptionId, status: mappedStatus })
        .eq('venue_id', venueId);
      if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      }

      // Flip the venue itself active too — no reason to make the venue
      // wait on a separate manual admin step once they've actually paid.
      // Only for a genuinely ACTIVE subscription: an APPROVED one has not
      // been charged yet, and the webhook will activate it when it is.
      if (mappedStatus === 'active') {
        const { error: venueErr } = await supabase.from('retail_venues')
          .update({ status: 'active' })
          .eq('id', venueId)
          .eq('status', 'pending');
        // Read, rather than discarded. A paying venue whose row silently
        // stays 'pending' has a player that never turns on, and the endpoint
        // used to return success anyway.
        if (venueErr) {
          console.error('[retail-paypal-subscription] venue activation failed:', venueErr.message);
          return {
            statusCode: 500,
            body: JSON.stringify({ error: 'subscription_linked_but_venue_not_activated', detail: venueErr.message }),
          };
        }
      }

      return { statusCode: 200, body: JSON.stringify({ success: true, status: paypalStatus }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };

  } catch (err) {
    console.error('Retail PayPal subscription error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};