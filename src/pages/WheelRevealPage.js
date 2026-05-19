/**
 * WheelRevealPage.js
 *
 * Public page at /wheel
 * Shows the Feelz Machine Collab Roulette wheel.
 * - Loads the current week's active wheel challenge
 * - Auto-spins to land on this week's prompt on load
 * - Shows countdown to entry deadline and voting deadline
 * - CTA links to that week's competition room
 * - Previous weeks scrollable at the bottom
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Trophy, ArrowLeft, Clock, Music, ChevronRight, Star } from 'lucide-react';

// ── Wheel data (must match weekly-wheel-spin.js) ──────────────────────────────
const SINGER_PROMPTS = [
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
];

const BEATMAKER_PROMPTS = [
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
];

export const ALL_PROMPTS = [...SINGER_PROMPTS, ...BEATMAKER_PROMPTS];

const SLICE_COLORS = [
  ["#FF3CAC","#9b0055"],["#784BA0","#3d1460"],["#2B86C5","#0a4a80"],
  ["#00C9FF","#006688"],["#FF6B6B","#991a1a"],["#FFE66D","#997700"],
  ["#78ffa8","#00882e"],["#FF8C00","#883300"],["#00F5A0","#007744"],
  ["#b57bff","#5500cc"],
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
      g.gain.linearRampToValueAtTime(0.28,t+0.04);
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

function WheelSVG({ prompts, rotation, size }) {
  const cx = size/2, cy = size/2, r = size/2-6;
  const total = prompts.length, sa = 360/total;
  return (
    <svg width={size} height={size} style={{ transform:`rotate(${rotation}deg)`, transition:'transform 0s', display:'block' }}>
      <defs>
        {SLICE_COLORS.map(([c1,c2],i) => (
          <radialGradient key={i} id={`wg${i}`} cx="35%" cy="25%" r="85%">
            <stop offset="0%" stopColor={c1}/><stop offset="100%" stopColor={c2}/>
          </radialGradient>
        ))}
        <radialGradient id="wgloss" cx="50%" cy="15%" r="75%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.4)"/>
          <stop offset="60%" stopColor="rgba(255,255,255,0.05)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
        <radialGradient id="whub" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#3a0a2a"/><stop offset="100%" stopColor="#0a0a0f"/>
        </radialGradient>
      </defs>
      {prompts.map((prompt,i) => {
        const ci = i % SLICE_COLORS.length;
        const midDeg = i*sa+sa/2;
        const rad = ((midDeg-90)*Math.PI)/180;
        const textR = r*0.6;
        const tx = cx+textR*Math.cos(rad), ty = cy+textR*Math.sin(rad);
        const lines = prompt.split('\n');
        const fs = total > 20 ? 6.5 : 8;
        return (
          <g key={i}>
            <path d={slicePath(i,total,cx,cy,r)} fill={`url(#wg${ci})`} stroke="rgba(0,0,0,0.35)" strokeWidth="1.2"/>
            <g transform={`translate(${tx},${ty}) rotate(${midDeg-90})`}>
              {lines.map((line,li) => (
                <text key={li} x="0" y={li*(fs+3)-(lines.length-1)*(fs+3)/2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={fs} fontWeight="700" fontFamily="'Space Mono',monospace" fill="#fff"
                  style={{filter:'drop-shadow(0 1px 3px rgba(0,0,0,1))'}}>
                  {line}
                </text>
              ))}
            </g>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={r} fill="url(#wgloss)" opacity="0.45" style={{pointerEvents:'none'}}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
      {prompts.map((_,i) => {
        const p = polarToXY(i*sa,r,cx,cy);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>;
      })}
      <circle cx={cx} cy={cy} r={26} fill="url(#whub)" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
      <circle cx={cx} cy={cy} r={14} fill="#FF3CAC" opacity="0.9"/>
      <circle cx={cx-4} cy={cy-4} r={4} fill="rgba(255,255,255,0.55)"/>
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
  const [challenge, setChallenge]     = useState(null);
  const [pastChallenges, setPast]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [rotation, setRotation]       = useState(0);
  const [spinning, setSpinning]       = useState(false);
  const [revealed, setRevealed]       = useState(false);
  const animRef = useRef(null);
  const stRef   = useRef(null);

  const prompts = ALL_PROMPTS;

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
      .select('*, competitions(id, title, status, winner_entry_id)')
      .eq('is_current', false)
      .order('spun_at', { ascending: false })
      .limit(10);
    setPast(past || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-spin to land on current week's prompt once loaded
  useEffect(() => {
    if (!challenge || spinning || revealed) return;
    const promptIdx = prompts.indexOf(challenge.prompt);
    if (promptIdx === -1) return;

    // Delay slightly for dramatic effect
    const t = setTimeout(() => {
      spinToIndex(promptIdx);
    }, 800);
    return () => clearTimeout(t);
  }, [challenge]); // eslint-disable-line

  const easeOut = t => 1 - Math.pow(1 - t, 4);

  const spinToIndex = (targetIdx) => {
    setSpinning(true);
    setRevealed(false);
    const total = prompts.length;
    const sa = 360 / total;
    // Calculate rotation needed to land pointer (top) on target slice
    // Pointer is at top (0°). Slice i occupies [i*sa, (i+1)*sa].
    // To land slice center under pointer: rotate so that (360 - (targetIdx*sa + sa/2)) is at top
    const targetDeg = 360 - (targetIdx * sa + sa / 2);
    // Add multiple full rotations for drama
    const fullSpins = 5 + Math.floor(Math.random() * 3);
    const totalRotation = fullSpins * 360 + targetDeg;
    const duration = 5500;

    const startRot = rotation;
    stRef.current = null;

    const animate = (ts) => {
      if (!stRef.current) stRef.current = ts;
      const p = Math.min((ts - stRef.current) / duration, 1);
      const cur = startRot + easeOut(p) * (totalRotation - startRot + rotation);
      setRotation(cur);
      if (p < 1) { animRef.current = requestAnimationFrame(animate); return; }
      setRotation(startRot + (totalRotation - startRot + rotation));
      setSpinning(false);
      chime();
      setTimeout(() => setRevealed(true), 300);
    };
    animRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const size = typeof window !== 'undefined' ? Math.min(window.innerWidth - 40, 340) : 320;

  return (
    <div style={{
      minHeight: '100vh', background: '#07070d', color: '#fff',
      fontFamily: "'Space Mono', monospace", overflowX: 'hidden',
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');`}</style>

      {/* Ambient blobs */}
      {[
        { top:'-15%', left:'-10%', color:'rgba(255,60,172,0.1)' },
        { bottom:'-15%', right:'-10%', color:'rgba(43,134,197,0.1)' },
      ].map((s,i) => (
        <div key={i} style={{
          position:'fixed', width:500, height:500, borderRadius:'50%', pointerEvents:'none',
          background:`radial-gradient(circle,${s.color} 0%,transparent 70%)`, ...s,
        }}/>
      ))}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-14 pb-4 md:pt-6">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <div className="text-center">
          <p style={{ fontSize:8, letterSpacing:6, color:'#FF3CAC', textTransform:'uppercase' }}>
            Feelz Machine
          </p>
          <h1 style={{ fontSize:'clamp(18px,5vw,28px)', fontWeight:900, letterSpacing:2, textShadow:'0 0 30px rgba(255,60,172,0.5)' }}>
            COLLAB ROULETTE
          </h1>
        </div>
        <div className="w-9" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-pink-500 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col items-center px-4 pb-16">

          {/* Week label */}
          {challenge && (
            <p style={{ fontSize:9, letterSpacing:4, color:'rgba(255,255,255,0.3)', marginBottom:12, textTransform:'uppercase' }}>
              Week of {new Date(challenge.spun_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
            </p>
          )}

          {/* Wheel */}
          <div style={{ position:'relative', marginBottom:24 }}>
            {/* Shadow */}
            <div style={{
              position:'absolute', bottom:-16, left:'50%', transform:'translateX(-50%)',
              width:'75%', height:20, borderRadius:'50%',
              background:'radial-gradient(ellipse,rgba(255,60,172,0.3) 0%,transparent 70%)',
              filter:'blur(8px)',
            }}/>
            {/* Bezel */}
            <div style={{
              borderRadius:'50%', padding:7,
              background:'linear-gradient(145deg,rgba(255,255,255,0.2) 0%,rgba(255,255,255,0.03) 60%,rgba(0,0,0,0.3) 100%)',
              border:'1px solid rgba(255,255,255,0.18)',
              boxShadow:'0 12px 50px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.25), 0 0 60px rgba(255,60,172,0.1)',
            }}>
              <WheelSVG prompts={prompts} rotation={rotation} size={size} />
            </div>
            {/* Pointer */}
            <div style={{
              position:'absolute', top:-2, left:'50%', transform:'translateX(-50%)',
              zIndex:20, display:'flex', flexDirection:'column', alignItems:'center',
            }}>
              <div style={{
                width:0, height:0,
                borderLeft:'12px solid transparent', borderRight:'12px solid transparent',
                borderTop:'28px solid #FF3CAC',
                filter:'drop-shadow(0 0 10px rgba(255,60,172,0.9))',
              }}/>
            </div>
          </div>

          {/* Spinning indicator */}
          {spinning && (
            <p style={{ fontSize:9, letterSpacing:4, color:'#FF3CAC', textTransform:'uppercase', marginBottom:16 }}>
              SPINNING...
            </p>
          )}

          {/* Revealed prompt card */}
          {revealed && challenge && (
            <div style={{
              background:'linear-gradient(145deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03))',
              border:'1px solid rgba(255,255,255,0.15)',
              borderRadius:24, padding:'28px 24px',
              maxWidth:340, width:'100%', textAlign:'center',
              boxShadow:'0 0 60px rgba(255,60,172,0.2)',
              marginBottom:20,
              animation:'fadeUp 0.5s ease',
            }}>
              <p style={{ fontSize:8, letterSpacing:5, color:'#FF3CAC', textTransform:'uppercase', marginBottom:12 }}>
                This Week's Challenge
              </p>
              <p style={{
                fontSize:'clamp(16px,4.5vw,20px)', fontWeight:700, lineHeight:1.6,
                whiteSpace:'pre-line', color:'#fff', marginBottom:20,
                textShadow:'0 2px 12px rgba(0,0,0,0.5)',
              }}>
                {challenge.prompt}
              </p>
              <p style={{ fontSize:8, color:'rgba(255,255,255,0.3)', letterSpacing:3, marginBottom:16, textTransform:'uppercase' }}>
                {challenge.mode === 'singer' ? '🎤 Vocalist Challenge' : '🎛️ Producer Challenge'}
              </p>

              {/* Timers */}
              {challenge.competitions && (
                <div className="flex justify-center gap-4 mb-5">
                  {challenge.competitions.entries_close_at && (
                    <div className="text-center">
                      <div className="flex items-center space-x-1 justify-center">
                        <Clock className="w-3 h-3 text-green-400" />
                        <span style={{ fontSize:9, color:'#10b981', letterSpacing:2, textTransform:'uppercase' }}>Entries</span>
                      </div>
                      <p style={{ fontSize:11, color:'#fff', marginTop:2 }}>
                        {timeLeft(challenge.competitions.entries_close_at)}
                      </p>
                    </div>
                  )}
                  {challenge.competitions.voting_close_at && (
                    <div className="text-center">
                      <div className="flex items-center space-x-1 justify-center">
                        <Star className="w-3 h-3 text-purple-400" />
                        <span style={{ fontSize:9, color:'#8b5cf6', letterSpacing:2, textTransform:'uppercase' }}>Voting</span>
                      </div>
                      <p style={{ fontSize:11, color:'#fff', marginTop:2 }}>
                        {timeLeft(challenge.competitions.voting_close_at)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Prize badge */}
              <div style={{
                display:'inline-flex', alignItems:'center', gap:6,
                padding:'8px 18px',
                background:'linear-gradient(135deg,rgba(255,60,172,0.2),rgba(120,75,160,0.2))',
                border:'1px solid rgba(255,60,172,0.3)',
                borderRadius:32, marginBottom:20,
              }}>
                <Trophy className="w-3.5 h-3.5" style={{ color:'#FF3CAC' }} />
                <span style={{ fontSize:9, color:'#fff', letterSpacing:2, textTransform:'uppercase', fontWeight:700 }}>
                  3 Months Pro · Winner Prize
                </span>
              </div>

              {/* CTA */}
              {challenge.competitions?.id && (
                <button
                  onClick={() => navigate(`/competition/${challenge.competitions.id}`)}
                  style={{
                    width:'100%', padding:'14px 24px',
                    background:'linear-gradient(135deg,#FF3CAC,#784BA0)',
                    border:'none', borderRadius:32, cursor:'pointer',
                    fontSize:11, fontWeight:700, color:'#fff', letterSpacing:3,
                    textTransform:'uppercase',
                    boxShadow:'0 6px 24px rgba(255,60,172,0.4)',
                    fontFamily:"'Space Mono',monospace",
                  }}>
                  {challenge.competitions.status === 'voting' ? '🗳️ VOTE NOW' :
                   challenge.competitions.status === 'open'   ? '🎵 ENTER NOW' :
                   challenge.competitions.status === 'completed' ? '🏆 SEE WINNER' : 'VIEW CHALLENGE'}
                </button>
              )}
            </div>
          )}

          {/* No current challenge */}
          {!challenge && !loading && (
            <div className="text-center py-8">
              <p style={{ color:'rgba(255,255,255,0.3)', fontSize:12, letterSpacing:2 }}>
                Next challenge spins Monday 9am
              </p>
            </div>
          )}

          {/* Past challenges */}
          {pastChallenges.length > 0 && (
            <div style={{ width:'100%', maxWidth:400, marginTop:16 }}>
              <p style={{ fontSize:8, letterSpacing:5, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', marginBottom:12, textAlign:'center' }}>
                Previous Challenges
              </p>
              <div className="space-y-2">
                {pastChallenges.map(pc => (
                  <button key={pc.id}
                    onClick={() => pc.competitions?.id && navigate(`/competition/${pc.competitions.id}`)}
                    className="w-full flex items-center space-x-3 p-3 rounded-2xl text-left transition hover:bg-white/[0.04] active:scale-[0.98]"
                    style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background:'linear-gradient(135deg,rgba(255,60,172,0.2),rgba(120,75,160,0.2))' }}>
                      <Music className="w-4 h-4" style={{ color:'#FF3CAC' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize:10, color:'#fff', fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {pc.prompt.split('\n').join(' ')}
                      </p>
                      <p style={{ fontSize:8, color:'rgba(255,255,255,0.3)', letterSpacing:2, marginTop:2, textTransform:'uppercase' }}>
                        {new Date(pc.spun_at).toLocaleDateString('en-US', { month:'short', day:'numeric' })} ·{' '}
                        {pc.competitions?.status === 'completed' ? '🏆 Complete' : pc.competitions?.status || 'ended'}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color:'rgba(255,255,255,0.2)' }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  );
}
