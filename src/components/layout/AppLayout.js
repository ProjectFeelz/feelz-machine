import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import MobileNav from './MobileNav';
import DesktopSidebar from './DesktopSidebar';
import DesktopPlayer from './DesktopPlayer';
import MiniPlayer from './MiniPlayer';
import FullPlayer from './FullPlayer';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { Bell } from 'lucide-react';
import useNotifications from '../contexts/useNotifications';

function MobileBellButton() {
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-end px-4 pt-3">
      <button
        onClick={() => navigate('/notifications')}
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition">
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

export default function AppLayout() {
  const { currentTrack } = usePlayer();
  const { user, hasProfile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    const publicPaths = ['/login', '/setup', '/privacy-policy', '/terms-of-use'];
    if (user && !hasProfile && !publicPaths.includes(location.pathname)) {
      navigate('/setup');
    }
  }, [user, hasProfile, loading, location.pathname]);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Desktop sidebar */}
      <DesktopSidebar />

      {/* Mobile top bar (notification bell) */}
      <MobileBellButton />

      {/* Main content */}
      <main
        className="w-full md:w-[calc(100%-256px)] md:ml-64"
        style={{
          paddingBottom: currentTrack ? '152px' : '80px',
        }}>
        {/* Desktop: add bottom padding for player bar */}
        <style>{`
          @media (min-width: 768px) {
            main { padding-bottom: ${currentTrack ? '100px' : '0px'} !important; }
          }
        `}</style>
        <div className="md:px-8 md:pt-8 w-full">
          <Outlet />
        </div>
      </main>

      {/* Players */}
      <FullPlayer />
      <DesktopPlayer />

      {/* Mobile only */}
      <MiniPlayer />
      <MobileNav />
    </div>
  );
}
