// src/components/retail/RetailPayoutsTab.js
//
// Where Feelz Retail money goes, and why.
//
// Two payout periods have already closed and paid nobody. That is arithmetically
// correct, there is no retail subscription or ad revenue yet so the artist pool
// was zero, but nothing anywhere said so. A period closed silently, produced no
// shares, and left no trace a person could look at. The first artist to ask
// "what did I earn from Retail last month" had no answer and neither did you.
//
// This reads that out. It does not move money.
//
//
// WHY READ-ONLY, DELIBERATELY
//
// netlify/functions/retail-artist-payouts.js is the only thing that pays. It
// claims rows before sending, refuses a repeated PayPal sender_batch_id, counts
// attempts, and stops after three failures for a person to look at. Every one
// of those guarantees depends on it being the single writer.
//
// A "pay now" button here would be a second writer with none of that, racing a
// nightly job over the same rows. So this panel explains and does not act. The
// one thing it adds is the explanation the job cannot give: a period with no
// pool, a share with no PayPal email, a batch that failed twice.
//
//
// THE SPLIT, FOR READING THE NUMBERS BELOW
//
// close_retail_payout_period() (migration 145) shares 50% of net retail
// subscription money plus 30% of ad revenue across qualifying plays, to the
// cent. Anything that will not divide is carried into the next period rather
// than rounded away, which is what carried_in and carried_into are.

