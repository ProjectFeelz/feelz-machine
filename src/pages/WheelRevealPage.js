/**
 * WheelRevealPage.js — /wheel
 * Redesigned to match Feelz Machine's Pitch Black aesthetic.
 * Dark slices, white/purple palette, no carnival colors.
 * Also includes a personal spin mode for self-directed challenges.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Trophy, Clock, Music, ChevronRight,
  RefreshCw, Shuffle, Lock,
} from 'lucide-react';

// ── Full prompt library ───────────────────────────────────────────────────────
export const SINGER_PROMPTS = [
  "Sing about falling in love\nwith your WiFi password",
  "A heartbreak song about\nyour meal going cold",
  "Serenade a parking ticket\nyou just received",
  "Love song to your\n3AM fridge raid",
  "Ballad of the last\npair of clean socks",
  "Sing about missing someone\nbut it's your nap",
  "Power anthem about\nforgetting your charger",
  "Gospel song about finding\nmoney in old jeans",
  "Sad song about your plant\nthat didn't survive",
  "Bop about being stuck\nbehind a slow walker",
  "Sing about autocorrect\nruining your life",
  "A lullaby for your\ndead phone battery",
  "Ode to the person\nwho ate your food",
  "Breakup song to\nyour alarm clock",
  "Anthem for surviving\na Monday morning",
  "Sing about being ghosted\nby your delivery driver",
  "Love song to\nthe snooze button",
  "Aria about running\nout of mobile data",
  "Your ex but they're\na streaming service",
  "Protest song about\nthe queue at the bank",
  "Ballad about your\nfavourite takeaway order",
  "Sad song about\nWiFi dropping mid-call",
  "Hype track for\ncleaning your room",
  "Blues song about\nslow internet connection",
  "Victory song for\nfinding a parking spot",
  "Lament about your\nlaundry pile growing",
  "Bop about being\non hold forever",
  "Torch song for\na cancelled TV show",
  "Emotional send-off for\nyour dying laptop",
  "Stadium anthem about\ncooking with no gas",
  // Afrocentric & SA themes
  "Love song set at\na Sunday braai",
  "Ballad about load\nshedding ruining the vibe",
  "Anthem for surviving\nthe taxi rank",
  "Song about your\nspaza shop owner",
  "Gospel about finally\ngetting the bag",
  "Lament about your\nfirst paycheck disappearing",
  "Ode to Sunday\nchurch clothes you can't crease",
  "Hype track for\nyour side hustle",
  "Spiritual about your\nancestors watching over you",
  "Love song to\nthe rain finally coming",
];

export const BEATMAKER_PROMPTS = [
  "A beat like a\nhaunted kitchen at midnight",
  "Afrobeats meets elevator music\n— make it slap",
  "Built around the sound\nof rain on tin roof",
  "Jazz x Trap x something\nyour grandma approves of",
  "Cinematic beat like\na heist in slow motion",
  "Lo-fi but you're\nfloating on the moon",
  "Drill beat with\na lullaby melody twist",
  "Sounds like the\nocean is rapping",
  "Build a beat around\nan animal sound",
  "A beat so weird\nit somehow works",
  "Amapiano but set\nin outer space",
  "Trap beat using only\nkitchen sounds",
  "A beat that feels\nlike a sunrise",
  "Afro-fusion meets\ncold winter vibes",
  "Slaps but also\nsomehow makes you cry",
  "A beat your ancestors\nwould dance to",
  "Highlife x Phonk\n— trust the vision",
  "A carnival beat\nthat feels lonely",
  "Percussion-only beat\nthat tells a story",
  "Chaos slowly\nbecoming peace",
  "Beat inspired by\nthe sound of traffic",
  "Gqom meets classical\norchestra — go wild",
  "A beat that sounds\nlike falling in love",
  "Lo-fi hip hop set\nin Lagos circa 1975",
  "A beat that feels\nlike pure nostalgia",
  "Makes you want to\njust sprint somewhere",
  "Starts gentle then\nhits like a truck",
  "Afrobeats but underwater\n— you heard me",
  "Score for a movie\nscene that doesn't exist",
  "Samples silence and\nsomehow makes it fire",
  // New additions
  "Amapiano x Jazz —\nmorning coffee session",
  "Gqom x R&B —\nmidnight feels",
  "Kwaito energy but\nit's 2025",
  "Beat for a scene\nwhere someone gets their money",
  "Township sounds meet\nfuture bass",
  "Sunday morning\nchurch drums go hard",
  "A beat that feels\nlike summer rain",
  "Afrobeats x Classical —\nstrings and percussion",
  "Lo-fi but it's\na taxi at 6am",
  "Something that hits\ndifferent at 3am",
];

export const ALL_PROMPTS = [...SINGER_PROMPTS, ...BEATMAKER_PROMPTS];

// ── Slice colors — dark palette matching app aesthetic ───────────────────────
const SLICE_COLORS = [
  ['rgba(139,92,246,0.7)',  'rgba(109,40,217,0.9)'],   // purple
  ['rgba(30,30,40,0.95)',   'rgba(15,15,25,1)'],        // near-black
  ['rgba(79,70,229,0.7)',   'rgba(55,48,163,0.9)'],     // indigo
  ['rgba(20,20,35,0.95)',   'rgba(10,10,20,1)'],        // deep black
  ['rgba(124,58,237,0.65)', 'rgba(91,33,182,0.9)'],     // violet
  ['rgba(25,25,40,0.95)',   'rgba(12,12,28,1)'],        // dark
  ['rgba(67,56,202,0.65)',  'rgba(49,46,129,0.9)'],     // deep indigo
  ['rgba(15,15,30,0.95)',   'rgba(8,8,18,1)'],          // darkest
  ['rgba(109,40,217,0.6)',  'rgba(76,29,149,0.9)'],     // deep purple
  ['rgba(22,22,38,0.95)',   'rgba(11,11,22,1)'],        // near-black 2
];

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[523.25,0],[659.25,0.13],[783.99,0.26],[1046.5,0.39]].forEach(([freq,delay]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      const t = ctx.currentTime + delay;
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.2,t+0.04);
      g.gain.exponentialRampToValueAtTime(0.001,t+0.65);
      o.start(t); o.stop(t+0.7);
    });
  } catch(e) {}
}

function polarToXY(deg, r, cx, cy) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(i, total, cx, cy, r) {
  const a = 360/total, s = i*a, e = s+a;
  const p1 = polarToXY(s,r,cx,cy), p2 = polarToXY(e,r,cx,cy);
  return `M${cx},${cy} L${p1.x},${p1.y} A${r},${r} 0 ${a>180?1:0},1 ${p2.x},${p2.y} Z`;
}

// Fixed 12-slice wheel — no text, clean color blocks
const WHEEL_SLICES = 12;
const WHEEL_COLORS = [
  ['rgba(139,92,246,0.85)',  'rgba(109,40,217,1)'],    // purple
  ['rgba(30,30,50,0.95)',    'rgba(15,15,30,1)'],       // near-black
  ['rgba(99,102,241,0.8)',   'rgba(67,56,202,1)'],      // indigo
  ['rgba(20,20,40,0.95)',    'rgba(10,10,25,1)'],       // deep black
  ['rgba(124,58,237,0.85)',  'rgba(91,33,182,1)'],      // violet
  ['rgba(25,25,45,0.95)',    'rgba(12,12,28,1)'],       // dark
  ['rgba(79,70,229,0.8)',    'rgba(55,48,163,1)'],      // deep indigo
  ['rgba(15,15,35,0.95)',    'rgba(8,8,20,1)'],         // darkest
  ['rgba(109,40,217,0.8)',   'rgba(76,29,149,1)'],      // deep purple
  ['rgba(22,22,42,0.95)',    'rgba(11,11,24,1)'],       // near-black 2
  ['rgba(167,139,250,0.5)',  'rgba(139,92,246,0.8)'],   // light purple
  ['rgba(18,18,38,0.95)',    'rgba(9,9,20,1)'],         // darkest 2
];

function WheelSVG({ rotation, size }) {
  const cx = size/2, cy = size/2, r = size/2 - 4;
  const total = WHEEL_SLICES;
  const sa = 360 / total;

  return (
    <svg width={size} height={size}
      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0s', display: 'block' }}>
      <defs>
        {WHEEL_COLORS.map(([c1,c2],i) => (
          <radialGradient key={i} id={`wfm${i}`} cx="35%" cy="25%" r="85%">
            <stop offset="0%" stopColor={c1}/>
            <stop offset="100%" stopColor={c2}/>
          </radialGradient>
        ))}
        <radialGradient id="wfmhub" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="rgba(139,92,246,0.5)"/>
          <stop offset="100%" stopColor="rgba(0,0,0,0.95)"/>
        </radialGradient>
        <radialGradient id="wfmshine" cx="40%" cy="15%" r="65%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.07)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>

      {Array.from({ length: total }).map((_, i) => {
        const ci = i % WHEEL_COLORS.length;
        return (
          <path
            key={i}
            d={slicePath(i, total, cx, cy, r)}
            fill={`url(#wfm${ci})`}
            stroke="rgba(0,0,0,0.4)"
            strokeWidth="1.2"
          />
        );
      })}

      {/* Subtle shine overlay */}
      <circle cx={cx} cy={cy} r={r} fill="url(#wfmshine)" style={{ pointerEvents: 'none' }}/>

      {/* Rim */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(139,92,246,0.25)" strokeWidth="1.5"/>

      {/* Hub */}
      <circle cx={cx} cy={cy} r={20} fill="url(#wfmhub)" stroke="rgba(139,92,246,0.35)" strokeWidth="1.5"/>
      <circle cx={cx} cy={cy} r={9} fill="rgba(139,92,246,0.7)"/>
      <circle cx={cx-3} cy={cy-3} r={3} fill="rgba(255,255,255,0.25)"/>
    </svg>
  );
}

