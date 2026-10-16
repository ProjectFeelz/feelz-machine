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

const PAYSTACK_BASE = 'https://api.paystack.co';
const SECRET = process.env.PAYSTACK_SECRET_KEY;
const SITE = process.env.URL || 'https://www.feelzmachine.com';

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

  let trackId, albumId, email;
  try {
    const b = JSON.parse(event.body || '{}');
    trackId = b.trackId || null;
    albumId = b.albumId || null;
    email   = (b.email || '').trim().toLowerCase();
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
  let label, usdPrice, artistId, itemKind;
  if (trackId) {
    const { data: track, error } = await admin
      .from('tracks')
      .select('id, title, download_price, minimum_price, pay_what_you_want, artist_id, is_published, is_preorder, release_date')
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

    // Pay what you want: the MINIMUM is the price here. A buyer choosing to
    // pay more is a separate flow and is not what this endpoint does.
    usdPrice = track.pay_what_you_want && Number(track.minimum_price) > 0
      ? Number(track.minimum_price)
      : Number(track.download_price);
    label = track.title;
    artistId = track.artist_id;
    itemKind = 'track';
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
    reference: data.reference || reference,
    // Returned so the page can show the buyer the same number they are about
    // to be charged, rather than converting again in the browser and risking
    // a different answer.
    zar: charge.zar,
    currency: 'ZAR',
  });
};