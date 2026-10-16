/**
 * src/components/PayInRandButton.js
 *
 * One button, dropped in beside the PayPal buttons wherever something is sold.
 *
 *
 * WHY THIS IS A SEPARATE COMPONENT
 *
 * Six screens sell music: src/components/TrackActionSheet.js,
 * src/components/PaidPlayGate.js, src/pages/BeatDetailPage.js,
 * src/pages/AlbumDetailPage.js and src/pages/ArtistProfilePage.js (twice).
 * Each one has its own createOrder and onApprove pair wired into the PayPal
 * SDK, and each one took its own path to get there.
 *
 * Adding a rand payment inside all six would mean six new versions of the same
 * logic sitting inside the code that currently takes real money through PayPal.
 * That is the change most likely to break something that works. So this
 * component holds the whole rand path, and each screen gains one line.
 *
 *
 * WHY IT CAN DECIDE FOR ITSELF WHETHER TO SHOW
 *
 * It does not need to be told whether the artist takes rand. It asks the
 * checkout, and the checkout answers 409 with fallback: 'paypal' when there is
 * no subaccount. Until a real answer comes back it renders nothing, so a
 * screen where this is not an option looks exactly as it does today.
 *
 * That check is a POST that would start a payment, so it is not made on load.
 * The button renders optimistically and only disappears if the first press
 * comes back 409. The alternative, asking on every render of every track card,
 * is a lot of requests to learn something that changes once.
 *
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * Record anything. The buyer leaves for Paystack and the sale is written by
 * netlify/functions/paystack-webhook.js from Paystack's signed callback. There
 * is no onApprove here to be fooled, because there is no browser step that
 * could claim a payment happened.
 */

import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function PayInRandButton({
  trackId = null,
  albumId = null,
  // A beat licence. The server reads that licence's price off the beat, so
  // this names which one, never what it costs.
  licenceId = null,
  // A pay-what-you-want offer. Sent as what the buyer chose; the server floors
  // it at the artist's minimum and refuses anything absurd. Ignored outright
  // on a track that is not pay-what-you-want.
  amount = null,
  email: emailProp = '',
  label = 'Pay in rand',
  className = '',
  onUnavailable,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Set once the checkout says this artist has no Paystack account. From then
  // on the button is gone for this screen.
  const [unavailable, setUnavailable] = useState(false);
  const [askEmail, setAskEmail] = useState(false);
  const [email, setEmail] = useState(emailProp || '');

  if (unavailable) return null;
  if (!trackId && !albumId) return null;

  const start = async (useEmail) => {
    setBusy(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const address = (useEmail || session?.user?.email || '').trim();

      // No address, no download to send. Asked for here rather than guessed,
      // because the webhook matches the buyer on it.
      if (!/^\S+@\S+\.\S+$/.test(address)) {
        setAskEmail(true);
        setBusy(false);
        return;
      }

      const res = await fetch('/.netlify/functions/paystack-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          trackId, albumId, email: address,
          ...(licenceId ? { licenceId } : {}),
          ...(Number(amount) > 0 ? { amount: Number(amount) } : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        // This artist is paid through PayPal. Not an error to show anybody:
        // the PayPal buttons are already on the screen.
        setUnavailable(true);
        onUnavailable?.();
        return;
      }

      if (!res.ok || !data.authorizationUrl) {
        throw new Error(data.message || 'This payment could not be started.');
      }

      // Away to Paystack. No state to keep: the buyer comes back to
      // /payment/success and the webhook has already recorded the sale.
      window.location.href = data.authorizationUrl;
    } catch (e) {
      setError(e.message || 'Something went wrong.');
      setBusy(false);
    }
  };

  if (askEmail) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-white/50">Where should the download go?</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoFocus
          className="w-full px-3 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10
                     focus:outline-none focus:border-white/30"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => start(email)}
          className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-white text-black
                     disabled:opacity-50"
        >
          {busy ? 'Starting…' : 'Continue'}
        </button>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => start()}
        className={
          className ||
          'w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 ' +
          'border border-white/15 hover:bg-white/15 disabled:opacity-50 transition-colors'
        }
      >
        {busy ? 'Starting…' : label}
      </button>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}