import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import {
  Bell, Trophy, MessageCircle, ArrowRight, ChevronLeft,
  Headphones, TrendingUp, Flame, Check,
} from 'lucide-react';

// ── Slides ────────────────────────────────────────────────────────────────────
//
// EVERY CLAIM ON THESE SLIDES IS CHECKED AGAINST THE CODE THAT ENFORCES IT.
// A first run is the one time a person takes the app entirely at its word, so
// a slide that promises something the app then refuses is worse than no slide.
// Where a number appears, the file that owns it is named in a comment so the
// next person to change the rule can find the copy that repeats it.
//
// What was stale before this pass, for the record:
//
//   community      said $5 unlocks subscriber rooms and said nothing about
//                  Fan Pro, but src/pages/ChatRoomView.js:949 gates JOINING
//                  ANY room on Fan Pro. A free account followed that slide
//                  straight into a paywall it had not been told about.
//   competitions   said "watch your favourite artists take the crown", which
//                  entries being anonymous makes impossible. You cannot vote
//                  for a favourite you cannot see.
//   support        said 100% and "no platform fee", which
//                  src/components/PaymentSettings.js:273 contradicts: PayPal's
//                  fee comes off each sale.
//   notifications  sent people to Hub. The bell has been in the top bar since
//                  src/components/layout/AppLayout.js:129.
const SLIDES = [
  {
    id: 'welcome',
    accentColor: '#a855f7',
    glowColor: 'rgba(168,85,247,0.18)',
    title: "You just joined\nsomething real",
    subtitle: "Feelz Machine is an independent music platform built for artists and fans, not labels or algorithms. Here's how to get the most out of it.",
    visual: 'welcome',
  },
  {
    id: 'discover',
    accentColor: '#22d3ee',
    glowColor: 'rgba(34,211,238,0.14)',
    tag: 'For You · Browse',
    title: 'Discover music\nyou won\'t find\nanywhere else',
    subtitle: 'Swipe For You for a feed that learns what you like, or open Browse for trending, new releases and featured artists. Open the lyrics on a track and the words light up as they are sung.',
    visual: 'discover',
  },
  {
    id: 'follow',
    accentColor: '#f472b6',
    glowColor: 'rgba(244,114,182,0.14)',
    tag: 'Follow Artists',
    title: 'Follow artists\nand never miss a drop',
    subtitle: "Following an artist puts their releases and their posts in front of you, and sends you a notification the moment they publish. Your feed becomes their direct line to you.",
    visual: 'follow',
  },
  {
    id: 'community',
    accentColor: '#10b981',
    glowColor: 'rgba(16,185,129,0.14)',
    tag: 'Community · Chats',
    // Two separate gates, said in the order you meet them. Fan Pro is what
    // gets you into a room at all (ChatRoomView.js:949); the $5 is only for
    // an artist's subscribers-only room (ChatRoomView.js:955). The old copy
    // mentioned the second and not the first, which reads as a bait.
    title: 'Get into the\ncommunity',
    subtitle: "Artists post updates and behind-the-scenes moments, and talk to fans in their chat rooms. Rooms come with Fan Pro at $2.99 a month, and spending $5 or more on an artist opens their subscribers-only room too.",
    visual: 'community',
  },
  {
    id: 'competitions',
    accentColor: '#f59e0b',
    glowColor: 'rgba(245,158,11,0.15)',
    tag: 'Competitions',
    // Anonymity is the interesting part and it was missing. Numbers here match
    // the rules listed on src/pages/CompetitionsPage.js:495-499.
    title: 'Vote in music\ncompetitions',
    subtitle: "The community picks the winners, and entries are anonymous, so you are voting on the music rather than the name attached to it. You get two votes per competition. Winners take a tier upgrade and a verified badge.",
    visual: 'competitions',
  },
  {
    id: 'support',
    accentColor: '#ef4444',
    glowColor: 'rgba(239,68,68,0.13)',
    tag: 'Support Artists',
    // Honest version of the old 100% claim. Also draws the Downloads/Offline
    // line that src/pages/LibraryPage.js:262-267 says people confuse.
    title: 'Buy the music,\nkeep the artist\nmaking it',
    subtitle: "Feelz Machine takes no cut of a sale. What you pay goes to the artist, less PayPal's processing fee on the way through. Free downloads are capped at three a month. Anything you pay for is never capped.",
    visual: 'support',
  },
  {
    id: 'notifications',
    accentColor: '#818cf8',
    glowColor: 'rgba(129,140,248,0.14)',
    tag: 'Notifications',
    title: 'Turn on\nnotifications',
    subtitle: "New drops from artists you follow, competition results and platform news. The bell at the top of the screen is where they all land. Tap Next to allow push as well, so a drop reaches you with the app closed.",
    visual: 'notifications',
  },
  {
    id: 'done',
    accentColor: '#a855f7',
    glowColor: 'rgba(168,85,247,0.18)',
    title: "Now go find\nyour next\nfavourite artist",
    subtitle: "Follow a few artists, save something for offline, vote when a competition opens, and buy the tracks you keep coming back to.",
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
  // Both rooms carry their real key. Showing one room wide open was the
  // picture that made the old copy misleading even before you read it: a free
  // account cannot walk into either of these.
  const items = [
    { type: 'post', text: 'New single dropping Friday 🔥', time: '2m' },
    { type: 'room', text: 'Inner Circle',      key: 'Fan Pro'  },
    { type: 'room', text: 'Subscribers Only',  key: '$5 spent' },
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
              <MessageCircle className="w-4 h-4 flex-shrink-0" style={{ color }} />
              <span className="text-xs flex-1 text-white/70">{item.text}</span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                style={{ backgroundColor: color + '22', color }}
              >
                {item.key}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CompetitionsVisual({ color }) {
  // No artist names, because there are none to show. "Beat Battle" was an
  // invented competition title and is gone; the header says what the state
  // actually is, and the entries look the way an anonymous ballot looks.
  const entries = [
    { label: 'Entry #1', votes: 312, pct: 78 },
    { label: 'Entry #2', votes: 189, pct: 47 },
    { label: 'Entry #3', votes: 74,  pct: 18 },
  ];
  return (
    <div className="mx-auto w-60">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Trophy className="w-3.5 h-3.5" style={{ color }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color }}>Voting Open</span>
        </div>
        <span className="text-[10px] font-semibold" style={{ color }}>2 votes left</span>
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
        {/* Matches the wording already used on src/pages/CompetitionRoomPage.js:342
            so the promise made here is the promise made there. */}
        <p className="text-center text-[10px] text-white/25 pt-0.5">Names hidden until the winner is revealed</p>
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
        {/* A receipt that does not add up is worse than no receipt. The old one
            showed $2.00 in, $0.00 platform, $2.00 out, which is not what
            happens: PayPal takes its processing fee on the way through, as
            src/components/PaymentSettings.js:273 already tells artists. The
            platform line is still $0.00, because that part was always true. */}
        <div className="flex items-center justify-between py-2 border-t" style={{ borderColor: color + '20' }}>
          <span className="text-xs text-white/40">You pay</span>
          <span className="text-sm font-bold text-white">$2.00</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-white/40">Feelz Machine cut</span>
          <span className="text-sm font-bold" style={{ color: '#10b981' }}>$0.00</span>
        </div>
        <div className="flex items-center justify-between py-1">
          <span className="text-xs text-white/40">PayPal processing</span>
          <span className="text-xs text-white/35">their fee</span>
        </div>
        <div className="flex items-center justify-between py-1 border-t mt-1 pt-2" style={{ borderColor: color + '20' }}>
          <span className="text-xs font-semibold text-white">Artist receives</span>
          <span className="text-sm font-bold" style={{ color }}>the rest</span>
        </div>
      </div>
      <p className="text-center text-[10px] text-white/25">We take no cut of a sale. Not now, not later.</p>
    </div>
  );
}

function NotificationsVisual({ color }) {
  // "Beat Battle" was never a real competition name, so it is gone from here
  // too. The header is the bell, because that is where these land now and the
  // slide used to send people to Hub looking for a panel that moved.
  const notifs = [
    { icon: '🎵', text: 'DJ Kush dropped a new track', sub: 'Tap to listen' },
    { icon: '🏆', text: 'A competition result is in',  sub: 'The winner is revealed' },
    { icon: '📣', text: 'Platform update from Feelz',  sub: 'New features available' },
  ];
  return (
    <div className="mx-auto w-60 space-y-1.5">
      <div className="flex items-center justify-center space-x-2 pb-1.5">
        <Bell className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>The bell, top of screen</span>
      </div>
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

// ── Main component ────────────────────────────────────────────────────────────
export default function ListenerWelcomeTour({ displayName, onDone }) {
  const [step, setStep]       = useState(0);
  const [animDir, setAnimDir] = useState(1);
  const [visible, setVisible] = useState(false);
  const { user } = useAuth();
  const { supported, subscribed, subscribe } = usePushNotifications(user);

  const slide  = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(t);
  }, [step]);

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
    <div className="fixed inset-0 z-[500] flex flex-col bg-black overflow-y-auto">
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
      <div className="relative z-10 flex items-center space-x-1 px-6 mb-5">
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
        className="relative z-10 flex-1 flex flex-col items-center justify-between px-6 pb-6"
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