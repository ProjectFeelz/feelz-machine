import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Library, LayoutDashboard, User, Music2, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBell from '../NotificationBell';

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/browse', icon: Search, label: 'Browse' },
  { path: '/library', icon: Library, label: 'Library' },
  { path: '/hub', icon: LayoutDashboard, label: 'Hub' },
  { path: '/profile', icon: User, label: 'Profile' },
];

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
    <aside className="hidden md:flex flex-col w-56 fixed left-0 top-0 bottom-0 z-40 border-r border-white/[0.06] bg-black">
      {/* Logo */}
      <div className="flex items-center space-x-2.5 px-5 py-6">
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
          <Music2 className="w-4 h-4 text-black" />
        </div>
        <span className="text-sm font-bold text-white tracking-tight">Feelz Machine</span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path ||
            (path !== '/' && location.pathname.startsWith(path));
          return (
            <button
              key={path}
              onClick={() => handleNav(path)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
              }`}>
              <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={isActive ? 2.2 : 1.5} />
              <span className={`text-sm ${isActive ? 'font-semibold' : 'font-normal'}`}>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom: artist card + notification */}
      <div className="px-3 pb-6 space-y-2">
        {/* Notifications */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-white/30">Notifications</span>
          <NotificationBell />
        </div>

        {/* Artist quick link */}
        {artist && (
          <button
            onClick={() => navigate(`/artist/${artist.slug}`)}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-all group">
            <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
              {artist.profile_image_url
                ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center">
                    <span className="text-xs font-bold text-white/60">{artist.artist_name?.[0]}</span>
                  </div>
              }
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium text-white/60 group-hover:text-white/80 truncate transition-colors">
                {artist.artist_name}
              </p>
              <p className="text-[10px] text-white/25">View profile</p>
            </div>
          </button>
        )}

        {!user && (
          <button
            onClick={() => navigate('/login')}
            className="w-full px-3 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all">
            Sign In
          </button>
        )}
      </div>
    </aside>
  );
}
