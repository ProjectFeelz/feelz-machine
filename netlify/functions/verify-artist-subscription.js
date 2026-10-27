// netlify/functions/verify-artist-subscription.js
//
// Grants an artist tier ONLY after PayPal confirms the subscription is real.
//
//
// WHAT THIS REPLACES, AND WHY IT HAD TO
//
// TierUpgradePage.handleSubscriptionSuccess took `data.subscriptionID` from
// the PayPal button and then wrote the artist_tier_subscriptions row straight
// from the browser.
//
// That write is refused. artist_tier_subscriptions carries three policies and
// not one of them lets an artist insert:
//
//   Admin can manage tier subscriptions   ALL     admins only
//   Admins can read all ...               SELECT  admins only
//   Artists see own subscription          SELECT  own row
//
// There is no INSERT policy for an ordinary artist, so the insert comes back
// 42501 every time, the page throws, and the buyer is shown
// "Failed to activate subscription: new row violates row-level security
// policy". PayPal has already taken the money by then. The webhook cannot
// rescue it either: BILLING.SUBSCRIPTION.ACTIVATED only UPDATEs a row
// matching the subscription id, and there is no row to match, so it updates
// nothing and reports nothing, because zero rows updated is not an error.
//
// The result is a paying artist on the Free plan with no record anywhere that
// they ever paid. Every row in that table today is an admin_grant except one,
// which is the shape of a signup path that has not worked.
//
// The fix is not an INSERT policy. That would hand every artist the ability to
// write their own subscription row with any id they like, which is precisely
// the hole verify-subscription.js was written to close on the listener side.
// So the grant moves here: the id goes to PayPal, PayPal says whether it is
// real, active, and for one of our plans, and only then is anything written,
// with the service role, so RLS cannot silently refuse it.

const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAYPAL_BASE = paypalEnv.baseApiM;

// The plan ids are set in Netlify under the REACT_APP_ names, because the
// browser needs them to build the button. A function reads the same variables
// without the prefix: REACT_APP_ only means anything to the React build. Both
// spellings are accepted so this works whether or not server-side copies are
// added later.
function planId(name) {
  return process.env[`PAYPAL_${name}`] || process.env[`REACT_APP_PAYPAL_${name}`] || '';
}

const PLANS = {
  pro:     { monthly: planId('PRO_MONTHLY_PLAN_ID'),     annual: planId('PRO_ANNUAL_PLAN_ID') },
  premium: { monthly: planId('PREMIUM_MONTHLY_PLAN_ID'), annual: planId('PREMIUM_ANNUAL_PLAN_ID') },
};

