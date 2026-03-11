import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewAs, setViewAs] = useState(null);

  const fetchProfile = async (userId) => {
    // Try user_profiles first, fall back to profiles
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
    const { data } = await supabase
      .from('artists')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    setArtist(data || null);
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
    await Promise.all([
      fetchProfile(sessionUser.id),
      fetchArtist(sessionUser.id),
      checkAdmin(sessionUser.id),
    ]);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) await loadUser(session.user);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // FIX: Reload full user data on sign-in (covers OAuth redirect return)
        await loadUser(session.user);
      }
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setArtist(null);
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
    setIsAdmin(false);
  };

  const refreshProfile = async () => {
    if (user) {
      await Promise.all([
        fetchProfile(user.id),
        fetchArtist(user.id),
      ]);
    }
  };

  const value = {
    user,
    profile,
    artist,
    // FIX: removed listener (table doesn't exist) — non-artist users
    // are identified by artist being null
    listener: null,
    loading,
    isAdmin: viewAs ? viewAs === 'admin' : isAdmin,
    isArtist: viewAs ? (viewAs === 'artist' || viewAs === 'admin') : !!artist,
    // FIX: isListener is true for any logged-in non-artist user
    isListener: viewAs ? viewAs === 'listener' : (!!user && !artist),
    rawIsAdmin: isAdmin,
    rawIsArtist: !!artist,
    rawIsMaster: artist?.is_master || false,
    hasProfile: !!profile,
    isMaster: viewAs ? false : (artist?.is_master || false),
    viewAs,
    setViewAs,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);