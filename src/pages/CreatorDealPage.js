// src/pages/CreatorDealPage.js
// /deal/:id: the artist reads a Creator Empowerment Deal offer and signs it in
// the app. Signing goes through sign_creator_deal() (migration 152), which
// checks the text they read is the text on record (its fingerprint), that they
// confirmed they are 18 or older, and stores their legal details. After
// signing, the page shows the signed agreement with a Download copy button.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, Check, Download } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const inputCls = 'w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition';

function AgreementText({ text }) {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-white/75">
      {text.split('\n\n').map((block, i) => block.startsWith('## ')
        ? <h3 key={i} className="text-sm font-bold text-white pt-3">{block.slice(3)}</h3>
        : <p key={i}>{block}</p>)}
    </div>
  );
}

export default function CreatorDealPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const [deal, setDeal] = React.useState(null);
  const [state, setState] = React.useState('loading');
  const [read, setRead] = React.useState(false);
  const [f, setF] = React.useState({ name: '', idNo: '', address: '', adult: false, agree: false, advice: false });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    const { data, error: e } = await supabase.from('creator_deals').select('*, artist:artists(user_id)').eq('id', id).maybeSingle();
    if (e || !data) { setState('missing'); return; }
    setDeal(data); setState('ok');
  }, [id]);

  React.useEffect(() => { if (user) load(); }, [user, load]);

  const onScroll = e => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setRead(true);
  };

  const sign = async () => {
    setBusy(true); setError('');
    const { error: e } = await supabase.rpc('sign_creator_deal', {
      p_deal_id: deal.id, p_expected_sha256: deal.agreement_sha256,
      p_legal_name: f.name, p_id_number: f.idNo, p_address: f.address,
      p_confirm_adult: f.adult, p_user_agent: navigator.userAgent,
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    load();
  };

  const decline = async () => {
    const reason = window.prompt('Tell us why (optional). You can always talk to us first.');
    if (reason === null) return;
    const { error: e } = await supabase.rpc('decline_creator_deal', { p_deal_id: deal.id, p_reason: reason || null });
    if (e) setError(e.message); else load();
  };

  const downloadCopy = () => {
    const signedBlock = deal.signed_at
      ? `\n\nSIGNED ELECTRONICALLY\nName: ${deal.signer_legal_name}\nID/Passport: ${deal.signer_id_number}\nAddress: ${deal.signer_address}\nDate: ${new Date(deal.signed_at).toISOString()}\nConfirmed 18 or older: yes\nAgreement fingerprint (SHA-256): ${deal.agreement_sha256}\n`
      : `\n\nNOT YET SIGNED\nAgreement fingerprint (SHA-256): ${deal.agreement_sha256}\n`;
    const blob = new Blob([deal.agreement_text.replace(/^## /gm, '') + signedBlock], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Creator-Empowerment-Deal-${deal.series_name.replace(/[^a-z0-9]+/gi, '-')}.txt`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (loading || (user && state === 'loading')) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>;
  }
  if (!user) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
      <button onClick={() => navigate(`/login?redirect=/deal/${id}`)} className="text-purple-300 underline text-sm">Sign in to open your deal</button>
    </div>;
  }
  if (state === 'missing') {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-sm text-white/50">This deal is not available.</div>;
  }

  const open = deal.status === 'offered' && new Date(deal.expires_at) > new Date();
  const ready = read && f.agree && f.adult && f.advice && f.name.trim().length >= 4 && f.idNo.trim().length >= 5 && f.address.trim().length >= 8;
  const R = n => 'R' + Number(n).toLocaleString('en-ZA');

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <Helmet><title>Creator Empowerment Deal</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-2xl mx-auto px-5 pt-8 space-y-6">
        <button onClick={() => navigate(isAdmin ? '/admin/deals' : '/notifications')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]"><ArrowLeft className="w-4 h-4" /></button>

        <div>
          <p className="text-purple-400 text-xs font-bold tracking-widest uppercase">Creator Empowerment Deal</p>
          <h1 className="text-2xl font-bold mt-1">{deal.series_name}</h1>
          <p className="text-sm text-white/50 mt-1">A {deal.song_count}-song project. You stay free, we build it together.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            ['Advance', R(deal.advance_zar), 'Paid back only from your share. Never owed back.'],
            ['Income split', `${Number(deal.artist_share_pct)}% to you`, 'Music and project merch.'],
            ['Masters', 'Co-owned 50/50', 'Your songwriting stays 100% yours.'],
            ['Exclusive', `${deal.exclusivity_days} days, streaming only`, 'Instagram, radio and live are open from day one.'],
          ].map(([t, v, d]) => (
            <div key={t} className="rounded-xl bg-white/[0.04] p-3">
              <p className="text-[10px] uppercase tracking-widest text-white/35">{t}</p>
              <p className="text-sm font-bold mt-0.5">{v}</p>
              <p className="text-[11px] text-white/40 mt-0.5">{d}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wide">The full agreement</p>
            <button onClick={downloadCopy} className="text-xs text-purple-300 flex items-center"><Download className="w-3.5 h-3.5 mr-1" />Download a copy</button>
          </div>
          <div onScroll={onScroll} className="max-h-[55vh] overflow-y-auto overscroll-contain rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
            <AgreementText text={deal.agreement_text} />
          </div>
          {open && !read && <p className="text-[11px] text-white/35 mt-1">Scroll to the end to sign.</p>}
        </div>

        {deal.status === 'signed' || deal.status === 'completed' ? (
          <div className="rounded-xl bg-emerald-500/10 p-4 flex items-start space-x-3">
            <Check className="w-5 h-5 text-emerald-300 flex-shrink-0" />
            <p className="text-sm text-white/80">
              Signed by {deal.signer_legal_name} on {new Date(deal.signed_at).toLocaleDateString()}. Welcome in. We will be in touch about the advance and the first session.
            </p>
          </div>
        ) : !open ? (
          <p className="text-sm text-white/50">This offer is {deal.status === 'offered' ? 'expired' : deal.status}.</p>
        ) : deal.artist?.user_id !== user.id ? (
          <p className="text-xs text-white/40">Waiting for the artist to sign.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Sign</p>
            <input className={inputCls} placeholder="Full legal name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
            <input className={inputCls} placeholder="ID or passport number" value={f.idNo} onChange={e => setF({ ...f, idNo: e.target.value })} />
            <input className={inputCls} placeholder="Address" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
            {[
              ['adult', 'I am 18 or older.'],
              ['advice', 'I had the chance to get independent legal advice.'],
              ['agree', 'I have read the full agreement and I accept it. Signing here is my signature.'],
            ].map(([k, t]) => (
              <label key={k} className="flex items-start space-x-2.5 text-sm text-white/70 cursor-pointer">
                <input type="checkbox" checked={f[k]} onChange={e => setF({ ...f, [k]: e.target.checked })} className="mt-1" />
                <span>{t}</span>
              </label>
            ))}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={sign} disabled={!ready || busy}
              className="w-full py-3 rounded-xl bg-purple-500 font-bold text-sm disabled:opacity-40 flex items-center justify-center">
              {busy ? <Loader className="w-4 h-4 animate-spin" /> : 'Sign the deal'}
            </button>
            <button onClick={decline} className="w-full py-2 text-xs text-white/40">Decline</button>
            <p className="text-[11px] text-white/30 text-center">Under 18? Talk to us. Deals for under-18s need a parent or guardian and are not signed in the app.</p>
          </div>
        )}
      </div>
    </div>
  );
}