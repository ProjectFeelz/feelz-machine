import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Library, LayoutDashboard, User, Info, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Bell } from 'lucide-react';
import useNotifications from '../../contexts/useNotifications';
import { myAvatar, myName, myInitial } from '../../utils/me';

// navItems built dynamically in component based on role

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

// The Google Play and App Store buttons lived here. Feelz Machine is a PWA and
// is staying one, so there is nothing to send anyone to a store for. The
// platform_settings keys play_store_url and app_store_url are no longer read by
// anything in the app; they are left in the database rather than dropped, so
// this is a code change and not a data migration.

export default function DesktopSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, artist, listener, isBeatmaker, isArtist } = useAuth();

  const navItems = [
    { path: '/',             icon: Sparkles,        label: 'For You' },
    { path: '/home',         icon: Home,            label: 'Home' },
    { path: '/browse',       icon: Search,          label: 'Browse' },
    { path: '/library',      icon: Library,         label: 'Library' },
    ...(isArtist || isBeatmaker
      ? [{ path: '/hub', icon: LayoutDashboard, label: isBeatmaker ? 'Studio' : 'Hub' }]
      : []),
    { path: '/profile',      icon: User,            label: 'Profile' },
  ];

  const handleNav = (path) => {
    if ((path === '/library' || path === '/profile') && !user) {
      navigate('/login');
      return;
    }
    navigate(path);
  };

  return (
    <aside
      className="hidden md:flex flex-col w-64 fixed left-0 top-0 bottom-0 z-40 border-r border-white/[0.06]"
      style={{
        background: 'rgba(14,14,16,0.94)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '8px 0 32px rgba(0,0,0,0.5)',
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

        {/* About link */}
        <button
          onClick={() => navigate('/about')}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/[0.04] transition"
          style={location.pathname === '/about' ? { background: 'rgba(255,255,255,0.06)' } : {}}>
          <span className="text-xs text-white/55 font-medium">About</span>
          <Info className="w-4 h-4 text-white/55" />
        </button>

        {/* Account card.
            Was gated on `{artist && ...}`, so a listener got no card at all:
            no picture, no name, nothing to click. It renders for anybody
            signed in now, and the picture and name come from the shared
            resolver in src/utils/me.js rather than from the artist row. */}
        {user && (
          <button
            onClick={() => navigate(artist?.slug ? `/artist/${artist.slug}` : `/listener/${user.id}`)}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-all group"
            style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex-shrink-0 ring-2 ring-white/10">
              {myAvatar({ artist, listener, user })
                ? <img src={myAvatar({ artist, listener, user })} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center">
                    <span className="text-xs font-bold text-white/60">{myInitial({ artist, listener, user })}</span>
                  </div>
              }
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold text-white/70 group-hover:text-white truncate transition-colors">
                {myName({ artist, listener, user })}
              </p>
              <p className="text-xs text-white/25">View profile →</p>
            </div>
          </button>
        )}

        {!user && (
          <button
            onClick={() => navigate('/login')}
            className="w-full px-4 py-3 rounded-xl text-sm font-bold text-black transition hover:opacity-90 active:scale-[0.98]"
            style={{ background: 'white' }}>
            Sign in
          </button>
        )}
      </div>
    </aside>
  );
}