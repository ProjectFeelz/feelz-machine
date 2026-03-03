import React from 'react';
import { Outlet } from 'react-router-dom';
import MobileNav from './MobileNav';
import MiniPlayer from './MiniPlayer';
import FullPlayer from './FullPlayer';
import { usePlayer } from '../../contexts/PlayerContext';
import NotificationBell from '../NotificationBell';

export default function AppLayout() {
  const { currentTrack } = usePlayer();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Centered container with breathing room on all sides */}
      <main
        className="w-full max-w-5xl mx-auto"
        style={{ paddingBottom: currentTrack ? '140px' : '90px' }}
      >
        <div className="fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-end px-4 pt-3">
  <NotificationBell />
</div>
<Outlet />

      </main>

      {/* Full screen player overlay */}
      <FullPlayer />

      {/* Mini player (above nav) */}
      <MiniPlayer />

      {/* Bottom navigation */}
      <MobileNav />
    </div>
  );
}
