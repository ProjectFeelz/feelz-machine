/**
 * netlify/functions/tip-artist.js
 *
 * Creates and captures a PayPal order for a tip.
 * Uses the same PayPal pattern as paypal-order.js.
 *
 * POST body: { artist_id, amount, message, token }
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAYPAL_BASE = process.env.PAYPAL_ENV === 'sandbox'
  ? 'api-m.sandbox.paypal.com'
  : 'api-m.paypal.com';

async function getAccessToken() {
  return new Promise((resolve, reject) => {
    const creds = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    const payload = 'grant_type=client_credentials';
    const req = https.request({
      hostname: PAYPAL_BASE, path: '/v1/oauth2/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}`, 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { const r = JSON.parse(d); r.access_token ? resolve(r.access_token) : reject(new Error(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}

async function ppRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: PAYPAL_BASE, path, method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject); if (payload) req.write(payload); req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { artist_id, amount, message, token, action } = body;
  if (!artist_id || !amount || !token) return { statusCode: 400, body: 'Missing fields' };

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum < 1 || amountNum > 500) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Amount must be between $1 and $500' }) };
  }

  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return { statusCode: 401, body: 'Unauthorized' };

  const { data: artist } = await supabase
    .from('artists').select('id, artist_name, paypal_email').eq('id', artist_id).maybeSingle();
  if (!artist) return { statusCode: 404, body: 'Artist not found' };
  if (!artist.paypal_email) return { statusCode: 400, body: JSON.stringify({ error: 'This artist has not set up payments yet' }) };

  const ppToken = await getAccessToken();

  if (action === 'capture') {
    const { order_id } = body;
    if (!order_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing order_id' }) };
    }

    const result = await ppRequest('POST', `/v2/checkout/orders/${order_id}/capture`, {}, ppToken);
    if (result.status !== 'COMPLETED') {
      // Log the reason. A bare 400 with no detail meant every failed capture
      // looked identical, whether it was a declined card or an already-captured
      // order being retried.
      console.error('[tip] capture did not complete', JSON.stringify({
        order_id,
        status: result?.status || null,
        name:   result?.name || null,
        detail: result?.details || result?.message || null,
      }));
      return { statusCode: 400, body: JSON.stringify({ error: 'Payment not completed' }) };
    }

    // ══════════════════════════════════════════════════════════════════════
    // THE MONEY HAS MOVED. Everything below is bookkeeping, and none of it
    // may be lost silently.
    //
    // This insert used to be `await supabase.from('tips').insert({...})` with
    // its error unread. If it failed, the tip was captured by PayPal and left
    // no row: no record for the artist, nothing in their totals, nothing for
    // reconciliation — and the function still returned { success: true }.
    // Worse, the payout below and the payout_status updates both key off
    //   .eq('paypal_order_id', order_id)
    // which matches nothing when the row is absent, so even the payout outcome
    // went unrecorded. The only trace of the whole transaction was in PayPal's
    // dashboard.
    //
    // Retried because the common failure is transient — a pooler blip or a
    // cold connection — and a second attempt usually lands. Safe to retry only
    // because migration 87 adds UNIQUE (paypal_order_id): a duplicate now
    // means "already recorded", which is the truth rather than a second tip.
    // ══════════════════════════════════════════════════════════════════════
    const tipRow = {
      from_user_id: user.id,
      artist_id,
      amount:       amountNum,
      currency:     'USD',
      paypal_order_id: order_id,
      message:      message?.trim() || null,
    };

    let recorded = false;
    let lastInsertError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: insertError } = await supabase.from('tips').insert(tipRow);
      if (!insertError) { recorded = true; break; }
      // 23505 unique_violation on paypal_order_id: this payment is already
      // recorded, which is success. Happens when a retry's first attempt
      // actually landed, or the client re-sent the capture.
      if (insertError.code === '23505') {
        console.warn('[tip] already recorded, treating as success', order_id);
        recorded = true;
        break;
      }
      lastInsertError = insertError;
      console.error(`[tip] tips insert failed, attempt ${attempt} of 3`, JSON.stringify({
        order_id,
        code: insertError.code, message: insertError.message,
        details: insertError.details, hint: insertError.hint,
      }));
      if (attempt < 3) await new Promise(r => setTimeout(r, 300 * attempt));
    }

    if (!recorded) {
      // Deliberately loud and greppable in the Netlify function logs, carrying
      // everything needed to reconcile the payment against PayPal by hand.
      console.error(
        '[tip] UNRECORDED_CAPTURED_PAYMENT manual reconciliation required ' +
        JSON.stringify({
          order_id,
          amount: amountNum,
          currency: 'USD',
          from_user_id: user.id,
          artist_id,
          artist_name: artist.artist_name,
          artist_paypal_email: artist.paypal_email || null,
          captured_at: new Date().toISOString(),
          last_error: lastInsertError && {
            code: lastInsertError.code, message: lastInsertError.message,
          },
        })
      );

      // The payout is deliberately NOT attempted. Sending money we cannot
      // account for turns one problem into two, and the deterministic
      // sender_batch_id means it can be sent later without risk of doubling.
      //
      // 500 rather than 200 so this shows up in monitoring — but with
      // payment_captured: true, so the client knows the charge succeeded and
      // must NOT offer to try again. Telling someone a successful payment
      // failed is how you get charged twice.
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'tip_not_recorded',
          payment_captured: true,
          order_id,
          message: 'Your payment went through, but we could not record it. '
                 + 'Please do not pay again — we have the PayPal reference and will sort it out.',
        }),
      };
    }

    // Notify artist — fetch sender name
    const { data: senderArtist } = await supabase
      .from('artists').select('id, artist_name, profile_image_url').eq('user_id', user.id).maybeSingle();
    const senderName = senderArtist?.artist_name || 'A fan';
    const { data: artistUser } = await supabase
      .from('artists').select('user_id').eq('id', artist_id).maybeSingle();
    // Non-fatal: the tip is recorded, and a missing notification is a smaller
    // problem than failing a response for a payment that succeeded. But it is
    // logged, because "the artist was never told about a tip" is worth knowing.
    const { error: notifyError } = await supabase.from('notifications').insert({
      artist_id,
      user_id: artistUser?.user_id || null,
      type: 'tip',
      title: `${senderName} sent you a $${amountNum.toFixed(2)} tip 💸`,
      message: message?.trim() || '',
      from_artist_id: senderArtist?.id || null,
      metadata: {
        amount: amountNum,
        from_user_id: user.id,
        from_artist_name: senderName,
        from_artist_image: senderArtist?.profile_image_url || null,
        message: message?.trim() || null,
      },
    });
    if (notifyError) {
      console.error('[tip] artist notification failed', JSON.stringify({
        order_id, artist_id,
        code: notifyError.code, message: notifyError.message, hint: notifyError.hint,
      }));
    }

    // ── Tip goal ────────────────────────────────────────────────────────────
    // Was read-modify-write: read current_usd, add, write the total back. Two
    // tips arriving together both read the same figure and both write their
    // own, so one disappears — on a $10 goal, two $5 tips left the bar showing
    // $5 and the artist believing they were halfway when they were funded.
    //
    // increment_tip_goal (migration 87) does the arithmetic in one statement,
    // so there is no window between the read and the write. It also reports
    // whether THIS tip crossed the line, so a "goal reached" moment can only
    // happen once.
    const { data: goalResult, error: goalError } = await supabase
      .rpc('increment_tip_goal', { p_artist_id: artist_id, p_amount: amountNum });
    if (goalError) {
      console.error('[tip] tip goal increment failed', JSON.stringify({
        order_id, artist_id, amount: amountNum,
        code: goalError.code, message: goalError.message, hint: goalError.hint,
      }));
    } else if (goalResult?.status === 'ok' && goalResult.just_achieved) {
      console.log('[tip] tip goal reached', JSON.stringify({
        artist_id, goal_id: goalResult.goal_id, total: goalResult.current_usd,
      }));
    }

    // ── Forward tip to artist via PayPal Payouts ──────────────────────────────
    // The order captured funds into the platform account; now send to the artist.
    if (artist.paypal_email) {
      // Declared out here, not inside the try: a `const` in the try block is
      // not in scope in the catch, so calling it from there would throw a
      // ReferenceError — on the error path, which is the one place you cannot
      // afford a second failure.
      //
      // These updates confirm they actually matched the row. They key off
      // paypal_order_id, so before the insert retry above they silently updated
      // nothing whenever the insert had failed, meaning a failed payout left no
      // failure record either.
      const recordPayout = async (patch, label) => {
        const { data, error: upErr } = await supabase
          .from('tips')
          .update(patch)
          .eq('paypal_order_id', order_id)
          .select('id');
        if (upErr) {
          console.error(`[tip] could not record payout ${label}`, JSON.stringify({
            order_id, code: upErr.code, message: upErr.message,
          }));
        } else if (!data || data.length === 0) {
          console.error(`[tip] payout ${label} matched no tips row`, JSON.stringify({ order_id }));
        }
      };

      try {
        const batchId = `FEELZ_TIP_${order_id}`;
        const payoutRes = await fetch(`https://${PAYPAL_BASE}/v1/payments/payouts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ppToken}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            sender_batch_header: {
              sender_batch_id: batchId,
              email_subject:   `You received a $${amountNum.toFixed(2)} tip on Feelz Machine 💸`,
              email_message:   message?.trim() || 'Someone tipped you on Feelz Machine.',
            },
            items: [{
              recipient_type: 'EMAIL',
              amount:         { value: amountNum.toFixed(2), currency: 'USD' },
              receiver:       artist.paypal_email,
              note:           message?.trim() || `Tip on Feelz Machine`,
              sender_item_id: batchId,
            }],
          }),
        });
        if (!payoutRes.ok) {
          const errData = await payoutRes.json().catch(() => ({}));
          console.error('[tip] payout failed', JSON.stringify({ order_id, errData }));
          await recordPayout(
            { payout_status: 'failed', payout_error: JSON.stringify(errData) },
            'failure'
          );
        } else {
          const payoutData = await payoutRes.json();
          const batchPayout = payoutData.batch_header?.payout_batch_id || batchId;
          await recordPayout(
            { payout_status: 'processing', payout_batch_id: batchPayout },
            'success'
          );
        }
      } catch (payoutErr) {
        console.error('[tip] payout exception', JSON.stringify({
          order_id, message: payoutErr.message,
        }));
        // Non-fatal: the tip IS recorded now, so it appears in the
        // reconciliation query in migration 87 and can be retried by hand. The
        // sender_batch_id is derived from the order id, so PayPal will reject a
        // duplicate batch rather than paying twice.
        await recordPayout(
          { payout_status: 'failed', payout_error: String(payoutErr.message).slice(0, 500) },
          'exception'
        );
      }
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }

  // Create order
  const order = await ppRequest('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: 'USD', value: amountNum.toFixed(2) },
      description: `Tip for ${artist.artist_name} on Feelz Machine`,
      payee: { email_address: artist.paypal_email },
    }],
  }, ppToken);

  if (!order.id) return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create order' }) };
  return { statusCode: 200, body: JSON.stringify({ order_id: order.id }) };
};