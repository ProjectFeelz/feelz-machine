/**
 * netlify/lib/jobRun.js
 *
 * One line at the end of a scheduled job, so that job can be seen.
 *
 *
 * WHY THIS EXISTS
 *
 * Four silent failures turned up on the same day. A PayPal webhook subscribed
 * to eight events and none of the payment ones, so no subscription ever
 * renewed and no affiliate was ever paid. Nineteen functions declared under a
 * config key Netlify does not read, so none of them were scheduled at all.
 * An email library that could not send because the sending domain was never
 * verified. And an engagement drip that fired on time twice a week and
 * returned 401 to itself in three milliseconds.
 *
 * Not one of them logged anything a person would see. Netlify's function log
 * is real-time only, so by the time anybody suspects a problem the evidence is
 * already gone.
 *
 * The thing they have in common is that "ran and did nothing" looks exactly
 * like "never ran". This makes them different, in a table that survives.
 *
 *
 * HOW TO USE IT
 *
 *   const { recordRun } = require('../lib/jobRun');
 *
 *   exports.handler = async () => {
 *     const started = Date.now();
 *     try {
 *       const n = await doTheWork();
 *       await recordRun('my-job', { ok: true, items: n, startedAt: started });
 *       return { statusCode: 200, body: '...' };
 *     } catch (err) {
 *       await recordRun('my-job', { ok: false, error: err.message, startedAt: started });
 *       throw err;
 *     }
 *   };
 *
 * `items` is the number that matters. Zero is a fine answer on a quiet day.
 * Zero for a fortnight is the thing nobody noticed for three months.
 *
 *
 * IT NEVER THROWS
 *
 * A job must not fail because its bookkeeping failed. Every error in here is
 * logged and swallowed, which is the one place that rule is right: this writes
 * a record about work, it is not the work.
 */

const { createClient } = require('@supabase/supabase-js');

let client = null;
function db() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return client;
}

/**
 * @param {string} job   the name in netlify.toml, so the two can be compared
 * @param {object} opts  { ok, items, detail, error, startedAt }
 *                       startedAt accepts a Date, an ISO string, or Date.now()
 */
async function recordRun(job, opts = {}) {
  const {
    ok = true,
    items = 0,
    detail = null,
    error = null,
    startedAt = null,
  } = opts;

  let started = null;
  if (startedAt instanceof Date) started = startedAt.toISOString();
  else if (typeof startedAt === 'number') started = new Date(startedAt).toISOString();
  else if (typeof startedAt === 'string') started = startedAt;

  try {
    const { error: rpcErr } = await db().rpc('record_job_run', {
      p_job:        job,
      p_ok:         Boolean(ok),
      p_items:      Number.isFinite(Number(items)) ? Math.trunc(Number(items)) : 0,
      p_detail:     detail,
      p_error:      error ? String(error).slice(0, 2000) : null,
      p_started_at: started,
    });
    if (rpcErr) {
      console.error(`[jobrun] ${job}: could not record the run:`, rpcErr.code, rpcErr.message);
    }
  } catch (err) {
    console.error(`[jobrun] ${job}: recording threw:`, err && err.message ? err.message : err);
  }
}

/**
 * Sugar for the common shape, so a handler can be wrapped rather than edited
 * in two places. The inner function returns either a number, which is taken as
 * the item count, or an object { items, detail }.
 */
function withRunRecord(job, fn) {
  return async (...args) => {
    const started = Date.now();
    try {
      const out = await fn(...args);
      const result = typeof out === 'number' ? { items: out } : (out || {});
      await recordRun(job, {
        ok: true,
        items: result.items || 0,
        detail: result.detail || null,
        startedAt: started,
      });
      return result.response !== undefined ? result.response : out;
    } catch (err) {
      await recordRun(job, {
        ok: false,
        error: err && err.message ? err.message : String(err),
        startedAt: started,
      });
      throw err;
    }
  };
}

module.exports = { recordRun, withRunRecord };