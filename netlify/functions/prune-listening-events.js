/**
 * prune-listening-events.js
 *
 * Daily at 04:00 UTC, after compute-recommendations (03:30) so a prune
 * never removes rows the nightly scoring run is about to read.
 *
 * listening_events is append-only and written on every track change across
 * every surface, so it will be the highest-volume table on the platform.
 * Session queries look at minutes and the nightly profile job looks at
 * days, so anything past 30 days is dead weight.
 *
 * The retention window lives in prune_listening_events() in migration 62,
 * not here, so it is changed in one place.
 */

const { createClient } = require('@supabase/supabase-js');
const { recordRun } = require('../lib/jobRun');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// The name in netlify.toml and in job_expectations, so the schedule, the run
// record and the watchdog all refer to the same thing.
const JOB = 'prune-listening-events';

// Same two-layer guard as the other cron endpoints. A valid secret runs
// immediately, anything else is capped to one run per hour. Netlify's
// scheduler cannot attach headers, so a secret-only check would silently
// kill the schedule.
const CRON_SECRET      = process.env.CRON_SECRET || '';
const COOLDOWN_MINUTES = 60;
const RUN_KEY          = 'prune_events_last_run';

exports.handler = async (event) => {
  const started = Date.now();
  const h = event.headers || {};
  const provided = h['x-cron-secret'] || h['X-Cron-Secret'] || '';
  const authorised = CRON_SECRET && provided === CRON_SECRET;

  if (!authorised) {
    const { data } = await supabase.from('platform_settings')
      .select('value').eq('key', RUN_KEY).maybeSingle();
    const last = data?.value ? Date.parse(data.value) : 0;
    if (last && (Date.now() - last) / 60000 < COOLDOWN_MINUTES) {
      return { statusCode: 429, body: JSON.stringify({ error: 'Cooldown active' }) };
    }
  }

  await supabase.from('platform_settings').upsert(
    { key: RUN_KEY, value: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );

  try {
    const { data, error } = await supabase.rpc('prune_listening_events');
    if (error) throw error;
    console.log(`[prune-events] removed ${data} rows older than 30 days`);
    // Rows removed is the number worth watching. Zero is normal on a quiet
    // day and expected while the table is young; zero for a fortnight once
    // there is traffic means the prune is not reaching anything.
    await recordRun(JOB, { ok: true, items: Number(data) || 0, startedAt: started });
    return { statusCode: 200, body: JSON.stringify({ ok: true, deleted: data }) };
  } catch (err) {
    console.error('[prune-events] failed:', err.message);
    await recordRun(JOB, { ok: false, error: err.message, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};