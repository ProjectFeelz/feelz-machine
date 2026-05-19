/**
 * close-wheel-competition.js
 *
 * Netlify scheduled function — Sunday 23:59 UTC
 * 1. Finds this week's wheel challenge competition
 * 2. Finds the entry with most votes
 * 3. Marks it as winner
 * 4. Extends winner's Pro subscription by 90 days
 * 5. Notifies the winner + all platform users
 * 6. Closes the competition
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async () => {
  try {
    // Find current wheel challenge
    // Handle both wheel challenges and any paid_collab competitions closing today
    const { data: challenge, error: cErr } = await supabase
      .from('wheel_challenges')
      .select('*, competitions(*)')
      .eq('is_current', true)
      .maybeSingle();

    if (cErr) throw cErr;

    // Also find any paid_collab competitions whose voting closes today
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: paidCollabs } = await supabase
      .from('competitions')
      .select('*')
      .eq('paid_collab', true)
      .eq('status', 'voting')
      .gte('voting_close_at', todayStart.toISOString())
      .lte('voting_close_at', todayEnd.toISOString());

    // Process any paid_collab closures first
    for (const pc of (paidCollabs || [])) {
      await closeSingleCompetition(pc, supabase, true);
    }

    if (!challenge?.competition_id) {
      console.log('[close-wheel-competition] No active wheel challenge found.');
      return { statusCode: 200, body: 'OK' };
    }

    const comp = challenge.competitions;
    if (!comp || comp.status === 'completed') {
      console.log('[close-wheel-competition] Competition already completed or missing.');
      return { statusCode: 200, body: 'Already done' };
    }

    // Find highest-voted entry
    const { data: entries } = await supabase
      .from('competition_entries')
      .select('id, artist_id, title, vote_count, is_disqualified, artists(user_id, artist_name, profile_image_url)')
      .eq('competition_id', challenge.competition_id)
      .eq('is_disqualified', false)
      .order('vote_count', { ascending: false })
      .limit(1);

    if (!entries?.length) {
      // No entries — just close the competition
      await supabase.from('competitions').update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      }).eq('id', challenge.competition_id);
      console.log('[close-wheel-competition] No entries — competition closed without winner.');
      return { statusCode: 200, body: 'Closed — no entries' };
    }

    const winner = entries[0];
    const now = new Date();

    // 1. Mark entry as winner
    await supabase.from('competition_entries')
      .update({ is_winner: true, is_visible: true })
      .eq('id', winner.id);

    // 2. Close competition
    await supabase.from('competitions').update({
      status: 'completed',
      winner_entry_id: winner.id,
      winner_announced_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq('id', challenge.competition_id);

    // 3. Grant tier reward based on current tier — never extend existing, always upgrade
    if (winner.artist_id) {
      // Always grant verified
      await supabase.from('artists')
        .update({ is_verified: true })
        .eq('id', winner.artist_id);

      // Check current tier
      const { data: existing } = await supabase
        .from('artist_tier_subscriptions')
        .select('id, tier_id, platform_tiers(slug)')
        .eq('artist_id', winner.artist_id)
        .eq('status', 'active')
        .maybeSingle();

      const currentSlug = existing?.platform_tiers?.slug || 'free';

      if (currentSlug === 'free') {
        // Free → grant 3 months Pro
        const { data: proTier } = await supabase
          .from('platform_tiers').select('id').eq('slug', 'pro').maybeSingle();
        if (proTier) {
          const expiry = new Date(now);
          expiry.setDate(expiry.getDate() + 90);
          await supabase.from('artist_tier_subscriptions').insert({
            artist_id: winner.artist_id, tier_id: proTier.id,
            status: 'active', started_at: now.toISOString(), expires_at: expiry.toISOString(),
          });
        }
      } else if (currentSlug === 'pro') {
        // Pro → upgrade to 3 months Premium
        const { data: premiumTier } = await supabase
          .from('platform_tiers').select('id').eq('slug', 'premium').maybeSingle();
        if (premiumTier) {
          const expiry = new Date(now);
          expiry.setDate(expiry.getDate() + 90);
          // Deactivate current Pro
          await supabase.from('artist_tier_subscriptions')
            .update({ status: 'superseded', updated_at: now.toISOString() })
            .eq('id', existing.id);
          await supabase.from('artist_tier_subscriptions').insert({
            artist_id: winner.artist_id, tier_id: premiumTier.id,
            status: 'active', started_at: now.toISOString(), expires_at: expiry.toISOString(),
          });
        }
      }
      // Premium winners get verified + a featured placement notification — no tier change needed
      if (currentSlug === 'premium') {
        await supabase.from('notifications').insert({
          user_id: winner.artists?.user_id,
          artist_id: winner.artist_id,
          type: 'competition_winner',
          title: '🏆 You won Collab Roulette!',
          message: `You already have Premium — you've been given a featured placement on the home page for the next 7 days!`,
          metadata: { featured_placement: true, days: 7 },
        }).catch(() => {});
        // Mark as featured for 7 days
        await supabase.from('artists')
          .update({ featured: true, featured_until: new Date(Date.now() + 7*24*60*60*1000).toISOString() })
          .eq('id', winner.artist_id);
    }

    // 4. Notify winner
      const winnerUserId = winner.artists?.user_id;
      if (winnerUserId) {
        await supabase.from('notifications').insert({
          user_id: winnerUserId,
          artist_id: winner.artist_id,
          type: 'competition_winner',
          title: '🏆 You won Collab Roulette!',
          message: `You won this week's challenge "${comp.title}"! You've been granted 3 months Pro + Verified status. Keep creating!`,
          metadata: {
            competition_id: challenge.competition_id,
            wheel_challenge: true,
            pro_months_granted: 3,
          },
        }).catch(() => {});
      }
    }

    // 5. Auto-payout $50 for paid_collab competitions
    if (comp.paid_collab && winner.artist_id) {
      try {
        const { data: artistData } = await supabase
          .from('artists').select('paypal_email').eq('id', winner.artist_id).maybeSingle();
        const paypalEmail = artistData?.paypal_email;
        if (paypalEmail) {
          await fetch(`${process.env.URL}/.netlify/functions/paypal-payout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '',
            },
            body: JSON.stringify({
              email:          paypalEmail,
              amount:         50,
              currency:       'USD',
              note:           `Congratulations! You won the Feelz Machine Paid Collaboration: "${comp.title}". Your $50 prize is here!`,
              competition_id: challenge.competition_id,
              entry_id:       winner.id,
              artist_id:      winner.artist_id,
            }),
          });
          console.log(`[close-wheel-competition] $50 payout sent to ${paypalEmail}`);
        } else {
          console.warn(`[close-wheel-competition] Winner has no PayPal email set — payout skipped. Artist: ${winner.artist_id}`);
          // Notify winner to set their PayPal email
          await supabase.from('notifications').insert({
            user_id: winner.artists?.user_id,
            artist_id: winner.artist_id,
            type: 'payout_pending',
            title: '💰 Your $50 prize is waiting!',
            message: "You won the Paid Collaboration but your PayPal email isn't set. Go to Profile → Edit and add your PayPal email to receive your $50 USD prize.",
            metadata: { competition_id: challenge.competition_id, amount: 50, currency: 'USD' },
          }).catch(() => {});
        }
      } catch(payoutErr) {
        console.error('[close-wheel-competition] Payout error:', payoutErr.message);
      }
    }

    // 6. Notify all users of the result
    const { data: allUsers } = await supabase
      .from('user_profiles')
      .select('user_id')
      .limit(5000);

    const winnerName = winner.artists?.artist_name || 'An artist';
    const userIds = (allUsers || []).map(u => u.user_id).filter(id => id !== winner.artists?.user_id);

    if (userIds.length > 0) {
      for (let i = 0; i < userIds.length; i += 100) {
        await supabase.from('notifications').insert(
          userIds.slice(i, i+100).map(uid => ({
            user_id: uid,
            type: 'wheel_winner',
            title: `🏆 Collab Roulette Winner Announced!`,
            message: `${winnerName} won this week's challenge with "${winner.title}". Check out their track!`,
            metadata: {
              competition_id: challenge.competition_id,
              winner_artist_id: winner.artist_id,
              winner_name: winnerName,
            },
          }))
        ).catch(() => {});
      }

      await fetch(`${process.env.URL}/.netlify/functions/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '',
        },
        body: JSON.stringify({
          user_ids: userIds.slice(0, 1000),
          title: '🏆 Collab Roulette — Winner Revealed!',
          body: `${winnerName} won this week's challenge!`,
          url: `/competition/${challenge.competition_id}`,
          tag: `wheel-winner-${challenge.competition_id}`,
        }),
      }).catch(() => {});
    }

    console.log(`[close-wheel-competition] Winner: ${winnerName} (${winner.artist_id}) — Pro extended 90 days`);
    return { statusCode: 200, body: `Winner: ${winnerName}` };

  } catch (err) {
    console.error('[close-wheel-competition] Error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};