// netlify/functions/retail-artist-payouts.js
//
// The Feelz Retail artist pool, run once a day. It is the only place retail
// money leaves the platform account, so every step is idempotent and every
// amount comes from the database, never from arithmetic done here.
//
// Each run, in order:
//
//   1. ACCESS SWEEP. A venue that cancelled keeps the music until the end of
//      the period it paid for (or its free trial). Once that date passes, the
//      venue is suspended.
//
//   2. CLOSE LAST MONTH, once it is 14 days over (the refund window). The
//      split itself is done by close_retail_payout_period() in the database
//      (migration 145): 50% of net retail subscription money received plus
//      30% of ad revenue, shared by qualifying plays, to the cent. Closing is
//      idempotent: a month that is already closed returns the same period.
//
//   3. RECONCILE. Shares sent to PayPal on an earlier run are checked against
//      PayPal's own record of the batch. SUCCESS is paid. A failure goes back
//      to pending with the attempt counted; after 3 failed attempts it stops
//      and is left for a person to look at.
//
//   4. PAY. Every share that is pending, or was held because the artist had no
//      PayPal email and now has one, is sent in one PayPal Payouts batch, one
//      item per artist. Rows are claimed (marked processing with a batch
//      reference) BEFORE the batch is sent, and PayPal refuses a repeated
//      sender_batch_id, so a crash or a second run can never pay a share twice.
//      If the send fails in a way that leaves it unclear whether PayPal took
//      it, the rows stay claimed and an admin is told, rather than guessing.
//
// Scheduled in netlify.toml. A manual run must send x-internal-secret.
// ?dry_run=true reports what it would do and changes nothing.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PAYPAL_BASE = paypalEnv.baseApiM;
const MAX_ATTEMPTS = 3;

async function paypalToken() {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error('PayPal token refused: ' + (data.error_description || res.status));
  return data.access_token;
}

async function tellAdmins(title, message, metadata = {}) {
  try {
    const { data: admins } = await supabase.from('admins').select('user_id');
    const rows = (admins || []).map(a => ({
      user_id: a.user_id, type: 'admin_message', title, message, admin_only: true,
      metadata: { kind: 'retail_payouts', ...metadata },
    }));
    if (rows.length) {
      const { error } = await supabase.from('notifications').insert(rows);
      if (error) console.error('[retail-payouts] admin notice refused:', error.message);
    }
  } catch (e) {
    console.error('[retail-payouts] admin notice threw:', e.message);
  }
}

// ── 1. Access sweep ───────────────────────────────────────────────────────────
async function sweepAccess(dryRun) {
  const nowIso = new Date().toISOString();
  const { data: lapsed, error } = await supabase
    .from('retail_subscriptions')
    .select('venue_id, current_period_end, status, retail_venues!inner(status)')
    .eq('status', 'cancelled')
    .lt('current_period_end', nowIso)
    .eq('retail_venues.status', 'active');
  if (error) { console.error('[retail-payouts] sweep read failed:', error.message); return []; }

  const venueIds = [...new Set((lapsed || []).map(r => r.venue_id))];
  if (!dryRun && venueIds.length) {
    const { error: upErr } = await supabase.from('retail_venues')
      .update({ status: 'suspended' }).in('id', venueIds).eq('status', 'active');
    if (upErr) console.error('[retail-payouts] sweep suspend failed:', upErr.message);
  }
  return venueIds;
}

// ── 2. Close last month ───────────────────────────────────────────────────────
async function closeLastMonth(dryRun) {
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) + 14 * 86400000);
  const month = lastMonth.toISOString().slice(0, 10);
  if (now < due) return { month, closed: false, reason: 'refund window still open' };

  const { data: existing } = await supabase.from('retail_payout_periods')
    .select('id').eq('month', month).maybeSingle();
  if (existing) return { month, closed: true, periodId: existing.id, already: true };
  if (dryRun) return { month, closed: false, reason: 'dry run' };

  const { data: periodId, error } = await supabase.rpc('close_retail_payout_period', { p_month: month });
  if (error) {
    console.error('[retail-payouts] CLOSE FAILED for', month, error.message);
    await tellAdmins('Retail pool did not close', `The ${month} artist pool could not be closed: ${error.message}`, { month });
    return { month, closed: false, error: error.message };
  }
  return { month, closed: true, periodId };
}

