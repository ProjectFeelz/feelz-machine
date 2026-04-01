import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Check, Music, Users, Radio, Upload, BarChart3, Bell, Heart, Headphones, Home, Search, MessageCircle } from 'lucide-react';

// ── Tour definitions ──────────────────────────────────────────────────────────

const LISTENER_TOUR = [
  {
    id: 'welcome',
    title: 'Welcome to Feelz Machine 👋',
    body: 'Your home for independent music. Before you dive in, here\'s a quick look at everything available to you.',
    icon: Headphones,
    color: '#8B5CF6',
    position: 'center',
  },
  {
    id: 'home',
    title: 'Home Feed',
    body: 'Your personalised hub. The more you listen, the smarter it gets — Recommended For You updates based on your taste.',
    icon: Home,
    color: '#06B6D4',
    position: 'center',
    highlight: 'nav-home',
  },
  {
    id: 'browse',
    title: 'Browse & Discover',
    body: 'Explore Trending, New Releases, Featured, and browse by genre. Search any artist, track, or album instantly.',
    icon: Search,
    color: '#F59E0B',
    position: 'center',
    highlight: 'nav-browse',
  },
  {
    id: 'player',
    title: 'The Player',
    body: 'Tap any track to start playing. Swipe up from the mini player for full view — toggle between Artwork, Vinyl, and Video modes.',
    icon: Music,
    color: '#EC4899',
    position: 'center',
  },
  {
    id: 'community',
    title: 'Community',
    body: 'Follow artists to see their posts in your feed. Join chat rooms to connect directly with your favourite artists.',
    icon: MessageCircle,
    color: '#10B981',
    position: 'center',
    highlight: 'nav-community',
  },
  {
    id: 'library',
    title: 'Your Library',
    body: 'Liked tracks, downloads, recently played, playlists and the artists you follow — all in one place.',
    icon: Heart,
    color: '#EF4444',
    position: 'center',
  },
  {
    id: 'done',
    title: 'You\'re all set 🎵',
    body: 'Start exploring. The more you listen and like, the better your recommendations become. Enjoy the music.',
    icon: Check,
    color: '#10B981',
    position: 'center',
  },
];

const ARTIST_TOUR = [
  {
    id: 'welcome',
    title: 'Welcome, Artist 🎤',
    body: 'Feelz Machine is built for independent artists. Upload, distribute, sell, and connect with fans — no middleman.',
    icon: Music,
    color: '#8B5CF6',
    position: 'center',
  },
  {
    id: 'upload',
    title: 'Upload Your Music',
    body: 'Go to Hub → Upload Track. Singles, EPs, Albums, Mixtapes — all supported. WAV files are auto-converted to 320kbps MP3.',
    icon: Upload,
    color: '#06B6D4',
    position: 'center',
  },
  {
    id: 'monetise',
    title: 'Sell Your Music',
    body: 'Set a download price, use Pay What You Want, or offer pre-orders. PayPal handles payments directly to you.',
    icon: BarChart3,
    color: '#F59E0B',
    position: 'center',
  },
  {
    id: 'collabs',
    title: 'Collab Radar',
    body: 'Pro and Premium artists can use Collab Radar — it matches you with artists who share your genre and sound for collaboration.',
    icon: Radio,
    color: '#EC4899',
    position: 'center',
  },
  {
    id: 'community',
    title: 'Build Your Audience',
    body: 'Post updates to your community feed. Create subscriber-only chat rooms. Fans who spend $5+ on your music get exclusive access.',
    icon: Users,
    color: '#10B981',
    position: 'center',
  },
  {
    id: 'notifications',
    title: 'Stay Notified',
    body: 'Get notified when fans follow you, like your tracks, hit stream milestones, or when artists send collab requests.',
    icon: Bell,
    color: '#8B5CF6',
    position: 'center',
  },
  {
    id: 'profile',
    title: 'Customise Your Profile',
    body: 'Set your banner, avatar, bio, genre, mood tags and theme colour. Your profile is your artist page — make it yours.',
    icon: Music,
    color: '#F59E0B',
    position: 'center',
  },
  {
    id: 'done',
    title: 'Time to drop music 🔥',
    body: 'Head to the Hub and upload your first track. Your followers will be notified instantly when you go live.',
    icon: Check,
    color: '#10B981',
    position: 'center',
  },
];

// ── Storage key helpers ────────────────────────────────────────────────────────

const STORAGE_KEY_LISTENER = 'fm_tour_listener_done';
const STORAGE_KEY_ARTIST   = 'fm_tour_artist_done';

export function useTourState(isArtist) {
  const key = isArtist ? STORAGE_KEY_ARTIST : STORAGE_KEY_LISTENER;
  const [show, setShow] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(key);
    if (!done) setShow(true);
  }, [key]);

  const dismiss = () => {
    localStorage.setItem(key, '1');
    setShow(false);
  };

  // Exposed for manual re-trigger (e.g. "Take the tour again" button in profile)
  const restart = () => {
    localStorage.removeItem(key);
    setShow(true);
  };

  return { show, dismiss, restart };
}

// ── Main tour component ───────────────────────────────────────────────────────

export default function AppTour({ isArtist, onDone }) {
  const steps = isArtist ? ARTIST_TOUR : LISTENER_TOUR;
  const [step, setStep]         = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back
  const current                 = steps[step];
  const Icon                    = current.icon;
  const isLast                  = step === steps.length - 1;

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
    enter:  (d) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (d) => ({ x: d > 0 ? -40 : 40, opacity: 0 }),
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center px-6">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
        onClick={onDone}
      />

      {/* Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          backgroundColor: '#0f0f0f',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: `0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Skip button */}
        <button
          onClick={onDone}
          className="absolute top-4 right-4 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition">
          <X className="w-3.5 h-3.5 text-white/40" />
        </button>

        {/* Animated content */}
        <div className="overflow-hidden" style={{ minHeight: 320 }}>
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={step}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="p-8 flex flex-col items-center text-center"
            >
              {/* Icon */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                style={{ backgroundColor: `${current.color}20` }}>
                <Icon className="w-8 h-8" style={{ color: current.color }} />
              </div>

              {/* Step counter */}
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-3"
                style={{ color: current.color }}>
                {step + 1} of {steps.length}
              </p>

              {/* Title */}
              <h2 className="text-xl font-bold text-white mb-3 leading-tight">
                {current.title}
              </h2>

              {/* Body */}
              <p className="text-sm text-white/50 leading-relaxed">
                {current.body}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center space-x-1.5 pb-4">
          {steps.map((_, i) => (
            <motion.div
              key={i}
              animate={{
                width: i === step ? 20 : 6,
                backgroundColor: i === step ? current.color : 'rgba(255,255,255,0.15)',
              }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="h-1.5 rounded-full cursor-pointer"
              onClick={() => { setDirection(i > step ? 1 : -1); setStep(i); }}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center space-x-3 px-6 pb-7">
          <button
            onClick={goPrev}
            disabled={step === 0}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-white/[0.08] text-white/30 hover:text-white/60 hover:border-white/20 transition disabled:opacity-0">
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={goNext}
            className="flex-1 h-10 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 transition active:scale-98"
            style={{ backgroundColor: current.color }}>
            {isLast
              ? <><Check className="w-4 h-4" /><span>Let's go</span></>
              : <><span>Next</span><ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
