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

  // ── LOG CONVERSION (signup / subscription / tip) ───────────────────────────
  if (action === 'convert') {
    const { data: affiliate } = await supabase
      .from('affiliates').select('id, role, credits_balance')
      .eq('ref_code', refCode).eq('status', 'active').maybeSingle();

    if (!affiliate) return { statusCode: 404, body: JSON.stringify({ error: 'Invalid ref' }) };

    // The actual kind of conversion this is — defaults to 'signup' when the
    // caller doesn't specify one (e.g. the initial account-creation call).
    const effectiveType = conversionType || 'signup';

    // Check not self-referral
    if (userId) {
      const { data: affUser } = await supabase
        .from('affiliates').select('user_id').eq('id', affiliate.id).single();
      if (affUser?.user_id === userId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Self-referral not allowed' }) };
      }
      // Check not already converted from this affiliate FOR THIS TYPE —
      // a signup and a later subscription/tip from the same referred user
      // are each their own milestone and should each count once, not just
      // the first conversion ever from that person.
      const { data: existing } = await supabase
        .from('affiliate_conversions')
        .select('id').eq('affiliate_id', affiliate.id)
        .eq('referred_user_id', userId).eq('type', effectiveType).maybeSingle();
      if (existing) return { statusCode: 200, body: JSON.stringify({ already: true }) };
    }

    // Credits based on conversion type
    const creditsEarned = affiliate.role === 'listener'
      ? conversionType === 'listener_subscription' ? 200
      : conversionType === 'artist_subscription'   ? 100
      : conversionType === 'tip'                   ? 25
      : 50  // default: signup
      : 0;
    const newBalance = (affiliate.credits_balance || 0) + creditsEarned;

    await supabase.from('affiliate_conversions').insert({
      affiliate_id:    affiliate.id,
      type:            effectiveType,
      referred_user_id: userId || null,
      credits_earned:  creditsEarned,
      status:          'confirmed',
      currency:        'ZAR',
    });

    // Use RPC for atomic increments, fall back to read-modify-write if RPC missing
    try {
      await supabase.rpc('increment_affiliate_stats', {
        p_affiliate_id: affiliate.id,
        p_signups: effectiveType === 'signup' ? 1 : 0,
        p_conversions: 1,
        p_credits: creditsEarned,
      });
    } catch {
      // Fallback: manual increment
      const updates = {
        total_signups:    (affiliate.total_signups || 0) + (effectiveType === 'signup' ? 1 : 0),
        total_conversions: (affiliate.total_conversions || 0) + 1,
      };
      if (creditsEarned > 0) {
        updates.credits_balance  = newBalance;
        updates.credits_lifetime = (affiliate.credits_lifetime || 0) + creditsEarned;
      }
      await supabase.from('affiliates').update(updates).eq('id', affiliate.id);
    }

    if (creditsEarned > 0) {
      const description = {
        signup:              'New user signup via your referral link',
        artist_subscription: 'Artist subscription via your referral link',
        listener_subscription: 'Fan Pro subscription via your referral link',
        tip:                  'Tip sent via your referral link',
      }[effectiveType] || 'Conversion via your referral link';

      await supabase.from('credits_transactions').insert({
        user_id:      userId,
        affiliate_id: affiliate.id,
        type:         'earned',
        amount:       creditsEarned,
        balance_after: newBalance,
        description,
      });
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, creditsEarned }) };
  }

  // ── CHECK ELIGIBILITY & CREATE AFFILIATE ───────────────────────────────────
  if (action === 'apply') {
    if (!userId) return { statusCode: 400, body: JSON.stringify({ error: 'userId required' }) };

    // Check if already an affiliate — return existing record immediately
    const { data: existing } = await supabase
      .from('affiliates').select('*').eq('user_id', userId).maybeSingle();
    if (existing) {
      return { statusCode: 200, body: JSON.stringify({ affiliate: existing }) };
    }

    // ── Inline eligibility check (no RPC dependency) ──────────────────────
    const { data: artist } = await supabase
      .from('artists')
      .select('id, slug, role, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: venue } = artist ? { data: null } : await supabase
      .from('retail_venues')
      .select('id, business_name')
      .eq('user_id', userId)
      .maybeSingle();

    const isArtist = !!artist;
    const isVenue = !isArtist && !!venue;
    const accountAgeMs = Date.now() - new Date(artist?.created_at || Date.now()).getTime();
    const accountAgeDays = accountAgeMs / 86400000;

    let eligible = false;

    if (isArtist) {
      // Artist: account at least 30 days old + at least 1 published track
      const { count: trackCount } = await supabase
        .from('tracks')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artist.id)
        .eq('is_published', true);
      eligible = accountAgeDays >= 30 && (trackCount || 0) >= 1;
    } else if (isVenue) {
      // Venues don't have a follows/streams history to threshold-check
      // against — this isn't a "not eligible yet" rejection, it's a
      // genuine B2B relationship that needs a person to actually look at
      // it. The application still goes through, just pending instead of
      // auto-activated; an admin approves it manually (admin_approve_affiliate).
      eligible = true;
    } else {
      // Listener: account at least 14 days old, 10+ follows, 20+ streams
      const { data: profile } = await supabase
        .from('auth.users')
        .select('created_at')
        .eq('id', userId)
        .maybeSingle()
        .catch(() => ({ data: null }));

      const createdAt = profile?.created_at || new Date(Date.now() - 20 * 86400000).toISOString();
      const listenerAge = (Date.now() - new Date(createdAt).getTime()) / 86400000;

      const { count: followCount } = await supabase
        .from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId);
      const { count: streamCount } = await supabase
        .from('streams').select('id', { count: 'exact', head: true }).eq('user_id', userId);

      eligible = listenerAge >= 14 && (followCount || 0) >= 10 && (streamCount || 0) >= 20;
    }

    if (!eligible) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Not yet eligible. Keep building your presence!' }),
      };
    }

    // ── Create affiliate record ──────────────────────────────────────────
    const refCode = artist?.slug
      ? `${artist.slug}-${Math.random().toString(36).slice(2, 6)}`
      : `fm-${Math.random().toString(36).slice(2, 8)}`;

    const insertPayload = {
      user_id:  userId,
      ref_code: refCode,
      role:     isArtist ? (artist.role || 'artist') : isVenue ? 'venue' : 'listener',
      status:   isVenue ? 'pending' : 'active',
    };
    // Only add artist_id if it exists (avoids FK error for listeners and venues)
    if (artist?.id) insertPayload.artist_id = artist.id;

    const { data: newAffiliate, error: insertErr } = await supabase
      .from('affiliates')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertErr) {
      console.error('Affiliate insert error:', insertErr);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create affiliate record' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ affiliate: newAffiliate }) };
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };
};