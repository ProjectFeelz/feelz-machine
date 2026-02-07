import React, { useState, useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Loader } from 'lucide-react';
import FeelzMachine from './App';
import Login from './Login';
import AdminPanel from './AdminPanel';
import ProfileSetup from './ProfileSetup';
import ProfileEditPage from './ProfileEditPage';
import DownloadsHistory from './DownloadsHistory';
import CollectionsGrid from './CollectionsGrid';
import CollectionPage from './CollectionPage';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfUse from './TermsOfUse';
import LandingPage from './LandingPage';

function AppContent() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(() => {
    // ✅ FIX: Check sessionStorage to persist landing state
    const hasSeenLanding = sessionStorage.getItem('hasSeenLanding');
    return !hasSeenLanding;
  });
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
  }, []); // ✅ Empty dependency array - only run once

  // ✅ FIX: Only skip landing on initial load for specific routes
  useEffect(() => {
    const skipLandingRoutes = ['/feelzadmin', '/privacy-policy', '/terms-of-use', '/profile', '/profile/downloads', '/collections'];
    if (skipLandingRoutes.includes(location.pathname) || location.pathname.startsWith('/collection/')) {
      setShowLanding(false);
      sessionStorage.setItem('hasSeenLanding', 'true');
    }
  }, []); // ✅ Only run once on mount, not on every pathname change

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
    // ✅ FIX: Clear landing state on logout
    sessionStorage.removeItem('hasSeenLanding');
    setShowLanding(true);
  };

  const handleEnterApp = () => {
    setShowLanding(false);
    // ✅ FIX: Remember that user has seen landing
    sessionStorage.setItem('hasSeenLanding', 'true');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <Loader className="w-12 h-12 text-cyan-400 animate-spin" />
      </div>
    );
  }

  // Show landing page only on first visit
  if (showLanding && location.pathname === '/') {
    return <LandingPage onEnter={handleEnterApp} />;
  }

  return (
    <Routes>
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
      
      <Route 
        path="/profile" 
        element={
          user && profile ? (
            <ProfileEditPage 
              user={user} 
              profile={profile} 
              onUpdate={async () => {
                if (user) {
                  await fetchProfile(user.id);
                }
              }} 
            />
          ) : (
            <Navigate to="/" />
          )
        } 
      />

      <Route 
        path="/profile/downloads" 
        element={
          user && profile ? (
            <DownloadsHistory user={user} />
          ) : (
            <Navigate to="/" />
          )
        } 
      />

      <Route 
        path="/feelzadmin" 
        element={
          user && profile ? (
            <AdminPanel user={user} profile={profile} onLogout={handleLogout} />
          ) : (
            <Navigate to="/" />
          )
        } 
      />

      <Route 
        path="/collections" 
        element={<CollectionsGrid />} 
      />

      <Route 
        path="/collection/:id" 
        element={
          user && profile ? (
            <CollectionPage user={user} profile={profile} />
          ) : (
            <Navigate to="/" />
          )
        } 
      />

      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-of-use" element={<TermsOfUse />} />
    </Routes>
  );
}

function AppRouter() {
  const isElectron = window.navigator.userAgent.includes('Electron');
  const Router = isElectron ? HashRouter : BrowserRouter;
  
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default AppRouter;