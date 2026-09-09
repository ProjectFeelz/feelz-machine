/**
 * netlify/lib/notify.js
 *
 * The server-side twin of src/utils/notify.js. Same reasoning, CommonJS, and
 * it logs rather than console.error-ing into a browser — these lines land in
 * the Netlify function log.
 *
 *
 * WHY IT LIVES OUTSIDE netlify/functions
 *
 * Netlify turns every top-level file in the functions directory into a
 * deployed endpoint. A shared helper in there would become a public HTTP
 * function with no handler, so it sits in netlify/lib instead and is pulled in
 * by esbuild when a function requires it.
 *
 *
 * WHY IT MATTERS MORE HERE THAN IN THE CLIENT
 *
 * The scheduled functions are the high-volume writers, and nobody is watching
 * a cron run. close-wheel-competition inserts the Sunday result for every
 * listener in batches of 100 and ended each batch with `.catch(() => {})`,
 * which cannot fire on a database error. When notifications_type_check rejected
 * 'wheel_winner', all 5,000 rows were refused, the function logged a cheerful
 * success, and no listener was told who won. For weeks.
 *
 * A rejected batch now prints the code, the message and the number of rows
 * that were lost.
 */

/**
 * @param {string} label   call-site description, e.g. 'wheel_winner broadcast'
 * @param {Promise} promise the un-awaited supabase insert chain
 * @returns {Promise<{error: any}>}
 */
async function reportNotify(label, promise) {
  try {
    const result = await promise;
    const error = result && result.error;
    if (error) {
      console.error(
        `[notify] ${label} FAILED:`,
        error.code || '(no code)',
        error.message || '',
        error.details || '',
        error.hint || ''
      );
      if (error.code === '23514') {
        console.error(
          `[notify] ${label}: notification type not permitted by ` +
          `notifications_type_check. Nothing was written. Add the type in a ` +
          `migration (see supabase/migrations/88_notification_types.sql).`
        );
      }
      if (error.code === '42501') {
        console.error(
          `[notify] ${label}: blocked by row level security on notifications. ` +
          `Nothing was written. The service role key may be missing.`
        );
      }
      return { error };
    }
    return { error: null };
  } catch (err) {
    console.error(`[notify] ${label} threw:`, err && err.message ? err.message : err);
    return { error: err };
  }
}

/**
 * Batch variant. The row count is the number that would be lost if the
 * statement is rejected, so it belongs in the log line.
 */
async function reportNotifyBatch(label, rows, insertFn) {
  const count = Array.isArray(rows) ? rows.length : 1;
  const { error } = await reportNotify(
    `${label} (${count} row${count === 1 ? '' : 's'})`,
    insertFn(rows)
  );
  if (error) {
    console.error(`[notify] ${label}: ${count} notification(s) were not delivered.`);
  }
  return { error, attempted: count, delivered: error ? 0 : count };
}

module.exports = { reportNotify, reportNotifyBatch };