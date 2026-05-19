/**
 * paid-collab-reminder.js
 *
 * Netlify scheduled function — every Sunday 9am UTC
 * Fires on the first Sunday of every month only (week 3 logic handled by checking
 * the week number in the month).
 *
 * Sends Steve (admin) a push + in-app notification reminding him to post
 * a Paid Collaboration for the month.
 *
 * Does nothing if a paid_collab competition already exists for this month.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STEVE_EMAIL = 'stillflexhere@gmail.com';

exports.handler = async () => {
  try {
    const now = new Date();

    // Only fire on the 3rd Sunday of the month
    // getDay() === 0 is Sunday. Week 3 = days 15-21.
    const day = now.getUTCDate();
    if (now.getUTCDay() !== 0 || day < 15 || day > 21) {
      console.log('[paid-collab-reminder] Not the 3rd Sunday — skipping.');
      return { statusCode: 200, body: 'Not 3rd Sunday' };
    }

    // Check if a paid_collab already exists this month
    const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).toISOString();
    const { data: existing } = await supabase
      .from('competitions')
      .select('id')
      .eq('paid_collab', true)
      .gte('created_at', monthStart)
      .maybeSingle();

    if (existing) {
      console.log('[paid-collab-reminder] Paid Collab already posted this month — skipping.');
      return { statusCode: 200, body: 'Already posted' };
    }

    // Find Steve's user_id
    const { data: steveData } = await supabase
      .from('admins')
      .select('user_id')
      .limit(1)
      .maybeSingle();

    // Also find by email
    const { data: steveProfile } = await supabase
      .from('artists')
      .select('user_id, id')
      .eq('slug', 'og-sfm')
      .maybeSingle();

    const userId = steveProfile?.user_id || steveData?.user_id;
    if (!userId) {
      console.log('[paid-collab-reminder] Could not find admin user.');
      return { statusCode: 200, body: 'No admin found' };
    }

    // Send in-app notification
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'admin_reminder',
      title: '💰 Time to post a Paid Collaboration!',
      message: 'It\'s week 3 — drop a new Paid Collaboration this month. Go to Admin → Competitions → New Competition → Paid Collaboration type. Upload your stems, set the brief, and let the community create with you.',
      metadata: {
        action: 'create_paid_collab',
        admin_only: true,
      },
    });

    // Send push notification
    await fetch(`${process.env.URL}/.netlify/functions/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '',
      },
      body: JSON.stringify({
        user_ids: [userId],
        title: '💰 Post a Paid Collaboration',
        body: 'Week 3 reminder — upload your stems and commission a creation from the community.',
        url: '/admin/competitions',
        tag: `paid-collab-reminder-${now.getUTCFullYear()}-${now.getUTCMonth()}`,
      }),
    }).catch(() => {});

    console.log(`[paid-collab-reminder] Reminder sent to admin (${userId})`);
    return { statusCode: 200, body: 'Reminder sent' };

  } catch (err) {
    console.error('[paid-collab-reminder] Error:', err.message);
    return { statusCode: 500, body: err.message };
  }
};
