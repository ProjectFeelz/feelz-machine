import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Library, LayoutDashboard, Sparkles, Plus, DollarSign } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useHaptics } from '../../hooks/useHaptics';
import CreateMenuModal from '../CreateMenuModal';
import ListenerCreateMenu from '../ListenerCreateMenu';

export default function MobileNav() {
  const navigate        = useNavigate();
  const location        = useLocation();
  const { user, artist, isBeatmaker, isArtist, isListener } = useAuth();
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);
  const [showCreateMenu, setShowCreateMenu] = React.useState(false);

  React.useEffect(() => {
    if (!window.visualViewport) return;
    const check = () => {
      const viewportHeight = window.visualViewport.height;
      const windowHeight   = window.innerHeight;
      // Keyboard open when viewport shrinks by >20% OR more than 100px
      // Catches SwiftKey, Gboard, default iOS keyboard on all screen sizes
      const shrunkRatio = viewportHeight / windowHeight < 0.8;
      const shrunkAbs   = windowHeight - viewportHeight > 100;
      setKeyboardOpen(shrunkRatio || shrunkAbs);
    };
    window.visualViewport.addEventListener('resize', check);
    return () => window.visualViewport.removeEventListener('resize', check);
  }, []);

  const { tap }         = useHaptics();

  const handleNav = (path) => {
    tap();
    if (path === '/library' && !user) { navigate('/login'); return; }
    navigate(path);
  };

  if (location.pathname === '/login' || location.pathname === '/signup') return null;
  if (keyboardOpen) return null;
  // Build nav items based on role
  const navItems = [
    { path: '/',             icon: Sparkles,        label: 'For You',   tourKey: 'nav-foryou'   },
    { path: '/browse',       icon: Search,          label: 'Browse',    tourKey: 'nav-browse'   },
    // Center plus — everyone gets one, but artists/beatmakers and
    // listeners see different menus (handled at render time below)
    { special: 'plus', tourKey: 'nav-create' },
    { path: '/library',      icon: Library,         label: 'Library',   tourKey: 'nav-library'  },
    // Hub for artists/beatmakers, Affiliate Program for listeners — either
    // way everyone ends up with 5 items so the plus sits at a true center
    ...(isArtist || isBeatmaker
      ? [{ path: '/hub', icon: LayoutDashboard, label: isBeatmaker ? 'Studio' : 'Hub', tourKey: 'nav-hub' }]
      : [{ path: '/affiliates', icon: DollarSign, label: 'Earn', tourKey: 'nav-affiliate' }]),
  ];

  return (
    <nav
      className="md:hidden fixed left-0 right-0 z-50 bg-black/95 backdrop-blur-xl"
      style={{
        paddingBottom: 'var(--safe-area-bottom, 0px)',
        bottom: 0,
      }}
    >
      <div className="flex items-center justify-around h-16 w-full mx-auto px-1">
        {navItems.map((item) => {
          if (item.special === 'plus') {
            return (
              <button
                key="plus"
                data-tour={item.tourKey}
                onClick={() => { tap(); setShowCreateMenu(true); }}
                className="flex flex-col items-center justify-center flex-1 h-full transition-all active:scale-90"
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center -mt-5 shadow-lg"
                  style={{ backgroundColor: '#90AF2F', boxShadow: '0 4px 16px rgba(144,175,47,0.4)' }}
                >
                  <Plus className="w-6 h-6 text-black" strokeWidth={2.5} />
                </div>
              </button>
            );
          }
          const { path, icon: Icon, label, tourKey } = item;
          const isActive = location.pathname === path ||
            (path !== '/' && location.pathname.startsWith(path)) ||
            (path === '/' && location.pathname === '/for-you');
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
      {showCreateMenu && (isArtist || isBeatmaker) && (
        <CreateMenuModal
          artist={artist}
          user={user}
          onClose={() => setShowCreateMenu(false)}
        />
      )}
      {showCreateMenu && !isArtist && !isBeatmaker && (
        <ListenerCreateMenu onClose={() => setShowCreateMenu(false)} />
      )}
    </nav>
  );
}