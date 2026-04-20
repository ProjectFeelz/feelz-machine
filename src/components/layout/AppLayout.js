import React, { useEffect, useState, useContext } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import MobileNav from './MobileNav';
import DesktopSidebar from './DesktopSidebar';
import DesktopPlayer from './DesktopPlayer';
import MiniPlayer from './MiniPlayer';
import FullPlayer from './FullPlayer';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { Bell, Flame, UserCircle } from 'lucide-react';
import useNotifications from '../../contexts/useNotifications';
import { OfflineBanner } from '../../hooks/useOffline';
import ErrorBoundary from '../ErrorBoundary';
import AppTour, { useTourState } from '../AppTour';
import { useStreak } from '../../hooks/useStreak';
import { StreakContext } from '../../contexts/StreakContext';
import InstallPrompt from '../InstallPrompt';

const NAV_HEIGHT         = 64;
const MINI_PLAYER_HEIGHT = 64;
const NAV_WITH_PLAYER    = NAV_HEIGHT + MINI_PLAYER_HEIGHT;

// ── Dynamic title map ─────────────────────────────────────────────────────────
const PAGE_TITLES = {
  '/':                    'Home',
  '/browse':              'Browse',
  '/library':             'Library',
  '/library/likes':       'Liked Songs',
  '/library/downloads':   'Downloads',
  '/library/recent':      'Recently Played',
  '/library/following':   'Following',
  '/library/playlists':   'Playlists',
  '/community':           'Community',
  '/hub':                 'Hub',
  '/profile':             'Profile',
  '/profile/edit':        'Edit Profile',
  '/notifications':       'Notifications',
  '/chat':                'Chat',
  '/dashboard':           'Artist Dashboard',
  '/upgrade':             'Upgrade',
  '/about':               'About',
  '/admin':               'Admin',
  '/admin/artists':       'All Artists · Admin',
  '/admin/analytics':     'Analytics · Admin',
  '/admin/moderation':    'Moderation · Admin',
  '/admin/boost':         'Boost Manager · Admin',
  '/admin/broadcast':     'Broadcast · Admin',
  '/admin/behavior':      'User Behavior · Admin',
  '/privacy-policy':      'Privacy Policy',
  '/terms-of-use':        'Terms of Use',
};

const BASE_TITLE = 'Feelz Machine';

function getTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/artist/')) {
    const slug = pathname.split('/artist/')[1]?.split('/')[0];
    if (slug) return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  if (pathname.startsWith('/album/'))             return 'Album';
  if (pathname.startsWith('/library/playlists/')) return 'Playlist · Library';
  if (pathname.startsWith('/chat/'))              return 'Chat Room';
  const prefix = Object.keys(PAGE_TITLES).find(k => k !== '/' && pathname.startsWith(k + '/'));
  if (prefix) return PAGE_TITLES[prefix];
  return null;
}

// ── Splash screen ─────────────────────────────────────────────────────────────
function SplashScreen() {
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <img src="/logo.png" alt="Feelz Machine" className="w-20 h-20 rounded-2xl shadow-2xl" />
        <div className="space-y-1 text-center">
          <p className="text-white font-bold text-xl tracking-tight">Feelz Machine</p>
          <p className="text-white/30 text-xs">Loading...</p>
        </div>
        <div className="flex space-x-1 mt-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Bell button ───────────────────────────────────────────────────────────────
function MobileBellButton() {
  const { unreadCount } = useNotifications();
  const { streak } = useContext(StreakContext);
  const { user, artist, isArtist } = useAuth();
  const navigate = useNavigate();

  const profilePath = isArtist && artist?.slug
    ? `/artist/${artist.slug}`
    : '/profile';

  if (!user) return null;

  return (
    <div
      className="md:hidden fixed top-0 left-0 right-0 z-[60] flex items-center justify-end px-4 pointer-events-none"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: 'calc(env(safe-area-inset-top, 0px) + 44px)' }}
    >
      <div className="flex items-center space-x-1.5 pointer-events-auto">
        {/* Streak flame */}
        {streak > 1 && (
          <div className="flex items-center space-x-1 px-2 py-1 rounded-full bg-orange-500/15 border border-orange-500/25">
            <Flame className="w-3 h-3 text-orange-400" />
            <span className="text-xs font-bold text-orange-400">{streak}</span>
          </div>
        )}

        {/* Notifications bell */}
        <button
          onClick={() => navigate('/notifications')}
          aria-label="Notifications"
          className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition"
        >
          <Bell className="w-5 h-5 text-white/60" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Profile shortcut */}
        <button
          onClick={() => navigate(profilePath)}
          aria-label="Profile"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition overflow-hidden"
        >
          {(isArtist ? artist?.profile_image_url : null) ? (
            <img
              src={artist.profile_image_url}
              alt="Profile"
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <UserCircle className="w-5 h-5 text-white/60" />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function AppLayout() {
  const { currentTrack }            = usePlayer();
  const { user, hasProfile, loading, isArtist } = useAuth();
  const navigate                    = useNavigate();
  const location                    = useLocation();
  const [splashDone, setSplashDone] = useState(false);

  // Daily streak — fires ONCE here; all other components read from StreakContext
  const streakValue = useStreak(user);

  // Tour — fires once per account type after first sign-up
  const { show: showTour, dismiss: dismissTour } = useTourState(isArtist, !loading);

  // Splash: wait for auth, then small buffer to avoid flash
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setSplashDone(true), 300);
      return () => clearTimeout(t);
    }
  }, [loading]);

  // Auth guard
  useEffect(() => {
    if (loading) return;
    const publicPaths = ['/login', '/setup', '/privacy-policy', '/terms-of-use', '/terms'];
    if (user && !hasProfile && !publicPaths.includes(location.pathname)) {
      navigate('/setup');
    }
  }, [user, hasProfile, loading, location.pathname]);

  // Dynamic page titles
  useEffect(() => {
    const title = getTitle(location.pathname);
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
  }, [location.pathname]);

  const mobilePaddingBottom = currentTrack ? NAV_WITH_PLAYER : NAV_HEIGHT;

  if (!splashDone) return <SplashScreen />;

  return (
    <StreakContext.Provider value={streakValue}>
    <div className="min-h-screen bg-black text-white">
      {/* Offline detection — fixed banner, renders above everything */}
      <OfflineBanner />

      <DesktopSidebar />
      <MobileBellButton />

      <main
        className="w-full md:w-[calc(100%-256px)] md:ml-64"
        style={{
          paddingBottom: `calc(${mobilePaddingBottom}px + var(--safe-area-bottom, 0px))`,
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        <style>{`
          @media (min-width: 768px) {
            main { padding-bottom: ${currentTrack ? '100px' : '0px'} !important; }
          }
        `}</style>
        <div className="md:px-8 md:pt-8 w-full">
          {/* Error boundary — catches crashes in any page, shows friendly recovery */}
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      <FullPlayer />
      <DesktopPlayer />
      <MiniPlayer />
      <MobileNav />

      {/* First-time onboarding tour — only shows once, after splash is done */}
      {showTour && splashDone && !loading && hasProfile && (
  <AppTour isArtist={isArtist} onDone={dismissTour} />
)}
      <InstallPrompt />
    </div>
    </StreakContext.Provider>
  );
}