/**
 * src/pages/LivePage.js  (route: /live)
 *
 * Everything live on Feelz Machine in one place:
 *   Live now     streams on right now
 *   Coming up    scheduled streams, with Remind me
 *   Replays      past streams whose video is still up and that the host has
 *                not hidden
 * Streams hosted on a platform admin's account are marked as Feelz Machine
 * shows and sit first in each list.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Radio, Bell, PlayCircle, CalendarClock, Loader, Music } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const YT = /(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const ytThumb = (url) => { const m = (url || '').match(YT); return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null; };

const when = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Card({ s, kind, onOpen, reminded, onRemind }) {
  const thumb = ytThumb(s.youtube_url) || s.artist?.profile_image_url;
  return (
    <button onClick={onOpen} className="group text-left w-full">
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-white/[0.05] border border-white/[0.07] group-hover:border-pink-400/40 transition">
        {thumb
          ? <img src={thumb} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          : <div className="w-full h-full flex items-center justify-center"><Radio className="w-8 h-8 text-white/20" /></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
        {kind === 'live' && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500 text-[10px] font-black tracking-wider text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
          </span>
        )}
        {kind === 'soon' && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-400 text-black text-[10px] font-black">{when(s.scheduled_at)}</span>
        )}
        {kind === 'replay' && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-black">
            <PlayCircle className="w-3 h-3" /> REPLAY
          </span>
        )}
        {s.platform && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-gradient-to-r from-pink-500 to-violet-500 text-[10px] font-black text-white">FEELZ MACHINE SHOW</span>
        )}
        {s.reviews > 0 && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 text-[10px] font-bold text-white">
            <Music className="w-3 h-3" /> {s.reviews} reviewed
          </span>
        )}
      </div>
      <div className="mt-2 flex items-start gap-2">
        <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
          {s.artist?.profile_image_url && <img src={s.artist.profile_image_url} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{s.title || 'Live stream'}</p>
          <p className="text-xs text-white/50 truncate">
            {s.artist?.artist_name}
            {kind === 'replay' && s.started_at ? ` · ${new Date(s.started_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : ''}
          </p>
        </div>
        {kind === 'soon' && (
          <span role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onRemind(s); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onRemind(s); } }}
            className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-black ${reminded ? 'bg-white/10 text-white' : 'bg-white text-black'}`}>
            <Bell className="w-3 h-3" /> {reminded ? 'Set' : 'Remind me'}
          </span>
        )}
      </div>
    </button>
  );
}

export default function LivePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState([]);
  const [soon, setSoon] = useState([]);
  const [replays, setReplays] = useState([]);
  const [reminders, setReminders] = useState(() => new Set());

  const load = useCallback(async () => {
    const cols = 'id, title, status, mode, youtube_url, scheduled_at, started_at, ended_at, artist_id, replay_hidden';
    const [liveRes, soonRes, pastRes] = await Promise.all([
      supabase.from('listening_sessions').select(cols).eq('status', 'live').order('started_at', { ascending: false }).limit(24),
      supabase.from('listening_sessions').select(cols).eq('status', 'scheduled')
        .gte('scheduled_at', new Date(Date.now() - 3600e3).toISOString()).order('scheduled_at').limit(24),
      supabase.from('listening_sessions').select(cols).eq('status', 'ended').not('youtube_url', 'is', null)
        .order('started_at', { ascending: false }).limit(48),
    ]);
    const all = [...(liveRes.data || []), ...(soonRes.data || []), ...(pastRes.data || [])];
    const artistIds = [...new Set(all.map(s => s.artist_id))];
    const [{ data: artists }, { data: admins }] = await Promise.all([
      artistIds.length ? supabase.from('artists').select('id, user_id, artist_name, slug, profile_image_url').in('id', artistIds) : { data: [] },
      supabase.rpc('platform_host_artist_ids'),
    ]);
    const byId = Object.fromEntries((artists || []).map(a => [a.id, a]));
    const platform = new Set((admins || []).map(r => r.artist_id || r));
    const dress = (s) => ({ ...s, artist: byId[s.artist_id], platform: platform.has(s.artist_id) });
    const platformFirst = (a, b) => (b.platform ? 1 : 0) - (a.platform ? 1 : 0);

    // Reviewed counts on replays, from the public queue.
    const past = (pastRes.data || []).filter(s => !s.replay_hidden && YT.test(s.youtube_url || '')).slice(0, 24).map(dress);
    await Promise.all(past.map(async (s) => {
      const { data } = await supabase.rpc('session_review_queue', { p_session: s.id });
      s.reviews = (data || []).filter(q => q.status === 'reviewed').length;
    }));

    setLive((liveRes.data || []).map(dress).sort(platformFirst));
    setSoon((soonRes.data || []).map(dress).sort(platformFirst));
    setReplays(past);

    if (user?.id) {
      const { data: mine } = await supabase.from('session_reminders').select('session_id').eq('user_id', user.id);
      setReminders(new Set((mine || []).map(r => r.session_id)));
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const remind = async (s) => {
    if (!user?.id) { navigate('/login?next=/live'); return; }
    if (reminders.has(s.id)) {
      await supabase.from('session_reminders').delete().eq('session_id', s.id).eq('user_id', user.id);
      setReminders(prev => { const n = new Set(prev); n.delete(s.id); return n; });
    } else {
      await supabase.from('session_reminders').insert({ session_id: s.id, user_id: user.id });
      setReminders(prev => new Set(prev).add(s.id));
    }
  };

  const Section = ({ icon: Icon, title, items, kind, empty }) => (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-4 h-4 ${kind === 'live' ? 'text-red-400' : kind === 'soon' ? 'text-amber-300' : 'text-violet-300'}`} />
        <h2 className="text-sm font-black tracking-[0.2em] uppercase text-white/80">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-white/40">{empty}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(s => (
            <Card key={s.id} s={s} kind={kind} onOpen={() => navigate(`/session/${s.id}`)}
              reminded={reminders.has(s.id)} onRemind={remind} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="pb-24 px-4 md:px-0 pt-14 md:pt-4">
      <Helmet>
        <title>Live · Feelz Machine</title>
        <meta name="description" content="Live streams, live track reviews and replays on Feelz Machine." />
        <link rel="canonical" href="https://www.feelzmachine.com/live" />
      </Helmet>

      <div className="mb-8">
        <h1 className="text-3xl font-black italic uppercase tracking-tight">
          <span className="bg-gradient-to-r from-pink-400 via-violet-400 to-cyan-300 bg-clip-text text-transparent">Live</span>
        </h1>
        <p className="text-sm text-white/50 mt-1">Watch live, get your tracks reviewed, catch up on replays.</p>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
      ) : (
        <>
          <Section icon={Radio} title="Live now" items={live} kind="live" empty="Nobody is live right now. Check what's coming up." />
          <Section icon={CalendarClock} title="Coming up" items={soon} kind="soon" empty="Nothing scheduled yet." />
          <Section icon={PlayCircle} title="Replays" items={replays} kind="replay" empty="Past streams show up here." />
        </>
      )}
    </div>
  );
}
