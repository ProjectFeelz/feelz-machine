// netlify/functions/payfast-payment.js
// Handles PayFast payment creation and ITN (Instant Transaction Notification) webhook

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAYFAST_MERCHANT_ID  = process.env.PAYFAST_MERCHANT_ID;
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
const PAYFAST_PASSPHRASE   = process.env.PAYFAST_PASSPHRASE;
const PAYFAST_SANDBOX      = process.env.PAYFAST_SANDBOX === 'true';
const BASE_URL             = process.env.URL || 'https://www.feelzmachine.com';

const PAYFAST_URL = PAYFAST_SANDBOX
  ? 'https://sandbox.payfast.co.za/eng/process'
  : 'https://www.payfast.co.za/eng/process';

// Generate PayFast signature
function generateSignature(data, passphrase) {
  let str = Object.entries(data)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v)).replace(/%20/g, '+')}`)
    .join('&');
  if (passphrase) str += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

// Validate ITN from PayFast
function validateITN(body, signature) {
  const data = { ...body };
  delete data.signature;
  const expected = generateSignature(data, PAYFAST_PASSPHRASE);
  return expected === signature;
}

exports.handler = async (event) => {
  const { action } = JSON.parse(event.body || '{}');

  // ── CREATE PAYMENT ─────────────────────────────────────────────────────────
  if (action === 'create') {
    const {
      amount, itemName, itemDescription,
      buyerEmail, buyerFirstName,
      trackId, affiliateRef, type, userId,
    } = JSON.parse(event.body);

    const amountZAR = parseFloat(amount).toFixed(2);
    const mPaymentId = `fm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const data = {
      merchant_id:    PAYFAST_MERCHANT_ID,
      merchant_key:   PAYFAST_MERCHANT_KEY,
      return_url:     `${BASE_URL}/payment/success?ref=${mPaymentId}`,
      cancel_url:     `${BASE_URL}/payment/cancel`,
      notify_url:     `${BASE_URL}/.netlify/functions/payfast-payment`,
      name_first:     buyerFirstName || 'Listener',
      email_address:  buyerEmail,
      m_payment_id:   mPaymentId,
      amount:         amountZAR,
      item_name:      itemName,
      item_description: itemDescription || '',
      // Custom fields to pass through ITN
      custom_str1:    type || 'beat_purchase',    // 'beat_purchase' | 'subscription'
      custom_str2:    trackId || '',
      custom_str3:    affiliateRef || '',
      custom_str4:    userId || '',
      custom_str5:    '',
    };

    const signature = generateSignature(data, PAYFAST_PASSPHRASE);
    data.signature = signature;

    // Build the redirect URL with query params
    const params = new URLSearchParams(data).toString();
    const redirectUrl = `${PAYFAST_URL}?${params}`;

    return {
      statusCode: 200,
      body: JSON.stringify({ redirectUrl, mPaymentId }),
    };
  }

  // ── ITN WEBHOOK (PayFast posts here after payment) ──────────────────────────
  if (event.httpMethod === 'POST' && !JSON.parse(event.body || '{}').action) {
    const body = Object.fromEntries(new URLSearchParams(event.body));

    // Validate signature
    if (!validateITN(body, body.signature)) {
      console.error('PayFast ITN: invalid signature');
      return { statusCode: 400, body: 'Invalid signature' };
    }

    // Only process complete payments
    if (body.payment_status !== 'COMPLETE') {
      return { statusCode: 200, body: 'OK' };
    }

    const {
      m_payment_id, amount_gross, custom_str1: type,
      custom_str2: trackId, custom_str3: affiliateRef,
      custom_str4: userId, pf_payment_id,
    } = body;

    const amountZAR = parseFloat(amount_gross);
    const serviceFeeZAR = parseFloat((amountZAR * 0.15 / 1.15).toFixed(2)); // extract 15% from gross
    const creatorAmountZAR = parseFloat((amountZAR - serviceFeeZAR).toFixed(2));

    try {
      // ── Beat purchase ────────────────────────────────────────────────────────
      if (type === 'beat_purchase' && trackId) {
        // Record beat purchase
        await supabase.from('beat_purchases').insert({
          track_id:         trackId,
          buyer_user_id:    userId || null,
          licence_type:     'basic',
          amount_paid:      creatorAmountZAR,
          paypal_order_id:  m_payment_id,
          paypal_capture_id: pf_payment_id,
          status:           'completed',
        });

        // Notify artist
        const { data: track } = await supabase
          .from('tracks').select('title, artist_id, artists(user_id, artist_name)')
          .eq('id', trackId).maybeSingle();

        if (track?.artists?.user_id) {
          await supabase.from('notifications').insert({
            user_id:   track.artists.user_id,
            artist_id: track.artist_id,
            type:      'download',
            title:     `Someone purchased "${track.title}"`,
            message:   `R${amountZAR.toFixed(2)} via PayFast`,
            track_id:  trackId,
            metadata:  { amount: amountZAR, currency: 'ZAR', payment_ref: pf_payment_id },
          });
        }
      }

      // ── Affiliate commission ─────────────────────────────────────────────────
      if (affiliateRef) {
        const { data: affiliate } = await supabase
          .from('affiliates').select('id, role, credits_balance')
          .eq('ref_code', affiliateRef).eq('status', 'active').maybeSingle();

        if (affiliate) {
          const commissionZAR = parseFloat((serviceFeeZAR * 0.20).toFixed(2));
          const creditsEarned = affiliate.role === 'listener' ? Math.round(commissionZAR * 10) : 0;

          // Record conversion
          await supabase.from('affiliate_conversions').insert({
            affiliate_id:    affiliate.id,
            type:            type || 'beat_purchase',
            track_id:        trackId || null,
            referred_user_id: userId || null,
            sale_amount_zar:  amountZAR,
            service_fee_zar:  serviceFeeZAR,
            commission_zar:   affiliate.role === 'listener' ? 0 : commissionZAR,
            credits_earned:   creditsEarned,
            status:           'confirmed',
            currency:         'ZAR',
          });

          if (affiliate.role === 'listener' && creditsEarned > 0) {
            // Add credits
            const newBalance = (affiliate.credits_balance || 0) + creditsEarned;
            await supabase.from('affiliates').update({
              credits_balance:  newBalance,
              credits_lifetime: supabase.rpc('increment', { x: creditsEarned }),
              total_conversions: supabase.rpc('increment', { x: 1 }),
            }).eq('id', affiliate.id);

            await supabase.from('credits_transactions').insert({
              user_id:      userId || null,
              affiliate_id: affiliate.id,
              type:         'earned',
              amount:       creditsEarned,
              balance_after: newBalance,
              description:  `Referral commission on beat purchase`,
            });
          } else if (affiliate.role !== 'listener') {
            // Add ZAR earnings
            await supabase.from('affiliates').update({
              pending_zar:      supabase.rpc('increment_decimal', { x: commissionZAR }),
              total_earned_zar: supabase.rpc('increment_decimal', { x: commissionZAR }),
              total_conversions: supabase.rpc('increment', { x: 1 }),
            }).eq('id', affiliate.id);
          }
        }
      }
    } catch (err) {
      console.error('PayFast ITN processing error:', err);
    }

    return { statusCode: 200, body: 'OK' };
  }

  return { statusCode: 400, body: 'Bad request' };
};
