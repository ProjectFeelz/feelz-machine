/**
 * netlify/lib/tierPaystackSub.js
 *
 * Paid tiers, billed in rand through Paystack.
 *
 * Two kinds of person buy a tier on this platform and the money works
 * identically for both, so they share this file rather than having two copies
 * of it that drift apart:
 *
 *   artist    an Artist Pro or Premium plan   artist_tier_subscriptions
 *   fan       Fan Pro                         listener_tier_subscriptions
 *
 * Everything that differs between them is in the SUBJECTS map at the bottom:
 * the table, the column naming the owner, the reference prefix, and what else
 * has to happen when a subscription goes live. Everything else, which is all
 * of the money handling, is written once.
 *
 *
 * THE RULES, AND WHERE THEY CAME FROM
 *
 * A webhook is a NUDGE, never a source of truth. Paystack documents its
 * subscription events by name and publishes no payload schema for any of them,
 * so this file digs a subscription code out of whatever arrived and then asks
 * Paystack what the subscription actually is. Status, next payment date, plan
 * and amount all come from that answer.
 *
 * Nothing is granted before the money arrives. A paystack_intents row says
 * what a payment is meant to be; the subscription row is created only by a
 * verified charge. The PayPal path wrote its row from the browser, RLS refused
 * it, and artists who had paid sat on the Free plan with no record anywhere.
 *
 * Every checkout carries a reference this site issued and stored first. A
 * PayPal subscription created without custom_id could not be matched to a
 * person afterwards, and one of them sat unrecorded for two days.
 *
 * A tier is never taken away from here. A failed charge or a cancellation
 * changes the row. The person keeps what they paid for until expires_at
 * passes, and the daily expiry job does the rest.
 *
 * Event order does not matter. Paystack sends charge.success and
 * subscription.create for the same event in no guaranteed order, and the
 * transaction may carry no subscription code at all, so the charge handler
 * asks Paystack directly rather than waiting for an event that may never come
 * in the shape expected.
 */

const retail = require('./retailPaystackSub');

const PAYSTACK_BASE = 'https://api.paystack.co';
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const ALLOW_TEST = process.env.PAYSTACK_ALLOW_TEST === 'true';

// The same Paystack events the retail side listens to. Deliberately the same
// Set object rather than a copy: if Paystack adds an event and it is added in
// one place, every side gets it, and they can never silently drift apart.
const SUBSCRIPTION_EVENTS = retail.SUBSCRIPTION_EVENTS;

// Paystack's subscription statuses mapped onto the two values these tables
// have ever actually held.
//
// 'attention' is Paystack's word for a charge that failed and will not be
// retried automatically. It maps to active on purpose: the person has paid for
// the period they are in, and the expiry job removes the tier when that period
// ends. Paystack's own word is kept untranslated in paystack_status, so
// nothing is lost by this narrowing.
const STATUS_MAP = {
  active:         'active',
  'non-renewing': 'cancelled',
  attention:      'active',
  completed:      'cancelled',
  cancelled:      'cancelled',
};

const PAYSTACK_COLUMNS =
  'paystack_subscription_code, paystack_plan_code, paystack_customer_code, '
  + 'paystack_reference, paystack_billed_zar, paystack_status';

