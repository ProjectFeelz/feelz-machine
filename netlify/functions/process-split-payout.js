// netlify/functions/process-split-payout.js
// Triggered after a successful track purchase.
// Calculates royalty splits, logs to payouts table, and fires real PayPal Payouts.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAYPAL_BASE = process.env.PAYPAL_SANDBOX === 'true'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

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

  const { track_id, transaction_id, total_amount, currency = 'USD', buyer_user_id } = body;

  if (!track_id || !transaction_id || !total_amount) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required fields: track_id, transaction_id, total_amount' }),
    };
  }

  try {
    // 1. Fetch the track and its owner
    const { data: track, error: trackErr } = await supabase
      .from('tracks')
      .select('id, title, artist_id, download_price, artists(id, artist_name)')
      .eq('id', track_id)
      .single();

    if (trackErr || !track) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) };
    }

    // 2. Fetch accepted collaborations for this track
    const { data: collabs } = await supabase
      .from('collaborations')
      .select('artist_id, split_percent, role, artists(id, artist_name)')
      .eq('track_id', track_id)
      .eq('status', 'accepted');

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
    const ownerAmount = parseFloat(((ownerPercent / 100) * total_amount).toFixed(2));

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
      status: collaborators.length > 0 ? 'pending' : 'no_split_required',
    });

    // Collaborator payouts
    for (const collab of collaborators) {
      const collabAmount = parseFloat(((collab.split_percent / 100) * total_amount).toFixed(2));
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
    const { error: payoutErr } = await supabase
      .from('payouts')
      .insert(payoutRecords);

    if (payoutErr) throw payoutErr;

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
      await supabase.from('notifications').insert({
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
      }).catch(() => {}); // Non-critical
    }

    // ── Real PayPal Payouts ──────────────────────────────────────────────────────
    // Only send payouts if there are collaborators — solo tracks don't need splitting
    if (collaborators.length > 0) {
      try {
        // Fetch each artist's PayPal email from their profile
        const payoutItems = [];
        const artistIds = payoutRecords.map(r => r.artist_id);
        const { data: artistProfiles } = await supabase
          .from('artists')
          .select('id, paypal_email')
          .in('id', artistIds);

        const emailMap = {};
        (artistProfiles || []).forEach(a => { if (a.paypal_email) emailMap[a.id] = a.paypal_email; });

        for (const record of payoutRecords) {
          const email = emailMap[record.artist_id];
          if (!email) {
            console.warn(`No PayPal email for artist ${record.artist_id} — skipping payout`);
            // Mark as failed so admin can manually follow up
            await supabase.from('payouts')
              .update({ status: 'no_paypal_email' })
              .eq('transaction_id', record.transaction_id)
              .eq('artist_id', record.artist_id);
            continue;
          }
          if (record.amount <= 0) continue;
          payoutItems.push({
            recipient_type: 'EMAIL',
            amount: { value: record.amount.toFixed(2), currency: record.currency },
            receiver: email,
            note: `Royalty split for "${track.title}" on Feelz Machine`,
            sender_item_id: `${record.transaction_id}_${record.artist_id}`,
          });
        }

        if (payoutItems.length > 0) {
          const batchId = `FEELZ_SPLIT_${transaction_id}`;
          const accessToken = await getPayPalAccessToken();
          const payoutData = await sendPayPalPayout(accessToken, payoutItems, batchId);
          const paypalBatchId = payoutData.batch_header?.payout_batch_id || batchId;

          // Update all payout records with the batch ID and mark as processing
          await supabase.from('payouts')
            .update({ paypal_payout_id: paypalBatchId, status: 'processing' })
            .eq('transaction_id', transaction_id);
        }
      } catch (payoutErr) {
        // Log the error but don't fail the whole response — payout records exist
        // and admin can retry via the payouts dashboard
        console.error('PayPal payout error (records saved, manual retry possible):', payoutErr.message);
        await supabase.from('payouts')
          .update({ status: 'payout_failed', notes: payoutErr.message })
          .eq('transaction_id', transaction_id);
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