function timeLeft(date) {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const d = Math.floor(ms/86400000);
  const h = Math.floor((ms%86400000)/3600000);
  const m = Math.floor((ms%3600000)/60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export default function WheelRevealPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [mode, setMode] = useState('platform'); // 'platform' | 'personal'
  const [personalMode, setPersonalMode] = useState('both'); // 'singer' | 'beatmaker' | 'both'
  const [challenge, setChallenge]       = useState(null);
  const [pastChallenges, setPast]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [rotation, setRotation]         = useState(0);
  const [spinning, setSpinning]         = useState(false);
  const [revealed, setRevealed]         = useState(false);
  const [personalResult, setPersonalResult] = useState(null);

  const animRef = useRef(null);
  const stRef   = useRef(null);
  const rotRef  = useRef(0);

  const getPromptPool = () => {
    if (mode === 'personal') {
      if (personalMode === 'singer') return SINGER_PROMPTS;
      if (personalMode === 'beatmaker') return BEATMAKER_PROMPTS;
      return ALL_PROMPTS;
    }
    return ALL_PROMPTS;
  };

  const prompts = getPromptPool();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: current } = await supabase
      .from('wheel_challenges')
      .select('*, competitions(*)')
      .eq('is_current', true)
      .maybeSingle();
    setChallenge(current);

    const { data: past } = await supabase
      .from('wheel_challenges')
      .select('*, competitions(id, title, status)')
      .eq('is_current', false)
      .order('spun_at', { ascending: false })
      .limit(8);
    setPast(past || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-spin to current week's prompt on load
  useEffect(() => {
    if (!challenge || spinning || revealed || mode !== 'platform') return;
    const idx = ALL_PROMPTS.findIndex(p => p === challenge.prompt);
    if (idx >= 0) {
      const t = setTimeout(() => spinToIndex(idx, ALL_PROMPTS), 600);
      return () => clearTimeout(t);
    }
  }, [challenge, mode]); // eslint-disable-line

  const easeOut = t => 1 - Math.pow(1 - t, 4);

  const spinToIndex = (targetIdx, pool) => {
    setSpinning(true);
    setRevealed(false);
    setPersonalResult(null);
    // Map prompt index to one of the 12 wheel slices
    const sliceIdx = targetIdx % WHEEL_SLICES;
    const total = WHEEL_SLICES;
    const sa = 360 / total;
    const targetDeg = 360 - (sliceIdx * sa + sa / 2);
    const startRot = rotRef.current;
    const totalRotation = startRot + 5 * 360 + ((targetDeg - startRot % 360) + 360) % 360;
    const duration = mode === 'personal' ? 3500 : 4800;
    stRef.current = null;

    const animate = (ts) => {
      if (!stRef.current) stRef.current = ts;
      const p = Math.min((ts - stRef.current) / duration, 1);
      const cur = startRot + easeOut(p) * (totalRotation - startRot);
      setRotation(cur);
      rotRef.current = cur;
      if (p < 1) { animRef.current = requestAnimationFrame(animate); return; }
      setRotation(totalRotation);
      rotRef.current = totalRotation;
      setSpinning(false);
      chime();
      if (mode === 'personal') setPersonalResult(pool[targetIdx]);
      setTimeout(() => setRevealed(true), 250);
    };
    animRef.current = requestAnimationFrame(animate);
  };

  const spinPersonal = () => {
    if (spinning) return;
    const pool = getPromptPool();
    const idx = Math.floor(Math.random() * pool.length);
    spinToIndex(idx, pool);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const size = typeof window !== 'undefined' ? Math.min(window.innerWidth - 48, 320) : 300;

  return (
    <div className="min-h-screen bg-black text-white pb-32">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-14 pb-4 md:pt-6">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.08] transition">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold text-white">Collab Roulette</h1>
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Spin · Create · Drop It</p>
        </div>
        <div className="w-9" />
      </div>

      {/* Mode toggle */}
      <div className="flex space-x-1 mx-4 mb-5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {[
          { key: 'platform', label: '🎲 Weekly Challenge' },
          { key: 'personal', label: '🎯 Spin for Yourself' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => {
            setMode(key);
            setRevealed(false);
            setPersonalResult(null);
            setRotation(0);
            rotRef.current = 0;
          }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
              mode === key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Personal mode filter */}
      {mode === 'personal' && (
        <div className="flex space-x-2 mx-4 mb-4">
          {[
            { key: 'both', label: 'All' },
            { key: 'singer', label: '🎤 Vocalist' },
            { key: 'beatmaker', label: '🎛️ Producer' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => {
              setPersonalMode(key);
              setRevealed(false);
              setPersonalResult(null);
            }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                personalMode === key
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-white/[0.04] text-white/40 border border-white/[0.06]'
              }`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {loading && mode === 'platform' ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-purple-500 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col items-center px-4">

          {/* Wheel */}
          <div className="relative mb-6">
            {/* Subtle glow behind wheel */}
            <div className="absolute inset-0 rounded-full blur-2xl opacity-20"
              style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.6) 0%, transparent 70%)' }} />

            {/* Bezel */}
            <div className="relative" style={{
              borderRadius: '50%',
              padding: 6,
              background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.4) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}>
              <WheelSVG rotation={rotation} size={size} />
            </div>

            {/* Pointer */}
            <div className="absolute" style={{ top: -4, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
              <div style={{
                width: 0, height: 0,
                borderLeft: '9px solid transparent',
                borderRight: '9px solid transparent',
                borderTop: '22px solid rgba(139,92,246,0.9)',
                filter: 'drop-shadow(0 0 6px rgba(139,92,246,0.6))',
              }}/>
            </div>
          </div>

          {/* Spinning indicator */}
          {spinning && (
            <p className="text-xs text-white/30 uppercase tracking-widest mb-4">Spinning...</p>
          )}

          {/* Platform mode — reveal */}
          {mode === 'platform' && revealed && challenge && (
            <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 mb-4"
              style={{ animation: 'fadeUp 0.4s ease' }}>
              <div className="flex items-center space-x-2 mb-3">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">This week's challenge</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-purple-500/15 text-purple-400 border border-purple-500/20">
                  {challenge.mode === 'singer' ? '🎤 Vocalist' : '🎛️ Producer'}
                </span>
              </div>
              <p className="text-lg font-bold text-white leading-relaxed mb-4"
                style={{ whiteSpace: 'pre-line' }}>
                {challenge.prompt}
              </p>

              {/* Timers */}
              {challenge.competitions && (
                <div className="flex space-x-4 mb-4">
                  {challenge.competitions.entries_close_at && challenge.competitions.status === 'open' && (
                    <div>
                      <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Entries close</p>
                      <p className="text-xs font-bold text-white flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-green-400" />
                        <span>{timeLeft(challenge.competitions.entries_close_at)}</span>
                      </p>
                    </div>
                  )}
                  {challenge.competitions.voting_close_at && challenge.competitions.status === 'voting' && (
                    <div>
                      <p className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Voting closes</p>
                      <p className="text-xs font-bold text-white flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-purple-400" />
                        <span>{timeLeft(challenge.competitions.voting_close_at)}</span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Prize */}
              <div className="flex items-center space-x-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4">
                <Trophy className="w-4 h-4 text-yellow-400/70 flex-shrink-0" />
                <p className="text-xs text-white/60">Win 3 months Pro or Premium — automatically applied</p>
              </div>

              {challenge.competitions?.id && (
                <button
                  onClick={() => navigate(`/competition/${challenge.competitions.id}`)}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 transition active:scale-[0.98]">
                  {challenge.competitions.status === 'voting' ? '🗳️ Vote Now' :
                   challenge.competitions.status === 'open'   ? '🎵 Enter Challenge' : 'View Challenge'}
                </button>
              )}
            </div>
          )}

          {/* Platform — no active challenge */}
          {mode === 'platform' && !challenge && !loading && (
            <div className="text-center py-8">
              <p className="text-sm text-white/30">Next challenge spins Sunday 9am</p>
            </div>
          )}

          {/* Personal mode — spin button + result */}
          {mode === 'personal' && (
            <>
              <button
                onClick={spinPersonal}
                disabled={spinning}
                className="mb-5 flex items-center space-x-2 px-8 py-3 rounded-2xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-40"
                style={{
                  background: spinning ? 'rgba(255,255,255,0.04)' : 'rgba(139,92,246,0.2)',
                  border: '1px solid rgba(139,92,246,0.3)',
                  color: spinning ? 'rgba(255,255,255,0.3)' : '#a78bfa',
                }}>
                <Shuffle className="w-4 h-4" />
                <span>{spinning ? 'Spinning...' : 'Spin the Wheel'}</span>
              </button>

              {revealed && personalResult && (
                <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 mb-4"
                  style={{ animation: 'fadeUp 0.4s ease' }}>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Your challenge</p>
                  <p className="text-lg font-bold text-white leading-relaxed mb-4"
                    style={{ whiteSpace: 'pre-line' }}>
                    {personalResult}
                  </p>
                  <div className="flex space-x-2">
                    <button onClick={spinPersonal}
                      className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-medium bg-white/[0.06] text-white/50 hover:bg-white/[0.1] transition border border-white/[0.06]">
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Spin Again</span>
                    </button>
                    {user && (
                      <button onClick={() => navigate('/dashboard?tab=upload')}
                        className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-500 transition">
                        <Music className="w-3.5 h-3.5" />
                        <span>Upload Track</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-white/20 text-center mt-3">
                    Personal spins are just for fun — no competition entry
                  </p>
                </div>
              )}

              {!spinning && !revealed && (
                <p className="text-xs text-white/20 text-center mb-4">
                  {prompts.length} prompts · spin anytime for inspiration
                </p>
              )}
            </>
          )}

          {/* Past challenges */}
          {mode === 'platform' && pastChallenges.length > 0 && (
            <div className="w-full max-w-sm mt-2">
              <p className="text-[10px] text-white/25 uppercase tracking-widest font-semibold mb-3">
                Previous Challenges
              </p>
              <div className="space-y-1.5">
                {pastChallenges.map(pc => (
                  <button key={pc.id}
                    onClick={() => pc.competitions?.id && navigate(`/competition/${pc.competitions.id}`)}
                    className="w-full flex items-center space-x-3 p-3 rounded-xl text-left transition hover:bg-white/[0.03] active:scale-[0.98] bg-white/[0.02] border border-white/[0.04]">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-purple-500/10">
                      <Music className="w-3.5 h-3.5 text-purple-400/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/70 truncate">
                        {pc.prompt.split('\n').join(' ')}
                      </p>
                      <p className="text-[9px] text-white/25 mt-0.5 uppercase tracking-wide">
                        {new Date(pc.spun_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {pc.competitions?.status === 'completed' ? ' · Complete' : ''}
                      </p>
                    </div>
                    {pc.competitions?.id && <ChevronRight className="w-3.5 h-3.5 text-white/15 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sticky Enter Challenge bar — always visible when active comp exists */}
      {mode === 'platform' && challenge?.competitions?.id &&
       ['open', 'voting'].includes(challenge.competitions.status) && (
        <div className="fixed bottom-16 left-0 right-0 md:left-64 px-4 pb-2 z-40"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.95) 60%, transparent)' }}>
          <button
            onClick={() => navigate(`/competition/${challenge.competitions.id}`)}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 transition active:scale-[0.98] flex items-center justify-center space-x-2">
            <Trophy className="w-4 h-4" />
            <span>{challenge.competitions.status === 'voting' ? 'Vote Now — Voting Open' : "Enter This Week's Challenge"}</span>
          </button>
        </div>
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}