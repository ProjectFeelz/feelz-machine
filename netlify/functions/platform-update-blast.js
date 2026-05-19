/**
 * netlify/functions/platform-update-blast.js
 *
 * One-shot broadcast function triggered manually from the admin panel.
 * Sends a rich platform update notification to all users announcing
 * new features — the competition system, Paid Collaborations, @username URLs etc.
 *
 * POST body: { secret: "INTERNAL_FUNCTION_SECRET", message?: { title, body } }
 * Defaults to the hardcoded update blast if no message provided.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_BLAST = {
  title: "Feelz Machine just levelled up 🎲",
  body: "Competitions, Collab Roulette, Paid Collabs, @username links and more. Come see what's new.",
  url: '/competitions',
  tag: 'platform-update-may-2026',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  // Auth: verify the caller is an admin via their Supabase JWT
  const authHeader = event.headers?.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim() || body?.token;
  if (token) {
    const { createClient } = require('@supabase/supabase-js');
    const userClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user } } = await userClient.auth.getUser(token);
    const adminEmails = ['stillflexhere@gmail.com'];
    if (!user || !adminEmails.includes(user.email)) {
      return { statusCode: 403, body: 'Forbidden' };
    }
  }
  // Also accept internal secret for cron/server calls
  const secret = event.headers?.['x-internal-secret'];
  if (!token && secret !== process.env.INTERNAL_FUNCTION_SECRET) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  const blast = body?.message || DEFAULT_BLAST;

  try {
    // Get all user IDs
    const { data: users } = await supabase
      .from('user_profiles')
      .select('user_id')
      .limit(10000);

    const userIds = (users || []).map(u => u.user_id).filter(Boolean);
    if (!userIds.length) return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };

    // Insert in-app notifications in batches of 100
    let notifCount = 0;
    for (let i = 0; i < userIds.length; i += 100) {
      const batch = userIds.slice(i, i + 100);
      const { error } = await supabase.from('notifications').insert(
        batch.map(uid => ({
          user_id:  uid,
          type:     'engagement',
          title:    blast.title,
          message:  blast.body,
          metadata: { platform_update: true, url: blast.url, tag: blast.tag },
        }))
      );
      if (!error) notifCount += batch.length;
    }

    // Push notifications (cap at 2000 for blast)
    const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
    await fetch(`${siteUrl}/.netlify/functions/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '',
      },
      body: JSON.stringify({
        user_ids: userIds.slice(0, 2000),
        title:    blast.title,
        body:     blast.body,
        url:      blast.url || '/',
        tag:      blast.tag || 'platform-update',
      }),
    }).catch(() => {});

    console.log(`[platform-update-blast] Sent to ${notifCount} users`);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, sent: notifCount, total_users: userIds.length }),
    };

  } catch (err) {
    console.error('[platform-update-blast] Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};