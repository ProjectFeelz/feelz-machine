import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PlayerProvider } from './contexts/PlayerContext';
import AppLayout from './components/layout/AppLayout';
import LandingPage from './pages/LandingPage';
import HomePage from './pages/HomePage';
import BrowsePage from './pages/BrowsePage';
import LoginPage from './pages/LoginPage';
import LibraryPage from './pages/LibraryPage';
import LikedSongsPage from './pages/LikedSongsPage';
import DownloadsPage from './pages/DownloadsPage';
import FollowingPage from './pages/FollowingPage';
import PlaylistsPage from './pages/PlaylistsPage';
import PlaylistDetailPage from './pages/PlaylistDetailPage';
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
import ProfileSetup from './pages/ProfileSetup';
import AdminDashboard from './pages/AdminDashboard';
import AdminArtists from './pages/AdminArtists';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminModeration from './pages/AdminModeration';
import AdminBroadcast from './pages/AdminBroadcast';
import AlbumDetailPage from './pages/AlbumDetailPage';
import RecentlyPlayedPage from './pages/RecentlyPlayedPage';
import TermsPage from './pages/TermsPage';
import AdminBoost from './pages/AdminBoost';

// If we're at the root "/" serve the landing page standalone
const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
const isLanding = !isStandalone && (window.location.pathname === '/' || window.location.pathname === '');

export default function AppRouter() {
  if (isLanding) {
    return <LandingPage />;
  }

  // All app routes live under /player via basename
  // This means every navigate('/hub') etc stays unchanged — router handles the prefix
  return (
    <BrowserRouter basename="/player">
      <AuthProvider>
        <PlayerProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<ProfileSetup />} />
            <Route path="/dashboard" element={<ArtistDashboard />} />
            <Route path="/upgrade" element={<TierUpgradePage />} />
            <Route path="/chat/:roomId" element={<ChatRoomView />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-use" element={<TermsOfUse />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/artist/:slug" element={<ArtistProfilePage />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/library/likes" element={<LikedSongsPage />} />
              <Route path="/library/recent" element={<RecentlyPlayedPage />} />
              <Route path="/library/downloads" element={<DownloadsPage />} />
              <Route path="/library/following" element={<FollowingPage />} />
              <Route path="/library/playlists" element={<PlaylistsPage />} />
              <Route path="/library/playlists/:id" element={<PlaylistDetailPage />} />
              <Route path="/community" element={<FeedPage />} />
              <Route path="/chat" element={<ChatRoomsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/hub" element={<HubPage />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/artists" element={<AdminArtists />} />
              <Route path="/admin/analytics" element={<AdminAnalytics />} />
              <Route path="/admin/moderation" element={<AdminModeration />} />
              <Route path="/admin/broadcast" element={<AdminBroadcast />} />
              <Route path="/album/:id" element={<AlbumDetailPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/admin/boost" element={<AdminBoost />} />
            </Route>
          </Routes>
        </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
