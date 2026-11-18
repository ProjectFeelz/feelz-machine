/**
 * src/pages/WatchedStreamsPage.js  (route: /library/streams)
 *
 * The streams you have watched, newest first, from session_views. Ones you
 * caught live are marked, and anything still on comes back with a LIVE badge.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Radio, Play, Loader, ChevronLeft } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const YT = /(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const ytThumb = (url) => { const m = (url || '').match(YT); return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null; };

export default function WatchedStreamsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    (async () => {
      const { data: views } = await supabase.from('session_views')
        .select('session_id, last_watched_at, watched_live')
        .eq('user_id', user.id)
        .order('last_watched_at', { ascending: false })
        .limit(60);
      const ids = (views || []).map(v => v.session_id);
      if (!ids.length) { setRows([]); setLoading(false); return; }
      let { data: sessions, error: sErr } = await supabase.from('listening_sessions')
        .select('id, title, status, mode, youtube_url, cf_live_uid, artist_id, replay_hidden, started_at').in('id', ids);
      if (sErr) {
        // Before live_direct.sql has run there is no cf_live_uid column.
        ({ data: sessions } = await supabase.from('listening_sessions')
          .select('id, title, status, mode, youtube_url, artist_id, replay_hidden, started_at').in('id', ids));
      }
      const artistIds = [...new Set((sessions || []).map(s => s.artist_id))];
      const { data: artists } = artistIds.length
        ? await supabase.from('artists').select('id, artist_name, profile_image_url').in('id', artistIds)
        : { data: [] };
      const sMap = Object.fromEntries((sessions || []).map(s => [s.id, s]));
      const aMap = Object.fromEntries((artists || []).map(a => [a.id, a]));
      setRows((views || [])
        .map(v => ({ ...v, s: sMap[v.session_id] }))
        // Gone, or a replay the host has taken down.
        .filter(v => v.s && !(v.s.status === 'ended' && (v.s.replay_hidden || !(YT.test(v.s.youtube_url || '') || (v.s.mode === 'direct' && v.s.cf_live_uid)))))
        .map(v => ({ ...v, a: aMap[v.s.artist_id] })));
      setLoading(false);
    })();
  }, [user?.id]);

  return (
    <div className="pb-24 md:pb-10 pt-14 md:pt-0 px-4 md:px-0">
      <Helmet><title>Streams you watched · Feelz Machine</title></Helmet>
      <button onClick={() => navigate('/library')} className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white mb-3">
        <ChevronLeft className="w-4 h-4" /> Library
      </button>
      <h1 className="text-2xl font-black text-white">Streams</h1>
      <p className="text-sm text-white/50 mb-6">Everything you have watched, ready to watch again.</p>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl p-8 text-center bg-white/[0.03] border border-white/[0.07]">
          <Radio className="w-8 h-8 text-white/25 mx-auto mb-3" />
          <p className="text-base font-black text-white">Nothing watched yet</p>
          <p className="text-sm text-white/50 mt-1">Shows and live reviews you watch land here.</p>
          <button onClick={() => navigate('/live')} className="mt-4 px-5 py-2.5 rounded-full bg-white text-black text-sm font-black">Browse Feelz Live</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {rows.map(({ session_id, s, a, watched_live, last_watched_at }) => (
            <button key={session_id} onClick={() => navigate(`/session/${session_id}`)} className="group text-left">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-violet-700 via-fuchsia-600 to-amber-500 ring-1 ring-white/[0.07] group-hover:ring-pink-400/50 transition">
                {ytThumb(s.youtube_url) && <img src={ytThumb(s.youtube_url)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <span className="absolute top-2 left-2">
                  {s.status === 'live'
                    ? <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500 text-[10px] font-black text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE</span>
                    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/75 text-[10px] font-black text-white"><Play className="w-2.5 h-2.5 fill-white" /> {s.status === 'scheduled' ? 'SOON' : 'REPLAY'}</span>}
                </span>
                {watched_live && s.status === 'ended' && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-white/90 text-black text-[10px] font-black">YOU WERE THERE</span>
                )}
              </div>
              <p className="mt-2 text-sm font-bold text-white line-clamp-2">{s.title || 'Live stream'}</p>
              <p className="text-xs text-white/50">{a?.artist_name} · watched {new Date(last_watched_at).toLocaleDateString([], { day: 'numeric', month: 'short' })}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
