// src/pages/AdminDeals.js
// /admin/deals: send Creator Empowerment Deal offers and track them, and the
// switch for the Instagram add-on (waitlist until you turn it on).
//
// Offers are created by offer_creator_deal() (migration 152), which stores the
// exact agreement text with its fingerprint. The artist signs in the app at
// /deal/:id. Terms cannot be edited after sending: withdraw and send again.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, Search, Send, Check, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { buildAgreement, AGREEMENT_VERSION } from '../data/creatorDealAgreement';

const inputCls = 'w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition';
const COMPANY_KEYS = ['company_legal_name', 'company_reg_no', 'company_address', 'company_contact_email'];
const STATUS_STYLE = {
  offered: 'bg-amber-500/15 text-amber-300', signed: 'bg-emerald-500/15 text-emerald-300',
  declined: 'bg-white/10 text-white/50', withdrawn: 'bg-white/10 text-white/50', expired: 'bg-white/10 text-white/50',
  completed: 'bg-cyan-500/15 text-cyan-300', terminated: 'bg-red-500/15 text-red-300',
};

export default function AdminDeals() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [company, setCompany] = React.useState({});
  const [companySaved, setCompanySaved] = React.useState(false);
  const [deals, setDeals] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [artist, setArtist] = React.useState(null);
  const [form, setForm] = React.useState({
    seriesName: '', songCount: 6, advanceZar: 10000,
    advanceSchedule: 'R5,000 within 7 days of signing, and R5,000 on delivery of the last Recording',
    recordingBudgetZar: 0, artistSharePct: 50, exclusivityDays: 90, termMonths: 18, expiresDays: 14,
  });
  const [preview, setPreview] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [ig, setIg] = React.useState(null); // Instagram add-on: live, price, waitlist, queue

  const loadIg = React.useCallback(async () => {
    const [{ data: st }, { data: count }, { count: queued }, { count: subs }] = await Promise.all([
      supabase.from('platform_settings').select('key, value')
        .in('key', ['addon_instagram_live', 'addon_instagram_monthly_usd', 'addon_instagram_waitlist_target']),
      supabase.rpc('addon_waitlist_count', { p_addon: 'instagram' }),
      supabase.from('distribution_requests').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('artist_addons').select('id', { count: 'exact', head: true }).eq('addon', 'instagram').eq('status', 'active'),
    ]);
    const m = Object.fromEntries((st || []).map(r => [r.key, r.value]));
    setIg({
      live: String(m.addon_instagram_live).toLowerCase() === 'true',
      price: m.addon_instagram_monthly_usd, target: m.addon_instagram_waitlist_target,
      waitlist: Number(count) || 0, queued: queued || 0, active: subs || 0,
    });
  }, []);

  const toggleIg = async () => {
    const turningOn = !ig.live;
    const ok = window.confirm(turningOn
      ? 'Switch the Instagram add-on ON? Artists will be asked to subscribe and pay. Only do this once your distributor (LabelGrid) account is ready.'
      : 'Switch the Instagram add-on OFF? New subscriptions stop and artists see the waitlist again. Existing PayPal subscriptions keep billing until cancelled in PayPal.');
    if (!ok) return;
    const { error } = await supabase.from('platform_settings')
      .upsert({ key: 'addon_instagram_live', value: turningOn ? 'true' : 'false', updated_at: new Date().toISOString() });
    setMsg(error ? 'Could not switch: ' + error.message : `Instagram add-on is now ${turningOn ? 'ON' : 'OFF'}.`);
    loadIg();
  };

  const load = React.useCallback(async () => {
    const [{ data: settings }, { data: d }] = await Promise.all([
      supabase.from('platform_settings').select('key, value').in('key', COMPANY_KEYS),
      supabase.from('creator_deals')
        .select('id, status, series_name, advance_zar, advance_paid_zar, offered_at, signed_at, expires_at, signer_legal_name, artist:artists(artist_name, slug)')
        .order('offered_at', { ascending: false }),
    ]);
    setCompany(Object.fromEntries((settings || []).map(r => [r.key, r.value])));
    setDeals(d || []);
  }, []);

  React.useEffect(() => { if (isAdmin) { load(); loadIg(); } }, [isAdmin, load, loadIg]);

  React.useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('artists').select('id, artist_name, slug, user_id')
        .ilike('artist_name', `%${query.trim()}%`).limit(8);
      setResults((data || []).filter(a => a.user_id));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  if (!isAdmin) return null;

  const companyReady = COMPANY_KEYS.every(k => (company[k] || '').trim().length > 2);
  const agreement = artist ? buildAgreement({
    company: { name: company.company_legal_name, regNo: company.company_reg_no, address: company.company_address, email: company.company_contact_email },
    stageName: artist.artist_name, ...form,
  }) : '';

  const saveCompany = async () => {
    const rows = COMPANY_KEYS.map(key => ({ key, value: (company[key] || '').trim(), updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('platform_settings').upsert(rows);
    setCompanySaved(!error);
    setMsg(error ? 'Could not save company details: ' + error.message : 'Company details saved');
  };

  const send = async () => {
    setBusy(true); setMsg('');
    const { error } = await supabase.rpc('offer_creator_deal', {
      p_artist_id: artist.id, p_series_name: form.seriesName, p_song_count: Number(form.songCount),
      p_advance_zar: Number(form.advanceZar), p_advance_schedule: form.advanceSchedule,
      p_recording_budget_zar: Number(form.recordingBudgetZar), p_artist_share_pct: Number(form.artistSharePct),
      p_exclusivity_days: Number(form.exclusivityDays), p_term_months: Number(form.termMonths),
      p_agreement_version: AGREEMENT_VERSION, p_agreement_text: agreement, p_expires_days: Number(form.expiresDays),
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setMsg(`Offer sent to ${artist.artist_name}. They have been notified in the app.`);
    setArtist(null); setPreview(false); setForm(f => ({ ...f, seriesName: '' }));
    load();
  };

  const update = async (id, params) => {
    const { error } = await supabase.rpc('admin_update_creator_deal', { p_deal_id: id, ...params });
    setMsg(error ? error.message : 'Updated');
    load();
  };

  const F = (label, key, type = 'text') => (
    <label className="block">
      <span className="text-[11px] text-white/40">{label}</span>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className={inputCls} />
    </label>
  );

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <Helmet><title>Creator Deals</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-3xl mx-auto px-5 pt-8 space-y-8">
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate('/hub')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <p className="text-purple-400 text-xs font-bold tracking-widest uppercase">Admin</p>
            <h1 className="text-2xl font-bold">Creator Deals and Instagram</h1>
          </div>
        </div>

        {msg && <p className="text-sm text-amber-300">{msg}</p>}

        {/* Instagram add-on switch */}
        {ig && (
          <section className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(236,72,153,0.07)', border: '1px solid rgba(236,72,153,0.25)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Instagram add-on</p>
                <p className="text-xs text-white/50 mt-0.5">
                  {ig.live ? 'ON: artists subscribe to send tracks.' : 'OFF: waitlist only, nobody is charged.'} ${ig.price}/month.
                </p>
              </div>
              <button onClick={toggleIg}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex-shrink-0 ${ig.live ? 'bg-white/[0.08] text-white' : 'bg-pink-500 text-white'}`}>
                {ig.live ? 'Switch off' : 'Switch on'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Waitlist', `${ig.waitlist} of ${ig.target}`], ['Paying', ig.active], ['Tracks waiting', ig.queued]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-black/30 py-2">
                  <p className="text-base font-bold">{v}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-wide">{k}</p>
                </div>
              ))}
            </div>
            {!ig.live && ig.waitlist >= Number(ig.target || 0) && Number(ig.target) > 0 && (
              <p className="text-xs text-emerald-300">Target reached. Set up LabelGrid, then switch it on.</p>
            )}
          </section>
        )}

        {/* Company details go into every agreement */}
        <section className="space-y-2">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Company details (used in every agreement)</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              ['company_legal_name', 'Registered company name'], ['company_reg_no', 'Registration number'],
              ['company_address', 'Registered address'], ['company_contact_email', 'Contact email for notices'],
            ].map(([k, label]) => (
              <input key={k} placeholder={label} value={company[k] || ''} onChange={e => { setCompany(c => ({ ...c, [k]: e.target.value })); setCompanySaved(false); }} className={inputCls} />
            ))}
          </div>
          <button onClick={saveCompany} className="px-4 py-2 rounded-lg bg-white/[0.08] text-sm">{companySaved ? 'Saved' : 'Save company details'}</button>
        </section>

        {/* New offer */}
        <section className="space-y-3">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">New offer</p>
          {!artist ? (
            <div>
              <div className="relative">
                <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an artist" className={inputCls + ' pl-9'} />
              </div>
              {results.map(a => (
                <button key={a.id} onClick={() => { setArtist(a); setQuery(''); setResults([]); }}
                  className="w-full text-left px-3 py-2 mt-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-sm">{a.artist_name}</button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-500/10">
                <span className="text-sm">{artist.artist_name}</span>
                <button onClick={() => { setArtist(null); setPreview(false); }} className="text-white/40"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {F('Series name', 'seriesName')}
                {F('Number of songs', 'songCount', 'number')}
                {F('Advance (ZAR)', 'advanceZar', 'number')}
                {F('Recording budget we pay (ZAR, 0 = artist pays)', 'recordingBudgetZar', 'number')}
                {F('Artist share of income (%)', 'artistSharePct', 'number')}
                {F('Streaming exclusivity per song (days)', 'exclusivityDays', 'number')}
                {F('Minimum term (months)', 'termMonths', 'number')}
                {F('Offer open for (days)', 'expiresDays', 'number')}
              </div>
              {F('How the advance is paid', 'advanceSchedule')}
              <div className="flex gap-2">
                <button onClick={() => setPreview(p => !p)} className="px-4 py-2.5 rounded-lg bg-white/[0.08] text-sm">{preview ? 'Hide agreement' : 'Read the agreement'}</button>
                <button onClick={send} disabled={busy || !companyReady || form.seriesName.trim().length < 2}
                  className="flex-1 py-2.5 rounded-lg bg-purple-500 text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center space-x-2">
                  {busy ? <Loader className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /><span>Send offer</span></>}
                </button>
              </div>
              {!companyReady && <p className="text-xs text-amber-300">Fill in and save the company details first.</p>}
              {preview && (
                <div className="max-h-[60vh] overflow-y-auto rounded-xl bg-white/[0.03] p-4 text-xs text-white/70 leading-relaxed whitespace-pre-wrap">{agreement}</div>
              )}
            </div>
          )}
        </section>

        {/* Deals */}
        <section className="space-y-2">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Deals ({deals.length})</p>
          {deals.length === 0 && <p className="text-xs text-white/30">None yet.</p>}
          {deals.map(d => (
            <div key={d.id} className="rounded-xl bg-white/[0.03] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm truncate">{d.artist?.artist_name}: {d.series_name}</p>
                  <p className="text-[11px] text-white/40">
                    Advance R{Number(d.advance_zar).toLocaleString('en-ZA')} · paid R{Number(d.advance_paid_zar).toLocaleString('en-ZA')}
                    {d.signed_at ? ` · signed ${new Date(d.signed_at).toLocaleDateString()} by ${d.signer_legal_name}` : ` · expires ${new Date(d.expires_at).toLocaleDateString()}`}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[d.status] || ''}`}>{d.status}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <button onClick={() => navigate(`/deal/${d.id}`)} className="px-2 py-1 rounded bg-white/[0.06]">Open</button>
                {d.status === 'offered' && <button onClick={() => update(d.id, { p_status: 'withdrawn' })} className="px-2 py-1 rounded bg-white/[0.06]">Withdraw</button>}
                {d.status === 'signed' && (
                  <>
                    <button onClick={() => {
                      const v = window.prompt('Total advance paid so far (ZAR)', String(d.advance_paid_zar || 0));
                      if (v !== null && !Number.isNaN(Number(v))) update(d.id, { p_advance_paid_zar: Number(v) });
                    }} className="px-2 py-1 rounded bg-white/[0.06] flex items-center"><Check className="w-3 h-3 mr-1" />Record advance paid</button>
                    <button onClick={() => update(d.id, { p_status: 'completed' })} className="px-2 py-1 rounded bg-white/[0.06]">Mark project complete</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}