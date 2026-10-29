/**
 * netlify/functions/paystack-webhook.js
 *
 * Where a Paystack payment becomes a sale.
 *
 * netlify/functions/paystack-checkout.js takes nothing and records nothing
 * but an intent. This is the only place a purchase row, a download grant, a
 * receipt or a collaborator split is written for the Paystack route.
 *
 *
 * FOUR SEPARATE CHECKS, AND WHY NONE OF THEM IS SPARE
 *
 * 1. The signature. HMAC SHA512 of the RAW request body, keyed with the
 *    secret key, compared against the x-paystack-signature header. Without it
 *    this endpoint is a public URL that grants paid downloads to anybody who
 *    can shape a JSON body.
 *
 * 2. The transaction, re-fetched from Paystack by reference. The body that
 *    arrives is not what the amount is read from: the verify endpoint is.
 *    This costs one HTTP call and removes a whole class of problem, including
 *    the obvious one where a leaked secret key is enough to post a successful
 *    charge for a track nobody paid for.
 *
 * 3. The domain. Paystack puts "test" or "live" on every transaction it
 *    returns. A test transaction is one anybody can create with Paystack's
 *    published test card, for nothing, so recording one as a sale would hand
 *    over a paid download and leave a figure in the books that no money ever
 *    matched. Anything that does not say "live" is refused.
 *
 * 4. The intent, read from this database by reference. This is what was
 *    supposed to be sold and for how much. Paystack's answer has to match it.
 *
 * Only if all four agree does anything get written.
 *
 *
 * WHY THE BOOKS STAY IN DOLLARS
 *
 * The catalogue is priced in dollars, and purchases.amount is summed across
 * every sale the platform has ever taken. Writing R31 into the same column as
 * $1.85 would overstate that total by about sixteen times, quietly, and no
 * report would complain. So amount, net_amount, platform_fee and artist_price
 * stay in USD on every row, and what the buyer actually paid goes in
 * charged_amount and charged_currency, with the rate that was used.
 *
 *
 * WHAT A NON-200 COSTS
 *
 * Paystack retries anything that is not a 200: every three minutes for four
 * tries, then hourly for 72 hours. That is the right behaviour for a database
 * that is briefly down, and the wrong behaviour for an event this endpoint
 * will never be able to process, which would then be redelivered for three
 * days. So the two are told apart on purpose: a transient failure returns 500
 * and asks to be retried; anything unprocessable is logged loudly and
 * returns 200.
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
// Merch finishes here rather than in the browser, so the confirm-and-print
// step is shared with netlify/functions/merch-order.js.
const merchFulfil = require('../lib/merch-fulfil');
// Retail venue subscriptions in rand. Kept in a library because the daily job
// in retail-artist-payouts.js re-reads the same subscriptions from Paystack,
// and two places deciding separately what a Paystack status means is how a
// venue's player ends up disagreeing with its billing.
const retailSub = require('../lib/retailPaystackSub');

const PAYSTACK_BASE = 'https://api.paystack.co';
const SECRET = process.env.PAYSTACK_SECRET_KEY;

// Lifts the domain check, for working on the flow against a test account on
// purpose. The same variable that lifts it in paystack-checkout.js, so the two
// ends cannot end up disagreeing about which mode they are in.
const ALLOW_TEST = process.env.PAYSTACK_ALLOW_TEST === 'true';

// The platform's cut of a Paystack sale. Zero by default, the same default
// netlify/functions/paystack-subaccount.js uses when it sets up the split, so
// the two cannot disagree about what the artist is owed.
const PLATFORM_PCT = Number(process.env.PAYSTACK_PLATFORM_PCT || 0);

const ok = (note) => ({ statusCode: 200, body: JSON.stringify({ received: true, note: note || null }) });
const retry = (why) => ({ statusCode: 500, body: JSON.stringify({ error: why }) });

/**
 * The raw bytes, exactly as they arrived.
 *
 * Netlify hands the body back base64 encoded when it decides the content is
 * binary. Hashing the base64 string instead of the bytes it stands for
 * produces a signature that never matches, which looks exactly like an
 * attacker and would reject every real payment.
 */
function rawBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');
}

