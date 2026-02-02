import React, { useState, useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient';
import FeelzMachine from './App';
import Login from './Login';
import AdminPanel from './AdminPanel';
import ProfileSetup from './ProfileSetup';
import ProfileEditPage from './ProfileEditPage';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfUse from './TermsOfUse';
import LandingPage from './LandingPage';

function AppContent() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);
  const location = useLocation();

  useEffect(() => {
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Skip landing page if on specific routes
  useEffect(() => {
    if (['/feelzadmin', '/privacy-policy', '/terms-of-use', '/profile'].includes(location.pathname)) {
      setShowLanding(false);
    }
  }, [location.pathname]);

  const checkUser = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user || null);
    
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
    
    setLoading(false);
  };

  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!error && data) {
      setProfile(data);
    } else {
      setProfile(null);
    }
  };

  const handleProfileComplete = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    
    // Use hash routing for navigation in Electron
    if (window.electron?.isElectron) {
      window.location.hash = '/';
    } else {
      window.location.href = '/';
    }
  };

  const handleEnterApp = () => {
    setShowLanding(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-cyan-400 text-xl">Loading...</div>
      </div>
    );
  }

  // Show landing page only on root path
  if (showLanding && location.pathname === '/') {
    return <LandingPage onEnter={handleEnterApp} />;
  }

  return (
    <Routes>
      {/* Main App Route */}
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

      {/* Profile Edit Route */}
      <Route 
        path="/profile" 
        element={
          user && profile ? (
            <ProfileEditPage 
              user={user} 
              profile={profile} 
              onUpdate={async () => {
                // Refresh profile after update
                if (user) {
                  await fetchProfile(user.id);
                }
              }}
            />
          ) : (
            <Navigate to="/" replace />
          )
        } 
      />

      {/* Admin Route - FIXED: Now passes profile */}
      <Route 
        path="/feelzadmin" 
        element={
          user && profile ? (
            <AdminPanel user={user} profile={profile} onLogout={handleLogout} />
          ) : (
            <Navigate to="/" replace />
          )
        } 
      />

      {/* Legal Pages */}
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-of-use" element={<TermsOfUse />} />

      {/* Login Route */}
      <Route 
        path="/login" 
        element={<Login />} 
      />

      {/* Catch all - redirect to home */}
      <Route 
        path="*" 
        element={<Navigate to="/" replace />} 
      />
    </Routes>
  );
}

function AppRouter() {
  // Use HashRouter for Electron, BrowserRouter for web
  const isElectron = window.electron?.isElectron || false;
  const Router = isElectron ? HashRouter : BrowserRouter;

  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default AppRouter;