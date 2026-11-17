/**
 * netlify/functions/daily-spotlight.js
 *
 * Runs daily at 00:05 UTC via netlify.toml schedule.
 * Gives every active listener (seen in the last 60 days) up to three Artists of
 * the Day they have not heard, written to daily_artist_spotlight for the home
 * page to read.
 *
 * The work is one database call: public.generate_daily_spotlight(date, per_day)
 * (migration generate_daily_spotlight). It picks, best first, artists the
 * listener has never streamed and never been shown, then never streamed, then
 * anyone; each listener sees the pool in their own order for the day.
 *
 * It used to do this here, three round trips to the database per listener. With
 * a few hundred listeners that took longer than the 30 seconds Netlify gives a
 * scheduled function, so the run was cut off before it could record itself and
 * the watchdog reported it overdue every day. In the database it takes well
 * under a second.
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js');
const { recordRun } = require('../lib/jobRun');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// The name in netlify.toml and in job_expectations, so the schedule, the run
// record and the watchdog all refer to the same thing.
const JOB = 'daily-spotlight';

// Must match SPOTLIGHT_PER_DAY in src/pages/HomePage.js.
const SPOTLIGHT_PER_DAY = 3;

exports.handler = async (event) => {
  const started = Date.now();
  // Worked out on every run, not when the module loads: a warm function can be
  // reused the next day, and a date fixed at load time would still say yesterday.
  const today = new Date().toISOString().split('T')[0];
  const isManual = event && event.httpMethod === 'POST';
  console.log(`Daily spotlight running for ${today} (${isManual ? 'manual' : 'scheduled'})`);

  try {
    const { data, error } = await supabase.rpc('generate_daily_spotlight', {
      p_date: today,
      p_per_day: SPOTLIGHT_PER_DAY,
    });
    if (error) throw new Error(error.message);

    const assigned = Number(data && data.assigned) || 0;
    const eligible = Number(data && data.eligible) || 0;
    console.log(`Spotlight complete. Assigned: ${assigned} across ${eligible} listeners`);
    await recordRun(JOB, {
      ok: true,
      items: assigned,
      detail: { eligible, date: today },
      startedAt: started,
    });
    return { statusCode: 200, body: JSON.stringify({ success: true, date: today, assigned, eligible }) };
  } catch (err) {
    console.error('Daily spotlight error:', err);
    await recordRun(JOB, { ok: false, error: err.message, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
