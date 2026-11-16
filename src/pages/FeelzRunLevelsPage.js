// src/pages/FeelzRunLevelsPage.js
//
// Feelz Run levels, at /feelz-run-levels.
//
// An artist puts one of their own songs on one of the album levels of Feelz
// Run (the game at /run). The level's map, world and enemies stay the same;
// the song is theirs, and the checkpoint deadlines follow the sections they
// mark in it. Fans play it from Artist Runs in the game, or straight from the
// link this page gives them.
//
// Optional: the artist can let fans spend game credits on money off the song
// (10, 25 or 50%). The discount comes off the artist's own price at checkout,
// the buyer still pays the artist directly, and Feelz Machine takes nothing.
//
// Nothing here writes a table. game_artist_level_save checks that the caller
// owns the song, that the song is released and free to stream, and that every
// section is long enough for its part of the level, so a request forged in a
// console is refused by the database rather than by this file.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Loader, Gamepad2, AlertCircle, Play, Pause, Check, Copy, Music } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import useGoBack from '../hooks/useGoBack';

const GAME_URL = 'https://www.feelzmachine.com/run/';
const FIT_MIN = 0.75, FIT_MAX = 1.6, PART_MIN = 0.7;

const mmss = (s) => {
  const t = Math.max(0, Number(s) || 0);
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
};
const r1 = (x) => Math.round(x * 10) / 10;

// A song anyone can already play in full (the same rule the database applies).
function playable(t) {
  const now = Date.now();
  return t.is_published && !t.is_premium && !t.is_preorder && !t.is_podcast && t.file_url
    && !(t.is_early_access && (!t.early_access_until || new Date(t.early_access_until).getTime() > now))
    && (!t.release_date || new Date(t.release_date).getTime() <= now);
}

// The album level's sections stretched evenly over the artist's song.
function evenParts(tpl, duration) {
  const k = duration / tpl.seconds;
  const parts = tpl.parts.map(([s, e]) => [r1(s * k), r1(e * k)]);
  parts[parts.length - 1][1] = r1(duration);
  for (let i = 1; i < parts.length; i++) parts[i][0] = parts[i - 1][1];
  return parts;
}

function problemWith(parts, tpl, duration) {
  if (!tpl || !duration) return 'Pick a level.';
  const ratio = duration / tpl.seconds;
  if (ratio < FIT_MIN || ratio > FIT_MAX) {
    return `This level suits songs between ${mmss(tpl.seconds * FIT_MIN)} and ${mmss(tpl.seconds * FIT_MAX)} long.`;
  }
  for (let i = 0; i < parts.length; i++) {
    const [s, e] = parts[i], [ts, te] = tpl.parts[i];
    if (e - s < (te - ts) * PART_MIN) return `Section ${i + 1} is too short for its part of the level. Give it at least ${Math.ceil((te - ts) * PART_MIN)} seconds.`;
  }
  return null;
}

async function signedSongUrl(trackId) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/stream-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify({ trackId }),
  });
  const data = await res.json().catch(() => ({}));
  const t = data?.tracks?.[trackId];
  if (!res.ok || !t?.url) throw new Error('Could not load the song. Try again.');
  return t.url;
}

