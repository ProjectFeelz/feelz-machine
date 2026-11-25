/**
 * netlify/functions/tier-paystack-subscription.js
 *
 * Paid tiers, bought in rand. Artist plans and Fan Pro, one endpoint.
 *
 * The sister of the PayPal routes in TierUpgradePage.js and FanProPage, which
 * bill in dollars. A subscriber uses one or the other, and the difference is
 * where they live: PayPal cannot take rand at all, so a South African paying a
 * dollar price pays their bank's conversion fee on top, if the card goes
 * through at all.
 *
 * Which kind of subscriber this is comes from the request as `subject`, and
 * everything that differs between them lives in netlify/lib/tierPaystackSub.js
 * rather than here.
 *
 *
 * WHAT MAKES THIS SAFE, AND WHAT IT LEARNED FROM THE PAYPAL SIDE
 *
 * Nothing is granted before the money arrives. The old PayPal path wrote the
 * subscription row from the browser, which RLS refused, which left artists who
 * had paid sitting on the Free plan with no record anywhere. The fix there was
 * to move the write server-side; the fix here is simpler, because no row
 * exists until a verified charge creates one.
 *
 * Every checkout carries a reference this site issued and stored first. A
 * PayPal subscription created without custom_id could not be matched to a
 * person afterwards, and one of them sat unrecorded for two days. The intent
 * row is written BEFORE the artist leaves, and the checkout is refused if that
 * write fails, because a payment that cannot be recorded is not a payment
 * worth taking.
 *
 *
 * HOW THE PRICE IS WORKED OUT
 *
 * The tier's dollar price, converted at the live rate, the same way every
 * other rand charge on this platform is worked out. That amount is then fixed
 * into a Paystack plan, because a Paystack plan's amount cannot change.
 *
 * Plans are cached in paystack_tier_plans by tier, cycle and rand amount, so
 * one plan serves every artist on that price rather than one plan per artist.
 * And the rand price is held steady on purpose: while a cached plan is within
 * PRICE_DRIFT_PCT of today's converted price, it is reused. The shop window
 * does not change every time the rand twitches, and an artist already paying
 * keeps the price they agreed to.
 *
 * Requires: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * PAYSTACK_ALLOW_TEST=true lifts the live-key guard for working on the flow.
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const pricing = require('../lib/pricing');
const fxRate = require('../lib/fxRate');
const tierSub = require('../lib/tierPaystackSub');

const PAYSTACK_BASE = 'https://api.paystack.co';
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const SITE = process.env.URL || 'https://www.feelzmachine.com';

// Live only when the key says live. A missing key, a test key or anything
// unrecognised all count as not live, so the failure direction is the safe
// one. Same rule as paystack-checkout.js and the retail route.
const ALLOW_TEST = process.env.PAYSTACK_ALLOW_TEST === 'true';
const PAYSTACK_IS_LIVE = Boolean(SECRET) && (String(SECRET).startsWith('sk_live_') || ALLOW_TEST);

// Paystack takes integer minor units and refuses anything under 100 of them.
const MIN_MINOR = 100;

// How far today's converted price may sit from a cached plan's price before a
// new plan is built. Five per cent is roughly where the rand moves in a normal
// month, so the listed price holds for a month or so at a time instead of
// changing hourly.
const PRICE_DRIFT_PCT = 5;

// What each kind of subscriber is allowed to buy. Read from here rather than
// from the request, so a fan cannot post "premium" and a request cannot name a
// tier that was never for sale.
const SUBJECTS = {
  artist: { subject: tierSub.artist, tiers: ['pro', 'premium'] },
  fan:    { subject: tierSub.fan,    tiers: ['fan_pro'] },
};
const CYCLES = ['monthly', 'annual'];

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Where the caller is, read from the header Netlify injects at its edge.
// Exactly what geo.js and school-sessions-gate.js already do, so there is no
// third party, no key and no extra request. Absent means unknown, and unknown
// is treated as "not local" everywhere it is used, which only ever changes
// which button is emphasised. Nothing is hidden on the strength of it, because
// a geo lookup that fails must never cost a South African their local way to
// pay.
function callerCountry(event) {
  try {
    const raw = event.headers['x-nf-geo'] || event.headers['X-Nf-Geo'];
    if (!raw) return null;
    const geo = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return (geo && geo.country && geo.country.code) || null;
  } catch {
    return null;
  }
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

async function paystack(method, path, body) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { parsed = null; }
  return { ok: res.ok && parsed && parsed.status === true, status: res.status, body: parsed };
}

/**
 * The tier row and what it costs in dollars for the chosen cycle.
 *
 * Refuses rather than inventing a figure. platform_tiers.price_monthly is
 * 0.00 on both paid tiers at the time of writing, which is a price nobody set
 * rather than a price of nothing, and guessing one here would charge somebody
 * real money for a number this file made up.
 */
