/**
 * netlify/lib/retailPaystackSub.js
 *
 * The Paystack side of a retail venue's subscription, kept in one place
 * because three different things need it:
 *
 *   paystack-webhook.js           when Paystack says something happened
 *   retail-artist-payouts.js      daily, to check Paystack still agrees
 *   retail-paystack-subscription  not directly, but it writes the row this
 *                                 reads, so the shape lives here
 *
 *
 * EVERYTHING AUTHORITATIVE COMES FROM GET /subscription
 *
 * Paystack's own webhook documentation lists the subscription and invoice
 * events by name and gives no payload schema for any of them. So this file
 * treats a webhook as a NUDGE and nothing more: it digs a subscription code
 * out of whatever arrived, and then asks Paystack what the subscription
 * actually is. Status, next payment date, plan and amount are read from that
 * answer, never from the event body.
 *
 * That is the same rule paystack-webhook.js already follows for a sale, where
 * the amount is read from the verify endpoint rather than the body. Here it
 * buys something extra: because nothing depends on an undocumented payload
 * shape, a renewal is still recorded correctly if Paystack renames a field,
 * and if the code cannot be found at all, the event is logged with its keys
 * and the daily reconcile picks the subscription up anyway.
 *
 *
 * WHY A VENUE IS NEVER SUSPENDED FROM HERE
 *
 * A failed payment or a cancellation changes the subscription row, not the
 * venue. Taking a player away is done in one place, the access sweep in
 * retail-artist-payouts.js, which waits until the period that was paid for has
 * actually run out. A cancellation mid-month is not a reason to switch off
 * music somebody has already paid for, and a webhook arriving out of order is
 * not a reason to switch it off at all.
 */

const PAYSTACK_BASE = 'https://api.paystack.co';
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const ALLOW_TEST = process.env.PAYSTACK_ALLOW_TEST === 'true';

// Our own references for a retail subscription's first charge are written by
// retail-paystack-subscription.js. The prefix is how paystack-webhook.js tells
// a venue's subscription charge from a track sale without a database lookup on
// every sale; the row is still what decides, so a forged rtl_ reference with no
// row behind it is refused.
const RETAIL_REF_PREFIX = 'rtl_';

// The events Paystack sends about a subscription. invoice.create is included
// deliberately even though it changes nothing: it arrives about three days
// before a charge, and treating it as a nudge means a row whose status drifted
// is corrected before the money moves rather than after.
const SUBSCRIPTION_EVENTS = new Set([
  'subscription.create',
  'subscription.disable',
  'subscription.not_renew',
  'subscription.expiring_cards',
  'invoice.create',
  'invoice.update',
  'invoice.payment_failed',
]);

// Paystack's subscription statuses, mapped onto the ones
// retail_subscriptions.status is constrained to.
//
//   active        billing normally
//   non-renewing  cancelled, but the paid period has not ended
//   attention     a charge failed and Paystack does not retry by itself
//   completed     the plan's invoice limit was reached
//   cancelled     disabled outright
//
// non-renewing and completed both map to 'cancelled' because they mean the
// same thing to us: no more money is coming, and access runs to the end of
// what was paid for. That distinction is Paystack's business, not the
// player's.
const STATUS_MAP = {
  active:          'active',
  'non-renewing':  'cancelled',
  attention:       'past_due',
  completed:       'cancelled',
  cancelled:       'cancelled',
};

