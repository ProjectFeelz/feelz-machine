/**
 * netlify/functions/send-billing-emails.js
 *
 * Emails the billing notices that are waiting, and nothing else.
 *
 *
 * WHY A QUEUE RATHER THAN A SEND CALL IN EACH PLACE
 *
 * Billing notices are written in four places: paypal-webhook.js on a failed
 * payment, a cancellation and a suspension; expire_stale_subscriptions when a
 * plan lapses; and the upgrade page on sign-up. Putting a Resend call in each
 * would be four places that can forget, four senders to keep in step, and four
 * chances to mail somebody who should not be mailed.
 *
 * They all already write a notifications row, so that row is the queue. A
 * writer opts in with email_requested, this drains it and stamps emailed_at.
 * A writer that forgets gets no email, which is the right direction to fail in.
 *
 *
 * WHY THIS DOES NOT CHECK THE NEWSLETTER OPT-IN
 *
 * It is deliberate, and it is the one judgement in this file worth stating.
 *
 * send-newsletter-email.js resolves its recipients through
 * get_newsletter_email_recipients() and nowhere else, because a newsletter is
 * marketing and needs consent. A notice that a subscription payment failed is
 * not marketing. It is a service message about money leaving somebody's
 * account, to a person who is paying you right now, and a reader who opted out
 * of release announcements has not asked to stop being told their card was
 * declined. Withholding it would not be respectful, it would just mean the
 * first they hear of it is their features disappearing.
 *
 * So consent here is a different question with a different answer, and this
 * file answers it in one place: the only reason to withhold a billing email is
 * that the address cannot or must not be delivered to.
 *
 *
 * WHAT IT DOES REFUSE
 *
 * email_suppressions, every reason in it: hard_bounce, complaint, manual and
 * invalid. Those are deliverability facts, not marketing preferences. Somebody
 * who marked a previous message as spam must not be mailed again whatever the
 * subject, and continuing to send to an address that hard bounced damages the
 * sending domain for every other message the platform sends.
 *
 * A suppressed row is stamped and closed out rather than left pending, so it
 * is not retried on every run for the rest of time.
 *
 *
 * NO UNSUBSCRIBE HEADER
 *
 * sendMany adds List-Unsubscribe when a recipient carries an unsubscribeUrl.
 * These are sent without one on purpose. A one-click unsubscribe on a payment
 * alert is a control that lets somebody switch off being told their card
 * failed, usually by accident, and then wonder why their plan vanished. The
 * way out of these is to stop subscribing, which the app already offers.
 */

const { createClient } = require('@supabase/supabase-js');
const { sendOne } = require('../lib/email');
const { recordRun } = require('../lib/jobRun');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL = process.env.URL || 'https://www.feelzmachine.com';

// A run's worth. Small on purpose: this is scheduled often and a billing
// backlog should never be large, so a big page would mostly be a big empty
// query.
const PAGE_SIZE = 100;

// Only these reach an inbox. A renewal receipt is deliberately absent: a
// monthly "you paid again" email is the kind people mute, and muting this
// sender buries the notices that matter. Renewals stay in the app.
//
// job_health is here for the same reason the billing ones are: the whole
// point of the watchdog is that nobody was looking at the app when the job
// died. An alert that only lands in a bell icon repeats the failure it is
// supposed to catch.
const EMAILABLE_KINDS = new Set(['payment_failed', 'expired', 'ended', 'job_health']);

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * One plain, legible message. No images, no tracking pixel, no marketing
 * furniture: this is a service notice and it should read like one, which also
 * happens to be what keeps it out of a promotions tab.
 */
