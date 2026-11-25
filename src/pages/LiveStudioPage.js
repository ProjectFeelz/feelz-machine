/**
 * src/pages/LiveStudioPage.js  (route: /live/studio)
 *
 * The host's dashboard for live streams, built for a computer first: start or
 * schedule a stream, see what is coming up, how past streams did (people who
 * watched, chat, tracks reviewed, gifts), show or hide replays, and manage
 * moderators. Numbers come from my_stream_stats() (live_watch_history.sql).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Radio, CalendarClock, Loader, Users, MessageSquare, Music, Gift, Bell, Eye, EyeOff,
  ExternalLink, Shield, Link as LinkIcon, Check, Clapperboard, Play, X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import DirectStreamSettings from '../components/DirectStreamSettings';
import StreamOverlayCard from '../components/StreamOverlayCard';

const when = (iso) => iso ? new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const money = (n) => `$${Number(n || 0).toFixed(Number(n || 0) % 1 ? 2 : 0)}`;
const openCreate = () => window.dispatchEvent(new CustomEvent('fm:open-create', { detail: { tab: 'live' } }));

function Stat({ icon: Icon, label, value, tint }) {
  return (
    <div className="rounded-2xl p-4 bg-white/[0.04] border border-white/[0.07]">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br ${tint}`}><Icon className="w-4 h-4 text-white" /></span>
      <p className="mt-3 text-2xl font-black text-white tabular-nums">{value}</p>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  );
}

export default function LiveStudioPage() {
  const navigate = useNavigate();
  const { user, artist } = useAuth();
  const [loading, setLoading] = useState(true);
  const [streams, setStreams] = useState([]);
  const [mods, setMods] = useState([]);
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!artist?.id) { setLoading(false); return; }
    const { data, error: e } = await supabase.rpc('my_stream_stats');
    if (e) setError('Your stream numbers could not load. If the live SQL files have not been run yet, run them first.');
    setStreams(data || []);

    const { data: modRows } = await supabase.from('artist_moderators').select('user_id, created_at').eq('artist_id', artist.id);
    const ids = (modRows || []).map(m => m.user_id);
    if (ids.length) {
      const [{ data: as }, { data: ls }] = await Promise.all([
        supabase.from('artists').select('user_id, artist_name, profile_image_url').in('user_id', ids),
        supabase.from('listeners').select('user_id, display_name, avatar_url').in('user_id', ids),
      ]);
      setMods(ids.map(id => {
        const a = (as || []).find(x => x.user_id === id);
        const l = (ls || []).find(x => x.user_id === id);
        return { id, name: a?.artist_name || l?.display_name || 'Moderator', avatar: a?.profile_image_url || l?.avatar_url || null };
      }));
    } else setMods([]);
    setLoading(false);
  }, [artist?.id]);

  useEffect(() => { load(); }, [load]);

  const toggleReplay = async (s) => {
    await supabase.from('listening_sessions').update({ replay_hidden: !s.replay_hidden }).eq('id', s.id);
    setStreams(prev => prev.map(x => x.id === s.id ? { ...x, replay_hidden: !x.replay_hidden } : x));
  };
  const removeMod = async (m) => {
    await supabase.from('artist_moderators').delete().eq('artist_id', artist.id).eq('user_id', m.id);
    setMods(prev => prev.filter(x => x.id !== m.id));
  };
  const copyLink = (s) => {
    navigator.clipboard?.writeText(`${window.location.origin}/session/${s.id}`).catch(() => {});
    setCopied(s.id); setTimeout(() => setCopied(null), 1800);
  };

  if (!user || !artist) {
    return (
      <div className="pt-24 px-6 text-center">
        <Clapperboard className="w-10 h-10 text-white/20 mx-auto mb-3" />
        <p className="text-lg font-black text-white">Live Studio is for artists</p>
        <p className="text-sm text-white/50 mt-1">Set up your artist profile to host streams.</p>
      </div>
    );
  }

  const live = streams.filter(s => s.status === 'live');
  const upcoming = streams.filter(s => s.status === 'scheduled').sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const past = streams.filter(s => s.status === 'ended');
  const total = (k) => past.reduce((n, s) => n + Number(s[k] || 0), 0);

  return (
    <div className="pb-24 md:pb-10 pt-14 md:pt-0 px-4 md:px-0">
      <Helmet><title>Live Studio · Feelz Machine</title></Helmet>

      {/* Header */}
      <div className="relative overflow-hidden rounded-[28px] mb-6 ring-1 ring-white/10">
        <div className="absolute inset-0 bg-gradient-to-br from-red-600/40 via-fuchsia-700/30 to-violet-800/40" />
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-pink-500/30 blur-3xl" />
        <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div>
            <p className="text-[11px] font-black tracking-[0.3em] text-pink-200 uppercase">Live Studio</p>
            <h1 className="mt-1 text-3xl md:text-4xl font-black text-white leading-tight">Your shows, {artist.artist_name}</h1>
            <p className="text-sm text-white/65 mt-1">Go live, line up the next one, and see how the last ones did.</p>
          </div>
          <div className="flex gap-2.5">
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-red-500 hover:bg-red-400 text-white text-sm font-black shadow-[0_0_30px_rgba(239,68,68,0.45)] transition">
              <Radio className="w-4 h-4" /> Go live
            </button>
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-black transition">
              <CalendarClock className="w-4 h-4" /> Schedule
            </button>
          </div>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-amber-300">{error}</p>}

      {loading ? (
        <div className="py-20 flex justify-center"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
          <div className="min-w-0 space-y-6">
            {/* Live now */}
            {live.map(s => (
              <div key={s.id} className="rounded-3xl p-5 bg-gradient-to-r from-red-500/20 to-pink-500/10 border border-red-400/30 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500 text-[10px] font-black text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> YOU'RE LIVE</span>
                  <p className="mt-2 text-xl font-black text-white truncate">{s.title}</p>
                  <p className="text-sm text-white/60">{s.live_viewers} watching so far · {s.messages} messages · {s.waiting} tracks waiting</p>
                </div>
                <button onClick={() => navigate(`/session/${s.id}`)} className="px-5 py-3 rounded-full bg-white text-black text-sm font-black">Open the stream</button>
              </div>
            ))}

            {/* Totals */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat icon={Clapperboard} label="Streams done" value={past.length} tint="from-violet-600 to-fuchsia-500" />
              <Stat icon={Users} label="People who watched" value={total('viewers')} tint="from-sky-500 to-violet-500" />
              <Stat icon={Music} label="Tracks reviewed" value={total('reviewed')} tint="from-pink-500 to-amber-400" />
              <Stat icon={Gift} label="Gifts received" value={money(total('gifts'))} tint="from-amber-400 to-orange-500" />
            </div>

            {/* Upcoming */}
            <section>
              <h2 className="text-lg font-black text-white mb-3 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-amber-300" /> Coming up</h2>
              {upcoming.length === 0 ? (
                <button onClick={openCreate} className="w-full rounded-2xl border border-dashed border-white/15 p-6 text-sm text-white/50 hover:text-white hover:border-white/30 transition">
                  Nothing scheduled. Schedule a stream and your fans get a heads-up and a reminder.
                </button>
              ) : (
                <div className="space-y-2">
                  {upcoming.map(s => (
                    <div key={s.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
                      <div className="w-14 text-center flex-shrink-0">
                        <p className="text-[10px] font-black text-amber-300 uppercase">{new Date(s.scheduled_at).toLocaleDateString([], { weekday: 'short' })}</p>
                        <p className="text-2xl font-black text-white leading-none">{new Date(s.scheduled_at).getDate()}</p>
                        <p className="text-[10px] text-white/40">{new Date(s.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-white truncate">{s.title}</p>
                        <p className="text-xs text-white/50 flex items-center gap-1"><Bell className="w-3 h-3" /> {s.reminders} reminded · {s.waiting} tracks already in</p>
                      </div>
                      <button onClick={() => copyLink(s)} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] text-xs font-bold text-white/70 hover:text-white">
                        {copied === s.id ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><LinkIcon className="w-3.5 h-3.5" /> Share link</>}
                      </button>
                      <button onClick={() => navigate(`/session/${s.id}`)} className="px-4 py-2 rounded-xl bg-white text-black text-xs font-black">Open</button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Past */}
            <section>
              <h2 className="text-lg font-black text-white mb-3 flex items-center gap-2"><Play className="w-5 h-5 text-violet-300" /> Past streams</h2>
              {past.length === 0 ? (
                <p className="text-sm text-white/40">Your finished streams and their numbers show up here.</p>
              ) : (
                <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
                  <div className="hidden md:grid grid-cols-[minmax(0,1fr)_80px_80px_80px_80px_150px] gap-2 px-4 py-2.5 bg-white/[0.04] text-[10px] font-black tracking-wider uppercase text-white/40">
                    <span>Stream</span><span className="text-right">Watched</span><span className="text-right">Live</span><span className="text-right">Reviews</span><span className="text-right">Gifts</span><span className="text-right">Replay</span>
                  </div>
                  {past.map(s => (
                    <div key={s.id} className="grid grid-cols-2 md:grid-cols-[minmax(0,1fr)_80px_80px_80px_80px_150px] gap-2 items-center px-4 py-3 border-t border-white/[0.05] hover:bg-white/[0.02]">
                      <button onClick={() => navigate(`/session/${s.id}`)} className="col-span-2 md:col-span-1 text-left min-w-0">
                        <p className="text-sm font-bold text-white truncate">{s.title}</p>
                        <p className="text-[11px] text-white/40">{when(s.started_at)} · {s.messages} messages</p>
                      </button>
                      <span className="text-sm text-white/80 md:text-right tabular-nums"><span className="md:hidden text-white/40 text-xs">Watched </span>{s.viewers}</span>
                      <span className="text-sm text-white/80 md:text-right tabular-nums"><span className="md:hidden text-white/40 text-xs">Live </span>{s.live_viewers}</span>
                      <span className="text-sm text-white/80 md:text-right tabular-nums"><span className="md:hidden text-white/40 text-xs">Reviews </span>{s.reviewed}</span>
                      <span className="text-sm text-white/80 md:text-right tabular-nums"><span className="md:hidden text-white/40 text-xs">Gifts </span>{money(s.gifts)}</span>
                      <div className="col-span-2 md:col-span-1 flex md:justify-end gap-1.5">
                        {s.youtube_url || (s.mode === 'direct') ? (
                          <button onClick={() => toggleReplay(s)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black ${s.replay_hidden ? 'bg-white/[0.06] text-white/50' : 'bg-emerald-400/15 text-emerald-300'}`}>
                            {s.replay_hidden ? <><EyeOff className="w-3.5 h-3.5" /> Hidden</> : <><Eye className="w-3.5 h-3.5" /> Showing</>}
                          </button>
                        ) : <span className="text-[11px] text-white/30">No video</span>}
                        <button onClick={() => navigate(`/session/${s.id}`)} aria-label="Open" className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center"><ExternalLink className="w-3.5 h-3.5 text-white/60" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Side column */}
          <aside className="space-y-6">
            <DirectStreamSettings />
            <StreamOverlayCard artistId={artist?.id} />
            <section className="rounded-3xl p-5 bg-white/[0.04] border border-white/[0.07]">
              <h2 className="text-base font-black text-white mb-1 flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400" /> Moderators</h2>
              <p className="text-xs text-white/45 mb-4">To add one, tap their name in your stream's chat and choose Make moderator. They help on all your streams.</p>
              {mods.length === 0 ? (
                <p className="text-sm text-white/40">No moderators yet.</p>
              ) : (
                <div className="space-y-2">
                  {mods.map(m => (
                    <div key={m.id} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                        {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-black">{m.name[0]}</div>}
                      </div>
                      <span className="text-sm font-bold text-white flex-1 truncate">{m.name}</span>
                      <button onClick={() => removeMod(m)} aria-label={`Remove ${m.name}`} className="w-8 h-8 rounded-lg hover:bg-red-500/15 flex items-center justify-center"><X className="w-4 h-4 text-white/40" /></button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl p-5 bg-white/[0.04] border border-white/[0.07]">
              <h2 className="text-base font-black text-white mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-violet-300" /> Streaming through YouTube</h2>
              <ol className="space-y-2.5 text-sm text-white/70 list-decimal pl-5">
                <li>In OBS, stream to YouTube as usual.</li>
                <li>In YouTube Studio, open the stream and turn on Allow embedding.</li>
                <li>Switch monetisation off for the stream, so no ads play here.</li>
                <li>Copy the live link and paste it when you go live, or on the stream page.</li>
                <li>Fans watch, chat and send tracks on Feelz Machine. You can still stream to other platforms at the same time.</li>
              </ol>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
