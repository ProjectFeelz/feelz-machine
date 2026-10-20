/**
 * netlify/functions/check-job-health.js
 *
 * The job that watches the other jobs.
 *
 *
 * WHAT IT IS FOR
 *
 * Scheduled work on this platform has failed silently more than once, and in
 * every case the failure was invisible rather than loud: a webhook subscribed
 * to the wrong events, nineteen functions that were never registered as
 * scheduled, an email library that could not send, a drip returning 401 to
 * itself twice a week for three months. Netlify keeps no readable log history,
 * so nothing could be checked after the fact.
 *
 * job_runs fixes the record. This fixes the noticing. Once an hour it reads
 * job_health and tells somebody when a job is late, failing, or has gone quiet
 * for longer than it should.
 *
 *
 * THE THREE THINGS IT LOOKS FOR
 *
 *   overdue   no successful run inside max_gap_hours. The job is not running,
 *             whatever the dashboard says about it being scheduled.
 *   failing   it ran and reported ok = false.
 *   silent    it keeps succeeding and keeps doing nothing, for longer than
 *             max_idle_hours. This is the one that would have caught the drip:
 *             it was never late and never errored, it just produced zero
 *             messages every time.
 *
 *
 * WHY IT DOES NOT SHOUT EVERY HOUR
 *
 * A watchdog that repeats itself is a watchdog people mute, and a muted
 * watchdog is worse than none because it looks like cover. One notification
 * per job per day: the state is written into the notification's metadata, and
 * a job already reported in the last 24 hours is skipped until it changes or
 * the day rolls over.
 */

const { createClient } = require('@supabase/supabase-js');
const { recordRun } = require('../lib/jobRun');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JOB = 'check-job-health';

const describe = (r) => {
  if (r.status === 'overdue') {
    return r.last_success
      ? `No successful run for ${r.hours_since_success} hours. It should run at least every ${r.max_gap_hours}.`
      : `This job has never recorded a successful run.`;
  }
  if (r.status === 'failing') {
    return `The last run reported a failure: ${r.last_error || 'no detail recorded'}`;
  }
  if (r.status === 'silent') {
    return `Running on schedule but producing nothing. Last time it actually did any work was `
         + `${r.last_did_work ? new Date(r.last_did_work).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'never'}.`;
  }
  return r.status;
};

exports.handler = async (event) => {
  // Same guard shape as the other scheduled functions: Netlify will not route
  // an external request to a scheduled function, so this only has to cover a
  // deliberate manual run.
  if (event?.headers?.['x-manual-run']
      && event.headers['x-internal-secret'] !== process.env.INTERNAL_FUNCTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const started = Date.now();

  try {
    const { data: health, error } = await supabase
      .from('job_health')
      .select('*')
      .eq('enabled', true);

    if (error) {
      console.error('[job-health] could not read job_health:', error.code, error.message);
      await recordRun(JOB, { ok: false, error: error.message, startedAt: started });
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    const bad = (health || []).filter(r => r.status !== 'ok');

    if (bad.length === 0) {
      console.log('[job-health] all jobs healthy');
      await recordRun(JOB, { ok: true, items: 0, detail: { checked: (health || []).length }, startedAt: started });
      return { statusCode: 200, body: JSON.stringify({ ok: true, checked: (health || []).length, problems: 0 }) };
    }

    // Who hears about it. Every platform admin, because this is operational
    // rather than personal and the person who can fix it is whoever is around.
    const { data: admins, error: adminErr } = await supabase.from('admins').select('user_id');
    if (adminErr) console.error('[job-health] admin lookup failed:', adminErr.code, adminErr.message);
    const adminIds = (admins || []).map(a => a.user_id).filter(Boolean);

    // Already told them today? Read back what this job has reported in the
    // last 24 hours and skip anything whose state has not changed.
    const { data: recent } = await supabase
      .from('notifications')
      .select('metadata, created_at')
      .eq('type', 'admin_message')
      .gte('created_at', new Date(Date.now() - 24 * 3600000).toISOString())
      .contains('metadata', { kind: 'job_health' });

    const alreadyToldAbout = new Set(
      (recent || [])
        .map(n => n.metadata && `${n.metadata.job}:${n.metadata.state}`)
        .filter(Boolean)
    );

    const toReport = bad.filter(r => !alreadyToldAbout.has(`${r.job}:${r.status}`));

    if (toReport.length && adminIds.length) {
      const rows = [];
      for (const r of toReport) {
        for (const uid of adminIds) {
          rows.push({
            user_id: uid,
            type: 'admin_message',
            title: `Scheduled job ${r.status}: ${r.job}`,
            message: describe(r),
            // Emailed, because the whole point is that nobody was looking at
            // the app when these failed.
            email_requested: true,
            metadata: {
              kind: 'job_health',
              job: r.job,
              state: r.status,
              last_run: r.last_run,
              last_success: r.last_success,
              hours_since_success: r.hours_since_success,
            },
          });
        }
      }
      const { error: notifErr } = await supabase.from('notifications').insert(rows);
      if (notifErr) {
        console.error('[job-health] could not write the alerts:', notifErr.code, notifErr.message,
          notifErr.code === '23514' ? '- admin_message is not an allowed notification type here.' : '');
      }
    }

    console.log('[job-health]', JSON.stringify({
      checked: (health || []).length,
      problems: bad.map(r => `${r.job}:${r.status}`),
      reported: toReport.length,
      admins: adminIds.length,
    }));

    await recordRun(JOB, {
      ok: true,
      items: toReport.length,
      detail: { problems: bad.map(r => ({ job: r.job, state: r.status })) },
      startedAt: started,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        checked: (health || []).length,
        problems: bad.map(r => ({ job: r.job, status: r.status })),
        reported: toReport.length,
      }),
    };
  } catch (err) {
    console.error('[job-health] threw:', err.message);
    await recordRun(JOB, { ok: false, error: err.message, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};