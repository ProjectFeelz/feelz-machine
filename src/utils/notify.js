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

/**
 * sendNotification
 *
 * THE way to notify somebody else. Use this instead of
 * supabase.from('notifications').insert({...}) for anything addressed to
 * another person, which in practice is all of them.
 *
 *
 * WHY A FUNCTION AND NOT AN INSERT
 *
 * The INSERT policy on notifications is:
 *
 *   WITH CHECK ( auth.uid() = user_id
 *                OR artist_id IN (SELECT id FROM artists WHERE user_id = auth.uid()) )
 *
 * which permits ONLY a notification addressed to yourself or belonging to your
 * own artist profile. Every notification this app sends is the opposite — it
 * is addressed to somebody else about something the sender just did. So every
 * direct insert returns 403, and reportNotify has been faithfully logging
 * "blocked by row level security" ever since it was added.
 *
 * The policy is right. Without it anyone could write anything into anyone's
 * bell. Asking the client to insert was the mistake.
 *
 * send_notification (migration 106) does the write with definer rights after
 * checking a type whitelist, that the recipient exists, that you are not
 * notifying yourself, that the type is not one a trigger already sends, and a
 * 60-per-hour rate limit stamped from auth.uid() rather than from anything the
 * client claims.
 *
 * It never throws and never surfaces to the user, same as reportNotify: a
 * failed notification must not fail the action that caused it. A refusal is
 * logged with its reason, because "rate_limited" and "type_not_allowed" need
 * different fixes and neither should be invisible.
 *
 *   await sendNotification(supabase, 'top supporter', {
 *     type:      'top_supporter',
 *     artistId:  track.artist_id,
 *     title:     `${name} is your top supporter`,
 *     message:   '...',
 *     metadata:  { play_count: 42 },
 *   });
 */
export async function sendNotification(supabase, label, {
  type, artistId = null, recipientUserId = null,
  title = null, message = null, metadata = {}, trackId = null,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('send_notification', {
      p_type:              type,
      p_artist_id:         artistId,
      p_recipient_user_id: recipientUserId,
      p_title:             title,
      p_message:           message,
      p_metadata:          metadata || {},
      p_track_id:          trackId,
    });

    if (error) {
      console.error(`[notify] ${label} RPC failed:`, error.code || '', error.message || '');
      if (error.code === 'PGRST202') {
        console.error(
          `[notify] ${label}: send_notification does not exist on this database. ` +
          `Run supabase/migrations/106_send_notification.sql.`
        );
      }
      return { sent: false, error };
    }

    if (!data?.sent) {
      // already_sent is the one-shot unique indexes working as designed, and
      // self_notification is usually a legitimate no-op (you liked your own
      // track). Neither is worth an error.
      const quiet = data?.reason === 'already_sent' || data?.reason === 'self_notification';
      const log = quiet ? console.debug : console.warn;
      log(`[notify] ${label} not sent: ${data?.reason || 'unknown'}`, data?.detail || '');
      return { sent: false, reason: data?.reason, error: null };
    }

    return { sent: true, id: data.id, error: null };
  } catch (err) {
    // Genuine transport failure only.
    console.error(`[notify] ${label} threw:`, err);
    return { sent: false, error: err };
  }
}

/**
 * sendStreamDigest
 *
 * The artist's one "N streams today" notification. Create-or-update happens on
 * the server (send_stream_digest, migration 106) for two reasons: the row
 * belongs to the artist while the caller is a listener, so both the insert and
 * the update were being rejected by row level security; and find-or-update
 * from the client has a race in the middle, so two listeners streaming in the
 * same second could each create a digest for the same day.
 */