function Editor({ track, level, templates, onSaved, onClose }) {
  const audio = useRef(null);
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [templateId, setTemplateId] = useState(level?.template || '');
  const [parts, setParts] = useState(level?.parts || null);
  const [discount, setDiscount] = useState(level?.discount_max || 0);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [marking, setMarking] = useState(false);
  const marks = useRef([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    signedSongUrl(track.id).then(u => { if (live) setUrl(u); }).catch(e => live && setError(e.message));
    return () => { live = false; if (audio.current) audio.current.pause(); };
  }, [track.id]);

  const tpl = templates.find(t => t.id === templateId) || null;

  // Once the length is known: pick the closest fitting level, and spread its sections.
  const onMeta = () => {
    const d = r1(audio.current.duration || 0);
    setDuration(d);
    if (!level) {
      const best = [...templates].sort((a, b) => Math.abs(a.seconds - d) - Math.abs(b.seconds - d))[0];
      if (best) { setTemplateId(best.id); setParts(evenParts(best, d)); }
    }
  };

  const chooseTemplate = (id) => {
    setTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (t && duration) setParts(evenParts(t, duration));
    setMarking(false);
  };

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { a.play().then(() => setPlaying(true)).catch(() => {}); } else { a.pause(); setPlaying(false); }
  };

  // Mark the sections by tapping along: each tap ends one section and starts the next.
  const startMarking = () => {
    if (!tpl || !audio.current) return;
    marks.current = [];
    setMarking(true);
    audio.current.currentTime = 0;
    audio.current.play().then(() => setPlaying(true)).catch(() => {});
  };
  const finishMarks = useCallback((taps) => {
    if (!tpl || !duration) return;
    const n = tpl.parts.length;
    const cuts = taps.slice(0, n - 1).map(r1).filter((t, i, arr) => t > 0 && t < duration && (i === 0 || t > arr[i - 1]));
    // Any sections left unmarked share out the rest of the song in the album's proportions.
    const p = [];
    let start = 0;
    for (let i = 0; i < n; i++) {
      let end;
      if (i < cuts.length) end = cuts[i];
      else if (i === n - 1) end = duration;
      else {
        const restTpl = tpl.parts[n - 1][1] - tpl.parts[i][0];
        end = start + (duration - start) * ((tpl.parts[i][1] - tpl.parts[i][0]) / restTpl);
      }
      p.push([r1(start), r1(end)]);
      start = r1(end);
    }
    p[n - 1][1] = r1(duration);
    setParts(p);
    setMarking(false);
  }, [tpl, duration]);
  const tap = () => {
    if (!marking || !audio.current) return;
    marks.current.push(audio.current.currentTime);
    if (tpl && marks.current.length >= tpl.parts.length - 1) finishMarks(marks.current);
    else setNow(audio.current.currentTime);
  };

  const problem = parts && tpl ? problemWith(parts, tpl, duration) : null;

  const save = async () => {
    setError('');
    if (!tpl || !parts) { setError('Pick a level.'); return; }
    if (problem) { setError(problem); return; }
    setSaving(true);
    const { data, error: e } = await supabase.rpc('game_artist_level_save', {
      p_track: track.id, p_template: tpl.id, p_parts: parts, p_song_seconds: duration, p_discount: discount, p_live: true,
    });
    setSaving(false);
    if (e) { setError(e.message || 'Could not save. Try again.'); return; }
    if (audio.current) audio.current.pause();
    onSaved(data);
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-4">
      {url && (
        <audio ref={audio} src={url} preload="metadata" onLoadedMetadata={onMeta}
          onTimeUpdate={() => setNow(audio.current ? audio.current.currentTime : 0)}
          onEnded={() => { setPlaying(false); if (marking) finishMarks(marks.current); }} />
      )}
      {!duration ? (
        <div className="flex items-center gap-2 text-xs text-white/40"><Loader className="w-3.5 h-3.5 animate-spin" /> Loading the song...</div>
      ) : (
        <>
          <p className="text-xs text-white/50">Your song is {mmss(duration)} long. Pick the level it plays on.</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {templates.map(t => {
              const fits = duration / t.seconds >= FIT_MIN && duration / t.seconds <= FIT_MAX;
              return (
                <button key={t.id} type="button" disabled={!fits} onClick={() => chooseTemplate(t.id)}
                  className={`px-2.5 py-2 rounded-lg border text-left transition ${t.id === templateId ? 'border-amber-300/60 bg-amber-400/10' : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'} ${fits ? '' : 'opacity-30 cursor-not-allowed'}`}>
                  <span className="block text-[11px] font-semibold text-white truncate">{t.title}</span>
                  <span className="block text-[10px] text-white/40">{mmss(t.seconds)} · {t.parts.length} sections</span>
                </button>
              );
            })}
          </div>

          {tpl && parts && (
            <>
              <p className="mt-4 text-xs text-white/50">
                Each checkpoint has to be reached before its section of the song ends. Tap along to mark where your
                sections change (verse, chorus, bridge), or keep the even split.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={toggle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-xs text-white">
                  {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />} {playing ? 'Pause' : 'Listen'} · {mmss(now)}
                </button>
                {!marking ? (
                  <button type="button" onClick={startMarking} className="px-3 py-1.5 rounded-full bg-amber-400/15 border border-amber-300/30 text-xs text-amber-100">Tap along to mark sections</button>
                ) : (
                  <button type="button" onClick={tap} className="px-4 py-1.5 rounded-full bg-amber-400 text-black text-xs font-bold">
                    Next section ({marks.current.length + 1} of {tpl.parts.length - 1})
                  </button>
                )}
                <button type="button" onClick={() => { setMarking(false); setParts(evenParts(tpl, duration)); }} className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-white/60">Even split</button>
              </div>
              <div className="mt-3 space-y-1">
                {parts.map(([s, e], i) => {
                  const [ts, te] = tpl.parts[i];
                  const short = e - s < (te - ts) * PART_MIN;
                  return (
                    <div key={i} className={`flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg ${short ? 'bg-red-500/10 text-red-200' : 'bg-white/[0.02] text-white/60'}`}>
                      <span>Section {i + 1}</span>
                      <span>{mmss(s)} to {mmss(e)} · {Math.round(e - s)}s{short ? ` (needs ${Math.ceil((te - ts) * PART_MIN)}s)` : ''}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <p className="mt-4 text-xs text-white/50">
            Let fans spend the credits they earn in the game on money off this song? It comes off your price when
            they buy it, they still pay you directly, and Feelz Machine takes nothing.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[0, 10, 25, 50].map(p => (
              <button key={p} type="button" onClick={() => setDiscount(p)}
                className={`px-3 py-1.5 rounded-full border text-xs ${discount === p ? 'border-amber-300/60 bg-amber-400/15 text-amber-100' : 'border-white/[0.08] text-white/60'}`}>
                {p === 0 ? 'No discount' : `Up to ${p}% off`}
              </button>
            ))}
          </div>

          {(error || problem) && (
            <div className="mt-3 px-3 py-2.5 rounded-lg bg-red-500/[0.08] border border-red-400/20 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-100/80">{error || problem}</p>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={save} disabled={saving || !!problem}
              className="px-4 py-2 rounded-full bg-amber-400 text-black text-xs font-bold disabled:opacity-40">
              {saving ? 'Saving...' : level ? 'Save changes' : 'Put it in the game'}
            </button>
            <button type="button" onClick={() => { if (audio.current) audio.current.pause(); onClose(); }} className="px-4 py-2 rounded-full bg-white/[0.05] text-xs text-white/60">Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function FeelzRunLevelsPage() {
  const { artist } = useAuth();
  const goBack = useGoBack('/hub');
  const [tracks, setTracks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!artist?.id) { setLoading(false); return; }
    setError('');
    const [t, tp, mine] = await Promise.all([
      supabase.from('tracks')
        .select('id, title, slug, cover_artwork_url, is_published, is_premium, is_preorder, is_early_access, early_access_until, release_date, is_podcast, file_url')
        .eq('artist_id', artist.id).order('created_at', { ascending: false }),
      supabase.rpc('game_level_templates'),
      supabase.rpc('game_artist_levels_mine'),
    ]);
    if (t.error || tp.error || mine.error) setError('Could not load everything. Refresh the page, or try again shortly.');
    setTracks(t.data || []);
    setTemplates(tp.data || []);
    setLevels(mine.data || []);
    setLoading(false);
  }, [artist?.id]);

  useEffect(() => { load(); }, [load]);

  const setLive = async (trackId, live) => {
    setBusy(trackId);
    const { error: e } = await supabase.rpc('game_artist_level_set_live', { p_track: trackId, p_live: live });
    setBusy('');
    if (e) setError(e.message || 'Could not change that. Try again.');
    load();
  };

  const copyLink = async (lv) => {
    const link = `${GAME_URL}?level=${lv.id}`;
    try { await navigator.clipboard.writeText(link); setCopied(lv.id); setTimeout(() => setCopied(''), 2000); }
    catch (e) { window.prompt('Copy this link', link); }
  };

  const ready = tracks.filter(playable);
  const others = tracks.filter(t => !playable(t));

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <Helmet>
        <title>Feelz Run Levels · Feelz Machine</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="px-5 md:px-8 pt-8 max-w-3xl mx-auto">
        <button onClick={() => goBack()} className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>

        <h1 className="text-2xl font-black text-white leading-tight flex items-center gap-2">
          <Gamepad2 className="w-6 h-6 text-amber-300" /> Feelz Run Levels
        </h1>
        <p className="text-sm text-white/45 mt-1.5 leading-relaxed">
          Put your songs in Feelz Run, the game on Feelz Machine. Pick a level, mark your song's sections, and fans run
          it to your music. They find it under Artist Runs in the game, or from the link you share. Switch it off any time.
        </p>

        {error && (
          <div className="mt-4 px-3.5 py-3 rounded-xl bg-red-500/[0.08] border border-red-400/20 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-100/80">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
        ) : !artist?.id ? (
          <div className="py-20 text-center">
            <Music className="w-9 h-9 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/40">Feelz Run levels are for artist accounts.</p>
          </div>
        ) : (
          <>
            <section className="mt-8 space-y-2.5">
              {ready.length === 0 && (
                <p className="text-sm text-white/40">Release a song that's free to stream and it can go in the game.</p>
              )}
              {ready.map(t => {
                const lv = levels.find(l => l.track_id === t.id);
                const tpl = lv && templates.find(x => x.id === lv.template);
                return (
                  <div key={t.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <div className="flex items-center gap-3">
                      {t.cover_artwork_url
                        ? <img src={t.cover_artwork_url} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-11 h-11 rounded-lg bg-white/[0.05] flex-shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                        <p className="text-xs text-white/40 mt-0.5 truncate">
                          {lv
                            ? `${lv.is_live ? 'In the game' : 'Switched off'} · ${tpl ? tpl.title : lv.template} level · ${lv.plays} ${lv.plays === 1 ? 'run' : 'runs'}${lv.discount_max ? ` · up to ${lv.discount_max}% off with credits` : ''}`
                            : 'Not in the game'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="px-3 py-1.5 rounded-full bg-amber-400/15 border border-amber-300/30 text-xs text-amber-100">
                        {lv ? 'Change level or sections' : 'Put it in the game'}
                      </button>
                      {lv && (
                        <>
                          <button type="button" disabled={busy === t.id} onClick={() => setLive(t.id, !lv.is_live)} className="px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-white/70">
                            {lv.is_live ? 'Switch off' : 'Switch on'}
                          </button>
                          {lv.is_live && (
                            <>
                              <button type="button" onClick={() => copyLink(lv)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-white/70">
                                {copied === lv.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied === lv.id ? 'Copied' : 'Copy link'}
                              </button>
                              <a href={`/run/?level=${lv.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-white/70">
                                <Play className="w-3.5 h-3.5" /> Play it
                              </a>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    {open === t.id && (
                      <Editor track={t} level={lv} templates={templates}
                        onClose={() => setOpen(null)}
                        onSaved={() => { setOpen(null); load(); }} />
                    )}
                  </div>
                );
              })}
            </section>

            {others.length > 0 && (
              <p className="mt-6 text-xs text-white/30">
                {others.length} {others.length === 1 ? 'song isn’t' : 'songs aren’t'} shown: only released songs that are free to stream can go in the game.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
