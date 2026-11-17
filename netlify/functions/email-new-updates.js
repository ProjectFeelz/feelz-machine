// netlify/functions/email-new-updates.js
//
// Runs every 5 minutes (netlify.toml). Every platform update published from
// the newsletter compose page, or by a scheduled draft, also goes out by email
// to its audience.
//
// How it works:
//   1. claim_newsletter_email_job() hands back the next post to email and the
//      page it got up to. It waits two minutes after a post is published, so
//      "Do not email this one" on the compose page always lands first, and it
//      skips a listeners post published alongside a main_app post (the main
//      list already includes every listener).
//   2. This calls send-newsletter-email.js page by page with the internal
//      secret. That function is the only place recipients come from: it reads
//      get_newsletter_email_recipients(), which honours unsubscribes and
//      suppressions, and logs every address in newsletter_email_sends so
//      nobody gets the same post twice, even if a run is repeated.
//   3. newsletter_email_progress() saves the page reached after every page, so
//      a run that stops part way is picked up by the next one.
//
// Takes no input and returns nothing sensitive.

const { createClient } = require('@supabase/supabase-js');
const { recordRun } = require('../lib/jobRun');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const JOB = 'email-new-updates';
const SITE_URL = process.env.URL || 'https://www.feelzmachine.com';
// A scheduled function gets 30 seconds. Stop starting new pages after this,
// so a page is never cut off half sent.
const BUDGET_MS = 18000;

exports.handler = async () => {
  const started = Date.now();
  let posts = 0;
  let sent = 0;
  let failed = 0;

  try {
    if (!process.env.INTERNAL_FUNCTION_SECRET) {
      throw new Error('INTERNAL_FUNCTION_SECRET is not set');
    }

    while (Date.now() - started < BUDGET_MS) {
      const { data: jobs, error: claimErr } = await supabase.rpc('claim_newsletter_email_job');
      if (claimErr) throw new Error(`claim: ${claimErr.code} ${claimErr.message}`);
      const job = (jobs || [])[0];
      if (!job) break;
      posts++;

      let offset = job.next_offset || 0;
      let done = false;

      while (!done && Date.now() - started < BUDGET_MS) {
        const res = await fetch(`${SITE_URL}/.netlify/functions/send-newsletter-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET,
          },
          body: JSON.stringify({ post_id: job.post_id, offset }),
        });
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }

        if (!res.ok) {
          // Leave the claim in place: the post is retried after it lapses,
          // from the same page, and the send log stops any repeats.
          throw new Error(`send ${res.status}: ${(json && (json.error || json.fix)) || text}`.slice(0, 300));
        }

        sent += json?.sent || 0;
        failed += json?.failed || 0;
        done = !!json?.done || json?.next_offset == null;
        offset = done ? offset : json.next_offset;

        const { error: progErr } = await supabase.rpc('newsletter_email_progress', {
          p_post: job.post_id, p_next_offset: offset, p_done: done,
        });
        if (progErr) throw new Error(`progress: ${progErr.code} ${progErr.message}`);
      }

      if (!done) break; // out of time; the next run carries on
    }

    console.log(`[email-new-updates] posts ${posts}, sent ${sent}, failed ${failed}`);
    await recordRun(JOB, { ok: true, items: sent, detail: failed ? { failed } : null, startedAt: started });
    return { statusCode: 200, body: JSON.stringify({ ok: true, posts, sent, failed }) };
  } catch (e) {
    console.error('[email-new-updates] failed:', e.message);
    await recordRun(JOB, { ok: false, error: e.message, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
