import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Library, LayoutDashboard, User, Trophy, Info, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Bell } from 'lucide-react';
import useNotifications from '../../contexts/useNotifications';
import { supabase } from '../../supabaseClient';

const navItems = [
  { path: '/',             icon: Sparkles,        label: 'For You' },
  { path: '/home',         icon: Home,            label: 'Home' },
  { path: '/browse',       icon: Search,          label: 'Browse' },
  { path: '/competitions', icon: Trophy,          label: 'Competitions' },
  { path: '/library',      icon: Library,         label: 'Library' },
  { path: '/hub',          icon: LayoutDashboard, label: 'Hub' },
  { path: '/profile',      icon: User,            label: 'Profile' },
];

function Logo() {
  return (
    <svg width="36" height="36" viewBox="0 0 64 64" fill="none">
      <rect width="64" height="64" rx="14" fill="#0d0d0d"/>
      <rect x="1" y="1" width="62" height="62" rx="13" stroke="#8CAB2E" strokeWidth="2.5"/>
      <text x="32" y="40" fontFamily="Arial Black, Impact, sans-serif" fontSize="26" fontWeight="900" fill="#8CAB2E" textAnchor="middle" letterSpacing="-2">FM</text>
      <rect x="16" y="44" width="32" height="2.5" rx="1.25" fill="#8CAB2E" opacity="0.4"/>
    </svg>
  );
}

function DesktopNotifButton() {
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/notifications')}
      aria-label="Notifications"
      className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/[0.04] transition">
      <span className="text-xs text-white/55 font-medium">Notifications</span>
      <div className="relative">
        <Bell className="w-4 h-4 text-white/55" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center text-[8px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>
    </button>
  );
}

function PlayStoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.18 23.76a2.5 2.5 0 0 0 2.35-.28l11.05-6.37-3.08-3.08zM1.5 1.3C1.19 1.64 1 2.16 1 2.83v18.34c0 .67.19 1.19.5 1.53l.08.08 10.27-10.27v-.24L1.58 1.22zM20.37 9.96l-2.68-1.55-3.42 3.42 3.42 3.42 2.7-1.56c.77-.44.77-1.16 0-1.6zM5.53.52L16.58 6.9l-3.08 3.08L5.53.52z"/>
    </svg>
  );
}

function AppStoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

export default function DesktopSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, artist } = useAuth();
  const [playStoreUrl, setPlayStoreUrl] = useState('');
  const [appStoreUrl, setAppStoreUrl] = useState('');

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['play_store_url', 'app_store_url'])
      .then(({ data }) => {
        (data || []).forEach(row => {
          if (row.key === 'play_store_url') setPlayStoreUrl(row.value || '');
          if (row.key === 'app_store_url') setAppStoreUrl(row.value || '');
        });
      });
  }, []);

  const handleNav = (path) => {
    if ((path === '/library' || path === '/profile') && !user) {
      navigate('/login');
      return;
    }
    navigate(path);
  };

  const hasAppButtons = playStoreUrl || appStoreUrl;

  return (
    <aside
      className="hidden md:flex flex-col w-64 fixed left-0 top-0 bottom-0 z-40"
      style={{
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>

      {/* Logo */}
      <div className="flex items-center space-x-3 px-6 py-6 flex-shrink-0">
        <Logo />
        <div>
          <span className="text-sm font-bold text-white tracking-tight">Feelz Machine</span>
          <p className="text-xs text-white/55">Music Platform</p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6 mb-4 h-px bg-white/[0.05]" />

      {/* Nav links */}
      <nav className="flex-1 px-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path || (path !== '/' && location.pathname.startsWith(path)) || (path === '/' && location.pathname === '/for-you');
          return (
            <button
              key={path}
              onClick={() => handleNav(path)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all text-left group ${
                isActive ? 'text-white' : 'text-white/60 hover:text-white/80 hover:bg-white/[0.04]'
              }`}
              style={isActive ? { background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' } : {}}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                isActive ? 'bg-white/10' : 'group-hover:bg-white/[0.04]'
              }`}>
                <Icon className="w-4 h-4 flex-shrink-0 transition-colors" strokeWidth={isActive ? 2.2 : 1.5} />
              </div>
              <span className={`text-sm transition-all ${isActive ? 'font-semibold' : 'font-normal'}`}>
                {label}
              </span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-4 pb-6 space-y-2 flex-shrink-0">
        <div className="mx-2 mb-3 h-px bg-white/[0.05]" />

        {/* Notifications */}
        <DesktopNotifButton />

        {/* App Store buttons */}
        {hasAppButtons && (
          <div className="space-y-1.5 px-1">
            {playStoreUrl && (
              <a href={playStoreUrl} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition text-left"
                style={{ textDecoration: 'none' }}>
                <div className="w-5 h-5 flex items-center justify-center text-white/60 flex-shrink-0">
                  <PlayStoreIcon />
                </div>
                <div>
                  <p className="text-[9px] text-white/45 leading-none">GET IT ON</p>
                  <p className="text-xs text-white/50 font-medium leading-tight">Google Play</p>
                </div>
              </a>
            )}
            {appStoreUrl && (
              <a href={appStoreUrl} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition text-left"
                style={{ textDecoration: 'none' }}>
                <div className="w-5 h-5 flex items-center justify-center text-white/60 flex-shrink-0">
                  <AppStoreIcon />
                </div>
                <div>
                  <p className="text-[9px] text-white/45 leading-none">DOWNLOAD ON THE</p>
                  <p className="text-xs text-white/50 font-medium leading-tight">App Store</p>
                </div>
              </a>
            )}
          </div>
        )}

        {/* About link */}
        <button
          onClick={() => navigate('/about')}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/[0.04] transition"
          style={location.pathname === '/about' ? { background: 'rgba(255,255,255,0.06)' } : {}}>
          <span className="text-xs text-white/55 font-medium">About</span>
          <Info className="w-4 h-4 text-white/55" />
        </button>

        {/* Artist card */}
        {artist && (
          <button
            onClick={() => navigate(`/artist/${artist.slug}`)}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-all group"
            style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex-shrink-0 ring-2 ring-white/10">
              {artist.profile_image_url
                ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center">
                    <span className="text-xs font-bold text-white/60">{artist.artist_name?.[0]}</span>
                  </div>
              }
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold text-white/70 group-hover:text-white truncate transition-colors">
                {artist.artist_name}
              </p>
              <p className="text-xs text-white/25">View profile →</p>
            </div>
          </button>
        )}

        {!user && (
          <button
            onClick={() => navigate('/login')}
            className="w-full px-3 py-2.5 rounded-xl text-xs text-white/50 hover:text-white/80 transition-all"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            Sign in to continue
          </button>
        )}
      </div>
    </aside>
  );
}