// src/pages/GamesPage.js
//
// Feelz Games, at /games: every game on Feelz Machine in one place.
//
// Phones get the compact catalogue (one card per game). Bigger screens get the
// full games page: a moving hero for the featured game, its missions, the live
// leaderboard and the artist runs, then the games still to come.
//
// Each game is one entry in GAMES below. A game that lives outside the React
// app (Feelz Run is a static game in public/run) opens with a full page load,
// which keeps it inside the installed app's window because it is the same site.
// Adding a game later is adding an entry here.

import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import {
  Gamepad2, Play, Users, Music, Sparkles, Trophy, Ticket, Radio, Lock, ChevronRight, Crown,
} from 'lucide-react';
import { supabase } from '../supabaseClient';

const RUN = '/run/';

const MISSIONS = [
  'Against The Storm', 'Get Out The Way', 'Ghetto Gospel', 'Blessings', 'Chemistry',
  'God Is My Woman', 'Close To My Heart', 'Patience', "Head's Up", 'I Pray',
  'Letting Off Steam', 'My Brothers', 'Roses & Butterflies', 'Shine Olive Gem', 'Thugs In Love',
].map((title, i) => {
  const id = 'm' + String(i + 1).padStart(2, '0');
  return { id, n: String(i + 1).padStart(2, '0'), title, image: `${RUN}assets/missions/${id}.webp` };
});

const GAMES = [
  {
    id: 'feelz-run',
    title: 'Feelz Run',
    tagline: 'Run the album',
    description: 'A platformer set to the songs of First Impressions Last Longest. Beat each part of the song to its checkpoint, collect records and notes, and turn them into money off songs on Feelz Machine.',
    image: `${RUN}assets/missions/m01.webp`,
    href: RUN,
    external: true,
    tags: [
      { icon: Music, text: '15 missions' },
      { icon: Users, text: 'Online co-op for up to 6' },
      { icon: Sparkles, text: 'Artist runs' },
    ],
  },
];

const COMING = 2;   // empty spaces on the phone shelf, so it reads as a catalogue that grows

const FEATURES = [
  { icon: Users,  title: 'Online co-op',        text: 'Up to 6 friends, one mission, each on their own phone.' },
  { icon: Music,  title: 'Run to the song',     text: 'Every part of the song is a checkpoint. Beat the music there.' },
  { icon: Ticket, title: 'Money off music',     text: 'Spend the credits you win on songs by your favourite artists.' },
  { icon: Radio,  title: 'Every finish counts', text: 'Finish a mission signed in and it counts as a stream for the artist.' },
];

function go(href) { window.location.href = href; }

/* Koda dancing, straight from the game's own finish-screen sheets (16 frames of 295 x 520 each).
   He runs through every dance in the game: Two-Step, B-Boy, Swing and Robot, two loops each. */
const KODA_DANCES = ['default', 'bboy', 'swing', 'robot'];
const danceSrc = (name) => `${RUN}assets/sprites/dance3d-${name}.webp`;

function DancingKoda({ height = 340 }) {
  const w = Math.round(height * 295 / 520);
  const [step, setStep] = useState(0);
  useEffect(() => {
    KODA_DANCES.forEach((name) => { const im = new Image(); im.src = danceSrc(name); });
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return undefined;
    const t = setInterval(() => setStep((v) => (v + 1) % KODA_DANCES.length), 3200);
    return () => clearInterval(t);
  }, []);
  const name = KODA_DANCES[step];
  return (
    <div className="relative" style={{ width: w, height }}>
      <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[140%] h-10 rounded-[50%] bg-amber-400/25 blur-2xl" />
      <div key={name} className="absolute inset-0 fg-dance"
        style={{
          backgroundImage: `url(${danceSrc(name)})`,
          backgroundSize: `${w * 16}px ${height}px`,
          '--fg-dance-end': `-${w * 16}px`,
        }} />
    </div>
  );
}

