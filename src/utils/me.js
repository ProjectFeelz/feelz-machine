// src/utils/me.js
//
// Who the signed-in person is, for the bits of chrome that show them back to
// themselves: the top bar button, the sidebar card, the profile screen.
//
//
// WHY THIS EXISTS
//
// A person's picture can live in three places, and which one holds it depends
// on what kind of account they are:
//
//   artists.profile_image_url    an artist, set on the profile screen
//   listeners.avatar_url         a listener, set during onboarding
//                                (src/pages/ListenerWelcome.js:134)
//   user_profiles.avatar_url     the shared profile row
//
// Every screen that shows somebody ELSE already handles this. ListenerProfilePage
// does `artist?.profile_image_url || listener.avatar_url`, and so do the
// comment sheet, the fan leaderboard, the For You feed and the artist page.
//
// The chrome did not. AppLayout read `isArtist ? artist?.profile_image_url : null`,
// which hands a listener a literal null, and DesktopSidebar rendered its whole
// card inside `{artist && (...)}`, so a listener had no card at all. A listener
// could upload a picture during onboarding, have it stored correctly, have it
// appear next to their comments, and still see the default grey icon
// everywhere they looked at themselves.
//
// One resolver, same order of preference as everywhere else, so the chrome
// cannot drift from the rest of the app again.

/**
 * The signed-in person's picture, or null.
 *
 * Order matters and matches the rest of the app: an artist's own artwork wins,
 * because an artist who is also a listener thinks of themselves as the artist.
 * auth metadata is last, and is what a social sign-in fills in.
 */
export function myAvatar({ artist, listener, user } = {}) {
  return (
    artist?.profile_image_url ||
    listener?.avatar_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null
  );
}

/**
 * What to call them. Falls back far enough that this never renders empty,
 * because an empty name in the sidebar looks like a broken session.
 */
export function myName({ artist, listener, user } = {}) {
  return (
    artist?.artist_name ||
    listener?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'You'
  );
}

/** The single letter shown when there is no picture. */
export function myInitial(who) {
  const n = myName(who);
  return (n[0] || 'Y').toUpperCase();
}