export async function sendStreamDigest(supabase, label, {
  artistId, title = null, message = null, metadata = {}, trackId = null,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('send_stream_digest', {
      p_artist_id: artistId,
      p_title:     title,
      p_message:   message,
      p_metadata:  metadata || {},
      p_track_id:  trackId,
    });

    if (error) {
      console.error(`[notify] ${label} RPC failed:`, error.code || '', error.message || '');
      if (error.code === 'PGRST202') {
        console.error(
          `[notify] ${label}: send_stream_digest does not exist on this database. ` +
          `Run supabase/migrations/106_send_notification.sql.`
        );
      }
      return { sent: false, error };
    }

    if (!data?.sent) {
      // self_stream is a legitimate no-op: an artist playing their own track.
      const quiet = data?.reason === 'self_stream';
      (quiet ? console.debug : console.warn)(
        `[notify] ${label} not sent: ${data?.reason || 'unknown'}`
      );
      return { sent: false, reason: data?.reason, error: null };
    }

    return { sent: true, id: data.id, updated: !!data.updated, error: null };
  } catch (err) {
    console.error(`[notify] ${label} threw:`, err);
    return { sent: false, error: err };
  }
}

/**
 * sendArtistBroadcast
 *
 * One call for "tell my followers". Used by the post composer and by both
 * artist DM panels — all three of which were batch-inserting straight into
 * notifications, which the INSERT policy refuses, so none of them has ever
 * delivered anything. PostComposer's own catch guessed at the cause: "table
 * may not exist yet".
 *
 * Recipients are resolved server-side against the artist's real followers, so
 * `recipients` narrows the list and can never widen it. Pass null for
 * everybody. See migration 108.
 */
export async function sendArtistBroadcast(supabase, label, {
  type, title, message = null, metadata = {}, recipients = null,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('send_artist_broadcast', {
      p_type:       type,
      p_title:      title,
      p_message:    message,
      p_metadata:   metadata || {},
      p_recipients: recipients,
    });

    if (error) {
      console.error(`[notify] ${label} RPC failed:`, error.code || '', error.message || '');
      if (error.code === 'PGRST202') {
        console.error(
          `[notify] ${label}: send_artist_broadcast does not exist on this database. ` +
          `Run supabase/migrations/108_artist_broadcast.sql.`
        );
      }
      return { sent: 0, error };
    }

    // sent: 0 is not necessarily a failure — an artist with no followers, or a
    // recipient list that turned out to contain nobody who follows them.
    if (!data?.sent) {
      console.warn(`[notify] ${label} reached nobody: ${data?.reason || 'no followers'}`, data?.detail || '');
      return { sent: 0, reason: data?.reason, error: null };
    }

    return { sent: data.sent, error: null };
  } catch (err) {
    console.error(`[notify] ${label} threw:`, err);
    return { sent: 0, error: err };
  }
}

/**
 * sendAdminBroadcast
 *
 * A platform announcement to every artist. Admin-only, and the check is the
 * admins table server-side rather than anything the client claims.
 *
 * Replaces AdminBroadcast's 100-row client batches, which the notifications
 * INSERT policy refused — so no announcement has ever been delivered. See
 * migration 108.
 */
export async function sendAdminBroadcast(supabase, label, {
  type = 'announcement', title, message = null, metadata = {}, artistIds = null,
} = {}) {
  try {
    const { data, error } = await supabase.rpc('send_admin_broadcast', {
      p_type:       type,
      p_title:      title,
      p_message:    message,
      p_metadata:   metadata || {},
      p_artist_ids: artistIds,
    });

    if (error) {
      console.error(`[notify] ${label} RPC failed:`, error.code || '', error.message || '');
      if (error.code === 'PGRST202') {
        console.error(
          `[notify] ${label}: send_admin_broadcast does not exist on this database. ` +
          `Run supabase/migrations/108_artist_broadcast.sql.`
        );
      }
      return { sent: 0, error };
    }

    if (!data?.sent) {
      console.warn(`[notify] ${label} reached nobody: ${data?.reason || 'no artists'}`, data?.detail || '');
      return { sent: 0, reason: data?.reason, error: null };
    }

    return { sent: data.sent, error: null };
  } catch (err) {
    console.error(`[notify] ${label} threw:`, err);
    return { sent: 0, error: err };
  }
}

export default reportNotify;