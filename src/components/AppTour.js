import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronRight, ChevronLeft, Check,
  Music, Users, Radio, Upload, BarChart3, Bell,
  Heart, Headphones, Home, Search, MessageCircle,
  LayoutDashboard, ChevronUp,
} from 'lucide-react';

// ── Tour step definitions ─────────────────────────────────────────────────────
// target: CSS selector for the element to spotlight (null = center overlay)
// arrow: 'up' | 'down' | 'left' | 'right' | null
// position: 'top' | 'bottom' | 'center' — where to show the card relative to target

const LISTENER_TOUR = [
  {
    id: 'welcome',
    title: 'Welcome to Feelz Machine 👋',
    body: "You're now part of an independent music community. Here's a quick tour of what's available to you.",
    icon: Headphones,
    color: '#8B5CF6',
    target: null,
  },
  {
    id: 'home',
    title: 'Home — Your Music Feed',
    body: 'Discover recommended tracks, new releases, trending music and artists to follow. It gets smarter as you listen.',
    icon: Home,
    color: '#06B6D4',
    target: '[data-tour="nav-home"]',
    arrow: 'down',
    cardPosition: 'top',
  },
  {
    id: 'browse',
    title: 'Browse — Explore Everything',
    body: 'Search tracks, artists and albums. Filter by genre, explore Trending, Featured and New Releases.',
    icon: Search,
    color: '#F59E0B',
    target: '[data-tour="nav-browse"]',
    arrow: 'down',
    cardPosition: 'top',
  },
  {
    id: 'community',
    title: 'Community — Connect With Artists',
    body: "See posts from artists you follow. Join chat rooms. Artists post updates, thoughts and exclusive content here.",
    icon: MessageCircle,
    color: '#10B981',
    target: '[data-tour="nav-community"]',
    arrow: 'down',
    cardPosition: 'top',
  },
  {
    id: 'library',
    title: 'Library — Your Music Collection',
    body: 'Liked tracks, playlists, downloads, recently played and the artists you follow. Everything you save lives here.',
    icon: Heart,
    color: '#EF4444',
    target: '[data-tour="nav-library"]',
    arrow: 'down',
    cardPosition: 'top',
  },
  {
    id: 'hub',
    title: 'Hub — Your Control Centre',
    body: 'Quick access to all features, your profile, notifications and settings. Start here whenever you need something.',
    icon: LayoutDashboard,
    color: '#8B5CF6',
    target: '[data-tour="nav-hub"]',
    arrow: 'down',
    cardPosition: 'top',
  },
  {
    id: 'player',
    title: 'The Music Player',
    body: "Tap any track to start playing. The full player opens automatically — swipe down to minimise it. Tap the Open button on the mini player to bring it back.",
    icon: Music,
    color: '#EC4899',
    target: null,
  },
  {
    id: 'done',
    title: "You're all set 🎵",
    body: 'Start browsing. The more you listen and like, the better your recommendations become. Enjoy the music.',
    icon: Check,
    color: '#10B981',
    target: null,
  },
];

