// src/hooks/useLiveStreams.js
//
// Whether anything is live right now or starting in the next day, for the
// "Live streams" row under Sessions in the create menus. Cheap: two counts,
// refreshed every minute while the menu is open.

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function useLiveStreams() {
  const [state, setState] = useState({ live: 0, soon: 0, loading: true });

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
      if (!cancelled) setState({ live: liveRes.count || 0, soon: soonRes.count || 0, loading: false });
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return state;
}

/** "2 live now", "Starting soon", for the row's subtitle. */
export function liveStreamsLine({ live, soon }) {
  if (live) return `${live} live now. Watch, chat and get tracks reviewed`;
  if (soon) return `${soon} starting soon. Set a reminder`;
  return '';
}
