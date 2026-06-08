/**
 * CompetitionsPage.js
 * Route: /competitions
 *
 * The main competitions hub — shows:
 * - Current Collab Roulette wheel challenge (prominent, interactive)
 * - Active Paid Collaborations
 * - Active standard competitions
 * - Past winners with their tracks
 * - How it works explainer
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Trophy, Clock, ArrowRight, Music, Play, Pause,
  ChevronDown, ChevronUp, Crown, Zap, Users, Star,
} from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import { ALL_PROMPTS } from './WheelRevealPage';



const SPIN_CAP = 5;

const TIER_WEIGHTS = { Common: 50, Rare: 30, Epic: 15, Legendary: 5 };
const TIER_STYLES = {
  Common:    { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.25)' },
  Rare:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)'  },
  Epic:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)' },
  Legendary: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.35)'  },
};
const GENERIC_MODS = [
  "You have exactly 20 minutes to finish this.",
  "Use only one microphone for the entire session.",
  "Don't listen back until the whole project is exported.",
  "The first take is the final take. No do-overs.",
  "Finish it tonight — no saving for tomorrow.",
  "Share a 30-second clip before midnight.",
  "Name the track before you start making it.",
  "Dedicate it to someone specific before you begin.",
  "The final track must be under 2 minutes.",
  "No compression anywhere in the mix.",
];

// Inline challenge pool (subset for the spin tab)
const SINGER_POOL = [
  { id:'s01', tier:'Common',    points:100,  prompt:'Write a love song set at a Sunday braai — no chorus.',                                   modifier:'Include the sound of tongs clicking twice.' },
  { id:'s02', tier:'Common',    points:100,  prompt:'Write an anthem for your first paycheque disappearing in exactly 3 days.',               modifier:'Tempo must be fast and chaotic.' },
  { id:'s03', tier:'Common',    points:100,  prompt:'Write a power anthem about being stuck on the pavement behind a slow walker.',            modifier:'The chorus must feel like an absolute stampede.' },
  { id:'s04', tier:'Rare',      points:250,  prompt:'Write a full song with absolutely no pronouns — no I, you, we, or they.',                modifier:'Focus entirely on objects, locations, and descriptions.' },
  { id:'s05', tier:'Rare',      points:250,  prompt:'Write a hook so simple it almost embarrasses you — then belt it out.',                   modifier:'Repeat the hook four times consecutively with increasing energy.' },
  { id:'s06', tier:'Rare',      points:250,  prompt:'Write a song in the second person — address the listener directly the whole way.',        modifier:'Make it feel like a face-to-face confrontation.' },
  { id:'s07', tier:'Epic',      points:500,  prompt:'Write a chorus that seamlessly works as both an R&B love song and a Sunday prayer.',      modifier:'Use heavy reverb to simulate an empty church hall.' },
  { id:'s08', tier:'Epic',      points:500,  prompt:'Write a song set in 2075 Johannesburg — what are the inner-city heartbreaks like?',       modifier:'Apply a heavy futuristic vocal effect or vocoder to the bridge.' },
  { id:'s09', tier:'Legendary', points:1000, prompt:"Write the exact song you've been too terrified to write — and commit to it.",           modifier:"One-take recording only. No vocal tuning or editing allowed." },
  { id:'s10', tier:'Legendary', points:1000, prompt:"Write the sincere apology you've never been able to say out loud.",                     modifier:'The track must end mid-word, like a cut phone call.' },
];
const BEATMAKER_POOL = [
  { id:'b01', tier:'Common',    points:100,  prompt:'Make a beat for a braai at 6:00 PM when the energy is transitioning perfectly.',         modifier:'Incorporate the hiss of lighter fluid or fire crackle into the riser.' },
  { id:'b02', tier:'Common',    points:100,  prompt:'Make a trap beat where the primary percussion is entirely kitchen sounds.',               modifier:'Replace the hi-hats with the sound of silverware clinking.' },
  { id:'b03', tier:'Common',    points:100,  prompt:'Make a Sunday morning beat with heavy church drums, but make them knock like a club track.', modifier:'Add a deep distorted sub-bass underneath an organ progression.' },
  { id:'b04', tier:'Rare',      points:250,  prompt:"Make a beat using only 3 distinct sound sources — make every one carry its weight.",      modifier:'Manipulate pitch, delay, and filtering to turn one sound into multiple roles.' },
  { id:'b05', tier:'Rare',      points:250,  prompt:'Make a beat with absolutely no kick drum at all.',                                       modifier:'Find an alternative transient or low-end drop to ground the 1.' },
  { id:'b06', tier:'Rare',      points:250,  prompt:'Make a beat where an aggressive bassline carries the entire emotional weight.',           modifier:'The melody instruments must remain stark, thin, and cold.' },
  { id:'b07', tier:'Epic',      points:500,  prompt:'Make an Amapiano track that feels simultaneously like a somber funeral and a celebration.', modifier:'Juxtapose a minor-key chord progression with an explosive high-energy log drum.' },
  { id:'b08', tier:'Epic',      points:500,  prompt:'Make a drill beat that samples a traditional lullaby — keep both distinct energies fully intact.', modifier:'The slide bass must glide underneath the delicate melody without drowning it.' },
  { id:'b09', tier:'Legendary', points:1000, prompt:"Open the oldest most intimidating unfinished masterpiece you have — and finally export the master.", modifier:"No adding sections. Arrange what you have, mix it down, call it complete." },
  { id:'b10', tier:'Legendary', points:1000, prompt:'Create a complete hard-hitting beat using exclusively samples generated by your own voice.', modifier:'Click your tongue for percussion, hum the sub-bass, snap for claps.' },
];

function pickChallenge(mode) {
  const pool = mode === 'singer' ? SINGER_POOL : BEATMAKER_POOL;
  const total = pool.reduce((s, p) => s + (TIER_WEIGHTS[p.tier] || 10), 0);
  let rand = Math.random() * total;
  let base = pool[pool.length - 1];
  for (const p of pool) { rand -= (TIER_WEIGHTS[p.tier] || 10); if (rand <= 0) { base = p; break; } }
  const extra = Math.random() < 0.5 ? ' Also: ' + GENERIC_MODS[Math.floor(Math.random() * GENERIC_MODS.length)] : '';
  return { ...base, modifier: base.modifier + extra };
}

// ── localStorage keys ────────────────────────────────────────────────────────
const LS_CHALLENGE = 'fm_spin_challenge';  // { result, mode, spunAt }
const LS_SPINS     = 'fm_spin_daily';      // { count, date }

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadStoredChallenge() {
  try {
    const raw = localStorage.getItem(LS_CHALLENGE);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function loadDailySpins() {
  try {
    const raw = localStorage.getItem(LS_SPINS);
    if (!raw) return 0;
    const { count, date } = JSON.parse(raw);
    return date === todayStr() ? (count || 0) : 0; // reset if new day
  } catch { return 0; }
}

function saveDailySpins(count) {
  localStorage.setItem(LS_SPINS, JSON.stringify({ count, date: todayStr() }));
}

function saveChallenge(result, mode) {
  localStorage.setItem(LS_CHALLENGE, JSON.stringify({
    result, mode, spunAt: new Date().toISOString(),
  }));
}

function clearChallenge() {
  localStorage.removeItem(LS_CHALLENGE);
}

function SpinForYourselfTab() {
  const { user, artist } = useAuth();
  const navigate = useNavigate();

  // Hydrate from localStorage on mount
  const [mode, setMode]         = React.useState(() => loadStoredChallenge()?.mode || 'singer');
  const [result, setResult]     = React.useState(() => loadStoredChallenge()?.result || null);
  const [spins, setSpins]       = React.useState(() => loadDailySpins());
  const [spinning, setSpinning] = React.useState(false);
  const [claiming, setClaiming] = React.useState(false);
  const [claimed, setClaimed]   = React.useState(false);
  const [xpError, setXpError]   = React.useState('');

  // Check if user already claimed this challenge
  React.useEffect(() => {
    if (!user || !result) return;
    supabase.from('challenge_xp')
      .select('id')
      .eq('user_id', user.id)
      .eq('challenge_id', result.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setClaimed(true); });
  }, [user, result?.id]); // eslint-disable-line

  const spin = () => {
    if (spinning || spins >= SPIN_CAP) return;
    setSpinning(true);
    setResult(null);
    setClaimed(false);
    setXpError('');
    setTimeout(() => {
      const r = pickChallenge(mode);
      setResult(r);
      const newCount = spins + 1;
      setSpins(newCount);
      saveDailySpins(newCount);
      saveChallenge(r, mode);
      setSpinning(false);
    }, 800);
  };

  const handleModeChange = (key) => {
    setMode(key);
    // Only clear result if there isn't a saved challenge already in play
    const stored = loadStoredChallenge();
    if (!stored || stored.mode !== key) {
      setResult(null);
      clearChallenge();
      setClaimed(false);
      setXpError('');
    }
  };

  const claimXP = async () => {
    if (!user) { navigate('/login'); return; }
    if (!result || claimed || claiming) return;
    setClaiming(true);
    setXpError('');
    try {
      // Verify the user has actually submitted a competition entry
      const { data: entry } = await supabase
        .from('competition_entries')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!entry) {
        setXpError('Upload your track first before claiming XP');
        setClaiming(false);
        return;
      }

      // Check for existing entry
      const { data: existing } = await supabase
        .from('challenge_xp')
        .select('id, total_xp')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from('challenge_xp').update({
          total_xp:      existing.total_xp + result.points,
          last_challenge: result.prompt,
          updated_at:    new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        const { data: artist } = await supabase
          .from('artists').select('id').eq('user_id', user.id).maybeSingle();
        await supabase.from('challenge_xp').insert({
          user_id:        user.id,
          artist_id:      artist?.id || null,
          total_xp:       result.points,
          last_challenge: result.prompt,
          challenge_id:   result.id,
        });
      }
      setClaimed(true);
      clearChallenge(); // clear persisted challenge after claim
      // Notify
      await supabase.from('notifications').insert({
        user_id: user.id,
        type:    'challenge_xp',
        title:   `+${result.points} XP earned!`,
        message: `${result.tier} challenge complete — ${result.prompt.slice(0, 60)}…`,
        metadata: { points: result.points, tier: result.tier, challenge_id: result.id },
      }).catch(() => {});
    } catch (err) {
      setXpError('Could not save XP — try again');
    }
    setClaiming(false);
  };

  const dismissChallenge = () => {
    clearChallenge();
    setResult(null);
    setClaimed(false);
    setXpError('');
  };

  const tc = result ? (TIER_STYLES[result.tier] || TIER_STYLES.Common) : null;
  const spunDate = loadStoredChallenge()?.spunAt
    ? new Date(loadStoredChallenge().spunAt).toLocaleDateString('en-ZA', { day:'numeric', month:'short' })
    : null;

  return (
    <div className="pb-8">

      {/* ── Mode selector ── */}
      <div className="px-4 mb-6">
        <div className="flex p-1 rounded-2xl gap-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[{key:'singer',label:'🎤 Vocalist'},{key:'beatmaker',label:'🎛️ Producer'}].map(({key,label}) => (
            <button key={key} onClick={() => handleModeChange(key)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition"
              style={mode === key
                ? { background: 'white', color: '#000' }
                : { color: 'rgba(255,255,255,0.3)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Active challenge card ── */}
      {result && tc ? (
        <div className="mx-4 mb-5 rounded-3xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${tc.border}` }}>
          {/* Coloured top bar */}
          <div style={{ height: 3, background: `linear-gradient(90deg, ${tc.color}, transparent)` }} />

          <div className="p-5">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                  style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>
                  {result.tier}
                </span>
                {spunDate && (
                  <span className="text-[10px] text-white/20">spun {spunDate}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-black" style={{ color: tc.color }}>+{result.points} XP</span>
                <button onClick={dismissChallenge}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition text-xs">
                  ✕
                </button>
              </div>
            </div>

            {/* Prompt */}
            <p className="text-lg font-bold text-white leading-snug mb-4" style={{ letterSpacing: '-0.01em' }}>
              {result.prompt}
            </p>

            {/* Twist */}
            <div className="rounded-2xl p-3.5 mb-5" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>twist</p>
              <p className="text-xs text-white/50 leading-relaxed">{result.modifier}</p>
            </div>

            {/* Actions */}
            {claimed ? (
              <div className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399' }}>
                <span>✓</span>
                <span>+{result.points} XP claimed</span>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={() => navigate('/dashboard?tab=upload')}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${tc.color}, ${tc.border.replace('0.25', '1').replace('0.35','1')})` }}>
                  Upload Track to Claim XP
                </button>
                <button onClick={claimXP} disabled={claiming}
                  className="w-full py-2.5 rounded-2xl text-xs font-semibold transition active:scale-[0.98] disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.4)' }}>
                  {claiming ? 'Saving…' : 'Already uploaded? Tap to claim XP'}
                </button>
                {xpError && <p className="text-[10px] text-red-400/60 text-center">{xpError}</p>}
              </div>
            )}

            <p className="text-[10px] text-white/15 text-center mt-3">
              Saved to this device — complete it anytime, no time limit.
            </p>
          </div>
        </div>
      ) : (
        /* ── Empty state — no active challenge ── */
        !spinning && (
          <div className="mx-4 mb-5 rounded-3xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="text-4xl mb-3">🎡</div>
            <p className="text-sm font-semibold text-white mb-1">No active challenge</p>
            <p className="text-xs text-white/30 leading-relaxed max-w-xs mx-auto">
              Spin to get a random creative prompt. It'll stay here until you complete it.
            </p>
          </div>
        )
      )}

      {/* ── Spin button ── */}
      <div className="px-4">
        <button onClick={spin} disabled={spinning || spins >= SPIN_CAP}
          className="w-full py-4 rounded-2xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2.5"
          style={{
            background: spinning
              ? 'rgba(139,92,246,0.08)'
              : spins >= SPIN_CAP
              ? 'rgba(255,255,255,0.03)'
              : 'linear-gradient(135deg,rgba(167,139,250,0.25),rgba(124,58,237,0.15))',
            border: `1px solid ${spins >= SPIN_CAP ? 'rgba(255,255,255,0.06)' : 'rgba(167,139,250,0.35)'}`,
            color: spins >= SPIN_CAP ? 'rgba(255,255,255,0.25)' : '#a78bfa',
          }}>
          <span style={{ fontSize: 18 }}>{spinning ? '⏳' : '🎡'}</span>
          <span>
            {spinning ? 'Spinning…'
              : spins >= SPIN_CAP ? 'Come back tomorrow'
              : result ? 'Spin for a new challenge'
              : 'Spin the Wheel'}
          </span>
        </button>

        {/* Spin counter */}
        {spins > 0 && (
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {Array.from({ length: SPIN_CAP }).map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full transition-all"
                style={{ background: i < spins ? '#a78bfa' : 'rgba(255,255,255,0.1)' }} />
            ))}
            <span className="text-[10px] text-white/20 ml-1">
              {spins >= SPIN_CAP ? 'resets midnight' : `${SPIN_CAP - spins} left today`}
            </span>
          </div>
        )}
      </div>

      {/* ── Tier legend ── */}
      {!result && (
        <div className="mx-4 mt-6 mb-8 grid grid-cols-4 gap-1.5">
          {Object.entries(TIER_STYLES).map(([tier, s]) => (
            <div key={tier} className="rounded-xl py-2 px-1 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
              <p className="text-[9px] font-black uppercase tracking-tight leading-tight" style={{ color: s.color }}>{tier}</p>
              <p className="text-[9px] text-white/30 mt-0.5">
                {tier === 'Common' ? '100 XP' : tier === 'Rare' ? '250 XP' : tier === 'Epic' ? '500 XP' : '1000 XP'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}





function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[523.25,0],[659.25,0.13],[783.99,0.26],[1046.5,0.39]].forEach(([freq,delay]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      const t = ctx.currentTime + delay;
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.25,t+0.04);
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

function MiniWheel({ rotation, size = 200 }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 4;
  const TOTAL = 12;
  const sa = 360 / TOTAL;
  const COLORS = [
    ['rgba(139,92,246,0.85)', 'rgba(109,40,217,1)'],
    ['rgba(25,25,45,0.95)',   'rgba(12,12,28,1)'],
    ['rgba(99,102,241,0.8)',  'rgba(67,56,202,1)'],
    ['rgba(15,15,35,0.95)',   'rgba(8,8,20,1)'],
    ['rgba(124,58,237,0.85)','rgba(91,33,182,1)'],
    ['rgba(20,20,40,0.95)',   'rgba(10,10,25,1)'],
    ['rgba(79,70,229,0.8)',   'rgba(55,48,163,1)'],
    ['rgba(12,12,28,0.95)',   'rgba(6,6,15,1)'],
    ['rgba(109,40,217,0.8)',  'rgba(76,29,149,1)'],
    ['rgba(18,18,38,0.95)',   'rgba(9,9,20,1)'],
    ['rgba(167,139,250,0.5)','rgba(139,92,246,0.8)'],
    ['rgba(15,15,30,0.95)',   'rgba(8,8,18,1)'],
  ];
  const slicePath = (i) => {
    const s = i * sa, e = s + sa;
    const p1x = cx + r * Math.cos(((s - 90) * Math.PI) / 180);
    const p1y = cy + r * Math.sin(((s - 90) * Math.PI) / 180);
    const p2x = cx + r * Math.cos(((e - 90) * Math.PI) / 180);
    const p2y = cy + r * Math.sin(((e - 90) * Math.PI) / 180);
    return `M${cx},${cy} L${p1x},${p1y} A${r},${r} 0 0,1 ${p2x},${p2y} Z`;
  };
  return (
    <svg width={size} height={size}
      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0s', display: 'block' }}>
      <defs>
        {COLORS.map(([c1, c2], i) => (
          <radialGradient key={i} id={`mpg${i}`} cx="35%" cy="25%" r="85%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </radialGradient>
        ))}
        <radialGradient id="mphub" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="rgba(139,92,246,0.5)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.95)" />
        </radialGradient>
      </defs>
      {COLORS.map((_, i) => (
        <path key={i} d={slicePath(i)}
          fill={`url(#mpg${i})`}
          stroke="rgba(0,0,0,0.4)" strokeWidth="1.2" />
      ))}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(139,92,246,0.2)" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={18} fill="url(#mphub)" stroke="rgba(139,92,246,0.3)" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={9} fill="rgba(139,92,246,0.7)" />
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
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function HowItWorksSummary() {
  const [open, setOpen] = useState(false);
  const steps = [
    { icon: '📋', title: "Check what's open", body: "The admin posts competitions with a brief, prize, and deadline. Check the competitions tab to see what's live and when entries close." },
    { icon: '🎵', title: 'Create and submit', body: 'Make something original inspired by the brief. Upload your track and submit your entry before the deadline — new recordings only.' },
    { icon: '🗳️', title: 'Community votes', body: 'Entries are anonymous. Each listener gets 2 votes. Most votes wins. No gaming it — just the music.' },
    { icon: '🏆', title: 'Winner gets rewarded', body: 'Free tier → 3 months Pro. Pro → 3 months Premium. Premium → 7-day featured placement. Plus Verified badge for all winners.' },
    { icon: '💰', title: 'Paid Collaborations', body: 'The platform drops stems and commissions a missing piece from the community. Winner gets $50 USD automatically via PayPal.' },
    { icon: '🎡', title: 'Challenge Wheel', body: 'Head to the Spin tab for personal creative challenges anytime — no competition required. Great for content, great for breaking blocks.' },
  ];

  return (
    <div className="mx-4 mb-5 rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02]">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.03] transition">
        <div className="flex items-center space-x-2">
          <Star className="w-4 h-4 text-yellow-400/60" />
          <p className="text-sm font-semibold text-white">How competitions work</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04]">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start space-x-3 pt-3">
              <div className="w-8 h-8 rounded-xl bg-white/[0.04] flex items-center justify-center flex-shrink-0 text-base">
                {step.icon}
              </div>
              <div className="flex-1 pt-0.5">
                <p className="text-xs font-bold text-white mb-0.5">{step.title}</p>
                <p className="text-xs text-white/40 leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CompetitionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [activeTab, setActiveTab]           = useState('competitions');
  const [competitions, setCompetitions]     = useState([]);
  const [pastWinners, setPastWinners]       = useState([]);
  const [leaderboard, setLeaderboard]       = useState([]);
  const [lbLoading, setLbLoading]           = useState(false);
  const [loading, setLoading]               = useState(true);
  const [rotation, setRotation]             = useState(0);
  const [spinning, setSpinning]             = useState(false);
  const [revealed, setRevealed]             = useState(false);
  const animRef = useRef(null);
  const stRef   = useRef(null);

  const prompts = ALL_PROMPTS;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Current wheel challenge
            // All active competitions
      const { data: comps } = await supabase
        .from('competitions')
        .select('id, title, status, brief, prize_description, cash_prize_amount, entries_close_at, voting_close_at, wheel_challenge, paid_collab, stem_pack_url')
        .in('status', ['open', 'voting', 'upcoming'])
        .order('created_at', { ascending: false })
        .limit(10);
      setCompetitions(comps || []);

      // Past winners — last 5 completed with winner entry
      // Fetch completed competitions then enrich with winner entry separately
      const { data: completedComps } = await supabase
        .from('competitions')
        .select('id, title, winner_entry_id')
        .eq('status', 'completed')
        .not('winner_entry_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5);

      if (completedComps?.length) {
        const winnerIds = completedComps.map(c => c.winner_entry_id).filter(Boolean);
        const { data: entries } = await supabase
          .from('competition_entries')
          .select('id, title, file_url, cover_artwork_url, artists(id, artist_name, slug, profile_image_url)')
          .in('id', winnerIds);
        const entryMap = {};
        (entries || []).forEach(e => { entryMap[e.id] = e; });
        setPastWinners(completedComps.map(c => ({
          ...c,
          competition_entries: entryMap[c.winner_entry_id] || null,
        })).filter(c => c.competition_entries));
      }
    } catch(err) { console.error('CompetitionsPage load error:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    const { data } = await supabase
      .from('challenge_xp')
      .select('user_id, total_xp, common_count, rare_count, epic_count, legendary_count')
      .order('total_xp', { ascending: false })
      .limit(50);
    if (!data) { setLbLoading(false); return; }
    // Fetch display names
    const ids = data.map(r => r.user_id).filter(Boolean);
    const [artistRes, listenerRes] = ids.length > 0
      ? await Promise.all([
          supabase.from('artists').select('user_id, artist_name, profile_image_url, slug').in('user_id', ids),
          supabase.from('listeners').select('user_id, display_name, avatar_url').in('user_id', ids),
        ])
      : [{ data: [] }, { data: [] }];
    const profileMap = {};
    (listenerRes.data || []).forEach(l => { profileMap[l.user_id] = { artist_name: l.display_name || 'Listener', profile_image_url: l.avatar_url || null }; });
    (artistRes.data  || []).forEach(a => { profileMap[a.user_id] = a; }); // artists override listeners
    setLeaderboard(data.map((r, i) => ({ ...r, rank: i + 1, artist: profileMap[r.user_id] || null })));
    setLbLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'leaderboard') loadLeaderboard();
  }, [activeTab, loadLeaderboard]);

  // Auto-spin to current prompt on load
  useEffect(() => {
    if (spinning || revealed) return;
    const idx = -1;
    const targetIdx = idx >= 0 ? idx : 0;
    const t = setTimeout(() => spinToIndex(targetIdx), 600);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  const easeOut = t => 1 - Math.pow(1 - t, 4);

  const spinToIndex = (targetIdx) => {
    setSpinning(true); setRevealed(false);
    const sliceIdx = targetIdx % 12;
    const sa = 360 / 12;
    const targetDeg = 360 - (sliceIdx * sa + sa / 2);
    const totalRotation = rotation + 5 * 360 + targetDeg;
    const duration = 4800;
    const startRot = rotation;
    stRef.current = null;

    const animate = (ts) => {
      if (!stRef.current) stRef.current = ts;
      const p = Math.min((ts - stRef.current) / duration, 1);
      setRotation(startRot + easeOut(p) * (totalRotation - startRot));
      if (p < 1) { animRef.current = requestAnimationFrame(animate); return; }
      setRotation(totalRotation);
      setSpinning(false);
      chime();
      setTimeout(() => setRevealed(true), 250);
    };
    animRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const size = typeof window !== 'undefined' ? Math.min(window.innerWidth - 80, 260) : 240;

  const activePaidCollabs = competitions.filter(c => c.paid_collab);
  const activeStandard = competitions.filter(c => !c.paid_collab); // show all including wheel challenges

  return (
    <div className="pb-32 pt-0">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap');`}</style>

      {/* Sticky header with tabs */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.04] px-4 pt-14 md:pt-4 pb-2">
        <h1 className="text-xl font-bold text-white mb-2">Competitions</h1>
        <div className="flex space-x-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {[
          { key: 'competitions', label: 'Competitions', emoji: '🏆' },
          { key: 'spin',         label: 'Spin',         emoji: '🎡' },
          { key: 'leaderboard',  label: 'Leaderboard',  emoji: '⚡' },
        ].map(({ key, label, emoji }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition flex flex-col items-center leading-tight ${
              activeTab === key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
            }`}>
            <span className="text-sm">{emoji}</span>
            <span className="hidden sm:inline mt-0.5">{label}</span>
          </button>
        ))}
        </div>
      </div>

      {activeTab === 'competitions' && (
        <>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Standard competitions ── */}
          {activeStandard.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center space-x-2 px-4 mb-3">
                <Trophy className="w-4 h-4 text-yellow-400/60" />
                <p className="text-sm font-bold text-white">Open Competitions</p>
              </div>
              <div className="space-y-2 px-4">
                {activeStandard.map(comp => (
                  <button key={comp.id}
                    onClick={() => navigate(`/competition/${comp.id}`)}
                    className="w-full flex items-center space-x-4 p-4 rounded-2xl text-left transition active:scale-[0.98] bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04]">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                      <Trophy className="w-5 h-5 text-yellow-400/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate mb-0.5">{comp.title}</p>
                      {comp.brief && <p className="text-xs text-white/40 truncate">{comp.brief}</p>}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1 inline-block ${
                        comp.status === 'voting' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                      }`}>
                        {comp.status === 'voting' ? 'Vote Now' : comp.status === 'upcoming' ? 'Coming Soon' : 'Enter Now'}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/45 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Past winners ── */}
          {pastWinners.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center space-x-2 px-4 mb-3">
                <Crown className="w-4 h-4 text-yellow-400/60" />
                <p className="text-sm font-bold text-white">Past Winners</p>
              </div>
              <div className="flex space-x-3 overflow-x-auto px-4 scrollbar-hide">
                {pastWinners.map(comp => {
                  const entry = comp.competition_entries;
                  const artist = entry?.artists;
                  const isActive = currentTrack?.id === entry?.id;
                  const isNowPlaying = isActive && isPlaying;
                  return (
                    <div key={comp.id} className="flex-shrink-0 w-36">
                      <div className="relative aspect-square rounded-2xl overflow-hidden mb-2 cursor-pointer"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                        onClick={() => {
                          if (!entry?.file_url) return;
                          if (isActive) { togglePlay(); return; }
                          playTrack({ ...entry, artist_name: artist?.artist_name, artist_slug: artist?.slug }, []);
                        }}>
                        {entry?.cover_artwork_url
                          ? <img src={entry.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center">
                              <Music className="w-8 h-8 text-white/45" />
                            </div>}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          {isNowPlaying
                            ? <Pause className="w-7 h-7 text-white drop-shadow-lg" fill="white" />
                            : <Play className="w-7 h-7 text-white drop-shadow-lg" fill="white" />}
                        </div>
                        <div className="absolute top-2 left-2">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/80 text-black">👑 Winner</span>
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-white truncate">{entry?.title || 'Untitled'}</p>
                      {artist && (
                        <button onClick={() => navigate(`/artist/${artist.slug}`)}
                          className="text-[10px] text-white/40 hover:text-white/60 transition truncate block">
                          {artist.artist_name}
                        </button>
                      )}
                      <p className="text-[9px] text-white/45 truncate mt-0.5">{comp.title}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── How it works ── */}
          <HowItWorksSummary />

          {/* ── Empty state ── */}
          {competitions.length === 0 && (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center text-3xl"
                style={{ background: 'rgba(139,92,246,0.1)' }}>
                🎲
              </div>
              <p className="text-sm font-semibold text-white mb-1">No active competitions</p>
              <p className="text-xs text-white/30">New Collab Roulette challenge drops every Sunday at 9am</p>
            </div>
          )}
        </>
      )}

        </>
      )}

      {activeTab === 'leaderboard' && (
        <div className="px-4">
          {lbLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-5 h-5 rounded-full border-2 border-white/10 border-t-purple-500 animate-spin" />
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-white/45">No challenge completions yet.</p>
              <p className="text-xs text-white/10 mt-1">Spin the wheel and upload a track to get on the board.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, i) => {
                const rankColor = entry.total_xp >= 10000 ? '#fbbf24'
                  : entry.total_xp >= 5000 ? '#a78bfa'
                  : entry.total_xp >= 2000 ? '#60a5fa'
                  : entry.total_xp >= 500  ? '#34d399'
                  : '#9ca3af';
                const rankLabel = entry.total_xp >= 10000 ? 'Legend'
                  : entry.total_xp >= 5000 ? 'Elite'
                  : entry.total_xp >= 2000 ? 'Pro'
                  : entry.total_xp >= 500  ? 'Rising'
                  : 'Rookie';
                return (
                  <div key={entry.user_id}
                    className="flex items-center space-x-3 rounded-2xl px-4 py-3"
                    style={{ background: i < 3 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Rank number */}
                    <div className="w-7 text-center flex-shrink-0">
                      {i === 0 ? <span className="text-base">🥇</span>
                       : i === 1 ? <span className="text-base">🥈</span>
                       : i === 2 ? <span className="text-base">🥉</span>
                       : <span className="text-xs text-white/30 font-bold">#{i + 1}</span>}
                    </div>
                    {/* Avatar */}
                    {entry.artist?.profile_image_url
                      ? <img src={entry.artist.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-white/30">{(entry.artist?.artist_name || '?')[0]}</span>
                        </div>
                    }
                    {/* Name + rank */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {entry.artist?.artist_name || 'Unknown Artist'}
                      </p>
                      <p className="text-[10px] font-bold" style={{ color: rankColor }}>{rankLabel}</p>
                    </div>
                    {/* XP + breakdown */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-white">{entry.total_xp.toLocaleString()} XP</p>
                      <p className="text-[9px] text-white/45">
                        {entry.legendary_count > 0 && `${entry.legendary_count}L `}
                        {entry.epic_count > 0 && `${entry.epic_count}E `}
                        {entry.rare_count > 0 && `${entry.rare_count}R `}
                        {entry.common_count > 0 && `${entry.common_count}C`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Spin for Yourself tab — artists/beatmakers only ── */}
      {activeTab === 'spin' && (
        <div className="py-4">
          <div className="px-4 mb-5">
            <h2 className="text-lg font-bold text-white mb-1">Challenge Wheel</h2>
            <p className="text-sm text-white/40">Spin for a random creative prompt — for fun, for videos, for when you need a spark.</p>
          </div>
          <div className="px-4">
            {artist ? (
              <SpinForYourselfTab />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-5xl mb-4">🎡</span>
                <p className="text-base font-bold text-white mb-2">Artists only</p>
                <p className="text-sm text-white/40 mb-6">The challenge wheel is for artists and beatmakers. Create an artist profile to unlock it.</p>
                <button onClick={() => navigate('/dashboard')}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-black transition active:scale-95"
                  style={{ background: 'white' }}>
                  Set up artist profile
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}