async function paystackGet(path) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok || !body || body.status !== true || body.data === undefined) {
    const err = new Error((body && body.message) || `${path} returned ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return body.data;
}

/**
 * Ask Paystack for a customer's subscriptions and return the newest one on our
 * plan. Returns null rather than throwing: the caller has a backstop.
 */
async function findSubscriptionForCustomer({ customerCode, planCode }) {
  if (!SECRET || !customerCode) return null;
  try {
    const list = await paystackGet(`/subscription?customer=${encodeURIComponent(customerCode)}&perPage=20`);
    if (!Array.isArray(list)) return null;
    const matches = list.filter(s => {
      if (!s || typeof s.subscription_code !== 'string') return false;
      if (!planCode) return true;
      const p = s.plan && (s.plan.plan_code || s.plan);
      return p === planCode;
    });
    if (matches.length === 0) return null;
    matches.sort((a, b) =>
      new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
    return matches[0].subscription_code;
  } catch (err) {
    console.error('[tier-paystack] could not list subscriptions for', customerCode, ':', err.message);
    return null;
  }
}

/**
 * Build the handler set for one kind of subscriber.
 *
 * @param {object} s  a SUBJECTS entry: see the bottom of this file.
 */
function makeSubject(s) {
  const COLS = `id, ${s.ownerCol}, tier_id, status, billing_cycle, expires_at, started_at, `
             + `amount_paid, currency, payment_provider, cancelled_at, ${PAYSTACK_COLUMNS}`;
  const tag = `[${s.label}-paystack]`;

  /**
   * Find the subscription row for a Paystack subscription.
   *
   * Two ways in, tried in order of how certain each is. Returns null rather
   * than guessing: a row claimed on a weak match is worse than no row, because
   * it hands one person's paid tier to another.
   *
   * Note what is NOT here. The retail side could fall back to the plan code,
   * because it builds one plan per venue so a plan names a venue. Tier plans
   * are shared by everyone on the same price, so a plan code names nobody.
   */
  async function findRow({ admin, code, customerCode }) {
    {
      const { data, error } = await admin
        .from(s.table).select(COLS)
        .eq('paystack_subscription_code', code).maybeSingle();
      if (error) return { error };
      if (data) return { row: data, how: 'subscription_code' };
    }

    if (customerCode) {
      // A row this site created, whose first charge has been verified (which
      // is what writes the customer code) but which has not been linked to a
      // subscription yet. Narrow on purpose: only an unlinked row can be
      // claimed, so a returning customer's second subscription can never
      // overwrite the one they are already paying.
      const { data, error } = await admin
        .from(s.table).select(COLS)
        .eq('paystack_customer_code', customerCode)
        .is('paystack_subscription_code', null)
        .order('started_at', { ascending: false })
        .limit(1).maybeSingle();
      if (error) return { error };
      if (data) return { row: data, how: 'customer_code' };
    }

    return { row: null };
  }

  /**
   * Ask Paystack what a subscription is, and write that onto the row.
   *
   * Returns a short result object rather than throwing on a business refusal,
   * so a caller can acknowledge an event it will never be able to act on
   * instead of being redelivered hourly for three days.
   */
  //
  // alertIfUnowned exists because the webhook asks each kind of subscriber in
  // turn: retail, then artist, then fan. Only the LAST one asked may raise the
  // "nobody owns this" alert, or every fan's renewal would also send an alert
  // saying no artist owns it, which is true and useless and would train
  // somebody to ignore the one alert that matters.
  async function syncSubscription({ admin, code, customerCode = null, alertIfUnowned = true }) {
    if (!SECRET) return { ok: false, note: 'not_configured' };
    if (!code) return { ok: false, note: 'no_code' };

    let data;
    try {
      data = await paystackGet(`/subscription/${encodeURIComponent(code)}`);
    } catch (err) {
      // Worth retrying. A fetch that fails now may work in three minutes, and
      // the alternative is a paid month that never reaches the row.
      console.error(tag, 'could not fetch', code, err.message);
      return { ok: false, retry: true, note: 'fetch_failed' };
    }

    // Paystack's test card is published, so a test subscription costs an
    // attacker nothing to create and must never grant a paid tier. Absent
    // counts as not live, in the safe direction.
    if (!ALLOW_TEST && data.domain && data.domain !== 'live') {
      console.error(tag, 'REFUSED: not a live subscription', code, data.domain);
      return { ok: false, note: 'not_live' };
    }

    const planCode = data.plan && data.plan.plan_code;
    const custCode = customerCode || (data.customer && data.customer.customer_code) || null;

    const found = await findRow({ admin, code, customerCode: custCode });
    if (found.error) {
      console.error(tag, 'row lookup failed:', found.error.message);
      return { ok: false, retry: true, note: 'lookup_failed' };
    }

    const row = found.row;
    if (!row) {
      // A subscription on our Paystack account that nobody claims. Not
      // retryable, and said loudly: real money is moving and nothing on this
      // side is tracking it. This is the exact shape of the PayPal failure
      // that left a paid Pro plan unrecorded for two days, so it raises an
      // admin alert rather than only a log line.
      if (alertIfUnowned) {
        console.error(tag, 'NOBODY OWNS subscription', code,
          'plan', planCode || 'none', 'customer', custCode || 'none');
        await raiseUnmatchedAlert({ admin, code, planCode, customerCode: custCode, data });
      }
      return { ok: false, note: s.unownedNote };
    }

    // ── Is this plan one of ours, at the price the row agreed to ────────────
    //
    // Checked rather than assumed. A subscription against a cheaper plan would
    // otherwise grant a paid tier for the wrong money, and the row would look
    // perfectly healthy afterwards.
    const planMinor = Number(data.plan && data.plan.amount);
    const expectMinor = row.paystack_billed_zar == null
      ? null
      : Math.round(Number(row.paystack_billed_zar) * 100);
    if (expectMinor != null && Number.isFinite(planMinor) && planMinor < expectMinor) {
      console.error(tag, 'REFUSED: plan bills', planMinor,
        'minor units, expected at least', expectMinor, s.label, row[s.ownerCol], code);
      return { ok: false, note: 'amount_mismatch' };
    }
    if (data.plan && data.plan.currency && data.plan.currency !== 'ZAR') {
      console.error(tag, 'REFUSED: plan is in', data.plan.currency, 'not ZAR', code);
      return { ok: false, note: 'wrong_currency' };
    }

    const raw = String(data.status || '').toLowerCase();
    const mapped = STATUS_MAP[raw];
    if (!mapped) {
      // An unrecognised status is left alone rather than guessed at, so a new
      // Paystack status shows up as a line in the log instead of as somebody
      // whose tier disappeared for no reason.
      console.warn(tag, 'unknown Paystack status', data.status, 'for', code,
        '- row left as', row.status);
    }

    const patch = {
      paystack_subscription_code: code,
      paystack_email_token:       data.email_token || null,
      paystack_customer_code:     custCode,
      paystack_status:            raw || null,
      payment_provider:           'paystack',
      updated_at:                 new Date().toISOString(),
    };
    if (planCode) patch.paystack_plan_code = planCode;
    if (mapped) patch.status = mapped;
    if (mapped === 'cancelled' && !row.cancelled_at) patch.cancelled_at = new Date().toISOString();
    if (mapped === 'active') patch.cancelled_at = null;

    // next_payment_date is the date of the next charge, which is the end of
    // the period already paid for.
    //
    // Normally only ever moved FORWARD: a webhook arriving out of order, or a
    // reconcile running mid-cycle, must not shorten a period somebody has paid
    // for.
    //
    // The exception is the FIRST time a row is linked to a subscription. Until
    // then the row carries a provisional date that handleCharge worked out by
    // adding a month, which is a guess, and a guess landing a few hours past
    // Paystack's real date would otherwise win forever and leave the row
    // permanently disagreeing with Paystack about when money arrives. On the
    // first link Paystack's answer is simply the right one.
    //
    // This was caught by the test, not by reading the code: four assertions
    // failed because a provisional 20 December 10:39 beat Paystack's own
    // 20 December 00:00.
    const firstLink = !row.paystack_subscription_code;
    const next = data.next_payment_date ? new Date(data.next_payment_date) : null;
    if (next && !Number.isNaN(next.getTime())) {
      const have = row.expires_at ? new Date(row.expires_at) : null;
      if (firstLink || !have || next > have) patch.expires_at = next.toISOString();
    }

    // What they are actually paying, in the currency they are actually paying
    // it in. The PayPal rows hold dollars; these hold rand, and the currency
    // column is what tells them apart. Anything adding these up has to read
    // that column, which is why it is written here rather than left to
    // default.
    if (Number.isFinite(planMinor) && planMinor > 0) {
      patch.amount_paid = planMinor / 100;
      patch.currency = 'ZAR';
    }

    const { data: updated, error: upErr } = await admin
      .from(s.table).update(patch).eq('id', row.id).select('id');
    // Counted, not assumed. A zero row update is not an error in PostgREST,
    // and that silence is exactly what hid a lost PayPal payment for two days.
    if (upErr) {
      console.error(tag, 'row update failed:', upErr.message, row.id);
      return { ok: false, retry: true, note: 'update_failed' };
    }
    if (!updated || updated.length === 0) {
      console.error(tag, 'update changed NOTHING for row', row.id, code,
        '- the subscription is paid and the row did not move.');
      return { ok: false, retry: true, note: 'update_matched_nothing' };
    }

    if (mapped === 'active') {
      // No receipt from here. The receipt belongs to the moment the money
      // moved, which is handleCharge, and this function runs again on every
      // reconcile and every renewal event. Sending it here would mean a
      // "your plan is live" email every single month.
      await activate({ admin, row, patch, code, receipt: false });
    }

    console.log(tag, code, s.label, row[s.ownerCol],
      'paystack=', raw, 'ours=', patch.status || row.status,
      'until', patch.expires_at || row.expires_at || 'unset', 'via', found.how);
    return { ok: true, owner: row[s.ownerCol], status: patch.status || row.status };
  }

  /**
   * The parts that only happen when a subscription is genuinely active: one
   * active row per person, whatever else the subject needs, and the receipt.
   *
   * Every step logs its own failure and none of them stop the others. The
   * subscription is already recorded by the time this runs, so a failure here
   * costs a tidy-up, not a paying customer on the free plan.
   */
  async function activate({ admin, row, patch, code, receipt = false }) {
    // Exactly one active row per person, so the tier trigger has one thing to
    // derive from.
    const { error: retireErr } = await admin
      .from(s.table)
      .update({
        status:        'cancelled',
        cancelled_at:  new Date().toISOString(),
        cancel_reason: 'replaced',
        updated_at:    new Date().toISOString(),
      })
      .eq(s.ownerCol, row[s.ownerCol])
      .eq('status', 'active')
      .neq('id', row.id);
    if (retireErr) {
      console.error(tag, 'could not retire the older subscription:', retireErr.message, row[s.ownerCol]);
    }

    if (s.onActive) {
      try { await s.onActive({ admin, row }); }
      catch (e) { console.error(tag, 'post-activation step threw:', e.message); }
    }

    if (!receipt) return;

    try {
      const userId = await s.userIdFor({ admin, row });
      if (!userId) {
        // send-billing-emails.js resolves the address from user_id, so a
        // receipt without one is closed out as 'no_user_on_notification' and
        // never sent. Written anyway, because the in-app card may still be
        // reachable by artist_id, but said loudly: this is a paying customer
        // who will not get their receipt.
        console.error(tag, 'NO USER on the subscription that just went live, row', row.id,
          '- the receipt cannot be emailed.');
      }
      const { data: tierRow } = row.tier_id
        ? await admin.from('platform_tiers').select('name, slug').eq('id', row.tier_id).maybeSingle()
        : { data: null };

      const until = (patch && patch.expires_at) || row.expires_at;
      const renews = until
        ? new Date(until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

      const { error: notifErr } = await admin.from('notifications').insert({
        ...(s.notificationOwner ? s.notificationOwner(row) : {}),
        user_id: userId,
        type:    'subscription',
        title:   s.receiptTitle(tierRow),
        message: s.receiptMessage(renews),
        email_requested: true,
        metadata: {
          // 'started' is in EMAILABLE_KINDS in send-billing-emails.js. Without
          // a kind, this receipt is stamped kind_not_emailable and the one
          // email a paying customer should always get is never sent.
          kind:          'started',
          audience:      s.audience,
          tier:          tierRow ? tierRow.slug : null,
          billing_cycle: row.billing_cycle || null,
          expires_at:    until || null,
          subscription:  code,
          provider:      'paystack',
        },
      });
      if (notifErr) console.error(tag, 'receipt refused (subscription is fine):', notifErr.message);
    } catch (e) {
      console.error(tag, 'receipt threw (subscription is fine):', e.message);
    }
  }

  /**
   * A live subscription nobody claims.
   *
   * ADDRESSED TO EVERY ADMIN, ONE ROW EACH, AND THAT IS THE WHOLE POINT.
   *
   * The first version of this wrote a single row with user_id null, which
   * reaches nobody twice over. send-billing-emails.js resolves an address from
   * user_id and closes a row out as 'no_user_on_notification' when there is
   * none, so no email. And NotificationsPage reads
   * `artist_id = mine OR user_id = mine`, so no card either. It would have
   * been a loud alert written to a table and seen by no human being.
   *
   * paypal-webhook.js already had this right: read the admins table, write one
   * notification per admin. This copies that exactly, type 'admin_message' and
   * all, so both alerts arrive looking the same.
   */
  async function raiseUnmatchedAlert({ admin, code, planCode, customerCode, data }) {
    try {
      const email = (data && data.customer && data.customer.email) || null;
      const amount = data && data.plan && Number.isFinite(Number(data.plan.amount))
        ? `R${(Number(data.plan.amount) / 100).toFixed(2)}`
        : 'an unknown amount';

      const { data: admins, error: adminErr } = await admin.from('admins').select('user_id');
      if (adminErr) {
        console.error(tag, 'could not read the admins to alert:', adminErr.message);
        return;
      }
      const rows = (admins || []).map(a => a.user_id).filter(Boolean).map(uid => ({
        user_id: uid,
        type:    'admin_message',
        title:   'A Paystack subscription could not be matched',
        message: `Paystack subscription ${code} is billing ${amount} and no ${s.label} account `
               + 'is linked to it. Somebody is paying and has not been given their plan. '
               + (email ? `The subscriber's email is ${email}. ` : '')
               + `Plan ${planCode || 'unknown'}, customer ${customerCode || 'unknown'}.`,
        email_requested: true,
        metadata: {
          // In EMAILABLE_KINDS in send-billing-emails.js. The PayPal
          // equivalent sat unsent for two days because its kind was not.
          kind:         'subscription_unmatched',
          audience:     'admin',
          provider:     'paystack',
          subject:      s.label,
          subscription: code,
          plan:         planCode || null,
          customer:     customerCode || null,
        },
      }));

      if (rows.length === 0) {
        // No admins means the alert has nowhere to go. That is worth saying,
        // because the silence would otherwise look like "no problem found".
        console.error(tag, 'NOBODY TO ALERT about unmatched subscription', code,
          '- the admins table returned no user ids.');
        return;
      }

      const { error } = await admin.from('notifications').insert(rows);
      if (error) console.error(tag, 'unmatched alert refused:', error.message);
    } catch (e) {
      console.error(tag, 'unmatched alert threw:', e.message);
    }
  }

  /** Tell the subscriber their card did not go through. */
  async function warnPaymentFailed({ admin, code }) {
    try {
      const { data: row } = await admin
        .from(s.table).select(`id, ${s.ownerCol}, expires_at`)
        .eq('paystack_subscription_code', code).maybeSingle();
      if (!row) return;

      const userId = await s.userIdFor({ admin, row });
      const until = row.expires_at
        ? new Date(row.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

      const { error } = await admin.from('notifications').insert({
        ...(s.notificationOwner ? s.notificationOwner(row) : {}),
        user_id: userId,
        type:    'subscription',
        title:   'Your card did not go through',
        message: 'We could not take this month\'s payment for your plan. Your plan is still on'
               + (until ? ` until ${until}.` : '.')
               + ' Update your card on the billing page to keep it.',
        email_requested: true,
        metadata: {
          kind:         'payment_failed',
          audience:     s.audience,
          provider:     'paystack',
          subscription: code,
        },
      });
      if (error) console.error(tag, 'failure notice refused:', error.message);
    } catch (e) {
      console.error(tag, 'failure notice threw:', e.message);
    }
  }

  /**
   * A subscription or invoice webhook event. The event itself is used for
   * nothing but finding a code.
   */
  async function handleSubscriptionEvent({ admin, evt, eventType, alertIfUnowned = true }) {
    const data = evt && evt.data;

    if (eventType === 'subscription.expiring_cards') {
      // Handled on the retail side, which logs the count. Nothing to add.
      return { ok: true, note: 'expiring_cards' };
    }

    const code = retail.subscriptionCodeFrom(data);
    if (!code) {
      // The payload shapes are undocumented, so this is a real possibility.
      // The keys are logged, never the values, because an event body carries
      // customer and card detail.
      console.error(tag, 'no subscription code in', eventType,
        '- keys were:', data && typeof data === 'object' ? Object.keys(data).join(',') : typeof data,
        '. The daily reconcile will pick this subscription up.');
      return { ok: true, note: 'no_code' };
    }

    if (eventType === 'invoice.payment_failed') {
      // Paystack does not retry. Nothing is switched off: the person keeps the
      // tier until the period they paid for ends. They are told, because a
      // card that quietly stopped working is a thing somebody can fix in a
      // minute if they know about it.
      console.warn(tag, 'payment failed for', code);
      await warnPaymentFailed({ admin, code });
    }

    return syncSubscription({ admin, code, alertIfUnowned });
  }

  /**
   * charge.success on one of our own references: the first payment, which is
   * also what creates the subscription at Paystack.
   */
  async function handleCharge({ admin, reference, tx }) {
    // The intent row, written before the buyer left the site. No subscription
    // row exists yet, on purpose: a row created before the money arrives is a
    // tier granted before the money arrives.
    const { data: intent, error } = await admin
      .from('paystack_intents')
      .select('reference, artist_id, user_id, tier_id, billing_cycle, plan_code, '
            + 'zar_amount, zar_minor, usd_price, fx_rate, status')
      .eq('reference', reference)
      .maybeSingle();
    if (error) {
      console.error(tag, 'intent lookup failed:', error.message, reference);
      return { ok: false, retry: true, note: 'lookup_failed' };
    }
    if (!intent) {
      // A reference shaped like ours that this site never issued.
      console.error(tag, 'NO INTENT for reference', reference, '- nothing recorded.');
      return { ok: false, note: 'unknown_reference' };
    }
    const owner = intent[s.ownerCol];
    if (!owner || !intent.tier_id) {
      console.error(tag, 'intent', reference, 'has no', s.ownerCol, 'or no tier - nothing recorded.');
      return { ok: false, note: 'intent_incomplete' };
    }

    if (String(tx.status) !== 'success') {
      console.warn(tag, 'charge for', reference, 'is', tx.status, '- nothing recorded.');
      return { ok: false, note: 'not_successful' };
    }

    const expectMinor = intent.zar_minor == null
      ? (intent.zar_amount == null ? null : Math.round(Number(intent.zar_amount) * 100))
      : Number(intent.zar_minor);
    const paidMinor = Number(tx.amount);
    if (expectMinor != null && (!Number.isFinite(paidMinor) || paidMinor < expectMinor)) {
      console.error(tag, 'REFUSED: paid', paidMinor, 'minor units, expected at least',
        expectMinor, s.label, owner, reference);
      return { ok: false, note: 'amount_mismatch' };
    }
    if (tx.currency && tx.currency !== 'ZAR') {
      console.error(tag, 'REFUSED: charge was in', tx.currency, 'not ZAR', reference);
      return { ok: false, note: 'wrong_currency' };
    }

    const customerCode = (tx.customer && tx.customer.customer_code) || null;
    const paidZar = Number.isFinite(paidMinor) ? paidMinor / 100 : Number(intent.zar_amount);
    const cycle = intent.billing_cycle === 'annual' ? 'annual' : 'monthly';

    // ── The subscription row ─────────────────────────────────────────────────
    //
    // Idempotent on the reference. Paystack redelivers, and a redelivery must
    // not hand the same person two active subscriptions.
    let row;
    {
      const { data: existing, error: exErr } = await admin
        .from(s.table).select(COLS)
        .eq('paystack_reference', reference).maybeSingle();
      if (exErr) {
        console.error(tag, 'existing row lookup failed:', exErr.message, reference);
        return { ok: false, retry: true, note: 'lookup_failed' };
      }
      row = existing || null;
    }

    const firstTime = !row;

    if (firstTime) {
      // Provisional. The sync below replaces it with Paystack's own
      // next_payment_date, which is the date that actually governs the money.
      const days = cycle === 'annual' ? 365 : 30;
      const nowIso = new Date().toISOString();

      const { data: inserted, error: insErr } = await admin
        .from(s.table)
        .insert({
          [s.ownerCol]:       owner,
          tier_id:            intent.tier_id,
          status:             'active',
          billing_cycle:      cycle,
          payment_provider:   'paystack',
          amount_paid:        paidZar,
          currency:           'ZAR',
          started_at:         nowIso,
          expires_at:         new Date(Date.now() + days * 86400000).toISOString(),
          updated_at:         nowIso,
          paystack_reference:     reference,
          paystack_plan_code:     intent.plan_code || null,
          paystack_customer_code: customerCode,
          paystack_billed_zar:    paidZar,
        })
        .select(COLS)
        .maybeSingle();

      // Read, never discarded. This is the write that decides whether somebody
      // who has just paid gets what they paid for.
      if (insErr || !inserted) {
        console.error(tag, 'SUBSCRIPTION ROW REFUSED - paid, not granted.',
          'msg=', insErr && insErr.message, s.ownerCol + '=', owner, 'ref=', reference);
        return { ok: false, retry: true, note: 'insert_failed' };
      }
      row = inserted;
    } else if (customerCode && !row.paystack_customer_code) {
      const { error: upErr } = await admin.from(s.table)
        .update({ paystack_customer_code: customerCode, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (upErr) console.error(tag, 'customer code not saved:', upErr.message, row.id);
    }

    // One active row, whatever else the subject needs, and the receipt exactly
    // once.
    await activate({ admin, row, patch: {}, code: reference, receipt: firstTime });

    const { error: settleErr } = await admin.from('paystack_intents')
      .update({ status: 'paid', settled_at: new Date().toISOString() })
      .eq('reference', reference);
    if (settleErr) console.error(tag, 'intent not closed out:', settleErr.message, reference);

    // ── Link it to the subscription Paystack just created ───────────────────
    //
    // The subscription code, if Paystack put it on the transaction. If it did
    // not, ask. This is the step that makes event order stop mattering.
    let code = retail.subscriptionCodeFrom(tx);
    if (!code && customerCode) {
      code = await findSubscriptionForCustomer({ customerCode, planCode: intent.plan_code });
    }

    if (code) {
      const out = await syncSubscription({ admin, code, customerCode });
      // The money is recorded and the tier is on either way. A sync that
      // failed is a period end that may be a few days out until the reconcile
      // runs, not somebody who paid for nothing.
      return out.ok ? out : { ok: true, note: 'charged_sync_' + (out.note || 'failed') };
    }

    console.log(tag, 'first charge recorded for', s.label, owner, reference,
      '- no subscription code yet, the reconcile will link it.');
    return { ok: true, note: 'charge_recorded' };
  }

  /**
   * Daily: ask Paystack about every subscription of this kind that we know of,
   * and write back what it says.
   *
   * This is why a missed or malformed webhook is survivable at all. A renewal
   * whose event never arrived still extends the period, a cancellation made in
   * Paystack's own dashboard still reaches the row, and a subscription that
   * was never linked gets picked up. One request per subscriber.
   */
  async function reconcileAll({ admin, limit = 500 }) {
    if (!SECRET) return { checked: 0, note: 'not_configured' };

    const { data: rows, error } = await admin
      .from(s.table)
      .select('id, paystack_subscription_code')
      .not('paystack_subscription_code', 'is', null)
      .limit(limit);
    if (error) {
      console.error(tag, 'reconcile read failed:', error.message);
      return { checked: 0, note: 'read_failed' };
    }

    let synced = 0;
    let failed = 0;
    for (const r of rows || []) {
      const out = await syncSubscription({ admin, code: r.paystack_subscription_code });
      if (out.ok) synced += 1; else failed += 1;
    }
    console.log(tag, 'reconcile checked', (rows || []).length, 'synced', synced, 'failed', failed);
    return { checked: (rows || []).length, synced, failed };
  }

  return {
    label: s.label,
    table: s.table,
    ownerCol: s.ownerCol,
    REF_PREFIX: s.refPrefix,
    SUBSCRIPTION_EVENTS,
    STATUS_MAP,
    syncSubscription,
    handleSubscriptionEvent,
    handleCharge,
    reconcileAll,
  };
}

// ── The two kinds of subscriber ──────────────────────────────────────────────

const artist = makeSubject({
  label:    'artist',
  table:    'artist_tier_subscriptions',
  ownerCol: 'artist_id',
  // Three letters plus an underscore, same shape as the retail rtl_ prefix.
  refPrefix: 'art_',
  audience:  'artist',
  unownedNote: 'no_artist',
  notificationOwner: (row) => ({ artist_id: row ? row.artist_id : null }),
  // artists.tier is derived by trg_sync_artist_tier from the active
  // subscription. current_tier_id is the pointer the dashboard reads for
  // limits, and that one is ours to set.
  onActive: async ({ admin, row }) => {
    if (!row.tier_id) return;
    const { error } = await admin.from('artists')
      .update({ current_tier_id: row.tier_id, updated_at: new Date().toISOString() })
      .eq('id', row.artist_id);
    if (error) console.error('[artist-paystack] could not set current_tier_id:', error.message);
  },
  userIdFor: async ({ admin, row }) => {
    const { data } = await admin.from('artists').select('user_id').eq('id', row.artist_id).maybeSingle();
    return data ? data.user_id : null;
  },
  receiptTitle:   (tier) => `Artist ${tier ? tier.name : 'plan'} is live`,
  receiptMessage: (renews) => 'Your new upload and payout limits are on.'
    + (renews ? ` Your card is charged again on ${renews}.` : ''),
});

const fan = makeSubject({
  label:    'fan',
  table:    'listener_tier_subscriptions',
  ownerCol: 'user_id',
  refPrefix: 'fan_',
  audience:  'listener',
  unownedNote: 'no_listener',
  // listener_tier_subscriptions has no artist_id, and a notification about a
  // fan's own subscription is not about an artist, so none is set.
  notificationOwner: null,
  onActive: null,
  userIdFor: async ({ row }) => row.user_id,
  receiptTitle:   (tier) => `${tier ? tier.name : 'Fan Pro'} is live`,
  receiptMessage: (renews) => 'Ad free listening, offline downloads and early access are on.'
    + (renews ? ` Your card is charged again on ${renews}.` : ''),
});

module.exports = {
  SUBSCRIPTION_EVENTS,
  STATUS_MAP,
  findSubscriptionForCustomer,
  makeSubject,
  artist,
  fan,
  SUBJECTS: [artist, fan],
};
