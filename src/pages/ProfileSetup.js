import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { usePushNotifications } from '../hooks/usePushNotifications';
import ArtistFollowPrompt from '../components/ArtistFollowPrompt';
import React, { useState, useEffect } from 'react';
import {
  Music, Bell, Trophy, Heart, MessageCircle,
  ArrowRight, ChevronLeft, Sparkles, Headphones, TrendingUp,
  DollarSign, Users, Flame, Play, Download,
  Check, Loader
} from 'lucide-react';

// ── Slides ────────────────────────────────────────────────────────────────────
const SLIDES = [
  {
    id: 'welcome',
    accentColor: '#a855f7',
    glowColor: 'rgba(168,85,247,0.18)',
    title: "You just joined\nsomething real",
    subtitle: "Feelz Machine is an independent music platform — built for artists and fans, not labels or algorithms. Here's how to get the most out of it.",
    visual: 'welcome',
  },
  {
    id: 'discover',
    accentColor: '#22d3ee',
    glowColor: 'rgba(34,211,238,0.14)',
    tag: 'Home · Browse',
    title: 'Discover music\nyou won\'t find\nanywhere else',
    subtitle: 'Browse trending tracks, new releases and featured artists. The more you listen and like, the smarter your feed gets. Every stream directly supports the artist.',
    visual: 'discover',
  },
  {
    id: 'follow',
    accentColor: '#f472b6',
    glowColor: 'rgba(244,114,182,0.14)',
    tag: 'Follow Artists',
    title: 'Follow artists\nand never miss a drop',
    subtitle: "When you follow an artist, you get notified every time they release new music, post an update or go live in a chat room. Your feed becomes their personal channel to you.",
    visual: 'follow',
  },
  {
    id: 'community',
    accentColor: '#10b981',
    glowColor: 'rgba(16,185,129,0.14)',
    tag: 'Community · Feed',
    title: 'Get into the\ncommunity',
    subtitle: "Artists post updates, behind-the-scenes moments and exclusive content in their feeds and chat rooms. Spend $5+ on an artist's music and you unlock their subscriber-only rooms.",
    visual: 'community',
  },
  {
    id: 'competitions',
    accentColor: '#f59e0b',
    glowColor: 'rgba(245,158,11,0.15)',
    tag: 'Competitions',
    title: 'Vote in music\ncompetitions',
    subtitle: "Competitions are where the community decides who wins. Listen to entries, cast your votes and watch your favourite artists take the crown. Winners are chosen by fans — that means you.",
    visual: 'competitions',
  },
  {
    id: 'support',
    accentColor: '#ef4444',
    glowColor: 'rgba(239,68,68,0.13)',
    tag: 'Support Artists',
    title: 'Your support goes\ndirectly to artists',
    subtitle: "When you download a track, 100% of what you pay goes to the artist. Feelz Machine takes nothing. No label cut, no platform fee. Just a fan and an artist.",
    visual: 'support',
  },
  {
    id: 'notifications',
    accentColor: '#818cf8',
    glowColor: 'rgba(129,140,248,0.14)',
    tag: 'Notifications',
    title: 'Turn on\nnotifications',
    subtitle: "New drops from artists you follow, competition results, platform announcements and your monthly listening wrapped. The bell icon in Hub keeps you connected to everything.",
    visual: 'notifications',
  },
  {
    id: 'done',
    accentColor: '#a855f7',
    glowColor: 'rgba(168,85,247,0.18)',
    title: "Now go find\nyour next\nfavourite artist",
    subtitle: "Browse music, follow artists, vote in competitions and support the independents building something real.",
    cta: 'Start Listening',
    visual: 'done',
  },
];

// ── Visual components ─────────────────────────────────────────────────────────

function WelcomeVisual() {
  const emojis = ['🎵', '🎤', '🎧', '🎹', '🥁', '🎸'];
  return (
    <div className="relative flex items-center justify-center w-40 h-36 mx-auto">
      {emojis.map((em, i) => {
        const angle = (i / emojis.length) * Math.PI * 2 - Math.PI / 2;
        const r = 52;
        return (
          <div
            key={i}
            className="absolute text-2xl"
            style={{
              transform: `translate(${Math.cos(angle) * r}px, ${Math.sin(angle) * r}px)`,
              animation: `float-slow ${2 + i * 0.3}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.22}s`,
            }}
          >{em}</div>
        );
      })}
      <div className="w-16 h-16 rounded-3xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-3xl shadow-lg shadow-purple-500/10">
        🎧
      </div>
    </div>
  );
}

