import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Library, LayoutDashboard, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/browse', icon: Search, label: 'Browse' },
  { path: '/library', icon: Library, label: 'Library' },
  { path: '/hub', icon: LayoutDashboard, label: 'Hub' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export default function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const handleNav = (path) => {
    if ((path === '/library' || path === '/community' || path === '/profile') && !user) {
      navigate('/login');
      return;
    }
    navigate(path);
  };

  if (location.pathname === '/login' || location.pathname === '/signup') {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-black/95 backdrop-blur-xl">
      <div className="flex items-center justify-around h-14 max-w-sm mx-auto px-2">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path || 
            (path !== '/' && location.pathname.startsWith(path));
          
          return (
            <button
              key={path}
              onClick={() => handleNav(path)}
              className="flex flex-col items-center justify-center w-16 h-full transition-all"
            >
              <Icon
                className={`w-[22px] h-[22px] transition-colors ${
                  isActive ? 'text-white' : 'text-white/40'
                }`}
                strokeWidth={isActive ? 2.2 : 1.5}
              />
              <span
                className={`text-[10px] mt-0.5 transition-colors ${
                  isActive ? 'text-white font-medium' : 'text-white/40'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
      {/* Safe area spacer for phones with gesture bars */}
      <div className="h-3" />
    </nav>
  );
}
