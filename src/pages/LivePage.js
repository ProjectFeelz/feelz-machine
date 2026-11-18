/**
 * src/pages/LivePage.js  (route: /live)
 *
 * Feelz Live: shows, live reviews and listening parties, laid out like a TV
 * guide. A big featured show up top (whatever is live, else the next one on,
 * else the latest replay), then rows you scroll sideways: Live now, Coming
 * up, From artists you follow, Feelz Machine shows, Live reviews, and every
 * replay. Streams on a platform admin's account are Feelz Machine shows and
 * lead each row.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Radio, Bell, BellRing, Play, CalendarClock, Loader, Music, ChevronLeft, ChevronRight,
  Sparkles, Mic2, Tv, Users, Clapperboard,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import useDirectLive, { cfThumb } from '../hooks/useDirectLive';

const YT = /(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const ytId = (url) => { const m = (url || '').match(YT); return m ? m[1] : null; };
const thumb = (s, big) => {
  if (s.cfThumb) return s.cfThumb;
  const id = ytId(s.youtube_url);
  if (id) return `https://i.ytimg.com/vi/${id}/${big ? 'maxresdefault' : 'hqdefault'}.jpg`;
  return s.artist?.profile_image_url || null;
};
const when = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ago = (iso) => {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${d < 14 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const untilText = (iso) => {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'Any minute';
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
  if (h >= 24) return `In ${Math.floor(h / 24)} day${h >= 48 ? 's' : ''}`;
  return h ? `In ${h}h ${m}m` : `In ${m} min`;
};

// ── Pieces ──────────────────────────────────────────────────────────────────

function Art({ s, big, className = '' }) {
  const [failed, setFailed] = useState(false);
  const src = thumb(s, big);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={`w-full h-full object-cover ${className}`} />;
  }
  // No artwork: a painted card in the show's colours, with the host's initial.
  return (
    <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-700 via-fuchsia-600 to-amber-500 ${className}`}>
      <span className="text-5xl font-black italic text-white/80">{(s.artist?.artist_name || 'F')[0]}</span>
    </div>
  );
}

function Badge({ s, kind }) {
  if (kind === 'live') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500 text-[10px] font-black tracking-wider text-white shadow">
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
    </span>
  );
  if (kind === 'soon') return (
    <span className="px-2 py-0.5 rounded-md bg-amber-400 text-black text-[10px] font-black">{untilText(s.scheduled_at).toUpperCase()}</span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-black">
      <Play className="w-2.5 h-2.5 fill-white" /> REPLAY
    </span>
  );
}

function ShowCard({ s, kind, onOpen, reminded, onRemind }) {
  return (
    <div className="group w-[calc(50vw-22px)] sm:w-[300px] lg:w-[320px] 2xl:w-[360px] flex-shrink-0 snap-start">
      <button onClick={onOpen} className="relative block w-full aspect-video rounded-xl sm:rounded-2xl overflow-hidden bg-white/[0.05] ring-1 ring-white/[0.07] group-hover:ring-pink-400/50 transition">
        <Art s={s} className="group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/20" />
        <div className="absolute top-2 left-2"><Badge s={s} kind={kind} /></div>
        {s.platform && (
          <span className="absolute top-2 right-2 hidden sm:inline px-2 py-0.5 rounded-md bg-gradient-to-r from-pink-500 to-violet-500 text-[9px] font-black tracking-wider text-white">FEELZ SHOW</span>
        )}
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5">
          {s.reviews > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-bold text-white"><Music className="w-3 h-3" /> {s.reviews} reviewed</span>
          )}
          {s.mode === 'audio' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-bold text-white"><Mic2 className="w-3 h-3" /> Listening party</span>
          )}
        </div>
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
          <span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl"><Play className="w-5 h-5 text-black fill-black ml-0.5" /></span>
        </span>
      </button>
      <div className="mt-2 sm:mt-2.5 flex gap-2 sm:gap-2.5">
        <div className="hidden sm:block w-9 h-9 rounded-full overflow-hidden bg-white/10 flex-shrink-0 ring-2 ring-white/10">
          {s.artist?.profile_image_url
            ? <img src={s.artist.profile_image_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-xs font-black">{(s.artist?.artist_name || '?')[0]}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <button onClick={onOpen} className="block text-left text-[13px] sm:text-sm font-bold text-white leading-snug line-clamp-2 hover:text-pink-200 transition">{s.title || 'Live stream'}</button>
          <p className="text-[11px] sm:text-xs text-white/50 truncate mt-0.5">
            {s.artist?.artist_name}
            {kind === 'replay' ? ` · ${ago(s.started_at || s.ended_at)}` : kind === 'soon' ? ` · ${when(s.scheduled_at)}` : ''}
          </p>
        </div>
        {kind === 'soon' && (
          <button onClick={() => onRemind(s)} aria-label={reminded ? 'Reminder set' : 'Remind me'}
            className={`self-start w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0 rounded-full flex items-center justify-center transition ${reminded ? 'bg-white/15 text-white' : 'bg-white text-black hover:scale-105'}`}>
            {reminded ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function Shelf({ title, icon: Icon, tint, items, kind, kindOf, onOpen, reminders, onRemind, note }) {
  const ref = useRef(null);
  if (!items.length) return null;
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.85), behavior: 'smooth' });
  return (
    <section className="mb-9">
      <div className="flex items-end justify-between mb-3 px-4 md:px-0">
        <div className="flex items-center gap-2.5">
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br ${tint}`}><Icon className="w-4 h-4 text-white" /></span>
          <div>
            <h2 className="text-lg md:text-xl font-black text-white leading-none">{title}</h2>
            {note && <p className="text-xs text-white/45 mt-1">{note}</p>}
          </div>
        </div>
        <div className="hidden md:flex gap-1.5">
          <button onClick={() => scroll(-1)} aria-label="Scroll back" className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => scroll(1)} aria-label="Scroll on" className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div ref={ref} className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory px-4 md:px-0 pb-1 scroll-px-4">
        {items.map(s => (
          <ShowCard key={s.id} s={s} kind={kindOf ? kindOf(s) : kind} onOpen={() => onOpen(s)}
            reminded={reminders.has(s.id)} onRemind={onRemind} />
        ))}
      </div>
    </section>
  );
}

function Hero({ s, kind, onOpen, reminded, onRemind }) {
  return (
    <div className="relative mx-4 md:mx-0 mb-10 rounded-[28px] overflow-hidden ring-1 ring-white/10 fm-hero-glow">
      <div className="relative aspect-[4/4.2] sm:aspect-video lg:aspect-[21/9]">
        <Art s={s} big className="absolute inset-0 fm-hero-zoom" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/30 to-transparent hidden sm:block" />
        <div className="absolute inset-0 fm-hero-grain pointer-events-none" />

        <div className="absolute left-0 right-0 bottom-0 p-5 sm:p-8 lg:p-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Badge s={s} kind={kind} />
            {s.platform && <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-pink-500 to-violet-500 text-[10px] font-black tracking-wider text-white">FEELZ MACHINE SHOW</span>}
            {kind === 'soon' && <span className="text-xs font-bold text-white/70">{when(s.scheduled_at)}</span>}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[0.95] tracking-tight text-white drop-shadow-lg">
            {s.title || 'Live on Feelz'}
          </h2>
          <div className="mt-3 flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-white/30 bg-white/10">
              {s.artist?.profile_image_url && <img src={s.artist.profile_image_url} alt="" className="w-full h-full object-cover" />}
            </div>
            <p className="text-sm font-bold text-white/90">{s.artist?.artist_name}</p>
            {s.reviews > 0 && <p className="text-sm text-white/60">· {s.reviews} tracks reviewed</p>}
            {s.reminders > 0 && kind === 'soon' && <p className="text-sm text-white/60">· {s.reminders} coming</p>}
          </div>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button onClick={onOpen}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black text-sm font-black hover:scale-[1.03] active:scale-95 transition shadow-xl">
              <Play className="w-4 h-4 fill-black" /> {kind === 'live' ? 'Watch live' : kind === 'soon' ? 'Open the show' : 'Watch the replay'}
            </button>
            {kind === 'soon' && (
              <button onClick={() => onRemind(s)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white/15 backdrop-blur text-white text-sm font-black hover:bg-white/25 transition">
                {reminded ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />} {reminded ? 'Reminder set' : 'Remind me'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

const FILTERS = [
  { id: 'all',     label: 'Everything',        icon: Sparkles },
  { id: 'reviews', label: 'Live reviews',      icon: Music },
  { id: 'video',   label: 'Video streams',     icon: Tv },
  { id: 'audio',   label: 'Listening parties', icon: Mic2 },
];

export default function LivePage() {
  const navigate = useNavigate();
  const { user, artist } = useAuth();
  const { customerCode } = useDirectLive();
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState([]);
  const [following, setFollowing] = useState(() => new Set());
  const [reminders, setReminders] = useState(() => new Set());
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    // With the direct-streaming columns when they exist; without them (before
    // live_direct.sql has run) the page still shows every YouTube stream.
    const base = 'id, title, status, mode, youtube_url, scheduled_at, started_at, ended_at, artist_id, replay_hidden';
    const fetchAll = (withDirect) => {
      const cols = withDirect ? `${base}, cf_live_uid, cf_replay_uid` : base;
      return Promise.all([
        supabase.from('listening_sessions').select(cols).eq('status', 'live').order('started_at', { ascending: false }).limit(30),
        supabase.from('listening_sessions').select(cols).eq('status', 'scheduled')
          .gte('scheduled_at', new Date(Date.now() - 3600e3).toISOString()).order('scheduled_at').limit(30),
        withDirect
          ? supabase.from('listening_sessions').select(cols).eq('status', 'ended').or('youtube_url.not.is.null,cf_live_uid.not.is.null')
              .order('started_at', { ascending: false }).limit(80)
          : supabase.from('listening_sessions').select(cols).eq('status', 'ended').not('youtube_url', 'is', null)
              .order('started_at', { ascending: false }).limit(80),
      ]);
    };
    let [liveRes, soonRes, pastRes] = await fetchAll(true);
    if (liveRes.error || soonRes.error || pastRes.error) [liveRes, soonRes, pastRes] = await fetchAll(false);
    const platRes = await supabase.rpc('platform_host_artist_ids');
    // A replay needs its video: on YouTube, or recorded by Cloudflare.
    const past = (pastRes.data || []).filter(s => !s.replay_hidden && (ytId(s.youtube_url) || (s.mode === 'direct' && s.cf_live_uid)));
    const rows = [...(liveRes.data || []), ...(soonRes.data || []), ...past];
    const artistIds = [...new Set(rows.map(s => s.artist_id))];
    const { data: artists } = artistIds.length
      ? await supabase.from('artists').select('id, artist_name, slug, profile_image_url').in('id', artistIds)
      : { data: [] };
    const byId = Object.fromEntries((artists || []).map(a => [a.id, a]));
    const platform = new Set((platRes.data || []).map(r => r.artist_id || r));

    const dressed = rows.map(s => ({ ...s, artist: byId[s.artist_id], platform: platform.has(s.artist_id), reviews: 0, reminders: 0,
      cfThumb: s.mode === 'direct' && s.cf_replay_uid ? cfThumb(customerCode, s.cf_replay_uid) : null }));
    // Review counts for replays, and how many are coming to upcoming shows.
    await Promise.all(dressed.map(async (s) => {
      if (s.status === 'ended') {
        const { data } = await supabase.rpc('session_review_queue', { p_session: s.id });
        s.reviews = (data || []).filter(q => q.status === 'reviewed').length;
      } else if (s.status === 'scheduled') {
        const { data } = await supabase.rpc('session_reminder_count', { p_session: s.id });
        s.reminders = typeof data === 'number' ? data : 0;
      }
    }));
    setAll(dressed);

    if (user?.id) {
      const [{ data: mine }, { data: follows }] = await Promise.all([
        supabase.from('session_reminders').select('session_id').eq('user_id', user.id),
        supabase.from('follows').select('artist_id').eq('follower_id', user.id),
      ]);
      setReminders(new Set((mine || []).map(r => r.session_id)));
      setFollowing(new Set((follows || []).map(f => f.artist_id)));
    }
    setLoading(false);
  }, [user?.id, customerCode]);

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

  const open = (s) => navigate(`/session/${s.id}`);
  const kindOf = (s) => (s.status === 'live' ? 'live' : s.status === 'scheduled' ? 'soon' : 'replay');

  const { hero, live, soon, shows, reviewed, fromFollowing, replays } = useMemo(() => {
    const pass = (s) => filter === 'all'
      || (filter === 'reviews' && (s.reviews > 0 || /review/i.test(s.title || '')))
      || (filter === 'video' && s.mode === 'youtube')
      || (filter === 'audio' && s.mode === 'audio');
    const platformFirst = (a, b) => (b.platform ? 1 : 0) - (a.platform ? 1 : 0);
    const list = all.filter(pass);
    const live = list.filter(s => s.status === 'live').sort(platformFirst);
    const soon = list.filter(s => s.status === 'scheduled').sort(platformFirst);
    const replays = list.filter(s => s.status === 'ended');
    const hero = live[0] || soon[0] || replays.find(s => s.platform) || replays[0] || null;
    return {
      hero,
      live,
      soon,
      shows: replays.filter(s => s.platform),
      reviewed: replays.filter(s => s.reviews > 0),
      fromFollowing: list.filter(s => following.has(s.artist_id) && s.id !== hero?.id),
      replays,
    };
  }, [all, filter, following]);

  const openCreate = () => window.dispatchEvent(new CustomEvent('fm:open-create', { detail: { tab: 'live' } }));
  const nothing = !loading && !hero;

  return (
    <div className="pb-24 md:pb-10 pt-14 md:pt-0">
      <Helmet>
        <title>Feelz Live · Feelz Machine</title>
        <meta name="description" content="Live shows, live track reviews, listening parties and replays on Feelz Machine." />
        <link rel="canonical" href="https://www.feelzmachine.com/live" />
      </Helmet>

      {/* Title bar */}
      <div className="flex items-end justify-between gap-4 mb-5 px-4 md:px-0">
        <div>
          <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tight leading-none">
            <span className="text-white">Feelz</span>{' '}
            <span className="bg-gradient-to-r from-pink-400 via-violet-400 to-cyan-300 bg-clip-text text-transparent">Live</span>
          </h1>
          <p className="text-sm text-white/55 mt-2">Shows, live track reviews and listening parties. Catch them live or watch the replay.</p>
        </div>
        {artist && (
          <button onClick={() => navigate('/live/studio')}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-sm font-bold text-white transition flex-shrink-0">
            <Clapperboard className="w-4 h-4" /> Live Studio
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6 px-4 md:px-0">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition ${filter === f.id ? 'bg-white text-black' : 'bg-white/[0.07] text-white/75 hover:bg-white/[0.12]'}`}>
            <f.icon className="w-4 h-4" /> {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-24 flex justify-center"><Loader className="w-7 h-7 animate-spin text-white/30" /></div>
      ) : nothing ? (
        <div className="mx-4 md:mx-0 relative rounded-[28px] overflow-hidden ring-1 ring-white/10 fm-hero-glow">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-800 via-fuchsia-700 to-amber-500 opacity-60" />
          <div className="absolute inset-0 fm-hero-grain" />
          <div className="relative p-8 md:p-14 max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 text-[10px] font-black tracking-[0.2em] text-white">
              <Radio className="w-3.5 h-3.5" /> FEELZ LIVE
            </span>
            <h2 className="mt-4 text-4xl md:text-5xl font-black leading-[0.95] text-white">The next show is being lined up.</h2>
            <p className="mt-3 text-white/80">Live reviews, beat sessions and listening parties land here. Turn on notifications and you will hear the moment one starts.</p>
            {artist && (
              <button onClick={openCreate} className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-black">
                <Radio className="w-4 h-4" /> Host your own
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {hero && <Hero s={hero} kind={kindOf(hero)} onOpen={() => open(hero)} reminded={reminders.has(hero.id)} onRemind={remind} />}

          <Shelf title="Live now" icon={Radio} tint="from-red-500 to-pink-500" items={live} kind="live" onOpen={open} reminders={reminders} onRemind={remind} note="Jump in, chat, send your track" />
          <Shelf title="Coming up" icon={CalendarClock} tint="from-amber-400 to-orange-500" items={soon} kind="soon" onOpen={open} reminders={reminders} onRemind={remind} note="Tap the bell and we'll remind you" />
          <Shelf title="From artists you follow" icon={Users} tint="from-sky-400 to-violet-500" items={fromFollowing} kindOf={kindOf} onOpen={open} reminders={reminders} onRemind={remind} />
          <Shelf title="Feelz Machine shows" icon={Sparkles} tint="from-pink-500 to-violet-600" items={shows} kind="replay" onOpen={open} reminders={reminders} onRemind={remind} note="Our own shows, start to finish" />
          <Shelf title="Live reviews" icon={Music} tint="from-fuchsia-500 to-amber-400" items={reviewed} kind="replay" onOpen={open} reminders={reminders} onRemind={remind} note="Tracks rated live by the room" />
          <Shelf title="All replays" icon={Play} tint="from-violet-600 to-cyan-500" items={replays} kind="replay" onOpen={open} reminders={reminders} onRemind={remind} />
        </>
      )}

      <style>{`
        .fm-hero-glow { box-shadow: 0 30px 120px -30px rgba(236,72,153,0.45), 0 0 0 1px rgba(255,255,255,0.04); }
        .fm-hero-zoom { animation: fm-hero-zoom 18s ease-in-out infinite alternate; }
        @keyframes fm-hero-zoom { from { transform: scale(1); } to { transform: scale(1.08); } }
        .fm-hero-grain { background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 3px 3px; mix-blend-mode: overlay; }
        @media (prefers-reduced-motion: reduce) { .fm-hero-zoom { animation: none; } }
      `}</style>
    </div>
  );
}
