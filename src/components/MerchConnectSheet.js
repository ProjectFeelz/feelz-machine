/**
 * MerchConnectSheet.js
 * API key flow — no OAuth, no redirect URLs, no platform fees.
 * Artist pastes their Printful API key, it's stored on their artist row.
 * Printful bills them directly for all orders.
 */

import React, { useState } from 'react';
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
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json;
}

export default function MerchConnectSheet({ artist, onClose, onConnected }) {
  const [step, setStep]       = useState(artist?.printful_store_id ? 'connected' : 'intro');
  const [apiKey, setApiKey]   = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

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
      setError(err.message);
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
      setError(err.message);
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
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6"
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 48px)" }}
        style={{ backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -16px 48px rgba(0,0,0,0.6)' }}
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
                  You set up your products on Printful. Fans order from your profile.
                  Printful prints and ships everything — you keep the profit margin.
                  No platform fees from us.
                </p>
                <div className="space-y-1.5 pt-1">
                  {[
                    'Create a free Printful account',
                    'Design your products (tees, hoodies, etc)',
                    'Add billing details in Printful',
                    'Generate an API key and paste it below',
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
                <p className="text-xs font-semibold text-white/60">Where to get your API key</p>
                <p className="text-xs text-white/35 leading-relaxed">
                  Printful dashboard → Settings → Stores → select your store → API → Generate token
                </p>
                <a href="https://www.printful.com/dashboard/settings" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-xs text-purple-400 hover:text-purple-300 transition mt-1">
                  <ExternalLink className="w-3 h-3" />
                  <span>Open Printful Settings →</span>
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
                  <p className="text-xs text-red-300/80">{error}</p>
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
                    Your merch is live on your profile. Fans can browse and order directly.
                    Printful handles fulfilment — no fees from us.
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
                    <p className="text-xs text-amber-300/80">{error}</p>
                  </div>
                  <button onClick={handleRevalidate} disabled={loading}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold text-white/60 border border-white/[0.08] hover:bg-white/[0.04] transition disabled:opacity-40 flex items-center justify-center space-x-1.5">
                    {loading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5" /><span>Re-validate store</span></>}
                  </button>
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