/**
 * src/components/MerchConnectSheet.js
 * Artist pastes a Printful token. It is stored server side only
 * (artist_printful_credentials, migration 149), never on the public profile.
 * Fans pay the artist's PayPal; Printful bills the artist its cost.
 * Also lists the artist's recent merch orders, with Retry for any that were
 * paid but that Printful refused to start.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { ExternalLink, Check, X, Loader, AlertCircle, Store, Unlink, Key, Eye, EyeOff } from 'lucide-react';

async function printfulProxy(action, artistId, params = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/printful-proxy', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ action, artist_id: artistId, ...params }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    // The proxy now sends a `hint` when the failure is something the artist
    // can actually fix, a token missing scopes, most often. Showing the raw
    // Printful sentence alone ("This endpoint requires any of the following
    // scopes granted: stores_list/read!") tells you nothing about what to do
    // next, so the hint is appended when there is one.
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.hint = json.hint;
    throw err;
  }
  return json;
}

export default function MerchConnectSheet({ artist, onClose, onConnected }) {
  const [step, setStep]       = useState(artist?.printful_store_id ? 'connected' : 'intro');
  const [apiKey, setApiKey]   = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [orders, setOrders]   = useState([]);
  const [retrying, setRetrying] = useState(null);

  const loadOrders = useCallback(async () => {
    if (!artist?.id) return;
    const { data, error: e } = await supabase.from('merch_orders')
      .select('id, product_name, quantity, artist_receives, status, failure_reason, paid_at')
      .eq('artist_id', artist.id)
      .in('status', ['paid', 'in_production', 'paid_not_fulfilled', 'payment_mismatch'])
      .order('paid_at', { ascending: false })
      .limit(10);
    if (!e) setOrders(data || []);
  }, [artist?.id]);

  useEffect(() => { if (step === 'connected') loadOrders(); }, [step, loadOrders]);

  const retryOrder = async (id) => {
    setRetrying(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/merch-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'retry', merch_order_id: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error || 'Printful still refused it.');
    } finally {
      setRetrying(null);
      loadOrders();
    }
  };

  const handleConnect = async () => {
    if (!apiKey.trim()) { setError('Paste your Printful API key first'); return; }
    setLoading(true);
    setError('');
    try {
      await printfulProxy('connect_api_key', artist.id, { api_key: apiKey.trim() });
      // Validate store after connecting
      const result = await printfulProxy('validate_store', artist.id);
      if (result.valid) {
        setStep('connected');
        onConnected?.();
      } else {
        const issues = [];
        if (!result.billingOk)    issues.push('billing not set up in Printful');
        if (!result.hasProducts)  issues.push('no products in your store yet');
        setError(`Connected but: ${issues.join(' and ')}. Fix in Printful then re-validate.`);
        setStep('connected'); // still connected, just needs store setup
        onConnected?.();
      }
    } catch (err) {
      setError(err.hint ? `${err.message}\n\n${err.hint}` : err.message);
    }
    setLoading(false);
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await printfulProxy('disconnect', artist.id);
      setStep('intro');
      setApiKey('');
      onConnected?.();
    } catch (err) {
      setError(err.hint ? `${err.message}\n\n${err.hint}` : err.message);
    }
    setLoading(false);
  };

  const handleRevalidate = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await printfulProxy('validate_store', artist.id);
      if (result.valid) {
        setError('');
        onConnected?.();
      } else {
        const issues = [];
        if (!result.billingOk)   issues.push('billing not set up');
        if (!result.hasProducts) issues.push('no products yet');
        setError(`Store needs: ${issues.join(' and ')}`);
      }
    } catch (err) {
      setError(err.hint ? `${err.message}\n\n${err.hint}` : err.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
      onClick={onClose}>
      {/* Two `style` props were set on this element; JSX keeps the last and
          drops the first, so the maxHeight that stops this sheet running off
          a short screen was never applied. Merged. */}
      <div className="w-full max-w-sm rounded-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: 'calc(100vh - 48px)', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -16px 48px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center space-x-2">
            <Store className="w-4 h-4 text-purple-400" />
            <p className="text-sm font-bold text-white">Merch Store</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/10 transition">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          {/* Intro / connect */}
          {step === 'intro' && (
            <>
              <div className="rounded-2xl p-4 space-y-3"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <p className="text-sm font-semibold text-white">How it works</p>
                <p className="text-xs text-white/50 leading-relaxed">
                  You set up your products on Printful. Fans order from your profile and pay
                  straight into your PayPal. Then Printful prints and ships, and charges you
                  its cost. The difference is yours. No platform fees from us.
                </p>
                <div className="space-y-1.5 pt-1">
                  {[
                    'Create a free Printful account',
                    'Design your products (tees, hoodies, etc)',
                    'Add billing details in Printful',
                    'Add your PayPal email in Payment Settings here',
                    'Create a Printful token and paste it below',
                  ].map((s, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                        style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>{i + 1}</div>
                      <p className="text-xs text-white/60">{s}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* API key instructions */}
              <div className="rounded-xl p-3 space-y-1"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs font-semibold text-white/60">Where to get your token</p>
                <p className="text-xs text-white/35 leading-relaxed">
                  Printful Developers, Tokens, Add new token. Set Access level to "A single store" and
                  pick your merch store. Tick: View and manage orders, View and manage store products,
                  View store files. Copy the key it shows you once.
                </p>
                <a href="https://developers.printful.com/tokens" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-xs text-purple-400 hover:text-purple-300 transition mt-1">
                  <ExternalLink className="w-3 h-3" />
                  <span>Open Printful tokens</span>
                </a>
              </div>

              {/* API key input */}
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5">
                  Printful API Key
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="Paste your API key here"
                    className="w-full pl-9 pr-10 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                    onFocus={e => e.target.style.borderColor = 'rgba(139,92,246,0.5)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                  <button type="button" onClick={() => setShowKey(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start space-x-2 rounded-xl p-3"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300/80 whitespace-pre-line">{error}</p>
                </div>
              )}

              <div className="flex space-x-2">
                <a href="https://www.printful.com/signup" target="_blank" rel="noopener noreferrer"
                  className="flex-shrink-0 flex items-center justify-center space-x-1.5 px-4 py-3 rounded-2xl text-xs font-semibold text-white/50 border border-white/[0.08] hover:bg-white/[0.04] transition">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Sign up</span>
                </a>
                <button onClick={handleConnect} disabled={loading || !apiKey.trim()}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40 flex items-center justify-center space-x-2"
                  style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : <><Store className="w-4 h-4" /><span>Connect Store</span></>}
                </button>
              </div>
            </>
          )}

          {/* Connected */}
          {step === 'connected' && (
            <>
              <div className="rounded-2xl p-4 flex items-start space-x-3"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Store connected</p>
                  <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
                    Your merch is live on your profile. Fans pay straight into your PayPal, then
                    Printful prints and ships. No fees from us.
                  </p>
                  {artist?.printful_store_id && (
                    <p className="text-[10px] text-white/25 mt-1 font-mono">Store ID: {artist.printful_store_id}</p>
                  )}
                </div>
              </div>

              {error && (
                <div className="space-y-2">
                  <div className="flex items-start space-x-2 rounded-xl p-3"
                    style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300/80 whitespace-pre-line">{error}</p>
                  </div>
                  <button onClick={handleRevalidate} disabled={loading}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold text-white/60 border border-white/[0.08] hover:bg-white/[0.04] transition disabled:opacity-40 flex items-center justify-center space-x-1.5">
                    {loading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /><span>Re-validate store</span></>}
                  </button>
                </div>
              )}

              {orders.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold">Recent orders</p>
                  {orders.map(o => (
                    <div key={o.id} className="rounded-xl px-3 py-2 bg-white/[0.03] text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white/70 truncate">{o.product_name || 'Merch'} x{o.quantity}</span>
                        <span className="text-white/50 flex-shrink-0">${Number(o.artist_receives).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className={o.status === 'paid_not_fulfilled' || o.status === 'payment_mismatch' ? 'text-amber-300' : 'text-emerald-300/80'}>
                          {o.status === 'in_production' ? 'Paid, printing'
                            : o.status === 'paid_not_fulfilled' ? 'Paid, Printful refused'
                            : o.status === 'payment_mismatch' ? 'Paid, being checked'
                            : 'Paid'}
                        </span>
                        {o.status === 'paid_not_fulfilled' && (
                          <button onClick={() => retryOrder(o.id)} disabled={retrying === o.id}
                            className="px-2 py-0.5 rounded-md bg-purple-500 text-white font-semibold disabled:opacity-50">
                            {retrying === o.id ? 'Retrying' : 'Retry'}
                          </button>
                        )}
                      </div>
                      {o.status === 'paid_not_fulfilled' && o.failure_reason && (
                        <p className="text-[11px] text-white/35 mt-1">{o.failure_reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setStep('disconnect_confirm')}
                className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-medium text-red-400/60 border border-red-500/10 hover:bg-red-500/5 transition">
                <Unlink className="w-3.5 h-3.5" />
                <span>Disconnect Printful</span>
              </button>
            </>
          )}

          {/* Disconnect confirm */}
          {step === 'disconnect_confirm' && (
            <>
              <div className="rounded-2xl p-4"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="text-sm font-semibold text-white mb-1">Disconnect store?</p>
                <p className="text-xs text-white/50">Your merch tab will be hidden from your profile. You can reconnect any time.</p>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => setStep('connected')}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/40 border border-white/[0.08] hover:bg-white/[0.04] transition">
                  Cancel
                </button>
                <button onClick={handleDisconnect} disabled={loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition disabled:opacity-40 flex items-center justify-center space-x-1.5">
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : <span>Disconnect</span>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}