// src/components/retail/RetailPricingTab.js
//
// What to charge a venue, by the kind of place it is.
//
// retail_price_guide has existed empty since the schema was written. It is
// reference material, not billing: nothing reads it, no venue is charged from
// it, and changing a band here never changes what anybody pays. What it is for
// is the moment somebody is on the phone to a coffee shop and has to say a
// number, and the only alternative is guessing or scrolling back through what
// the last venue was charged.
//
//
// SAME UNIT AS THE VENUE FEE, ON PURPOSE
//
// The Venues tab sets retail_subscriptions.monthly_fee and prints it as
// "$<n> / month". A price guide in a different currency to the field it is
// guiding would be worse than no guide at all, so these are dollars per month
// too. If retail ever prices in rand, both have to move together.
//
//
// SORT ORDER IS AN INTEGER, AND IT IS DELIBERATE
//
// Bands read best cheapest-first, but "cheapest" is not always the order you
// want to show a salesperson. sort_order is kept editable rather than derived
// from the fee, so the list can be arranged the way the conversation goes.

import React from 'react';
import { Loader, Plus, Trash2, Pencil, Check, X, Tag, Info } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const inputCls = "w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition";

const money = (n) => (n == null || n === '' ? '—' : `$${Number(n).toFixed(0)}`);

const band = (lo, hi) => {
  if (lo == null && hi == null) return '—';
  if (lo != null && hi != null) return `${money(lo)} – ${money(hi)}`;
  return money(lo ?? hi);
};

const EMPTY = { venue_type: '', suggested_fee_min: '', suggested_fee_max: '', notes: '', sort_order: '' };

