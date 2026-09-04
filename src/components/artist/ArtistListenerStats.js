// src/components/artist/ArtistListenerStats.js
// Where an artist sees who is listening, so they can plan campaigns.
//
// Lives inside the dashboard's Analytics tab rather than as its own page.
// It was briefly a separate page with its own hub row, which meant two
// nav entries and two places to look for artist stats. Stats belong in
// one place.
//
// Everything here comes from get_artist_listener_stats, a SECURITY
// DEFINER function returning counts only. Raw listening_events rows are
// never exposed: they carry per-play city-level location for named
// listeners, and an artist seeing that would be surveillance rather than
// analytics. Groups smaller than the function's minimum are suppressed
// for the same reason, so a city with one listener cannot identify them.
//
// The page is deliberately explicit about where each number comes from
// and how far back it goes. Play counts run on full history from
// `streams`. Completion and location come from `listening_events`, which
// only began at deployment and is capped at 90 days retention. Presenting
// those as one number would quietly mislead.

import React from 'react';
import { Loader, Download, MapPin, Smartphone, Radio, BarChart3, Info } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const WINDOWS = [
  { days: 7,   label: '7 days'  },
  { days: 30,  label: '30 days' },
  { days: 90,  label: '90 days' },
];

function Bar({ name, sub, plays, total }) {
  const pct = total > 0 ? Math.round((plays / total) * 100) : 0;
  return (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-sm text-white truncate">
          {name}
          {sub && <span className="text-white/30 text-xs ml-1.5">{sub}</span>}
        </p>
        <p className="text-xs text-white/40 flex-shrink-0 ml-3">{plays} · {pct}%</p>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full bg-purple-500/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children, empty, note }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-white/30" />
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide">{title}</p>
      </div>
      {note && <p className="text-[11px] text-white/25 mb-3">{note}</p>}
      {empty
        ? <p className="text-sm text-white/25 py-6 text-center">{empty}</p>
        : <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function ArtistListenerStats({ artistId, artistName }) {
  const [days, setDays] = React.useState(30);
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!artistId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    supabase.rpc('get_artist_listener_stats', { p_artist_id: artistId, p_days: days })
      .then(({ data, error: rpcError }) => {
        if (rpcError) setError('Could not load your stats. Try again shortly.');
        else setStats(data);
        setLoading(false);
      });
  }, [artistId, days]);

  // Built in the browser from what the function already returned. No
  // second query, and nothing here that is not already on screen.
  const exportCsv = () => {
    if (!stats) return;
    const rows = [['section', 'name', 'detail', 'plays']];
    (stats.by_country || []).forEach(r => rows.push(['country', r.name || '', r.code || '', r.plays]));
    (stats.by_city    || []).forEach(r => rows.push(['city',    r.name || '', r.country || '', r.plays]));
    (stats.by_device  || []).forEach(r => rows.push(['device',  r.name || '', '', r.plays]));
    (stats.by_source  || []).forEach(r => rows.push(['source',  r.name || '', '', r.plays]));
    (stats.daily      || []).forEach(r => rows.push(['daily',   r.day  || '', '', r.plays]));

    const csv = rows
      .map(r => r.map(cell => {
        const v = String(cell ?? '');
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(artistName || 'artist').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-listeners-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPlays   = stats?.plays?.total || 0;
  const deviceTotal  = (stats?.by_device  || []).reduce((s, r) => s + r.plays, 0);
  const sourceTotal  = (stats?.by_source  || []).reduce((s, r) => s + r.plays, 0);
  const countryTotal = (stats?.by_country || []).reduce((s, r) => s + r.plays, 0);
  const cityTotal    = (stats?.by_city    || []).reduce((s, r) => s + r.plays, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Your listeners</p>
          <p className="text-xs text-white/30 truncate">Who is listening, and where.</p>
        </div>
        <button onClick={exportCsv} disabled={!stats}
          className="flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-full bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white transition flex-shrink-0 disabled:opacity-30">
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {WINDOWS.map(w => (
          <button key={w.days} onClick={() => setDays(w.days)}
            className={`text-xs font-semibold px-3.5 py-1.5 rounded-full transition ${
              days === w.days ? 'bg-purple-500 text-white' : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1]'
            }`}>
            {w.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
      ) : error ? (
        <p className="text-sm text-red-400 py-8 text-center">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-2xl font-black text-white">{totalPlays.toLocaleString()}</p>
              <p className="text-xs text-white/40 mt-0.5">Plays</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-2xl font-black text-white">{(stats?.plays?.unique_listeners || 0).toLocaleString()}</p>
              <p className="text-xs text-white/40 mt-0.5">Listeners</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-2xl font-black text-white">
                {stats?.completion ? `${stats.completion.avg_pct}%` : '--'}
              </p>
              <p className="text-xs text-white/40 mt-0.5">Avg completion</p>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-2xl font-black text-white">
                {stats?.completion ? `${stats.completion.finished_pct}%` : '--'}
              </p>
              <p className="text-xs text-white/40 mt-0.5">Played to the end</p>
            </div>
          </div>

          {!stats?.completion && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 mb-6 flex items-start gap-3">
              <Info className="w-4 h-4 text-white/25 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-white/40 leading-relaxed">
                Completion and location need at least a few plays recorded since this
                started tracking. Play counts below cover your full history, but
                completion and location only describe plays from when tracking began,
                and go back at most 90 days.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Countries" icon={MapPin}
              note="Where your music is being played."
              empty={countryTotal === 0 ? 'No location data yet.' : null}>
              {(stats?.by_country || []).map(r => (
                <Bar key={r.code || r.name} name={r.name || 'Unknown'} plays={r.plays} total={countryTotal} />
              ))}
            </Panel>

            <Panel title="Cities" icon={MapPin}
              note="Small groups are hidden to protect listener privacy."
              empty={cityTotal === 0 ? 'No location data yet.' : null}>
              {(stats?.by_city || []).map(r => (
                <Bar key={`${r.name}-${r.country}`} name={r.name} sub={r.country} plays={r.plays} total={cityTotal} />
              ))}
            </Panel>

            <Panel title="Devices" icon={Smartphone}
              empty={deviceTotal === 0 ? 'No plays in this window.' : null}>
              {(stats?.by_device || []).map(r => (
                <Bar key={r.name} name={r.name} plays={r.plays} total={deviceTotal} />
              ))}
            </Panel>

            <Panel title="Where plays came from" icon={Radio}
              note="Includes Retail, which is venues playing your music in their space."
              empty={sourceTotal === 0 ? 'No plays in this window.' : null}>
              {(stats?.by_source || []).map(r => (
                <Bar key={r.name} name={r.name} plays={r.plays} total={sourceTotal} />
              ))}
            </Panel>
          </div>

          {stats?.completion && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-white/30" />
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">How far people listen</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xl font-black text-white">{stats.completion.finished_pct}%</p>
                  <p className="text-xs text-white/40">Played to the end</p>
                </div>
                <div>
                  <p className="text-xl font-black text-white">{stats.completion.abandoned_pct}%</p>
                  <p className="text-xs text-white/40">Left in the first 10%</p>
                </div>
                <div>
                  <p className="text-xl font-black text-white">{stats.completion.avg_seconds}s</p>
                  <p className="text-xs text-white/40">Average listen</p>
                </div>
              </div>
              <p className="text-[11px] text-white/25 mt-3">
                Based on {stats.events_sampled} recorded plays.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}