const ARTIST_TOUR = [
  {
    id: 'welcome',
    title: 'Welcome, Artist 🎤',
    body: 'Feelz Machine is built for independent artists. Upload music, sell downloads, connect with fans and collaborate — no middleman.',
    icon: Music,
    color: '#8B5CF6',
    target: null,
  },
  {
    id: 'hub',
    title: 'Hub — Your Control Centre',
    body: 'Everything starts here. Upload tracks, manage collaborations, view analytics, access community and settings.',
    icon: LayoutDashboard,
    color: '#06B6D4',
    target: '[data-tour="nav-hub"]',
    arrow: 'down',
    cardPosition: 'top',
  },
  {
    id: 'upload',
    title: 'Upload Your Music',
    body: 'Singles, EPs, Albums, Mixtapes — all supported. WAV files auto-convert to 320kbps MP3. Set download prices or offer tracks free.',
    icon: Upload,
    color: '#F59E0B',
    target: null,
  },
  {
    id: 'browse',
    title: 'Browse — See Your Music Live',
    body: 'Once published, your tracks appear here. Trending is driven by streams, likes and downloads — get your fans listening.',
    icon: Search,
    color: '#10B981',
    target: '[data-tour="nav-browse"]',
    arrow: 'down',
    cardPosition: 'top',
  },
  {
    id: 'community',
    title: 'Community — Build Your Audience',
    body: 'Post updates to your feed. Create subscriber-only chat rooms. Fans who spend $5+ on your music get exclusive access.',
    icon: Users,
    color: '#EC4899',
    target: '[data-tour="nav-community"]',
    arrow: 'down',
    cardPosition: 'top',
  },
  {
    id: 'collabs',
    title: 'Collab Radar',
    body: 'Pro and Premium artists can use Collab Radar to find artists with matching genres and sound. Set your genre in Profile to activate it.',
    icon: Radio,
    color: '#8B5CF6',
    target: null,
  },
  {
    id: 'profile',
    title: 'Profile — Make It Yours',
    body: 'Set your banner, bio, genre, mood, social links and custom theme. Your profile is your public artist page.',
    icon: Music,
    color: '#F59E0B',
    target: '[data-tour="nav-profile"]',
    arrow: 'down',
    cardPosition: 'top',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    body: "You'll be notified when fans follow you, like tracks, hit stream milestones, or artists send collab requests. Check the bell icon.",
    icon: Bell,
    color: '#06B6D4',
    target: null,
  },
  {
    id: 'done',
    title: 'Time to drop music 🔥',
    body: 'Head to Hub and upload your first track. Your followers get notified instantly when you publish.',
    icon: Check,
    color: '#10B981',
    target: null,
  },
];

// ── Storage keys ──────────────────────────────────────────────────────────────
const STORAGE_KEY_LISTENER = 'fm_tour_listener_done';
const STORAGE_KEY_ARTIST   = 'fm_tour_artist_done';

export function useTourState(isArtist, authReady = true) {
  const key = isArtist ? STORAGE_KEY_ARTIST : STORAGE_KEY_LISTENER;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    const done = localStorage.getItem(key);
    if (!done) setShow(true);
  }, [key, authReady]);

  const dismiss = () => {
    localStorage.setItem(key, '1');
    setShow(false);
  };

  const restart = () => {
    localStorage.removeItem(key);
    setShow(true);
  };

  return { show, dismiss, restart };
}

// ── Spotlight overlay ─────────────────────────────────────────────────────────
function SpotlightOverlay({ targetSelector, onSkip }) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!targetSelector) { setRect(null); return; }
    const t = setTimeout(() => {}, 0); // flush paint
    const el = document.querySelector(targetSelector);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [targetSelector]);

  if (!rect) {
    // No target — full dark overlay
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[290]"
        onClick={onSkip}
      />
    );
  }

  const pad = 8;
  return (
    <svg
      className="fixed inset-0 z-[290] pointer-events-none"
      style={{ width: '100vw', height: '100vh' }}
    >
      <defs>
        <mask id="spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={rect.left - pad} y={rect.top - pad}
            width={rect.width + pad * 2} height={rect.height + pad * 2}
            rx="12" fill="black"
          />
        </mask>
      </defs>
      <rect
        width="100%" height="100%"
        fill="rgba(0,0,0,0.82)"
        mask="url(#spotlight-mask)"
        style={{ pointerEvents: 'all', cursor: 'pointer' }}
        onClick={onSkip}
      />
      {/* Highlight ring around target */}
      <rect
        x={rect.left - pad} y={rect.top - pad}
        width={rect.width + pad * 2} height={rect.height + pad * 2}
        rx="12" fill="none"
        stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"
      />
    </svg>
  );
}

// ── Arrow pointing at target ──────────────────────────────────────────────────
function Arrow({ direction, color }) {
  if (!direction) return null;
  const arrows = {
    down:  '↓',
    up:    '↑',
    left:  '←',
    right: '→',
  };
  return (
    <motion.div
      animate={{ y: direction === 'down' ? [0, 6, 0] : direction === 'up' ? [0, -6, 0] : 0 }}
      transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
      className="text-2xl font-bold text-center mb-1"
      style={{ color }}
    >
      {arrows[direction]}
    </motion.div>
  );
}

