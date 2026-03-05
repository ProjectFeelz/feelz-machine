import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Library, LayoutDashboard, User, Users, MessageCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBell from '../NotificationBell';

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/browse', icon: Search, label: 'Browse' },
  { path: '/community', icon: Users, label: 'Community' },
  { path: '/library', icon: Library, label: 'Library' },
  { path: '/hub', icon: LayoutDashboard, label: 'Hub' },
  { path: '/profile', icon: User, label: 'Profile' },
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

export default function DesktopSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, artist } = useAuth();

  const handleNav = (path) => {
    if ((path === '/library' || path === '/profile') && !user) {
      navigate('/login');
      return;
    }
    navigate(path);
  };

  return (
    <aside className="hidden md:flex flex-col w-64 fixed left-0 top-0 bottom-0 z-40"
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
          <p className="text-[10px] text-white/30">Music Platform</p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6 mb-4 h-px bg-white/[0.05]" />

      {/* Nav links */}
      <nav className="flex-1 px-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path ||
            (path !== '/' && location.pathname.startsWith(path));
          return (
            <button key={path} onClick={() => handleNav(path)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all text-left group ${
                isActive
                  ? 'text-white'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/[0.04]'
              }`}
              style={isActive ? {
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(8px)',
              } : {}}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                isActive ? 'bg-white/10' : 'group-hover:bg-white/[0.04]'
              }`}>
                <Icon className={`w-4 h-4 flex-shrink-0 transition-colors`}
                  strokeWidth={isActive ? 2.2 : 1.5} />
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

        {/* Notifications row */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/[0.03] transition">
          <span className="text-xs text-white/30 font-medium">Notifications</span>
          <NotificationBell />
        </div>

        {/* Artist card */}
        {artist && (
          <button onClick={() => navigate(`/artist/${artist.slug}`)}
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
              <p className="text-[10px] text-white/25">View profile →</p>
            </div>
          </button>
        )}

        {!user && (
          <button onClick={() => navigate('/login')}
            className="w-full px-3 py-2.5 rounded-xl text-xs text-white/50 hover:text-white/80 transition-all"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            Sign in to continue
          </button>
        )}
      </div>
    </aside>
  );
}
