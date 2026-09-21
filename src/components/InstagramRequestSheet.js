// src/components/InstagramRequestSheet.js
//
// Artist asks for a track to go into Instagram and Facebook's music library.
// Everything is checked again in the database by submit_distribution_request()
// (migration 151); this sheet only collects it clearly.

import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader, Plus, Trash2, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';

const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID;

async function addonCall(action, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/addon-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify({ action, ...extra }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

// Can this artist send this track? (Same rule as artist_can_use_instagram in
// migration 153, which is what actually decides.)
function entitled(addon, inDeal) {
  if (inDeal) return true;
  const mine = addon?.mine;
  if (!mine) return false;
  if (!addon.live) return true; // on the waitlist
  const end = mine.current_period_end ? new Date(mine.current_period_end) : null;
  if (mine.status === 'active' || mine.status === 'past_due') return !end || end > new Date(Date.now() - 3 * 86400000);
  if (mine.status === 'cancelled') return !!end && end > new Date();
  return false;
}

function AddonGate({ addon, onUnlocked }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sdkReady, setSdkReady] = useState(!!window.paypalAddon);

  useEffect(() => {
    if (!addon.live || window.paypalAddon) return;
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription&currency=USD`;
    script.setAttribute('data-namespace', 'paypalAddon');
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setError('PayPal did not load. Refresh and try again.');
    document.head.appendChild(script);
  }, [addon.live]);

  useEffect(() => {
    if (!addon.live || !sdkReady || !window.paypalAddon) return;
    const el = document.getElementById('paypal-addon-container');
    if (!el) return;
    el.innerHTML = '';
    window.paypalAddon.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'subscribe' },
      createSubscription: async (data, actions) => {
        setError('');
        const { planId } = await addonCall('plan');
        return actions.subscription.create({ plan_id: planId });
      },
      onApprove: async (data) => {
        try { await addonCall('link', { subscriptionID: data.subscriptionID }); onUnlocked(); }
        catch (e) { setError(e.message); }
      },
      onError: () => setError('The payment did not go through. Nothing was charged.'),
    }).render(el).catch(() => {});
  }, [addon.live, sdkReady, onUnlocked]);

  const join = async () => {
    setBusy(true); setError('');
    const { error: e } = await supabase.rpc('join_addon_waitlist', { p_addon: 'instagram' });
    setBusy(false);
    if (e) setError(e.message); else onUnlocked();
  };

  const price = addon.priceUsd ? `$${addon.priceUsd.toFixed(2)} a month` : '';
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.25)' }}>
      <p className="text-sm font-bold text-white">Instagram add-on{price ? `, ${price}` : ''}</p>
      <p className="text-xs text-white/55 leading-relaxed">
        Your tracks in Instagram and Facebook's music picker, so anyone can use them in Stories and Reels.
        Meta pays per use. You keep what your tracks earn after the distributor's share.
      </p>
      {addon.live ? (
        <>
          <p className="text-[11px] text-white/40">Cancel any time in PayPal. You keep it until the end of the month you paid for.</p>
          <div id="paypal-addon-container" />
        </>
      ) : (
        <>
          <p className="text-xs text-white/55">
            It switches on when {addon.target} artists join the waitlist. {addon.waitlistCount} of {addon.target} so far.
            Joining is free and nobody is charged until it opens.
          </p>
          <button onClick={join} disabled={busy}
            className="w-full py-2.5 rounded-xl bg-pink-500 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center">
            {busy ? <Loader className="w-4 h-4 animate-spin" /> : 'Join the waitlist, free'}
          </button>
        </>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

const STATEMENTS = [
  { key: 'own_recording',        text: 'I own this recording, or have the right to release it.' },
  { key: 'original_song',        text: 'It is an original song, not a cover, remix or sound-alike.' },
  { key: 'no_uncleared_samples', text: 'It has no samples, loops or stock sounds I do not have exclusive rights to.' },
  { key: 'not_a_type_beat',      text: 'It is not built on a purchased or free type beat.' },
];

export default function InstagramRequestSheet({ track, onClose, onSent }) {
  const [writers, setWriters] = useState([{ name: '', share: 100 }]);
  const [ticks, setTicks]     = useState({});
  const [isrc, setIsrc]       = useState(track?.isrc || '');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [addon, setAddon]     = useState(null);   // add-on status from the server
  const [inDeal, setInDeal]   = useState(false);  // track is in a signed Creator deal

  const loadAddon = useCallback(async () => {
    try {
      const [st, deal] = await Promise.all([
        addonCall('status'),
        supabase.from('creator_deal_tracks').select('deal:creator_deals(status)').eq('track_id', track.id),
      ]);
      setAddon(st);
      setInDeal((deal.data || []).some(r => ['signed', 'completed'].includes(r.deal?.status)));
    } catch (e) { setError(e.message); setAddon({ live: false, mine: null, waitlistCount: 0, target: 0 }); }
  }, [track.id]);

  useEffect(() => { loadAddon(); }, [loadAddon]);

  const total = writers.reduce((s, w) => s + (Number(w.share) || 0), 0);
  const allTicked = STATEMENTS.every(s => ticks[s.key]);
  const ready = allTicked && total === 100 && writers.every(w => w.name.trim().length >= 2 && Number(w.share) > 0);

  const setWriter = (i, key, val) => setWriters(ws => ws.map((w, j) => (j === i ? { ...w, [key]: val } : w)));

  const send = async () => {
    setBusy(true); setError('');
    const { error: e } = await supabase.rpc('submit_distribution_request', {
      p_track_id: track.id,
      p_songwriters: writers.map(w => ({ name: w.name.trim(), share: Number(w.share) })),
      p_confirmations: { ...ticks, wording: 'v1-2026-09' },
      p_isrc: isrc.trim() || null,
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    onSent?.();
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl overflow-y-auto overscroll-contain p-5 space-y-4"
        style={{ maxHeight: 'calc(100dvh - 48px)', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-white">Put "{track.title}" on Instagram</p>
            <p className="text-xs text-white/40 mt-1 leading-relaxed">
              People can add it to their Stories and Reels. Meta pays per use, through our distributor.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-white/30 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {!addon ? (
          <div className="flex justify-center py-6"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
        ) : !entitled(addon, inDeal) ? (
          <AddonGate addon={addon} onUnlocked={loadAddon} />
        ) : (<>
        {!addon.live && !inDeal && (
          <p className="text-[11px] text-pink-200/70">You are on the waitlist. Your track is queued and goes out once the add-on opens.</p>
        )}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Confirm</p>
          {STATEMENTS.map(s => (
            <button key={s.key} type="button" onClick={() => setTicks(t => ({ ...t, [s.key]: !t[s.key] }))}
              className="w-full flex items-start space-x-2.5 text-left">
              <span className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 border ${ticks[s.key] ? 'bg-purple-500 border-purple-500' : 'border-white/20'}`}>
                {ticks[s.key] && <Check className="w-3 h-3 text-white" />}
              </span>
              <span className="text-xs text-white/60 leading-relaxed">{s.text}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Songwriters (shares add up to 100)</p>
          {writers.map((w, i) => (
            <div key={i} className="flex items-center space-x-2">
              <input value={w.name} onChange={e => setWriter(i, 'name', e.target.value)} placeholder="Full name"
                className="flex-1 min-w-0 px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
              <input value={w.share} onChange={e => setWriter(i, 'share', e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-16 px-2 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none text-right" />
              <span className="text-xs text-white/30">%</span>
              {writers.length > 1 && (
                <button onClick={() => setWriters(ws => ws.filter((_, j) => j !== i))} className="text-white/30 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button onClick={() => setWriters(ws => [...ws, { name: '', share: 0 }])}
              className="text-xs text-purple-300 flex items-center"><Plus className="w-3 h-3 mr-1" />Add songwriter</button>
            <span className={`text-xs ${total === 100 ? 'text-emerald-300' : 'text-amber-300'}`}>{total}%</span>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-1.5">ISRC (if you already have one)</p>
          <input value={isrc} onChange={e => setIsrc(e.target.value)} placeholder="ZA-ABC-26-00001" disabled={!!track?.isrc}
            className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none disabled:opacity-50" />
          <p className="text-[11px] text-white/30 mt-1">No ISRC? Leave it empty and we assign one.</p>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button onClick={send} disabled={!ready || busy}
          className="w-full py-3 rounded-xl bg-purple-500 text-white font-bold text-sm hover:bg-purple-400 transition disabled:opacity-40 flex items-center justify-center">
          {busy ? <Loader className="w-4 h-4 animate-spin" /> : 'Send for review'}
        </button>
        <p className="text-[11px] text-white/30 text-center leading-relaxed">
          We check it, then send it to Meta. Songs with type beats, loops or uncleared samples get the whole release refused.
        </p>
        </>)}
      </div>
    </div>
  );
}