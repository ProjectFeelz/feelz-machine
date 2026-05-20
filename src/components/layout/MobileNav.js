import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Library, LayoutDashboard, Trophy, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useHaptics } from '../../hooks/useHaptics';

const navItems = [
  { path: '/for-you',      icon: Sparkles,        label: 'For You',     tourKey: 'nav-foryou' },
  { path: '/browse',       icon: Search,          label: 'Browse',      tourKey: 'nav-browse' },
  { path: '/competitions', icon: Trophy,          label: 'Win',         tourKey: 'nav-competitions' },
  { path: '/library',      icon: Library,         label: 'Library',     tourKey: 'nav-library' },
  { path: '/hub',          icon: LayoutDashboard, label: 'Hub',         tourKey: 'nav-hub' },
];

export default function MobileNav() {
  const navigate        = useNavigate();
  const location        = useLocation();
  const { user }        = useAuth();
  const { tap }         = useHaptics();

  const handleNav = (path) => {
    tap();
    if (path === '/library' && !user) {
      navigate('/login');
      return;
    }
    navigate(path);
  };

  if (location.pathname === '/login' || location.pathname === '/signup') return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-xl"
      style={{ paddingBottom: 'var(--safe-area-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-16 w-full mx-auto px-1">
        {navItems.map(({ path, icon: Icon, label, tourKey }) => {
          const isActive  = location.pathname === path ||
            (path !== '/' && location.pathname.startsWith(path)) ||
            (path === '/for-you' && location.pathname === '/');
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

              </div>
              <span className={`text-[11px] mt-0.5 transition-colors ${isActive ? 'text-white font-semibold' : 'text-white/55'}`}>
                {label}
              </span>
            </button>
          );
        })}

      </div>
    </nav>
  );
}