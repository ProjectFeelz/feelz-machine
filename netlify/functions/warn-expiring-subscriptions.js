// netlify/functions/warn-expiring-subscriptions.js
//
// Tells people a week before their plan ends.
//
// expire-subscriptions.js flips the row and drops the tier on the day, with no
// warning at all. That was harmless while every admin grant ran to 2027. It is
// not now: seven artists lose premium on 12 November, on the same morning, and
// the first they would know about it is a feature missing.
//
// Runs AFTER expire-subscriptions, which is on "0 1 * * *". Order matters only
// slightly, since the SQL already excludes anything whose expiry has passed,
// but running second means a row that expires today is expired rather than
// warned about an expiry that has already happened.
//
// WHAT IT DOES NOT WARN ABOUT
//
// A live PayPal subscription. Its expires_at is the NEXT BILLING DATE, pushed
// out one period every time PAYMENT.SALE.COMPLETED arrives, not an end date.
// The first version of this would have told a paying subscriber their plan was
// ending four days before it renewed, which is worse than saying nothing.
// warn_expiring_subscriptions only looks at admin grants. See migration 233b.
//
// Idempotent: each row carries expiry_warning_sent_at and is only ever warned
// once, so a retry, a double run or a manual invocation sends nothing extra.

const { createClient } = require('@supabase/supabase-js');
const { recordRun } = require('../lib/jobRun');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// How far ahead to warn. Seven days is the notice; changing this changes only
// how early, never whether somebody is warned twice.
const WARN_DAYS = 7;

// The name in netlify.toml and in job_expectations, so the schedule, the run
// record and the watchdog all refer to the same thing.
const JOB = 'warn-expiring-subscriptions';

exports.handler = async (event) => {
  const started = Date.now();
  // Same guard as expire-subscriptions: Netlify will not route a public
  // request to a function that carries a schedule, so this only has to
  // challenge a manual run. The scheduler sends no headers.
  if (event?.headers?.['x-manual-run']
      && event.headers['x-internal-secret'] !== process.env.INTERNAL_FUNCTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    const { data, error } = await supabase.rpc('warn_expiring_subscriptions', {
      p_days: WARN_DAYS,
    });

    if (error) {
      console.error('[warn-expiring-subscriptions] failed:', error.code, error.message);
      await recordRun(JOB, { ok: false, error: `${error.code} ${error.message}`, startedAt: started });
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    const summary = (data || []).reduce((acc, r) => ({ ...acc, [r.kind]: r.warned }), {});
    const total = Object.values(summary).reduce((a, b) => a + b, 0);

    // Logged every run, including the quiet ones. A job that only speaks when
    // it does something is indistinguishable from a job that has stopped
    // running, and this one is allowed to be quiet for weeks at a time.
    console.log('[warn-expiring-subscriptions] done —',
      total ? JSON.stringify(summary) : `nobody expiring within ${WARN_DAYS} days`);

    // Quiet days are normal: most days nobody is seven days from an expiry.
    await recordRun(JOB, { ok: true, items: total, detail: total ? summary : null, startedAt: started });

    return { statusCode: 200, body: JSON.stringify({ ok: true, warned: summary }) };
  } catch (err) {
    console.error('[warn-expiring-subscriptions] threw:', err.message);
    await recordRun(JOB, { ok: false, error: err.message, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};