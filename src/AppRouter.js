import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { TierProvider } from './contexts/useTier';
import { useSessionRefresh } from './useSessionRefresh';
import { useActivityPing } from './useActivityPing';
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
import PlaylistJoinPage from './pages/PlaylistJoinPage';
import ListeningSessionPage from './pages/ListeningSessionPage';
import ProfilePage from './pages/ProfilePage';
import FeedPage from './pages/FeedPage';
import ArtistDashboard from './pages/ArtistDashboard';
import ArtistProfilePage from './pages/ArtistProfilePage';
import TierUpgradePage from './pages/TierUpgradePage';
import ChatRoomsPage from './pages/ChatRoomsPage';
import ChatRoomView from './pages/ChatRoomView';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfUse from './pages/TermsOfUse';
import NotificationsPage from './pages/NotificationsPage';
import HubPage from './pages/HubPage';
import ProfileSetup from './pages/ProfileSetup';
import ListenerStatsPage from './pages/ListenerStatsPage';
import ListenerUpgradePage from './pages/ListenerUpgradePage';
import AdminDashboard from './pages/AdminDashboard';
import AdminArtists from './pages/AdminArtists';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminModeration from './pages/AdminModeration';
import AdminBoost from './pages/AdminBoost';
import AdminBroadcast from './pages/AdminBroadcast';
import RecentlyPlayedPage from './pages/RecentlyPlayedPage';
import UserProfilePage from './pages/UserProfilePage';
import AlbumDetailPage from './pages/AlbumDetailPage';
import TrackDetailPage from './pages/TrackDetailPage';
import AffiliatePage from './pages/AffiliatePage';
import AdminAffiliates from './pages/AdminAffiliates';
import AdminPeople       from './pages/AdminPeople';
import AdminIntelligence from './pages/AdminIntelligence';
import AdminContent      from './pages/AdminContent';
import AdminGrowth       from './pages/AdminGrowth';
import BeatDetailPage from './pages/BeatDetailPage';
import AdminUserBehaviorPage from './pages/AdminUserBehaviorPage';
import { Helmet } from 'react-helmet-async';
import TrackPage from './pages/TrackPage';
import CollabRadarPage from './pages/CollabRadarPage';
import AdminDuplicates from './pages/AdminDuplicates';
import CompetitionRoomPage from './pages/CompetitionRoomPage';
import WheelRevealPage from './pages/WheelRevealPage';
import ForYouPage from './pages/ForYouPage';
import MerchPage from './pages/MerchPage';
import MerchCheckoutPage from './pages/MerchCheckoutPage';
import MerchOrdersPage from './pages/MerchOrdersPage';
import CompetitionsPage from './pages/CompetitionsPage';
import AdminCompetitions from './pages/AdminCompetitions';
import AdminEngagement from './pages/AdminEngagement';


// ── Session keepalive — refreshes token + listens for activity ───────────────
function SessionManager() {
  useSessionRefresh();
  useActivityPing();
  return null;
}

// ── Wrapper to set page title for standalone pages outside AppLayout ─────────
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

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

// Handles /@slug short URLs → redirects to /artist/:slug
function ArtistProfileRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/artist/${slug}`} replace />;
}

// Handles Printful OAuth redirect — passes code back to artist profile
function MerchConnectCallback() {
  const navigate = useNavigate();
  React.useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const code    = params.get('code');
    const state   = params.get('state'); // artist slug stored in state param
    if (code && state) {
      navigate(`/artist/${state}?printful_code=${code}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, []); // eslint-disable-line
  return null;
}

// Captures ?ref= param from URL and logs affiliate click
function AffiliateTracker() {
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref) return;
    // Store ref for conversion tracking on signup
    try { sessionStorage.setItem('feelz_ref', ref); } catch {}
    // Log click
    fetch('/.netlify/functions/affiliate-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'click', refCode: ref, page: window.location.pathname }),
    }).catch(() => {});
  }, []);
  return null;
}


// Redirects new users to /setup if they have no artist or listener profile
function OnboardingGuard({ children }) {
  const { user, artist, listener, loading } = useAuth();
  const location = useLocation();
  const skipPaths = ['/setup', '/login', '/about', '/terms-of-use', '/privacy-policy', '/artist/', '/@'];
  
  if (loading) return null;
  if (!user) return children;
  if (skipPaths.some(p => location.pathname.startsWith(p))) return children;
  
  // New user — has auth but no profile
  if (user && !artist && !listener) {
    return <Navigate to="/setup" replace />;
  }
  return children;
}