async function getPayPalAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
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

  const subscriptionId = body.subscription_id;
  if (!subscriptionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'subscription_id required' }) };
  }

  // The caller must be signed in, and the tier is granted to THEIR artist,
  // never to an artist id supplied in the request. A body you control should
  // not be able to name who gets the benefit.
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };
  }

  const { data: artist, error: artistErr } = await supabase
    .from('artists').select('id, artist_name').eq('user_id', user.id).maybeSingle();
  if (artistErr || !artist) {
    return { statusCode: 404, body: JSON.stringify({ error: 'No artist profile on this account.' }) };
  }

  try {
    // ── Ask PayPal ─────────────────────────────────────────────────────────
    const token = await getPayPalAccessToken();
    const res = await fetch(
      `${PAYPAL_BASE}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    const sub = await res.json();

    if (!res.ok) {
      console.error('[verify-artist-subscription] PayPal rejected the lookup:', res.status, sub?.message);
      return { statusCode: 400, body: JSON.stringify({ error: 'We could not confirm that subscription with PayPal.' }) };
    }

    // ACTIVE is the normal answer. APPROVED means the buyer has approved it
    // and PayPal has not started billing yet, which resolves on its own and
    // the webhook finishes the job.
    //
    // APPROVAL_PENDING is the state a subscription sits in BEFORE the buyer
    // approves it, so it is refused: opening the button and closing the window
    // without paying must not grant anything.
    if (!['ACTIVE', 'APPROVED'].includes(sub.status)) {
      console.warn('[verify-artist-subscription] refusing status', sub.status, 'for', subscriptionId);
      return {
        statusCode: 402,
        body: JSON.stringify({ error: `That subscription is ${String(sub.status || 'not active').toLowerCase()}.` }),
      };
    }

    // ── Someone else's subscription cannot be claimed ──────────────────────
    const { data: taken } = await supabase
      .from('artist_tier_subscriptions')
      .select('artist_id')
      .eq('paypal_subscription_id', subscriptionId)
      .maybeSingle();
    if (taken && taken.artist_id !== artist.id) {
      console.error('[verify-artist-subscription] already linked to another artist:', subscriptionId);
      return { statusCode: 409, body: JSON.stringify({ error: 'That subscription is already linked to another account.' }) };
    }

    // ── The tier and the cycle come from the PLAN, not from the request ────
    //
    // sub.plan_id is PayPal's own answer to what was bought. Matching it
    // against the four configured plans settles both questions at once: which
    // tier to grant, and for how long. Taking either from the request body
    // would let a monthly Pro buyer ask for an annual Premium.
    let tierSlug = null;
    let cycle    = null;
    for (const slug of ['pro', 'premium']) {
      for (const c of ['monthly', 'annual']) {
        if (PLANS[slug][c] && sub.plan_id === PLANS[slug][c]) { tierSlug = slug; cycle = c; }
      }
    }

    if (!tierSlug) {
      const anyConfigured = Object.values(PLANS).some(p => p.monthly || p.annual);
      if (!anyConfigured) {
        // No plan ids set at all. Refusing here would lock out every real
        // buyer over a missing env var, so fall back to the client's claim,
        // loudly enough that it gets fixed.
        console.error('[verify-artist-subscription] no PAYPAL_*_PLAN_ID set — '
          + 'falling back to the client-supplied tier and cycle, which cannot be trusted.');
        tierSlug = body.tier_slug === 'premium' ? 'premium' : 'pro';
        cycle    = body.billing_cycle === 'annual' ? 'annual' : 'monthly';
      } else {
        console.error('[verify-artist-subscription] REFUSED: plan mismatch',
          JSON.stringify({ subscriptionId, got: sub.plan_id || null }));
        return { statusCode: 400, body: JSON.stringify({ error: 'That subscription is not for an artist plan.' }) };
      }
    }

    const { data: tier, error: tierErr } = await supabase
      .from('platform_tiers').select('id, name').eq('slug', tierSlug).maybeSingle();
    if (tierErr || !tier) {
      console.error('[verify-artist-subscription] tier row missing for slug', tierSlug);
      return { statusCode: 500, body: JSON.stringify({ error: 'Tier not configured. We have been told.' }) };
    }

    const days      = cycle === 'annual' ? 365 : 30;
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

    // Retire any other active subscription for this artist first, so the tier
    // trigger has exactly one active row to derive from.
    const { error: retireErr } = await supabase
      .from('artist_tier_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'replaced', updated_at: new Date().toISOString() })
      .eq('artist_id', artist.id)
      .eq('status', 'active')
      .neq('paypal_subscription_id', subscriptionId);
    if (retireErr) console.error('[verify-artist-subscription] could not retire old subscription:', retireErr.message);

    // Upsert, so a webhook that arrived first does not cause a duplicate and a
    // retry from the browser is harmless. onConflict needs the unique index
    // from migration 207.
    const { error: upsertErr } = await supabase
      .from('artist_tier_subscriptions')
      .upsert({
        artist_id:              artist.id,
        tier_id:                tier.id,
        status:                 'active',
        paypal_subscription_id: subscriptionId,
        billing_cycle:          cycle,
        payment_provider:       'paypal_web',
        started_at:             new Date().toISOString(),
        expires_at:             expiresAt,
        updated_at:             new Date().toISOString(),
      }, { onConflict: 'paypal_subscription_id' });

    // Read, not discarded. This is the write that decides whether someone who
    // has just paid gets what they paid for, and discarding it is how the
    // browser version failed silently for a month.
    if (upsertErr) {
      console.error('[verify-artist-subscription] SUBSCRIPTION ROW REFUSED — paid, not granted.',
        'code=', upsertErr.code, 'msg=', upsertErr.message,
        'artist=', artist.id, 'sub=', subscriptionId);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Your payment went through but we could not switch your account over. '
               + 'Nothing further is owed — send us this reference and we will fix it: ' + subscriptionId,
        }),
      };
    }

    // artists.tier is derived by trg_sync_artist_tier from the active
    // subscription, so it is not written here. current_tier_id is the pointer
    // the dashboard reads for limits, and that one is ours to set.
    const { error: mirrorErr } = await supabase
      .from('artists')
      .update({ current_tier_id: tier.id, updated_at: new Date().toISOString() })
      .eq('id', artist.id);
    if (mirrorErr) console.error('[verify-artist-subscription] could not set current_tier_id:', mirrorErr.message);

    // ── The receipt ────────────────────────────────────────────────────────
    // Written with the service role rather than from the browser, so it does
    // not depend on the buyer's tab surviving the round trip back from PayPal.
    try {
      const renews = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const { error: notifErr } = await supabase.from('notifications').insert({
        artist_id: artist.id,
        user_id:   user.id,
        type:      'subscription',
        title:     `Artist ${tier.name} is live`,
        message:   `Your new upload and payout limits are active. Renews ${renews}.`,
        email_requested: true,
        metadata: {
          audience:      'artist',
          tier:          tierSlug,
          billing_cycle: cycle,
          expires_at:    expiresAt,
          subscription:  subscriptionId,
        },
      });
      if (notifErr) console.error('[verify-artist-subscription] receipt refused (subscription is fine):', notifErr.code, notifErr.message);
    } catch (e) {
      console.error('[verify-artist-subscription] receipt threw (subscription is fine):', e.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, tier: tierSlug, tier_name: tier.name, billing_cycle: cycle, expires_at: expiresAt }),
    };

  } catch (err) {
    console.error('[verify-artist-subscription] failed:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'We could not confirm that subscription. If PayPal has taken the payment, '
             + 'send us this reference and we will fix it: ' + subscriptionId,
      }),
    };
  }
};
