// src/utils/userRow.js
//
// One read of "the signed in person's row in table X", however many parts of
// the app ask for it.
//
// WHAT THIS IS FOR, MEASURED ON THE LIVE SITE
//
// Opening any page fires this, before the page's own data:
//
//   user_profiles      0ms ->  235ms
//   artists            1ms ->  234ms
//   listeners          2ms ->  225ms
//   admins             8ms ->  231ms
//   listeners          8ms ->  225ms
//   user_streaks       8ms ->  231ms
//   listeners         11ms ->  238ms
//   user_profiles     17ms -> 1888ms
//   artists           17ms -> 1954ms
//   listeners         17ms -> 1893ms
//   admins            19ms -> 1502ms
//   artist_tier_subs 235ms -> 2067ms
//   tracks           236ms -> 1959ms
//   tracks           237ms -> 2092ms
//   listeners        237ms -> 1706ms
//
// Two things to notice. `listeners` is read FIVE times and `admins` twice, for
// one person who has not moved yet. And the same tables appear in both a fast
// group at about 230ms and a slow group at about 1.9 seconds, which is the
// shape of requests queueing for a connection rather than of slow queries:
// the first handful get served, the rest wait their turn.
//
// So the fix is not a faster query. It is fewer of them.
//
// WHY A CACHE HERE RATHER THAN STATE IN AuthContext
//
// The three readers of `listeners` want different things from it. AuthContext
// wants the whole row, useAppThemeInit wants preferences.theme, useTier wants
// tier and tier_expires_at. Moving all three into one context value means
// rewiring who owns what, in the file that handles signing in, which is the
// last file in this codebase worth being clever in.
//
// This leaves every caller exactly where it is and collapses the network
// underneath them. Same answers, one request.
//
// SINGLE FLIGHT, then a short memory. Three callers in the same tick share one
// in-flight request. A caller arriving a few seconds later gets the cached row
// rather than asking again. After that it goes back to the database, because
// this is somebody's live profile and not a constant.

import { supabase } from '../supabaseClient';

const TTL_MS = 60_000;

// key -> { promise, at }
const cache = new Map();

const keyFor = (table, userId) => `${table}:${userId}`;

/**
 * Read one row belonging to a user, deduplicated across callers.
 *
 * Always selects the whole row on purpose. Three callers asking for three
 * different column lists cannot share a request, and these rows are small, so
 * narrowing the select would cost more round trips than it saves bytes.
 *
 * Resolves to the row or null. Never throws: a failure resolves null and is
 * logged, because every caller here already treats "no row" as a valid answer
 * and none of them should be able to break a page by failing.
 */
export function userRow(table, userId) {
  if (!table || !userId) return Promise.resolve(null);

  const key = keyFor(table, userId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;

  const promise = supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) {
        console.warn(`[userRow] ${table} failed:`, error.code, error.message);
        // A failure is not cached. Caching it would mean one blip on startup
        // left the app believing this person has no listener row for a minute,
        // which reads as being signed out of half the features.
        cache.delete(key);
        return null;
      }
      return data || null;
    }, (err) => {
      console.warn(`[userRow] ${table} threw:`, err?.message);
      cache.delete(key);
      return null;
    });

  cache.set(key, { promise, at: Date.now() });
  return promise;
}

/**
 * Forget a cached row, for immediately after writing to it.
 *
 * Call this whenever the app changes one of these rows, otherwise the change
 * is invisible for up to a minute to everything that reads through here. The
 * theme switcher is the obvious one: you pick a theme, it writes preferences,
 * and without this the next read hands back the old theme.
 */
export function invalidateUserRow(table, userId) {
  if (!table || !userId) return;
  cache.delete(keyFor(table, userId));
}

/**
 * Drop everything. For signing out, so the next person on this device cannot
 * be handed the previous one's row out of memory.
 */
export function clearUserRowCache() {
  cache.clear();
}