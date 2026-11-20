/**
 * test/tier-paystack.test.js
 *
 * Runs the real netlify/lib/tierPaystackSub.js against a fake Paystack and a
 * fake database that actually stores rows.
 *
 *   node test/tier-paystack.test.js
 *
 * The whole suite runs TWICE, once for an artist tier and once for Fan Pro,
 * against the same code. That is the point of the refactor: if the two ever
 * stop behaving identically where they should, this says so.
 *
 * What it is trying to prove, in order of how much it would cost to be wrong:
 *
 *   1. Somebody who pays gets their tier, and the money is recorded.
 *   2. Somebody who does not pay gets nothing.
 *   3. A redelivered webhook does not charge, grant or thank anybody twice.
 *   4. A subscription nobody claims raises an alert instead of going quiet.
 *   5. A renewal never shortens a period somebody has paid for.
 *   6. A failed renewal does not take away a tier already paid for.
 */

process.env.PAYSTACK_SECRET_KEY = 'sk_live_fake_for_tests';
process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { makeDb, installFetch, check, eq, report } = require('./fakes');
const tiers = require('../netlify/lib/tierPaystackSub');

const TIER = 'tier-uuid';
const OWNER = 'owner-uuid';
const USER = 'user-uuid';
const SUB_CODE = 'SUB_livecode123';
const CUST_CODE = 'CUS_livecust123';
const EMAIL = 'buyer@example.com';

const liveTx = (over = {}) => ({
  status: 'success', amount: 3800, currency: 'ZAR', domain: 'live',
  customer: { customer_code: CUST_CODE, email: EMAIL },
  ...over,
});

const subResponse = (over = {}) => ({
  status: true,
  data: {
    subscription_code: SUB_CODE,
    domain: 'live',
    status: 'active',
    email_token: 'tok_live_123',
    next_payment_date: '2026-12-20T00:00:00.000Z',
    customer: { customer_code: CUST_CODE, email: EMAIL },
    plan: { plan_code: 'PLN_monthly', amount: 3800, currency: 'ZAR' },
    ...over,
  },
});

const routes = (subOver = {}) => [
  [/^\/subscription\/SUB_/, { body: subResponse(subOver) }],
  [/^\/subscription\?customer=/, { body: { status: true, data: [
    { subscription_code: SUB_CODE, plan: { plan_code: 'PLN_monthly' }, createdAt: '2026-11-20T10:00:00Z' },
  ] } }],
];

const quiet = () => {
  const keep = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  return () => Object.assign(console, keep);
};

// ── The two subjects, described for the test ────────────────────────────────
const CASES = [
  {
    name: 'ARTIST',
    subject: tiers.artist,
    ref: 'art_abc123def456789a',
    table: 'artist_tier_subscriptions',
    ownerCol: 'artist_id',
    seed: () => ({
      paystack_intents: [{
        reference: 'art_abc123def456789a', artist_id: OWNER, user_id: USER, tier_id: TIER,
        billing_cycle: 'monthly', plan_code: 'PLN_monthly',
        zar_amount: 38.00, zar_minor: 3800, usd_price: 2.00, fx_rate: 19.0, status: 'pending',
      }],
      artist_tier_subscriptions: [],
      artists: [{ id: OWNER, user_id: USER, current_tier_id: null }],
      platform_tiers: [{ id: TIER, slug: 'pro', name: 'Pro' }],
      notifications: [],
    }),
    // The artist side also has to set the tier pointer the dashboard reads.
    extra: (db) => {
      eq('ARTIST paid: the tier pointer is set', db.tables.artists[0].current_tier_id, TIER);
      const r = db.tables.notifications.find(n => n.metadata && n.metadata.kind === 'started');
      eq('ARTIST paid: the receipt is filed against the artist', r && r.artist_id, OWNER);
    },
  },
  {
    name: 'FAN',
    subject: tiers.fan,
    ref: 'fan_abc123def456789a',
    table: 'listener_tier_subscriptions',
    ownerCol: 'user_id',
    seed: () => ({
      paystack_intents: [{
        reference: 'fan_abc123def456789a', user_id: OWNER, tier_id: TIER,
        billing_cycle: 'monthly', plan_code: 'PLN_monthly',
        zar_amount: 38.00, zar_minor: 3800, usd_price: 2.00, fx_rate: 19.0, status: 'pending',
      }],
      listener_tier_subscriptions: [],
      platform_tiers: [{ id: TIER, slug: 'fan_pro', name: 'Fan Pro' }],
      notifications: [],
    }),
    extra: (db) => {
      const r = db.tables.notifications.find(n => n.metadata && n.metadata.kind === 'started');
      eq('FAN paid: the receipt goes to the listener', r && r.user_id, OWNER);
      eq('FAN paid: and is addressed to a listener', r && r.metadata.audience, 'listener');
      check('FAN paid: no artist is attached to it', !r || r.artist_id === undefined || r.artist_id === null,
        'artist_id was ' + JSON.stringify(r && r.artist_id));
    },
  },
];

