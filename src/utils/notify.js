/**
 * notify.js
 *
 * One reporter for every notification write in the client.
 *
 *
 * WHY THIS EXISTS
 *
 * Every notification insert in this codebase looked like one of these:
 *
 *   await supabase.from('notifications').insert({ ... });
 *   await supabase.from('notifications').insert({ ... }).catch(() => {});
 *   await supabase.from('notifications').insert({ ... }).then(() => {});
 *
 * None of the three reads the error, and the second and third are worse than
 * the first because they look like they do. supabase-js does not throw. It
 * resolves `{ data, error }`. A `.catch()` on it never fires for a database
 * error — only for a network failure — so `.catch(() => {})` is a comment that
 * compiles.
 *
 * That is how six notification types were being rejected by
 * notifications_type_check for months with no trace anywhere: artist_thought,
 * wheel_winner, wheel_challenge, challenge_xp, admin_reminder and bug_reply.
 * Postgres said 23514 every single time. Nobody was listening.
 *
 * Migration 88 widens the constraint. This file is the half that stops it
 * happening again — a new type that isn't in the vocabulary now says so, in the
 * console, the first time it is sent.
 *
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not throw, and it does not surface anything to the user. A failed
 * notification should not fail the action that triggered it: an artist whose
 * follow succeeded should not see an error because the follower's bell didn't
 * update. So callers can keep using it exactly where the old fire-and-forget
 * insert was, without adding error branches.
 *
 * It returns `{ error }` for the small number of callers that do want to know.
 *
 * Batches matter here. A CHECK violation fails the whole INSERT statement, so
 * one bad type in a batch of 100 loses all 100 rows — which is precisely what
 * happened every Sunday to the competition-result broadcast. When `rows` is an
 * array the log says how many were lost, because "an insert failed" and "5,000
 * people were not told who won" deserve different reactions.
 */

/**
 * @param label   short description of the call site, e.g. 'new_follower (profile)'
 * @param promise the un-awaited supabase insert chain
 * @returns Promise<{ error }>
 */
export function reportNotify(label, promise) {
  return Promise.resolve(promise)
    .then((result) => {
      const error = result?.error;
      if (error) {
        console.error(
          `[notify] ${label} failed:`,
          error.code || '(no code)',
          error.message || '',
          error.details || '',
          error.hint || ''
        );
        // 23514 is a CHECK violation, which for this table means the type is
        // not in notifications_type_check. Say so plainly, because the raw
        // message names the constraint and not the cause.
        if (error.code === '23514') {
          console.error(
            `[notify] ${label}: the notification type is not permitted by ` +
            `notifications_type_check. Add it in a migration — see ` +
            `supabase/migrations/88_notification_types.sql. Nothing was written.`
          );
        }
        if (error.code === '42501') {
          console.error(
            `[notify] ${label}: blocked by row level security on notifications. ` +
            `Nothing was written.`
          );
        }
      }
      return { error: error || null };
    })
    .catch((err) => {
      // Only reachable for a genuine network/transport failure.
      console.error(`[notify] ${label} threw:`, err);
      return { error: err };
    });
}

/**
 * The same thing for a batch, so the log can say how many rows went missing.
 *
 * Call it with the rows and a function that performs the insert, rather than
 * with the promise, so the count is available without reaching into the chain:
 *
 *   await reportNotifyBatch('wheel_winner', rows, r =>
 *     supabase.from('notifications').insert(r));
 */
export function reportNotifyBatch(label, rows, insertFn) {
  const count = Array.isArray(rows) ? rows.length : 1;
  return reportNotify(`${label} (${count} row${count === 1 ? '' : 's'})`, insertFn(rows));
}

export default reportNotify;