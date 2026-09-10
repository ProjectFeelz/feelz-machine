// netlify/functions/paypal-payout.js
// Sends a PayPal payout to a competition winner from your PayPal business balance.
// Requires: PAYPAL_CLIENT_ID, PAYPAL_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');

const PAYPAL_BASE = paypalEnv.baseApiM;   // see netlify/lib/paypal-env.js

// ── Verify the caller is a Feelz Machine admin ────────────────
async function verifyAdmin(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.replace('Bearer ', '').trim();

  // Use user-scoped client to verify the JWT
  const userSupabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error } = await userSupabase.auth.getUser(token);
  if (error || !user) return false;

  // Check admins table
  const { data: adminRow } = await userSupabase
    .from('admins')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  return !!adminRow;
}

// ── Get PayPal access token ───────────────────────────────────
async function getAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Failed to get PayPal token');
  return data.access_token;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── Auth check — an admin, or a trusted server-side caller ──────────────
  //
  // WHY THIS SECOND PATH EXISTS, AND WHAT IT FIXES
  //
  // This gate read ONLY the Authorization header. close-wheel-competition.js
  // calls this function to pay the $50 paid-collaboration prize and sends
  // `x-internal-secret`, not a bearer token — it runs on a cron, so there is
  // no admin session to borrow. So every one of those calls was rejected with
  // a 403. And close-wheel never inspected the response: it logged
  // "$50 payout sent to <email>" unconditionally.
  //
  // The prize has therefore never been paid, and the log said it had, every
  // week.
  //
  // Two accepted callers now: a signed-in admin (unchanged), or a server-side
  // function presenting INTERNAL_FUNCTION_SECRET — the same pattern
  // compute-behavior-profiles.js and engagement-drip-background.js already
  // use for internal calls.
  //
  // It fails CLOSED. Note the shape of the callers in this repo:
  //
  //     'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || ''
  //
  // If that variable is unset they send an empty string. A naive
  // `header === process.env.SECRET` would then compare '' to undefined
  // (false, fine) — but `header === (process.env.SECRET || '')` would compare
  // '' to '' and let ANYONE in. So the secret must be non-empty before it is
  // compared at all, and the comparison is timing-safe.
  const internalSecret = process.env.INTERNAL_FUNCTION_SECRET;
  const presented = event.headers?.['x-internal-secret'] || '';

  let isInternal = false;
  if (internalSecret && presented && presented.length === internalSecret.length) {
    isInternal = crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(internalSecret));
  }

  const isAdmin = isInternal ? true : await verifyAdmin(event.headers?.authorization);
  if (!isAdmin) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Forbidden — admin access or internal secret required' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { email, amount, currency, note, competition_id, entry_id, artist_id } = body;

  if (!email || !amount || !currency) {
    return { statusCode: 400, body: JSON.stringify({ error: 'email, amount, and currency are required' }) };
  }
  if (amount <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Amount must be greater than 0' }) };
  }

  // ── Prevent duplicate payouts for same entry ───────────────
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (entry_id) {
    const { data: existing } = await supabase
      .from('competition_payouts')
      .select('id, status')
      .eq('entry_id', entry_id)
      .in('status', ['processing', 'success'])
      .maybeSingle();

    if (existing) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: `Payout already ${existing.status} for this entry. Check your PayPal dashboard.`,
        }),
      };
    }
  }

  try {
    const accessToken = await getAccessToken();

    const batchId = `FEELZ_${Date.now()}`;
    const payoutRes = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: batchId,
          email_subject: 'You won a Feelz Machine competition prize! 🏆',
          email_message: note || 'Congratulations on winning the Feelz Machine competition!',
        },
        items: [{
          recipient_type: 'EMAIL',
          amount: {
            value: parseFloat(amount).toFixed(2),
            currency: currency,
          },
          receiver: email,
          note: note || 'Feelz Machine competition prize',
          sender_item_id: entry_id || batchId,
        }],
      }),
    });

    const payoutData = await payoutRes.json();

    if (!payoutRes.ok) {
      console.error('PayPal payout error:', payoutData);
      throw new Error(payoutData.message || 'Payout failed');
    }

    const paypalBatchId = payoutData.batch_header?.payout_batch_id || batchId;

    // Log to Supabase
    if (competition_id && entry_id && artist_id) {
      await supabase.from('competition_payouts').insert({
        competition_id,
        entry_id,
        artist_id,
        paypal_email: email,
        amount: parseFloat(amount),
        currency,
        paypal_payout_batch_id: paypalBatchId,
        status: 'processing',
        initiated_at: new Date().toISOString(),
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        batch_id: paypalBatchId,
        status: payoutData.batch_header?.batch_status || 'PENDING',
      }),
    };
  } catch (err) {
    console.error('Payout function error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
};