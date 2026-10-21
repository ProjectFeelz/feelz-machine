/**
 * netlify/functions/paystack-checkout.js
 *
 * Start a Paystack payment for a track, a beat or an album.
 *
 * The buyer pays once, in rand, and Paystack settles the artist's share
 * straight into the artist's own bank account. The platform never holds it,
 * which is the same principle netlify/lib/payee.js keeps for PayPal.
 *
 *
 * THE LIVE CHECK, AND WHY IT IS THE FIRST THING HERE
 *
 * A Paystack account that is still in test mode will happily open a checkout.
 * It will decline every real card and accept Paystack's published test card,
 * which is the worst pairing available: a buyer who tried to pay and could
 * not, and anyone who knows that test card walking off with a paid download
 * and a sale in the ledger that never happened.
 *
 * So this refuses outright unless PAYSTACK_SECRET_KEY is a live key. It
 * refuses before the database is touched, so no intent row is written for a
 * payment that was never going to happen, and the refusal is a plain message
 * rather than a broken checkout.
 *
 * PAYSTACK_ALLOW_TEST=true lifts it, for working on the flow on purpose.
 * src/components/PayInRandButton.js keeps its own copy of the same rule so the
 * button is an announcement rather than a dead end, but this is the check that
 * counts, because a browser can send anything.
 *
 *
 * WHAT THIS FUNCTION REFUSES TO TRUST
 *
 * The price. It is read from the database by id, never taken from the request
 * body, because a body is whatever the buyer's browser decided to send and a
 * checkout that accepts a price is a checkout that sells albums for one rand.
 *
 * The artist. Resolved from the item, so a buyer cannot name a payee.
 *
 * The exchange rate. Fetched and sanity checked by netlify/lib/fxRate.js,
 * which refuses rather than guessing when nothing is available.
 *
 *
 * WHY IT DOES NOT MARK ANYTHING AS PAID
 *
 * Nothing here records a sale. This function only starts the payment and
 * hands back a URL. The money is confirmed by paystack-webhook.js, from
 * Paystack's signed callback, because a browser that returns to a success page
 * is not evidence that anybody paid: the buyer can close the tab, lose signal,
 * or simply visit the success URL directly.
 *
 *
 * WHAT IT DOES RECORD, AND WHY IT HAS TO
 *
 * A paystack_intents row, written before the buyer leaves the site: the
 * reference, the item, the artist, the dollar price, the rand figure and the
 * rate. That row is what the webhook reads to learn what was sold.
 *
 * The obvious alternative is to put all of that in Paystack's metadata and
 * read it back. It does not hold: Paystack's own verify endpoint documents
 * metadata as a string, and returns an empty one in its sample, with the list
 * endpoint returning null for the same transaction. Building the sale record
 * on a field that may come back empty means a buyer who paid and a webhook
 * that cannot say what for.
 *
 * It is also the safer shape. The intent is written by this server, so the
 * webhook compares what Paystack says was paid against what this end expected,
 * instead of taking an amount on trust.
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const payeeLib = require('../lib/payee');
const pricing = require('../lib/pricing');
const fx = require('../lib/fxRate');
const { resolveTrackPrice: pricing_resolveTrackPrice } = require('../lib/trackPrice');

const PAYSTACK_BASE = 'https://api.paystack.co';
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const SITE = process.env.URL || 'https://www.feelzmachine.com';

// Live only when the key says live. A missing key, a test key or anything
// unrecognised all count as not live, so the failure direction is the safe one.
const ALLOW_TEST = process.env.PAYSTACK_ALLOW_TEST === 'true';
const PAYSTACK_IS_LIVE = String(SECRET || '').startsWith('sk_live_') || ALLOW_TEST;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  if (!SECRET) {
    return json(503, { error: 'paystack_not_configured', message: 'Card payments in rand are not switched on yet.' });
  }

  // Nothing below this line runs until the account is live. No lookup, no
  // exchange rate, no intent row, and above all no checkout that a buyer
  // could mistake for a working one.
  if (!PAYSTACK_IS_LIVE) {
    console.warn('[paystack-checkout] refused: the Paystack key is not a live key.');
    return json(503, {
      error: 'paystack_not_live',
      fallback: 'paypal',
      message: 'Paying in rand is coming soon. Use the PayPal button for now.',
    });
  }

  // ── Has it been paid? ─────────────────────────────────────────────────────
  //
  // Answered before anything else because it starts nothing: no price lookup,
  // no exchange rate, no intent row, no call to Paystack.
  //
  // It exists for the inline checkout. When the buyer pays in an overlay
  // rather than by leaving for Paystack, there is no redirect to tell this end
  // that it worked, and Paystack's own inline callbacks are not documented for
  // resumeTransaction, so nothing in the browser can be trusted to say a
  // payment happened. The webhook is still the only thing that decides that.
  // This lets the page ASK, and the answer is the row the webhook wrote.
  //
  // The reference is the key, and it is eighteen random hex characters that
  // only the buyer who started this payment has. The answer is one word about
  // one payment and names nobody, so a guessed reference wins nothing.
  if (event.body && event.body.includes('"action"')) {
    let action, reference;
    try {
      const b = JSON.parse(event.body || '{}');
      action = String(b.action || '');
      reference = String(b.reference || '');
    } catch {
      return json(400, { error: 'invalid_body' });
    }

    if (action === 'status') {
      if (!/^fm_[a-z]+_[0-9a-f]{6,64}$/.test(reference)) {
        return json(400, { error: 'bad_reference' });
      }
      const lookup = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data: row, error } = await lookup
        .from('paystack_intents')
        .select('status')
        .eq('reference', reference)
        .maybeSingle();

      if (error) {
        console.error('[paystack-checkout] status lookup failed:', error.code, error.message);
        return json(500, { error: 'lookup_failed' });
      }
      // An unknown reference answers the same shape as a known one that has
      // not been paid. Nothing here tells a stranger whether a reference is
      // real.
      return json(200, { status: (row && row.status) || 'unknown' });
    }
  }

  let trackId, albumId, email, licenceId, offeredAmount;
  try {
    const b = JSON.parse(event.body || '{}');
    trackId = b.trackId || null;
    albumId = b.albumId || null;
    email   = (b.email || '').trim().toLowerCase();
    // Two values the body IS allowed to influence, neither of which it gets
    // to decide. licenceId names which licence, and the server reads that
    // licence's price off the beat. amount is a pay-what-you-want offer, and
    // the server floors it at what the artist set. Both go through
    // netlify/lib/trackPrice.js, which is where the actual number comes from.
    licenceId     = b.licenceId || null;
    offeredAmount = b.amount != null ? b.amount : null;
  } catch {
    return json(400, { error: 'invalid_body' });
  }

  if (!trackId && !albumId) return json(400, { error: 'trackId or albumId is required' });
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json(400, { error: 'email_required', message: 'An email address is needed to send the download.' });
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // ── Who is buying, if they are signed in ──────────────────────────────────
  //
  // Optional on purpose: a signed out buyer can still pay, and the webhook
  // falls back to matching the email against user_profiles, which is what
  // netlify/functions/paypal-order.js already does with the PayPal payer
  // address.
  //
  // But getting it here is better than getting it there. The download grant in
  // `purchases` is keyed on user_id, and an email that matches no account
  // leaves a buyer who paid and cannot download. Resolved at the till, while
  // the person is still on the site, that case can at least be seen in the
  // intent row rather than discovered later.
  let buyerUserId = null;
  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  if (token) {
    try {
      const { data: { user } = {} } = await admin.auth.getUser(token);
      if (user) buyerUserId = user.id;
    } catch (err) {
      // A bad or expired token is a signed out buyer, not a failure. Logged
      // because a token that is always rejected is worth knowing about.
      console.warn('[paystack-checkout] token did not resolve to a user:', err.message);
    }
  }

  // ── What is being bought, and what it costs ───────────────────────────────
  //
  // Read from the database by id. The body said which item; it does not get to
  // say what the item costs or who it belongs to.
  let label, usdPrice, artistId, itemKind, priceSource = null;
  if (trackId) {
    const { data: track, error } = await admin
      .from('tracks')
      .select('id, title, download_price, minimum_price, pay_what_you_want, artist_id, is_published, is_preorder, release_date, album_id, is_beat, beat_licence')
      .eq('id', trackId)
      .maybeSingle();

    if (error) {
      console.error('[paystack-checkout] track lookup failed:', error.code, error.message);
      return json(500, { error: 'lookup_failed' });
    }
    if (!track) return json(404, { error: 'not_found' });
    if (track.is_published === false) return json(403, { error: 'not_for_sale' });

    // A pre-order that has not landed is not on sale, the same rule the
    // signing function applies to streaming.
    if (track.is_preorder && track.release_date && new Date(track.release_date) > new Date()) {
      return json(403, { error: 'not_released_yet', release_date: track.release_date });
    }

    // Beat licences, pay-what-you-want offers, album shares and plain prices
    // all resolve in one place, by the same rules PayPal uses. The body named
    // the licence or made an offer; it does not get to set the number.
    const priced = await pricing_resolveTrackPrice({
      supabase: admin,
      track,
      licenceId,
      offeredAmount,
    });

    if (priced.error) return json(priced.status || 400, { error: priced.error, message: priced.message });

    usdPrice = priced.price;
    label = priced.label;
    artistId = track.artist_id;
    itemKind = 'track';
    priceSource = priced.source;
  } else {
    const { data: album, error } = await admin
      .from('albums')
      .select('id, title, price, artist_id')
      .eq('id', albumId)
      .maybeSingle();

    if (error) {
      console.error('[paystack-checkout] album lookup failed:', error.code, error.message);
      return json(500, { error: 'lookup_failed' });
    }
    if (!album) return json(404, { error: 'not_found' });

    usdPrice = Number(album.price);
    label = album.title;
    artistId = album.artist_id;
    itemKind = 'album';
  }

  if (!Number.isFinite(usdPrice) || usdPrice <= 0) {
    return json(400, { error: 'not_for_sale', message: 'This is a free download, there is nothing to pay.' });
  }

  // The price is now whatever the server decided, never what arrived. Logged
  // with its source so a surprising charge can be traced to the rule that
  // produced it rather than guessed at.
  console.log('[paystack-checkout] PRICED', JSON.stringify({
    itemKind, usdPrice, source: priceSource || 'album.price', licenceId: licenceId || null,
    offered: offeredAmount != null ? Number(offeredAmount) : null,
  }));

  // ── Who gets the money ────────────────────────────────────────────────────
  //
  // processors names Paystack explicitly. payee.js defaults to PayPal only,
  // which is what keeps every existing caller behaving as it did; this is the
  // one caller that opts in.
  const routing = await payeeLib.resolvePayee({
    supabase: admin,
    artistId,
    trackId: itemKind === 'track' ? trackId : null,
    processors: ['paystack'],
  });

  if (routing.processor !== 'paystack' || !routing.subaccountCode) {
    // Not an error worth a 500. This artist simply has no bank account on
    // file, so the buyer should be sent down the PayPal route instead. The
    // caller decides what to show; it is told plainly which way to go.
    return json(409, {
      error: 'no_paystack_account',
      fallback: 'paypal',
      message: 'This artist is paid through PayPal. Use the PayPal button instead.',
    });
  }

  // ── The amount, in rand ───────────────────────────────────────────────────
  let rate;
  try {
    rate = await fx.getUsdZarRate(admin);
  } catch (err) {
    console.error('[paystack-checkout] no usable exchange rate:', err.message);
    return json(503, {
      error: 'no_exchange_rate',
      message: 'Rand payments are briefly unavailable. Try the PayPal button, or try again shortly.',
    });
  }

  const charge = pricing.usdToPaystackCharge(usdPrice, rate.rate);
  if (!charge.minor || charge.minor < 100) {
    // Paystack rejects trivially small amounts, and a sub-rand charge almost
    // always means a price or a rate is wrong rather than a genuinely cheap
    // track. Refusing is cheaper than taking R0.30 and working out why later.
    console.error('[paystack-checkout] implausible charge', charge, 'from usd', usdPrice, 'rate', rate.rate);
    return json(500, { error: 'bad_amount' });
  }

  // The reference ties this attempt to the webhook that confirms it. Random
  // rather than derived from the ids: a predictable reference lets somebody
  // guess another buyer's and ask Paystack about it.
  const reference = `fm_${itemKind}_${crypto.randomBytes(9).toString('hex')}`;

  // ── The intent, written before the buyer leaves ───────────────────────────
  //
  // This is the record the webhook reads. It goes in BEFORE the Paystack call,
  // because the other order has a hole in it: initialize succeeds, this insert
  // fails, the buyer pays, and the webhook has a reference it has never heard
  // of. Written first, the worst case is a row for a payment that never
  // happened, which is a pending row somebody can look at, not money with
  // nowhere to go.
  //
  // So a failure here refuses the checkout outright. A sale that cannot be
  // recorded is not a sale worth taking.
  const { error: intentErr } = await admin.from('paystack_intents').insert({
    reference,
    track_id: itemKind === 'track' ? trackId : null,
    album_id: itemKind === 'album' ? albumId : null,
    artist_id: artistId,
    user_id: buyerUserId,
    buyer_email: email,
    usd_price: usdPrice,
    licence_id: licenceId,
    zar_amount: charge.zar,
    zar_minor: charge.minor,
    fx_rate: rate.rate,
    fx_source: rate.source,
    fx_stale: rate.stale === true,
    subaccount_code: routing.subaccountCode,
    status: 'pending',
  });

  if (intentErr) {
    console.error('[paystack-checkout] intent row refused, refusing the checkout:',
      intentErr.code, intentErr.message, 'reference=', reference);
    return json(500, {
      error: 'could_not_start',
      message: 'This payment could not be started. Nothing has been charged. Try again in a moment.',
    });
  }

  const payload = {
    email,
    amount: charge.minor,
    currency: 'ZAR',
    reference,
    subaccount: routing.subaccountCode,
    // The artist's share bears Paystack's fee. With the platform taking 0%,
    // the alternative is Feelz Machine paying roughly 2.9% plus R1 out of a
    // sale it earns nothing from. This is also how the PayPal direct route
    // already works: the processor's cut comes out of the seller's money.
    bearer: 'subaccount',
    // The route that already exists and already does the right thing: it
    // bounces the buyer back where they came from, and the page they land on
    // picks up the completed purchase on mount. Inventing a Paystack specific
    // return page would mean a second screen doing the same job, and the one
    // the buyer sees would depend on which button they pressed.
    //
    // The reference rides along so the page can be told which payment it is
    // looking at, which matters if it ever needs to wait for the webhook.
    callback_url: `${SITE}/payment/success?ref=${encodeURIComponent(reference)}`,
    // For the Paystack dashboard, so a transaction there can be read without
    // this database open. Nothing depends on it coming back: see the note at
    // the top about metadata arriving as an empty string.
    metadata: {
      item_kind: itemKind,
      track_id: itemKind === 'track' ? trackId : null,
      album_id: itemKind === 'album' ? albumId : null,
      artist_id: artistId,
      usd_price: usdPrice,
      licence_id: licenceId,
      zar_charged: charge.zar,
      fx_rate: rate.rate,
      fx_source: rate.source,
      fx_stale: rate.stale,
      label,
    },
  };

  // An intent that never became a payment is closed out here, so the pending
  // rows that remain are the ones genuinely waiting on a buyer rather than a
  // pile of dead references nobody can tell apart from live ones.
  const abandonIntent = async (why) => {
    const { error } = await admin.from('paystack_intents')
      .update({ status: 'abandoned', settled_at: new Date().toISOString() })
      .eq('reference', reference);
    if (error) console.error('[paystack-checkout] could not mark intent abandoned:', error.message);
    else console.warn('[paystack-checkout] intent', reference, 'abandoned:', why);
  };

  let data;
  try {
    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.status !== true) {
      const msg = (body && body.message) || `Paystack returned ${res.status}`;
      console.error('[paystack-checkout] initialize refused:', msg, JSON.stringify(body || {}));
      await abandonIntent('initialize refused: ' + msg);
      return json(502, { error: 'paystack_rejected', message: msg });
    }
    data = body.data;
  } catch (err) {
    console.error('[paystack-checkout] initialize threw:', err.message);
    await abandonIntent('initialize threw: ' + err.message);
    return json(502, { error: 'paystack_unreachable' });
  }

  console.log('[paystack-checkout] INIT', JSON.stringify({
    reference, itemKind, artistId, usdPrice, zar: charge.zar,
    rate: rate.rate, stale: rate.stale, subaccount: routing.subaccountCode,
  }));

  return json(200, {
    authorizationUrl: data.authorization_url,
    // The same transaction, opened in an overlay instead of by leaving the
    // site. Paystack returns it on every initialize; it was simply not being
    // passed on. The authorization url stays, because the overlay is not
    // always available and the redirect is the fallback.
    accessCode: data.access_code || null,
    reference: data.reference || reference,
    // Returned so the page can show the buyer the same number they are about
    // to be charged, rather than converting again in the browser and risking
    // a different answer.
    zar: charge.zar,
    currency: 'ZAR',
  });
};