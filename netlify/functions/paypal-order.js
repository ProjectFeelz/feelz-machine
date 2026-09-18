// netlify/functions/paypal-order.js
// Creates and captures PayPal orders for track purchases.
// Amount is ALWAYS read from the DB — never trusted from the client.

const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');
const payeeLib  = require('../lib/payee');
const pricing   = require('../lib/pricing');

async function getPayPalAccessToken() {
  return new Promise((resolve, reject) => {
    const credentials = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');
    const payload = 'grant_type=client_credentials';
    const options = {
      hostname: paypalEnv.hostApiM,   // was hardcoded live; see netlify/lib/paypal-env.js
      path: '/v1/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.access_token) resolve(result.access_token);
          else reject(new Error('No access token: ' + data));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function paypalRequest(method, path, body, accessToken, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: paypalEnv.hostApiM,   // was hardcoded live; see netlify/lib/paypal-env.js
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        ...extraHeaders,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { action, orderId, trackId, artistName } = body;

  if (!action) {
    return { statusCode: 400, body: JSON.stringify({ error: 'action required: create or capture' }) };
  }

  try {
    const accessToken = await getPayPalAccessToken();

    // ========== CREATE ORDER ==========
    //
    // ONE PLACE DECIDES WHAT ANYTHING COSTS.
    //
    // Before this, five screens each had their own idea of a price and all
    // five sent it in the request body, and this function ignored every one
    // of them and charged tracks.download_price instead. That is three
    // separate bugs rather than one:
    //
    //   * an album page priced a track at album.price ÷ tracks and the order
    //     was refused, because the track itself had no price;
    //   * an artist page priced the same track at the WHOLE album price;
    //   * a beat page sent the licence price — $99 for an exclusive — and the
    //     buyer was charged the track's download price, while beat_purchases
    //     recorded the $99 that was never taken;
    //   * pay-what-you-want sent the amount the fan chose and it was thrown
    //     away.
    //
    // Everything below is resolved from the database. The only client amount
    // still honoured is a pay-what-you-want one, and it is floored at the
    // minimum the artist set.
    if (action === 'create') {
      const adminClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { albumId, licenceId } = body;
      let price = 0;
      let label = '';
      let customId = null;   // what the capture will read back
      let source = '';

      // ── An album ────────────────────────────────────────────────────────
      if (albumId) {
        const { data: album } = await adminClient
          .from('albums')
          .select('id, title, price, is_published, artist_id')
          .eq('id', albumId)
          .maybeSingle();

        if (!album) {
          return { statusCode: 404, body: JSON.stringify({ error: 'Album not found' }) };
        }
        price    = Number(album.price) || 0;
        label    = album.title;
        // Prefixed so the capture knows this was an album without being told
        // by the client. The old code took `albumId` from the capture request
        // body, which meant a buyer could pay for one track and claim a whole
        // album on the way back.
        customId = `album:${album.id}`;
        source   = 'album';

        if (price <= 0) {
          return { statusCode: 400, body: JSON.stringify({ error: 'This album is not for sale', reason: 'no_price' }) };
        }
      } else {
        if (!trackId) {
          return { statusCode: 400, body: JSON.stringify({ error: 'trackId or albumId required' }) };
        }

        const { data: track, error: trackErr } = await adminClient
          .from('tracks')
          // pwyw_minimum_price is gone from this select on purpose, and NOT
          // because the column is missing — it exists, defaults to 0, and is
          // NOT NULL.
          //
          // It exists and nothing writes it. TrackUploadPanel.js sets
          // minimum_price on upload and on edit, in all four places it touches
          // a track, and never touches pwyw_minimum_price. So the old
          //
          //     Math.max(pwyw_minimum_price || 0, minimum_price || 0, 0.50)
          //
          // was reading a column that is 0 on every row in the table: it could
          // only ever have been max(minimum_price, 0.50) in practice, and the
          // extra term was a decoy that made three files look like they
          // disagreed about the PWYW price when only one column was ever live.
          //
          // One column, one meaning, everywhere. Dropping the dead one changes
          // no behaviour today and removes the thing that made this confusing.
          .select('id, title, download_price, is_downloadable, album_id, is_beat, beat_licence, pay_what_you_want, minimum_price, artist_id')
          .eq('id', trackId)
          .maybeSingle();

        if (trackErr || !track) {
          return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) };
        }

        label    = track.title;
        customId = track.id;

        // ── A beat licence ────────────────────────────────────────────────
        // The licences live on the track as JSON, so the price can be read
        // here rather than taken on trust from the page that rendered it.
        if (licenceId) {
          let licences = [];
          try {
            const raw = typeof track.beat_licence === 'string'
              ? JSON.parse(track.beat_licence)
              : track.beat_licence;
            licences = Array.isArray(raw) ? raw : (raw?.licences || []);
          } catch {
            licences = [];
          }

          const lic = licences.find(l => String(l.id) === String(licenceId));
          if (!lic) {
            console.warn('[paypal-order] refused: licence', licenceId, 'not found on track', trackId);
            return { statusCode: 400, body: JSON.stringify({ error: 'That licence is not offered on this beat', reason: 'unknown_licence' }) };
          }
          price    = Number(lic.price) || 0;
          label    = `${track.title} — ${lic.label || licenceId} licence`;
          customId = `lic:${licenceId}:${track.id}`;
          source   = `beat_licence:${licenceId}`;

          if (price <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'That licence is free — no payment needed', reason: 'free_licence' }) };
          }
        }

        // ── Pay what you want ─────────────────────────────────────────────
        // The one case where the buyer's number is the right number. It is
        // still floored at what the artist set, so "pay what you want" cannot
        // be read as "pay one cent".
        else if (track.pay_what_you_want) {
          const floor = Math.max(
            Number(track.minimum_price) || 0,
            0.50
          );
          const offered = Number(body.amount) || 0;
          price  = Math.max(floor, Math.round(offered * 100) / 100);
          source = `pwyw (offered ${offered}, floor ${floor})`;

          if (price > 10000) {
            return { statusCode: 400, body: JSON.stringify({ error: 'That amount is too large', reason: 'amount_too_large' }) };
          }
        }

        // ── An ordinary paid download ─────────────────────────────────────
        else {
          if (!track.is_downloadable) {
            console.warn('[paypal-order] refused:', trackId, 'is not downloadable');
            return { statusCode: 400, body: JSON.stringify({ error: 'This track is not available for download', reason: 'not_downloadable' }) };
          }

          price  = Number(track.download_price) || 0;
          source = 'track';

          // The album fallback, matching what the album page shows: a track
          // with no price of its own costs the album's price split across
          // its published tracks.
          if (price <= 0 && track.album_id) {
            const [{ data: album }, { count: trackCount }] = await Promise.all([
              adminClient.from('albums').select('price').eq('id', track.album_id).maybeSingle(),
              adminClient.from('tracks').select('id', { count: 'exact', head: true })
                .eq('album_id', track.album_id).eq('is_published', true),
            ]);
            const albumPrice = Number(album?.price) || 0;
            if (albumPrice > 0 && trackCount > 0) {
              price  = Math.round((albumPrice / trackCount) * 100) / 100;
              source = `album share (${albumPrice} / ${trackCount})`;
            }
          }

          if (price <= 0) {
            console.warn('[paypal-order] refused:', trackId, 'has no price on the track or its album');
            return { statusCode: 400, body: JSON.stringify({ error: 'This track is not for sale', reason: 'no_price' }) };
          }
        }
      }

      // PayPal refuses anything under about half a dollar. Caught here so it
      // reads as a price problem rather than an opaque failure from PayPal.
      if (price < 0.50) {
        console.warn('[paypal-order] refused: resolved price', price, 'is below the PayPal minimum', { trackId, albumId, licenceId });
        return { statusCode: 400, body: JSON.stringify({ error: 'This costs too little to sell on its own', reason: 'below_minimum' }) };
      }

      // ── THE ARTIST'S PRICE, AND WHAT THE BUYER PAYS ──────────────────────
      //
      // `price` up to this point is the ARTIST's price: what they set, and what
      // they should end up holding. It is no longer what the buyer is charged.
      //
      // The buyer now also pays the processing cost, as a visible line item, so
      // PayPal's fee stops coming out of the artist's side. See
      // netlify/lib/pricing.js for the arithmetic and for why the old 20%
      // could never have done this job.
      //
      // With the fee settings at 0, or absent because migration 128 has not
      // run, quote() returns buyerPays === artistPrice and everything below
      // behaves exactly as it did before.
      const q = await pricing.quote(adminClient, price);
      const artistPrice = q.artistPrice;
      const serviceFee  = q.serviceFee;
      const safeAmount  = q.buyerPays.toFixed(2);

      if (q.capped) {
        console.error('[paypal-order] service fee hit the safety cap — check platform_settings.',
          JSON.stringify({ trackId, albumId, artistPrice, serviceFee }));
      }

      // ── WHERE THE MONEY GOES ─────────────────────────────────────────────
      //
      // Resolved here, from the database, for the same reason the price is:
      // the browser does not get a say in who gets paid. netlify/lib/payee.js
      // holds the whole decision and its reasoning; the short version is that
      // a sale only leaves the platform account when direct routing is turned
      // on, the item has exactly one recipient, and that recipient has PayPal
      // details on file. Anything else stays on the existing capture-then-
      // split-payout path, which is the only one that can pay collaborators.
      //
      // sellerArtistId is the track's or album's artist. It is NOT taken from
      // artistName in the request body, which is a display string the client
      // supplies and has always been decorative.
      const sellerArtistId = albumId
        ? (await adminClient.from('albums').select('artist_id').eq('id', albumId).maybeSingle()).data?.artist_id || null
        : (await adminClient.from('tracks').select('artist_id').eq('id', trackId).maybeSingle()).data?.artist_id || null;

      let commissionPct = 0;
      try {
        const { data: r } = await adminClient.rpc('platform_commission_percent');
        commissionPct = Math.min(100, Math.max(0, parseFloat(r ?? 0)));
      } catch (e) {
        console.error('[paypal-order] commission rate unreadable at create, using 0:', e.message);
      }

      let routing;
      try {
        routing = await payeeLib.resolvePayee({
          supabase: adminClient,
          artistId: sellerArtistId,
          trackId:  albumId ? null : trackId,
          commissionPct,
        });
      } catch (e) {
        // A failure to decide is a decision to change nothing. Never let a bug
        // in the routing layer stop a sale or, worse, send it somewhere
        // unintended.
        console.error('[paypal-order] payee resolution threw, staying on the platform route:', e.message);
        routing = { route: 'platform', payee: null, reason: 'resolver_threw', commissionPct };
      }

      const { fragment: payeeFragment, headers: payeeHeaders } =
        payeeLib.purchaseUnitFor(routing, { grossValue: price, currency: 'USD' });

      console.log('[paypal-order] CREATE',
        JSON.stringify({
          trackId: trackId || null, albumId: albumId || null,
          licenceId: licenceId || null, safeAmount, source,
          route: routing.route, routeReason: routing.reason,
          sellerArtistId, commissionPct,
        }));

      // The buyer sees what they are paying for. A total that is 43 cents more
      // than the price on the page, with no explanation, reads as a platform
      // skimming — which is precisely the thing this change exists to stop.
      // Split into an item and a handling line, PayPal's own checkout shows
      // "Isandla Sami $2.00 / Handling $0.43 / Total $2.43" before they
      // authorise anything.
      //
      // breakdown is only sent when there IS a fee. PayPal requires the parts
      // to sum to `value` to the cent, and an item_total with no handling on a
      // zero-fee order is just a second chance to get that wrong.
      const amountBlock = serviceFee > 0
        ? {
            currency_code: 'USD',
            value: safeAmount,
            breakdown: {
              item_total: { currency_code: 'USD', value: artistPrice.toFixed(2) },
              handling:   { currency_code: 'USD', value: serviceFee.toFixed(2) },
            },
          }
        : { currency_code: 'USD', value: safeAmount };

      const orderPayload = {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: amountBlock,
          ...(serviceFee > 0 ? {
            items: [{
              name: String(label || 'Track').slice(0, 127),
              description: 'Processing fee added so the artist receives their full price',
              unit_amount: { currency_code: 'USD', value: artistPrice.toFixed(2) },
              quantity: '1',
              category: 'DIGITAL_GOODS',
            }],
          } : {}),
          description: `${label} by ${artistName || 'Artist'} - Feelz Machine`,
          custom_id: customId,
          ...payeeFragment,
        }],
        application_context: {
          brand_name: 'Feelz Machine',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: 'https://www.feelzmachine.com',
          cancel_url: 'https://www.feelzmachine.com',
        },
      };

      let result = await paypalRequest('POST', '/v2/checkout/orders', orderPayload, accessToken, payeeHeaders);

      // ── If the payee is refused, sell it anyway ──────────────────────────
      //
      // PayPal rejects an order whose payee it will not accept — an address
      // that is not a verified business account, a merchant id we have no
      // permission for, a platform fee on an account that is not a partner.
      // Those all read as a 4xx at create.
      //
      // A routing preference is not worth a lost sale. Retry once on the plain
      // platform route, which is known to work, and log the reason loudly so
      // the artist's setup can be fixed rather than quietly failing forever.
      if (result.status !== 201 && routing.route !== 'platform') {
        console.error('[paypal-order] PAYEE REFUSED by PayPal — falling back to the platform route.',
          'route=', routing.route, 'artist=', sellerArtistId,
          'status=', result.status, 'body=', JSON.stringify(result.body));

        routing = { route: 'platform', payee: null, reason: 'paypal_refused_payee', commissionPct };
        // The amount, items and breakdown are carried over unchanged. Only the
        // payee and the platform fee are dropped — the buyer is charged exactly
        // the same total either way, because where the money goes is our
        // problem and not theirs.
        const fallbackPayload = {
          ...orderPayload,
          purchase_units: [{
            amount:      orderPayload.purchase_units[0].amount,
            items:       orderPayload.purchase_units[0].items,
            description: orderPayload.purchase_units[0].description,
            custom_id:   orderPayload.purchase_units[0].custom_id,
          }],
        };
        result = await paypalRequest('POST', '/v2/checkout/orders', fallbackPayload, accessToken);
      }

      if (result.status !== 201) {
        // Logged as well as returned. "Failed to create order" in a toast with
        // the reason only in the response body is how a payment bug stays
        // invisible for a week.
        console.error('[paypal-order] PayPal refused the order:',
          result.status, JSON.stringify(result.body));
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Failed to create order', details: result.body }),
        };
      }

      return {
        statusCode: 200,
        // The breakdown goes back to the client so a screen can show the same
        // three numbers PayPal will show, before the buyer ever leaves the
        // page. `amount` keeps its old meaning — the total charged — so no
        // existing caller breaks by reading it.
        body: JSON.stringify({
          orderId:     result.body.id,
          amount:      safeAmount,
          artistPrice: artistPrice.toFixed(2),
          serviceFee:  serviceFee.toFixed(2),
        }),
      };
    }

    // ========== QUOTE ==========
    //
    // What a purchase will cost, without creating an order. Exists so a screen
    // can show "$2.00 + $0.43 fee = $2.43" before the buyer commits, rather
    // than showing one number and PayPal showing another.
    //
    // It resolves the price through exactly the same code as `create` — a quote
    // endpoint that computes the price a second way is a quote endpoint that
    // will eventually disagree with the checkout.
    if (action === 'quote') {
      const adminClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { albumId, licenceId, amount: offered } = body;

      let base = 0;
      if (albumId) {
        const { data: album } = await adminClient
          .from('albums').select('price').eq('id', albumId).maybeSingle();
        base = Number(album?.price) || 0;
      } else if (trackId) {
        const { data: track } = await adminClient
          .from('tracks')
          .select('download_price, album_id, pay_what_you_want, minimum_price, beat_licence')
          .eq('id', trackId).maybeSingle();

        if (!track) return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) };

        if (licenceId) {
          let licences = [];
          try {
            const raw = typeof track.beat_licence === 'string'
              ? JSON.parse(track.beat_licence) : track.beat_licence;
            licences = Array.isArray(raw) ? raw : (raw?.licences || []);
          } catch { licences = []; }
          base = Number(licences.find(l => String(l.id) === String(licenceId))?.price) || 0;
        } else if (track.pay_what_you_want) {
          const floor = Math.max(Number(track.minimum_price) || 0, 0.50);
          base = Math.max(floor, Math.round((Number(offered) || 0) * 100) / 100);
        } else {
          base = Number(track.download_price) || 0;
          if (base <= 0 && track.album_id) {
            const [{ data: album }, { count: trackCount }] = await Promise.all([
              adminClient.from('albums').select('price').eq('id', track.album_id).maybeSingle(),
              adminClient.from('tracks').select('id', { count: 'exact', head: true })
                .eq('album_id', track.album_id).eq('is_published', true),
            ]);
            const albumPrice = Number(album?.price) || 0;
            if (albumPrice > 0 && trackCount > 0) {
              base = Math.round((albumPrice / trackCount) * 100) / 100;
            }
          }
        }
      } else {
        return { statusCode: 400, body: JSON.stringify({ error: 'trackId or albumId required' }) };
      }

      const quoted = await pricing.quote(adminClient, base);
      return {
        statusCode: 200,
        body: JSON.stringify({
          artistPrice: quoted.artistPrice.toFixed(2),
          serviceFee:  quoted.serviceFee.toFixed(2),
          buyerPays:   quoted.buyerPays.toFixed(2),
        }),
      };
    }

    // ========== CAPTURE ORDER ==========
    if (action === 'capture') {
      if (!orderId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'orderId required' }) };
      }

      const adminClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const result = await paypalRequest(
        'POST',
        `/v2/checkout/orders/${orderId}/capture`,
        {},
        accessToken
      );

      if (result.status !== 201 && result.status !== 200) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Failed to capture order', details: result.body }),
        };
      }

      const capture = result.body.purchase_units?.[0]?.payments?.captures?.[0];
      const captureId = capture?.id;
      const capturedAmount = parseFloat(capture?.amount?.value || 0);

      // One line per capture, always, whether or not anything else works.
      //
      // When money moves and the platform cannot account for it, the only
      // thing that settles the question is what PayPal said at the moment it
      // happened — which account was paid, what the status was, and whether
      // the funds were released or held. None of that was being written
      // anywhere, so the first time it mattered there was nothing to read.
      //
      // `status: PENDING` here is the answer to "it left the buyer's account
      // and never arrived in mine": a bank-funded payment, or a hold on a
      // new seller account. `seller_receivable_breakdown` shows the fee and
      // what was actually credited.
      console.log('[paypal-order] CAPTURE',
        JSON.stringify({
          orderId,
          captureId,
          amount:        capture?.amount,
          status:        capture?.status,
          statusDetails: capture?.status_details || null,
          payee:         result.body.purchase_units?.[0]?.payee || null,
          merchantId:    result.body.purchase_units?.[0]?.payee?.merchant_id || null,
          breakdown:     capture?.seller_receivable_breakdown || null,
          payerEmail:    result.body.payer?.email_address || null,
        }));

      // ── Finding the track id. This is where the money went missing. ────────
      //
      // It read ONLY `result.body.purchase_units[0].custom_id`. In PayPal's
      // Orders v2 CAPTURE response the custom_id set at order creation is
      // echoed on the CAPTURE object — purchase_units[0].payments.captures[0]
      // .custom_id — and the purchase_unit itself often carries no custom_id
      // at all. When that read came back undefined, the guard below it
      //
      //     if (captureTrackId && captureId && capturedAmount > 0)
      //
      // was false, so the ENTIRE block was skipped: no split payout, no
      // purchases row, no downloads row. And the function still returned
      // `success: true`, so the buyer saw a confirmation, the artist saw no
      // sale, and the download was then refused with "Purchase required"
      // because the row that grants it had never been written.
      //
      // Now: check every place PayPal puts it, and if all of them are empty,
      // GET the order back — that response definitely carries
      // purchase_units[].custom_id, because it is the object we created.
      // Three chances to find a value we ourselves set minutes earlier.
      //
      // `reference_id` is NOT in this list on purpose. PayPal fills it with
      // the string "default" when you do not set one, so using it as a
      // fallback would hand a non-uuid to a uuid column and turn a missing
      // record into a failed insert — a worse failure wearing a fix's
      // clothes.
      let captureTrackId =
            capture?.custom_id
         || result.body.purchase_units?.[0]?.custom_id
         || null;

      if (!captureTrackId) {
        try {
          const lookup = await paypalRequest('GET', `/v2/checkout/orders/${orderId}`, null, accessToken);
          captureTrackId = lookup.body?.purchase_units?.[0]?.custom_id || null;
          console.log('[paypal-order] custom_id recovered by re-reading the order:', captureTrackId);
        } catch (e) {
          console.error('[paypal-order] order re-read failed:', e.message);
        }
      }

      // Loud, because this is money. If we get here without a track id the
      // payment has been taken and we cannot say what for — that has to be
      // findable in the logs rather than shrugged off.
      if (!captureTrackId) {
        console.error('[paypal-order] CAPTURED WITH NO TRACK ID — manual reconciliation needed.',
          'orderId=', orderId, 'captureId=', captureId, 'amount=', capturedAmount);
      }

      // What the client is told about the recording step. It used to be told
      // nothing, so a payment that recorded nothing looked identical to one
      // that recorded everything.
      let recorded = false;
      let recordError = null;

      // ── DID THIS MONEY ACTUALLY ARRIVE HERE? ─────────────────────────────
      //
      // Everything below forwards the artist their share out of the business
      // account. That is only ever correct when the business account is where
      // the buyer's money landed.
      //
      // The routing decision was made minutes ago at order creation, but a
      // decision is not evidence. PayPal's capture response names the payee,
      // and that is the only authority on the question. This is the exact
      // mistake tip-artist.js was making — it set a payee on the order and then
      // paid out anyway, on the strength of a comment that said the funds were
      // here when they were not, and paid artists twice for months.
      //
      // null means "cannot tell", which happens when PAYPAL_PLATFORM_MERCHANT_ID
      // and PAYPAL_PLATFORM_EMAIL are both unset. Cannot tell is treated as
      // do-not-forward: failing to forward is fixed by hand in a minute, a
      // double payment leaves the account and has to be asked back.
      const landedHere = payeeLib.landedWithPlatform(result.body);
      const capturePayee = result.body?.purchase_units?.[0]?.payee || {};

      if (landedHere !== true) {
        console.log('[paypal-order] NOT FORWARDING — funds did not land in the platform account',
          JSON.stringify({
            orderId, captureId,
            payeeEmail:    capturePayee.email_address || null,
            payeeMerchant: capturePayee.merchant_id || null,
            verdict: landedHere === null
              ? 'UNVERIFIABLE — set PAYPAL_PLATFORM_MERCHANT_ID or PAYPAL_PLATFORM_EMAIL in Netlify'
              : 'paid direct to the seller',
          }));
      }

      if (captureTrackId && captureId && capturedAmount > 0) {
        // NOTE the `landedHere === true` on the payout trigger below, and NOT
        // on this outer condition. The recording — the purchases row, the
        // download grant, the receipts — must happen for every completed sale
        // whichever account the money went to. Only the forwarding of money is
        // conditional. Gating the whole block would mean a direct sale paid the
        // artist and left the buyer with no download, which is the original bug
        // wearing a different hat.
        try {
          const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
          if (landedHere === true) fetch(`${siteUrl}/.netlify/functions/process-split-payout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '',
            },
            body: JSON.stringify({
              track_id:       captureTrackId,
              transaction_id: captureId,
              // GROSS — what the buyer was charged. Kept for the record.
              total_amount:   capturedAmount,
              // NET — what actually landed after PayPal's cut. This is what
              // the splits are calculated from now.
              //
              // Splits were being worked out from the gross, so on a solo
              // track the artist was paid 100% of the charge out of an
              // account that had only received the charge minus PayPal's
              // fee. Every sale ran the platform account down by the fee,
              // and then the payout charged a second fee on top. Paying out
              // more than you received is not a pricing decision, it is an
              // accounting error.
              net_amount:     parseFloat(capture?.seller_receivable_breakdown?.net_amount?.value
                                         || capturedAmount),
              currency:       capture?.amount?.currency_code || 'USD',
              buyer_user_id:  body.userId || null,
            }),
          }).catch(err => console.error('Split payout trigger failed:', err.message));
        } catch (e) {
          console.error('Split payout trigger error:', e.message);
        }

        // ── Record purchase + download ─────────────────────────────────────
        //
        // Two changes beyond the track id.
        //
        // 1. THE ERRORS ARE READ. supabase-js returns { error }; it does not
        //    throw. So `await insert(...)` inside a try/catch caught nothing —
        //    a row refused by RLS or a constraint was discarded in silence,
        //    which is a second, independent way for a paid-for track to leave
        //    no trace.
        //
        // 2. THE BUYER IS RESOLVED FROM PAYPAL, not only from the client.
        //    buyerUserId arrived as `userId: user?.id` in the request body —
        //    unverified, and `undefined` if the session had lapsed by the time
        //    the buyer finished paying. The old code skipped the downloads
        //    insert entirely when it was missing (`if (!albumId && buyerUserId)`),
        //    so a lapsed session also produced a paid track with no download.
        //    The payer's PayPal email is now the fallback: it comes from the
        //    capture itself, so it cannot be absent or forged.
        // ── WHAT WAS BOUGHT COMES FROM THE ORDER, NOT THE BUYER ──────────
        //
        // albumId used to be read straight out of the capture request body.
        // Since it decides whether a whole album is granted, that let anyone
        // pay for a single track and then claim the album on the way back.
        //
        // It is now decoded from the custom_id we set when the order was
        // created, which PayPal echoes back and the buyer never touches. The
        // body is still accepted as a fallback, but only for orders created
        // before this deploy, which carry no prefix to decode.
        const { userId: buyerUserId } = body;

        let albumId   = null;
        let licenceId = null;

        if (typeof captureTrackId === 'string' && captureTrackId.startsWith('album:')) {
          albumId        = captureTrackId.slice('album:'.length);
          captureTrackId = null;
        } else if (typeof captureTrackId === 'string' && captureTrackId.startsWith('lic:')) {
          const parts = captureTrackId.split(':');
          licenceId      = parts[1] || null;
          captureTrackId = parts[2] || null;
        } else if (!captureTrackId && body.albumId) {
          // Legacy order, created before custom_id carried the kind.
          albumId = body.albumId;
          console.warn('[paypal-order] legacy capture: album taken from the request body, not custom_id');
        }

        console.log('[paypal-order] CAPTURE RESOLVED',
          JSON.stringify({ orderId, trackId: captureTrackId, albumId, licenceId }));
        const payerEmail = result.body.payer?.email_address || null;

        let resolvedUserId = buyerUserId || null;
        if (!resolvedUserId && payerEmail) {
          try {
            const { data: byEmail } = await adminClient
              .from('user_profiles').select('user_id').ilike('email', payerEmail).maybeSingle();
            if (byEmail?.user_id) {
              resolvedUserId = byEmail.user_id;
              console.log('[paypal-order] buyer resolved from PayPal email.');
            }
          } catch (e) {
            console.error('[paypal-order] payer email lookup failed:', e.message);
          }
        }

        // Idempotent on the PayPal transaction id. PayPal retries, buyers
        // double-tap, and a capture can be replayed; none of those should
        // charge the artist twice or hand out two download grants.
        const { data: already } = await adminClient
          .from('purchases').select('id').eq('paypal_transaction_id', captureId).maybeSingle();

        if (already) {
          recorded = true;
          console.log('[paypal-order] capture already recorded, skipping:', captureId);
        } else {
          // What actually landed, and what the platform kept, recorded at the
          // time of the sale. Recomputing either later from the current rate
          // would be wrong the first time the rate changes.
          const netLanded = parseFloat(
            capture?.seller_receivable_breakdown?.net_amount?.value ?? capturedAmount);
          let commissionPct = 0;
          try {
            const { data: r } = await adminClient.rpc('platform_commission_percent');
            commissionPct = Math.min(100, Math.max(0, parseFloat(r ?? 0)));
          } catch (e) {
            console.error('[paypal-order] commission rate unreadable, recording 0:', e.message);
          }
          const platformFee = parseFloat(((commissionPct / 100) * netLanded).toFixed(2));

          // Where this sale's money went, recorded at the time it went there.
          //
          // Without it the purchases table cannot answer "did we receive this,
          // or did the artist?", and every reconciliation afterwards is a
          // guess. platform_fee on a direct sale is what we WOULD have taken:
          // recorded so it is visible as commission foregone or owed, rather
          // than silently becoming zero and never being noticed.
          const payoutRoute = landedHere === true ? 'platform'
                            : landedHere === false ? 'direct'
                            : 'unverified';

          // What the artist's price was on this order, read back from the
          // breakdown we sent. Recorded separately from `amount` so the books
          // can tell the artist's price from the buyer's total — without it,
          // every report would have to re-derive the fee from a rate that may
          // since have changed, which is how a figure becomes wrong the first
          // time someone edits a setting.
          //
          // Absent breakdown means the order was created before this deploy, or
          // with the fee at zero. Both mean the artist's price was the whole
          // amount.
          const breakdown  = result.body?.purchase_units?.[0]?.amount?.breakdown || null;
          const itemTotal  = parseFloat(breakdown?.item_total?.value ?? capturedAmount);
          const buyerFee   = parseFloat(breakdown?.handling?.value ?? 0) || 0;

          const { error: purchaseErr } = await adminClient.from('purchases').insert({
            user_id:               resolvedUserId,
            track_id:              albumId ? null : captureTrackId,
            album_id:              albumId || null,
            amount:                capturedAmount,
            net_amount:            netLanded,
            platform_fee:          platformFee,
            currency:              'USD',
            paypal_transaction_id: captureId,
            paypal_payer_email:    payerEmail,
            status:                'completed',
            purchased_at:          new Date().toISOString(),
            payout_route:          payoutRoute,
            payee_account:         capturePayee.merchant_id || capturePayee.email_address || null,
            // The buyer's contribution towards processing. amount stays the
            // total charged, so nothing that already reads it changes meaning.
            buyer_service_fee:     buyerFee,
            artist_price:          Number.isFinite(itemTotal) ? itemTotal : capturedAmount,
          });

          if (purchaseErr) {
            recordError = purchaseErr.message;
            console.error('[paypal-order] PURCHASE ROW REFUSED — money taken, sale not recorded.',
              'code=', purchaseErr.code, 'msg=', purchaseErr.message,
              'captureId=', captureId, 'trackId=', captureTrackId);
          }

          // The download grant. Written even when the purchases row failed —
          // the buyer paid, so the buyer gets the file; a bookkeeping problem
          // is ours to reconcile, not theirs to be punished for.
          if (!albumId && resolvedUserId) {
            const { error: dlErr } = await adminClient.from('downloads').insert({
              track_id:      captureTrackId,
              user_id:       resolvedUserId,
              download_type: 'paid',
              amount_paid:   capturedAmount,
              created_at:    new Date().toISOString(),
            });
            if (dlErr) {
              recordError = recordError || dlErr.message;
              console.error('[paypal-order] DOWNLOAD GRANT REFUSED — buyer paid and cannot download.',
                'code=', dlErr.code, 'msg=', dlErr.message,
                'user=', resolvedUserId, 'track=', captureTrackId);
            } else {
              recorded = true;
            }
          } else if (!albumId && !resolvedUserId) {
            recordError = 'no_buyer_identified';
            console.error('[paypal-order] NO BUYER IDENTIFIED — payment captured but no download granted.',
              'captureId=', captureId, 'payerEmail=', payerEmail);
          } else {
            recorded = !purchaseErr;
          }

          // ── The receipt ────────────────────────────────────────────────
          //
          // "The app just started working differently." Until now a purchase
          // left the buyer nothing to look at: the on-screen tick cleared
          // after a second and a half, and nothing was written anywhere a
          // person could see. `purchases` and `downloads` are bookkeeping,
          // not a receipt.
          //
          // Written here rather than in the browser on purpose. A receipt
          // that depends on the buyer's tab still being open is exactly the
          // receipt that goes missing when the download fails, the phone
          // locks, or the connection drops on the way back from PayPal.
          //
          // Both sides are told. Failure to write either is logged and
          // otherwise ignored — a missing notification must never turn a
          // completed sale into an error.
          try {
            let what = 'Your purchase';
            let sellerArtistId = null;
            let sellerLabel = null;

            // The slugs are selected so the receipt can carry them. A receipt
            // that stores only an id forces whatever opens it to route by id,
            // and /track/:slug resolved slugs only — so tapping a receipt for a
            // track you had just paid for showed "Track not found".
            let trackSlug = null;
            let albumSlug = null;

            if (albumId) {
              const { data: al } = await adminClient
                .from('albums').select('title, slug, artist_id, artists ( artist_name )')
                .eq('id', albumId).maybeSingle();
              if (al) {
                what = al.title || 'Album';
                albumSlug = al.slug || null;
                sellerArtistId = al.artist_id || null;
                sellerLabel = al.artists?.artist_name || null;
              }
            } else if (captureTrackId) {
              const { data: tr } = await adminClient
                .from('tracks').select('title, slug, artist_id, artists ( artist_name )')
                .eq('id', captureTrackId).maybeSingle();
              if (tr) {
                what = tr.title || 'Track';
                trackSlug = tr.slug || null;
                sellerArtistId = tr.artist_id || null;
                sellerLabel = tr.artists?.artist_name || null;
              }
            }

            const receipts = [];

            if (resolvedUserId) {
              receipts.push({
                user_id:  resolvedUserId,
                type:     'purchase',
                title:    `You bought "${what}"`,
                message:  `$${Number(capturedAmount).toFixed(2)} paid${sellerLabel ? ` to ${sellerLabel}` : ''}`
                          + `${licenceId ? ' · licence included' : ''}`
                          + '. Your download is in your library whenever you need it again.',
                track_id: albumId ? null : captureTrackId,
                metadata: {
                  album_id:   albumId || null,
                  album_slug: albumSlug,
                  track_slug: trackSlug,
                  licence_id: licenceId || null,
                  amount:     capturedAmount,
                  capture_id: captureId,
                },
              });
            }

            if (sellerArtistId) {
              const landed = Number.isFinite(netLanded) ? netLanded : Number(capturedAmount);
              const yours  = Math.max(0, landed - (Number(platformFee) || 0));
              receipts.push({
                artist_id: sellerArtistId,
                type:      'sale',
                title:     `"${what}" sold`,
                message:   `$${Number(capturedAmount).toFixed(2)} paid · $${yours.toFixed(2)} is yours after fees.`,
                track_id:  albumId ? null : captureTrackId,
                metadata: {
                  album_id:   albumId || null,
                  amount:     capturedAmount,
                  net:        landed,
                  your_share: Number(yours.toFixed(2)),
                  capture_id: captureId,
                },
              });
            }

            if (receipts.length) {
              const { error: notifErr } = await adminClient.from('notifications').insert(receipts);
              if (notifErr) {
                console.error('[paypal-order] receipt notification refused (sale is fine, receipt is not):',
                  notifErr.code, notifErr.message,
                  notifErr.code === '23514'
                    ? '— the type is not allowed yet; run migration 125.' : '');
              }
            }
          } catch (e) {
            console.error('[paypal-order] receipt write threw (sale is fine):', e.message);
          }
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          orderId: result.body.id,
          captureId: captureId,
          amount: capture?.amount?.value,
          status: capture?.status,
          // The client can now tell "paid and granted" from "paid but
          // something went wrong", and say so instead of showing a tick.
          recorded,
          recordError,
        }),
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };

  } catch (err) {
    console.error('PayPal order error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};