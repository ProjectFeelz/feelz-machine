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
    // Capture existing order
    const { order_id } = body;
    const result = await ppRequest('POST', `/v2/checkout/orders/${order_id}/capture`, {}, ppToken);
    if (result.status !== 'COMPLETED') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Payment not completed' }) };
    }
    // Record the tip
    await supabase.from('tips').insert({
      from_user_id: user.id, artist_id, amount: amountNum,
      currency: 'USD', paypal_order_id: order_id, message: message?.trim() || null,
    });
    // Notify artist
    await supabase.from('notifications').insert({
      artist_id, type: 'tip',
      title: `Someone sent you a $${amountNum.toFixed(2)} tip! 💸`,
      message: message?.trim() || 'No message',
      metadata: { amount: amountNum, from_user_id: user.id },
    });

    // Increment active tip goal if one exists
    const { data: activeGoal } = await supabase
      .from('tip_goals')
      .select('id, current_usd, target_usd, achieved_at')
      .eq('artist_id', artist_id)
      .eq('is_active', true)
      .maybeSingle();
    if (activeGoal) {
      const newTotal  = parseFloat(activeGoal.current_usd) + amountNum;
      const achieved  = !activeGoal.achieved_at && newTotal >= parseFloat(activeGoal.target_usd);
      await supabase.from('tip_goals').update({
        current_usd: newTotal,
        ...(achieved ? { achieved_at: new Date().toISOString() } : {}),
      }).eq('id', activeGoal.id);
    }

    // ── Forward tip to artist via PayPal Payouts ──────────────────────────────
    // The order captured funds into the platform account; now send to the artist.
    if (artist.paypal_email) {
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
          console.error('Tip payout failed:', errData);
          // Record failure so admin can follow up — but don't fail the user response
          await supabase.from('tips').update({ payout_status: 'failed', payout_error: JSON.stringify(errData) })
            .eq('paypal_order_id', order_id);
        } else {
          const payoutData = await payoutRes.json();
          const batchPayout = payoutData.batch_header?.payout_batch_id || batchId;
          await supabase.from('tips').update({ payout_status: 'processing', payout_batch_id: batchPayout })
            .eq('paypal_order_id', order_id);
        }
      } catch (payoutErr) {
        console.error('Tip payout exception:', payoutErr.message);
        // Non-fatal — tip is recorded, admin can manually retry
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