import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './contexts/AuthContext';
import { PlayerProvider } from './contexts/PlayerContext';
import AppLayout from './components/layout/AppLayout';
import AboutPage from './pages/AboutPage';
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
import TermsOfUse from './pages/TermsOfUse';
import NotificationsPage from './pages/NotificationsPage';
import HubPage from './pages/HubPage';
import ProfileSetup from './pages/ProfileSetup';
import AdminDashboard from './pages/AdminDashboard';
import AdminArtists from './pages/AdminArtists';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminModeration from './pages/AdminModeration';
import AdminBoost from './pages/AdminBoost';
import AdminBroadcast from './pages/AdminBroadcast';
import RecentlyPlayedPage from './pages/RecentlyPlayedPage';
import UserProfilePage from './pages/UserProfilePage';
import AlbumDetailPage from './pages/AlbumDetailPage';
import AdminUserBehaviorPage from './pages/AdminUserBehaviorPage';
import { Helmet } from 'react-helmet-async';
import TrackPage from './pages/TrackPage';
import CollabRadarPage from './pages/CollabRadarPage';

// ── Wrapper to set page title for standalone pages outside AppLayout ─────────
function PageTitle({ title, children }) {
  return (
    <>
      <Helmet>
        <title>{title} · Feelz Machine</title>
      </Helmet>
      {children}
    </>
  );
}

export default function AppRouter() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
          <PlayerProvider>
            <Routes>
              {/* Legacy /player/* redirects */}
              <Route path="/player" element={<Navigate to="/" replace />} />
              <Route path="/player/*" element={<Navigate to="/" replace />} />

              {/* Fix: /terms was broken — redirect to correct route */}
              <Route path="/terms" element={<Navigate to="/terms-of-use" replace />} />

              <Route path="/login" element={<LoginPage />} />
              <Route path="/setup" element={<ProfileSetup />} />
              <Route path="/dashboard" element={<ArtistDashboard />} />
              <Route path="/upgrade" element={<TierUpgradePage />} />
              <Route path="/chat/:roomId" element={<ChatRoomView />} />

              {/* Legal pages — fixed titles */}
              <Route path="/privacy-policy" element={
                <PageTitle title="Privacy Policy">
                  <PrivacyPolicy />
                </PageTitle>
              } />
              <Route path="/terms-of-use" element={
                <PageTitle title="Terms of Use">
                  <TermsOfUse />
                </PageTitle>
              } />

              <Route element={<AppLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/browse" element={<BrowsePage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/library/likes" element={<LikedSongsPage />} />
                <Route path="/library/downloads" element={<DownloadsPage />} />
                <Route path="/library/recent" element={<RecentlyPlayedPage />} />
                <Route path="/library/following" element={<FollowingPage />} />
                <Route path="/library/playlists" element={<PlaylistsPage />} />
                <Route path="/library/playlists/:id" element={<PlaylistDetailPage />} />
                <Route path="/community" element={<FeedPage />} />
                <Route path="/feed" element={<Navigate to="/community" replace />} />
                <Route path="/chat" element={<ChatRoomsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/profile/edit" element={<UserProfilePage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/hub" element={<HubPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/album/:id" element={<AlbumDetailPage />} />
                <Route path="/artist/:slug" element={<ArtistProfilePage />} />
                <Route path="/track/:slug" element={<TrackPage />} />
                <Route path="/collab-radar" element={<CollabRadarPage />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/artists" element={<AdminArtists />} />
                <Route path="/admin/analytics" element={<AdminAnalytics />} />
                <Route path="/admin/moderation" element={<AdminModeration />} />
                <Route path="/admin/boost" element={<AdminBoost />} />
                <Route path="/admin/broadcast" element={<AdminBroadcast />} />
                <Route path="/admin/behavior" element={<AdminUserBehaviorPage />} />

                {/* Catch-all: unknown routes redirect home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </PlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}
