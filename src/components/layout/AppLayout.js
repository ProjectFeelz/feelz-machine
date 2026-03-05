import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import MobileNav from './MobileNav';
import DesktopSidebar from './DesktopSidebar';
import DesktopPlayer from './DesktopPlayer';
import MiniPlayer from './MiniPlayer';
import FullPlayer from './FullPlayer';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBell from '../NotificationBell';

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
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-end px-4 pt-3">
        <NotificationBell />
      </div>

      {/* Main content */}
      <main
        className="w-full md:ml-64"
        style={{
          paddingBottom: currentTrack ? '152px' : '80px',
        }}>
        {/* Desktop: add bottom padding for player bar */}
        <style>{`
          @media (min-width: 768px) {
            main { padding-bottom: ${currentTrack ? '100px' : '0px'} !important; }
          }
        `}</style>
        <div className="md:px-8 md:pt-8">
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
