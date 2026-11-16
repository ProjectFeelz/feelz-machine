// src/pages/GamesPage.js
//
// Feelz Games, at /games: every game on Feelz Machine in one place.
//
// Each game is one entry in GAMES below. A game that lives outside the React
// app (Feelz Run is a static game in public/run) opens with a full page load,
// which keeps it inside the installed app's window because it is the same site.
// Adding a game later is adding an entry here.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, Play, Users, Music, Sparkles } from 'lucide-react';

const GAMES = [
  {
    id: 'feelz-run',
    title: 'Feelz Run',
    tagline: 'Run the album',
    description: 'A platformer set to the songs of First Impressions Last Longest. Beat each part of the song to its checkpoint, collect records and notes, and turn them into money off songs on Feelz Machine.',
    image: '/run/assets/missions/m01.webp',
    href: '/run/',
    external: true,
    tags: [
      { icon: Music, text: '15 missions' },
      { icon: Users, text: 'Online co-op for up to 6' },
      { icon: Sparkles, text: 'Artist runs' },
    ],
  },
];

const COMING = 2;   // empty spaces on the shelf, so it reads as a catalogue that grows

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

      <div className="px-5 md:px-8 pt-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-black text-white leading-tight flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-amber-300" /> Feelz Games
        </h1>
        <p className="text-sm text-white/45 mt-1.5">Games played to the music. Sign in with your Feelz Machine account and your progress follows you.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
    </div>
  );
}
