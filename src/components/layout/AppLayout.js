import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import MobileNav from './MobileNav';
import DesktopSidebar from './DesktopSidebar';
import MiniPlayer from './MiniPlayer';
import FullPlayer from './FullPlayer';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBell from '../NotificationBell';

export default function AppLayout() {
  const { currentTrack } = usePlayer();
  const { user, artist, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    const publicPaths = ['/login', '/setup', '/privacy-policy', '/terms-of-use'];
    if (user && !artist && !publicPaths.includes(location.pathname)) {
      navigate('/setup');
    }
  }, [user, artist, loading, location.pathname]);

  return (
    <div className="min-h-screen bg-black text-white">
      <DesktopSidebar />

      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-end px-4 pt-3">
        <NotificationBell />
      </div>

      <main
        className="w-full md:ml-56"
        style={{ paddingBottom: currentTrack ? '140px' : '90px' }}
      >
        <div className="md:px-8">
          <Outlet />
        </div>
      </main>

      <FullPlayer />

      <div className="md:ml-56">
        <MiniPlayer />
      </div>

      <MobileNav />
    </div>
  );
}
