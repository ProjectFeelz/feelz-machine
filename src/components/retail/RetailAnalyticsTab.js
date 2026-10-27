// src/components/retail/RetailAnalyticsTab.js
//
// What venues actually played, and which of it counted.
//
// retail_play_logs is written by the venue player every time a track finishes
// or is cut short. Nothing has ever read it. That table is the evidence base
// for the entire artist pool: close_retail_payout_period() divides the money
// by qualifying plays, so a play that does not qualify is an artist not being
// paid for it. Until now there was no screen that said which plays those were,
// or why.
//
//
// WHY `qualifies` IS THE COLUMN THAT MATTERS
//
// Every row carries `qualifies` and, when false, `not_qualifying_reason`. A
// play that ran for eight seconds because somebody skipped it should not earn
// the same as one that played out in a shop. That is correct, and it is also
// the number an artist will query, so the reason is shown here per row rather
// than buried.
//
// If the qualifying rate drops, the artist pool shrinks without the revenue
// changing, and nobody would see why. That is the thing this page exists to
// make visible.
//
//
// READ-ONLY, LIKE PAYOUTS
//
// Nothing here writes. Play logs are a record of something that happened; an
// admin editing them would be editing the basis on which money is divided.

import React from 'react';
import { Loader, BarChart3, AlertTriangle, Music, Store, Info } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const WINDOWS = [7, 30, 90];

const when = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  : '—';

