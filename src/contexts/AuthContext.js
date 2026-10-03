import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { userRow, userRowResult, invalidateUserRow, clearUserRowCache } from '../utils/userRow';

// Which user id an artist-profile creation is currently in flight for.
let creatingArtistFor = null;

// The creator role chosen at sign-up, from whichever of the two places still
// has it.
//
// localStorage is first because it is the OAuth path: Google comes back to the
// same browser, so the key is there, and it is also where a role change made
// after sign-up is staged.
//
// user_metadata is the fallback that makes email sign-up work at all. See the
// comment on signUpWithEmail: the confirmation link is frequently opened in a
// different browser from the one that filled in the form, and localStorage does
// not cross that gap. Exported so Welcome.js reads the same answer this does,
// rather than keeping a second copy of the rule that can disagree with it.
export function pendingCreatorRole(sessionUser) {
  let r = null;
  try { r = localStorage.getItem('pending_creator_role'); } catch {}
  if (r !== 'artist' && r !== 'beatmaker') r = null;
  if (!r) {
    const m = sessionUser?.user_metadata?.creator_role;
    if (m === 'artist' || m === 'beatmaker') r = m;
  }
  return r;
}

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [artist, setArtist]   = useState(null);
  const [listener, setListener] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewAs, setViewAs]   = useState(null);

  const fetchProfile = async (userId) => {
    // Through userRow for the same reason listeners and admins are: this ran
    // twice on every cold load. See src/utils/userRow.js and loadUser below.
    //
    // The legacy `profiles` fallback stays a direct read, because it keys on
    // `id` rather than `user_id` and userRow is deliberately only for the
    // user_id shape.
    let data = await userRow('user_profiles', userId);
    if (!data) {
      const res = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      data = res.data;
    }
    if (data) setProfile(data);
  };

  const fetchArtist = async (userId, sessionUser = null) => {
    // Same again. An artist row read twice at startup is two of the slowest
    // calls in the boot group, for one answer.
    //
    // userRowResult rather than userRow, and this is not a style choice.
    // The `else if (!error)` branch below CREATES an artist row when the read
    // comes back empty. If a failed read collapsed into null the way plain
    // userRow does, a network blip at startup would look like "this person has
    // no artist profile" and it would make them a second one.
    const { data, error } = await userRowResult('artists', userId);
    if (data) {
      // Apply a pending role selection from signup, if one exists. This
      // is what makes the Artist/Beat Maker choice on the login page
      // actually register — the artist row didn't exist yet when that
      // choice was made, so it was previously discarded entirely.
      const pendingRole = pendingCreatorRole(sessionUser);
      if (pendingRole && (pendingRole === 'artist' || pendingRole === 'beatmaker') && data.role !== pendingRole && !data.role_confirmed) {
        const { data: updated } = await supabase
          .from('artists')
          .update({ role: pendingRole, role_confirmed: true })
          .eq('id', data.id)
          .select()
          .maybeSingle();
        localStorage.removeItem('pending_creator_role');
        setArtist(updated || data);
        // Every write to this row drops the cached copy. Without it the row
        // just created or changed stays invisible to anything reading through
        // userRow until the TTL expires.
        invalidateUserRow('artists', userId);
        return;
      }
      if (pendingRole) localStorage.removeItem('pending_creator_role');
      setArtist(data);
    } else if (!error) {
      // Row genuinely doesn't exist. If they chose Artist/Beat Maker at
      // signup, that choice was previously discarded here entirely —
      // nothing anywhere in the app creates a new artists row, so the
      // person silently stayed a listener regardless of what they picked.
      const pendingRole = pendingCreatorRole(sessionUser);
      if (pendingRole && (pendingRole === 'artist' || pendingRole === 'beatmaker')) {
        // Claim the key BEFORE doing any async work, and hold a module-level
        // in-flight guard.
        //
        // This block used to remove the key only after a successful insert,
        // which made it a race: two concurrent passes both saw it set, each
        // generated a DIFFERENT random suffix, and since the names differed
        // there was no unique-constraint collision to stop the second one.
        // Five accounts ended up with two or three artist profiles each — one
        // had three. Clearing first means a second pass finds nothing to do.
        //
        // The unique index artists_user_id_unique (migration 99) now makes it
        // impossible at the database level too. This is the half that stops
        // the pointless second request being sent at all.
        localStorage.removeItem('pending_creator_role');

        if (creatingArtistFor === userId) return;
        creatingArtistFor = userId;

        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          const base = (authUser?.email?.split('@')[0] || 'artist').toLowerCase().replace(/[^a-z0-9]/g, '');
          const suffix = Math.random().toString(36).slice(2, 8);
          const placeholderName = `${base}-${suffix}`;

          const { data: created, error: insertErr } = await supabase
            .from('artists')
            .insert({
              user_id: userId,
              artist_name: placeholderName,
              slug: placeholderName,
              role: pendingRole,
              role_confirmed: true,
            })
            .select()
            .maybeSingle();

          if (insertErr) {
            // 23505 now has two possible causes, and they need opposite
            // responses:
            //
            //   user_id     — a profile already exists. Retrying with another
            //                 random name would fail again forever. Fetch the
            //                 row that won instead.
            //   artist_name — a genuine name clash with somebody else.
            //
            // The old code assumed the second and blind-retried, which under
            // the new index would have looped to a dead end and left the user
            // looking profile-less.
            if (insertErr.code === '23505') {
              const { data: existing } = await supabase
                .from('artists').select('*').eq('user_id', userId)
                .order('created_at', { ascending: true }).limit(1).maybeSingle();

              if (existing) { setArtist(existing); return; }

              // Not a user_id clash, so it was the name. One fresh suffix.
              const retryName = `${base}-${Math.random().toString(36).slice(2, 8)}`;
              const { data: retried, error: retryErr } = await supabase
                .from('artists')
                .insert({
                  user_id: userId,
                  artist_name: retryName,
                  slug: retryName,
                  role: pendingRole,
                  role_confirmed: true,
                })
                .select()
                .maybeSingle();
              if (retryErr) {
                console.error('[auth] artist profile creation failed:', retryErr.code, retryErr.message);
                setArtist(null);
                return;
              }
              setArtist(retried || null);
              invalidateUserRow('artists', userId);
              return;
            }

            console.error('[auth] artist profile creation failed:', insertErr.code, insertErr.message);
            setArtist(null);
            return;
          }

          setArtist(created || null);
          invalidateUserRow('artists', userId);
          return;
        } catch (err) {
          console.error('[auth] artist profile creation threw:', err.message);
          setArtist(null);
          return;
        } finally {
          creatingArtistFor = null;
        }
      }
      // Row genuinely doesn't exist — clear any stale state
      setArtist(null);
    }
    // If there's a network error, preserve existing state rather than wiping it
  };

  const fetchListener = async (userId) => {
    // Through userRow, because useAppThemeInit and useTier read this same row
    // on the same tick and all three used to send their own request. See
    // src/utils/userRow.js for the measurement.
    const existing = await userRow('listeners', userId);
    if (existing) {
      setListener(existing);
      return;
    }
    // No row yet — create one on first login so drip + last_seen_at work from day 1
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const displayName =
        authUser?.user_metadata?.full_name ||
        authUser?.user_metadata?.name ||
        authUser?.email?.split('@')[0] ||
        null;
      const { data: created } = await supabase
        .from('listeners')
        .upsert({ user_id: userId, display_name: displayName, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .select()
        .maybeSingle();
      if (created) {
        setListener(created);
        invalidateUserRow('listeners', userId);
      }
    } catch (err) {
      console.warn('Listener row creation failed (non-fatal):', err.message);
    }
  };

  const checkAdmin = async (userId) => {
    try {
      // Also through userRow: CreateMenuModal asked this same question on
      // mount, so `admins` was read twice before anybody had tapped anything.
      const data = await userRow('admins', userId);
      setIsAdmin(!!data);
    } catch {
      setIsAdmin(false);
    }
  };

  // WHY loadUser RUNS TWICE, AND THE GUARD THAT WAS NOT CATCHING IT
  //
  // On a cold load with an existing session, two paths both call this: the
  // getSession() promise below, and onAuthStateChange firing SIGNED_IN, which
  // Supabase sends on session restore and not only on an actual login.
  //
  // There IS a guard, inside a setUser updater: `if (!prev || prev.id !== ...)`.
  // It cannot work on a cold load, because both paths run while `user` is
  // still null, so `!prev` is true for both and loadUser runs twice. Measured:
  // user_profiles, artists, listeners and admins each requested twice before
  // anybody had touched anything.
  //
  // A ref, because this has to be true the instant it is set rather than on
  // the next render, which is exactly what state cannot promise and is why the
  // original guard was written in the wrong place.
  // Holds { id, promise }, NOT just the id, and the difference is a bug I
  // shipped and then had to come back for.
  //
  // The first version returned early when the id matched. That stopped the
  // duplicate queries, and it broke the thing underneath: on a cold load
  // onAuthStateChange usually fires first and starts the real work, then
  // getSession's handler calls loadUser, gets an instant return, and runs its
  // `finally { setLoading(false) }` while the artist and listener reads are
  // still in flight. Everything downstream then sees loading:false with no
  // profile and concludes the person has no account.
  //
  // That is why a returning account with a full profile was landing on /setup.
  // An await that does not wait is worse than no dedupe at all.
  //
  // Handing back the SAME promise means the second caller still sends no
  // queries and still waits for the first one to finish, which is what it was
  // always asking for.
  const loading_ = useRef(null);

  const loadUser = (sessionUser) => {
    const id = sessionUser?.id || null;
    if (loading_.current && loading_.current.id === id) return loading_.current.promise;
    const promise = loadUserOnce(sessionUser);
    loading_.current = { id, promise };
    return promise;
  };

  const loadUserOnce = async (sessionUser) => {
    if (!sessionUser) return;
    setUser(sessionUser);
    // Check for affiliate ref in sessionStorage (set by landing page)
    try {
      const ref = sessionStorage.getItem('feelz_ref');
      if (ref) {
        // affiliate-track now takes the user from the bearer token rather
        // than from the body — it was an unauthenticated, service-role
        // endpoint that would mint credits for any user id it was handed.
        // The token is what makes the conversion attributable, so it has to
        // be sent or the call is refused with a 401.
        (async () => {
          const { data: { session: refSession } } = await supabase.auth.getSession();
          if (!refSession?.access_token) return;
          const res = await fetch('/.netlify/functions/affiliate-track', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${refSession.access_token}`,
            },
            body: JSON.stringify({ action: 'convert', refCode: ref }),
          }).catch(() => null);
          // Only clear the ref once it was actually recorded, so a failed
          // call does not silently lose the referral.
          if (res?.ok) sessionStorage.removeItem('feelz_ref');
        })();
      }
    } catch {}
    try {
      await Promise.all([
        fetchProfile(sessionUser.id),
        fetchArtist(sessionUser.id, sessionUser),
        fetchListener(sessionUser.id),
        checkAdmin(sessionUser.id),
      ]);
    } catch (err) {
      console.error('Failed to load user profile data:', err);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        if (session?.user) await loadUser(session.user);
      } catch (err) {
        console.error('Session load error:', err);
      } finally {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Supabase fires SIGNED_IN on every tab focus and token refresh, not just
        // on actual logins. Guard against re-running loadUser (which triggers 4
        // Supabase queries and causes every page to flicker/freeze) unless this is
        // a genuinely new user session.
        setUser(prev => {
          if (!prev || prev.id !== session.user.id) {
            // New user — load their profile data async, then handle redirect
            loadUser(session.user).then(() => {
              const redirect = sessionStorage.getItem('post_login_redirect');
              if (redirect) {
                sessionStorage.removeItem('post_login_redirect');
                window.location.replace(redirect);
              }
            });
          }
          return prev?.id === session.user.id ? prev : session.user;
        });
      }
      if (event === 'SIGNED_OUT') {
        loading_.current = null;
        setUser(null);
        setProfile(null);
        setArtist(null);
        setListener(null);
        setIsAdmin(false);
      }
    });
    return () => authListener?.subscription?.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signInWithMagicLink = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/setup`,
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
  };

  const signInWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await loadUser(data.user);
    return data;
  };

  const signUpWithEmail = async (email, password, redirectPath = '/setup', creatorRole = null) => {
    // creator_role goes into user_metadata, and that is the whole point.
    //
    // The Artist / Sell beats choice used to live ONLY in localStorage. With
    // email confirmation on, the person signs up in one browser and then opens
    // the confirmation link from their mail client, which on a phone is very
    // often a different browser context: the Gmail in-app view, a different
    // default browser, sometimes a different device. localStorage belongs to
    // the origin IN THAT BROWSER, so the choice simply was not there when the
    // session finally arrived. fetchArtist found no pending role, created no
    // artists row, fetchListener created a listeners row the way it does for
    // everybody, and the person who picked Artist landed as a listener with
    // nothing anywhere recording that they had asked for anything else.
    //
    // user_metadata is stored on the auth user, server side. It is attached to
    // the session wherever that session is opened, so the choice survives the
    // round trip through the mail client, a new device, and a cleared browser.
    const meta = (creatorRole === 'artist' || creatorRole === 'beatmaker')
      ? { creator_role: creatorRole }
      : undefined;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${redirectPath}`,
        ...(meta ? { data: meta } : {}),
      },
    });
    if (error) throw error;
    // Do NOT call loadUser here, the user hasn't confirmed their email yet.
    // Supabase sends the confirmation email after this call.
    // Once they click the link, the session will load automatically.
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Before the state is cleared, not after. Whatever is cached here belongs
    // to the person who just left, and the next person on this device must not
    // be handed it out of memory.
    clearUserRowCache();
    loading_.current = null;
    setUser(null);
    setProfile(null);
    setArtist(null);
    setListener(null);
    setIsAdmin(false);
  };

  const refreshProfile = async () => {
    if (user) {
      // The whole point of this function is to go and look again, so the cache
      // is dropped first. Without this, "refresh" would return what it already
      // had, which is the opposite of what every caller wants.
      invalidateUserRow('listeners', user.id);
      invalidateUserRow('admins', user.id);
      invalidateUserRow('user_profiles', user.id);
      invalidateUserRow('artists', user.id);
      await fetchProfile(user.id);
      await fetchArtist(user.id, user);
      await fetchListener(user.id);
    }
  };

  /**
   * deleteAccount
   * Wipes all user data then deletes the auth account via an edge function.
   * The edge function needs service_role access to call supabase.auth.admin.deleteUser().
   * Falls back to a "deletion requested" flag if the edge function isn't set up yet.
   */
  const deleteAccount = async () => {
    if (!user) throw new Error('Not signed in');

    const userId = user.id;

    // Step 1: Delete user-owned data in order of dependency
    try {
      // Follows
      await supabase.from('follows').delete().eq('follower_id', userId);
      // Track likes
      await supabase.from('track_likes').delete().eq('user_id', userId);
      // Downloads
      await supabase.from('downloads').delete().eq('user_id', userId);
      // Notifications
      await supabase.from('notifications').delete().eq('user_id', userId);
      // Artist thoughts
      if (artist?.id) {
        await supabase.from('artist_thoughts').delete().eq('artist_id', artist.id);
        await supabase.from('artist_posts').delete().eq('artist_id', artist.id);
        // Mark artist as deleted rather than hard delete to preserve collab history
        await supabase.from('artists').update({
          artist_name: '[Deleted Artist]',
          bio: '',
          profile_image_url: null,
          social_links: {},
          is_published: false,
        }).eq('id', artist.id);
      }
      // Listener profile
      await supabase.from('streams').delete().eq('user_id', userId);
      await supabase.from('push_subscriptions').delete().eq('user_id', userId);
      await supabase.from('artist_guestbook').delete().eq('user_id', userId);
      await supabase.from('user_streaks').delete().eq('user_id', userId);
      await supabase.from('playlists').delete().eq('user_id', userId);
      await supabase.from('listeners').delete().eq('user_id', userId);
      // User profile
      await supabase.from('user_profiles').delete().eq('user_id', userId);
    } catch (err) {
      console.error('Data deletion error:', err);
      // Continue — still attempt auth deletion
    }

    // Step 2: Delete the auth user via Netlify function
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ user_id: userId }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Deletion failed');
    } catch (err) {
      // Edge function not set up yet — sign out and flag for manual deletion
      console.warn('Auth deletion via function failed, flagging for manual review:', err);
      await supabase.from('user_profiles').upsert({
        user_id: userId,
        deletion_requested: true,
        deletion_requested_at: new Date().toISOString(),
      });
    }

    // Step 3: Sign out regardless
    await signOut();
  };

  const value = {
    user,
    profile,
    artist,
    listener,
    loading,
    isAdmin: viewAs === 'admin' || (!viewAs && isAdmin) || (isAdmin && viewAs === 'beatmaker'),
    isArtist: viewAs ? (viewAs === 'artist' || viewAs === 'admin') : !!artist,
    isListener: viewAs ? viewAs === 'listener' : !!listener,
    isBeatmaker: viewAs === 'beatmaker' || (!viewAs && artist?.role === 'beatmaker'),
    userRole: artist?.role || (listener ? 'listener' : 'artist'),
    rawIsAdmin: isAdmin,
    rawIsArtist: !!artist,
    rawIsMaster: artist?.is_master || false,
    hasProfile: !!artist || !!listener,
    isMaster: viewAs ? false : (artist?.is_master || false),
    viewAs,
    setViewAs,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInWithMagicLink,
    signOut,
    refreshProfile,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);