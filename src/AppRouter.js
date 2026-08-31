import React, { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PlayerProvider } from './contexts/PlayerContext';
import { TierProvider } from './contexts/useTier';
import { useSessionRefresh } from './useSessionRefresh';
import { useActivityPing } from './useActivityPing';
import AppLayout from './components/layout/AppLayout';
const AboutPage = React.lazy(() => import('./pages/AboutPage'));
const ComparisonPage = React.lazy(() => import('./pages/ComparisonPage'));
const HomePage = React.lazy(() => import('./pages/HomePage'));
const BrowsePage = React.lazy(() => import('./pages/BrowsePage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const LibraryPage = React.lazy(() => import('./pages/LibraryPage'));
const LikedSongsPage = React.lazy(() => import('./pages/LikedSongsPage'));
const DownloadsPage = React.lazy(() => import('./pages/DownloadsPage'));
const FollowingPage = React.lazy(() => import('./pages/FollowingPage'));
const PlaylistsPage = React.lazy(() => import('./pages/PlaylistsPage'));
const PlaylistDetailPage = React.lazy(() => import('./pages/PlaylistDetailPage'));
const PlaylistJoinPage = React.lazy(() => import('./pages/PlaylistJoinPage'));
const ListeningSessionPage = React.lazy(() => import('./pages/ListeningSessionPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const FeedPage = React.lazy(() => import('./pages/FeedPage'));
const ArtistDashboard = React.lazy(() => import('./pages/ArtistDashboard'));
const ArtistProfilePage = React.lazy(() => import('./pages/ArtistProfilePage'));
const TierUpgradePage = React.lazy(() => import('./pages/TierUpgradePage'));
const ChatRoomsPage = React.lazy(() => import('./pages/ChatRoomsPage'));
const ChatRoomView = React.lazy(() => import('./pages/ChatRoomView'));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfUse = React.lazy(() => import('./pages/TermsOfUse'));
const NotificationsPage = React.lazy(() => import('./pages/NotificationsPage'));
const HubPage = React.lazy(() => import('./pages/HubPage'));
const ProfileSetup = React.lazy(() => import('./pages/ProfileSetup'));
const ListenerStatsPage = React.lazy(() => import('./pages/ListenerStatsPage'));
const ListenerUpgradePage = React.lazy(() => import('./pages/ListenerUpgradePage'));
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const AdminArtists = React.lazy(() => import('./pages/AdminArtists'));
const AdminAnalytics = React.lazy(() => import('./pages/AdminAnalytics'));
const AdminModeration = React.lazy(() => import('./pages/AdminModeration'));
const AdminBoost = React.lazy(() => import('./pages/AdminBoost'));
const AdminBroadcast = React.lazy(() => import('./pages/AdminBroadcast'));
const RecentlyPlayedPage = React.lazy(() => import('./pages/RecentlyPlayedPage'));
const UserProfilePage = React.lazy(() => import('./pages/UserProfilePage'));
const AlbumDetailPage = React.lazy(() => import('./pages/AlbumDetailPage'));
const TrackDetailPage = React.lazy(() => import('./pages/TrackDetailPage'));
const AffiliatePage = React.lazy(() => import('./pages/AffiliatePage'));
const AdminAffiliates = React.lazy(() => import('./pages/AdminAffiliates'));
const AdminPeople = React.lazy(() => import('./pages/AdminPeople'));
const AdminIntelligence = React.lazy(() => import('./pages/AdminIntelligence'));
const AdminContent = React.lazy(() => import('./pages/AdminContent'));
const AdminGrowth = React.lazy(() => import('./pages/AdminGrowth'));
const BeatDetailPage = React.lazy(() => import('./pages/BeatDetailPage'));
const AdminUserBehaviorPage = React.lazy(() => import('./pages/AdminUserBehaviorPage'));
import { Helmet } from 'react-helmet-async';
const TrackPage = React.lazy(() => import('./pages/TrackPage'));
const CollabRadarPage = React.lazy(() => import('./pages/CollabRadarPage'));
const AdminDuplicates = React.lazy(() => import('./pages/AdminDuplicates'));
const CompetitionRoomPage = React.lazy(() => import('./pages/CompetitionRoomPage'));
const WheelRevealPage = React.lazy(() => import('./pages/WheelRevealPage'));
const ForYouPage = React.lazy(() => import('./pages/ForYouPage'));
const MerchPage = React.lazy(() => import('./pages/MerchPage'));
const MerchCheckoutPage = React.lazy(() => import('./pages/MerchCheckoutPage'));
const MerchOrdersPage = React.lazy(() => import('./pages/MerchOrdersPage'));
const CompetitionsPage = React.lazy(() => import('./pages/CompetitionsPage'));
const AdminCompetitions = React.lazy(() => import('./pages/AdminCompetitions'));
const AdminEngagement = React.lazy(() => import('./pages/AdminEngagement'));
const FanLeaderboardPage = React.lazy(() => import('./pages/FanLeaderboardPage'));
const RecentlyDiscoveredPage = React.lazy(() => import('./pages/RecentlyDiscoveredPage'));
const ListenerProfilePage = React.lazy(() => import('./pages/ListenerProfilePage'));
const SchoolSessionsPage = React.lazy(() => import('./pages/SchoolSessionsPage'));
const SchoolSessionsVotePage = React.lazy(() => import('./pages/SchoolSessionsVotePage'));
const AdminSchoolSessions = React.lazy(() => import('./pages/AdminSchoolSessions'));

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

// Wildcard fallback for anything no other route matches. Also handles
// /@username short URLs here specifically — React Router's pattern syntax
// can't express "@" immediately followed by a splat with no separating
// slash (confirmed: /@:slug never matches because the colon isn't right
// after a slash, and /@* isn't allowed because * must always follow a
// slash). Checking the raw pathname here, in the one place guaranteed to
// run last, sidesteps the limitation entirely instead of fighting it.
function NotFoundRedirect() {
  const location = useLocation();
  const atMatch = location.pathname.match(/^\/@(.+)$/);
  if (atMatch) {
    return <Navigate to={`/artist/${atMatch[1]}`} replace />;
  }
  return <Navigate to="/" replace />;
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
  const skipPaths = ['/setup', '/login', '/about', '/terms-of-use', '/privacy-policy', '/artist/', '/@', '/schoolsessions'];

  // Public paths always render immediately, regardless of auth loading state.
  // This matters specifically for the /@slug -> /artist/slug redirect: the URL
  // changes before auth finishes resolving, and without this check the
  // /artist/ skip only applied once loading was false — leaving a blank
  // render in between that looked like the page just wasn't going anywhere.
  if (skipPaths.some(p => location.pathname.startsWith(p))) return children;

  if (loading) return null;
  if (!user) return children;

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
            <Suspense fallback={<div style={{ minHeight: '100vh', background: '#000' }} />}>
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
              <Route path="/competition/:competitionId" element={<CompetitionRoomPage />} />
              <Route path="/session/:sessionId" element={<ListeningSessionPage />} />
              <Route path="/merch-connect-callback" element={<MerchConnectCallback />} />
              <Route path="/artist/:slug/fans" element={<FanLeaderboardPage />} />

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
              <Route path="/schoolsessions" element={
                <PageTitle title="School Sessions">
                  <SchoolSessionsPage />
                </PageTitle>
              } />
              <Route path="/schoolsessions/vote" element={
                <PageTitle title="Vote — School Sessions">
                  <SchoolSessionsVotePage />
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
                <Route path="/vs/:platform" element={<ComparisonPage />} />
                <Route path="/album/:id" element={<AlbumDetailPage />} />
                {/* TrackDetailPage consolidated into TrackPage below */}
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
                <Route path="/artist/:slug/fans" element={<FanLeaderboardPage />} />

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
                <Route path="/admin/school-sessions" element={<AdminSchoolSessions />} />
                <Route path="/admin/engagement" element={<AdminEngagement />} />
                <Route path="/library/discovered" element={<RecentlyDiscoveredPage />} />
                <Route path="/listener/:userId" element={<ListenerProfilePage />} />

                {/* Catch-all: unknown routes redirect home */}
                <Route path="*" element={<NotFoundRedirect />} />
              </Route>
            </Routes>
            </Suspense>
            </OnboardingGuard>
            </TierProvider>
          </PlayerProvider>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  );
}