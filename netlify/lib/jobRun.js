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

/**
 * Wrap an existing Netlify handler so its runs are recorded, without touching
 * a line of what it does.
 *
 *
 * WHY THIS EXISTS SEPARATELY FROM withRunRecord
 *
 * withRunRecord wants the inner function to return a count. Thirteen of the
 * scheduled functions on this platform predate that convention: they each have
 * one handler with five or six different return points, and threading a
 * recordRun through all of them means editing working jobs in a dozen places
 * for a bookkeeping change. That is how a payout job or a weekly report gets
 * broken by an edit that was supposed to be inert.
 *
 * This wraps instead. The handler is untouched; its answer is read on the way
 * out and turned into a run record:
 *
 *   exports.handler = wrapHandler('weekly-artist-report', handler);
 *
 * Two lines per file, no change to any code path.
 *
 *
 * WHAT IT RECORDS
 *
 *   ok      from the HTTP status the handler returned. Under 400 is a success,
 *           which is the same judgement Netlify itself makes.
 *   items   the first number that looks like a count in the JSON body, so a
 *           handler already returning { sent: 12 } or { deleted: 3 } gets a
 *           meaningful figure without being asked to change its shape.
 *   error   the message when it throws, and the throw is passed on unchanged
 *           so Netlify still sees the failure.
 *
 * Like everything else here it never throws on its own account: a job must not
 * fail because the record of it failed.
 */
// ── Finding the count, and why an exact list of names did not work ──────────
//
// This was a fixed list of twelve key names. Measured against what the thirteen
// wrapped jobs actually return, it found the count in four of them.
//
// The one that mattered: engagement-drip-cron returns
// { success: true, totalSent, segments, runAt }. `totalSent` is not `sent`, so
// every run recorded items 0. The drip was working the whole time. On 2
// November it fired at 08:00:57 and nine engagement notifications landed at
// 08:01:25, and the run record said it had done nothing. check-job-health read
// that nothing, called the job silent, and emailed about it. Five of those
// emails went out about a job that was doing its work correctly.
//
// So the match is on the SHAPE of a key name rather than a list of exact ones.
// `totalSent`, `total_active_users`, `trackCount`, `emails_sent` and `artists`
// are all obviously counts to a reader, and a list of literal names will never
// keep up with the next one somebody writes.
//
// Two rules that the old version got wrong as well:
//
//   Booleans are not counts. `skipped` was on the old list and
//   monthly-wrapped returns { skipped: true, reason }, so Number(true) gave a
//   tidy items 1 for a run that deliberately did nothing. A boolean now counts
//   as no count at all.
//
//   `skipped` is not a count of work either way, so it is gone from the words
//   below. A job that skipped did nothing, and 0 is the honest number.
const COUNT_KEYS = [
  'items', 'count', 'sent', 'processed', 'deleted', 'created', 'updated',
  'notified', 'released', 'scored', 'total',
];

// Whole words a count-ish key ends with, tested after stripping anything that
// is not a letter and lowercasing: totalSent and total_sent both become
// "totalsent", which ends with "sent".
const COUNT_WORDS = [
  'items', 'count', 'total', 'sent', 'processed', 'deleted', 'created',
  'updated', 'notified', 'released', 'scored', 'rows', 'emails', 'messages',
  'eligible', 'artists', 'posts', 'entries', 'venues', 'tracks',
];

function countish(key) {
  const k = String(key).replace(/[^A-Za-z]/g, '').toLowerCase();
  return COUNT_WORDS.some(w => k === w || k.endsWith(w));
}

// A number, or the length of an array. Explicitly NOT a boolean: `true` is not
// one of anything.
function numberFrom(v) {
  if (Array.isArray(v)) return v.length;
  if (typeof v === 'boolean') return null;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function countFrom(result) {
  try {
    if (!result || typeof result.body !== 'string') return 0;
    const parsed = JSON.parse(result.body);
    if (!parsed || typeof parsed !== 'object') return 0;

    // The exact names first, in order, so a body carrying several of them
    // reports the same figure it always did.
    for (const k of COUNT_KEYS) {
      const n = numberFrom(parsed[k]);
      if (n !== null) return n;
    }

    // Then anything that reads like a count, in the order the body lists it.
    for (const k of Object.keys(parsed)) {
      if (!countish(k)) continue;
      const n = numberFrom(parsed[k]);
      if (n !== null) return n;
    }

    return 0;
  } catch {
    // A body that is not JSON is perfectly normal. It means no count, not a
    // problem worth reporting.
    return 0;
  }
}

function wrapHandler(job, handler) {
  return async (...args) => {
    const started = Date.now();
    try {
      const result = await handler(...args);
      const status = Number(result && result.statusCode);

      // 429 is not a failed run. It is a refused duplicate.
      //
      // Several of these jobs guard themselves with a cooldown, because their
      // URL is publicly reachable and each run does thousands of writes. The
      // guard answers 429 when an identical run has just happened.
      //
      // Netlify fires a scheduled function more than once. update-engagement-
      // scores proved it on two consecutive nights: a run at 02:00:50 that
      // scored 135 tracks and returned 200, then a second invocation thirteen
      // seconds later that the cooldown refused. Recording that refusal as a
      // failure made the night look failed when the work had been done, and the
      // watchdog emailed about it.
      //
      // So a 429 writes no row at all, which is the truthful record: that
      // invocation did no work and there is already a row for the one that did.
      // Nothing is hidden by this. check-job-health reports `overdue` on the
      // absence of a SUCCESSFUL run inside max_gap_hours, so a job that is only
      // ever refused writes no success and is still caught, by the check that
      // is actually about the job not running.
      //
      // Only 429. A 401 or a 403 means the job could not authorise itself and
      // did nothing, which is exactly the silent failure this file exists to
      // make visible, and those are still recorded.
      if (status === 429) {
        console.warn(`[jobrun] ${job}: refused with 429, duplicate invocation, not recorded`);
        return result;
      }

      const ok = !Number.isFinite(status) || status < 400;
      await recordRun(job, {
        ok,
        items: ok ? countFrom(result) : 0,
        error: ok ? null : `returned ${status}: ${String((result && result.body) || '').slice(0, 300)}`,
        startedAt: started,
      });
      return result;
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

module.exports = { recordRun, withRunRecord, wrapHandler };