const mins = (secs) => {
  const s = Number(secs || 0);
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function RetailAnalyticsTab({ showToast }) {
  const [days, setDays]       = React.useState(30);
  const [rows, setRows]       = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError]     = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');

    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Joined rather than counted in SQL because the volume is tiny and the
    // page wants the names. If retail ever puts more than a thousand plays in
    // a window this has to move to an RPC: PostgREST clamps a response at
    // 1000 rows whatever the limit says, and a silently truncated play count
    // is a silently wrong payout basis. The banner below says so when it is
    // close, rather than leaving it to be discovered.
    const { data, error: err } = await supabase
      .from('retail_play_logs')
      .select('id, played_at, duration_played, qualifies, not_qualifying_reason, '
            + 'tracks(title, artists(artist_name)), '
            + 'retail_venues(business_name), '
            + 'retail_playlists(title)')
      .gte('played_at', since)
      .order('played_at', { ascending: false })
      .limit(1000);

    if (err) {
      setError(`Could not load play logs: ${err.message}`);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [days]);

  React.useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>;
  }

  const total      = rows.length;
  const qualifying = rows.filter(r => r.qualifies).length;
  const rate       = total ? Math.round((qualifying / total) * 100) : 0;
  const atCap      = total >= 1000;

  // Group by the three things somebody actually asks about.
  const byTrack  = tally(rows, r => r.tracks
    ? `${r.tracks.title} — ${r.tracks.artists?.artist_name || 'Unknown'}` : 'Unknown track');
  const byVenue  = tally(rows, r => r.retail_venues?.business_name || 'Unknown venue');
  const byReason = tally(rows.filter(r => !r.qualifies),
    r => r.not_qualifying_reason || 'No reason recorded');

  return (
    <div className="space-y-5">

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-100/80">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {WINDOWS.map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              days === d ? 'bg-white/[0.14] text-white' : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'
            }`}>
            {d} days
          </button>
        ))}
      </div>

      {atCap && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-100/80">
            This window hit the 1,000 row response cap, so the figures below are a sample, not a
            total. The payout job counts in the database and is unaffected, but this page needs
            moving to an aggregate before you trust these numbers.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Plays logged" value={total.toLocaleString()} />
        <Tile label="Qualifying" value={qualifying.toLocaleString()} />
        <Tile label="Qualifying rate" value={`${rate}%`}
              tone={total === 0 ? undefined : rate < 60 ? 'text-amber-200' : 'text-emerald-200'} />
        <Tile label="Venues playing" value={byVenue.length} />
      </div>

      {total === 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-400/20 bg-sky-500/[0.06] p-3.5">
          <Info className="w-4 h-4 text-sky-300 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-sky-100/85">
            No plays logged in this window. The venue player writes a row here every time a track
            finishes or is cut short, so this fills up once a venue is live.
          </p>
        </div>
      ) : (
        <>
          {/* The reasons come first on purpose: a play that did not qualify is
              an artist who was not paid for it, and that is the thing worth
              noticing before the leaderboards. */}
          {byReason.length > 0 && (
            <Panel icon={AlertTriangle} title="Why plays did not qualify"
                   sub="Each of these is a play that earned an artist nothing.">
              <Bars rows={byReason} total={total - qualifying} />
            </Panel>
          )}

          <Panel icon={Music} title="Most played tracks"
                 sub="Across every venue in this window.">
            <Bars rows={byTrack.slice(0, 12)} total={total} />
          </Panel>

          <Panel icon={Store} title="By venue" sub="Who is actually playing music.">
            <Bars rows={byVenue} total={total} />
          </Panel>

          <Panel icon={BarChart3} title="Recent plays" sub="Newest first.">
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {['When', 'Track', 'Venue', 'Played', 'Counted'].map((h, i) => (
                      <th key={h} className={`pb-2 text-xs font-semibold text-white/35 ${i === 0 ? 'text-left' : i === 3 || i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 40).map(r => (
                    <tr key={r.id} className="border-t border-white/[0.05]">
                      <td className="py-2.5 text-white/50 whitespace-nowrap">{when(r.played_at)}</td>
                      <td className="py-2.5 text-white/80">
                        {r.tracks?.title || 'Unknown'}
                        <span className="text-white/30"> · {r.tracks?.artists?.artist_name || 'Unknown'}</span>
                      </td>
                      <td className="py-2.5 text-white/50">{r.retail_venues?.business_name || '—'}</td>
                      <td className="py-2.5 text-right text-white/60 tabular-nums">{mins(r.duration_played)}</td>
                      <td className="py-2.5 text-right">
                        {r.qualifies
                          ? <span className="text-xs text-emerald-200/80">Yes</span>
                          : <span className="text-xs text-amber-200/70">
                              {r.not_qualifying_reason || 'No'}
                            </span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 40 && (
                <p className="text-xs text-white/25 mt-3">
                  Showing the newest 40 of {rows.length.toLocaleString()} plays in this window.
                </p>
              )}
            </div>
          </Panel>
        </>
      )}

      <p className="text-xs text-white/25 leading-relaxed pt-2">
        Qualifying plays are what the artist pool is divided by, so this is the basis the payout
        figures are built on. Nothing on this page can be edited: a play log is a record of
        something that happened.
      </p>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function tally(rows, keyOf) {
  const m = new Map();
  rows.forEach(r => {
    const k = keyOf(r);
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function Panel({ icon: Icon, title, sub, children }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-white/30" />
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>
      {sub && <p className="text-xs text-white/30 mb-4">{sub}</p>}
      {children}
    </div>
  );
}

// A bar per row, width as a share of the total. Drawn rather than tabulated
// because the only question here is "which is biggest", and a bar answers that
// without the reader comparing numbers in their head.
function Bars({ rows, total }) {
  if (!rows.length) return <p className="text-sm text-white/35">Nothing in this window.</p>;
  const max = Math.max(...rows.map(r => r.count), 1);
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <p className="text-xs text-white/70 truncate">{r.label}</p>
              <p className="text-xs text-white/40 tabular-nums flex-shrink-0">
                {r.count}
                {total > 0 && <span className="text-white/25"> · {Math.round((r.count / total) * 100)}%</span>}
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-purple-400/60"
                   style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Tile({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.03] p-4">
      <p className="text-xs text-white/40 mb-1.5">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone || 'text-white'}`}>{value}</p>
    </div>
  );
}
