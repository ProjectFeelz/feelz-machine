import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import MobileNav from './MobileNav';
import DesktopSidebar from './DesktopSidebar';
import DesktopPlayer from './DesktopPlayer';
import MiniPlayer from './MiniPlayer';
import FullPlayer from './FullPlayer';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { Bell, Music } from 'lucide-react';
import useNotifications from '../../contexts/useNotifications';

const NAV_HEIGHT = 64;
const MINI_PLAYER_HEIGHT = 64;
const NAV_WITH_PLAYER = NAV_HEIGHT + MINI_PLAYER_HEIGHT;

// ── Dynamic title map ────────────────────────────────────────────────────────
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
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];

  // Artist profile pages: /artist/:slug
  if (pathname.startsWith('/artist/')) {
    const slug = pathname.split('/artist/')[1]?.split('/')[0];
    if (slug) {
      const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return name;
    }
  }

  // Album pages: /album/:id
  if (pathname.startsWith('/album/')) return 'Album';

  // Playlist detail: /library/playlists/:id
  if (pathname.startsWith('/library/playlists/')) return 'Playlist · Library';

  // Chat room: /chat/:roomId
  if (pathname.startsWith('/chat/')) return 'Chat Room';

  // Prefix match fallback
  const prefix = Object.keys(PAGE_TITLES).find(k =>
    k !== '/' && pathname.startsWith(k + '/')
  );
  if (prefix) return PAGE_TITLES[prefix];

  return null;
}

// ── Splash screen ────────────────────────────────────────────────────────────
function SplashScreen() {
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <img
          src="/logo.png"
          alt="Feelz Machine"
          className="w-20 h-20 rounded-2xl shadow-2xl"
        />
        <div className="space-y-1 text-center">
          <p className="text-white font-bold text-xl tracking-tight">Feelz Machine</p>
          <p className="text-white/30 text-xs">Loading...</p>
        </div>
        <div className="flex space-x-1 mt-2">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Bell button ───────────────────────────────────────────────────────────────
function MobileBellButton() {
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-end px-4 pt-3 pointer-events-none">
      <button
        onClick={() => navigate('/notifications')}
        aria-label="Notifications"
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition pointer-events-auto">
        <Bell className="w-5 h-5 text-white/60" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function AppLayout() {
  const { currentTrack } = usePlayer();
  const { user, hasProfile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Show splash while auth is resolving
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (!loading) {
      // Small delay so splash doesn't flash for <100ms on fast connections
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

  // Show splash until auth has resolved
  if (!splashDone) return <SplashScreen />;

  return (
    <div className="min-h-screen bg-black text-white">
      <DesktopSidebar />
      <MobileBellButton />
      <main
        className="w-full md:w-[calc(100%-256px)] md:ml-64"
        style={{ paddingBottom: mobilePaddingBottom, WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <style>{`
          @media (min-width: 768px) {
            main {
              padding-bottom: ${currentTrack ? '100px' : '0px'} !important;
            }
          }
        `}</style>
        <div className="md:px-8 md:pt-8 w-full">
          <Outlet />
        </div>
      </main>
      <FullPlayer />
      <DesktopPlayer />
      <MiniPlayer />
      <MobileNav />
    </div>
  );
}