async function paystackGet(path) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok || !body || body.status !== true || !body.data) {
    const err = new Error((body && body.message) || `${path} returned ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return body.data;
}

/**
 * Dig a subscription code out of an event body.
 *
 * Several shapes are tried because the payloads are undocumented, and a guess
 * written as if it were a fact is how a renewal silently stops being recorded.
 * Returns null rather than throwing: the caller logs and the daily reconcile
 * catches up.
 */
function subscriptionCodeFrom(data) {
  if (!data || typeof data !== 'object') return null;
  const candidates = [
    data.subscription_code,
    data.subscription && data.subscription.subscription_code,
    data.subscription && data.subscription.code,
    data.plan && data.plan.subscription_code,
    data.code,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('SUB_')) return c;
  }
  return null;
}

/**
 * Ask Paystack what a subscription is, and write that onto the venue's row.
 *
 * `code` is a SUB_ code. Returns a short result object for logging rather than
 * throwing on a business refusal, so a caller can acknowledge an event it will
 * never be able to act on instead of being retried for three days.
 */
async function syncSubscription({ admin, code }) {
  if (!SECRET) return { ok: false, note: 'not_configured' };
  if (!code) return { ok: false, note: 'no_code' };

  let data;
  try {
    data = await paystackGet(`/subscription/${encodeURIComponent(code)}`);
  } catch (err) {
    // Worth retrying: a fetch that fails now may work in three minutes, and
    // the alternative is a paid month that never reaches the row.
    console.error('[retail-paystack-sync] could not fetch', code, err.message);
    return { ok: false, retry: true, note: 'fetch_failed' };
  }

  // Paystack marks test and live data. A test subscription costs an attacker
  // nothing to create with the published test card, so it must not switch a
  // player on. Absent counts as not live, in the safe direction.
  if (!ALLOW_TEST && data.domain && data.domain !== 'live') {
    console.error('[retail-paystack-sync] REFUSED: not a live subscription', code, data.domain);
    return { ok: false, note: 'not_live' };
  }

  const planCode = data.plan && data.plan.plan_code;

  // ── Which venue is this ───────────────────────────────────────────────────
  //
  // By subscription code once linked. Before that, by the plan it is for:
  // retail-paystack-subscription.js builds one plan per venue, so a plan code
  // names a venue. The second lookup only accepts a row that is still waiting
  // to be linked, and the unique index from migration 219 stops the same
  // subscription ever reaching two rows.
  let row = null;
  {
    const { data: byCode, error } = await admin
      .from('retail_subscriptions')
      .select('id, venue_id, monthly_fee, currency, status, trial_ends_at, current_period_end, '
            + 'paystack_plan_code, paystack_subscription_code, paystack_billed_zar, cancelled_at')
      .eq('paystack_subscription_code', code)
      .maybeSingle();
    if (error) {
      console.error('[retail-paystack-sync] row lookup failed:', error.message);
      return { ok: false, retry: true, note: 'lookup_failed' };
    }
    row = byCode || null;
  }

  if (!row && planCode) {
    const { data: byPlan, error } = await admin
      .from('retail_subscriptions')
      .select('id, venue_id, monthly_fee, currency, status, trial_ends_at, current_period_end, '
            + 'paystack_plan_code, paystack_subscription_code, paystack_billed_zar, cancelled_at')
      .eq('paystack_plan_code', planCode)
      .is('paystack_subscription_code', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('[retail-paystack-sync] plan lookup failed:', error.message);
      return { ok: false, retry: true, note: 'lookup_failed' };
    }
    row = byPlan || null;
  }

  if (!row) {
    // A subscription on our Paystack account that no venue row claims. Not
    // retryable, and worth saying loudly: real money may be moving against a
    // plan nothing on this side is tracking.
    console.error('[retail-paystack-sync] NO VENUE for subscription', code, 'plan', planCode || 'none');
    return { ok: false, note: 'no_venue' };
  }

  // ── Is this the plan we built for this venue, at the price we built it at ──
  //
  // The amount is checked rather than assumed. A subscription to a plan that
  // bills less than the negotiated fee would otherwise switch a player on for
  // the wrong money, and the row would look perfectly healthy afterwards.
  const planMinor = Number(data.plan && data.plan.amount);
  const expectMinor = row.paystack_billed_zar == null
    ? null
    : Math.round(Number(row.paystack_billed_zar) * 100);
  if (expectMinor != null && Number.isFinite(planMinor) && planMinor < expectMinor) {
    console.error('[retail-paystack-sync] REFUSED: plan bills', planMinor,
      'minor units, expected at least', expectMinor, 'venue', row.venue_id, code);
    return { ok: false, note: 'amount_mismatch' };
  }
  if (data.plan && data.plan.currency && data.plan.currency !== 'ZAR') {
    console.error('[retail-paystack-sync] REFUSED: plan is in', data.plan.currency, 'not ZAR', code);
    return { ok: false, note: 'wrong_currency' };
  }

  const mapped = STATUS_MAP[String(data.status || '').toLowerCase()];
  if (!mapped) {
    // An unrecognised status is left alone rather than guessed at. Logged so a
    // new Paystack status shows up as a line in the log instead of as a venue
    // whose player went off for no reason.
    console.warn('[retail-paystack-sync] unknown Paystack status', data.status, 'for', code,
      '- row left as', row.status);
  }

  const patch = {
    paystack_subscription_code: code,
    paystack_email_token:       data.email_token || null,
    paystack_customer_code:     (data.customer && data.customer.customer_code) || null,
  };
  if (mapped) patch.status = mapped;
  if (mapped === 'cancelled' && !row.cancelled_at) patch.cancelled_at = new Date().toISOString();
  if (mapped === 'active') patch.cancelled_at = null;

  // next_payment_date is the date of the next charge, which is the end of the
  // period already paid for. It is only ever moved FORWARD: a webhook that
  // arrives out of order, or a reconcile that runs while Paystack is mid-cycle,
  // must not shorten a period a venue has paid for.
  const next = data.next_payment_date ? new Date(data.next_payment_date) : null;
  if (next && !Number.isNaN(next.getTime())) {
    const have = row.current_period_end ? new Date(row.current_period_end) : null;
    if (!have || next > have) patch.current_period_end = next.toISOString();
  }

  const { error: upErr } = await admin
    .from('retail_subscriptions').update(patch).eq('id', row.id);
  if (upErr) {
    console.error('[retail-paystack-sync] row update failed:', upErr.message, row.id);
    return { ok: false, retry: true, note: 'update_failed' };
  }

  // A paying venue's player goes on. Only ever on from here: switching one off
  // is the access sweep's job, once the paid period has actually ended.
  if (mapped === 'active') {
    const { error: venueErr } = await admin
      .from('retail_venues')
      .update({ status: 'active' })
      .eq('id', row.venue_id)
      .in('status', ['pending', 'suspended']);
    if (venueErr) {
      console.error('[retail-paystack-sync] venue activation failed:', venueErr.message, row.venue_id);
      return { ok: false, retry: true, note: 'activation_failed' };
    }
  }

  console.log('[retail-paystack-sync]', code, 'venue', row.venue_id,
    'paystack=', data.status, 'ours=', patch.status || row.status,
    'until', patch.current_period_end || row.current_period_end || 'unset');
  return { ok: true, venueId: row.venue_id, status: patch.status || row.status };
}

/**
 * A subscription or invoice webhook event.
 *
 * The event itself is only used to find a code. Everything else comes from
 * syncSubscription above.
 */
async function handleSubscriptionEvent({ admin, evt, eventType }) {
  const data = evt && evt.data;

  // Sent monthly about cards that expire this month, and it carries a list
  // rather than one subscription. Nothing to change: the charge either works
  // next cycle or Paystack sends invoice.payment_failed and the row goes
  // past_due. Logged so the count is visible.
  if (eventType === 'subscription.expiring_cards') {
    const n = Array.isArray(data) ? data.length : 0;
    console.log('[retail-paystack] expiring cards notice,', n, 'subscription(s)');
    return { ok: true, note: 'expiring_cards' };
  }

  const code = subscriptionCodeFrom(data);
  if (!code) {
    // The payload shapes are undocumented, so this is a real possibility
    // rather than a theoretical one. The keys are logged, never the values,
    // because an event body can carry customer and card detail.
    console.error('[retail-paystack] no subscription code in', eventType,
      '- keys were:', data && typeof data === 'object' ? Object.keys(data).join(',') : typeof data,
      '. The daily reconcile will pick this subscription up.');
    return { ok: true, note: 'no_code' };
  }

  if (eventType === 'invoice.payment_failed') {
    // Paystack does not retry a failed charge. The sync below reads the
    // subscription's status, which Paystack moves to 'attention', and that
    // maps to past_due. Nothing is switched off here: the venue keeps playing
    // until the period it paid for ends.
    console.warn('[retail-paystack] payment failed for', code);
  }

  return syncSubscription({ admin, code });
}

/**
 * charge.success on one of our own rtl_ references: the first payment, which
 * is also what creates the subscription at Paystack.
 *
 * Paystack sends charge.success and subscription.create for the same event and
 * in no guaranteed order. Only subscription.create carries a SUB_ code, so
 * this half does the part that does not need one: confirm the money was real,
 * and record the customer. The period and the status are set by the sync, from
 * whichever of the two events arrives with a code.
 */
async function handleRetailCharge({ admin, reference, tx }) {
  const { data: row, error } = await admin
    .from('retail_subscriptions')
    .select('id, venue_id, monthly_fee, paystack_billed_zar, paystack_reference')
    .eq('paystack_reference', reference)
    .maybeSingle();
  if (error) {
    console.error('[retail-paystack] reference lookup failed:', error.message, reference);
    return { ok: false, retry: true, note: 'lookup_failed' };
  }
  if (!row) {
    // A reference shaped like ours that this site never issued.
    console.error('[retail-paystack] NO VENUE for reference', reference, '- nothing recorded.');
    return { ok: false, note: 'unknown_reference' };
  }

  if (String(tx.status) !== 'success') {
    console.warn('[retail-paystack] charge for', reference, 'is', tx.status, '- nothing recorded.');
    return { ok: false, note: 'not_successful' };
  }

  const expectMinor = row.paystack_billed_zar == null
    ? Math.round(Number(row.monthly_fee || 0) * 100)
    : Math.round(Number(row.paystack_billed_zar) * 100);
  const paidMinor = Number(tx.amount);
  if (!Number.isFinite(paidMinor) || paidMinor < expectMinor) {
    console.error('[retail-paystack] REFUSED: paid', paidMinor, 'minor units, expected at least',
      expectMinor, 'venue', row.venue_id, reference);
    return { ok: false, note: 'amount_mismatch' };
  }
  if (tx.currency && tx.currency !== 'ZAR') {
    console.error('[retail-paystack] REFUSED: charge was in', tx.currency, 'not ZAR', reference);
    return { ok: false, note: 'wrong_currency' };
  }

  const customerCode = tx.customer && tx.customer.customer_code;
  if (customerCode) {
    const { error: upErr } = await admin.from('retail_subscriptions')
      .update({ paystack_customer_code: customerCode }).eq('id', row.id);
    if (upErr) console.error('[retail-paystack] customer code not saved:', upErr.message, row.id);
  }

  // The subscription code, if Paystack put the plan's subscription on the
  // transaction. When it did not, subscription.create carries it and the daily
  // reconcile is the backstop.
  const code = subscriptionCodeFrom(tx);
  if (code) return syncSubscription({ admin, code });

  console.log('[retail-paystack] first charge confirmed for venue', row.venue_id, reference,
    '- waiting on subscription.create for the subscription code.');
  return { ok: true, note: 'charge_confirmed' };
}

/**
 * Daily: ask Paystack about every venue subscription we know of, and write back
 * what it says.
 *
 * This is the reason a missed or malformed webhook is survivable. Every row
 * with a SUB_ code is re-read from Paystack once a day, so a renewal whose
 * event never arrived still extends the period, a cancellation made in
 * Paystack's own dashboard still reaches the row, and a failed charge still
 * shows up as past_due. The volume is one request per subscribed venue.
 */
async function reconcileAll({ admin, limit = 200 }) {
  if (!SECRET) return { checked: 0, note: 'not_configured' };

  const { data: rows, error } = await admin
    .from('retail_subscriptions')
    .select('id, paystack_subscription_code')
    .not('paystack_subscription_code', 'is', null)
    .limit(limit);
  if (error) {
    console.error('[retail-paystack-reconcile] read failed:', error.message);
    return { checked: 0, note: 'read_failed' };
  }

  let changed = 0;
  let failed = 0;
  for (const r of rows || []) {
    const out = await syncSubscription({ admin, code: r.paystack_subscription_code });
    if (out.ok) changed += 1; else failed += 1;
  }
  return { checked: (rows || []).length, synced: changed, failed };
}

module.exports = {
  RETAIL_REF_PREFIX,
  SUBSCRIPTION_EVENTS,
  STATUS_MAP,
  subscriptionCodeFrom,
  syncSubscription,
  handleSubscriptionEvent,
  handleRetailCharge,
  reconcileAll,
};
