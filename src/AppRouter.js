import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import FeelzMachine from './App';
import Login from './Login';
import AdminPanel from './AdminPanel';
import ProfileSetup from './ProfileSetup';

function AppRouter() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingProfile, setCheckingProfile] = useState(false);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkUserProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserProfile = async (userId) => {
    setCheckingProfile(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Profile check error:', error);
      }

      setProfile(data || null);
    } catch (error) {
      console.error('Profile check error:', error);
      setProfile(null);
    } finally {
      setCheckingProfile(false);
      setLoading(false);
    }
  };

  const handleProfileComplete = () => {
    if (user) {
      checkUserProfile(user.id);
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
    checkUserProfile(userData.id);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  if (loading || checkingProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Public route - Main app */}
        <Route 
          path="/" 
          element={
            user && !profile ? (
              <ProfileSetup user={user} onComplete={handleProfileComplete} />
            ) : (
              <FeelzMachine user={user} profile={profile} />
            )
          } 
        />

        {/* Admin routes */}
        <Route
          path="/feelzadmin"
          element={
            user ? (
              profile ? (
                <AdminPanel user={user} onLogout={handleLogout} />
              ) : (
                <ProfileSetup user={user} onComplete={handleProfileComplete} />
              )
            ) : (
              <Login onLogin={handleLogin} />
            )
          }
        />

        {/* Catch all - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default AppRouter;