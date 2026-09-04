// src/components/retail/VenueActivity.js
// Whether each paying venue is actually playing anything.
//
// Kept as its own component rather than living inside a page, because the
// tabbed retail admin panel is currently missing from the repo and will
// be restored from git. When it comes back this can be dropped into it
// without being rewritten.
//
// Three states, from two signals:
//   playing   a play was logged in the last 15 minutes
//   idle      the player is open (heartbeat) but nothing has played
//   offline   neither
//
// The distinction matters. A venue paused for an afternoon is a different
// conversation from a venue that has not opened the player since signup,
// and measuring plays alone cannot tell them apart.

import React from 'react';
import { Loader, Store, Circle } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const STATES = {
  playing: { label: 'Playing', dot: 'text-lime-400',   text: 'text-lime-300'  },
  idle:    { label: 'Idle',    dot: 'text-amber-400',  text: 'text-amber-300' },
  offline: { label: 'Offline', dot: 'text-white/25',   text: 'text-white/40'  },
};

function timeAgo(ts) {
  if (!ts) return 'never';
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function VenueActivity() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_venue_activity');
    if (rpcError) setError(rpcError.message);
    else setRows(data || []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
    // Refresh while the tab is open. This is a monitoring view, so a stale
    // "playing" badge would be worse than useless.
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  // Active venues that have not played in a week. The number worth acting
  // on: they are paying and getting nothing out of it.
  const stalled = rows.filter(r =>
    r.status === 'active' &&
    (!r.last_played_at || Date.now() - new Date(r.last_played_at).getTime() > 7 * 86400000)
  );

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Venue activity</p>
        {!loading && rows.length > 0 && (
          <p className="text-xs text-white/30">
            {rows.filter(r => r.activity === 'playing').length} playing now
          </p>
        )}
      </div>

      {stalled.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 mb-3">
          <p className="text-sm font-bold text-amber-200">
            {stalled.length} active venue{stalled.length !== 1 ? 's' : ''} played nothing this week
          </p>
          <p className="text-xs text-amber-100/60 mt-1">
            {stalled.map(v => v.business_name).join(', ')}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
      ) : error ? (
        <p className="text-sm text-red-400 py-4">Could not load venue activity: {error}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center">
          <Store className="w-6 h-6 text-white/10 mx-auto mb-2" />
          <p className="text-sm text-white/40">No venues yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {rows.map(v => {
            const state = STATES[v.activity] || STATES.offline;
            return (
              <div key={v.venue_id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-white truncate">{v.business_name}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Circle className={`w-2 h-2 ${state.dot}`} fill="currentColor" />
                    <span className={`text-[11px] font-semibold ${state.text}`}>{state.label}</span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] text-white/35">
                    Last played {timeAgo(v.last_played_at)}
                  </p>
                  <p className="text-[11px] text-white/25">
                    {v.plays_7d} play{v.plays_7d !== 1 ? 's' : ''} in 7 days
                    {v.status !== 'active' && ` · ${v.status}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}