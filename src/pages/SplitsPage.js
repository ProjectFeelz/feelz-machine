// src/pages/SplitsPage.js
//
// Collaborator splits, both directions, at /splits.
//
//
// WHY THIS PAGE EXISTS
//
// Every sale of a track with collaborators writes a row to sale_splits, from
// netlify/functions/paypal-order.js and netlify/functions/paystack-webhook.js.
// Until migration 193 nothing in the app had ever read that table, so an
// owner saw "You Owe Collabs $0.68" on their Payments tab with no way to act
// on it, and a collaborator saw nothing at all: no list, no amounts, no way
// to say money arrived and no way to ask for it.
//
//
// THE THREE STATES, AND WHY THE PAGE INSISTS ON THEM
//
//   owed       the sale happened, nobody has acted
//   settled    the OWNER says they paid
//   confirmed  the COLLABORATOR says it arrived
//
// Feelz Machine never holds this money, so "paid" claimed by the person who
// owes it is a claim and not a fact. The page shows both halves and never
// collapses them into one word, because the gap between them is where a
// disagreement lives and flattening it would hide exactly the thing somebody
// needs to see.
//
// Nothing here writes the table directly. The three RPCs in migration 193
// each check that the caller IS the right artist, so a request forged in a
// console is refused by the database rather than by this file.

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Loader, Users, Check, Clock, Bell, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import useGoBack from '../hooks/useGoBack';

// What a row carries about the people and the track. The two artist joins are
// named because sale_splits points at artists twice and PostgREST cannot
// guess which is which.
const SELECT = `
  id, track_id, album_id, split_percent, sale_net, amount_owed, currency,
  created_at, settled_at, settled_by, confirmed_at, reminded_at, reminder_count,
  owner_artist_id, collaborator_artist_id,
  tracks ( title, slug, cover_artwork_url ),
  owner:artists!sale_splits_owner_artist_id_fkey ( artist_name, slug ),
  collaborator:artists!sale_splits_collaborator_artist_id_fkey ( artist_name, slug )
`;

const money = (amount, currency) =>
  `${currency === 'ZAR' ? 'R' : '$'}${Number(amount || 0).toFixed(2)}`;

const when = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function stateOf(row) {
  if (row.confirmed_at) return 'confirmed';
  if (row.settled_at)   return 'settled';
  return 'owed';
}