function signatureMatches(raw, header) {
  if (!header) return false;
  const expected = crypto.createHmac('sha512', SECRET).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(header), 'utf8');
  // Lengths differ means it cannot match, and timingSafeEqual throws on
  // mismatched lengths rather than returning false.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function verifyTransaction(reference) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.status !== true || !body.data) {
    const err = new Error((body && body.message) || `verify returned ${res.status}`);
    err.httpStatus = res.status;
    throw err;
  }
  return body.data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  if (!SECRET) {
    // Nothing can be verified without the key, so nothing is trusted. Loud,
    // because a live Paystack account sending to a deploy with no key means
    // real payments are landing and not being recorded.
    console.error('[paystack-webhook] PAYSTACK_SECRET_KEY is not set, refusing every event');
    return retry('not_configured');
  }

  const raw = rawBody(event);
  const header = event.headers['x-paystack-signature'] || event.headers['X-Paystack-Signature'];

  if (!signatureMatches(raw, header)) {
    console.error('[paystack-webhook] signature did not verify, ignoring. bytes=', raw.length);
    // 401 and not 200: an unsigned caller is not an event Paystack sent, so
    // there is nothing to acknowledge.
    return { statusCode: 401, body: 'Invalid signature' };
  }

  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    console.error('[paystack-webhook] signed body was not JSON, ignoring');
    return ok('unparseable');
  }

  const eventType = evt.event || 'unknown';

  // ── Retail venue subscriptions ────────────────────────────────────────────
  //
  // Everything below this block is about a one-off sale: a track, an album, a
  // beat licence, merch. A venue's monthly subscription in rand is a different
  // animal and arrives as a different set of events, so it is split off here
  // before any of the purchase machinery runs.
  //
  // Nothing in these handlers trusts the event body for anything but a
  // subscription code, because Paystack documents these events by name and
  // publishes no payload schema for any of them. See
  // netlify/lib/retailPaystackSub.js.
  if (retailSub.SUBSCRIPTION_EVENTS.has(eventType)) {
    const subAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const out = await retailSub.handleSubscriptionEvent({ admin: subAdmin, evt, eventType });
    // retry only when it is worth retrying. A refusal on the merits, such as a
    // subscription no venue claims, would otherwise be redelivered hourly for
    // three days and never get further.
    return out.retry ? retry(out.note || 'retail_sub_failed') : ok('retail:' + (out.note || eventType));
  }

  // charge.success is the only event that moves money into a sale. The rest
  // are acknowledged so Paystack stops sending them, and logged so a new
  // event type showing up is visible rather than silent.
  if (eventType !== 'charge.success') {
    console.log('[paystack-webhook] ignoring event type', eventType);
    return ok('ignored:' + eventType);
  }

  const reference = evt.data && evt.data.reference;
  if (!reference) {
    console.error('[paystack-webhook] charge.success with no reference, cannot act');
    return ok('no_reference');
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // A venue's first subscription payment is a charge.success like any other,
  // on a reference this site issued with the rtl_ prefix. It has no
  // paystack_intents row and never will, so it is routed before the intent
  // lookup below, which would otherwise log it as a forged event.
  //
  // The prefix only chooses the route. What decides whether anything is
  // recorded is the retail_subscriptions row carrying that exact reference, so
  // a made-up rtl_ reference buys nothing.
  if (String(reference).startsWith(retailSub.RETAIL_REF_PREFIX)) {
    let subTx;
    try {
      subTx = await verifyTransaction(reference);
    } catch (err) {
      console.error('[paystack-webhook] verify failed for retail reference', reference, ':', err.message);
      return retry('verify_failed');
    }
    // The same domain check the sale path makes, and for the same reason:
    // Paystack's test card is public, so a test charge costs an attacker
    // nothing and would switch a venue's player on for free.
    if (!ALLOW_TEST && subTx.domain !== 'live') {
      console.error('[paystack-webhook] REFUSED retail charge on domain', subTx.domain, reference);
      return ok('retail_not_live');
    }
    const out = await retailSub.handleRetailCharge({ admin, reference, tx: subTx });
    return out.retry ? retry(out.note || 'retail_charge_failed') : ok('retail:' + (out.note || 'charge'));
  }

  // ── Already done? ─────────────────────────────────────────────────────────
  //
  // Checked first, before the verify call, because Paystack redelivers and a
  // redelivery of something already recorded should cost nothing.
  {
    const { data: already, error } = await admin
      .from('purchases').select('id').eq('paystack_reference', reference).maybeSingle();
    if (error) {
      console.error('[paystack-webhook] could not check for an existing purchase:', error.code, error.message);
      return retry('lookup_failed');
    }
    if (already) {
      console.log('[paystack-webhook] already recorded, nothing to do:', reference);
      return ok('duplicate');
    }
  }

  // ── What this reference was supposed to be ─────────────────────────────────
  const { data: intent, error: intentErr } = await admin
    .from('paystack_intents').select('*').eq('reference', reference).maybeSingle();

  if (intentErr) {
    console.error('[paystack-webhook] intent lookup failed:', intentErr.code, intentErr.message);
    return retry('intent_lookup_failed');
  }
  if (!intent) {
    // A reference this site never issued. Retrying for three days will not
    // make one appear, so it is acknowledged, but it is also exactly what a
    // forged event would look like, so it is logged as one.
    console.error('[paystack-webhook] NO INTENT for reference', reference,
      '- this site did not start this payment. Nothing recorded.');
    return ok('unknown_reference');
  }

  // ── What Paystack says actually happened ──────────────────────────────────
  let tx;
  try {
    tx = await verifyTransaction(reference);
  } catch (err) {
    console.error('[paystack-webhook] verify failed for', reference, ':', err.message);
    // Worth retrying: a verify that fails now may succeed in three minutes,
    // and the alternative is a buyer who paid and owns nothing.
    return retry('verify_failed');
  }

  // ── Was this real money ───────────────────────────────────────────────────
  //
  // Before status, before amount, before anything that could become a row.
  // Paystack's test card is public, so a test transaction costs an attacker
  // nothing and looks identical in every other field. Only "live" counts, and
  // an absent or unexpected value counts as not live.
  const domain = String(tx.domain || '').toLowerCase();
  if (domain !== 'live' && !ALLOW_TEST) {
    console.error('[paystack-webhook] REFUSED: transaction domain is', tx.domain || '(absent)',
      'not live, for', reference, '- no sale recorded, no download granted.');
    const { error } = await admin.from('paystack_intents')
      .update({ status: 'failed', settled_at: new Date().toISOString() })
      .eq('reference', reference);
    if (error) console.error('[paystack-webhook] intent not closed out:', error.code, error.message);
    // 200 rather than 500: retrying for three days will not turn a test
    // transaction into a live one.
    return ok('not_live_domain');
  }

  if (tx.status !== 'success') {
    console.warn('[paystack-webhook] verify says status is', tx.status, 'for', reference,
      '- not recording a sale.');
    await admin.from('paystack_intents')
      .update({ status: 'failed', settled_at: new Date().toISOString() })
      .eq('reference', reference);
    return ok('not_successful');
  }

  // ── Does it match what was asked for ──────────────────────────────────────
  //
  // Both checks refuse rather than adjust. An amount that does not match the
  // intent means something is wrong upstream, and the wrong response to that
  // is to hand over the file and work it out later.
  const paidMinor = Number(tx.amount);
  const expectedMinor = Number(intent.zar_minor);

  if (String(tx.currency).toUpperCase() !== 'ZAR') {
    console.error('[paystack-webhook] currency is', tx.currency, 'not ZAR, for', reference,
      '- refusing to record a sale priced in another currency.');
    return ok('wrong_currency');
  }

  if (!Number.isFinite(paidMinor) || paidMinor < expectedMinor) {
    console.error('[paystack-webhook] UNDERPAID or unreadable amount for', reference,
      'paid=', paidMinor, 'expected=', expectedMinor, '- nothing recorded.');
    return ok('amount_mismatch');
  }

  // ── Who bought it ─────────────────────────────────────────────────────────
  //
  // The intent usually knows, because the buyer was signed in at the till.
  // When they were not, the email is matched against user_profiles, which is
  // the same fallback netlify/functions/paypal-order.js uses on the PayPal
  // payer address.
  let userId = intent.user_id || null;
  const buyerEmail = (tx.customer && tx.customer.email) || intent.buyer_email || null;

  if (!userId && buyerEmail) {
    const { data: byEmail, error: emailErr } = await admin
      .from('user_profiles').select('user_id').ilike('email', buyerEmail).maybeSingle();
    if (emailErr) console.error('[paystack-webhook] email lookup failed:', emailErr.code, emailErr.message);
    else if (byEmail && byEmail.user_id) {
      userId = byEmail.user_id;
      console.log('[paystack-webhook] buyer resolved from the payment email.');
    }
  }

  // ── The money, in both currencies ─────────────────────────────────────────
  const zarCharged = paidMinor / 100;
  const feesMinor = Number.isFinite(Number(tx.fees)) ? Number(tx.fees) : 0;
  const rate = Number(intent.fx_rate);
  const usdPrice = Number(intent.usd_price);

  // What landed in the artist's bank, converted back at the rate this sale
  // was struck at. Paystack's fee is borne by the subaccount, which is set at
  // checkout, so it comes out of the artist's side exactly as PayPal's does
  // on the direct route.
  const netUsd = rate > 0
    ? Number((((paidMinor - feesMinor) / 100) / rate).toFixed(2))
    : usdPrice;

  const platformFee = Number(((Math.min(100, Math.max(0, PLATFORM_PCT)) / 100) * netUsd).toFixed(2));

  // ── Merch, which finishes somewhere else entirely ─────────────────────────
  //
  // A merch order has no purchase row, no download and no collaborator split.
  // What it has is a Printful draft created before anyone paid and waiting to
  // be confirmed, and this is the only place that knows the money moved: the
  // buyer paid on a card at Paystack, so nothing in the browser can be
  // trusted to say so.
  //
  // The branch sits here rather than earlier on purpose. Everything above has
  // already run: the live domain check, the success check, the currency check
  // and the amount check all apply to merch exactly as they apply to a track.
  if (intent.merch_order_id) {
    const result = await merchFulfil.fulfilPaidMerchOrder({
      merchOrderId: intent.merch_order_id,
      paidLabel: `R${zarCharged.toFixed(2)}`,
      patch: { paystack_reference: reference },
    });

    if (!result.ok) {
      // The order row has gone missing. Retrying will not bring it back, but
      // it must not be silent, because somebody has paid.
      console.error('[paystack-webhook] merch order', intent.merch_order_id,
        'could not be fulfilled:', result.reason, 'reference=', reference);
    }

    const { error: closeErr } = await admin.from('paystack_intents')
      .update({ status: 'paid', settled_at: new Date().toISOString() })
      .eq('reference', reference);
    if (closeErr) console.error('[paystack-webhook] merch intent not closed out:', closeErr.code, closeErr.message);

    console.log('[paystack-webhook] merch order', intent.merch_order_id,
      result.already ? 'was already handled'
        : (result.printed ? 'paid and sent to production' : 'paid, not printed'));
    return ok('merch_handled');
  }

  const isTrack = Boolean(intent.track_id);
  const purchasedAt = tx.paid_at || tx.paidAt || new Date().toISOString();

  // ── The sale ──────────────────────────────────────────────────────────────
  let purchaseId = null;
  let recordError = null;
  {
    const { data: inserted, error } = await admin.from('purchases').insert({
      user_id:            userId,
      track_id:           intent.track_id || null,
      album_id:           intent.album_id || null,
      // USD, so this column stays comparable across processors.
      amount:             usdPrice,
      artist_price:       usdPrice,
      net_amount:         netUsd,
      platform_fee:       platformFee,
      currency:           'USD',
      // What the buyer actually paid, and the rate that produced it.
      charged_amount:     zarCharged,
      charged_currency:   'ZAR',
      fx_rate:            rate,
      processor:          'paystack',
      paystack_reference: reference,
      status:             'completed',
      purchased_at:       purchasedAt,
      // The money went straight to the artist's bank through the subaccount.
      // The platform never held it, which is the same thing 'direct' means on
      // the PayPal route.
      payout_route:       'direct',
      payee_account:      intent.subaccount_code || null,
      buyer_service_fee:  0,
    }).select('id').maybeSingle();

    if (error) {
      if (error.code === '23505') {
        // Two deliveries landed at once and the other one won. That is the
        // unique index doing its job, not a problem.
        console.log('[paystack-webhook] a concurrent delivery recorded this first:', reference);
        return ok('duplicate');
      }
      recordError = error.message;
      console.error('[paystack-webhook] PURCHASE ROW REFUSED, money taken, sale not recorded.',
        'code=', error.code, 'msg=', error.message, 'reference=', reference);
      // Worth a retry: the buyer has paid and this is the row that says so.
      return retry('purchase_insert_failed');
    }
    purchaseId = inserted && inserted.id;
  }

  // ── The download grant ────────────────────────────────────────────────────
  //
  // Albums are not granted here, the same as the PayPal route: ownership of an
  // album is read from the purchases row by album_id, and
  // netlify/functions/get-download-url.js already does that.
  if (isTrack && userId) {
    const { error } = await admin.from('downloads').insert({
      track_id:      intent.track_id,
      user_id:       userId,
      download_type: 'paid',
      // USD, so this sits alongside PayPal grants and the comparisons in
      // netlify/functions/get-offline-url.js keep meaning the same thing.
      amount_paid:   usdPrice,
      created_at:    new Date().toISOString(),
    });
    if (error) {
      recordError = recordError || error.message;
      console.error('[paystack-webhook] DOWNLOAD GRANT REFUSED, buyer paid and cannot download.',
        'code=', error.code, 'msg=', error.message, 'user=', userId, 'track=', intent.track_id);
    }
  } else if (isTrack && !userId) {
    recordError = 'no_buyer_identified';
    console.error('[paystack-webhook] NO BUYER IDENTIFIED, payment recorded but no download granted.',
      'reference=', reference, 'email=', buyerEmail);
  }

  // The intent is closed out before the receipts, because everything below is
  // a courtesy and nothing below should be able to leave a paid sale looking
  // pending.
  {
    const { error } = await admin.from('paystack_intents').update({
      status: 'paid',
      settled_at: new Date().toISOString(),
      purchase_id: purchaseId,
    }).eq('reference', reference);
    if (error) console.error('[paystack-webhook] intent not closed out:', error.code, error.message);
  }

  // ── The receipts ──────────────────────────────────────────────────────────
  //
  // Written here rather than in the browser, for the same reason the PayPal
  // route does it server side: a receipt that needs the buyer's tab to still
  // be open is the receipt that goes missing. A failure to write one is
  // logged and otherwise ignored, because a missing notification must never
  // turn a completed sale into an error.
  try {
    let what = 'Your purchase';
    let sellerArtistId = intent.artist_id || null;
    let sellerLabel = null;
    let trackSlug = null;
    let albumSlug = null;

    if (intent.album_id) {
      const { data: al } = await admin.from('albums')
        .select('title, slug, artist_id, artists ( artist_name )')
        .eq('id', intent.album_id).maybeSingle();
      if (al) {
        what = al.title || 'Album';
        albumSlug = al.slug || null;
        sellerArtistId = al.artist_id || sellerArtistId;
        sellerLabel = (al.artists && al.artists.artist_name) || null;
      }
    } else if (intent.track_id) {
      const { data: tr } = await admin.from('tracks')
        .select('title, slug, artist_id, artists ( artist_name )')
        .eq('id', intent.track_id).maybeSingle();
      if (tr) {
        what = tr.title || 'Track';
        trackSlug = tr.slug || null;
        sellerArtistId = tr.artist_id || sellerArtistId;
        sellerLabel = (tr.artists && tr.artists.artist_name) || null;
      }
    }

    const receipts = [];

    if (userId) {
      receipts.push({
        user_id:  userId,
        type:     'purchase',
        // Rand, because rand is what left their account. A receipt that says
        // $1.85 next to a bank statement that says R31 is a receipt somebody
        // has to query.
        title:    `You bought "${what}"`,
        message:  `R${zarCharged.toFixed(2)} paid${sellerLabel ? ` to ${sellerLabel}` : ''}`
                  + '. Your download is in your library whenever you need it again.',
        track_id: intent.track_id || null,
        metadata: {
          album_id:   intent.album_id || null,
          album_slug: albumSlug,
          track_slug: trackSlug,
          amount:     zarCharged,
          currency:   'ZAR',
          processor:  'paystack',
          reference,
        },
      });
    }

    if (sellerArtistId) {
      const yoursUsd = Math.max(0, netUsd - platformFee);
      const yoursZar = rate > 0 ? yoursUsd * rate : 0;
      receipts.push({
        artist_id: sellerArtistId,
        type:      'sale',
        title:     `"${what}" sold`,
        message:   `R${zarCharged.toFixed(2)} paid · R${yoursZar.toFixed(2)} is yours after fees, `
                   + 'settled to your bank account.',
        track_id:  intent.track_id || null,
        metadata: {
          album_id:   intent.album_id || null,
          amount:     zarCharged,
          currency:   'ZAR',
          net_usd:    netUsd,
          your_share: Number(yoursUsd.toFixed(2)),
          processor:  'paystack',
          reference,
        },
      });
    }

    if (receipts.length) {
      const { error } = await admin.from('notifications').insert(receipts);
      if (error) {
        console.error('[paystack-webhook] receipt notification refused (sale is fine, receipt is not):',
          error.code, error.message);
      }
    }
  } catch (err) {
    console.error('[paystack-webhook] receipt write threw (sale is fine):', err.message);
  }

  // ── Collaborator splits ───────────────────────────────────────────────────
  //
  // Every Paystack sale is a direct sale: the subaccount settles into the
  // artist's own bank, so the platform never holds the money and cannot pay
  // collaborators out of it. What it can do is record what the agreed split
  // means for this sale, which is exactly what the PayPal direct route does.
  //
  // Only collaborations the owner created count, and the share is of what the
  // owner actually received after fees.
  try {
    const ownerId = intent.artist_id || null;
    if (ownerId) {
      const q = admin.from('collaborations')
        .select('artist_id, split_percent, invited_by')
        .eq('status', 'accepted');
      const { data: collabs, error } = intent.album_id
        ? await q.eq('album_id', intent.album_id)
        : await q.eq('track_id', intent.track_id);
      if (error) throw error;

      const owed = (collabs || []).filter(c =>
        c.invited_by === ownerId && c.artist_id !== ownerId && Number(c.split_percent) > 0);

      if (owed.length) {
        // USD, matching sale_splits rows from the PayPal route so the two can
        // be added together.
        const rows = owed.map(c => ({
          capture_id:             reference,
          track_id:               intent.track_id || null,
          album_id:               intent.album_id || null,
          owner_artist_id:        ownerId,
          collaborator_artist_id: c.artist_id,
          split_percent:          Number(c.split_percent),
          sale_net:               Number(netUsd.toFixed(2)),
          amount_owed:            Number(((Number(c.split_percent) / 100) * netUsd).toFixed(2)),
          currency:               'USD',
        }));

        const { error: sErr } = await admin.from('sale_splits')
          .upsert(rows, { onConflict: 'capture_id,collaborator_artist_id', ignoreDuplicates: true });
        if (sErr) console.error('[paystack-webhook] sale_splits not written (sale is fine):', sErr.code, sErr.message);

        const ids = [ownerId, ...owed.map(c => c.artist_id)];
        const { data: people } = await admin.from('artists')
          .select('id, user_id, artist_name').in('id', ids);
        const byId = Object.fromEntries((people || []).map(a => [a.id, a]));
        const ownerName = (byId[ownerId] && byId[ownerId].artist_name) || 'the owner';

        const notes = rows.map(r => ({
          artist_id: r.collaborator_artist_id,
          user_id:   (byId[r.collaborator_artist_id] && byId[r.collaborator_artist_id].user_id) || null,
          type:      'sale',
          title:     'A sale with your split',
          message:   `Your ${r.split_percent}% share is $${r.amount_owed.toFixed(2)}. `
                     + `This sale settled into ${ownerName}'s bank account, and ${ownerName} pays your share to you.`,
          track_id:  r.track_id,
          metadata:  { kind: 'split_owed_to_you', reference, amount: r.amount_owed, processor: 'paystack' },
        }));
        notes.push({
          artist_id: ownerId,
          user_id:   (byId[ownerId] && byId[ownerId].user_id) || null,
          type:      'sale',
          title:     'Collaborator shares on this sale',
          message:   'This sale settled straight into your bank account. Under your splits you owe: '
                     + rows.map(r => `${(byId[r.collaborator_artist_id] && byId[r.collaborator_artist_id].artist_name) || 'a collaborator'} $${r.amount_owed.toFixed(2)}`).join(', ')
                     + '.',
          track_id:  intent.track_id || null,
          metadata:  { kind: 'split_you_owe', reference, processor: 'paystack' },
        });

        const { error: nErr } = await admin.from('notifications').insert(notes);
        if (nErr) console.error('[paystack-webhook] split notifications refused:', nErr.code, nErr.message);
      }
    }
  } catch (err) {
    console.error('[paystack-webhook] split record threw (sale is fine):', err.message);
  }

  console.log('[paystack-webhook] RECORDED', JSON.stringify({
    reference, purchaseId, kind: isTrack ? 'track' : 'album',
    zar: zarCharged, usd: usdPrice, netUsd, rate, userId: userId || null, recordError,
  }));

  return ok(recordError ? 'recorded_with_problems' : 'recorded');
};