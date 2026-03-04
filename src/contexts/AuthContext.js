import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const initializedRef = useRef(false);

  const fetchProfile = async (userId) => {
    let { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      const res = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      data = res.data;
    }

    if (data) setProfile(data);
  };

  const fetchArtist = async (userId) => {
    const { data } = await supabase
      .from('artists')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (data) setArtist(data);
  };

  const checkAdmin = async (userId) => {
    const { data } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', userId)
      .single();

    setIsAdmin(!!data);
  };

  const loadUser = async (sessionUser) => {
    setUser(sessionUser);
    await Promise.all([
      fetchProfile(sessionUser.id),
      fetchArtist(sessionUser.id),
      checkAdmin(sessionUser.id),
    ]);
  };

  useEffect(() => {
    // Step 1: Hydrate from existing session immediately
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadUser(session.user);
      }
      setLoading(false);
      initializedRef.current = true;
    });

    // Step 2: Listen for future auth changes (sign in, sign out)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Skip until initial hydration is done to prevent double-fetch on load
      if (!initializedRef.current) return;

      if (session?.user) {
        await loadUser(session.user);
      } else {
        setUser(null);
        setProfile(null);
        setArtist(null);
        setIsAdmin(false);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
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
    return data;
  };

  const signUpWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
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
      await fetchProfile(user.id);
      await fetchArtist(user.id);
    }
  };

  const value = {
    user,
    profile,
    artist,
    loading,
    isAdmin,
    isArtist: !!artist,
    isMaster: artist?.is_master || false,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
