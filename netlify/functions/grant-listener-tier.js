// netlify/functions/grant-listener-tier.js
// Moves tier-granting off the browser's RLS-restricted client and onto the
// service role, since RLS on listener_tier_subscriptions/listeners almost
// certainly only allows a user to manage their own row, not an admin
// managing someone else's — which is exactly why this was failing silently.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://www.feelzmachine.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const authHeader = event.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing auth token' }) };

    // Verify the caller is a real logged-in user, then check they're an admin
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !caller) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid session' }) };

    const { data: adminRow } = await supabase
      .from('admins').select('id').eq('user_id', caller.id).maybeSingle();
    if (!adminRow) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required' }) };
    }

    const { listenerId, userId, tierSlug } = JSON.parse(event.body || '{}');
    if (!listenerId || !userId || !tierSlug) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing fields' }) };
    }

    let tierId = null;
    if (tierSlug !== 'free') {
      const { data: tier, error: tierErr } = await supabase
        .from('platform_tiers').select('id').eq('slug', tierSlug).single();
      if (tierErr || !tier) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Tier "${tierSlug}" not found` }) };
      }
      tierId = tier.id;
    }

    const { error: cancelErr } = await supabase
      .from('listener_tier_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('user_id', userId).eq('status', 'active');
    if (cancelErr) throw new Error(`Cancel existing subscription failed: ${cancelErr.message}`);

    if (tierSlug !== 'free') {
      const { error: insertErr } = await supabase.from('listener_tier_subscriptions').insert({
        user_id: userId, tier_id: tierId, status: 'active', billing_cycle: 'annual',
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (insertErr) throw new Error(`Insert new subscription failed: ${insertErr.message}`);
    }

    const { error: listenerErr } = await supabase.from('listeners').update({
      tier: tierSlug,
      tier_started_at: new Date().toISOString(),
      tier_expires_at: tierSlug !== 'free' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null,
    }).eq('id', listenerId);
    if (listenerErr) throw new Error(`Update listeners row failed: ${listenerErr.message}`);

    try {
      await supabase.from('notifications').insert({
        user_id: userId, type: 'tier_granted',
        title: tierSlug === 'free' ? 'Plan updated' : 'Fan Pro granted',
        message: tierSlug === 'free' ? 'Your plan has been updated to Free.' : 'An admin granted you Fan Pro access. Enjoy your themes and badge!',
        metadata: { tier_slug: tierSlug },
      });
    } catch { /* notification failure shouldn't block the actual grant */ }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('[grant-listener-tier]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Internal error' }) };
  }
};