(async () => {
  for (const C of CASES) {
    const { subject, ref: REF, table, ownerCol, name } = C;
    const rows = (db) => db.tables[table];
    const p = (s) => `${name} ${s}`;

    // ── 1. The happy path ───────────────────────────────────────────────────
    {
      const db = makeDb(C.seed());
      installFetch(routes());
      const un = quiet();
      const out = await subject.handleCharge({ admin: db, reference: REF, tx: liveTx() });
      un();

      const row = rows(db)[0];
      check(p('paid: the call succeeds'), out.ok, JSON.stringify(out));
      check(p('paid: a subscription row exists'), Boolean(row), 'no row written');
      eq(p('paid: it is active'), row && row.status, 'active');
      eq(p('paid: it belongs to the right person'), row && row[ownerCol], OWNER);
      eq(p('paid: it is on the right tier'), row && row.tier_id, TIER);
      eq(p('paid: the provider is recorded'), row && row.payment_provider, 'paystack');
      eq(p('paid: the money is recorded'), row && row.amount_paid, 38);
      eq(p('paid: in rand'), row && row.currency, 'ZAR');
      eq(p('paid: the reference is kept'), row && row.paystack_reference, REF);
      eq(p('paid: linked to the Paystack subscription'), row && row.paystack_subscription_code, SUB_CODE);
      eq(p('paid: the intent is closed'), db.tables.paystack_intents[0].status, 'paid');
      eq(p('paid: period end comes from Paystack'), row && row.expires_at, '2026-12-20T00:00:00.000Z');

      const receipts = db.tables.notifications.filter(n => n.metadata && n.metadata.kind === 'started');
      eq(p('paid: exactly one receipt'), receipts.length, 1);
      eq(p('paid: the receipt can be emailed'), receipts[0] && receipts[0].email_requested, true);

      C.extra(db);
    }

    // ── 2. Redelivery ───────────────────────────────────────────────────────
    {
      const db = makeDb(C.seed());
      installFetch(routes());
      const un = quiet();
      await subject.handleCharge({ admin: db, reference: REF, tx: liveTx() });
      const out2 = await subject.handleCharge({ admin: db, reference: REF, tx: liveTx() });
      un();

      check(p('redelivery: still succeeds'), out2.ok, JSON.stringify(out2));
      eq(p('redelivery: still one subscription row'), rows(db).length, 1);
      eq(p('redelivery: still exactly one receipt'),
        db.tables.notifications.filter(n => n.metadata && n.metadata.kind === 'started').length, 1);
      eq(p('redelivery: the row is still active'), rows(db)[0].status, 'active');
    }

    // ── 3. Things that must NOT grant a tier ────────────────────────────────
    const refuses = [
      ['failed charge', { status: 'failed' }, 'not_successful'],
      ['underpaid',     { amount: 100 },      'amount_mismatch'],
      ['wrong currency',{ currency: 'NGN' },  'wrong_currency'],
    ];
    for (const [label, over, note] of refuses) {
      const db = makeDb(C.seed());
      installFetch(routes());
      const un = quiet();
      const out = await subject.handleCharge({ admin: db, reference: REF, tx: liveTx(over) });
      un();
      eq(p(`${label}: refused with the right reason`), out.note, note);
      eq(p(`${label}: no row written`), rows(db).length, 0);
      eq(p(`${label}: nobody was thanked`), db.tables.notifications.length, 0);
    }

    {
      const db = makeDb(C.seed());
      installFetch(routes());
      const un = quiet();
      const out = await subject.handleCharge({
        admin: db, reference: subject.REF_PREFIX + 'neverissued00', tx: liveTx(),
      });
      un();
      eq(p('forged reference: refused'), out.note, 'unknown_reference');
      eq(p('forged reference: no row written'), rows(db).length, 0);
    }

    // Paystack's test card is published, so a test subscription is free for an
    // attacker to create. It must never grant a paid tier.
    {
      const db = makeDb(C.seed());
      installFetch(routes({ domain: 'test' }));
      const un = quiet();
      const out = await subject.syncSubscription({ admin: db, code: SUB_CODE });
      un();
      eq(p('test-mode subscription: refused'), out.note, 'not_live');
    }

    // A subscription against a cheaper plan than the row agreed to.
    {
      const db = makeDb(C.seed());
      installFetch(routes());
      const un = quiet();
      await subject.handleCharge({ admin: db, reference: REF, tx: liveTx() });
      installFetch(routes({ plan: { plan_code: 'PLN_monthly', amount: 100, currency: 'ZAR' } }));
      const out = await subject.syncSubscription({ admin: db, code: SUB_CODE });
      un();
      eq(p('cheap plan: refused'), out.note, 'amount_mismatch');
    }

    // ── 4. A subscription nobody claims ─────────────────────────────────────
    {
      const s = C.seed();
      s.paystack_intents = [];
      const db = makeDb(s);
      installFetch(routes());
      const un = quiet();
      const out = await subject.syncSubscription({ admin: db, code: SUB_CODE });
      un();

      check(p('unmatched: refused'), !out.ok, JSON.stringify(out));
      const alerts = db.tables.notifications.filter(n => n.metadata && n.metadata.kind === 'subscription_unmatched');
      eq(p('unmatched: an admin alert was raised'), alerts.length, 1);
      eq(p('unmatched: the alert can be emailed'), alerts[0] && alerts[0].email_requested, true);
      check(p('unmatched: the alert names the subscription'),
        alerts[0] && String(alerts[0].message).includes(SUB_CODE), alerts[0] && alerts[0].message);
      check(p('unmatched: the alert names the subscriber'),
        alerts[0] && String(alerts[0].message).includes(EMAIL), alerts[0] && alerts[0].message);
      eq(p('unmatched: the alert says which side it came from'),
        alerts[0] && alerts[0].metadata.subject, subject.label);
    }

    // ── 5. A renewal never shortens a paid period ───────────────────────────
    {
      const db = makeDb(C.seed());
      installFetch(routes());
      const un = quiet();
      await subject.handleCharge({ admin: db, reference: REF, tx: liveTx() });

      installFetch(routes({ next_payment_date: '2026-11-25T00:00:00.000Z' }));
      await subject.syncSubscription({ admin: db, code: SUB_CODE });
      const afterEarly = rows(db)[0].expires_at;

      installFetch(routes({ next_payment_date: '2027-01-20T00:00:00.000Z' }));
      await subject.syncSubscription({ admin: db, code: SUB_CODE });
      const afterRenewal = rows(db)[0].expires_at;
      un();

      eq(p('out-of-order event: the period is NOT shortened'), afterEarly, '2026-12-20T00:00:00.000Z');
      eq(p('renewal: the period moves forward'), afterRenewal, '2027-01-20T00:00:00.000Z');
      eq(p('renewal: no second receipt'),
        db.tables.notifications.filter(n => n.metadata && n.metadata.kind === 'started').length, 1);
    }

    // ── 6. A failed renewal does not take the tier away ─────────────────────
    {
      const db = makeDb(C.seed());
      installFetch(routes());
      const un = quiet();
      await subject.handleCharge({ admin: db, reference: REF, tx: liveTx() });

      installFetch(routes({ status: 'attention' }));
      await subject.handleSubscriptionEvent({
        admin: db, eventType: 'invoice.payment_failed',
        evt: { data: { subscription_code: SUB_CODE } },
      });
      un();

      const row = rows(db)[0];
      eq(p('failed renewal: the tier is NOT taken away'), row.status, 'active');
      eq(p('failed renewal: Paystack\'s own word is kept'), row.paystack_status, 'attention');
      eq(p('failed renewal: the period is unchanged'), row.expires_at, '2026-12-20T00:00:00.000Z');
      eq(p('failed renewal: the subscriber is told'),
        db.tables.notifications.filter(n => n.metadata && n.metadata.kind === 'payment_failed').length, 1);
    }

    // ── 7. Cancelling ───────────────────────────────────────────────────────
    {
      const db = makeDb(C.seed());
      installFetch(routes());
      const un = quiet();
      await subject.handleCharge({ admin: db, reference: REF, tx: liveTx() });
      installFetch(routes({ status: 'non-renewing' }));
      await subject.syncSubscription({ admin: db, code: SUB_CODE });
      un();

      const row = rows(db)[0];
      eq(p('cancelled: the row says cancelled'), row.status, 'cancelled');
      check(p('cancelled: a cancellation date is set'), Boolean(row.cancelled_at), 'cancelled_at empty');
      eq(p('cancelled: access still runs to the paid date'), row.expires_at, '2026-12-20T00:00:00.000Z');
    }

    // ── 8. One active subscription per person ───────────────────────────────
    {
      const s = C.seed();
      s[table].push({
        id: 'old-row', [ownerCol]: OWNER, tier_id: TIER, status: 'active',
        payment_provider: 'paypal_web', paypal_subscription_id: 'I-OLDPAYPAL',
        expires_at: '2026-12-01T00:00:00.000Z',
      });
      const db = makeDb(s);
      installFetch(routes());
      const un = quiet();
      await subject.handleCharge({ admin: db, reference: REF, tx: liveTx() });
      un();

      const active = rows(db).filter(r => r.status === 'active');
      eq(p('one active: exactly one active row remains'), active.length, 1);
      eq(p('one active: it is the new Paystack one'), active[0].paystack_reference, REF);
      const old = rows(db).find(r => r.id === 'old-row');
      eq(p('one active: the old PayPal row is retired'), old.status, 'cancelled');
      eq(p('one active: and says why'), old.cancel_reason, 'replaced');
    }

    // ── 9. Event order does not matter ──────────────────────────────────────
    {
      const db = makeDb(C.seed());
      installFetch(routes());
      const un = quiet();
      const out = await subject.handleCharge({ admin: db, reference: REF, tx: liveTx() });
      un();
      check(p('no code on the charge: still succeeds'), out.ok, JSON.stringify(out));
      eq(p('no code on the charge: linked by asking Paystack'),
        rows(db)[0].paystack_subscription_code, SUB_CODE);
    }

    // ── 10. subscription.create arriving FIRST ──────────────────────────────
    {
      const db = makeDb(C.seed());
      installFetch(routes());
      const un = quiet();
      const first = await subject.handleSubscriptionEvent({
        admin: db, eventType: 'subscription.create',
        evt: { data: { subscription_code: SUB_CODE } },
      });
      const then = await subject.handleCharge({ admin: db, reference: REF, tx: liveTx() });
      un();

      check(p('event first: refused, and said so'), !first.ok, JSON.stringify(first));
      check(p('event first: the later charge still works'), then.ok, JSON.stringify(then));
      eq(p('event first: the subscriber ends up subscribed'),
        rows(db)[0].paystack_subscription_code, SUB_CODE);
    }
  }

  // ── 11. The two sides cannot collide ──────────────────────────────────────
  //
  // Both prefixes are routed by the same webhook, so they must be different,
  // and neither may collide with retail's.
  {
    const retail = require('../netlify/lib/retailPaystackSub');
    const all = [tiers.artist.REF_PREFIX, tiers.fan.REF_PREFIX, retail.RETAIL_REF_PREFIX];
    eq('prefixes: all three are distinct', new Set(all).size, 3);
    check('prefixes: none is a prefix of another',
      !all.some((a, i) => all.some((b, j) => i !== j && b.startsWith(a))), all.join(','));
    check('prefixes: artist and fan use different tables',
      tiers.artist.table !== tiers.fan.table, tiers.artist.table);
  }

  process.exit(report('TIER SUBSCRIPTIONS IN RAND (artist and fan)') === 0 ? 0 : 1);
})();
