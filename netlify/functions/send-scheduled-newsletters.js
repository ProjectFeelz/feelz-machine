// netlify/functions/send-scheduled-newsletters.js
//
// Runs every 5 minutes (netlify.toml). Publishes every newsletter draft whose
// scheduled time has passed, through send_due_newsletters() (migration 157),
// which does exactly what the Send button does: in-app only, no email.
//
// Takes no input and returns nothing sensitive. Running it early or twice is
// harmless: it only ever sends drafts that are due and not yet sent, and each
// draft is locked while it is being sent so two runs cannot both send it.

const { createClient } = require('@supabase/supabase-js');
const { recordRun } = require('../lib/jobRun');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// The name in netlify.toml and in job_expectations, so the schedule, the run
// record and the watchdog all refer to the same thing.
const JOB = 'send-scheduled-newsletters';

exports.handler = async () => {
  const started = Date.now();
  try {
    const { data, error } = await supabase.rpc('send_due_newsletters');
    if (error) {
      // 42883 / PGRST202: migration 157 has not been run yet.
      console.error('[scheduled-newsletters] failed:', error.code, error.message);
      await recordRun(JOB, { ok: false, error: `${error.code} ${error.message}`, startedAt: started });
      return { statusCode: 500, body: JSON.stringify({ ok: false }) };
    }
    const rows = data || [];
    rows.forEach(r => console.log('[scheduled-newsletters]', r.draft_id, r.outcome));
    const sent = rows.filter(r => r.outcome === 'sent').length;
    const problems = rows.filter(r => r.outcome !== 'sent').length;
    // Running every five minutes, almost every run has nothing due, so zero
    // is the normal answer here and only a long stretch of it alongside
    // queued drafts means anything.
    await recordRun(JOB, { ok: true, items: sent, detail: problems ? { problems } : null, startedAt: started });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, sent, problems }),
    };
  } catch (e) {
    console.error('[scheduled-newsletters] threw:', e.message);
    await recordRun(JOB, { ok: false, error: e.message, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};