import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

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
    let { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
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

  const fetchArtist = async (userId) => {
    const { data, error } = await supabase
      .from('artists')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      setArtist(data);
    } else if (!error) {
      // Row genuinely doesn't exist — clear any stale state
      setArtist(null);
    }
    // If there's a network error, preserve existing state rather than wiping it
  };

  const fetchListener = async (userId) => {
    const { data } = await supabase
      .from('listeners')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (data) setListener(data);
  };

  const checkAdmin = async (userId) => {
    const { data } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    setIsAdmin(!!data);
  };

  const loadUser = async (sessionUser) => {
    if (!sessionUser) return;
    setUser(sessionUser);
    try {
      await Promise.all([
        fetchProfile(sessionUser.id),
        fetchArtist(sessionUser.id),
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

  const signInWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await loadUser(data.user);
    return data;
  };

  const signUpWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    if (data.user) await loadUser(data.user);
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setArtist(null);
    setListener(null);
    setIsAdmin(false);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
      await fetchArtist(user.id);
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
    isAdmin: viewAs ? viewAs === 'admin' : isAdmin,
    isArtist: viewAs ? (viewAs === 'artist' || viewAs === 'admin') : !!artist,
    isListener: viewAs ? viewAs === 'listener' : !!listener,
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
    signOut,
    refreshProfile,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);