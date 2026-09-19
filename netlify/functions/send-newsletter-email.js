/**
 * netlify/functions/send-newsletter-email.js
 *
 * Emails an existing newsletter post to the people who opted in.
 *
 *
 * WHAT THIS ADDS
 *
 * send_newsletter() — the RPC NewsletterComposePage already calls — writes a
 * newsletter_posts row and fans out in-app notifications. That part works. What
 * never existed was email: RESEND_API_KEY has been set in Netlify all along and
 * no code in the repo could send a message. This is that missing half.
 *
 * It is a separate step from composing on purpose. Publishing in-app and
 * emailing a list are different acts with different consequences — an in-app
 * post can be edited or deleted, an email cannot be recalled — so the compose
 * page publishes, and emailing is an explicit second action against a post that
 * already exists and can be read back.
 *
 *
 * CONSENT
 *
 * The recipient list comes from one database function,
 * get_newsletter_email_recipients(), and from nowhere else. This function does
 * not read auth.users, does not read artist_contacts, and cannot be passed a
 * list of addresses. That is deliberate: consent for direct email is the kind
 * of rule that must live in exactly one auditable place, and a sending endpoint
 * that accepts arbitrary recipients is one mistake away from mailing everyone.
 *
 * If that database function does not exist yet, this returns 501 with the
 * migration to run and sends nothing. It does not fall back to "email
 * everybody", which is the failure mode worth engineering against.
 *
 * Note for the same reason: export-contacts.js hands a Premium artist the name
 * and email of every follower and checks no opt-in at all. That is a separate
 * problem from this file, and a worse one.
 *
 *
 * AUTH
 *
 * Either the bearer token of someone allowed to send, or the internal function
 * secret so a scheduled job can call it.
 *
 * "Allowed to send" means a row in `admins` OR a row in `newsletter_senders`
 * (migration 98). newsletter_editors is still NOT enough on its own: that
 * grants the compose page, and mailing a list is a bigger action than
 * publishing a post. newsletter_senders exists so that permission can be given
 * to one person for that one job without handing over every admin panel.
 *
 *
 * TIME LIMIT
 *
 * A Netlify background function has a long budget but not an unlimited one, and
 * a list of thousands will not send in a single invocation. So this sends in
 * pages and returns a cursor: call it again with `offset` to continue. Every
 * attempt is written to newsletter_email_sends first, so a repeat call skips
 * anyone already sent to rather than mailing them twice.
 */

const { createClient } = require('@supabase/supabase-js');
const { sendMany } = require('../lib/email');
const { unsubscribeUrl } = require('../lib/unsubscribeToken');
const { buildNewsletterEmail } = require('../lib/newsletter-template');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL  = process.env.URL || 'https://www.feelzmachine.com';
const PAGE_SIZE = 200;

