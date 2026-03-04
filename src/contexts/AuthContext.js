import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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
    if (!sessionUser) return;
    setUser(sessionUser);
    await Promise.all([
      fetchProfile(sessionUser.id),
      fetchArtist(sessionUser.id),
      checkAdmin(sessionUser.id),
    ]);
  };

  useEffect(() => {
    // Hydrate from existing session on mount only
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) await loadUser(session.user);
      setLoading(false);
    });

    // Listener ONLY handles sign out — nothing else touches state
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
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
    // Google redirects back to app — getSession() on mount handles the rest
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
