import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PlayerProvider } from './contexts/PlayerContext';
import AppLayout from './components/layout/AppLayout';
import HomePage from './pages/HomePage';
import BrowsePage from './pages/BrowsePage';
import LoginPage from './pages/LoginPage';
import LibraryPage from './pages/LibraryPage';
import ProfilePage from './pages/ProfilePage';
import FeedPage from './pages/FeedPage';
import ArtistDashboard from './pages/ArtistDashboard';
import ArtistProfilePage from './pages/ArtistProfilePage';
import TierUpgradePage from './pages/TierUpgradePage';
import ChatRoomsPage from './pages/ChatRoomsPage';
import ChatRoomView from './pages/ChatRoomView';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfUse from './TermsOfUse';
import NotificationsPage from './pages/NotificationsPage';
import HubPage from './pages/HubPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminArtists from './pages/AdminArtists';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminModeration from './pages/AdminModeration';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PlayerProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<ArtistDashboard />} />
            <Route path="/artist/:slug" element={<ArtistProfilePage />} />
            <Route path="/upgrade" element={<TierUpgradePage />} />
            <Route path="/chat/:roomId" element={<ChatRoomView />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-use" element={<TermsOfUse />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/community" element={<FeedPage />} />
              <Route path="/chat" element={<ChatRoomsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/hub" element={<HubPage />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/artists" element={<AdminArtists />} />
              <Route path="/admin/analytics" element={<AdminAnalytics />} />
              <Route path="/admin/moderation" element={<AdminModeration />} />

            </Route>
          </Routes>
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
