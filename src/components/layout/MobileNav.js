import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Library, LayoutDashboard, User, Users, Info } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useHaptics } from '../../hooks/useHaptics';
import useNotifications from '../../contexts/useNotifications';

const navItems = [
  { path: '/',          icon: Home,            label: 'Home',      tourKey: 'nav-home' },
  { path: '/browse',    icon: Search,          label: 'Browse',    tourKey: 'nav-browse' },
  { path: '/community', icon: Users,           label: 'Community', tourKey: 'nav-community' },
  { path: '/library',   icon: Library,         label: 'Library',   tourKey: 'nav-library' },
  { path: '/hub',       icon: LayoutDashboard, label: 'Hub',       tourKey: 'nav-hub' },
  { path: '/profile',   icon: User,            label: 'Profile',   tourKey: 'nav-profile' },
];

export default function MobileNav() {
  const navigate        = useNavigate();
  const location        = useLocation();
  const { user }        = useAuth();
  const { tap }         = useHaptics();
  const { unreadCount } = useNotifications();

  const handleNav = (path) => {
    tap();
    if ((path === '/library' || path === '/community' || path === '/profile') && !user) {
      navigate('/login');
      return;
    }
    navigate(path);
  };

  if (location.pathname === '/login' || location.pathname === '/signup') return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black"
      style={{ paddingBottom: 'var(--safe-area-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-14 w-full mx-auto px-1">
        {navItems.map(({ path, icon: Icon, label, tourKey }) => {
          const isActive  = location.pathname === path ||
            (path !== '/' && location.pathname.startsWith(path));
          const showBadge = path === '/hub' && unreadCount > 0;

          return (
            <button
              key={path}
              data-tour={tourKey}
              onClick={() => handleNav(path)}
              className="flex flex-col items-center justify-center flex-1 h-full transition-all active:scale-90"
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-colors ${isActive ? 'text-white' : 'text-white/40'}`}
                  strokeWidth={isActive ? 2.2 : 1.5}
                />
                {showBadge && (
                  <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 rounded-full bg-red-500 flex items-center justify-center text-[8px] font-bold text-white px-0.5 leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[9px] mt-0.5 transition-colors ${isActive ? 'text-white font-medium' : 'text-white/40'}`}>
                {label}
              </span>
            </button>
          );
        })}

        {/* About */}
        <button
          onClick={() => { tap(); navigate('/about'); }}
          className="flex flex-col items-center justify-center flex-1 h-full transition-all active:scale-90"
        >
          <Info
            className={`w-5 h-5 transition-colors ${location.pathname === '/about' ? 'text-white' : 'text-white/40'}`}
            strokeWidth={location.pathname === '/about' ? 2.2 : 1.5}
          />
          <span className={`text-[9px] mt-0.5 transition-colors ${location.pathname === '/about' ? 'text-white font-medium' : 'text-white/40'}`}>
            About
          </span>
        </button>
      </div>
    </nav>
  );
}
