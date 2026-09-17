// netlify/functions/paypal-order.js
// Creates and captures PayPal orders for track purchases.
// Amount is ALWAYS read from the DB — never trusted from the client.

const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');

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

async function paypalRequest(method, path, body, accessToken) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: paypalEnv.hostApiM,   // was hardcoded live; see netlify/lib/paypal-env.js
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
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
          .select('id, title, price, is_published')
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
          .select('id, title, download_price, is_downloadable, album_id, is_beat, beat_licence, pay_what_you_want, pwyw_minimum_price, minimum_price')
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
            Number(track.pwyw_minimum_price) || 0,
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

      const safeAmount = price.toFixed(2);
      console.log('[paypal-order] CREATE',
        JSON.stringify({ trackId: trackId || null, albumId: albumId || null, licenceId: licenceId || null, safeAmount, source }));

      const orderPayload = {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: safeAmount,
          },
          description: `${label} by ${artistName || 'Artist'} - Feelz Machine`,
          custom_id: customId,
        }],
        application_context: {
          brand_name: 'Feelz Machine',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: 'https://www.feelzmachine.com',
          cancel_url: 'https://www.feelzmachine.com',
        },
      };

      const result = await paypalRequest('POST', '/v2/checkout/orders', orderPayload, accessToken);

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
        body: JSON.stringify({ orderId: result.body.id, amount: safeAmount }),
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

      if (captureTrackId && captureId && capturedAmount > 0) {
        try {
          const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
          fetch(`${siteUrl}/.netlify/functions/process-split-payout`, {
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

            if (albumId) {
              const { data: al } = await adminClient
                .from('albums').select('title, artist_id, artists ( artist_name )')
                .eq('id', albumId).maybeSingle();
              if (al) {
                what = al.title || 'Album';
                sellerArtistId = al.artist_id || null;
                sellerLabel = al.artists?.artist_name || null;
              }
            } else if (captureTrackId) {
              const { data: tr } = await adminClient
                .from('tracks').select('title, artist_id, artists ( artist_name )')
                .eq('id', captureTrackId).maybeSingle();
              if (tr) {
                what = tr.title || 'Track';
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