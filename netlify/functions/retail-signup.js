// netlify/functions/retail-signup.js
//
// Self-serve Feelz Retail signup, for the 14 day free trial.
//
//   action 'pricing'  (no sign-in)  The standard monthly price and trial length,
//                                   for the landing page. Null price means
//                                   self-serve is switched off.
//   action 'start'    (signed in)   Creates the venue and its subscription row
//                                   for the signed-in person, at the standard
//                                   price. The person then subscribes from the
//                                   player; the PayPal plan built for them has
//                                   the free trial as its first cycle, so PayPal
//                                   itself starts charging on day 15 unless
//                                   they cancel.
//
// The price comes from platform_settings.retail_standard_monthly_usd, never
// from the browser. Until that setting exists, 'start' refuses: signing people
// up to a price nobody chose is the one thing this must not do.
//
// One venue per account. A person who already has a venue is sent to it.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function settings() {
  const { data } = await supabase.from('platform_settings')
    .select('key, value')
    .in('key', ['retail_standard_monthly_usd', 'retail_trial_days', 'retail_min_playable_tracks']);
  const map = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  const price = parseFloat(map.retail_standard_monthly_usd);
  const trial = parseInt(map.retail_trial_days, 10);
  const minTracks = parseInt(map.retail_min_playable_tracks, 10);

  // Nobody pays for an empty player: signup stays shut (null price, so the
  // landing page shows "get in touch") until there are enough approved
  // submissions to play (migration 150). If the count cannot be read, shut is
  // the safe answer.
  const { data: playable, error: countErr } = await supabase.rpc('retail_playable_track_count');
  if (countErr) console.error('[retail-signup] playable count failed:', countErr.message);
  const needed = Number.isFinite(minTracks) && minTracks > 0 ? minTracks : 30;
  const enoughMusic = !countErr && Number(playable) >= needed;

  return {
    priceUsd:  enoughMusic && Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
    trialDays: Number.isFinite(trial) && trial > 0 && trial <= 90 ? trial : 0,
  };
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  if (body.action === 'pricing') {
    const s = await settings();
    return json(200, s);
  }

  if (body.action !== 'start') return json(400, { error: 'Unknown action' });

  // ── Who is asking ─────────────────────────────────────────────────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Sign in first.' });
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7).trim());
  if (authErr || !user) return json(401, { error: 'Sign in first.' });

  const businessName = String(body.businessName || '').trim().slice(0, 120);
  const contactName  = String(body.contactName  || '').trim().slice(0, 120) || null;
  const contactPhone = String(body.contactPhone || '').trim().slice(0, 40)  || null;
  if (businessName.length < 2) return json(400, { error: 'Enter your business name.' });

  const s = await settings();
  if (!s.priceUsd) {
    return json(503, { error: 'Online signup is not open yet. Get in touch and we will set you up.' });
  }

  // ── One venue per account ────────────────────────────────────────────────
  const { data: existing, error: exErr } = await supabase
    .from('retail_venues').select('id, status').eq('user_id', user.id).limit(1);
  if (exErr) return json(500, { error: 'Could not check your account. Try again.' });
  if (existing?.length) return json(200, { venueId: existing[0].id, existing: true });

  const { data: venue, error: vErr } = await supabase.from('retail_venues').insert({
    user_id:       user.id,
    business_name: businessName,
    contact_name:  contactName,
    contact_email: user.email || null,
    contact_phone: contactPhone,
    status:        'pending',
    created_by:    user.id,
  }).select('id').single();
  if (vErr || !venue) {
    console.error('[retail-signup] venue insert failed:', vErr?.message);
    return json(500, { error: 'Could not create your venue. Try again.' });
  }

  const { error: sErr } = await supabase.from('retail_subscriptions').insert({
    venue_id:    venue.id,
    monthly_fee: s.priceUsd,
    status:      'pending',
  });
  if (sErr) {
    // Without a subscription row the venue cannot be billed, so undo the venue
    // rather than leave a half-made account behind.
    console.error('[retail-signup] subscription insert failed, removing venue:', sErr.message);
    await supabase.from('retail_venues').delete().eq('id', venue.id);
    return json(500, { error: 'Could not set up billing. Try again.' });
  }

  return json(200, { venueId: venue.id, priceUsd: s.priceUsd, trialDays: s.trialDays });
};