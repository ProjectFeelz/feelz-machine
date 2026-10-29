/**
 * netlify/functions/retail-paystack-subscription.js
 *
 * Feelz Retail billing in rand, through Paystack.
 *
 * The companion to retail-paypal-subscription.js, which bills in dollars. One
 * venue uses one of them, decided by retail_subscriptions.currency (migration
 * 217): 'ZAR' comes here, 'USD' goes to PayPal. Nothing switches a venue from
 * one to the other automatically, because that is a conversation about money
 * and not a deploy.
 *
 * Retail launches in South Africa first, so this is the path most venues will
 * take: a rand price, a South African card, a South African processor.
 *
 *
 * WHAT THIS REFUSES TO TRUST
 *
 * The fee. Read from retail_subscriptions.monthly_fee by venue id, never from
 * the request body, for the same reason paystack-checkout.js reads prices from
 * the database: a body is whatever the browser decided to send, and billing
 * that accepts an amount is billing that charges one rand a month.
 *
 * The venue. The caller must be signed in and either own the venue or be an
 * admin. retail-paypal-subscription.js had no authentication at all when it
 * was written, held the service role key, and would activate any venue the
 * caller named. That is not repeated here.
 *
 * Payment itself. Nothing in this file marks a venue as paid. It creates a
 * plan and hands back a checkout URL. The money is confirmed by
 * paystack-webhook.js from Paystack's signed callback, re-verified against
 * Paystack's own API, because a browser returning to a success page is not
 * evidence that anybody paid.
 *
 *
 * THE TRIAL IS NOT THE SAME SHAPE AS PAYPAL'S, AND CANNOT BE
 *
 * PayPal's 14 free days are a TRIAL billing cycle inside the plan: PayPal
 * takes the card at signup and starts charging on day 15 by itself.
 *
 * Paystack has no trial on a plan, and a Paystack subscription cannot exist
 * without a saved card authorization, which only a real charge produces. The
 * only ways to get PayPal's behaviour are to charge the venue a token amount
 * and refund it, or to charge the first month immediately and call it a
 * discount. Neither is a free trial.
 *
 * So the rand trial takes no card. action 'start-trial' writes the database
 * and calls nothing: the subscription goes active with trial_ends_at and
 * current_period_end set to the end of the trial and NO
 * paystack_subscription_code, the player runs, and the venue is asked to
 * subscribe before the trial is up.
 *
 * The thing that keeps that from becoming free access forever is the access
 * sweep in retail-artist-payouts.js, which suspends an expired period with no
 * subscription code behind it. A trial here is a promise to come back and pay,
 * enforced by that sweep, not by a card on file.
 *
 *
 * WHY THERE IS NO GROSSING UP
 *
 * netlify/lib/pricing.js grosses track sales up so the artist nets their
 * price after Paystack's cut. A venue fee is different: monthly_fee is what an
 * admin negotiated and what the venue was told it would pay, so that is what
 * it is charged, and the card fee comes out of the platform's side. Charging
 * a venue more than the agreed figure to cover a processor fee is a surprise
 * on an invoice, and surprises on invoices are how a B2B customer leaves.
 *
 * Requires: PAYSTACK_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * PAYSTACK_ALLOW_TEST=true lifts the live-key guard for working on the flow.
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const pricing = require('../lib/pricing');

const PAYSTACK_BASE = 'https://api.paystack.co';
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const SITE = process.env.URL || 'https://www.feelzmachine.com';

// Live only when the key says live. A missing key, a test key or anything
// unrecognised all count as not live, so the failure direction is the safe
// one. Same rule as paystack-checkout.js, and for the same reason: a test key
// opens a checkout that declines every real card and accepts Paystack's
// published test card, which would switch a venue's player on for nothing.
//
// ALLOW_TEST without a key is still not usable, so the key is required in both
// arms. Otherwise PAYSTACK_ALLOW_TEST=true on a deploy with no key would let
// the checkout path run and fail at the HTTP call instead of saying why.
const ALLOW_TEST = process.env.PAYSTACK_ALLOW_TEST === 'true';
const PAYSTACK_IS_LIVE = Boolean(SECRET) && (String(SECRET).startsWith('sk_live_') || ALLOW_TEST);

// Paystack takes integer minor units, and refuses anything under 100 of them.
// A fee below R1 is a configuration mistake rather than a price.
const MIN_MINOR = 100;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// How many free days a venue that has never had a trial gets. Bounded here as
// well as in the admin screen, because a value typed into platform_settings is
// not validated by anything else and 9999 free days is a product decision
// nobody made.
async function trialDaysSetting() {
  const { data } = await supabase.from('platform_settings')
    .select('value').eq('key', 'retail_trial_days').maybeSingle();
  const n = parseInt(data && data.value, 10);
  return Number.isFinite(n) && n > 0 && n <= 90 ? n : 0;
}

// The newest subscription row for a venue. A venue can have more than one over
// its life (cancelled, then re-subscribed), and every write in here is by row
// id rather than venue_id so an old row cannot be updated by accident. That
// was a real bug on the PayPal side: the same subscription id ended up written
// to every row a venue had.
async function latestSub(venueId) {
  const { data } = await supabase
    .from('retail_subscriptions')
    .select('id, venue_id, currency, monthly_fee, status, trial_ends_at, current_period_end, '
          + 'paystack_plan_code, paystack_subscription_code, paystack_email_token, '
          + 'paystack_customer_code, paystack_billed_zar, paystack_reference, '
          + 'retail_venues(business_name, contact_email, status, trial_used_at)')
    .eq('venue_id', venueId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  // There is deliberately no "no key, go away" check here. The billing screen
  // asks this endpoint for `state` whatever currency a venue is in, including
  // a dollar venue that will end up on the PayPal button, so refusing every
  // call on a deploy with no Paystack key would hide the PayPal button too.
  // `state` reads the database and calls nothing; the actions that do need a
  // key are gated further down, by PAYSTACK_IS_LIVE, which is false without
  // one.

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'invalid_body' }); }

  const action = String(body.action || '');
  const venueId = String(body.venueId || '');
  if (!action || !venueId) return json(400, { error: 'action and venueId required' });

  // ── Who is asking ─────────────────────────────────────────────────────────
  //
  // Signed in, and either the owner of this venue or an admin. Checked before
  // anything is read or created, so an unauthorised caller cannot even learn
  // what a venue pays.
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'sign_in_required' });

  const { data: { user: caller } = {}, error: authErr } =
    await supabase.auth.getUser(authHeader.slice(7).trim());
  if (authErr || !caller) return json(401, { error: 'sign_in_required' });

  const [{ data: venueRow }, { data: adminRow }] = await Promise.all([
    supabase.from('retail_venues').select('id, user_id').eq('id', venueId).maybeSingle(),
    supabase.from('admins').select('user_id').eq('user_id', caller.id).maybeSingle(),
  ]);
  if (!venueRow) return json(404, { error: 'venue_not_found' });
  if (venueRow.user_id !== caller.id && !adminRow) return json(403, { error: 'not_your_venue' });

  try {
    const sub = await latestSub(venueId);
    if (!sub) {
      return json(404, {
        error: 'no_subscription_row',
        message: 'This venue has no billing record yet. An admin needs to set the monthly fee first.',
      });
    }

    // ── state ───────────────────────────────────────────────────────────────
    //
    // Everything the billing screen needs, in one answer from the server.
    //
    // The screen could read most of this from retail_subscriptions directly,
    // since retail_subscriptions_self_select lets a venue owner read its own
    // row. It does not, for one reason: how many trial days a venue gets lives
    // in platform_settings, and whether this venue is still entitled to one
    // lives on retail_venues. A screen that assembles the answer from three
    // places will eventually disagree with the server that enforces it, and
    // the disagreement will be a button that promises a trial the server then
    // refuses.
    //
    // Reads only, so it is allowed to answer even when the Paystack account is
    // not live yet. The screen needs to be able to say why the button is not
    // there.
    if (action === 'state') {
      const days = sub.retail_venues?.trial_used_at ? 0 : await trialDaysSetting();
      const onTrial = Boolean(sub.trial_ends_at)
        && !sub.paystack_subscription_code
        && new Date(sub.trial_ends_at) > new Date();
      return json(200, {
        currency:        sub.currency || 'USD',
        monthlyFee:      sub.monthly_fee == null ? null : Number(sub.monthly_fee),
        status:          sub.status,
        venueStatus:     sub.retail_venues?.status || null,
        subscribed:      Boolean(sub.paystack_subscription_code),
        onTrial,
        trialEndsAt:     sub.trial_ends_at || null,
        currentPeriodEnd: sub.current_period_end || null,
        trialDaysAvailable: days,
        paystackLive:    PAYSTACK_IS_LIVE,
      });
    }

    // Everything past here either creates a plan or starts a charge, so the
    // account has to be live first. No plan is created, no reference is
    // written, and above all no checkout opens that a venue could mistake for
    // a working one.
    if (action !== 'start-trial' && !PAYSTACK_IS_LIVE) {
      console.warn('[retail-paystack] refused: the Paystack key is not a live key.');
      return json(503, {
        error: 'paystack_not_live',
        message: 'Paying in rand is not switched on yet. Contact us and we will take the first month another way.',
      });
    }

    if (sub.currency !== 'ZAR') {
      return json(400, {
        error: 'wrong_currency',
        message: 'This venue is billed in dollars. Use the PayPal button.',
      });
    }

    // ── start-trial ─────────────────────────────────────────────────────────
    //
    // The card-less trial. Calls Paystack not at all: there is nothing to tell
    // it about, because no payment method is taken and no subscription exists
    // until the venue subscribes for real.
    //
    // The order of the two writes below is the whole safety of this action.
    // The trial is CLAIMED first, conditionally, and access is granted second.
    // Claiming is an update guarded by `trial_used_at is null` that reports
    // which rows it changed, so two clicks a second apart cannot both succeed:
    // the second changes nothing, gets an empty result, and is refused. Doing
    // it the other way round, granting access and then recording the trial,
    // leaves a venue with free months if the second write fails.
    if (action === 'start-trial') {
      if (sub.paystack_subscription_code) {
        return json(400, { error: 'already_subscribed', message: 'This venue already has a subscription.' });
      }
      if (sub.retail_venues?.trial_used_at) {
        return json(409, {
          error: 'trial_already_used',
          message: 'This venue has already had its free trial. Subscribe to switch the player back on.',
        });
      }

      const days = await trialDaysSetting();
      if (!days) {
        return json(400, { error: 'no_trial_configured', message: 'There is no free trial running at the moment.' });
      }

      const now = new Date();
      const { data: claimed, error: claimErr } = await supabase
        .from('retail_venues')
        .update({ trial_used_at: now.toISOString() })
        .eq('id', venueId)
        .is('trial_used_at', null)
        .select('id');
      if (claimErr) {
        console.error('[retail-paystack] trial claim failed:', claimErr.message, venueId);
        return json(500, { error: 'trial_claim_failed', message: 'Could not start the trial. Try again shortly.' });
      }
      if (!claimed || claimed.length === 0) {
        // Somebody else claimed it between the read above and this write.
        return json(409, { error: 'trial_already_used', message: 'This venue has already had its free trial.' });
      }

      const trialEnd = new Date(now.getTime() + days * 86400000).toISOString();
      const { error: subErr } = await supabase.from('retail_subscriptions')
        .update({
          status:             'active',
          trial_ends_at:      trialEnd,
          current_period_end: trialEnd,
          cancelled_at:       null,
        })
        .eq('id', sub.id);
      if (subErr) {
        console.error('[retail-paystack] trial not written to subscription:', subErr.message, venueId);
        return json(500, { error: 'trial_write_failed', message: 'Could not start the trial. Contact us and we will sort it out.' });
      }

      // `in` rather than eq('status','pending'): a venue suspended for
      // non-payment is 'suspended', not 'pending', and the narrower filter
      // matched nothing and left the player switched off. Same fix as the one
      // in paypal-webhook.js.
      const { error: venueErr } = await supabase.from('retail_venues')
        .update({ status: 'active' })
        .eq('id', venueId)
        .in('status', ['pending', 'suspended']);
      if (venueErr) {
        console.error('[retail-paystack] venue activation failed:', venueErr.message, venueId);
        return json(500, {
          error: 'activation_failed',
          message: 'Your trial started but the player did not switch on. Refresh the page, and contact us if it still will not play.',
        });
      }

      console.log('[retail-paystack] trial started', venueId, days, 'days to', trialEnd);
      return json(200, { success: true, trialEndsAt: trialEnd, trialDays: days });
    }

    // ── start ───────────────────────────────────────────────────────────────
    //
    // Create or reuse the plan, then open a Paystack checkout for it. Paying
    // that checkout both takes the first month and creates the subscription:
    // Paystack's own documented route for subscribing a customer who has no
    // saved card is to initialize a transaction with the plan code, and the
    // plan's amount overrides the transaction's.
    if (action === 'start') {
      const fee = Number(sub.monthly_fee);
      if (!(fee > 0)) {
        return json(400, { error: 'no_fee_set', message: 'No monthly fee has been set for this venue yet.' });
      }
      const minor = pricing.zarToPaystackMinor(fee);
      if (minor < MIN_MINOR) {
        console.error('[retail-paystack] fee below the Paystack minimum:', fee, 'venue', venueId);
        return json(400, { error: 'fee_too_small', message: 'The fee set for this venue is too small to charge by card.' });
      }

      if (sub.paystack_subscription_code) {
        return json(409, {
          error: 'already_subscribed',
          message: 'This venue already has a Paystack subscription.',
        });
      }

      // ── The cached plan has to still bill the fee on record ──────────────
      //
      // A Paystack plan's amount is fixed when it is created, so a plan is
      // only reused while it bills exactly the negotiated fee. Change the fee
      // and the next venue to subscribe gets a new plan; anyone already
      // subscribed keeps the plan they agreed to, because moving a paying
      // customer to a new price is a conversation, not a deploy. The same rule
      // the PayPal side follows, for the same reason.
      let planCode = sub.paystack_plan_code;
      const billed = sub.paystack_billed_zar == null ? null : Number(sub.paystack_billed_zar);
      const planMatches = planCode && billed != null && Math.abs(billed - fee) < 0.005;

      if (!planMatches) {
        if (planCode) {
          console.log('[retail-paystack] fee changed for venue', venueId, 'from', billed, 'to', fee,
            '- building a new plan.');
        }
        const venueName = sub.retail_venues?.business_name || 'Venue';
        const created = await paystack('POST', '/plan', {
          name:     `Feelz Retail Monthly, ${venueName}`,
          interval: 'monthly',
          amount:   minor,
          currency: 'ZAR',
        });
        if (!created.ok || !created.body?.data?.plan_code) {
          console.error('[retail-paystack] plan create refused:', created.status, JSON.stringify(created.body));
          return json(400, { error: 'plan_failed', message: 'Billing could not be set up right now. Try again shortly.' });
        }
        planCode = created.body.data.plan_code;

        // Read, not discarded. If this write fails the plan exists at Paystack
        // and we have no record of it, so the next page load builds another
        // one: an orphaned plan per attempt. That has to be visible.
        const { error: planSaveErr } = await supabase.from('retail_subscriptions')
          .update({ paystack_plan_code: planCode, paystack_billed_zar: fee })
          .eq('id', sub.id);
        if (planSaveErr) {
          console.error('[retail-paystack] plan created at Paystack but NOT saved:',
            planSaveErr.message, 'plan=', planCode, 'venue=', venueId);
        }
      }

      // Our own reference, written here before the venue leaves the site.
      //
      // This is how the webhook learns which venue a payment belongs to. The
      // obvious alternative is Paystack's metadata, and it does not hold:
      // Paystack's own docs describe metadata as a string, and the list
      // endpoint returns null for it on the same transaction the verify
      // endpoint returns empty. paystack-checkout.js reached the same
      // conclusion and writes an intent row for the same reason. Metadata is
      // sent as well, but as a convenience for reading the Paystack dashboard,
      // never as the thing the subscription is matched on.
      const reference = `rtl_${crypto.randomBytes(9).toString('hex')}`;
      const { error: refErr } = await supabase.from('retail_subscriptions')
        .update({ paystack_reference: reference })
        .eq('id', sub.id);
      if (refErr) {
        console.error('[retail-paystack] reference not saved, refusing to open a checkout:',
          refErr.message, venueId);
        // Refused rather than carried on. A checkout whose reference is not on
        // the row is a venue that can pay and never be switched on, and that
        // is worse than a button that did not work.
        return json(500, { error: 'reference_failed', message: 'Could not start billing. Try again shortly.' });
      }

      const payerEmail = sub.retail_venues?.contact_email || caller.email;
      if (!payerEmail) {
        return json(400, { error: 'no_email', message: 'This venue has no contact email, so Paystack has nothing to bill. Add one first.' });
      }

      const init = await paystack('POST', '/transaction/initialize', {
        email:        payerEmail,
        amount:       minor,
        plan:         planCode,
        currency:     'ZAR',
        reference,
        callback_url: `${SITE}/retail?billing=started`,
        metadata: {
          kind:     'retail_subscription',
          venue_id: venueId,
          sub_id:   sub.id,
        },
      });
      if (!init.ok || !init.body?.data?.authorization_url) {
        console.error('[retail-paystack] initialize refused:', init.status, JSON.stringify(init.body));
        return json(400, { error: 'checkout_failed', message: 'Could not open the card payment. Try again shortly.' });
      }

      console.log('[retail-paystack] checkout opened', venueId, reference, planCode);
      return json(200, {
        authorizationUrl: init.body.data.authorization_url,
        reference,
        zar: fee,
        currency: 'ZAR',
      });
    }

    // ── cancel ──────────────────────────────────────────────────────────────
    //
    // Disabled at Paystack, which stops the next charge, and the row is marked
    // cancelled with current_period_end left exactly as it is. The venue keeps
    // its player until the month it has already paid for runs out, and the
    // access sweep in retail-artist-payouts.js suspends it then. Taking the
    // player away the moment somebody cancels would be taking back something
    // already paid for.
    if (action === 'cancel') {
      if (!sub.paystack_subscription_code || !sub.paystack_email_token) {
        return json(400, {
          error: 'no_subscription',
          message: 'There is no Paystack subscription on this venue to cancel.',
        });
      }

      const off = await paystack('POST', '/subscription/disable', {
        code:  sub.paystack_subscription_code,
        token: sub.paystack_email_token,
      });
      if (!off.ok) {
        console.error('[retail-paystack] disable refused:', off.status, JSON.stringify(off.body));
        return json(400, { error: 'cancel_failed', message: 'Could not cancel that with Paystack. Try again shortly.' });
      }

      const { error: cancelErr } = await supabase.from('retail_subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', sub.id);
      if (cancelErr) {
        // Paystack has stopped billing but our row still says active, so the
        // sweep will never suspend the venue. Loud, because it needs fixing by
        // hand rather than waiting to be noticed.
        console.error('[retail-paystack] CANCELLED AT PAYSTACK BUT NOT RECORDED:',
          cancelErr.message, 'venue=', venueId, 'sub=', sub.paystack_subscription_code);
        return json(500, {
          error: 'cancel_not_recorded',
          message: 'Paystack has stopped the next payment, but we could not update your record. Contact us so we can confirm it.',
        });
      }

      console.log('[retail-paystack] cancelled', venueId, sub.paystack_subscription_code);
      return json(200, { success: true, accessUntil: sub.current_period_end || null });
    }

    // ── manage-link ─────────────────────────────────────────────────────────
    //
    // Paystack's own hosted page for the subscription, where the venue can
    // change the card it pays with. Worth handing over rather than rebuilding:
    // changing a card means tokenising a new one, which Paystack does with a
    // small charge it refunds immediately, and that is not something to
    // reimplement.
    if (action === 'manage-link') {
      if (!sub.paystack_subscription_code) {
        return json(400, { error: 'no_subscription', message: 'There is no Paystack subscription on this venue yet.' });
      }
      const link = await paystack('GET', `/subscription/${encodeURIComponent(sub.paystack_subscription_code)}/manage/link`);
      if (!link.ok || !link.body?.data?.link) {
        console.error('[retail-paystack] manage link refused:', link.status, JSON.stringify(link.body));
        return json(400, { error: 'manage_link_failed', message: 'Could not open your card settings. Try again shortly.' });
      }
      return json(200, { link: link.body.data.link });
    }

    return json(400, { error: 'invalid_action' });

  } catch (err) {
    console.error('[retail-paystack] error:', err);
    return json(500, { error: 'billing_unavailable', message: 'Billing could not be set up right now. Try again shortly.' });
  }
};
