// netlify/functions/addon-subscription.js
//
// The Instagram add-on subscription (migration 153).
//
//   action 'status'  price, whether it is live, waitlist count and target, and
//                    the caller's own add-on row (if signed in as an artist)
//   action 'plan'    the PayPal plan id for the current price. Built once and
//                    reused; a new one is built only if the price changes.
//                    Refused while the add-on is not live, so nobody can be
//                    charged for a service that is not running yet.
//   action 'link'    after the artist approves in PayPal: checks with PayPal
//                    that the subscription is on OUR add-on plan, is active,
//                    and is not already linked to someone else, then records it.
//
// Renewals, cancellations and failed payments arrive through paypal-webhook.js.
// This is platform income (it pays for the distributor), billed to the
// platform PayPal like the artist tiers.

const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAYPAL_API = `https://${paypalEnv.hostApiM}`;
const ADDON = 'instagram';

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function settings() {
  const keys = ['monthly_usd', 'live', 'waitlist_target', 'paypal_product_id', 'paypal_plan_id', 'paypal_plan_usd']
    .map(k => `addon_${ADDON}_${k}`);
  const { data } = await supabase.from('platform_settings').select('key, value').in('key', keys);
  const m = Object.fromEntries((data || []).map(r => [r.key.replace(`addon_${ADDON}_`, ''), r.value]));
  const price = parseFloat(m.monthly_usd);
  return {
    priceUsd: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
    live: String(m.live).toLowerCase() === 'true',
    target: parseInt(m.waitlist_target, 10) || 0,
    productId: m.paypal_product_id || null,
    planId: m.paypal_plan_id || null,
    planUsd: parseFloat(m.paypal_plan_usd) || null,
  };
}

async function saveSetting(key, value) {
  const { error } = await supabase.from('platform_settings')
    .upsert({ key: `addon_${ADDON}_${key}`, value: String(value), updated_at: new Date().toISOString() });
  if (error) console.error('[addon-subscription] could not save', key, error.message);
  return !error;
}

async function paypalToken() {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const b = await res.json().catch(() => ({}));
  if (!b.access_token) throw new Error('PayPal sign-in failed');
  return b.access_token;
}

async function paypal(method, path, token, body) {
  const res = await fetch(`${PAYPAL_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function artistFor(event) {
  const h = event.headers?.authorization || event.headers?.Authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabase.auth.getUser(h.slice(7).trim());
  if (!user) return null;
  const { data: artist } = await supabase.from('artists').select('id, artist_name').eq('user_id', user.id).limit(1).maybeSingle();
  return artist || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  try {
    const s = await settings();

    if (body.action === 'status') {
      const artist = await artistFor(event);
      const { data: count } = await supabase.rpc('addon_waitlist_count', { p_addon: ADDON });
      let mine = null;
      if (artist) {
        const { data } = await supabase.from('artist_addons')
          .select('status, current_period_end').eq('artist_id', artist.id).eq('addon', ADDON).maybeSingle();
        mine = data || null;
      }
      return json(200, { priceUsd: s.priceUsd, live: s.live, waitlistCount: Number(count) || 0, target: s.target, mine });
    }

    const artist = await artistFor(event);
    if (!artist) return json(401, { error: 'Sign in with your artist account.' });

    if (body.action === 'plan') {
      if (!s.live) return json(409, { error: 'The Instagram add-on is not open yet. Join the waitlist instead.' });
      if (!s.priceUsd) return json(503, { error: 'No price set.' });
      if (s.planId && s.planUsd === s.priceUsd) return json(200, { planId: s.planId, priceUsd: s.priceUsd });

      const token = await paypalToken();
      let productId = s.productId;
      if (!productId) {
        const pr = await paypal('POST', '/v1/catalogs/products', token, {
          name: 'Feelz Machine Instagram add-on', type: 'SERVICE', category: 'SOFTWARE',
        });
        if (pr.status !== 201) {
          console.error('[addon-subscription] product refused:', pr.status, JSON.stringify(pr.body).slice(0, 400));
          return json(502, { error: 'Billing could not be set up right now. Try again shortly.' });
        }
        productId = pr.body.id;
        await saveSetting('paypal_product_id', productId);
      }
      const plan = await paypal('POST', '/v1/billing/plans', token, {
        product_id: productId,
        name: 'Instagram add-on, monthly',
        billing_cycles: [{
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR', sequence: 1, total_cycles: 0,
          pricing_scheme: { fixed_price: { value: s.priceUsd.toFixed(2), currency_code: 'USD' } },
        }],
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
      });
      if (plan.status !== 201) {
        console.error('[addon-subscription] plan refused:', plan.status, JSON.stringify(plan.body).slice(0, 400));
        return json(502, { error: 'Billing could not be set up right now. Try again shortly.' });
      }
      await saveSetting('paypal_plan_id', plan.body.id);
      await saveSetting('paypal_plan_usd', s.priceUsd);
      return json(200, { planId: plan.body.id, priceUsd: s.priceUsd });
    }

    if (body.action === 'link') {
      const subId = String(body.subscriptionID || '');
      if (!subId) return json(400, { error: 'subscriptionID required' });
      const token = await paypalToken();
      const v = await paypal('GET', `/v1/billing/subscriptions/${encodeURIComponent(subId)}`, token);
      if (v.status !== 200) return json(400, { error: 'Could not check the subscription with PayPal.' });
      if (!s.planId || v.body.plan_id !== s.planId) return json(400, { error: 'That subscription is not for the Instagram add-on.' });

      const { data: other } = await supabase.from('artist_addons')
        .select('artist_id').eq('paypal_subscription_id', subId).maybeSingle();
      if (other && other.artist_id !== artist.id) return json(409, { error: 'That subscription belongs to another account.' });

      const active = v.body.status === 'ACTIVE';
      const next = v.body.billing_info?.next_billing_time || null;
      const { error } = await supabase.from('artist_addons').upsert({
        artist_id: artist.id, addon: ADDON,
        status: active ? 'active' : 'pending',
        paypal_subscription_id: subId, paypal_plan_id: v.body.plan_id,
        current_period_end: next, activated_at: active ? new Date().toISOString() : null,
        cancelled_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'artist_id,addon' });
      if (error) {
        console.error('[addon-subscription] link save failed:', error.message);
        return json(500, { error: 'Your payment went through but we could not switch the add-on on. Refresh, and contact us if it does not show.' });
      }
      return json(200, { ok: true, status: active ? 'active' : 'pending' });
    }

    return json(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('[addon-subscription] failed:', e.message);
    return json(500, { error: 'Something went wrong. Try again.' });
  }
};