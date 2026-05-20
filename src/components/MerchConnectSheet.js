/**
 * MerchConnectSheet.js
 *
 * Bottom sheet for connecting/managing a Printful store.
 * Shown to Premium artists only.
 *
 * Props:
 *   artist       — full artist object
 *   onClose      — close handler
 *   onConnected  — called after successful connect + validation
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ExternalLink, Check, X, Loader, AlertCircle, Store, Unlink } from 'lucide-react';

const PRINTFUL_CLIENT_ID = process.env.REACT_APP_PRINTFUL_CLIENT_ID;
const REDIRECT_URI       = `${window.location.origin}/merch-connect-callback`;

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
  const [step, setStep]         = useState('intro'); // intro | connecting | validating | connected | error | disconnect_confirm
  const [error, setError]       = useState('');
  const [validation, setValidation] = useState(null);

  const isConnected = !!artist?.printful_store_id;

  useEffect(() => {
    if (isConnected) setStep('connected');
  }, [isConnected]);

  // Handle OAuth callback — AppRouter redirects back here with ?printful_code=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('printful_code');
    if (code) {
      const url = new URL(window.location.href);
      url.searchParams.delete('printful_code');
      window.history.replaceState({}, '', url.toString());
      handleOAuthCallback(code);
    }
  }, []); // eslint-disable-line

  const handleOAuthCallback = async (code) => {
    setStep('connecting');
    setError('');
    try {
      await printfulProxy('connect_oauth', artist.id, { code, redirect_uri: REDIRECT_URI });
      await validateStore();
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  };

  const validateStore = async () => {
    setStep('validating');
    try {
      const result = await printfulProxy('validate_store', artist.id);
      setValidation(result);
      if (result.valid) {
        setStep('connected');
        onConnected?.();
      } else {
        setStep('error');
        const issues = [];
        if (!result.billingOk)   issues.push('billing details not set up in Printful');
        if (!result.hasProducts) issues.push('no products in your Printful store');
        setError(`Store validation failed: ${issues.join(' and ')}. Fix these in Printful then reconnect.`);
      }
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  };

  const handleConnect = () => {
    const authUrl = new URL('https://www.printful.com/oauth/authorize');
    authUrl.searchParams.set('client_id',    PRINTFUL_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'orders products store');
    authUrl.searchParams.set('state', artist.slug); // used by callback to return to artist profile
    window.location.href = authUrl.toString();
  };

  const handleDisconnect = async () => {
    setStep('connecting');
    try {
      await printfulProxy('disconnect', artist.id);
      setStep('intro');
      onConnected?.();
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center"
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl md:rounded-3xl overflow-hidden"
        style={{ backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -16px 48px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-8 h-1 rounded-full bg-white/20" />
        </div>

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

        <div className="p-5 space-y-4">

          {/* Intro */}
          {step === 'intro' && (
            <>
              <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <p className="text-sm font-semibold text-white">Connect your Printful store</p>
                <p className="text-xs text-white/50 leading-relaxed">
                  Printful handles printing, packing and shipping. You set up products on Printful,
                  we display them on your profile. Fans order directly and Printful fulfils it.
                </p>
                <div className="space-y-1.5 pt-1">
                  {['Create a free Printful account', 'Design products (tees, hoodies, etc)', 'Add billing details in Printful', 'Connect here — your store goes live'].map((s, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                        style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>{i + 1}</div>
                      <p className="text-xs text-white/60">{s}</p>
                    </div>
                  ))}
                </div>
              </div>

              <a href="https://www.printful.com/signup" target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-semibold text-white/50 border border-white/[0.08] hover:bg-white/[0.04] transition">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Create Printful account first</span>
              </a>

              <button onClick={handleConnect}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
                Connect Printful Store
              </button>
            </>
          )}

          {/* Connecting / validating */}
          {(step === 'connecting' || step === 'validating') && (
            <div className="py-8 flex flex-col items-center space-y-3">
              <Loader className="w-8 h-8 text-purple-400 animate-spin" />
              <p className="text-sm text-white/60">
                {step === 'connecting' ? 'Connecting to Printful...' : 'Validating your store...'}
              </p>
            </div>
          )}

          {/* Connected */}
          {step === 'connected' && (
            <>
              <div className="rounded-2xl p-4 flex items-start space-x-3"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-white">Store connected</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Your merch is live on your profile. Fans can browse and order directly.
                  </p>
                  <p className="text-[10px] text-white/30 mt-1">Store ID: {artist?.printful_store_id}</p>
                </div>
              </div>

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
              <div className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="text-sm font-semibold text-white mb-1">Disconnect store?</p>
                <p className="text-xs text-white/50">Your merch tab will be hidden from your profile. You can reconnect any time.</p>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => setStep('connected')}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/40 border border-white/[0.08] hover:bg-white/[0.04] transition">Cancel</button>
                <button onClick={handleDisconnect}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition">Disconnect</button>
              </div>
            </>
          )}

          {/* Error */}
          {step === 'error' && (
            <>
              <div className="rounded-2xl p-4 flex items-start space-x-3"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-white/60 leading-relaxed">{error}</p>
              </div>
              <button onClick={() => { setStep('intro'); setError(''); }}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-white border border-white/[0.08] hover:bg-white/[0.04] transition">
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