function Leaderboard({ mission, onMission }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    supabase.rpc('game_leaderboard', { mission: mission.id, period: 'all', max_rows: 5 })
      .then(({ data, error }) => { if (live) setRows(error ? [] : (data || [])); });
    return () => { live = false; };
  }, [mission.id]);

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-300" />
          <h3 className="text-lg font-black">Top runners</h3>
        </div>
        <select value={mission.id} onChange={e => onMission(MISSIONS.find(m => m.id === e.target.value))}
          className="bg-black/40 border border-white/[0.1] rounded-full px-3 py-1.5 text-xs text-white/80 outline-none">
          {MISSIONS.map(m => <option key={m.id} value={m.id}>{m.n} · {m.title}</option>)}
        </select>
      </div>
      <div className="mt-5 space-y-2">
        {rows === null && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />
        ))}
        {rows && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/[0.1] py-10 text-center">
            <p className="text-sm text-white/60 font-semibold">Nobody has run {mission.title} yet.</p>
            <button type="button" onClick={() => go(`${RUN}?mission=${mission.id}`)}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-400 text-black text-xs font-bold">
              <Play className="w-3.5 h-3.5" /> Be the first
            </button>
          </div>
        )}
        {rows && rows.map((r, i) => (
          <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${r.is_me ? 'bg-amber-400/10 border border-amber-300/30' : 'bg-white/[0.03]'}`}>
            <span className={`w-7 text-center text-sm font-black ${i === 0 ? 'text-amber-300' : i === 1 ? 'text-white/80' : i === 2 ? 'text-orange-300/80' : 'text-white/40'}`}>
              {i === 0 ? <Crown className="w-4 h-4 mx-auto" /> : r.rank}
            </span>
            <span className="flex-1 min-w-0 truncate text-sm font-semibold">{r.player_name || 'Runner'}</span>
            <span className="text-[10px] uppercase tracking-wider text-white/40">LV {r.level}</span>
            <span className="text-sm font-black text-amber-200 tabular-nums">{Number(r.best_rp).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtistRuns() {
  const [levels, setLevels] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.rpc('game_artist_levels_list', { p_id: null })
      .then(({ data, error }) => { if (live) setLevels(error || !Array.isArray(data) ? [] : data); });
    return () => { live = false; };
  }, []);

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-b from-fuchsia-500/[0.07] to-white/[0.015] p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-fuchsia-300" />
        <h3 className="text-lg font-black">Artist runs</h3>
      </div>
      <p className="text-xs text-white/50 mt-1">Artists on Feelz Machine put their own songs in the game. Run them.</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {levels === null && Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[4/3] rounded-2xl bg-white/[0.03] animate-pulse" />)}
        {levels && levels.slice(0, 4).map(lv => (
          <button key={lv.id} type="button" onClick={() => go(`${RUN}?level=${lv.id}`)}
            className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/[0.08] text-left">
            {lv.cover
              ? <img src={lv.cover} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              : <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-600/30 to-amber-500/20" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute left-3 right-3 bottom-2.5">
              <p className="text-sm font-black leading-tight truncate">{lv.title}</p>
              <p className="text-[11px] text-white/60 truncate">{lv.artist_name}</p>
            </div>
            {lv.discount_max > 0 && (
              <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-400 text-black text-[10px] font-black">UP TO {lv.discount_max}% OFF</span>
            )}
          </button>
        ))}
        {levels && levels.length === 0 && (
          <div className="col-span-2 rounded-2xl border border-dashed border-white/[0.1] py-10 px-6 text-center">
            <Music className="w-7 h-7 text-fuchsia-300/40 mx-auto" />
            <p className="text-sm text-white/60 font-semibold mt-2">The first artist runs are on their way.</p>
            <p className="text-xs text-white/40 mt-1">Artists on Premium can put a song in the game from Upload, then Manage Tracks.</p>
          </div>
        )}
        {levels && levels.length > 0 && levels.length < 4 && Array.from({ length: 4 - levels.length }).map((_, i) => (
          <div key={'e' + i} className="aspect-[4/3] rounded-2xl border border-dashed border-white/[0.1] flex flex-col items-center justify-center text-center px-3">
            <Music className="w-6 h-6 text-white/15" />
            <p className="text-[11px] text-white/35 mt-2 leading-snug">An artist's song goes here next</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* The full games page, for tablets and computers. */
function DesktopGames() {
  const [shown, setShown] = useState(0);            // which mission's painting is behind the hero
  const [board, setBoard] = useState(MISSIONS[0]);  // which mission the leaderboard shows

  useEffect(() => {
    const t = setInterval(() => setShown(s => (s + 1) % MISSIONS.length), 5000);
    return () => clearInterval(t);
  }, []);

  const current = MISSIONS[shown];

  return (
    <div className="hidden md:block">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative h-[560px] overflow-hidden">
        {MISSIONS.map((m, i) => (
          <img key={m.id} src={m.image} alt="" loading={i < 2 ? 'eager' : 'lazy'}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ${i === shown ? 'opacity-100 fg-kenburns' : 'opacity-0'}`} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
        <div className="absolute inset-0 fg-scan pointer-events-none opacity-40" />

        <div className="relative h-full max-w-6xl mx-auto px-8 flex items-center">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-300/30 bg-amber-400/10 text-[10px] font-bold tracking-[0.25em] text-amber-200 uppercase">
              <Gamepad2 className="w-3.5 h-3.5" /> Feelz Games
            </span>
            <h1 className="mt-4 text-[88px] leading-[0.85] font-black italic tracking-tight uppercase">
              <span className="fg-title">Feelz</span><br /><span className="text-white">Run.</span>
            </h1>
            <p className="mt-4 text-[13px] font-bold tracking-[0.3em] text-amber-200/90 uppercase">Run the album. Beat the song.</p>
            <p className="mt-3 text-sm text-white/65 leading-relaxed max-w-md">
              A platformer set to the songs of First Impressions Last Longest. Every part of the song is a checkpoint.
              Get there before the music does, with up to five friends.
            </p>
            <div className="mt-7 flex items-center gap-3">
              <button type="button" onClick={() => go(RUN)}
                className="fg-play inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-black text-base font-black tracking-wide">
                <Play className="w-5 h-5 fill-black" /> PLAY NOW
              </button>
              <button type="button" onClick={() => go(`${RUN}?mission=${current.id}`)}
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full border border-white/20 bg-black/40 backdrop-blur text-sm font-bold hover:border-amber-300/50 transition">
                Mission {current.n} · {current.title} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {GAMES[0].tags.map(({ icon: Icon, text }) => (
                <span key={text} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/[0.08] text-[11px] text-white/75">
                  <Icon className="w-3.5 h-3.5 text-amber-300" /> {text}
                </span>
              ))}
            </div>
          </div>
          <div className="hidden lg:flex flex-1 justify-end items-end self-end pb-6 pr-6">
            <DancingKoda height={380} />
          </div>
        </div>

        {/* which painting is showing */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {MISSIONS.map((m, i) => (
            <button key={m.id} type="button" aria-label={`Show mission ${m.n}`} onClick={() => setShown(i)}
              className={`h-1.5 rounded-full transition-all ${i === shown ? 'w-6 bg-amber-300' : 'w-1.5 bg-white/30 hover:bg-white/60'}`} />
          ))}
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-8">
        {/* ── What it is ─────────────────────────────────────────────────── */}
        <section className="-mt-10 relative grid grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-white/[0.08] bg-[#0d0d10]/95 backdrop-blur p-5 hover:border-amber-300/30 transition">
              <div className="w-10 h-10 rounded-xl bg-amber-400/15 flex items-center justify-center">
                <Icon className="w-5 h-5 text-amber-300" />
              </div>
              <p className="mt-3 text-sm font-black">{title}</p>
              <p className="mt-1 text-xs text-white/50 leading-relaxed">{text}</p>
            </div>
          ))}
        </section>

        {/* ── Missions ───────────────────────────────────────────────────── */}
        <section className="mt-14">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-bold tracking-[0.3em] text-amber-300/80 uppercase">The album</p>
              <h2 className="text-3xl font-black mt-1">15 songs. 15 missions.</h2>
            </div>
            <button type="button" onClick={() => go(RUN)} className="text-sm font-bold text-amber-300 hover:text-amber-200 inline-flex items-center gap-1">
              Open the game <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-3 lg:grid-cols-5 gap-3">
            {MISSIONS.map(m => (
              <button key={m.id} type="button" onClick={() => go(`${RUN}?mission=${m.id}`)}
                onMouseEnter={() => setBoard(m)}
                className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/[0.08] text-left hover:border-amber-300/60 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-10px_rgba(251,191,36,0.45)] transition">
                <img src={m.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                <span className="absolute top-2 left-3 text-2xl font-black italic text-amber-300 drop-shadow">{m.n}</span>
                <span className="absolute left-3 right-3 bottom-2.5 text-xs font-black uppercase tracking-wide leading-tight">{m.title}</span>
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <span className="w-12 h-12 rounded-full bg-amber-400 text-black flex items-center justify-center shadow-lg"><Play className="w-5 h-5 fill-black ml-0.5" /></span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Leaderboard and artist runs ────────────────────────────────── */}
        <section className="mt-14 grid grid-cols-2 gap-5 items-start">
          <Leaderboard mission={board} onMission={setBoard} />
          <ArtistRuns />
        </section>

        {/* ── What is coming ─────────────────────────────────────────────── */}
        <section className="mt-14 rounded-3xl border border-white/[0.08] overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-fuchsia-500/10 to-sky-500/10" />
          <div className="relative p-8 flex items-center gap-8">
            <div className="flex-1">
              <p className="text-[10px] font-bold tracking-[0.3em] text-white/50 uppercase">Next on Feelz Games</p>
              <h2 className="text-2xl font-black mt-1">More games are on the way</h2>
              <p className="text-sm text-white/55 mt-2 max-w-md">New games played to the music, built on the same engine as Feelz Run, so your account and progress come with you.</p>
            </div>
            <div className="flex gap-3">
              {['m08', 'm13', 'm05'].map((id, i) => (
                <div key={id} className="relative w-36 aspect-[3/4] rounded-2xl overflow-hidden border border-white/[0.1]">
                  <img src={`${RUN}assets/missions/${id}.webp`} alt="" className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-60" />
                  <div className="absolute inset-0 bg-black/40" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Lock className="w-6 h-6 text-white/70" />
                    <p className="mt-2 text-xs font-black tracking-[0.3em] text-white/60">GAME {String(i + 2).padStart(2, '0')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <p className="mt-8 text-[11px] text-white/35 leading-relaxed">
          Feelz Games use flashing lights and screen shake. If you or anyone in your family has had seizures, read the
          {' '}<a href="/terms-of-use" className="underline text-white/55">health note in our Terms</a> before playing.
        </p>
      </div>

      <style>{`
        @keyframes fgDance { to { background-position: var(--fg-dance-end) 0; } }
        .fg-dance { animation: fgDance 1.6s steps(16) infinite; background-repeat: no-repeat; }
        @keyframes fgKen { from { transform: scale(1.04); } to { transform: scale(1.14) translateX(-1.5%); } }
        .fg-kenburns { animation: fgKen 9s ease-out both; }
        .fg-title {
          background: linear-gradient(180deg, #fde68a 0%, #f59e0b 60%, #b45309 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 4px 0 #3a2206) drop-shadow(0 0 28px rgba(245, 158, 11, 0.35));
          padding-right: 0.08em;
        }
        .fg-scan { background: repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0 1px, transparent 1px 3px); }
        @keyframes fgPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.55), 0 10px 30px -8px rgba(251,191,36,0.6); } 50% { box-shadow: 0 0 0 10px rgba(251,191,36,0), 0 10px 30px -8px rgba(251,191,36,0.6); } }
        .fg-play { animation: fgPulse 2.2s ease-in-out infinite; transition: transform .15s; }
        .fg-play:hover { transform: translateY(-1px) scale(1.02); }
        @media (prefers-reduced-motion: reduce) { .fg-dance, .fg-kenburns, .fg-play { animation: none; } }
      `}</style>
    </div>
  );
}

/* The phone catalogue: one card per game. */
function PhoneGames({ open }) {
  return (
    <div className="md:hidden px-5 pt-8">
      <h1 className="text-2xl font-black text-white leading-tight flex items-center gap-2">
        <Gamepad2 className="w-6 h-6 text-amber-300" /> Feelz Games
      </h1>
      <p className="text-sm text-white/45 mt-1.5">Games played to the music. Sign in with your Feelz Machine account and your progress follows you.</p>

      <div className="mt-6 grid gap-4">
        {GAMES.map(g => (
          <button key={g.id} type="button" onClick={() => open(g)}
            className="group text-left rounded-2xl overflow-hidden border border-white/[0.08] bg-white/[0.03] hover:border-amber-300/40 transition">
            <div className="relative aspect-[16/9] bg-white/[0.04]">
              <img src={g.image} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute left-4 bottom-3 right-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200/80">{g.tagline}</p>
                <p className="text-2xl font-black text-white leading-tight">{g.title}</p>
              </div>
            </div>
            <div className="p-4">
              <p className="text-xs text-white/55 leading-relaxed">{g.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.tags.map(({ icon: Icon, text }) => (
                  <span key={text} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.05] text-[10px] text-white/60">
                    <Icon className="w-3 h-3" /> {text}
                  </span>
                ))}
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-400 text-black text-xs font-bold">
                <Play className="w-3.5 h-3.5" /> Play
              </span>
            </div>
          </button>
        ))}

        {Array.from({ length: COMING }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.015] min-h-[180px] flex flex-col items-center justify-center text-center p-6">
            <Gamepad2 className="w-8 h-8 text-white/10" />
            <p className="mt-2 text-sm font-semibold text-white/30">More games coming soon</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[11px] text-white/35 leading-relaxed">
        Feelz Games use flashing lights and screen shake. If you or anyone in your family has had seizures, read the
        {' '}<a href="/terms-of-use" className="underline text-white/55">health note in our Terms</a> before playing.
      </p>
    </div>
  );
}

export default function GamesPage() {
  const navigate = useNavigate();
  const open = (g) => {
    if (g.external) window.location.href = g.href;
    else navigate(g.href);
  };

  return (
    <div className="min-h-screen bg-black text-white pb-28">
      <Helmet>
        <title>Feelz Games · Feelz Machine</title>
        <meta name="description" content="Games on Feelz Machine, played to the music." />
      </Helmet>
      <PhoneGames open={open} />
      <DesktopGames />
    </div>
  );
}