function DiscoverVisual({ color }) {
  const tracks = [
    { name: 'Astro Wave', artist: 'DJ Kush', streams: '14.2K', hot: true },
    { name: 'Midnight Oil', artist: 'Nova', streams: '9.8K', hot: false },
    { name: 'Golden Hour', artist: 'Lumi', streams: '7.1K', hot: false },
  ];
  return (
    <div className="mx-auto w-60">
      <div className="flex items-center space-x-2 mb-3">
        <Flame className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color }}>Trending</span>
      </div>
      <div className="space-y-2">
        {tracks.map((t, i) => (
          <div
            key={i}
            className="flex items-center space-x-3 rounded-xl p-3 border"
            style={{
              borderColor: i === 0 ? color + '35' : 'rgba(255,255,255,0.06)',
              backgroundColor: i === 0 ? color + '0a' : 'rgba(255,255,255,0.02)',
              animation: `fade-up 0.35s ease both`,
              animationDelay: `${i * 0.1}s`,
            }}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
              style={{ backgroundColor: color + (i === 0 ? '25' : '12') }}>
              🎵
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{t.name}</p>
              <p className="text-[10px] text-white/35 truncate">{t.artist}</p>
            </div>
            <div className="flex items-center space-x-1.5">
              {i === 0 && <TrendingUp className="w-3 h-3" style={{ color }} />}
              <span className="text-[10px]" style={{ color: i === 0 ? color : 'rgba(255,255,255,0.25)' }}>{t.streams}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowVisual({ color }) {
  const artists = [
    { name: 'DJ Kush', genre: 'Afrobeats', followed: true },
    { name: 'Nova', genre: 'Electronic', followed: true },
    { name: 'Lumi', genre: 'R&B', followed: false },
  ];
  return (
    <div className="mx-auto w-60 space-y-2">
      {artists.map((a, i) => (
        <div
          key={i}
          className="flex items-center space-x-3 rounded-xl p-3 border transition-all"
          style={{
            borderColor: a.followed ? color + '35' : 'rgba(255,255,255,0.06)',
            backgroundColor: a.followed ? color + '08' : 'transparent',
            animation: `fade-up 0.35s ease both`,
            animationDelay: `${i * 0.1}s`,
          }}
        >
          <div className="w-9 h-9 rounded-full flex-shrink-0 text-base flex items-center justify-center"
            style={{ backgroundColor: color + '20' }}>
            🎤
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white">{a.name}</p>
            <p className="text-[10px] text-white/30">{a.genre}</p>
          </div>
          <div
            className="px-3 py-1 rounded-full text-[10px] font-bold flex items-center space-x-1"
            style={{
              backgroundColor: a.followed ? color + '25' : 'rgba(255,255,255,0.08)',
              color: a.followed ? color : 'rgba(255,255,255,0.5)',
            }}
          >
            {a.followed ? <><Check className="w-2.5 h-2.5" /><span>Following</span></> : <span>Follow</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommunityVisual({ color }) {
  const items = [
    { type: 'post', text: 'New single dropping Friday 🔥', time: '2m' },
    { type: 'room', text: 'Inner Circle · 12 online', locked: false },
    { type: 'room', text: 'Subscribers Only', locked: true },
  ];
  return (
    <div className="mx-auto w-60 space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="rounded-xl border p-3"
          style={{
            borderColor: color + '25',
            backgroundColor: color + '07',
            animation: `fade-up 0.35s ease both`,
            animationDelay: `${i * 0.1}s`,
          }}
        >
          {item.type === 'post' ? (
            <div className="flex items-start space-x-2.5">
              <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ backgroundColor: color + '30' }} />
              <div>
                <p className="text-xs text-white/70">{item.text}</p>
                <p className="text-[10px] text-white/25 mt-1">{item.time} ago · ❤️ 34</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2.5">
              <MessageCircle className="w-4 h-4 flex-shrink-0" style={{ color: item.locked ? 'rgba(255,255,255,0.2)' : color }} />
              <span className={`text-xs flex-1 ${item.locked ? 'text-white/25' : 'text-white/70'}`}>{item.text}</span>
              {item.locked
                ? <span className="text-[10px] text-white/20">🔒 $5+</span>
                : <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CompetitionsVisual({ color }) {
  const entries = [
    { label: 'Entry #1', votes: 312, pct: 78 },
    { label: 'Entry #2', votes: 189, pct: 47 },
    { label: 'Entry #3', votes: 74,  pct: 18 },
  ];
  return (
    <div className="mx-auto w-60">
      <div className="flex items-center space-x-2 mb-3">
        <Trophy className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color }}>Beat Battle · Voting Open</span>
      </div>
      <div className="space-y-2.5">
        {entries.map((e, i) => (
          <div key={i} style={{ animation: `fade-up 0.35s ease both`, animationDelay: `${i * 0.1}s` }}>
            <div className="flex justify-between mb-1">
              <span className="text-xs text-white/60">{e.label}</span>
              <span className="text-[10px]" style={{ color }}>{e.votes} votes</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: color + '15' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${e.pct}%`,
                  backgroundColor: i === 0 ? color : color + '60',
                  transition: 'width 1s ease',
                }}
              />
            </div>
          </div>
        ))}
        <button
          className="w-full mt-1 py-2 rounded-xl text-xs font-bold"
          style={{ backgroundColor: color + '20', color }}
        >
          Cast Your Vote →
        </button>
      </div>
    </div>
  );
}

function SupportVisual({ color }) {
  return (
    <div className="mx-auto w-60">
      <div className="rounded-2xl border p-4 mb-3" style={{ borderColor: color + '30', backgroundColor: color + '08' }}>
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-12 h-12 rounded-xl text-xl flex items-center justify-center" style={{ backgroundColor: color + '20' }}>🎵</div>
          <div>
            <p className="text-sm font-semibold text-white">Astro Wave</p>
            <p className="text-xs text-white/40">DJ Kush · Download</p>
          </div>
        </div>
        <div className="flex items-center justify-between py-2 border-t" style={{ borderColor: color + '20' }}>
          <span className="text-xs text-white/40">Track price</span>
          <span className="text-sm font-bold text-white">$2.00</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-white/40">Platform cut</span>
          <span className="text-sm font-bold" style={{ color: '#10b981' }}>$0.00</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs font-semibold text-white">Artist receives</span>
          <span className="text-sm font-bold" style={{ color }}>$2.00</span>
        </div>
      </div>
      <p className="text-center text-[10px] text-white/25">100% of every download goes to the artist</p>
    </div>
  );
}

function NotificationsVisual({ color }) {
  const notifs = [
    { icon: '🎵', text: 'DJ Kush dropped a new track', sub: 'Tap to listen' },
    { icon: '🏆', text: 'Beat Battle results are in', sub: 'Your favourite won' },
    { icon: '📣', text: 'Platform update from Feelz', sub: 'New features available' },
  ];
  return (
    <div className="mx-auto w-60 space-y-1.5">
      {notifs.map((n, i) => (
        <div
          key={i}
          className="flex items-center space-x-3 rounded-xl px-3 py-2.5 border"
          style={{
            borderColor: color + '22',
            backgroundColor: color + '08',
            animation: `fade-up 0.4s ease both`,
            animationDelay: `${i * 0.12}s`,
          }}
        >
          <span className="text-lg">{n.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white/80 truncate">{n.text}</p>
            <p className="text-[10px] text-white/30">{n.sub}</p>
          </div>
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        </div>
      ))}
    </div>
  );
}

function DoneVisual() {
  const icons = ['🎵', '🏆', '❤️', '🔔', '💬', '🎧'];
  return (
    <div className="relative flex items-center justify-center w-44 h-36 mx-auto">
      {icons.map((em, i) => {
        const angle = (i / icons.length) * Math.PI * 2 - Math.PI / 2;
        const r = 56;
        return (
          <div
            key={i}
            className="absolute text-xl"
            style={{
              transform: `translate(${Math.cos(angle) * r}px, ${Math.sin(angle) * r}px)`,
              animation: `float-slow ${1.8 + i * 0.28}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.15}s`,
            }}
          >{em}</div>
        );
      })}
      <div className="w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
        <Headphones className="w-7 h-7 text-purple-400" />
      </div>
    </div>
  );
}

function SlideVisual({ slide }) {
  const c = slide.accentColor;
  switch (slide.visual) {
    case 'welcome':       return <WelcomeVisual color={c} />;
    case 'discover':      return <DiscoverVisual color={c} />;
    case 'follow':        return <FollowVisual color={c} />;
    case 'community':     return <CommunityVisual color={c} />;
    case 'competitions':  return <CompetitionsVisual color={c} />;
    case 'support':       return <SupportVisual color={c} />;
    case 'notifications': return <NotificationsVisual color={c} />;
    case 'done':          return <DoneVisual />;
    default:              return null;
  }
}

// ── Inner tour component (used by ProfileSetup wrapper) ──────────────────────
function ListenerWelcomeTour({ displayName, onDone }) {
  const [step, setStep]       = useState(0);
  const [animDir, setAnimDir] = useState(1);
  const [visible, setVisible] = useState(false);
  const { user } = useAuth();
  const { supported, subscribed, subscribe } = usePushNotifications(user);

  // ✅ All hooks must come before any early return
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(t);
  }, [step]);

  const slide  = SLIDES[step];
  // Safety: if step races past SLIDES length (re-render race on onDone), bail cleanly
  if (!slide) return null;

  const isLast = step === SLIDES.length - 1;

  const next = async () => {
    // On the notifications slide, request push permission before advancing
    if (slide.id === 'notifications' && supported && !subscribed) {
      await subscribe();
    }
    if (isLast) { onDone(); return; }
    setAnimDir(1);
    setStep(s => s + 1);
  };

  const prev = () => {
    if (step === 0) return;
    setAnimDir(-1);
    setStep(s => s - 1);
  };

  const resolvedTitle = step === 0 && displayName
    ? `Hey ${displayName},\nyou're in`
    : slide.title;

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-black overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse 80% 55% at 50% 15%, ${slide.glowColor}, transparent 70%)`,
        }}
      />

      {/* Skip */}
      <div className="relative z-10 flex justify-end px-6 pt-14 pb-2">
        <button onClick={onDone} className="text-xs text-white/25 hover:text-white/50 transition px-2 py-1">
          Skip
        </button>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 flex items-center space-x-1 px-6 mb-5 md:max-w-2xl md:mx-auto md:w-full">
        {SLIDES.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 rounded-full overflow-hidden bg-white/[0.07]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                backgroundColor: slide.accentColor,
                width: i <= step ? '100%' : '0%',
                opacity: i === step ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>

      {/* Slide */}
      <div
        className="relative z-10 flex-1 flex flex-col items-center justify-between px-6 pb-6 md:max-w-2xl md:mx-auto md:w-full"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : `translateY(${animDir > 0 ? '14px' : '-14px'})`,
          transition: 'opacity 0.28s ease, transform 0.28s ease',
        }}
      >
        {/* Visual */}
        <div className="flex-1 flex items-center justify-center w-full">
          <SlideVisual slide={slide} />
        </div>

        {/* Text block */}
        <div className="w-full max-w-sm text-center mb-8">
          {slide.tag && (
            <div
              className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3"
              style={{ backgroundColor: slide.accentColor + '18', color: slide.accentColor }}
            >
              {slide.tag}
            </div>
          )}

          <h1 className="text-[26px] font-bold leading-tight text-white mb-3 whitespace-pre-line">
            {resolvedTitle}
          </h1>

          <p className="text-sm text-white/45 leading-relaxed">
            {slide.subtitle}
          </p>
        </div>

        {/* Nav */}
        <div className="w-full max-w-sm flex items-center space-x-3">
          {step > 0 && (
            <button
              onClick={prev}
              className="w-12 h-12 flex items-center justify-center rounded-xl border border-white/[0.08] text-white/30 hover:text-white/60 hover:border-white/20 transition flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={next}
            className="flex-1 h-12 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition active:scale-[0.97] text-white"
            style={{ backgroundColor: slide.accentColor }}
          >
            {isLast ? (
              <><Headphones className="w-4 h-4" /><span>{slide.cta || 'Start Listening'}</span></>
            ) : (
              <><span>{slide.cta || 'Next'}</span><ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes float-slow {
          from { transform: translateY(0px) rotate(-4deg); }
          to   { transform: translateY(-8px) rotate(4deg); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── AccountTypeScreen ────────────────────────────────────────────────────────
function AccountTypeScreen({ onListener, onArtist, initialScreen = 'type' }) {
  const { user, refreshProfile, loading: authLoading } = useAuth();
  const [artistName, setArtistName]   = useState('');
  const [showArtist, setShowArtist]   = useState(initialScreen === 'artist');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  function slugify(text) {
    const base = text.toString().toLowerCase().trim()
      .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
    return `${base}-${Date.now().toString(36)}`;
  }

  const BLOCKED_PATTERNS = [
    'dwgghost', 'dwg_ghost', 'dwg-ghost', 'mzizisimphiwe',
    'simphiwemzizi', 'spam', 'test123',
  ];
  const isBlockedEmail = (email) => {
    if (!email) return false;
    const norm = email.toLowerCase().replace(/[^a-z0-9]/g, '');
    return BLOCKED_PATTERNS.some(p => norm.includes(p));
  };

  const handleArtistContinue = async () => {
    if (!artistName.trim()) { setError('Please enter your artist name'); return; }
    if (!user?.id) { setError('Session not ready — please wait a moment and try again'); return; }
    if (isBlockedEmail(user.email)) {
      setError('This account is not permitted to register. Please contact support.');
      return;
    }
    setSaving(true); setError('');
    try {
      const { error: insertErr } = await supabase.from('artists').insert({
        user_id:     user.id,
        artist_name: artistName.trim(),
        slug:        slugify(artistName.trim()),
        tier:        'free',
        created_at:  new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      });
      if (insertErr) throw insertErr;
      await refreshProfile();
      // Mark tour as done so AppTour doesn't show after onboarding
      localStorage.setItem('fm_tour_artist_done', '1');
      onArtist();
    } catch (err) {
      setError(err.message || 'Failed to create artist profile');
    }
    setSaving(false);
  };

  const handleListenerContinue = async () => {
    localStorage.setItem('onboarding_type', 'listener');
    try {
      await supabase.from('user_profiles').upsert(
        { user_id: user.id, name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Listener', updated_at: new Date().toISOString() },
        { onConflict: 'user_id', ignoreDuplicates: true }
      );
      await refreshProfile();
    } catch {}
    onListener();
  };

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-black items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {!showArtist ? (
          <>
            <div className="text-center mb-10">
              <div className="w-16 h-16 rounded-3xl bg-purple-500/15 flex items-center justify-center mx-auto mb-5">
                <span className="text-3xl">🎵</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">How will you use<br/>Feelz Machine?</h1>
              <p className="text-sm text-white/40">This helps us personalise your experience</p>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleListenerContinue}
                disabled={authLoading}
                className="w-full flex items-center space-x-4 p-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-transparent hover:border-cyan-500/35 hover:from-cyan-500/15 transition active:scale-[0.98] text-left group"
              >
                <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-500/20 transition">
                  <span className="text-xl">🎧</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">I'm a listener</p>
                  <p className="text-xs text-white/40 mt-0.5">Discover and support independent music</p>
                </div>
              </button>
              <button
                onClick={() => setShowArtist(true)}
                className="w-full flex items-center space-x-4 p-4 rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-500/10 to-transparent hover:border-purple-500/40 hover:from-purple-500/15 transition active:scale-[0.98] text-left group"
              >
                <div className="w-11 h-11 rounded-2xl bg-purple-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-500/25 transition">
                  <span className="text-xl">🎤</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">I'm an artist</p>
                  <p className="text-xs text-white/40 mt-0.5">Upload music and connect with fans</p>
                </div>
              </button>
            </div>
            <p className="text-center text-[11px] text-white/20 mt-6">You can change this any time in your profile</p>
          </>
        ) : (
          <>
            <div className="text-center mb-8">
              <button onClick={() => setShowArtist(false)} className="text-xs text-white/30 hover:text-white/50 mb-6 transition">← Back</button>
              <div className="w-16 h-16 rounded-3xl bg-purple-500/15 flex items-center justify-center mx-auto mb-5">
                <span className="text-3xl">🎤</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">What's your artist name?</h1>
              <p className="text-sm text-white/40">This is how fans will find you</p>
            </div>
            <div className="space-y-3">
              <input
                type="text" value={artistName} onChange={e => { setArtistName(e.target.value); setError(''); }}
                placeholder="Your artist name"
                maxLength={50}
                className="w-full px-4 py-3.5 bg-white/[0.06] border border-white/[0.08] rounded-2xl text-white placeholder-white/25 outline-none focus:border-purple-500/50 transition text-sm"
                autoFocus
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={handleArtistContinue}
                disabled={saving || !artistName.trim() || !user?.id || authLoading}
                className="w-full py-4 rounded-2xl font-bold text-base bg-white text-black disabled:opacity-40 transition active:scale-[0.98] flex items-center justify-center space-x-2"
              >
                {saving
                  ? <><Loader className="w-4 h-4 animate-spin" /><span>Setting up...</span></>
                  : <span>Create Artist Profile</span>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ProfileSetup — default export ─────────────────────────────────────────────
// Sequences: ListenerWelcomeTour → ArtistFollowPrompt → navigate to /
// Artist accounts skip ArtistFollowPrompt (they don't need to follow artists to onboard)
export default function ProfileSetup() {
  const navigate = useNavigate();
  const { user, artist, refreshProfile } = useAuth();
  const [stage, setStage] = useState('type'); // 'type' | 'tour' | 'follow'

  // If returning from email confirmation and user already chose a type, honour it
  useEffect(() => {
    if (!user?.id) return;
    const savedType = localStorage.getItem('onboarding_type');
    if (savedType === 'artist' && !artist) {
      localStorage.removeItem('onboarding_type');
      setStage('artist_name');
    } else if (savedType === 'listener') {
      localStorage.removeItem('onboarding_type');
      setStage('tour');
    }
  }, [user?.id]); // eslint-disable-line

  const ensureListenerProfile = async () => {
    if (!user || artist) return;
    try {
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Listener';
      const now  = new Date().toISOString();
      // Write to user_profiles (for profile data) AND listeners (for hasProfile check)
      await Promise.all([
        supabase.from('user_profiles').upsert(
          { user_id: user.id, name, updated_at: now },
          { onConflict: 'user_id', ignoreDuplicates: true }
        ),
        supabase.from('listeners').upsert(
          { user_id: user.id, created_at: now },
          { onConflict: 'user_id', ignoreDuplicates: true }
        ),
      ]);
      await refreshProfile();
    } catch (err) { console.error('Listener profile error:', err); }
  };

  const handleSelectType = async (type) => {
    // Store the chosen type so we can read it back after email confirmation redirect
    localStorage.setItem('onboarding_type', type);
    if (type === 'artist') {
      navigate('/');
    } else {
      setStage('tour');
    }
  };

  const handleTourDone = async () => {
    if (artist) {
      localStorage.setItem('fm_tour_artist_done', '1');
      navigate('/');
    }
    else { await ensureListenerProfile(); setStage('follow'); }
  };

  const handleFollowDone = async () => {
    await ensureListenerProfile();
    // Mark both tour keys as done so AppTour doesn't show after onboarding
    localStorage.setItem('fm_tour_listener_done', '1');
    localStorage.setItem('fm_tour_artist_done', '1');
    navigate('/');
  };

  // Account type selection screen
  if ((stage === 'type' || stage === 'artist_name') && !artist) {
    return <AccountTypeScreen
      initialScreen={stage === 'artist_name' ? 'artist' : 'type'}
      onListener={() => setStage('tour')}
      onArtist={() => navigate('/')} />;
  }

  if (stage === 'follow') {
    return <ArtistFollowPrompt onDone={handleFollowDone} />;
  }

  return (
    <ListenerWelcomeTour
      displayName={artist?.artist_name || null}
      onDone={handleTourDone}
    />
  );
}