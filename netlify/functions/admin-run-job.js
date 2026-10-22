/**
 * netlify/functions/admin-run-job.js
 *
 * Run a scheduled job now, as an admin.
 *
 *
 * WHY THIS HAS TO EXIST
 *
 * Once a function is declared with its own table in netlify.toml:
 *
 *     [functions."compute-recommendations"]
 *       schedule = "30 3,15 * * *"
 *
 * Netlify registers it as scheduled and stops answering HTTP on it. A POST to
 * it from the browser comes back 403 Forbidden, before a single line of the
 * function's own code runs, so its cooldown guard and its CRON_SECRET header
 * never get a say. There is no "run now" button in the Netlify UI for a
 * scheduled function either.
 *
 * That left exactly two ways to run one of these by hand: wait for the cron,
 * or deploy a change to make it unscheduled and then undo it. The first cost
 * half a day when a job was found broken at nine in the morning. The second
 * is how a schedule gets left switched off by accident.
 *
 * So this is an ordinary function, not scheduled, which requires the caller
 * through its own handler.
 *
 *
 * WHY IT IS NOT A GENERAL PURPOSE RUNNER
 *
 * ALLOWED is a fixed list in this file, not a parameter that gets `require`d.
 * A caller cannot name an arbitrary path, and nothing outside the list can be
 * reached even by an admin. The jobs on it are the ones that only compute and
 * write derived rows. Nothing that sends an email, moves money or pays anyone
 * is on it, and nothing should be added to it that does: those have real
 * consequences when run twice, and this endpoint exists to be run twice.
 *
 *
 * WHO CAN CALL IT
 *
 * A signed-in user whose id is in the admins table, checked server side with
 * the service role key. Not a header secret: a secret pasted into a browser
 * console is a secret in somebody's clipboard, and this is a button an admin
 * presses from a page where they are already signed in.
 */

const { createClient } = require('@supabase/supabase-js');

// Derived-data jobs only. Read the note above before adding to this.
const ALLOWED = {
  'compute-recommendations':   () => require('./compute-recommendations'),
  'compute-behavior-profiles': () => require('./compute-behavior-profiles'),
  'update-engagement-scores':  () => require('./update-engagement-scores'),
  'daily-spotlight':           () => require('./daily-spotlight'),
  'rotate-featured':           () => require('./rotate-featured'),
};

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let job;
  try {
    job = String(JSON.parse(event.body || '{}').job || '');
  } catch {
    return json(400, { error: 'invalid_body' });
  }

  if (!Object.prototype.hasOwnProperty.call(ALLOWED, job)) {
    return json(400, { error: 'unknown_job', allowed: Object.keys(ALLOWED) });
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return json(401, { error: 'sign_in_required' });

  const { data: { user } = {} } = await admin.auth.getUser(token);
  if (!user) return json(401, { error: 'sign_in_required' });

  const { data: isAdmin, error: adminErr } = await admin
    .from('admins').select('user_id').eq('user_id', user.id).maybeSingle();

  if (adminErr) {
    console.error('[admin-run-job] admin lookup failed:', adminErr.code, adminErr.message);
    return json(500, { error: 'lookup_failed' });
  }
  if (!isAdmin) {
    console.warn('[admin-run-job] refused:', user.id, 'is not an admin, asked for', job);
    return json(403, { error: 'admins_only' });
  }

  console.log('[admin-run-job]', user.id, 'running', job);
  const started = Date.now();

  try {
    const mod = ALLOWED[job]();
    // The job is handed the same shape Netlify hands it, with the POST method
    // its own code reads as "this was a manual run", and the cron secret if
    // one is configured, so its internal cooldown does not refuse a run an
    // admin has deliberately asked for.
    const result = await mod.handler({
      httpMethod: 'POST',
      headers: process.env.CRON_SECRET ? { 'x-cron-secret': process.env.CRON_SECRET } : {},
      body: '{}',
    });

    return json(200, {
      ok: true,
      job,
      ranForMs: Date.now() - started,
      // Passed straight through rather than interpreted. What the job
      // considers success is the job's business, and job_runs is where the
      // real answer is recorded either way.
      status: result && result.statusCode,
      body: result && typeof result.body === 'string' ? result.body.slice(0, 2000) : null,
    });
  } catch (err) {
    console.error('[admin-run-job]', job, 'threw:', err && err.message, err && err.stack);
    return json(500, { ok: false, job, error: err && err.message });
  }
};