function buildEmail(n) {
  const title = n.title || 'About your subscription';
  const body  = n.message || '';
  const kind  = n.metadata && n.metadata.kind;
  const cta   =
      kind === 'payment_failed'
        ? { label: 'Check your payment details', href: 'https://www.paypal.com/myaccount/autopay/' }
    : kind === 'job_health'
        // Straight to the function that is misbehaving, named in the metadata.
        ? { label: 'Open the function in Netlify',
            href: `https://app.netlify.com/projects/feelz-machine/functions/${encodeURIComponent((n.metadata && n.metadata.job) || '')}` }
        : { label: 'Open Feelz Machine', href: `${SITE_URL}/hub` };

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#0b0b0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#141414;border:1px solid #242424;border-radius:16px;">
    <tr><td style="padding:28px 28px 8px;">
      <p style="margin:0 0 18px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8b5cf6;font-weight:700;">Feelz Machine</p>
      <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#ffffff;font-weight:700;">${esc(title)}</h1>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#b8b8b8;">${esc(body)}</p>
      <a href="${esc(cta.href)}" style="display:inline-block;padding:11px 20px;background:#ffffff;color:#000000;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">${esc(cta.label)}</a>
    </td></tr>
    <tr><td style="padding:22px 28px 26px;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6b6b6b;">
        ${kind === 'job_health'
          ? 'This is an automated check on Feelz Machine\'s scheduled jobs. You are getting it because you are an admin.'
          : `This is a service message about your Feelz Machine subscription, so it is sent whatever your other email settings are. Manage your plan at <a href="${esc(SITE_URL)}/hub" style="color:#8b5cf6;text-decoration:none;">feelzmachine.com</a>.`}
      </p>
    </td></tr>
  </table>
</body></html>`;

  const text = `${title}\n\n${body}\n\n${cta.label}: ${cta.href}\n\n` +
    (kind === 'job_health'
      ? 'Automated check on Feelz Machine scheduled jobs.'
      : 'This is a service message about your Feelz Machine subscription.');

  return { subject: title, html, text };
}

// The name in netlify.toml and in job_expectations, so the schedule, the run
// record and the watchdog all refer to the same thing.
const JOB = 'send-billing-emails';

exports.handler = async (event) => {
  const started = Date.now();

  // Same shape as expire-subscriptions.js: this runs on a schedule, and
  // Netlify will not route an HTTP request to a scheduled function. The header
  // check covers a manual run. If the `schedule` line is ever removed from
  // netlify.toml, invert this so the secret is required always.
  if (event?.headers?.['x-manual-run']
      && event.headers['x-internal-secret'] !== process.env.INTERNAL_FUNCTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const dryRun = event?.headers?.['x-dry-run'] === 'true';

  // ── What is waiting ─────────────────────────────────────────────────────
  const { data: pending, error: readErr } = await supabase
    .from('notifications')
    .select('id, user_id, artist_id, type, title, message, metadata, created_at')
    .eq('email_requested', true)
    .is('emailed_at', null)
    .order('created_at', { ascending: true })
    .limit(PAGE_SIZE);

  if (readErr) {
    console.error('[billing-emails] could not read the queue:', readErr.code, readErr.message);
    await recordRun(JOB, { ok: false, error: `queue read: ${readErr.code} ${readErr.message}`, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ error: readErr.message }) };
  }
  if (!pending || pending.length === 0) {
    // Logged every run, including the quiet ones. A job that only speaks when
    // it does something is indistinguishable from a job that has stopped.
    console.log('[billing-emails] nothing waiting');
    // Running every fifteen minutes, an empty queue is the usual answer, so
    // zero here means nothing on its own. The run record is what proves it
    // looked.
    await recordRun(JOB, { ok: true, items: 0, startedAt: started });
    return { statusCode: 200, body: JSON.stringify({ ok: true, sent: 0, pending: 0 }) };
  }

  // ── Addresses ───────────────────────────────────────────────────────────
  const userIds = [...new Set(pending.map(n => n.user_id).filter(Boolean))];
  const { data: profiles, error: profErr } = await supabase
    .from('user_profiles')
    .select('user_id, email, name')
    .in('user_id', userIds);

  if (profErr) {
    console.error('[billing-emails] address lookup failed:', profErr.code, profErr.message);
    await recordRun(JOB, { ok: false, error: `address lookup: ${profErr.code} ${profErr.message}`, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ error: profErr.message }) };
  }
  const byUser = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));

  // ── Suppressions ────────────────────────────────────────────────────────
  // Read once for the whole page rather than per message.
  const addresses = [...new Set((profiles || []).map(p => p.email).filter(Boolean))];
  let suppressed = new Set();
  if (addresses.length) {
    const { data: sup, error: supErr } = await supabase
      .from('email_suppressions')
      .select('email, reason')
      .in('email', addresses);
    if (supErr) {
      // Refusing to send is the safe answer here. Sending to an address that
      // hard bounced or reported spam hurts delivery for every other message
      // the platform sends, and that is worse than a billing notice arriving
      // on the next run.
      console.error('[billing-emails] suppression check failed, sending nothing:',
        supErr.code, supErr.message);
      await recordRun(JOB, { ok: false, error: `suppression check: ${supErr.code} ${supErr.message}`, startedAt: started });
      return { statusCode: 500, body: JSON.stringify({ error: 'suppression_check_failed' }) };
    }
    suppressed = new Set((sup || []).map(r => r.email));
  }

  // ── Send ────────────────────────────────────────────────────────────────
  let sent = 0, skipped = 0, failed = 0;
  const stamps = [];

  for (const n of pending) {
    const kind = (n.metadata && n.metadata.kind) || null;
    const profile = n.user_id ? byUser[n.user_id] : null;
    const to = profile && profile.email;

    // Each of these closes the row out rather than leaving it pending, so a
    // message that can never be sent is not retried on every run forever.
    let skipReason = null;
    if (!EMAILABLE_KINDS.has(kind)) skipReason = `kind_not_emailable:${kind}`;
    else if (!n.user_id)            skipReason = 'no_user_on_notification';
    else if (!to)                   skipReason = 'no_email_on_profile';
    else if (suppressed.has(to))    skipReason = 'suppressed';

    if (skipReason) {
      skipped++;
      stamps.push({ id: n.id, emailed_at: new Date().toISOString(), email_error: skipReason });
      continue;
    }

    if (dryRun) { sent++; continue; }

    const msg = buildEmail(n);
    // No unsubscribeUrl, so sendOne adds no List-Unsubscribe header. See the
    // note at the top: a one-click opt-out does not belong on a payment alert.
    const out = await sendOne({ to, subject: msg.subject, html: msg.html, text: msg.text });

    if (out.ok) {
      sent++;
      stamps.push({ id: n.id, emailed_at: new Date().toISOString(), email_error: null });
    } else if (out.status && out.status >= 400 && out.status < 500 && out.status !== 429) {
      // Permanent: a bad address or a rejected sender. Retrying changes
      // nothing, so it is closed out with the reason on the row.
      failed++;
      stamps.push({
        id: n.id, emailed_at: new Date().toISOString(),
        email_error: String(out.error || `HTTP ${out.status}`).slice(0, 500),
      });
      console.error('[billing-emails] permanent failure for notification', n.id, ':', out.error);
    } else {
      // Transient. Left pending with the reason recorded, so the next run
      // picks it up rather than giving up on a notice somebody needs.
      failed++;
      const { error: e } = await supabase.from('notifications')
        .update({ email_error: String(out.error || 'send failed').slice(0, 500) })
        .eq('id', n.id);
      if (e) console.error('[billing-emails] could not record the failure:', e.message);
      console.error('[billing-emails] transient failure for notification', n.id,
        ', will retry next run:', out.error);
    }
  }

  // ── Mark them ───────────────────────────────────────────────────────────
  // One statement per row rather than an upsert, because an upsert on this
  // table needs every not-null column and would rewrite the notification
  // itself. These are small pages; the extra round trips are cheap next to
  // the risk of mangling somebody's notification text.
  if (!dryRun) {
    for (const s of stamps) {
      const { error } = await supabase.from('notifications')
        .update({ emailed_at: s.emailed_at, email_error: s.email_error })
        .eq('id', s.id);
      if (error) {
        // The mail has already gone. A lost stamp means the next run sends it
        // again, so this is loud.
        console.error('[billing-emails] STAMP FAILED for notification', s.id,
          '- it may be emailed again:', error.code, error.message);
      }
    }
  }

  console.log('[billing-emails] done —', JSON.stringify({ sent, skipped, failed, read: pending.length, dryRun }));

  // Emails actually sent. A send that failed is carried in the detail and
  // still counts as a run that worked, because the job did its job: the
  // failure belongs to the address, not the schedule. A dry run records
  // nothing, because it sent nothing.
  if (!dryRun) {
    await recordRun(JOB, {
      ok: true,
      items: sent,
      detail: (skipped || failed) ? { skipped, failed, read: pending.length } : null,
      startedAt: started,
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true, sent, skipped, failed,
      read: pending.length,
      more: pending.length === PAGE_SIZE,
      dry_run: dryRun || undefined,
    }),
  };
};