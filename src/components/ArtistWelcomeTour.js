import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import {
  Upload, MessageCircle, Bell, Flame,
  ArrowRight, ChevronLeft, Sparkles,
  TrendingUp, Hash,
} from 'lucide-react';

// ── Tour slides ───────────────────────────────────────────────────────────────
//
// Same rule as the listener tour: every claim is checked against the code that
// enforces it, and where a number appears the file that owns it is named.
//
// What was stale before this pass:
//
//   posts          pointed at "Community → Post". Posting lives on /feed, and
//                  src/pages/HubPage.js:365 says Hub is the only route to it.
//   chatrooms      told artists to invite their fans in without mentioning
//                  that src/pages/ChatRoomView.js:949 requires a fan to have
//                  Fan Pro before they can join ANY room. An artist who built
//                  a room on the strength of this slide would watch nobody
//                  arrive and reasonably conclude the feature was broken.
//   notifications  said "Hub → Notifications". The bell moved to the top bar,
//                  src/components/layout/AppLayout.js:129.
//   trending       said streams, likes and downloads, evenly. The real weights
//                  are in netlify/functions/update-engagement-scores.js and
//                  they are nowhere near even, which is actionable information
//                  an artist can actually use.
const SLIDES = [
  {
    id: 'welcome',
    emoji: '🎤',
    accentColor: '#a855f7',
    glowColor: 'rgba(168,85,247,0.18)',
    title: "You're live on\nFeelz Machine",
    subtitle: 'Your artist profile is ready. Here\'s everything you need to know to build your audience from day one.',
    cta: "Let's go",
    visual: 'pulse',
  },
  {
    id: 'upload',
    emoji: '🎵',
    accentColor: '#22d3ee',
    glowColor: 'rgba(34,211,238,0.15)',
    title: 'Drop your music\nfirst',
    subtitle: 'Head to Hub, then Upload Track. Singles, EPs and albums all go through the same screen, and a WAV is converted to 320kbps MP3 for you. Paste your lyrics while you are there, with or without timestamps, and pick the colour they light up in.',
    icon: Upload,
    tag: 'Hub → Upload Track',
    visual: 'upload',
  },
  {
    id: 'posts',
    emoji: '📝',
    accentColor: '#f472b6',
    glowColor: 'rgba(244,114,182,0.15)',
    title: 'Keep talking\nbetween releases',
    subtitle: 'Hub, then Feed, is where you write a post. The plus button holds the rest: a 24 hour story, a voice memo, a notification straight to your followers, and going live. A quiet profile between drops is the thing that loses people.',
    icon: Hash,
    tag: 'Hub → Feed',
    visual: 'post',
  },
  {
    id: 'chatrooms',
    emoji: '💬',
    accentColor: '#10b981',
    glowColor: 'rgba(16,185,129,0.15)',
    title: 'Build your\ncommunity',
    subtitle: 'Create chat rooms and invite your fans in. Before you build one, know who can walk in: a fan needs Fan Pro to join any room, and a subscribers-only room also needs $5 or more spent on your music. Small rooms, real supporters.',
    icon: MessageCircle,
    // src/pages/HubPage.js:387 is the artist's card and it is called
    // "Your Fan Chat", not "Chat Rooms". Naming it anything else sends people
    // hunting for a card that is not there.
    tag: 'Hub → Your Fan Chat',
    visual: 'chat',
  },
  {
    id: 'notifications',
    emoji: '🔔',
    accentColor: '#f59e0b',
    glowColor: 'rgba(245,158,11,0.15)',
    title: 'Watch your\nnotifications',
    subtitle: "Every follow, like, comment, milestone and collab request lands on the bell at the top of the screen. It is the fastest read you have on what is working and who is connecting with your sound.",
    icon: Bell,
    tag: 'The bell, top of screen',
    visual: 'bell',
  },
  {
    id: 'trending',
    emoji: '🔥',
    accentColor: '#ef4444',
    glowColor: 'rgba(239,68,68,0.15)',
    // Weights from netlify/functions/update-engagement-scores.js:7-15, said
    // out loud because a ranking nobody understands just looks rigged. An
    // artist can act on "a download counts more than a stream"; they cannot
    // act on "engagement".
    title: 'Get your people\nlistening',
    subtitle: "Trending is scored nightly and the inputs are not equal. A download counts most, then a comment, then a playlist add, then a like, and a stream this week counts for more than a stream last month. Ask for the thing you actually want.",
    icon: TrendingUp,
    tag: 'Home → Trending',
    visual: 'trending',
  },
  {
    id: 'done',
    emoji: '🚀',
    accentColor: '#a855f7',
    glowColor: 'rgba(168,85,247,0.18)',
    title: "Time to make\nnoise",
    subtitle: "Upload your first track, post an update and share your link. Your audience is waiting.",
    cta: 'Go to Hub',
    visual: 'done',
  },
];

// ── Visual illustrations per slide ────────────────────────────────────────────

