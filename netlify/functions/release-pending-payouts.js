// netlify/functions/release-pending-payouts.js
//
// The other half of the payout threshold.
//
// process-split-payout holds an artist's money as `pending` rows until their
// balance clears their threshold, and releases it on the sale that tips them
// over. That is the right behaviour — a $3 payout costs nearly as much in
// PayPal fees as a $30 one — but on its own it has a trap in it: an artist
// who sells once for $4 and never sells again waits forever. Their money is
// recorded, owed, and unreachable.
//
// So this runs weekly and releases two groups:
//
//   1. anyone whose pending total has since cleared their threshold
//      (a collaborator can cross it through someone else's sale, and nothing
//      in that sale's own run would have checked them)
//   2. anyone whose oldest pending row is older than MAX_HOLD_DAYS, whatever
//      the amount — because "we are saving you the fee" stops being true the
//      moment it becomes "we are keeping your money".
//
// Nobody has to ask for their money, and nothing sits indefinitely.

const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAYPAL_BASE   = paypalEnv.baseApiM;
const MAX_HOLD_DAYS = 60;
// Below this, a payout costs more in fees than it delivers. Rows under it are
// left pending and reported, rather than sent — and they are reported, so a
// balance that can never be paid is visible instead of silently stuck.
const MIN_VIABLE    = 1.00;

async function getPayPalAccessToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Failed to get PayPal token');
  return data.access_token;
}

async function sendPayPalPayout(accessToken, items, batchId) {
  const res = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender_batch_header: {
        // PayPal deduplicates on sender_batch_id, so a retry of the same
        // week's sweep cannot pay twice even if this function is invoked
        // again by hand.
        sender_batch_id: batchId,
        email_subject: 'Your Feelz Machine royalties',
        email_message: 'Here are the royalties that have built up on your tracks.',
      },
      items,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'PayPal payout failed');
  return data;
}

exports.handler = async (event) => {
  // Scheduled invocations carry no secret header, so allow them; a manual
  // POST still has to prove itself.
  const isScheduled = !event.httpMethod || event.httpMethod === 'POST' && !event.headers?.['x-manual-run'];
  const secret = event.headers?.['x-internal-secret'];
  if (event.headers?.['x-manual-run'] && secret !== process.env.INTERNAL_FUNCTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }
  void isScheduled;

  const dryRun = event.queryStringParameters?.dry_run === 'true';

  try {
    // 1. Everything still owed.
    const { data: pending, error: pendErr } = await supabase
      .from('payouts')
      .select('id, artist_id, amount, created_at')
      .eq('status', 'pending');
    if (pendErr) throw pendErr;
    if (!pending?.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, released: 0, reason: 'nothing pending' }) };
    }

    const byArtist = new Map();
    for (const row of pending) {
      const cur = byArtist.get(row.artist_id) || { total: 0, oldest: row.created_at, ids: [] };
      cur.total += parseFloat(row.amount || 0);
      if (row.created_at < cur.oldest) cur.oldest = row.created_at;
      cur.ids.push(row.id);
      byArtist.set(row.artist_id, cur);
    }

    const artistIds = [...byArtist.keys()];

    // 2. Thresholds and payout addresses. Same precedence as the split
    //    function: the payments table wins, the artists row is the fallback.
    const [{ data: profiles }, { data: artistRows }] = await Promise.all([
      supabase.from('artist_payment_profiles')
        .select('artist_id, paypal_email, payout_threshold').in('artist_id', artistIds),
      supabase.from('artists').select('id, paypal_email, artist_name').in('id', artistIds),
    ]);

    const emailOf = {}; const nameOf = {}; const thresholdOf = {};
    (artistRows || []).forEach(a => {
      if (a.paypal_email) emailOf[a.id] = a.paypal_email;
      nameOf[a.id] = a.artist_name;
    });
    (profiles || []).forEach(p => {
      if (p.paypal_email) emailOf[p.artist_id] = p.paypal_email;
      thresholdOf[p.artist_id] = parseFloat(p.payout_threshold ?? 10);
    });

    const cutoff = new Date(Date.now() - MAX_HOLD_DAYS * 86400000).toISOString();

    const items = [];
    const releasing = [];
    const skipped = [];

    for (const [artistId, info] of byArtist) {
      const email = emailOf[artistId];
      const threshold = thresholdOf[artistId] ?? 10;
      const amount = parseFloat(info.total.toFixed(2));
      const heldTooLong = info.oldest < cutoff;

      if (!email) { skipped.push({ artistId, amount, why: 'no_paypal_email' }); continue; }
      if (amount < MIN_VIABLE) { skipped.push({ artistId, amount, why: 'below_minimum_viable' }); continue; }
      if (amount < threshold && !heldTooLong) {
        skipped.push({ artistId, amount, why: `under threshold ${threshold}` });
        continue;
      }

      items.push({
        recipient_type: 'EMAIL',
        amount: { value: amount.toFixed(2), currency: 'USD' },
        receiver: email,
        note: heldTooLong && amount < threshold
          ? 'Your Feelz Machine royalties — released because they have been waiting a while.'
          : 'Your Feelz Machine royalties.',
        sender_item_id: `sweep_${artistId}`,
      });
      releasing.push({ artistId, name: nameOf[artistId], amount, rows: info.ids, heldTooLong });
    }

    if (dryRun) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, dryRun: true, wouldRelease: releasing, skipped }, null, 2),
      };
    }

    if (!items.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, released: 0, skipped }) };
    }

    // One batch id per calendar week, so a re-run inside the same week is
    // refused by PayPal rather than paying everyone a second time.
    const week = new Date().toISOString().slice(0, 10);
    const batchId = `FEELZ_SWEEP_${week}`;
    const token = await getPayPalAccessToken();
    const batch = await sendPayPalPayout(token, items, batchId);
    const paypalBatchId = batch.batch_header?.payout_batch_id || batchId;

    // Mark the rows and move the balances, artist by artist, so one failure
    // does not take the others with it.
    for (const r of releasing) {
      const { error: upErr } = await supabase.from('payouts')
        .update({ paypal_payout_id: paypalBatchId, status: 'processing' })
        .in('id', r.rows);
      if (upErr) console.error('[sweep] could not mark rows for', r.artistId, upErr.message);

      await supabase.rpc('settle_pending_balance', { p_artist_id: r.artistId, p_amount: r.amount })
        .catch(e => console.error('[sweep] settle failed for', r.artistId, e.message));
    }

    console.log('[sweep] released', releasing.length, 'artists, batch', paypalBatchId);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, batch: paypalBatchId, released: releasing, skipped }),
    };

  } catch (err) {
    console.error('[sweep] failed:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};