// ── 3. Reconcile ──────────────────────────────────────────────────────────────
async function reconcile(token, dryRun) {
  const { data: claimed, error } = await supabase
    .from('retail_artist_payouts')
    .select('id, artist_id, amount, attempts, paypal_batch_id, paypal_batch_ref')
    .eq('status', 'processing')
    .not('paypal_batch_id', 'is', null);
  if (error) { console.error('[retail-payouts] reconcile read failed:', error.message); return []; }

  const byBatch = {};
  (claimed || []).forEach(r => { (byBatch[r.paypal_batch_id] ||= []).push(r); });
  const results = [];

  for (const [batchId, rows] of Object.entries(byBatch)) {
    const res = await fetch(`${PAYPAL_BASE}/v1/payments/payouts/${batchId}?page_size=1000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { console.error('[retail-payouts] batch lookup failed', batchId, res.status); continue; }

    // Items are keyed by sender_item_id, which is the artist id for this batch.
    const itemByArtist = {};
    (body.items || []).forEach(i => { itemByArtist[i.payout_item?.sender_item_id] = i; });

    for (const r of rows) {
      const item = itemByArtist[r.artist_id];
      const st = item?.transaction_status || null;
      let next = null;
      if (st === 'SUCCESS') next = { status: 'paid', paid_at: new Date().toISOString(), paypal_item_status: st };
      else if (['FAILED', 'RETURNED', 'BLOCKED', 'REFUNDED', 'REVERSED'].includes(st)) {
        const attempts = (r.attempts || 0) + 1;
        next = attempts >= MAX_ATTEMPTS
          ? { status: 'failed', attempts, paypal_item_status: st, note: `PayPal ${st} ${attempts} times; needs a person` }
          : { status: 'pending', attempts, paypal_item_status: st, paypal_batch_id: null, paypal_batch_ref: null,
              note: `PayPal ${st}; retrying` };
      } else if (st) {
        next = { paypal_item_status: st };   // PENDING, UNCLAIMED, ONHOLD: wait
      }
      if (next && !dryRun) {
        const { error: upErr } = await supabase.from('retail_artist_payouts').update(next).eq('id', r.id);
        if (upErr) console.error('[retail-payouts] reconcile update failed', r.id, upErr.message);
      }
      results.push({ id: r.id, paypalStatus: st, now: next?.status || 'processing' });
    }
  }
  return results;
}

// ── 4. Pay ───────────────────────────────────────────────────────────────────
async function payOut(token, dryRun) {
  const { data: owed, error } = await supabase
    .from('retail_artist_payouts')
    .select('id, artist_id, amount, status, attempts')
    .in('status', ['pending', 'held_no_paypal'])
    .gt('amount', 0);
  if (error) throw new Error('owed read failed: ' + error.message);
  if (!owed?.length) return { sent: 0 };

  const artistIds = [...new Set(owed.map(r => r.artist_id))];
  const [{ data: profiles }, { data: artists }] = await Promise.all([
    supabase.from('artist_payment_profiles').select('artist_id, paypal_email').in('artist_id', artistIds),
    supabase.from('artists').select('id, paypal_email, artist_name').in('id', artistIds),
  ]);
  // Same precedence as every other payout on the platform: the payments
  // screen's table first, the profile field as a fallback.
  const email = {};
  (artists || []).forEach(a => { if (a.paypal_email) email[a.id] = a.paypal_email.trim(); });
  (profiles || []).forEach(p => { if (p.paypal_email) email[p.artist_id] = p.paypal_email.trim(); });

  const payable = owed.filter(r => email[r.artist_id]);
  const held    = owed.filter(r => !email[r.artist_id] && r.status !== 'held_no_paypal');
  if (!dryRun && held.length) {
    await supabase.from('retail_artist_payouts')
      .update({ status: 'held_no_paypal', note: 'No PayPal email on file; paid once one is added' })
      .in('id', held.map(r => r.id));
  }
  if (!payable.length) return { sent: 0, heldForNoPaypal: held.length };

  // One item per artist: all their owed rows, summed in cents.
  const perArtist = {};
  payable.forEach(r => {
    const a = (perArtist[r.artist_id] ||= { cents: 0, ids: [] });
    a.cents += Math.round(Number(r.amount) * 100);
    a.ids.push(r.id);
  });

  const batchRef = 'retail-' + crypto.createHash('sha256')
    // Row ids plus their attempt counts: a retry of the same shares after a
    // failure gets a new reference, so PayPal does not refuse it as a repeat.
    .update(payable.map(r => `${r.id}:${r.attempts || 0}`).sort().join(','))
    .digest('hex').slice(0, 24);

  if (dryRun) {
    return { sent: 0, wouldSend: Object.entries(perArtist).map(([id, v]) => ({ artist: id, usd: v.cents / 100 })), batchRef };
  }

  // Claim first. Only rows still pending/held are claimed, so two runs racing
  // cannot both claim the same share.
  const allIds = payable.map(r => r.id);
  const { data: claimedRows, error: claimErr } = await supabase.from('retail_artist_payouts')
    .update({ status: 'processing', paypal_batch_ref: batchRef })
    .in('id', allIds)
    .in('status', ['pending', 'held_no_paypal'])
    .select('id');
  if (claimErr) throw new Error('claim failed: ' + claimErr.message);
  if ((claimedRows || []).length !== allIds.length) {
    // Something else claimed some of these in the meantime. Put back what we
    // took and stop; the next run starts clean.
    await supabase.from('retail_artist_payouts')
      .update({ status: 'pending', paypal_batch_ref: null })
      .eq('paypal_batch_ref', batchRef).is('paypal_batch_id', null);
    return { sent: 0, reason: 'claim race, retried next run' };
  }

  // Emails are stored on the rows, so the record says where the money went.
  for (const [artistId, v] of Object.entries(perArtist)) {
    await supabase.from('retail_artist_payouts').update({ paypal_email: email[artistId] }).in('id', v.ids);
  }

  const items = Object.entries(perArtist).map(([artistId, v]) => ({
    recipient_type: 'EMAIL',
    amount: { value: (v.cents / 100).toFixed(2), currency: 'USD' },
    receiver: email[artistId],
    sender_item_id: artistId,
    note: 'Your share of the Feelz Retail artist pool.',
  }));

  let res, body;
  try {
    res = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: batchRef,       // PayPal refuses a repeat of this id
          email_subject: 'Your Feelz Retail earnings',
          email_message: 'Your share of what venues paid to play your music.',
        },
        items,
      }),
    });
    body = await res.json().catch(() => ({}));
  } catch (e) {
    // Unknown whether PayPal received it. Leave the rows claimed: they will
    // not be sent again automatically, and a person checks PayPal.
    await tellAdmins('Retail payout needs checking',
      `A payout batch (${batchRef}) may or may not have reached PayPal: ${e.message}. Check PayPal before doing anything.`,
      { batchRef });
    throw e;
  }

  if (res.ok && body?.batch_header?.payout_batch_id) {
    await supabase.from('retail_artist_payouts')
      .update({ paypal_batch_id: body.batch_header.payout_batch_id })
      .eq('paypal_batch_ref', batchRef);
    return { sent: items.length, batchRef, paypalBatchId: body.batch_header.payout_batch_id };
  }

  if (res.status >= 400 && res.status < 500 && body?.name !== 'DUPLICATE_REQUEST_ID') {
    // A definite refusal: nothing was sent. Release the rows.
    await supabase.from('retail_artist_payouts')
      .update({ status: 'pending', paypal_batch_ref: null, note: `PayPal refused the batch: ${body?.name || res.status}` })
      .eq('paypal_batch_ref', batchRef).is('paypal_batch_id', null);
    await tellAdmins('Retail payout refused by PayPal', `PayPal refused batch ${batchRef}: ${body?.name || res.status} ${body?.message || ''}`, { batchRef });
    return { sent: 0, refused: body?.name || res.status };
  }

  // A 5xx or a duplicate: unclear. Keep the claim, tell a person.
  await tellAdmins('Retail payout needs checking',
    `Batch ${batchRef} returned ${res.status} ${body?.name || ''}. Check PayPal before doing anything.`, { batchRef });
  return { sent: 0, unclear: res.status };
}

exports.handler = async (event) => {
  let scheduled = false;
  try { scheduled = !!JSON.parse(event.body || '{}').next_run; } catch { scheduled = false; }
  const secret = process.env.INTERNAL_FUNCTION_SECRET;
  if (!scheduled && (!secret || event.headers?.['x-internal-secret'] !== secret)) {
    return { statusCode: 401, body: 'Unauthorized' };
  }
  const dryRun = event.queryStringParameters?.dry_run === 'true';

  const report = { dryRun };
  try {
    report.suspended = await sweepAccess(dryRun);
    report.close = await closeLastMonth(dryRun);
    const token = await paypalToken();
    report.reconciled = await reconcile(token, dryRun);
    report.pay = await payOut(token, dryRun);
    console.log('[retail-payouts]', JSON.stringify(report));
    return { statusCode: 200, body: JSON.stringify(report) };
  } catch (e) {
    console.error('[retail-payouts] run failed:', e.message, JSON.stringify(report));
    return { statusCode: 500, body: JSON.stringify({ error: e.message, report }) };
  }
};