function PulseVisual({ color }) {
  return (
    <div className="relative flex items-center justify-center w-32 h-32 mx-auto">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="absolute rounded-full border"
          style={{
            width: `${i * 44}px`,
            height: `${i * 44}px`,
            borderColor: color,
            opacity: 0.15 * (4 - i),
            animation: `ping-slow ${1.2 + i * 0.4}s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <div
        className="relative w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
        style={{ backgroundColor: color + '22', border: `1px solid ${color}40` }}
      >
        🎤
      </div>
    </div>
  );
}

function UploadVisual({ color }) {
  return (
    <div className="relative mx-auto w-56">
      <div className="rounded-2xl border p-4 mb-2" style={{ borderColor: color + '30', backgroundColor: color + '08' }}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
            <Upload className="w-5 h-5" style={{ color }} />
          </div>
          <div className="flex-1">
            <div className="h-2.5 rounded-full mb-1.5" style={{ backgroundColor: color + '40', width: '70%' }} />
            <div className="h-2 rounded-full" style={{ backgroundColor: color + '20', width: '45%' }} />
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: color + '15' }}>
          <div className="h-full rounded-full animate-progress" style={{ backgroundColor: color, width: '65%' }} />
        </div>
      </div>
      <div className="flex items-center space-x-2 px-1">
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium" style={{ color: color + 'cc' }}>Publishing to your followers…</span>
      </div>
    </div>
  );
}

function PostVisual({ color }) {
  const posts = [
    { time: '2m ago', text: 'New drop incoming this Friday 🔥' },
    { time: '1h ago', text: 'Studio sessions are everything rn' },
  ];
  return (
    <div className="mx-auto w-56 space-y-2">
      {posts.map((p, i) => (
        <div key={i} className="rounded-xl border p-3" style={{ borderColor: color + '25', backgroundColor: color + '08' }}>
          <div className="flex items-center space-x-2 mb-1.5">
            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: color + '30' }} />
            <span className="text-xs font-semibold text-white/60">You</span>
            <span className="text-[10px] text-white/25 ml-auto">{p.time}</span>
          </div>
          <p className="text-xs text-white/70">{p.text}</p>
          <div className="flex items-center space-x-3 mt-2">
            <span className="text-[10px] text-white/30">❤️ {12 + i * 7}</span>
            <span className="text-[10px] text-white/30">💬 {3 + i * 2}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatVisual({ color }) {
  const msgs = [
    { from: 'fan', text: 'When is the next drop??' },
    { from: 'you', text: 'Friday! Tell everyone 🔥' },
    { from: 'fan', text: 'This room is 🔥🔥' },
  ];
  return (
    <div className="mx-auto w-56">
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: color + '30' }}>
        {/* Both gates on the header, because an artist deciding whether to
            build a room needs to know who can actually walk through the door. */}
        <div className="px-3 py-2" style={{ backgroundColor: color + '15' }}>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs font-semibold" style={{ color }}>My Inner Circle</span>
          </div>
          <div className="flex items-center space-x-1.5 mt-1.5">
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: color + '25', color }}>Fan Pro to join</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: color + '25', color }}>$5 spent</span>
          </div>
        </div>
        <div className="p-3 space-y-2" style={{ backgroundColor: color + '05' }}>
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.from === 'you' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[80%] rounded-xl px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: m.from === 'you' ? color + '30' : 'rgba(255,255,255,0.06)',
                  color: m.from === 'you' ? color + 'ee' : 'rgba(255,255,255,0.65)',
                }}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BellVisual({ color }) {
  const notifs = [
    { icon: '👤', text: 'DJ Kush started following you' },
    { icon: '❤️', text: '23 new likes on "Astro Wave"' },
    { icon: '🔥', text: 'You hit 1,000 streams!' },
  ];
  return (
    <div className="mx-auto w-56 space-y-1.5">
      {notifs.map((n, i) => (
        <div
          key={i}
          className="flex items-center space-x-2.5 rounded-xl px-3 py-2.5 border"
          style={{
            borderColor: color + '20',
            backgroundColor: color + '08',
            animation: `fade-in-up 0.4s ease both`,
            animationDelay: `${i * 0.12}s`,
          }}
        >
          <span className="text-base">{n.icon}</span>
          <span className="text-xs text-white/60">{n.text}</span>
          <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        </div>
      ))}
    </div>
  );
}

// A leaderboard of invented track names taught an artist nothing. This shows
// the actual scoring weights from netlify/functions/update-engagement-scores.js
// as bar lengths, so the shape of the thing is readable in one glance: a
// download is worth twelve streams, and asking your people to download is a
// different ask from asking them to press play.
//
// If those weights change, change them here. Two places, both named.
function TrendingVisual({ color }) {
  const weights = [
    { label: 'Download',     w: 12 },
    { label: 'Comment',      w: 8  },
    { label: 'Playlist add', w: 6  },
    { label: 'Like',         w: 5  },
    { label: 'Stream',       w: 1  },
  ];
  const max = 12;
  return (
    <div className="mx-auto w-56">
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: color + '30' }}>
        <div className="px-3 py-2 flex items-center space-x-2" style={{ backgroundColor: color + '12' }}>
          <Flame className="w-3.5 h-3.5" style={{ color }} />
          <span className="text-xs font-semibold" style={{ color }}>What moves the needle</span>
        </div>
        <div className="p-3 space-y-2">
          {weights.map((item, i) => (
            <div key={item.label} style={{ animation: 'fade-in-up 0.35s ease both', animationDelay: `${i * 0.08}s` }}>
              <div className="flex justify-between mb-1">
                <span className="text-[11px] text-white/55">{item.label}</span>
                <span className="text-[10px] font-bold" style={{ color }}>×{item.w}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: color + '15' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(item.w / max) * 100}%`, backgroundColor: i === 0 ? color : color + '70' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-center text-[10px] text-white/25 mt-2">Recent plays weigh more than old ones</p>
    </div>
  );
}

function DoneVisual() {
  const icons = ['🎵', '💬', '🔔', '🔥', '🚀'];
  return (
    <div className="relative flex items-center justify-center w-40 h-32 mx-auto">
      {icons.map((em, i) => {
        const angle = (i / icons.length) * Math.PI * 2 - Math.PI / 2;
        const r = 48;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        return (
          <div
            key={i}
            className="absolute text-xl"
            style={{
              transform: `translate(${x}px, ${y}px)`,
              animation: `float ${1.8 + i * 0.25}s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.18}s`,
            }}
          >
            {em}
          </div>
        );
      })}
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl bg-purple-500/20 border border-purple-500/30">
        🎤
      </div>
    </div>
  );
}

function SlideVisual({ slide }) {
  const color = slide.accentColor;
  switch (slide.visual) {
    case 'pulse':    return <PulseVisual color={color} />;
    case 'upload':   return <UploadVisual color={color} />;
    case 'post':     return <PostVisual color={color} />;
    case 'chat':     return <ChatVisual color={color} />;
    case 'bell':     return <BellVisual color={color} />;
    case 'trending': return <TrendingVisual color={color} />;
    case 'done':     return <DoneVisual />;
    default:         return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ArtistWelcomeTour({ artistName, onDone }) {
  const [step, setStep]       = useState(0);
  const [animDir, setAnimDir] = useState(1);
  const [visible, setVisible] = useState(false);
  const { user } = useAuth();
  const { supported, subscribed, subscribe } = usePushNotifications(user);

  const slide  = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  useEffect(() => {
    // Entrance animation delay
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(t);
  }, [step]);

  const next = async () => {
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

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-black overflow-y-auto">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 20%, ${slide.glowColor}, transparent 70%)`,
        }}
      />

      {/* Skip button */}
      <div className="relative z-10 flex justify-end px-6 pt-14 pb-2">
        <button
          onClick={onDone}
          className="text-xs text-white/25 hover:text-white/50 transition px-2 py-1"
        >
          Skip
        </button>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 flex items-center space-x-1.5 px-6 mb-6">
        {SLIDES.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-0.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                backgroundColor: slide.accentColor,
                width: i <= step ? '100%' : '0%',
                opacity: i === step ? 1 : 0.5,
              }}
            />
          </div>
        ))}
      </div>

      {/* Slide content */}
      <div
        className="relative z-10 flex-1 flex flex-col items-center justify-between px-6 pb-6"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : `translateY(${animDir > 0 ? '12px' : '-12px'})`,
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
        {/* Visual illustration */}
        <div className="flex-1 flex items-center justify-center w-full">
          <SlideVisual slide={slide} />
        </div>

        {/* Text */}
        <div className="w-full max-w-sm text-center mb-8">
          {slide.tag && (
            <div
              className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-4"
              style={{ backgroundColor: slide.accentColor + '18', color: slide.accentColor }}
            >
              <span>{slide.tag}</span>
            </div>
          )}

          <h1
            className="text-[28px] font-bold leading-tight text-white mb-3 whitespace-pre-line"
          >
            {step === 0 && artistName
              ? `Welcome,\n${artistName}`
              : slide.title}
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
            className="flex-1 h-12 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition active:scale-[0.97]"
            style={{ backgroundColor: slide.accentColor }}
          >
            {isLast ? (
              <>
                <Sparkles className="w-4 h-4 text-white" />
                <span className="text-white">{slide.cta || "Let's go"}</span>
              </>
            ) : (
              <>
                <span className="text-white">{slide.cta || 'Next'}</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Inline keyframe styles */}
      <style>{`
        @keyframes ping-slow {
          0%, 100% { transform: scale(1); opacity: 0.12; }
          50%       { transform: scale(1.15); opacity: 0.25; }
        }
        @keyframes float {
          from { transform: translateY(0px) rotate(-3deg); }
          to   { transform: translateY(-6px) rotate(3deg); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes animate-progress {
          from { width: 0%; }
          to   { width: 65%; }
        }
        .animate-progress {
          animation: animate-progress 1.8s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}