export default function RetailPricingTab({ showToast }) {
  const [rows, setRows]       = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError]     = React.useState('');
  const [draft, setDraft]     = React.useState(EMPTY);
  const [saving, setSaving]   = React.useState(false);
  const [editing, setEditing] = React.useState(null);     // row id
  const [editDraft, setEditDraft] = React.useState(EMPTY);
  const [busy, setBusy]       = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('retail_price_guide')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('suggested_fee_min', { ascending: true });

    // Read, not discarded. An empty guide and a refused query look identical
    // on screen otherwise, and this table starts empty.
    if (err) { setError(`Could not load the price guide: ${err.message}`); setRows([]); }
    else     { setRows(data || []); }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // One validator for add and edit, so a row cannot be created valid and then
  // edited into a state the create would have refused.
  const problem = (d) => {
    if (!d.venue_type.trim()) return 'Give the venue type a name';
    const lo = d.suggested_fee_min === '' ? null : parseFloat(d.suggested_fee_min);
    const hi = d.suggested_fee_max === '' ? null : parseFloat(d.suggested_fee_max);
    if (lo !== null && (Number.isNaN(lo) || lo < 0)) return 'The low end must be a number, zero or more';
    if (hi !== null && (Number.isNaN(hi) || hi < 0)) return 'The high end must be a number, zero or more';
    if (lo === null && hi === null) return 'Give at least one end of the range';
    if (lo !== null && hi !== null && hi < lo) return 'The high end cannot be below the low end';
    return null;
  };

  const toRow = (d) => ({
    venue_type:        d.venue_type.trim(),
    suggested_fee_min: d.suggested_fee_min === '' ? null : parseFloat(d.suggested_fee_min),
    suggested_fee_max: d.suggested_fee_max === '' ? null : parseFloat(d.suggested_fee_max),
    notes:             d.notes.trim() || null,
    sort_order:        d.sort_order === '' ? null : parseInt(d.sort_order, 10),
  });

  const add = async () => {
    const bad = problem(draft);
    if (bad) { showToast(bad); return; }
    setSaving(true);
    const { error: err } = await supabase.from('retail_price_guide').insert(toRow(draft));
    setSaving(false);
    if (err) { showToast('Not added: ' + err.message); return; }
    setDraft(EMPTY);
    showToast('Band added');
    load();
  };

  const saveEdit = async (id) => {
    const bad = problem(editDraft);
    if (bad) { showToast(bad); return; }
    setBusy(id);
    const { error: err } = await supabase.from('retail_price_guide').update(toRow(editDraft)).eq('id', id);
    setBusy(null);
    if (err) { showToast('Not saved: ' + err.message); return; }
    setEditing(null);
    showToast('Saved');
    load();
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove the "${row.venue_type}" band? This is reference only, no venue is billed from it.`)) return;
    setBusy(row.id);
    const { error: err } = await supabase.from('retail_price_guide').delete().eq('id', row.id);
    setBusy(null);
    if (err) { showToast('Not removed: ' + err.message); return; }
    showToast('Band removed');
    load();
  };

  const startEdit = (row) => {
    setEditing(row.id);
    setEditDraft({
      venue_type:        row.venue_type || '',
      suggested_fee_min: row.suggested_fee_min ?? '',
      suggested_fee_max: row.suggested_fee_max ?? '',
      notes:             row.notes || '',
      sort_order:        row.sort_order ?? '',
    });
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>;
  }

  return (
    <div className="space-y-5">

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5">
          <Info className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-100/80">{error}</p>
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-xl border border-sky-400/20 bg-sky-500/[0.06] p-3.5">
        <Info className="w-4 h-4 text-sky-300 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-sky-100/70 leading-relaxed">
          Reference only. Nothing is billed from this page. The number a venue actually pays is set
          on its own row in Venues, in the same dollars per month used here.
        </p>
      </div>

      {/* ── Add ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="text-sm font-semibold text-white mb-3">Add a band</p>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
          <input className={`${inputCls} lg:col-span-2`} placeholder="Venue type, e.g. Coffee shop"
                 value={draft.venue_type}
                 onChange={e => setDraft(d => ({ ...d, venue_type: e.target.value }))} />
          <input className={inputCls} type="number" min="0" placeholder="Low $"
                 value={draft.suggested_fee_min}
                 onChange={e => setDraft(d => ({ ...d, suggested_fee_min: e.target.value }))} />
          <input className={inputCls} type="number" min="0" placeholder="High $"
                 value={draft.suggested_fee_max}
                 onChange={e => setDraft(d => ({ ...d, suggested_fee_max: e.target.value }))} />
          <input className={inputCls} type="number" placeholder="Order"
                 value={draft.sort_order}
                 onChange={e => setDraft(d => ({ ...d, sort_order: e.target.value }))} />
        </div>
        <input className={`${inputCls} mt-2`} placeholder="When to quote this, in a line. Optional."
               value={draft.notes}
               onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
        <button onClick={add} disabled={saving}
          className="mt-3 flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-white transition disabled:opacity-40">
          {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add band
        </button>
      </div>

      {/* ── The guide ───────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <Tag className="w-5 h-5 text-white/20 mx-auto mb-3" />
          <p className="text-sm text-white/50">No bands yet.</p>
          <p className="text-xs text-white/30 mt-1.5 max-w-sm mx-auto leading-relaxed">
            Add the kinds of venue you sell to and what each should pay. Then anybody quoting a
            price is reading the same numbers instead of inventing one.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          {rows.map(row => (
            <div key={row.id} className="p-4 border-b border-white/[0.05] last:border-0">
              {editing === row.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-2">
                    <input className={`${inputCls} lg:col-span-2`} value={editDraft.venue_type}
                           onChange={e => setEditDraft(d => ({ ...d, venue_type: e.target.value }))} />
                    <input className={inputCls} type="number" min="0" placeholder="Low $"
                           value={editDraft.suggested_fee_min}
                           onChange={e => setEditDraft(d => ({ ...d, suggested_fee_min: e.target.value }))} />
                    <input className={inputCls} type="number" min="0" placeholder="High $"
                           value={editDraft.suggested_fee_max}
                           onChange={e => setEditDraft(d => ({ ...d, suggested_fee_max: e.target.value }))} />
                    <input className={inputCls} type="number" placeholder="Order"
                           value={editDraft.sort_order}
                           onChange={e => setEditDraft(d => ({ ...d, sort_order: e.target.value }))} />
                  </div>
                  <input className={inputCls} placeholder="Notes" value={editDraft.notes}
                         onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))} />
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveEdit(row.id)} disabled={busy === row.id}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 transition disabled:opacity-40">
                      {busy === row.id ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Save
                    </button>
                    <button onClick={() => setEditing(null)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white/[0.06] text-white/60 transition">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white">{row.venue_type}</p>
                      <p className="text-sm text-white/70 tabular-nums">
                        {band(row.suggested_fee_min, row.suggested_fee_max)}
                        <span className="text-white/30"> / month</span>
                      </p>
                    </div>
                    {row.notes && <p className="text-xs text-white/35 mt-1 leading-relaxed">{row.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(row)}
                      className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/[0.06] transition">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => remove(row)} disabled={busy === row.id}
                      className="p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40">
                      {busy === row.id
                        ? <Loader className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