// ── Card positioning ──────────────────────────────────────────────────────────
function getCardStyle(targetSelector, cardPosition) {
  if (!targetSelector) return {}; // center — handled by flex
  const el = document.querySelector(targetSelector);
  if (!el) return {};
  const r = el.getBoundingClientRect();
  const margin = 20;

  if (cardPosition === 'top') {
    return {
      position: 'fixed',
      bottom: window.innerHeight - r.top + margin,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(90vw, 360px)',
    };
  }
  if (cardPosition === 'bottom') {
    return {
      position: 'fixed',
      top: r.bottom + margin,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(90vw, 360px)',
    };
  }
  return {};
}

// ── Main tour component ───────────────────────────────────────────────────────
export default function AppTour({ isArtist, onDone }) {
  const steps   = isArtist ? ARTIST_TOUR : LISTENER_TOUR;
  const [step, setStep]       = useState(0);
  const [direction, setDirection] = useState(1);
  const [cardStyle, setCardStyle] = useState({});
  const current = steps[step];
  const Icon    = current.icon;
  const isLast  = step === steps.length - 1;

  // Recalculate card position when step changes
  useEffect(() => {
    if (current.target) {
      const t = setTimeout(() => {
        setCardStyle(getCardStyle(current.target, current.cardPosition));
      }, 200);
      return () => clearTimeout(t);
    } else {
      setCardStyle({});
    }
  }, [step, current.target, current.cardPosition]);

  const goNext = () => {
    if (isLast) { onDone(); return; }
    setDirection(1);
    setStep(s => s + 1);
  };

  const goPrev = () => {
    if (step === 0) return;
    setDirection(-1);
    setStep(s => s - 1);
  };

  const variants = {
    enter:  (d) => ({ x: d > 0 ? 30 : -30, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (d) => ({ x: d > 0 ? -30 : 30, opacity: 0 }),
  };

  const isMobile   = window.innerWidth < 768;
  const hasTarget  = !!current.target && isMobile;
  const isCenter   = !hasTarget;

  return (
    <>
      {/* Spotlight */}
      <SpotlightOverlay
        targetSelector={current.target}
        onSkip={onDone}
      />

      {/* Card container */}
      <div
        className={`z-[300] ${isCenter ? 'fixed inset-0 flex items-center justify-center px-6' : ''}`}
        style={isCenter ? {} : { zIndex: 300, ...cardStyle }}
      >
        <motion.div
          key={step}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full rounded-3xl overflow-hidden"
          style={{
            maxWidth: isCenter ? 360 : undefined,
            backgroundColor: '#0f0f0f',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Skip */}
          <div className="flex justify-end pt-4 pr-4">
            <button
              onClick={onDone}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition">
              <X className="w-3.5 h-3.5 text-white/40" />
            </button>
          </div>

          {/* Content */}
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="px-6 pb-4 flex flex-col items-center text-center"
            >
              {/* Arrow pointing at highlighted element */}
              {current.arrow && (
                <Arrow direction={current.arrow} color={current.color} />
              )}

              {/* Icon */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: `${current.color}20` }}>
                <Icon className="w-7 h-7" style={{ color: current.color }} />
              </div>

              {/* Step counter */}
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-2"
                style={{ color: current.color }}>
                {step + 1} of {steps.length}
              </p>

              {/* Title */}
              <h2 className="text-lg font-bold text-white mb-2 leading-tight">
                {current.title}
              </h2>

              {/* Body */}
              <p className="text-sm text-white/50 leading-relaxed">
                {current.body}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Progress dots */}
          <div className="flex items-center justify-center space-x-1.5 pb-3">
            {steps.map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  width: i === step ? 18 : 5,
                  backgroundColor: i === step ? current.color : 'rgba(255,255,255,0.15)',
                }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="h-1.5 rounded-full cursor-pointer"
                onClick={() => { setDirection(i > step ? 1 : -1); setStep(i); }}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex items-center space-x-3 px-5 pb-6">
            <button
              onClick={goPrev}
              disabled={step === 0}
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-white/[0.08] text-white/30 hover:text-white/60 hover:border-white/20 transition disabled:opacity-0">
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={goNext}
              className="flex-1 h-10 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 transition active:scale-[0.98]"
              style={{ backgroundColor: current.color }}>
              {isLast
                ? <><Check className="w-4 h-4" /><span>Let's go</span></>
                : <><span>Next</span><ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