function StateBadge({ row }) {
  const s = stateOf(row);
  const styles = {
    owed:      'bg-amber-500/[0.12] border-amber-400/25 text-amber-200/90',
    settled:   'bg-sky-500/[0.12] border-sky-400/25 text-sky-200/90',
    confirmed: 'bg-emerald-500/[0.12] border-emerald-400/25 text-emerald-200/90',
  };
  const label = { owed: 'Owed', settled: 'Marked paid', confirmed: 'Confirmed' };
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${styles[s]}`}>
      {label[s]}
    </span>
  );
}

export default function SplitsPage() {
  const goBack = useGoBack('/profile');
  const { user } = useAuth();

  const [artistId, setArtistId]   = useState(null);
  const [owedToMe, setOwedToMe]   = useState([]);
  const [iOwe, setIOwe]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [busyId, setBusyId]       = useState(null);
  const [notice, setNotice]       = useState('');
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError('');

    const { data: me } = await supabase
      .from('artists').select('id').eq('user_id', user.id).maybeSingle();

    if (!me) { setArtistId(null); setLoading(false); return; }
    setArtistId(me.id);

    // Two queries rather than one with an `or`, because the two lists mean
    // different things and are acted on differently. A single list filtered
    // in the browser would also have to be re-filtered on every render.
    const [mine, theirs] = await Promise.all([
      supabase.from('sale_splits').select(SELECT)
        .eq('collaborator_artist_id', me.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('sale_splits').select(SELECT)
        .eq('owner_artist_id', me.id).order('created_at', { ascending: false }).limit(200),
    ]);

    if (mine.error || theirs.error) {
      setError('Could not load your splits. Try again in a moment.');
      setLoading(false);
      return;
    }

    setOwedToMe(mine.data || []);
    setIOwe(theirs.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // One handler for all three, because they differ only in which function is
  // called and what to say afterwards. Each reloads rather than patching
  // state: the database decides what happened, including when it refuses.
  const call = async (fn, row, onOk) => {
    setBusyId(row.id + fn);
    setNotice('');
    setError('');
    try {
      const { data, error: rpcErr } = await supabase.rpc(fn, { p_split_id: row.id });
      if (rpcErr) throw new Error(rpcErr.message);

      if (data && data.ok === false && data.reason === 'cooldown') {
        setNotice(`You can send another reminder after ${when(data.next_allowed_at)}.`);
      } else {
        setNotice(onOk);
        await load();
      }
    } catch (e) {
      setError(e.message || 'That did not go through.');
    } finally {
      setBusyId(null);
    }
  };

  const Row = ({ row, side }) => {
    const other = side === 'owed' ? row.owner : row.collaborator;
    const s = stateOf(row);
    const busy = (f) => busyId === row.id + f;

    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {row.tracks?.title || 'A track that has since been removed'}
            </p>
            <p className="text-xs text-white/40 mt-0.5 truncate">
              {side === 'owed' ? 'from' : 'to'} {other?.artist_name || 'an artist'}
              {' · '}{row.split_percent}% of {money(row.sale_net, row.currency)}
              {' · '}{when(row.created_at)}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-base font-bold text-white">{money(row.amount_owed, row.currency)}</p>
            <div className="mt-1"><StateBadge row={row} /></div>
          </div>
        </div>

        {/* What each side actually said, with dates. A single "paid" label
            would hide which of the two people said it. */}
        {(row.settled_at || row.confirmed_at || row.reminder_count > 0) && (
          <div className="mt-2.5 pt-2.5 border-t border-white/[0.05] space-y-1">
            {row.settled_at && (
              <p className="text-[11px] text-white/35">
                <Check className="w-3 h-3 inline mr-1 -mt-0.5" />
                {side === 'owed' ? 'They marked it paid' : 'You marked it paid'} on {when(row.settled_at)}
              </p>
            )}
            {row.confirmed_at && (
              <p className="text-[11px] text-emerald-300/60">
                <Check className="w-3 h-3 inline mr-1 -mt-0.5" />
                {side === 'owed' ? 'You confirmed it arrived' : 'They confirmed it arrived'} on {when(row.confirmed_at)}
              </p>
            )}
            {row.reminder_count > 0 && (
              <p className="text-[11px] text-white/30">
                <Bell className="w-3 h-3 inline mr-1 -mt-0.5" />
                {row.reminder_count} reminder{row.reminder_count === 1 ? '' : 's'}, last {when(row.reminded_at)}
              </p>
            )}
          </div>
        )}

        {/* Buttons only where there is something to do. */}
        {s !== 'confirmed' && (
          <div className="mt-3 flex gap-2">
            {side === 'owed' ? (
              <>
                <button
                  type="button"
                  disabled={busy('split_confirm_received')}
                  onClick={() => call('split_confirm_received', row, 'Marked as received. Thank you.')}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-500/15 border border-emerald-400/25 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50 transition"
                >
                  {busy('split_confirm_received') ? 'Saving…' : 'I received this'}
                </button>
                <button
                  type="button"
                  disabled={busy('split_remind_owner')}
                  onClick={() => call('split_remind_owner', row, 'Reminder sent.')}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-white/[0.06] border border-white/10 text-white/70 hover:bg-white/[0.1] disabled:opacity-50 transition"
                >
                  {busy('split_remind_owner') ? 'Sending…' : 'Remind'}
                </button>
              </>
            ) : (
              s === 'owed' && (
                <button
                  type="button"
                  disabled={busy('split_mark_settled')}
                  onClick={() => call('split_mark_settled', row, 'Marked as paid. They have been told.')}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-white/[0.08] border border-white/15 text-white hover:bg-white/[0.14] disabled:opacity-50 transition"
                >
                  {busy('split_mark_settled') ? 'Saving…' : "I've paid this"}
                </button>
              )
            )}
          </div>
        )}

        {/* The owner's side, once they have claimed payment. Said plainly so
            nobody reads "marked paid" as "done". */}
        {side === 'owe' && s === 'settled' && (
          <p className="mt-2.5 text-[11px] text-white/35">Waiting for them to confirm it arrived.</p>
        )}
      </div>
    );
  };

  const total = (rows, pred) =>
    rows.filter(pred).reduce((sum, r) => sum + Number(r.amount_owed || 0), 0);

  const owedOutstanding = total(owedToMe, r => !r.confirmed_at);
  const oweOutstanding  = total(iOwe,     r => !r.confirmed_at);

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <Helmet>
        <title>Splits · Feelz Machine</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="px-5 md:px-8 pt-8 max-w-3xl mx-auto">
        <button
          onClick={() => goBack()}
          className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <h1 className="text-2xl font-black text-white leading-tight">Splits</h1>
        <p className="text-sm text-white/45 mt-1.5 leading-relaxed">
          When a track with collaborators sells, the buyer pays the track owner and the owner pays
          their collaborators directly. Feelz Machine records every share and never holds the money.
          This is that record, both ways.
        </p>

        {notice && (
          <div className="mt-4 px-3.5 py-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-400/20">
            <p className="text-xs text-emerald-100/80">{notice}</p>
          </div>
        )}
        {error && (
          <div className="mt-4 px-3.5 py-3 rounded-xl bg-red-500/[0.08] border border-red-400/20 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-100/80">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
        ) : !artistId ? (
          <div className="py-20 text-center">
            <Users className="w-9 h-9 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/40">Splits belong to an artist account.</p>
          </div>
        ) : (
          <>
            <section className="mt-8">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">Owed to you</h2>
                {owedOutstanding > 0 && (
                  <span className="text-xs text-amber-200/70">
                    {money(owedOutstanding, owedToMe[0]?.currency)} outstanding
                  </span>
                )}
              </div>
              {owedToMe.length === 0 ? (
                <p className="text-xs text-white/30 py-6">
                  Nothing yet. A share appears here the moment a track you are credited on sells.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {owedToMe.map(row => <Row key={row.id} row={row} side="owed" />)}
                </div>
              )}
            </section>

            <section className="mt-10">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">You owe</h2>
                {oweOutstanding > 0 && (
                  <span className="text-xs text-amber-200/70">
                    {money(oweOutstanding, iOwe[0]?.currency)} outstanding
                  </span>
                )}
              </div>
              {iOwe.length === 0 ? (
                <p className="text-xs text-white/30 py-6">
                  Nothing owed. This fills when a track of yours with collaborators sells.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {iOwe.map(row => <Row key={row.id} row={row} side="owe" />)}
                </div>
              )}
            </section>

            <div className="mt-10 rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-white/40" />
                How a split closes
              </h3>
              <div className="space-y-2 text-xs text-white/40 leading-relaxed">
                <p>The owner pays their collaborator directly, however the two of them usually settle up, then marks it here.</p>
                <p>Marking it paid tells the collaborator to expect it. It is not the end: the split closes when the collaborator confirms the money arrived, because only they can know that.</p>
                <p>A collaborator can confirm a payment the owner never marked, and can send a reminder once every three days while a share is outstanding.</p>
              </div>
              <Link to="/profile?tab=payments" className="inline-block mt-3 text-xs text-purple-300/80 hover:text-purple-200">
                Payment settings →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}