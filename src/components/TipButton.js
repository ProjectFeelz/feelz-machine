/**
 * TipButton.js
 * PayPal-powered tip for any artist who has set up a paypal_email.
 * Minimum $1, maximum $500.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Heart, Loader, X, DollarSign } from 'lucide-react';

const PRESET_AMOUNTS = [2, 5, 10, 20];

export default function TipButton({ artist }) {
  const { user } = useAuth();
  const [open, setOpen]         = useState(false);
  const [amount, setAmount]     = useState('');
  const [message, setMessage]   = useState('');
  const [step, setStep]         = useState('form'); // form | paying | success | error
  const [error, setError]       = useState('');
  const paypalRef               = useRef(null);
  const paypalRendered          = useRef(false);

  const amountNum = parseFloat(amount);
  const valid = !isNaN(amountNum) && amountNum >= 1 && amountNum <= 500;

  // Keep the sheet above the software keyboard on mobile
  const [vvHeight, setVvHeight] = useState(() =>
    typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 600
  );
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setVvHeight(vv.height);
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [open]);

  // Prevent body scroll while sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (step !== 'paying' || paypalRendered.current) return;
    paypalRendered.current = true;

    const initPayPal = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        // Create order server-side
        const res = await fetch('/.netlify/functions/tip-artist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artist_id: artist.id, amount: amountNum, message, token }),
        });
        const data = await res.json();
        if (data.error) { setError(data.error); setStep('error'); return; }

        window.paypal.Buttons({
          createOrder: () => data.order_id,
          onApprove: async () => {
            const capRes = await fetch('/.netlify/functions/tip-artist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'capture', order_id: data.order_id, artist_id: artist.id, amount: amountNum, message, token }),
            });
            const capData = await capRes.json();
            if (capData.success) { setStep('success'); }
            else { setError('Payment failed. Please try again.'); setStep('error'); }
          },
          onError: () => { setError('Payment cancelled or failed.'); setStep('error'); },
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
        }).render(paypalRef.current);
      } catch (err) {
        setError(err.message);
        setStep('error');
      }
    };

    if (window.paypal) { initPayPal(); }
    else {
      const script = document.createElement('script');
      script.id = 'paypal-sdk-tip';
      script.src = `https://www.paypal.com/sdk/js?client-id=${process.env.REACT_APP_PAYPAL_CLIENT_ID}&currency=USD`;
      script.onload = initPayPal;
      const existing = document.getElementById('paypal-sdk-tip');
      if (existing) existing.remove();
      document.head.appendChild(script);
    }
  }, [step]);

  // Early return AFTER all hooks — safe per Rules of Hooks
  if (!artist?.paypal_email) return null;

  const reset = () => { setOpen(false); setAmount(''); setMessage(''); setStep('form'); setError(''); paypalRendered.current = false; };

  if (!open) return (
    <button
      onClick={() => { if (!user) return; setOpen(true); }}
      className="flex items-center space-x-1.5 px-4 py-2 rounded-xl border border-pink-500/30 bg-pink-500/10 text-pink-400 text-sm font-medium hover:bg-pink-500/20 transition"
    >
      <Heart className="w-4 h-4" />
      <span>Tip</span>
    </button>
  );

  return (
    <div
      className="fixed inset-x-0 z-50 flex flex-col justify-start items-center bg-black/60 backdrop-blur-sm overflow-y-auto"
      style={{ top: 0, height: vvHeight }}
      onClick={reset}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-b-3xl p-6 pb-8"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px) + 16px, 24px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-base font-semibold text-white">Tip {artist.artist_name}</p>
            <p className="text-xs text-white/40">Show your appreciation directly</p>
          </div>
          <button onClick={reset} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.12] transition">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {step === 'form' && (
          <div className="space-y-4">
            <div className="flex space-x-2">
              {PRESET_AMOUNTS.map(a => (
                <button key={a} onClick={() => setAmount(String(a))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${amount === String(a) ? 'bg-white text-black' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'}`}>
                  ${a}
                </button>
              ))}
            </div>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="number" min="1" max="500" step="0.01"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="Custom amount"
                className="w-full pl-8 pr-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20"
              />
            </div>
            <textarea
              value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Add a message (optional)"
              rows={2} maxLength={200}
              className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20 resize-none"
            />
            <button
              onClick={() => setStep('paying')} disabled={!valid}
              className="w-full py-3 rounded-xl bg-pink-500 text-white font-semibold text-sm disabled:opacity-40 hover:bg-pink-400 transition"
            >
              Send ${valid ? amountNum.toFixed(2) : '—'} tip
            </button>
          </div>
        )}

        {step === 'paying' && (
          <div>
            <div ref={paypalRef} />
            <p className="text-xs text-white/30 text-center mt-3">Secured by PayPal</p>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">💸</div>
            <p className="text-white font-semibold">Tip sent!</p>
            <p className="text-sm text-white/40 mt-1">Thanks for supporting {artist.artist_name}</p>
            <button onClick={reset} className="mt-4 px-5 py-2 rounded-xl bg-white/[0.08] text-sm text-white/60 hover:bg-white/[0.12] transition">Done</button>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center py-6">
            <p className="text-white font-semibold">Something went wrong</p>
            <p className="text-sm text-red-400 mt-1">{error}</p>
            <button onClick={() => { setStep('form'); paypalRendered.current = false; }} className="mt-4 px-5 py-2 rounded-xl bg-white/[0.08] text-sm text-white/60 hover:bg-white/[0.12] transition">Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}