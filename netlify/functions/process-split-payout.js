// netlify/functions/process-split-payout.js
// Triggered after a successful track purchase.
// Calculates royalty splits, logs to payouts table, and fires real PayPal Payouts.

const { createClient } = require('@supabase/supabase-js');
const { reportNotify } = require('../lib/notify');
const paypalEnv = require('../lib/paypal-env');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAYPAL_BASE = paypalEnv.baseApiM;   // see netlify/lib/paypal-env.js

async function getPayPalAccessToken() {
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

async function sendPayPalPayout(accessToken, items, batchId) {
  const res = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: 'You earned from a Feelz Machine sale 🎵',
        email_message: 'A track you collaborated on just sold. Your royalty split is on its way.',
      },
      items,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'PayPal payout failed');
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const secret = event.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_FUNCTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { track_id, transaction_id, total_amount, net_amount, currency = 'USD', buyer_user_id } = body;

  // What the splits are calculated from.
  //
  // `total_amount` is the GROSS — what the buyer was charged. Splitting that
  // meant paying out money the platform never received: PayPal's fee comes
  // off before anything lands, so a solo track paying the artist 100% of
  // gross left the account short by the fee on every single sale, before the
  // payout's own fee was charged on top.
  //
  // `net_amount` is what actually arrived, taken from the capture's
  // seller_receivable_breakdown. Falls back to gross only when an older
  // caller does not send it, so this cannot start failing on a stale deploy.
  const receivedNet = parseFloat(net_amount ?? total_amount);

  // The platform's cut comes off BEFORE the artist split, and it comes off
  // the NET — what actually landed — not the gross. Taking a percentage of
  // money PayPal already kept would be charging the artist for a fee they
  // never saw.
  //
  // The rate lives in platform_settings so it can be changed with one UPDATE
  // and no deploy. 0 means no cut, and the arithmetic below is then exactly
  // what it was.
  let commissionPercent = 0;
  try {
    const { data: rate, error: rateErr } = await supabase.rpc('platform_commission_percent');
    if (rateErr) throw rateErr;
    commissionPercent = Math.min(100, Math.max(0, parseFloat(rate ?? 0)));
  } catch (e) {
    // Falling back to 0 on purpose. If the rate cannot be read, the safe
    // failure is to pay the artist everything and under-charge ourselves —
    // not to guess a number and take money we cannot justify.
    console.error('[split-payout] could not read commission rate, taking 0%:', e.message);
    commissionPercent = 0;
  }

  const platformFee = parseFloat(((commissionPercent / 100) * receivedNet).toFixed(2));
  const splitBase   = parseFloat((receivedNet - platformFee).toFixed(2));

  console.log('[split-payout] gross', total_amount, '| net', receivedNet,
    '| commission', commissionPercent + '%', '=', platformFee,
    '| to artists', splitBase);

  if (!track_id || !transaction_id || !total_amount) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: track_id, transaction_id, total_amount' }),
    };
  }

  try {
    // 1. Fetch the track and its owner
    //
    // The `artists(id, artist_name)` embed that used to be on this select was
    // removed: nothing in this function ever read `track.artists`, and an
    // embed that is never used is a failure mode with no upside. If `tracks`
    // ever carries a second foreign key to `artists` again — as it did when
    // artists.top_pick_track_id was added — PostgREST answers HTTP 300 rather
    // than rows, and this whole payout would 404 on a track that exists.
    const { data: track, error: trackErr } = await supabase
      .from('tracks')
      .select('id, title, artist_id, download_price')
      .eq('id', track_id)
      .single();

    if (trackErr || !track) {
      console.error('[split-payout] track lookup failed:', trackErr && trackErr.message);
      return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) };
    }

    // 2. Fetch accepted collaborations for this track
    //
    // READ THE ERROR. This is the most dangerous unchecked read in the
    // codebase and it was one line long:
    //
    //   const { data: collabs } = await supabase.from('collaborations')...
    //   const collaborators = collabs || [];
    //
    // supabase-js does not throw, so a rejected query left `collabs` null,
    // `collaborators` empty, `totalCollabPercent` zero and therefore
    // `ownerPercent` 100. The track owner would be paid the entire sale and
    // every credited collaborator would be paid nothing — and the function
    // would return success. No log, no retry, no way to tell it apart from a
    // solo track afterwards.
    //
    // The embed is also gone for the same reason as above: `c.artists` was
    // never read, and `collaborations` joins two artists by nature, so that
    // table is the likeliest place for a second FK to `artists` to exist.
    const { data: collabs, error: collabErr } = await supabase
      .from('collaborations')
      .select('artist_id, split_percent, role')
      .eq('track_id', track_id)
      .eq('status', 'accepted');

    if (collabErr) {
      // Refuse to pay rather than guess. An unknown split is not a zero split.
      console.error(
        '[split-payout] ABORTED — could not read collaborations for track',
        track_id, ':', collabErr.code, collabErr.message, collabErr.details || ''
      );
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Could not determine the payout split — no payout was made',
          code: collabErr.code || null,
          track_id,
          transaction_id,
        }),
      };
    }

    const collaborators = collabs || [];

    // 3. Calculate splits
    // Guard: if collaborator percentages exceed 100, normalise proportionally
    const rawCollabTotal = collaborators.reduce((sum, c) => sum + (c.split_percent || 0), 0);
    if (rawCollabTotal > 100) {
      console.warn(`Split overflow for track ${track_id}: ${rawCollabTotal}% — normalising`);
      for (const c of collaborators) {
        c.split_percent = parseFloat(((c.split_percent / rawCollabTotal) * 100).toFixed(4));
      }
    }
    const totalCollabPercent = collaborators.reduce((sum, c) => sum + (c.split_percent || 0), 0);
    // Owner gets the remainder
    const ownerPercent = Math.max(0, 100 - totalCollabPercent);
    const ownerAmount = parseFloat(((ownerPercent / 100) * splitBase).toFixed(2));

    // Build payout records
    const payoutRecords = [];

    // Owner payout
    payoutRecords.push({
      artist_id: track.artist_id,
      track_id: track.id,
      transaction_id,
      amount: ownerAmount,
      currency,
      split_percentage: ownerPercent,
      paypal_payout_id: null, // TODO: populate after real PayPal payout
      // Solo tracks (no collabs) get status 'no_split_required' to distinguish from pending payouts
      status: 'pending',
    });

    // Collaborator payouts
    for (const collab of collaborators) {
      const collabAmount = parseFloat(((collab.split_percent / 100) * splitBase).toFixed(2));
      payoutRecords.push({
        artist_id: collab.artist_id,
        track_id: track.id,
        transaction_id,
        amount: collabAmount,
        currency,
        split_percentage: collab.split_percent,
        paypal_payout_id: null, // TODO: populate after real PayPal payout
        status: 'pending',
      });
    }

    // 4. Insert all payout records
    //
    // Idempotent. PayPal retries, captures get replayed, and a double-tap on
    // the pay button used to be enough to record a sale twice — which, once
    // payouts actually work, means paying it twice. Migration 119 adds a
    // unique index on (artist_id, transaction_id); this checks first so the
    // normal path is a clean no-op rather than a caught constraint error.
    const { data: alreadySplit } = await supabase
      .from('payouts').select('id').eq('transaction_id', transaction_id).limit(1);

    if (alreadySplit?.length) {
      console.log('[split-payout] transaction already split, nothing to do:', transaction_id);
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, alreadyProcessed: true, transaction_id }),
      };
    }

    const { error: payoutErr } = await supabase
      .from('payouts')
      .insert(payoutRecords);

    // This threw on every call before migration 119: payouts.transaction_id
    // was a uuid with a foreign key to archive.transactions, and the value
    // passed is a PayPal capture id like 6AK057134J639484P — neither a uuid
    // nor a row in a table nothing writes to. So this function has never
    // recorded a payout in its life; it threw here and returned 500.
    if (payoutErr) {
      console.error('[split-payout] payout insert failed:', payoutErr.code, payoutErr.message);
      throw payoutErr;
    }

    // 5. Update artist payment profiles with pending balance
    for (const record of payoutRecords) {
      await supabase.rpc('increment_pending_balance', {
        p_artist_id: record.artist_id,
        p_amount: record.amount,
      }).catch(() => {
        // RPC may not exist yet — fail silently, payout record is the source of truth
      });
    }

    // 6. Send notifications to each artist
    for (const record of payoutRecords) {
      // Resolve the artist's user_id so the notification is visible in the bell
      const { data: artistUser } = await supabase
        .from('artists').select('user_id').eq('id', record.artist_id).maybeSingle();
      await reportNotify('payout_pending (process-split-payout)', supabase.from('notifications').insert({
        artist_id: record.artist_id,
        user_id: artistUser?.user_id || null,
        type: 'payout_pending',
        title: 'New Sale',
        message: `You earned $${record.amount.toFixed(2)} from a sale of "${track.title}". Payout is pending.`,
        metadata: {
          track_id: track.id,
          transaction_id,
          amount: record.amount,
          split_percentage: record.split_percentage,
        },
      })); // Non-critical
    }

    // ── Real PayPal Payouts ──────────────────────────────────────────────────────
    // Send payouts to all artists — solo tracks pay the owner directly
    if (payoutRecords.length > 0) {
      try {
        // ── Where the payout email comes from ──────────────────────────
        //
        // TWO tables hold one. PaymentSettings.js — the screen that says
        // "This is where you'll receive payouts from collaborations and
        // sales" — writes artist_payment_profiles.paypal_email. Profile >
        // Edit writes artists.paypal_email. This function read only the
        // second, so which screen an artist happened to use decided whether
        // they could be paid, and the screen that promised payouts was the
        // one being ignored.
        //
        // artist_payment_profiles wins, because it is the dedicated table and
        // the one the payments UI owns. artists.paypal_email is the fallback
        // so nobody who used the older screen is stranded. Migration 119
        // backfills both directions for everyone already on the platform.
        const payoutItems = [];
        const paidOut     = [];   // { artistId, amount } per item, in order
        const artistIds = payoutRecords.map(r => r.artist_id);

        const [{ data: payProfiles }, { data: artistRows }] = await Promise.all([
          supabase.from('artist_payment_profiles')
            .select('artist_id, paypal_email, payout_threshold').in('artist_id', artistIds),
          supabase.from('artists')
            .select('id, paypal_email').in('id', artistIds),
        ]);

        const emailMap = {};
        const thresholdMap = {};
        (artistRows || []).forEach(a => { if (a.paypal_email) emailMap[a.id] = a.paypal_email; });
        (payProfiles || []).forEach(p => {
          if (p.paypal_email) emailMap[p.artist_id] = p.paypal_email;   // profiles win
          thresholdMap[p.artist_id] = parseFloat(p.payout_threshold ?? 10);
        });

        // ── The payout threshold, which the UI has always promised and the
        //    code has never honoured ──────────────────────────────────────
        //
        // The Payment Settings screen calls it "minimum before auto-payout"
        // and saves it; this function contained no reference to it and paid
        // out immediately at any amount. On small sales that is mostly fee:
        // a $3 payout costs nearly what a $30 one does.
        //
        // Now the money accumulates as `pending` payout rows, and an artist
        // is paid when their TOTAL pending clears their threshold — at which
        // point everything pending is sent in one item, not just this sale.
        // So a sale below the threshold is not lost, it is queued, and the
        // sale that tips them over releases the lot.
        const pendingTotals = {};
        {
          const { data: stillPending } = await supabase
            .from('payouts')
            .select('artist_id, amount')
            .in('artist_id', artistIds)
            .eq('status', 'pending');
          (stillPending || []).forEach(r => {
            pendingTotals[r.artist_id] = (pendingTotals[r.artist_id] || 0) + parseFloat(r.amount || 0);
          });
        }

        for (const record of payoutRecords) {
          const email = emailMap[record.artist_id];
          if (!email) {
            console.warn(`[split-payout] no PayPal email for artist ${record.artist_id} — held, not lost`);
            await supabase.from('payouts')
              .update({ status: 'no_paypal_email' })
              .eq('transaction_id', record.transaction_id)
              .eq('artist_id', record.artist_id);
            continue;
          }
          if (record.amount <= 0) continue;

          const threshold = thresholdMap[record.artist_id] ?? 10;
          const owed = pendingTotals[record.artist_id] || record.amount;

          if (owed < threshold) {
            console.log(`[split-payout] artist ${record.artist_id}: $${owed.toFixed(2)} pending, `
              + `threshold $${threshold.toFixed(2)} — holding.`);
            continue;   // the row stays 'pending' and is swept later
          }

          // Over the line: send everything owed, not just this sale.
          payoutItems.push({
            recipient_type: 'EMAIL',
            amount: { value: owed.toFixed(2), currency: record.currency },
            receiver: email,
            note: `Royalties from Feelz Machine — including "${track.title}"`,
            sender_item_id: `${record.transaction_id}_${record.artist_id}`,
          });
          // Kept beside the batch rather than decoded back out of
          // sender_item_id afterwards. A uuid contains no underscores today,
          // but reconstructing an id by splitting a string we built is the
          // kind of thing that quietly starts paying the wrong person.
          paidOut.push({ artistId: record.artist_id, amount: owed });
        }

        if (payoutItems.length > 0) {
          const batchId = `FEELZ_SPLIT_${transaction_id}`;
          const accessToken = await getPayPalAccessToken();
          const payoutData = await sendPayPalPayout(accessToken, payoutItems, batchId);
          const paypalBatchId = payoutData.batch_header?.payout_batch_id || batchId;

          // Mark EVERY pending row for the artists we just paid — not only
          // this transaction's.
          //
          // The old line filtered on `.eq('transaction_id', transaction_id)`,
          // which was right when each sale paid out on its own. It is wrong
          // now: the item we sent was the artist's whole accumulated balance,
          // so leaving their older rows as `pending` would make the next sale
          // count them again and pay the same money twice.
          const paidIds = [...new Set(paidOut.map(p => p.artistId))];

          const { error: markErr } = await supabase.from('payouts')
            .update({ paypal_payout_id: paypalBatchId, status: 'processing' })
            .in('artist_id', paidIds)
            .eq('status', 'pending');
          if (markErr) console.error('[split-payout] could not mark rows processing:', markErr.message);

          // Move the money out of the pending pot and into paid-out, so the
          // three tiles on the Profile screen tell the truth.
          for (const p of paidOut) {
            await supabase.rpc('settle_pending_balance', {
              p_artist_id: p.artistId,
              p_amount: p.amount,
            }).catch(e => console.error('[split-payout] settle failed:', e.message));
          }
        } else {
          console.log('[split-payout] nothing sent — every artist is below their payout threshold.');
        }
      } catch (payoutErr) {
        console.error('PayPal payout error (records saved, manual retry possible):', payoutErr.message);
        await supabase.from('payouts')
          .update({ status: 'payout_failed', notes: payoutErr.message })
          .eq('transaction_id', transaction_id);
        try {
          const { data: admins } = await supabase.from('admins').select('user_id');
          for (const admin of (admins || [])) {
            await reportNotify('admin_message (process-split-payout)', supabase.from('notifications').insert({
              user_id:    admin.user_id,
              type:       'admin_message',
              title:      '⚠️ Payout failed — manual action required',
              message:    `Split payout for "${track.title}" (tx: ${transaction_id}) failed: ${payoutErr.message}`,
              admin_only: true,
              metadata:   { transaction_id, track_id, error: payoutErr.message },
            }));
          }
        } catch { /* non-fatal */ }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        payouts: payoutRecords.length,
        breakdown: payoutRecords.map(r => ({
          artist_id: r.artist_id,
          amount: r.amount,
          split_percentage: r.split_percentage,
          status: r.status,
        })),
      }),
    };
  } catch (err) {
    console.error('Split payout error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};