// netlify/functions/affiliate-track.js
// Logs affiliate link clicks and signup conversions

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const { action, refCode, page, userId, conversionType } = JSON.parse(event.body || '{}');

  // ── LOG CLICK ──────────────────────────────────────────────────────────────
  if (action === 'click') {
    const { data: affiliate } = await supabase
      .from('affiliates').select('id')
      .eq('ref_code', refCode).eq('status', 'active').maybeSingle();

    if (!affiliate) return { statusCode: 404, body: JSON.stringify({ error: 'Invalid ref code' }) };

    const ipHash = crypto.createHash('sha256')
      .update(event.headers['x-forwarded-for'] || 'unknown')
      .digest('hex').slice(0, 16);

    const { data: click } = await supabase.from('affiliate_clicks').insert({
      affiliate_id: affiliate.id,
      ref_code:     refCode,
      page:         page || '/',
      ip_hash:      ipHash,
      user_agent:   event.headers['user-agent']?.slice(0, 200) || '',
    }).select('id').single();

    // Increment click count
    await supabase.rpc('increment_affiliate_clicks', { p_affiliate_id: affiliate.id });

    return {
      statusCode: 200,
      body: JSON.stringify({ clickId: click?.id }),
    };
  }

  // ── LOG CONVERSION (signup) ────────────────────────────────────────────────
  if (action === 'convert') {
    const { data: affiliate } = await supabase
      .from('affiliates').select('id, role, credits_balance')
      .eq('ref_code', refCode).eq('status', 'active').maybeSingle();

    if (!affiliate) return { statusCode: 404, body: JSON.stringify({ error: 'Invalid ref' }) };

    // Check not self-referral
    if (userId) {
      const { data: affUser } = await supabase
        .from('affiliates').select('user_id').eq('id', affiliate.id).single();
      if (affUser?.user_id === userId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Self-referral not allowed' }) };
      }
      // Check not already converted from this affiliate
      const { data: existing } = await supabase
        .from('affiliate_conversions')
        .select('id').eq('affiliate_id', affiliate.id)
        .eq('referred_user_id', userId).eq('type', 'signup').maybeSingle();
      if (existing) return { statusCode: 200, body: JSON.stringify({ already: true }) };
    }

    // Credits for listener signup conversion
    const creditsEarned = affiliate.role === 'listener' ? 50 : 0;
    const newBalance = (affiliate.credits_balance || 0) + creditsEarned;

    await supabase.from('affiliate_conversions').insert({
      affiliate_id:    affiliate.id,
      type:            'signup',
      referred_user_id: userId || null,
      credits_earned:  creditsEarned,
      status:          'confirmed',
      currency:        'ZAR',
    });

    await supabase.from('affiliates').update({
      total_signups:    supabase.rpc('increment', { x: 1 }),
      total_conversions: supabase.rpc('increment', { x: 1 }),
      ...(creditsEarned > 0 ? {
        credits_balance:  newBalance,
        credits_lifetime: supabase.rpc('increment', { x: creditsEarned }),
      } : {}),
    }).eq('id', affiliate.id);

    if (creditsEarned > 0) {
      await supabase.from('credits_transactions').insert({
        user_id:      userId,
        affiliate_id: affiliate.id,
        type:         'earned',
        amount:       creditsEarned,
        balance_after: newBalance,
        description:  'New user signup via your referral link',
      });
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, creditsEarned }) };
  }

  // ── CHECK ELIGIBILITY & CREATE AFFILIATE ───────────────────────────────────
  if (action === 'apply') {
    const { data: { session } } = await supabase.auth.admin.getUserById(userId);

    // Check eligibility via DB function
    const { data: eligible } = await supabase
      .rpc('check_affiliate_eligibility', { p_user_id: userId });

    if (!eligible) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Not yet eligible. Keep building your presence!' }),
      };
    }

    // Check if already an affiliate
    const { data: existing } = await supabase
      .from('affiliates').select('id, status').eq('user_id', userId).maybeSingle();
    if (existing) {
      return { statusCode: 200, body: JSON.stringify({ affiliate: existing }) };
    }

    // Get artist/user info for ref code
    const { data: artist } = await supabase
      .from('artists').select('slug, role').eq('user_id', userId).maybeSingle();

    const refCode = artist?.slug
      ? `${artist.slug}-${Math.random().toString(36).slice(2, 6)}`
      : `fm-${Math.random().toString(36).slice(2, 8)}`;

    const { data: affiliate } = await supabase.from('affiliates').insert({
      user_id:   userId,
      artist_id: artist?.id || null,
      ref_code:  refCode,
      role:      artist?.role || 'listener',
      status:    'active',
      is_eligible: true,
      eligibility_met_at: new Date().toISOString(),
    }).select('*').single();

    return { statusCode: 200, body: JSON.stringify({ affiliate }) };
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };
};
