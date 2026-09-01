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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function paypalHost() {
  return process.env.PAYPAL_ENV === 'sandbox' ? 'api.sandbox.paypal.com' : 'api.paypal.com';
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

  try {
    // ========== GET OR CREATE PLAN ==========
    if (action === 'get-plan') {
      const { data: sub, error: subErr } = await supabase
        .from('retail_subscriptions')
        .select('id, venue_id, monthly_fee, paypal_plan_id, paypal_product_id, retail_venues(business_name)')
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
        return { statusCode: 200, body: JSON.stringify({ planId: sub.paypal_plan_id }) };
      }

      const accessToken = await getPayPalAccessToken();
      const venueName = sub.retail_venues?.business_name || 'Venue';
      const safeAmount = parseFloat(sub.monthly_fee).toFixed(2);

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
          pricing_scheme: { fixed_price: { value: safeAmount, currency_code: 'ZAR' } },
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
        .update({ paypal_plan_id: planResult.body.id, paypal_product_id: productId })
        .eq('id', sub.id);

      return { statusCode: 200, body: JSON.stringify({ planId: planResult.body.id }) };
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
      const mappedStatus = paypalStatus === 'ACTIVE' ? 'active' : 'active'; // treat approved+active as active; webhook confirms/corrects later

      const { error } = await supabase.from('retail_subscriptions')
        .update({ paypal_subscription_id: subscriptionId, status: mappedStatus })
        .eq('venue_id', venueId);
      if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      }

      // Flip the venue itself active too — no reason to make the venue
      // wait on a separate manual admin step once they've actually paid.
      await supabase.from('retail_venues')
        .update({ status: 'active' })
        .eq('id', venueId)
        .eq('status', 'pending');

      return { statusCode: 200, body: JSON.stringify({ success: true, status: paypalStatus }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };

  } catch (err) {
    console.error('Retail PayPal subscription error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};