function PaymentSuccess() {
  const navigate = useNavigate();
  React.useEffect(() => {
    // Navigate back to the beat page with payfast_success param so it auto-downloads
    const t = setTimeout(() => {
      // Try to go back; if no history, go to hub
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/hub');
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [navigate]);
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-4 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
        <span className="text-3xl">✓</span>
      </div>
      <h2 className="text-xl font-bold text-white">Payment Successful!</h2>
      <p className="text-sm text-white/40">Your download will start shortly. Redirecting you back…</p>
    </div>
  );
}

function PaymentCancel() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-4 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
        <span className="text-3xl">✕</span>
      </div>
      <h2 className="text-xl font-bold text-white">Payment Cancelled</h2>
      <p className="text-sm text-white/40">No charge was made.</p>
      <button onClick={() => navigate(-1)} className="px-6 py-2.5 bg-white text-black rounded-xl text-sm font-semibold">Go Back</button>
    </div>
  );
}


export default function AppRouter() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <ScrollToTop />
        <SessionManager />
        <AffiliateTracker />
        <AuthProvider>
          <PlayerProvider>
            <TierProvider>
            <OnboardingGuard>
            <Routes>
              {/* Public redirect — no layout needed, just redirects to /artist/:slug */}
              <Route path="/@:slug" element={<ArtistProfileRedirect />} />

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
              <Route path="/competition/:competitionId" element={<CompetitionRoomPage />} />
              <Route path="/session/:sessionId" element={<ListeningSessionPage />} />
              <Route path="/merch-connect-callback" element={<MerchConnectCallback />} />

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
                <Route path="/" element={<ForYouPage />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/for-you" element={<Navigate to="/" replace />} />
                <Route path="/browse" element={<BrowsePage />} />
                <Route path="/wheel" element={<WheelRevealPage />} />
                <Route path="/competitions" element={<CompetitionsPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/library/likes" element={<LikedSongsPage />} />
                <Route path="/library/downloads" element={<DownloadsPage />} />
                <Route path="/library/recent" element={<RecentlyPlayedPage />} />
                <Route path="/library/following" element={<FollowingPage />} />
                <Route path="/listener/stats"   element={<ListenerStatsPage />} />
                <Route path="/listener/upgrade" element={<ListenerUpgradePage />} />
                <Route path="/library/playlists" element={<PlaylistsPage />} />
                <Route path="/library/playlists/join/:token" element={<PlaylistJoinPage />} />
                <Route path="/library/playlists/:id" element={<PlaylistDetailPage />} />
                <Route path="/community" element={<ChatRoomsPage />} />
                <Route path="/feed" element={<FeedPage />} />
                <Route path="/chat" element={<Navigate to="/community" replace />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/profile/edit" element={<UserProfilePage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/hub" element={<HubPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/album/:id" element={<AlbumDetailPage />} />
                <Route path="/track/:slug" element={<TrackDetailPage />} />
                <Route path="/affiliates" element={<AffiliatePage />} />
                <Route path="/payment/success" element={<PaymentSuccess />} />
                <Route path="/payment/cancel" element={<PaymentCancel />} />
                <Route path="/admin/affiliates"   element={<AdminAffiliates />} />
                <Route path="/admin/people"       element={<AdminPeople />} />
                <Route path="/admin/intelligence" element={<AdminIntelligence />} />
                <Route path="/admin/content"      element={<AdminContent />} />
                <Route path="/admin/growth"       element={<AdminGrowth />} />
                <Route path="/beat/:slug" element={<BeatDetailPage />} />
                <Route path="/artist/:slug" element={<ArtistProfilePage />} />
                <Route path="/artist/:slug/merch" element={<MerchPage />} />
                <Route path="/artist/:slug/merch/checkout" element={<MerchCheckoutPage />} />
                <Route path="/artist/:slug/merch/orders" element={<MerchOrdersPage />} />

                <Route path="/track/:slug" element={<TrackPage />} />
                <Route path="/collab-radar" element={<CollabRadarPage />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/artists" element={<AdminArtists />} />
                <Route path="/admin/analytics" element={<AdminAnalytics />} />
                <Route path="/admin/moderation" element={<AdminModeration />} />
                <Route path="/admin/boost" element={<AdminBoost />} />
                <Route path="/admin/broadcast" element={<AdminBroadcast />} />
                <Route path="/admin/behavior" element={<AdminUserBehaviorPage />} />
                <Route path="/admin/duplicates" element={<AdminDuplicates />} />
                <Route path="/admin/competitions" element={<AdminCompetitions />} />
                <Route path="/admin/engagement" element={<AdminEngagement />} />
               

                {/* Catch-all: unknown routes redirect home */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
            </OnboardingGuard>
            </TierProvider>
          </PlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}