import React from 'react';
import { Loader, Wallet, AlertTriangle, Info, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const money = (n, c = 'USD') =>
  `${c === 'ZAR' ? 'R' : '$'}${Number(n || 0).toFixed(2)}`;

const when = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

const monthLabel = (p) => {
  if (p.month) return p.month;
  if (!p.period_start) return 'Unknown period';
  return new Date(p.period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

// What a share's status means to somebody who did not write the payout job.
const SHARE_STATUS = {
  pending:    { label: 'Waiting to send',  tone: 'text-amber-200/80',   Icon: Clock },
  processing: { label: 'Sent to PayPal',   tone: 'text-sky-200/80',     Icon: Loader },
  paid:       { label: 'Paid',             tone: 'text-emerald-200/80', Icon: CheckCircle2 },
  failed:     { label: 'Failed',           tone: 'text-red-300/80',     Icon: AlertTriangle },
  held:       { label: 'No PayPal email',  tone: 'text-amber-200/80',   Icon: AlertTriangle },
};

export default function RetailPayoutsTab({ showToast }) {
  const [periods, setPeriods] = React.useState([]);
  const [shares, setShares]   = React.useState({});   // period_id -> rows
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen]       = React.useState(null);
  const [error, setError]     = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');

    const [periodRes, shareRes] = await Promise.all([
      supabase
        .from('retail_payout_periods')
        .select('*')
        .order('period_start', { ascending: false })
        .limit(60),
      // Every share, joined to the artist so the table reads as names rather
      // than uuids. Capped well under the 1000 row response limit; a period
      // with more payees than this would need paging, and saying so here is
      // cheaper than finding out later that the last artist is missing.
      supabase
        .from('retail_artist_payouts')
        .select('*, artists(artist_name)')
        .order('amount', { ascending: false })
        .limit(900),
    ]);

    // Read, not discarded. An empty table and a refused query look identical
    // otherwise, and on a money screen that is the worst possible ambiguity.
    if (periodRes.error) {
      setError(`Could not load payout periods: ${periodRes.error.message}`);
      setPeriods([]); setShares({}); setLoading(false);
      return;
    }
    if (shareRes.error) {
      setError(`Periods loaded, but the artist shares did not: ${shareRes.error.message}`);
    }

    const byPeriod = {};
    (shareRes.data || []).forEach(r => {
      (byPeriod[r.period_id] = byPeriod[r.period_id] || []).push(r);
    });

    setPeriods(periodRes.data || []);
    setShares(byPeriod);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>;
  }

  const totals = periods.reduce((acc, p) => {
    acc.pool += Number(p.artist_pool || 0);
    acc.plays += Number(p.total_qualifying_plays || 0);
    return acc;
  }, { pool: 0, plays: 0 });

  const allShares = Object.values(shares).flat();
  const unpaid = allShares.filter(s => s.status && s.status !== 'paid');

  return (
    <div className="space-y-5">

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-100/80">{error}</p>
        </div>
      )}

      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Periods closed" value={periods.filter(p => p.status === 'closed').length} />
        <Tile label="Paid to artists, all time" value={money(totals.pool)} />
        <Tile label="Qualifying plays" value={totals.plays.toLocaleString()} />
        <Tile label="Shares not yet paid" value={unpaid.length}
              tone={unpaid.length > 0 ? 'text-amber-200' : undefined} />
      </div>

      {/* ── The thing nobody was told ───────────────────────────────────── */}
      {periods.length > 0 && allShares.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-400/20 bg-sky-500/[0.06] p-3.5">
          <Info className="w-4 h-4 text-sky-300 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-sky-100/85">
              {periods.length === 1 ? 'A period has' : `${periods.length} periods have`} closed
              and paid nobody.
            </p>
            <p className="text-xs text-sky-100/50 mt-1.5 leading-relaxed">
              The artist pool is half of net retail subscription money plus 30% of ad revenue.
              Both are zero so far, so there was nothing to share and no shares were written.
              That is the sum working, not a failure. It starts paying the month a venue pays.
            </p>
          </div>
        </div>
      )}

      {/* ── Periods ─────────────────────────────────────────────────────── */}
      {periods.length === 0 ? (
        <p className="text-sm text-white/40 py-8 text-center">No payout period has been closed yet.</p>
      ) : periods.map(p => {
        const rows = shares[p.id] || [];
        const isOpen = open === p.id;
        return (
          <div key={p.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">

            <button
              onClick={() => setOpen(isOpen ? null : p.id)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition">
              <Wallet className="w-4 h-4 text-white/30 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-white">{monthLabel(p)}</p>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                    p.status === 'closed'
                      ? 'bg-emerald-500/[0.12] text-emerald-200/90'
                      : 'bg-white/[0.08] text-white/60'
                  }`}>{p.status || 'open'}</span>
                </div>
                <p className="text-xs text-white/35 mt-0.5">
                  {when(p.period_start)} to {when(p.period_end)}
                  {p.closed_at ? ` · closed ${when(p.closed_at)}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-white tabular-nums">{money(p.artist_pool)}</p>
                <p className="text-[11px] text-white/30 tabular-nums">
                  {Number(p.total_qualifying_plays || 0).toLocaleString()} plays
                </p>
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-white/[0.05] pt-4">

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Mini label="Subscriptions in" value={money(p.subscription_revenue)} />
                  <Mini label="Ad revenue in"    value={money(p.ad_revenue)} />
                  <Mini label="Net revenue"      value={money(p.net_revenue)} />
                  <Mini label="Artist pool"      value={money(p.artist_pool)} />
                </div>

                {/* Carry is the part that looks like missing money if nobody
                    explains it, so it is only shown when it is non-zero. */}
                {(Number(p.carried_in || 0) !== 0 || Number(p.carried_into || 0) !== 0
                  || Number(p.undistributed || 0) !== 0) && (
                  <div className="grid grid-cols-3 gap-3">
                    <Mini label="Carried in"   value={money(p.carried_in)} />
                    <Mini label="Undistributed" value={money(p.undistributed)} />
                    <Mini label="Carried out"  value={money(p.carried_into)} />
                  </div>
                )}

                {rows.length === 0 ? (
                  <p className="text-xs text-white/35">
                    No artist shares for this period. With an artist pool of {money(p.artist_pool)} there
                    was nothing to divide.
                  </p>
                ) : (
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          {['Artist', 'Plays', 'Share', 'Amount', 'Status'].map((h, i) => (
                            <th key={h} className={`pb-2 text-xs font-semibold text-white/35 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(s => {
                          const meta = SHARE_STATUS[s.status] || { label: s.status || 'unknown', tone: 'text-white/50', Icon: Info };
                          const { Icon } = meta;
                          return (
                            <tr key={s.id} className="border-t border-white/[0.05] align-top">
                              <td className="py-2.5 text-white/80">
                                {s.artists?.artist_name || 'Unknown artist'}
                                {/* The two things that stop a share being paid,
                                    said plainly rather than left in a column
                                    nobody reads. */}
                                {!s.paypal_email && (
                                  <p className="text-[11px] text-amber-200/60 mt-0.5">No PayPal email on file</p>
                                )}
                                {Number(s.attempts || 0) >= 3 && (
                                  <p className="text-[11px] text-red-300/70 mt-0.5">
                                    Stopped after {s.attempts} failed attempts, needs a person
                                  </p>
                                )}
                                {s.note && <p className="text-[11px] text-white/30 mt-0.5">{s.note}</p>}
                              </td>
                              <td className="py-2.5 text-right text-white/60 tabular-nums">
                                {Number(s.play_count || 0).toLocaleString()}
                              </td>
                              <td className="py-2.5 text-right text-white/60 tabular-nums">
                                {s.share_pct != null ? `${Number(s.share_pct).toFixed(1)}%` : '—'}
                              </td>
                              <td className="py-2.5 text-right text-white font-semibold tabular-nums">
                                {money(s.amount)}
                              </td>
                              <td className={`py-2.5 text-right ${meta.tone}`}>
                                <span className="inline-flex items-center gap-1.5 text-xs">
                                  <Icon className="w-3 h-3" />
                                  {meta.label}
                                </span>
                                {s.paid_at && (
                                  <p className="text-[11px] text-white/25 mt-0.5">{when(s.paid_at)}</p>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-xs text-white/25 leading-relaxed pt-2">
        Payouts are sent by the nightly job, not from this screen. It claims each share before
        sending and PayPal refuses a repeated batch reference, so a share cannot be paid twice.
        Adding a button here would put a second writer on the same rows and lose that.
      </p>
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

function Mini({ label, value }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
      <p className="text-[11px] text-white/35 mb-1">{label}</p>
      <p className="text-sm font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}
