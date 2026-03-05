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
    <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
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
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
          style={{ backgroundColor: '#8CAB2E' }}>
          <Logo />
        </div>
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
