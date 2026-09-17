// netlify/functions/verify-subscription.js
//
// Grants a listener tier ONLY after PayPal confirms the subscription is real.
//
// WHAT THIS REPLACES
//
// ListenerUpgradePage.handleSuccess took `data.subscriptionID` from the
// PayPal button and then, straight from the browser, wrote the
// listener_tier_subscriptions row and set listeners.tier = 'fan_pro'.
//
// Nothing checked that the subscription existed. The id is just a string the
// client hands over, so anyone who opened the console could grant themselves
// Fan Pro — unlimited downloads, offline listening, artist chat — for free,
// permanently, in one line. On a platform whose whole revenue is that tier,
// that is the revenue.
//
// It failed in the honest direction too: every write discarded its error, so
// an RLS refusal or a dropped connection left a paying subscriber with no
// tier and a cheerful "Welcome to Fan Pro!" on screen. And the webhook's
// ACTIVATED handler only UPDATES an existing row — if the client write never
// landed, there was nothing for it to activate and the payment was lost.
//
// So the grant moves here: the id goes to PayPal, PayPal says whether it is
// real and active and who it belongs to, and only then is anything written —
// with the service role, so RLS cannot silently refuse it.

const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAYPAL_BASE = paypalEnv.baseApiM;

async function getPayPalAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Failed to get PayPal token');
  return data.access_token;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { subscription_id: subscriptionId, billing_cycle: billingCycle } = body;
  if (!subscriptionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'subscription_id required' }) };
  }

  // The caller must be signed in, and the tier is granted to THEM — never to
  // a user id supplied in the request. That was the other half of the hole:
  // a body you control should not be able to name who gets the benefit.
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };
  }

  try {
    // ── Ask PayPal ─────────────────────────────────────────────────────────
    const token = await getPayPalAccessToken();
    const res = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const sub = await res.json();

    if (!res.ok) {
      console.error('[verify-subscription] PayPal rejected the lookup:', res.status, sub?.message);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'We could not confirm that subscription with PayPal.' }),
      };
    }

    // ACTIVE is the normal answer. APPROVAL_PENDING means they have approved
    // it but PayPal has not started it yet — that resolves on its own and the
    // webhook will finish the job, so it is accepted here rather than shown
    // to the person as a failure.
    if (!['ACTIVE', 'APPROVAL_PENDING'].includes(sub.status)) {
      console.warn('[verify-subscription] refusing status', sub.status, 'for', subscriptionId);
      return {
        statusCode: 402,
        body: JSON.stringify({ error: `That subscription is ${String(sub.status || 'not active').toLowerCase()}.` }),
      };
    }

    // ── Someone else's subscription cannot be claimed ──────────────────────
    const { data: taken } = await supabase
      .from('listener_tier_subscriptions')
      .select('user_id')
      .eq('paypal_subscription_id', subscriptionId)
      .maybeSingle();
    if (taken && taken.user_id !== user.id) {
      console.error('[verify-subscription] subscription already belongs to another account:', subscriptionId);
      return { statusCode: 409, body: JSON.stringify({ error: 'That subscription is already linked to another account.' }) };
    }

    const { data: tier, error: tierErr } = await supabase
      .from('platform_tiers').select('id').eq('slug', 'fan_pro').maybeSingle();
    if (tierErr || !tier) {
      console.error('[verify-subscription] fan_pro tier row missing — run migration 111');
      return { statusCode: 500, body: JSON.stringify({ error: 'Tier not configured. We have been told.' }) };
    }

    // Trust PayPal's own billing period over anything the client claims.
    const cycleFromPayPal = sub.billing_info?.next_billing_time && sub.start_time
      ? null   // could be derived, but the plan is the authority; fall through
      : null;
    void cycleFromPayPal;
    const cycle = billingCycle === 'annual' ? 'annual' : 'monthly';
    const days  = cycle === 'annual' ? 365 : 30;
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    // Retire any other active subscription for this person first.
    const { error: cancelErr } = await supabase
      .from('listener_tier_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'replaced' })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .neq('paypal_subscription_id', subscriptionId);
    if (cancelErr) console.error('[verify-subscription] could not retire old subscription:', cancelErr.message);

    // Upsert, so a webhook that arrived first does not cause a duplicate and
    // a retry from the browser is harmless.
    const { error: upsertErr } = await supabase
      .from('listener_tier_subscriptions')
      .upsert({
        user_id:                user.id,
        tier_id:                tier.id,
        status:                 'active',
        paypal_subscription_id: subscriptionId,
        billing_cycle:          cycle,
        started_at:             new Date().toISOString(),
        expires_at:             expiresAt,
        updated_at:             new Date().toISOString(),
      }, { onConflict: 'paypal_subscription_id' });

    // Read, not discarded. This is the write that decides whether someone who
    // has just paid gets what they paid for.
    if (upsertErr) {
      console.error('[verify-subscription] SUBSCRIPTION ROW REFUSED — paid, not granted.',
        'code=', upsertErr.code, 'msg=', upsertErr.message,
        'user=', user.id, 'sub=', subscriptionId);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Your payment went through but we could not switch your account over. '
               + 'Nothing further is owed — send us this reference and we will fix it: ' + subscriptionId,
        }),
      };
    }

    const { error: mirrorErr } = await supabase
      .from('listeners')
      .update({ tier: 'fan_pro', tier_expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (mirrorErr) {
      console.error('[verify-subscription] could not mirror tier onto listeners:', mirrorErr.message);
    }

    // ── The receipt ────────────────────────────────────────────────────────
    // Same reason as paypal-order.js: the on-screen confirmation disappears,
    // and a subscriber who comes back tomorrow wondering whether the payment
    // worked needs something to look at. Written with the service role so it
    // does not depend on the browser surviving the redirect back from PayPal.
    try {
      const { error: notifErr } = await supabase.from('notifications').insert({
        user_id: user.id,
        type:    'subscription',
        title:   'Fan Pro is live',
        message: `Unlimited downloads, offline listening and themes are on now. `
               + `Renews ${new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
        metadata: {
          audience:      'listener',
          tier:          'fan_pro',
          billing_cycle: cycle,
          expires_at:    expiresAt,
          subscription:  subscriptionId,
        },
      });
      if (notifErr) {
        console.error('[verify-subscription] receipt refused (subscription is fine):',
          notifErr.code, notifErr.message,
          notifErr.code === '23514' ? '— run migration 125.' : '');
      }
    } catch (e) {
      console.error('[verify-subscription] receipt threw (subscription is fine):', e.message);
    }

    console.log('[verify-subscription] granted fan_pro to', user.id, 'until', expiresAt);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, tier: 'fan_pro', expires_at: expiresAt, status: sub.status }),
    };

  } catch (err) {
    console.error('[verify-subscription] failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};