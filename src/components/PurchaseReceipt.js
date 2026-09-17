// src/components/PurchaseReceipt.js
//
// "The app just started working differently" — Sani, after paying for Pro.
//
// He was right to be unsettled. Money left his account and the only feedback
// the platform gave him was a tick that disappeared after a second and a half,
// followed by features quietly behaving differently. No receipt, no record, no
// way to check afterwards that anything had happened at all.
//
// This is the in-app half of the fix. The durable half is a row in
// notifications, written by the server so it survives a closed tab, a failed
// download and a lost connection — see paypal-order.js and migration 125.
//
// WHY A SHEET AND NOT A POPUP
//
// A browser popup (window.open, window.alert) is exactly what gets blocked,
// and on a phone it is what people dismiss without reading. This is an element
// inside the page: nothing can block it, it cannot be mistaken for an advert,
// and it stays until it is dismissed rather than vanishing on a timer. The one
// thing it must never do is trap someone — so it closes on the button, on the
// backdrop, and on Escape.
//
// HOW TO USE IT
//
//   import { showReceipt } from '../components/PurchaseReceipt';
//   showReceipt({ title: 'Ice-Man', subtitle: 'Steve C-SA', amount: 3,
//                 kind: 'purchase' });
//
// It is mounted once, in AppRouter. Anything anywhere can call showReceipt
// without importing a context or threading a prop through four components,
// which is why it talks over a window event: the call sites are in seven
// different files and half of them are inside PayPal button callbacks that
// have no React context of their own.

import React from 'react';
import { Check, Download, Crown, X } from 'lucide-react';

const EVENT = 'feelz:receipt';

// kind: 'purchase' | 'subscription'
export function showReceipt(detail) {
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: detail || {} }));
  } catch {
    // An older browser without CustomEvent is not a reason to lose a sale.
  }
}

export default function PurchaseReceipt() {
  const [receipt, setReceipt] = React.useState(null);
  const [shown, setShown]     = React.useState(false);

  React.useEffect(() => {
    const onReceipt = (e) => {
      setReceipt(e.detail || {});
      // Two frames, so the element exists at its starting transform before the
      // class that animates it is applied. One frame is not always enough on
      // a cold render.
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    };
    window.addEventListener(EVENT, onReceipt);
    return () => window.removeEventListener(EVENT, onReceipt);
  }, []);

  React.useEffect(() => {
    if (!receipt) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt]);

  const close = () => {
    setShown(false);
    setTimeout(() => setReceipt(null), 300);   // matches the transition
  };

  if (!receipt) return null;

  const isSub    = receipt.kind === 'subscription';
  const Icon     = isSub ? Crown : Download;
  const heading  = receipt.heading || (isSub ? 'You’re in' : 'Paid, and it’s yours');
  const amount   = receipt.amount != null && receipt.amount !== ''
    ? `$${Number(receipt.amount).toFixed(2)}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      {/* Backdrop. Light enough to see the page underneath, so it reads as a
          confirmation over what you were doing rather than a new screen. */}
      <div
        onClick={close}
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: 'rgba(0,0,0,0.62)', opacity: shown ? 1 : 0 }}
      />

      <div
        className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden transition-all duration-300 ease-out"
        style={{
          background: 'linear-gradient(180deg, #16121F 0%, #0B0A10 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.65)',
          transform: shown ? 'translateY(0)' : 'translateY(24px)',
          opacity: shown ? 1 : 0,
        }}
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-white/[0.07] transition"
        >
          <X className="w-4 h-4 text-white/40" />
        </button>

        <div className="px-6 pt-7 pb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.34)' }}
            >
              <Check className="w-5 h-5" style={{ color: '#34D399' }} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-white">{heading}</p>
              {amount && (
                <p className="text-xs text-white/45">{amount} paid{receipt.method ? ` · ${receipt.method}` : ' · PayPal'}</p>
              )}
            </div>
          </div>

          {(receipt.title || receipt.subtitle) && (
            <div
              className="mt-5 rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.075)' }}
            >
              <Icon className="w-4 h-4 flex-shrink-0 text-white/35" />
              <div className="min-w-0">
                {receipt.title && <p className="text-sm font-semibold text-white truncate">{receipt.title}</p>}
                {receipt.subtitle && <p className="text-xs text-white/40 truncate">{receipt.subtitle}</p>}
              </div>
            </div>
          )}

          <p className="mt-4 text-xs leading-relaxed text-white/45">
            {receipt.note || (isSub
              ? 'Your plan is active now. There is a copy of this in your notifications, and PayPal has emailed you a receipt.'
              : 'Your download is starting. There is a copy of this in your notifications if you need it again, and PayPal has emailed you a receipt.')}
          </p>

          <div className="mt-5 flex gap-2">
            <a
              href="/notifications"
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-center transition"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.72)' }}
            >
              See it in notifications
            </a>
            <button
              onClick={close}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition active:scale-[0.99]"
              style={{ background: 'linear-gradient(145deg, #8B5CF6, #6D28D9)' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}