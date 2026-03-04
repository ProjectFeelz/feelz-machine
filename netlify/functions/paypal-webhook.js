// netlify/functions/process-split-payout.js
// Triggered after a successful track purchase
// Calculates royalty splits, logs to payouts table
// TODO: Replace placeholder payout logic with real PayPal Payouts API calls

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    // Total collaborator split %
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
      status: 'pending',
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
      await supabase.from('notifications').insert({
        artist_id: record.artist_id,
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

    // TODO: Replace this section with real PayPal Payouts API
    // -------------------------------------------------------
    // const paypalToken = await getPayPalAccessToken();
    // const payoutItems = await Promise.all(payoutRecords.map(async (record) => {
    //   const { data: paymentProfile } = await supabase
    //     .from('artist_payment_profiles')
    //     .select('paypal_email')
    //     .eq('artist_id', record.artist_id)
    //     .single();
    //   return {
    //     recipient_type: 'EMAIL',
    //     amount: { value: record.amount.toFixed(2), currency: record.currency },
    //     receiver: paymentProfile?.paypal_email,
    //     note: `Royalty payout for "${track.title}"`,
    //     sender_item_id: record.transaction_id + '_' + record.artist_id,
    //   };
    // }));
    // const paypalPayout = await createPayPalPayout(paypalToken, payoutItems);
    // Update each payout record with paypal_payout_id and set status to 'paid'
    // -------------------------------------------------------

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