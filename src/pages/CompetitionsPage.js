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
    { icon: '🎲', title: 'Wheel spins every Sunday 9am', body: 'A random challenge is picked — alternating between vocalist and producer prompts. Announced to the whole platform.' },
    { icon: '🎵', title: 'Artists make something new', body: 'You have one week to create an original track inspired by the prompt. New recordings only — no existing uploads.' },
    { icon: '🗳️', title: 'Fans vote Sunday 5pm–11:59pm', body: 'Entries are anonymous. Each listener gets 2 votes. Most votes wins. No gaming it — just the music.' },
    { icon: '🏆', title: 'Winner gets rewarded', body: 'Free tier → 3 months Pro. Pro → 3 months Premium. Premium → 7-day featured placement. Plus Verified badge for all winners.' },
    { icon: '💰', title: 'Paid Collaborations', body: 'Monthly — the platform drops stems and commissions a missing piece from the community. Winner gets $50 USD automatically via PayPal.' },
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
  const [wheelChallenge, setWheelChallenge] = useState(null);
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
      const { data: wc } = await supabase
        .from('wheel_challenges')
        .select('*, competitions(id, status, entries_close_at, voting_close_at, max_votes_per_user)')
        .eq('is_current', true)
        .maybeSingle();
      setWheelChallenge(wc || null);

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
    const ids = data.map(r => r.user_id);
    const profiles_res = ids.length > 0
      ? await supabase.from('artists').select('user_id, artist_name, cover_artwork_url, slug').in('user_id', ids)
      : { data: [] };
    const { data: profiles } = profiles_res;
    const profileMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
    setLeaderboard(data.map((r, i) => ({ ...r, rank: i + 1, artist: profileMap[r.user_id] || null })));
    setLbLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'leaderboard') loadLeaderboard();
  }, [activeTab, loadLeaderboard]);

  // Auto-spin to current prompt on load
  useEffect(() => {
    if (!wheelChallenge || spinning || revealed) return;
    const idx = prompts.findIndex(p => p === wheelChallenge.prompt);
    const targetIdx = idx >= 0 ? idx : 0;
    const t = setTimeout(() => spinToIndex(targetIdx), 600);
    return () => clearTimeout(t);
  }, [wheelChallenge]); // eslint-disable-line

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

  const activeWheel = competitions.find(c => c.wheel_challenge);
  const activePaidCollabs = competitions.filter(c => c.paid_collab);
  const activeStandard = competitions.filter(c => !c.wheel_challenge && !c.paid_collab);

  return (
    <div className="pb-32 pt-14 md:pt-0">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap');`}</style>



      {/* Tab bar */}
      <div className="flex space-x-1 mx-4 mb-4 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        {[
          { key: 'competitions', label: '🏆 Competitions' },
          { key: 'leaderboard',  label: '⚡ XP Leaderboard' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 mb-2">
        <h1 className="text-2xl font-bold text-white">Competitions</h1>
        <p className="text-sm text-white/30 mt-0.5">Create, compete, collaborate — win real rewards</p>
      </div>

      {activeTab === 'competitions' && (
        <>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Collab Roulette wheel ── */}
          <div className="mx-4 mb-5 rounded-3xl overflow-hidden"
            style={{ background: 'linear-gradient(145deg, rgba(139,92,246,0.1), rgba(120,75,160,0.06))', border: '1px solid rgba(139,92,246,0.2)' }}>

            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-0.5">
                  <p style={{ fontSize: 10, letterSpacing: 3, color: 'rgba(139,92,246,0.8)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Collab Roulette
                  </p>
                  {wheelChallenge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                      {wheelChallenge.mode === 'singer' ? '🎤 Vocalist' : '🎛️ Producer'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/40">Every Sunday · Win Pro or Premium</p>
              </div>
              <button onClick={() => navigate('/wheel')}
                className="text-[10px] font-bold px-3 py-1.5 rounded-full transition"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                Full Page →
              </button>
            </div>

            {/* Wheel + prompt side by side on wide, stacked on narrow */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 px-5 pb-5">
              {/* Wheel */}
              <div className="relative flex-shrink-0">
                <div style={{
                  borderRadius: '50%', padding: 5,
                  background: 'linear-gradient(145deg,rgba(255,255,255,0.15) 0%,rgba(0,0,0,0.2) 100%)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 40px rgba(139,92,246,0.1)',
                }}>
                  <MiniWheel rotation={rotation} size={size} />
                </div>
                {/* Pointer */}
                <div style={{ position:'absolute', top:-2, left:'50%', transform:'translateX(-50%)', zIndex:10 }}>
                  <div style={{
                    width:0, height:0,
                    borderLeft:'8px solid transparent', borderRight:'8px solid transparent',
                    borderTop:'20px solid #a78bfa',
                    filter:'drop-shadow(0 0 6px rgba(139,92,246,0.6))',
                  }}/>
                </div>
              </div>

              {/* Prompt + CTA */}
              <div className="flex-1 text-center sm:text-left sm:pt-2">
                {spinning && (
                  <p style={{ fontFamily:"'Space Mono',monospace", fontSize:9, letterSpacing:4, color:'#a78bfa', textTransform:'uppercase', marginBottom:8 }}>
                    SPINNING...
                  </p>
                )}
                {revealed && wheelChallenge ? (
                  <>
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">This week's challenge</p>
                    <p className="text-base font-bold text-white leading-relaxed mb-4"
                      style={{ whiteSpace: 'pre-line' }}>
                      {wheelChallenge.prompt}
                    </p>

                    {/* Countdown */}
                    {wheelChallenge.competitions && (
                      <div className="flex gap-3 mb-4 justify-center sm:justify-start">
                        {wheelChallenge.competitions.entries_close_at && wheelChallenge.competitions.status === 'open' && (
                          <div className="text-center">
                            <div className="flex items-center space-x-1">
                              <Clock className="w-3 h-3 text-green-400" />
                              <span className="text-[9px] text-green-400 uppercase tracking-wider">Entries</span>
                            </div>
                            <p className="text-xs font-bold text-white">{timeLeft(wheelChallenge.competitions.entries_close_at)}</p>
                          </div>
                        )}
                        {wheelChallenge.competitions.voting_close_at && wheelChallenge.competitions.status === 'voting' && (
                          <div className="text-center">
                            <div className="flex items-center space-x-1">
                              <Zap className="w-3 h-3 text-purple-400" />
                              <span className="text-[9px] text-purple-400 uppercase tracking-wider">Voting</span>
                            </div>
                            <p className="text-xs font-bold text-white">{timeLeft(wheelChallenge.competitions.voting_close_at)}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Prize */}
                    <div className="flex items-center space-x-1.5 mb-4 justify-center sm:justify-start">
                      <Crown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a78bfa' }} />
                      <p className="text-xs font-bold" style={{ color: '#a78bfa' }}>Win 3 months Pro or Premium</p>
                    </div>

                    {wheelChallenge.competitions?.id && (
                      <button
                        onClick={() => navigate(`/competition/${wheelChallenge.competitions.id}`)}
                        className="w-full sm:w-auto px-6 py-3 rounded-2xl text-sm font-bold text-white transition active:scale-[0.98]"
                        style={{ background: 'linear-gradient(135deg,#a78bfa,#784BA0)', boxShadow: '0 4px 16px rgba(139,92,246,0.3)' }}>
                        {wheelChallenge.competitions.status === 'voting' ? '🗳️ Vote Now' :
                         wheelChallenge.competitions.status === 'open'   ? '🎵 Enter Challenge' : 'View Challenge'}
                      </button>
                    )}
                  </>
                ) : !spinning && (
                  <div className="text-center py-4">
                    <p className="text-sm text-white/40">Next challenge spins Sunday 9am</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Paid Collaborations ── */}
          {activePaidCollabs.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between px-4 mb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-base">💰</span>
                  <p className="text-sm font-bold text-white">Paid Collaborations</p>
                </div>
                <p className="text-[10px] text-white/50 uppercase tracking-wider">$50 USD prize</p>
              </div>
              <div className="space-y-2 px-4">
                {activePaidCollabs.map(comp => (
                  <button key={comp.id}
                    onClick={() => navigate(`/competition/${comp.id}`)}
                    className="w-full flex items-center space-x-4 p-4 rounded-2xl text-left transition active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08), transparent)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                      style={{ background: 'rgba(245,158,11,0.15)' }}>💰</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate mb-0.5">{comp.title}</p>
                      {comp.brief && <p className="text-xs text-white/40 truncate">{comp.brief}</p>}
                      <div className="flex items-center space-x-2 mt-1.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          comp.status === 'voting' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                        }`}>
                          {comp.status === 'voting' ? 'Vote Now' : 'Enter Now'}
                        </span>
                        {(comp.entries_close_at || comp.voting_close_at) && (
                          <span className="text-[10px] text-white/50 flex items-center space-x-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{timeLeft(comp.status === 'voting' ? comp.voting_close_at : comp.entries_close_at)} left</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/45 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

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
          {!wheelChallenge && competitions.length === 0 && (
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
                    {entry.artist?.cover_artwork_url
                      ? <img src={entry.artist.cover_artwork_url} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
                      : <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex-shrink-0" />
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
    </div>
  );
}