async function tierAndPrice(slug, cycle) {
  const { data: tier, error } = await supabase
    .from('platform_tiers')
    .select('id, name, slug, price_monthly, price_yearly')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return { error: 'lookup_failed', detail: error.message };
  if (!tier) return { error: 'unknown_tier' };

  const usd = Number(cycle === 'annual' ? tier.price_yearly : tier.price_monthly);
  if (!Number.isFinite(usd) || usd <= 0) {
    console.error('[tier-paystack] no usable', cycle, 'price on tier', slug,
      '- got', cycle === 'annual' ? tier.price_yearly : tier.price_monthly,
      '. Set it in platform_tiers before anybody can pay in rand.');
    return { error: 'no_price', tier };
  }
  return { tier, usd };
}

/**
 * Find a cached plan for this tier and cycle whose price is still close enough
 * to today's, or build one.
 */
async function planFor({ tier, cycle, zarToday, usd, rate }) {
  const { data: cached, error } = await supabase
    .from('paystack_tier_plans')
    .select('plan_code, zar_amount')
    .eq('tier_id', tier.id)
    .eq('billing_cycle', cycle)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) {
    console.error('[tier-paystack] plan cache read failed:', error.message);
    return { error: 'plan_lookup_failed' };
  }

  for (const p of cached || []) {
    const amount = Number(p.zar_amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const driftPct = Math.abs(amount - zarToday) / zarToday * 100;
    if (driftPct <= PRICE_DRIFT_PCT) {
      return { planCode: p.plan_code, zar: amount, reused: true };
    }
  }

  const minor = pricing.zarToPaystackMinor(zarToday);
  if (minor < MIN_MINOR) {
    console.error('[tier-paystack] price below the Paystack minimum:', zarToday, tier.slug, cycle);
    return { error: 'price_too_small' };
  }

  const created = await paystack('POST', '/plan', {
    name:     `Feelz Machine ${tier.name} ${cycle === 'annual' ? 'Yearly' : 'Monthly'} (R${zarToday.toFixed(2)})`,
    interval: cycle === 'annual' ? 'annually' : 'monthly',
    amount:   minor,
    currency: 'ZAR',
  });
  if (!created.ok || !created.body?.data?.plan_code) {
    console.error('[tier-paystack] plan create refused:', created.status, JSON.stringify(created.body));
    return { error: 'plan_failed' };
  }
  const planCode = created.body.data.plan_code;

  // Read, not discarded. If this write fails the plan exists at Paystack and
  // we have no record of it, so the next artist builds another one: an
  // orphaned plan per attempt. That has to be visible.
  const { error: saveErr } = await supabase.from('paystack_tier_plans').insert({
    tier_id:       tier.id,
    billing_cycle: cycle,
    zar_amount:    zarToday,
    plan_code:     planCode,
    usd_at_build:  usd,
    rate_at_build: rate,
  });
  if (saveErr) {
    console.error('[tier-paystack] plan created at Paystack but NOT cached:',
      saveErr.message, 'plan=', planCode, tier.slug, cycle);
  }

  return { planCode, zar: zarToday, reused: false };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'bad_json' }); }

  const action = body.action || 'status';

  const which = SUBJECTS[body.subject === 'fan' ? 'fan' : 'artist'];
  const subject = which.subject;
  const LOG = `[${subject.label}-paystack-api]`;

  // The caller must be signed in, and anything granted is granted to THEM,
  // never to an id supplied in the request. A body you control should not be
  // able to name who gets the benefit.
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'not_signed_in' });
  }
  const { data: { user } = {}, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
  if (authErr || !user) return json(401, { error: 'not_signed_in' });

  // Who the subscription belongs to. For a fan that is the signed-in user; for
  // an artist it is their artist profile, which they must already have.
  let owner = user.id;
  if (subject.ownerCol === 'artist_id') {
    const { data: artist, error: artistErr } = await supabase
      .from('artists').select('id').eq('user_id', user.id).maybeSingle();
    if (artistErr || !artist) return json(404, { error: 'no_artist_profile' });
    owner = artist.id;
  }

  // Their current subscription, whichever provider it came from.
  const { data: current, error: curErr } = await supabase
    .from(subject.table)
    .select('id, status, billing_cycle, expires_at, payment_provider, amount_paid, currency, '
          + 'paypal_subscription_id, paystack_subscription_code, paystack_email_token, paystack_status')
    .eq(subject.ownerCol, owner)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (curErr) {
    console.error(LOG, 'current subscription lookup failed:', curErr.message);
    return json(500, { error: 'lookup_failed' });
  }

  try {
    // ── status ──────────────────────────────────────────────────────────────
    //
    // What the billing screen needs to draw itself, including today's rand
    // prices so nobody is shown one number and charged another.
    if (action === 'status') {
      const prices = {};
      if (PAYSTACK_IS_LIVE) {
        let rate = null;
        try { rate = await fxRate.getUsdZarRate(supabase); } catch { rate = null; }
        for (const slug of which.tiers) {
          for (const cycle of CYCLES) {
            const got = await tierAndPrice(slug, cycle);
            if (got.error || !rate) continue;
            const charge = pricing.usdToPaystackCharge(got.usd, rate.rate);
            prices[`${slug}_${cycle}`] = { zar: charge.zar, usd: got.usd };
          }
        }
      }
      const country = callerCountry(event);
      return json(200, {
        subject:      subject.label,
        country,
        // The only thing this changes is which way to pay is put first.
        local:        country === 'ZA',
        paystackLive: PAYSTACK_IS_LIVE,
        subscribed:   Boolean(current && current.paystack_subscription_code),
        provider:     current ? current.payment_provider : null,
        cycle:        current ? current.billing_cycle : null,
        expiresAt:    current ? current.expires_at : null,
        paystackStatus: current ? current.paystack_status : null,
        canManage:    Boolean(current && current.paystack_subscription_code && current.paystack_email_token),
        prices,
      });
    }

    if (!PAYSTACK_IS_LIVE) {
      return json(503, {
        error: 'paystack_not_live',
        message: 'Card payments in rand are not switched on yet.',
      });
    }

    // ── start ───────────────────────────────────────────────────────────────
    //
    // Create or reuse the plan, then open a Paystack checkout for it. Paying
    // that checkout both takes the first month and creates the subscription:
    // Paystack's documented route for subscribing a customer who has no saved
    // card is to initialize a transaction with the plan code, and the plan's
    // amount overrides the transaction's.
    if (action === 'start') {
      // Fan Pro is the only thing a fan can buy, so the request does not get
      // to name it. An artist picks from the two artist plans, and anything
      // else is refused rather than quietly turned into Pro.
      const slug = which.tiers.length === 1
        ? which.tiers[0]
        : (which.tiers.includes(body.tier) ? body.tier : null);
      const cycle = CYCLES.includes(body.cycle) ? body.cycle : 'monthly';
      if (!slug) return json(400, { error: 'unknown_tier', message: 'Pick a plan first.' });

      if (current && current.paystack_subscription_code) {
        return json(409, {
          error: 'already_subscribed',
          message: 'You already have a card subscription on this account.',
        });
      }
      if (current && current.paypal_subscription_id) {
        // Not refused outright, because somebody moving off PayPal onto a rand
        // card is a thing we want to happen. But it is said plainly, because
        // two live subscriptions means being charged twice.
        return json(409, {
          error: 'paypal_subscription_live',
          message: 'You have a PayPal subscription running. Cancel that one first, '
                 + 'then pay by card, so you are not charged twice.',
        });
      }

      const got = await tierAndPrice(slug, cycle);
      if (got.error === 'no_price') {
        return json(503, {
          error: 'no_price',
          message: 'This plan does not have a rand price yet. We have been told.',
        });
      }
      if (got.error) return json(400, { error: got.error });

      let rate;
      try {
        rate = await fxRate.getUsdZarRate(supabase);
      } catch (err) {
        console.error(LOG, 'no usable FX rate:', err.message);
        return json(503, {
          error: 'no_rate',
          message: 'We could not work out the rand price just now. Try again shortly.',
        });
      }

      const charge = pricing.usdToPaystackCharge(got.usd, rate.rate);
      const plan = await planFor({
        tier: got.tier, cycle, zarToday: charge.zar, usd: got.usd, rate: rate.rate,
      });
      if (plan.error) {
        return json(400, {
          error: plan.error,
          message: 'Billing could not be set up right now. Try again shortly.',
        });
      }

      const payerEmail = (body.email || user.email || '').trim().toLowerCase();
      if (!payerEmail) {
        return json(400, { error: 'no_email', message: 'We need an email address to bill.' });
      }

      // ── The intent, written before the artist leaves ──────────────────────
      //
      // The webhook reads this. It goes in BEFORE the Paystack call, because
      // the other order has a hole in it: initialize succeeds, this insert
      // fails, the artist pays, and the webhook has a reference it has never
      // heard of. Written first, the worst case is a row for a payment that
      // never happened, which is something somebody can look at, rather than
      // money with nowhere to go.
      const reference = `${subject.REF_PREFIX}${crypto.randomBytes(9).toString('hex')}`;
      const { error: intentErr } = await supabase.from('paystack_intents').insert({
        reference,
        // user_id is always the signed-in person, so a fan's intent is
        // complete and an artist's still records who clicked.
        user_id:       user.id,
        ...(subject.ownerCol === 'artist_id' ? { artist_id: owner } : {}),
        buyer_email:   payerEmail,
        tier_id:       got.tier.id,
        billing_cycle: cycle,
        plan_code:     plan.planCode,
        usd_price:     got.usd,
        zar_amount:    plan.zar,
        zar_minor:     pricing.zarToPaystackMinor(plan.zar),
        fx_rate:       rate.rate,
        fx_source:     rate.source,
        fx_stale:      rate.stale === true,
        status:        'pending',
      });
      if (intentErr) {
        console.error(LOG, 'intent refused, refusing the checkout:',
          intentErr.code, intentErr.message, 'reference=', reference);
        return json(500, {
          error: 'could_not_start',
          message: 'This payment could not be started. Nothing has been charged. Try again in a moment.',
        });
      }

      const init = await paystack('POST', '/transaction/initialize', {
        email:        payerEmail,
        amount:       pricing.zarToPaystackMinor(plan.zar),
        plan:         plan.planCode,
        currency:     'ZAR',
        reference,
        // Back to the page that sells the thing they just bought. This was
        // /upgrade for everyone, so a fan who paid by card was returned to the
        // ARTIST tiers - a different product, with their own plan nowhere on
        // it. ?billing=started is read by both pages now.
        callback_url: `${SITE}${body.subject === 'fan' ? '/listener/upgrade' : '/upgrade'}?billing=started`,
        // Sent as a convenience for reading the Paystack dashboard, never as
        // the thing the subscription is matched on. Paystack's own docs
        // describe metadata as a string, and the list endpoint returns null
        // for it on the same transaction the verify endpoint returns empty.
        metadata: {
          kind:    subject.label + '_tier',
          subject: subject.label,
          owner,
          tier:    slug,
          cycle,
        },
      });
      if (!init.ok || !init.body?.data?.authorization_url) {
        console.error(LOG, 'initialize refused:', init.status, JSON.stringify(init.body));
        await supabase.from('paystack_intents')
          .update({ status: 'abandoned', settled_at: new Date().toISOString() })
          .eq('reference', reference);
        return json(400, { error: 'checkout_failed', message: 'Could not open the card payment. Try again shortly.' });
      }

      console.log(LOG, 'checkout opened', owner, slug, cycle, reference, plan.planCode,
        plan.reused ? '(cached plan)' : '(new plan)');
      return json(200, {
        authorizationUrl: init.body.data.authorization_url,
        reference,
        zar: plan.zar,
        usd: got.usd,
        currency: 'ZAR',
        tier: slug,
        cycle,
      });
    }

    // ── cancel ──────────────────────────────────────────────────────────────
    //
    // Disabled at Paystack, which stops the next charge. The row keeps its
    // expires_at exactly as it is, so the artist keeps the tier until the
    // period they have already paid for runs out, and the daily expiry job
    // takes it from there. Taking somebody's uploads limit away the moment
    // they cancel would be taking back something already paid for.
    if (action === 'cancel') {
      if (!current || !current.paystack_subscription_code || !current.paystack_email_token) {
        return json(400, { error: 'no_subscription', message: 'There is no card subscription on this account to cancel.' });
      }

      const off = await paystack('POST', '/subscription/disable', {
        code:  current.paystack_subscription_code,
        token: current.paystack_email_token,
      });
      if (!off.ok) {
        console.error(LOG, 'disable refused:', off.status, JSON.stringify(off.body));
        return json(502, { error: 'paystack_refused', paystackStatus: off.status });
      }

      const { data: changed, error: cancelErr } = await supabase
        .from(subject.table)
        .update({
          status:        'cancelled',
          cancelled_at:  new Date().toISOString(),
          cancel_reason: 'cancelled_by_artist',
          paystack_status: 'cancelled',
          updated_at:    new Date().toISOString(),
        })
        .eq('id', current.id)
        .select('id');
      if (cancelErr || !changed || changed.length === 0) {
        // Paystack has stopped billing and our row still says active. Said
        // loudly rather than returned as success, because the two disagreeing
        // is how somebody ends up with a tier nobody is paying for.
        console.error(LOG, 'STOPPED AT PAYSTACK BUT ROW NOT UPDATED:',
          cancelErr && cancelErr.message, 'row=', current.id, 'sub=', current.paystack_subscription_code);
        return json(500, {
          error: 'cancel_not_recorded',
          message: 'Your card will not be charged again, but our records did not update. '
                 + 'We have been told and will fix it.',
        });
      }

      console.log(LOG, 'cancelled', owner, current.paystack_subscription_code);
      return json(200, { ok: true, accessUntil: current.expires_at });
    }

    // ── manage ──────────────────────────────────────────────────────────────
    //
    // Paystack's own hosted page, where the artist can change the card. We
    // never see or hold card details, which is the point.
    if (action === 'manage') {
      if (!current || !current.paystack_subscription_code) {
        return json(400, { error: 'no_subscription', message: 'There is no card subscription on this account yet.' });
      }
      const link = await paystack('GET',
        `/subscription/${encodeURIComponent(current.paystack_subscription_code)}/manage/link`);
      if (!link.ok || !link.body?.data?.link) {
        console.error(LOG, 'manage link refused:', link.status, JSON.stringify(link.body));
        return json(502, { error: 'paystack_refused' });
      }
      return json(200, { link: link.body.data.link });
    }

    return json(400, { error: 'unknown_action' });

  } catch (err) {
    console.error(LOG, 'failed:', err.message);
    return json(500, {
      error: 'failed',
      message: 'Something went wrong on our side. If a payment went through, nothing further is owed. Tell us and we will fix it.',
    });
  }
};
