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
    if (action === 'create') {
      if (!trackId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'trackId required' }) };
      }

      // ── Look up authoritative price and title from DB — never trust client ──
      const adminClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { data: track, error: trackErr } = await adminClient
        .from('tracks')
        .select('id, title, download_price, is_downloadable, album_id')
        .eq('id', trackId)
        .maybeSingle();

      if (trackErr || !track) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) };
      }

      if (!track.is_downloadable) {
        console.warn('[paypal-order] refused:', trackId, 'is not downloadable');
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'This track is not available for download', reason: 'not_downloadable' }),
        };
      }

      // ── The price, resolved the way the ALBUM PAGE resolves it ──────────
      //
      // This is what was breaking purchases. A track that carries no price of
      // its own still shows a buy button on an album page, priced at the
      // album's price divided by its tracks — that is where a "$1.43" on a
      // $10 album of seven tracks comes from. This function only ever looked
      // at tracks.download_price, found nothing, and returned 400. The buyer
      // saw "payment failed" on a button the app had offered them, on a track
      // that was genuinely for sale.
      //
      // Resolved here, from the database, for the same reason the track price
      // is: the client is never trusted with an amount.
      let price = Number(track.download_price) || 0;
      let priceSource = 'track';

      if (price <= 0 && track.album_id) {
        const [{ data: album }, { count: trackCount }] = await Promise.all([
          adminClient.from('albums').select('price').eq('id', track.album_id).maybeSingle(),
          adminClient.from('tracks').select('id', { count: 'exact', head: true })
            .eq('album_id', track.album_id).eq('is_published', true),
        ]);

        const albumPrice = Number(album?.price) || 0;
        if (albumPrice > 0 && trackCount > 0) {
          price = Math.round((albumPrice / trackCount) * 100) / 100;
          priceSource = `album (${albumPrice} / ${trackCount} tracks)`;
        }
      }

      if (price <= 0) {
        console.warn('[paypal-order] refused:', trackId, 'has no price on the track or its album');
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'This track is not for sale', reason: 'no_price' }),
        };
      }

      // PayPal rejects an order below its minimum, which would otherwise come
      // back as an opaque 400 from the block below rather than saying why.
      if (price < 0.5) {
        console.warn('[paypal-order] refused:', trackId, 'price', price, 'is below the PayPal minimum');
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'This track costs too little to sell on its own', reason: 'below_minimum' }),
        };
      }

      const safeAmount = price.toFixed(2);
      const trackTitle = track.title;
      console.log('[paypal-order] CREATE', JSON.stringify({ trackId, safeAmount, priceSource }));

      const orderPayload = {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: safeAmount,
          },
          description: `${trackTitle} by ${artistName || 'Artist'} - Feelz Machine`,
          custom_id: trackId,
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
        const { userId: buyerUserId, albumId } = body;
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