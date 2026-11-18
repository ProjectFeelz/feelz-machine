// src/hooks/useLiveStreams.js
//
// Whether anything is live right now or starting in the next day, for the
// "Live streams" row under Sessions in the create menus and the LIVE chip in
// the phone's top bar. Cheap: two counts, refreshed every minute. With
// { withFirst: true } it also returns the stream to show first (`first`):
// a live one if there is one, otherwise the next one starting.

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function useLiveStreams({ withFirst = false } = {}) {
  const [state, setState] = useState({ live: 0, soon: 0, first: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const now = new Date();
      const [liveRes, soonRes] = await Promise.all([
        supabase.from('listening_sessions').select('id', { count: 'exact', head: true }).eq('status', 'live'),
        supabase.from('listening_sessions').select('id', { count: 'exact', head: true })
          .eq('status', 'scheduled')
          .gte('scheduled_at', new Date(now.getTime() - 3600e3).toISOString())
          .lte('scheduled_at', new Date(now.getTime() + 86400e3).toISOString()),
      ]);
      let first = null;
      if (withFirst && (liveRes.count || soonRes.count)) {
        const live = !!liveRes.count;
        let q = supabase.from('listening_sessions')
          .select('id, title, status, scheduled_at, artists(artist_name, profile_image_url)')
          .eq('status', live ? 'live' : 'scheduled');
        q = live
          ? q.order('started_at', { ascending: false })
          : q.gte('scheduled_at', new Date(now.getTime() - 3600e3).toISOString()).order('scheduled_at', { ascending: true });
        const { data } = await q.limit(1);
        first = data?.[0] || null;
      }
      if (!cancelled) setState({ live: liveRes.count || 0, soon: soonRes.count || 0, first, loading: false });
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [withFirst]);

  return state;
}

/** "2 live now", "Starting soon", for the row's subtitle. */
export function liveStreamsLine({ live, soon }) {
  if (live) return `${live} live now. Watch, chat and get tracks reviewed`;
  if (soon) return `${soon} starting soon. Set a reminder`;
  return '';
}
