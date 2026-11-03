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

  // ── Auth ────────────────────────────────────────────────────────────────
  //
  // THE ADMIN LIST COMES FROM THE ADMINS TABLE, NOT FROM THIS FILE.
  //
  // It used to be `const adminEmails = ['stillflexhere@gmail.com']`, which
  // meant the set of people who can broadcast to every user on the platform
  // was a deploy away from being correct, and matched on an email address
  // rather than an account. An address can be changed on an account; the
  // admins table is the thing the rest of the codebase already trusts for
  // this question, so it answers it here too.
  const authHeader = event.headers?.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || body?.token;
  const secret = event.headers?.['x-internal-secret'];

  if (token) {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Not signed in' }) };
    }
    const { data: admin } = await supabase
      .from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!admin) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Not an admin' }) };
    }
  } else if (!secret || secret !== process.env.INTERNAL_FUNCTION_SECRET) {
    // No token AND no valid secret. A present-but-invalid token is refused
    // above and never falls through to the secret check.
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
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