async function callerMaySend(authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data || !data.user) {
    if (error) console.error('[newsletter-email] token check failed:', error.message);
    return false;
  }

  const uid = data.user.id;

  // Two tables, checked in parallel. Errors are read: a failed lookup must
  // read as "not authorised" and say why, not as a silent false that looks
  // like a permission problem when it is actually a broken query.
  const [adminRes, senderRes] = await Promise.all([
    supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle(),
    supabase.from('newsletter_senders').select('user_id').eq('user_id', uid).maybeSingle(),
  ]);

  if (adminRes.error) {
    console.error('[newsletter-email] admins lookup failed:', adminRes.error.code, adminRes.error.message);
  }
  if (senderRes.error) {
    // PGRST205/42P01 = the table does not exist, i.e. migration 98 has not
    // run. That is not the same as "this person may not send", so it is
    // logged distinctly rather than folded into the denial.
    const missing = senderRes.error.code === '42P01' || senderRes.error.code === 'PGRST205';
    console.error(
      missing
        ? '[newsletter-email] newsletter_senders does not exist — run migration 98. Falling back to admins only.'
        : `[newsletter-email] newsletter_senders lookup failed: ${senderRes.error.code} ${senderRes.error.message}`
    );
  }

  return !!adminRes.data || !!senderRes.data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const internal = event.headers['x-internal-secret'];
  const authed =
    (internal && process.env.INTERNAL_FUNCTION_SECRET && internal === process.env.INTERNAL_FUNCTION_SECRET) ||
    (await callerMaySend(event.headers.authorization || event.headers.Authorization));

  if (!authed) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { post_id, offset = 0, dry_run = false } = body;
  if (!post_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'post_id is required' }) };
  }

  // ── The post ────────────────────────────────────────────────────────────
  const { data: post, error: postErr } = await supabase
    .from('newsletter_posts')
    .select('*')
    .eq('id', post_id)
    .maybeSingle();

  if (postErr) {
    console.error('[newsletter-email] post lookup failed:', postErr.code, postErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not read the post', code: postErr.code }) };
  }
  if (!post) return { statusCode: 404, body: JSON.stringify({ error: 'Newsletter post not found' }) };

  const audience = post.audience || 'main_app';

  // ── The recipients ──────────────────────────────────────────────────────
  const { data: recipients, error: recErr } = await supabase.rpc(
    'get_newsletter_email_recipients',
    { p_audience: audience, p_limit: PAGE_SIZE, p_offset: offset }
  );

  if (recErr) {
    // PGRST202 / 42883: the function does not exist. Say what to do rather
    // than failing vaguely — and send nothing.
    const missing = recErr.code === 'PGRST202' || recErr.code === '42883';
    console.error('[newsletter-email] recipient lookup failed:', recErr.code, recErr.message);
    return {
      statusCode: missing ? 501 : 500,
      body: JSON.stringify({
        error: missing
          ? 'get_newsletter_email_recipients() does not exist — nothing was sent'
          : 'Could not resolve recipients — nothing was sent',
        code: recErr.code,
        fix: missing
          ? 'Run the migration that defines get_newsletter_email_recipients(p_audience text, p_limit int, p_offset int). It must return only addresses with a current opt-in.'
          : undefined,
      }),
    };
  }

  const list = (recipients || []).filter(r => r && r.email);
  if (list.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ post_id, audience, offset, attempted: 0, sent: 0, done: true,
        note: offset > 0 ? 'No further recipients.' : 'No opted-in recipients for this audience.' }),
    };
  }

  // ── Anyone already emailed this post is skipped ─────────────────────────
  // A resumed or retried call must not send twice. The unique index on
  // (post_id, email) makes the log the authority rather than this check, but
  // reading it first avoids paying Resend for a rejected insert.
  const { data: already, error: logErr } = await supabase
    .from('newsletter_email_sends')
    .select('email')
    .eq('post_id', post_id)
    .in('email', list.map(r => r.email));

  if (logErr) {
    console.error('[newsletter-email] send-log read failed:', logErr.code, logErr.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Could not read the send log — nothing was sent, to avoid emailing anyone twice',
        code: logErr.code,
      }),
    };
  }

  const sentAlready = new Set((already || []).map(r => r.email));
  const todo = list.filter(r => !sentAlready.has(r.email));

  if (dry_run) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        dry_run: true, post_id, audience, offset,
        page_size: PAGE_SIZE,
        would_send: todo.length,
        already_sent_in_page: sentAlready.size,
        sample: todo.slice(0, 3).map(r => r.email),
        subject: post.title,
      }),
    };
  }

  // ── Send ────────────────────────────────────────────────────────────────
  //
  // The unsubscribe link no longer points at /contact-preferences.
  //
  // That page requires a sign-in, so the only way out of this mail was to
  // remember a password. Feelz Machine opts people in by default and lets them
  // opt out, which POPIA section 69 permits for people you already have a
  // relationship with — but only while objecting stays free and easy, in every
  // message. A password prompt is not easy, and it is the single thing that
  // would have made the opt-out regime indefensible.
  //
  // Each recipient now gets their own signed token, so the link works with no
  // account and no session, and oneClick can be claimed honestly: the POST
  // branch of that function unsubscribes with no page and no interaction,
  // which is what RFC 8058 requires of a List-Unsubscribe-Post URL.
  const outcome = await sendMany(
    todo.map(r => ({
      email: r.email,
      name: r.name || null,
      unsubscribeUrl: unsubscribeUrl(SITE_URL, r.email, 'platform'),
      oneClick: true,
    })),
    (r) => buildNewsletterEmail(post, r, r.unsubscribeUrl, SITE_URL)
  );

  // ── Record it ───────────────────────────────────────────────────────────
  const rows = outcome.results.map(r => ({
    post_id,
    email: r.email,
    status: r.ok ? 'sent' : 'failed',
    provider_id: r.id || null,
    error: r.ok ? null : String(r.error || '').slice(0, 500),
  }));

  if (rows.length) {
    const { error: writeErr } = await supabase
      .from('newsletter_email_sends')
      .upsert(rows, { onConflict: 'post_id,email' });
    if (writeErr) {
      // The mail is already gone. Losing the log means a repeat call could
      // send again, so this is loud.
      console.error(
        '[newsletter-email] SEND LOG WRITE FAILED after sending',
        rows.length, 'emails for post', post_id, ':', writeErr.code, writeErr.message,
        '— a retry at this offset may email these people twice'
      );
    }
  }

  if (outcome.failed.length) {
    console.error(
      `[newsletter-email] ${outcome.failed.length} of ${outcome.attempted} failed:`,
      JSON.stringify(outcome.failed.slice(0, 10))
    );
  }

  const done = list.length < PAGE_SIZE;

  return {
    statusCode: 200,
    body: JSON.stringify({
      post_id,
      audience,
      offset,
      attempted: outcome.attempted,
      sent: outcome.sent,
      failed: outcome.failed.length,
      skipped_already_sent: sentAlready.size,
      done,
      next_offset: done ? null : offset + PAGE_SIZE,
    }),
  };
};