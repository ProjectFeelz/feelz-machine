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
 * THE ANNOUNCEMENT, AND THE SWITCH THAT ENDS IT
 *
 * Until the Paystack account is live, this renders an announcement instead of
 * a button: rand payments are coming, and there is nothing here to press. That
 * matters more than it looks. A button that opens a checkout which cannot take
 * a real card leaves a buyer who believes they paid and received nothing, and
 * no amount of explaining afterwards undoes that.
 *
 * What decides it is the public key itself. REACT_APP_PAYSTACK_PUBLIC_KEY is
 * baked into the bundle at build time, so the day the live key replaces the
 * test one and the site rebuilds, the announcement becomes a button on its
 * own. There is no flag to remember and no second deploy to forget.
 *
 * REACT_APP_PAYSTACK_ALLOW_TEST=true turns the button back on against a test
 * key, for working on the flow deliberately. It is an environment variable
 * rather than anything a visitor can reach.
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

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Live only when the key says live. Anything else, including a missing key,
// is treated as not live, so the failure direction is always the safe one.
const PUBLIC_KEY = process.env.REACT_APP_PAYSTACK_PUBLIC_KEY || '';
const ALLOW_TEST = process.env.REACT_APP_PAYSTACK_ALLOW_TEST === 'true';
const PAYSTACK_IS_LIVE = PUBLIC_KEY.startsWith('pk_live_') || ALLOW_TEST;

// PAYING WITHOUT LEAVING THE APP.
//
// Sending the buyer to checkout.paystack.com works, and it is still the
// fallback below, but on an installed app it ends badly. The checkout is
// outside the app's scope, so the phone opens it in a separate in-app
// browser. When Paystack finishes it redirects to /payment/success, which IS
// inside the scope, so the phone hands that address to the app. The in-app
// browser is left behind on the checkout url, reloads it, and Paystack
// answers honestly that the transaction is already completed. The first
// buyer paid, got her download, and the last thing she saw was a warning
// triangle saying the transaction could not be started.
//
// Paystack's inline checkout opens in an overlay on this page instead, so
// there is no second browser and nothing to hand back.
const INLINE_SRC = 'https://js.paystack.co/v2/inline.js';
let inlinePromise = null;

function loadInline() {
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop);
  if (inlinePromise) return inlinePromise;

  inlinePromise = new Promise((resolve) => {
    const done = () => resolve(window.PaystackPop || null);
    const existing = document.getElementById('paystack-inline-js');
    if (existing) { existing.addEventListener('load', done); existing.addEventListener('error', () => resolve(null)); return; }

    const el = document.createElement('script');
    el.id = 'paystack-inline-js';
    el.src = INLINE_SRC;
    el.async = true;
    el.onload = done;
    // A blocked or failed script is not an error worth showing anybody. It
    // just means this buyer takes the redirect, which is what every buyer
    // did until now.
    el.onerror = () => resolve(null);
    document.head.appendChild(el);
  });
  return inlinePromise;
}

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
  // Set this false on a screen that is too tight for the announcement. The
  // button never appears there either way; this only decides whether the
  // notice does.
  announceWhenComingSoon = true,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Set once the checkout says this artist has no Paystack account. From then
  // on the button is gone for this screen.
  const [unavailable, setUnavailable] = useState(false);
  // SAY SO BEFORE GOING.
  //
  // The button used to vanish the instant the checkout refused, which reads as
  // a broken button: you press it and the screen simply loses a control, with
  // nothing to say why. Removing it IS right, the PayPal buttons are already
  // there and a permanent notice on every PayPal-only artist is noise. But the
  // person who pressed it deserves a sentence first.
  //
  // So the refusal shows for six seconds, then the component removes itself as
  // it always did.
  const [notice, setNotice] = useState('');
  const [askEmail, setAskEmail] = useState(false);
  const [email, setEmail] = useState(emailProp || '');
  // Set while the Paystack overlay is open, so the button can say so and the
  // watcher below knows what reference to ask about.
  const [awaiting, setAwaiting] = useState(null);
  // The rand price, asked for before the buyer commits to anything.
  const [quote, setQuote] = useState(null);

  // Declared above every early return below it, because a hook cannot be
  // skipped on one render and run on the next.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setUnavailable(true), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // ASK THE SERVER, DO NOT BELIEVE THE BROWSER.
  //
  // Paystack documents resumeTransaction as taking an access code and nothing
  // else. Callbacks are passed below because they cost nothing if ignored,
  // but nothing is built on them: a payment is paid when the webhook says so,
  // and that is the same rule the redirect path has always followed.
  //
  // So while the overlay is open this asks the checkout function what the
  // intent row says, every four seconds, for four minutes. It stops the
  // moment the answer is anything final, and it does not ask at all while the
  // tab is in the background.
  useEffect(() => {
    if (!awaiting) return undefined;

    let stopped = false;
    const giveUpAt = Date.now() + 240000;

    const ask = async () => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/.netlify/functions/paystack-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status', reference: awaiting }),
        });
        if (!res.ok) return;
        const { status } = await res.json();
        if (status === 'paid') {
          stopped = true;
          window.location.assign('/payment/success?ref=' + encodeURIComponent(awaiting));
        } else if (status === 'abandoned') {
          stopped = true;
          setAwaiting(null);
          setBusy(false);
        }
      } catch {
        // A failed poll is not a failed payment. Ask again next time.
      }
    };

    const timer = setInterval(() => {
      if (stopped || Date.now() > giveUpAt) { clearInterval(timer); return; }
      ask();
    }, 4000);

    return () => { stopped = true; clearInterval(timer); };
  }, [awaiting]);

  // SAY THE PRICE BEFORE THEY LEAVE.
  //
  // A button that reads "Pay in rand" and then sends somebody to a checkout
  // to discover the number is a button people do not press. This asks what it
  // would cost, in rand, and puts it on the button.
  //
  // It starts nothing: the quote action makes no intent row and no call to
  // Paystack. A failed quote is not an error worth showing, the button simply
  // keeps its plain label.
  useEffect(() => {
    if (!PAYSTACK_IS_LIVE) return undefined;
    if (!trackId && !albumId) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/.netlify/functions/paystack-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'quote',
            trackId, albumId,
            ...(licenceId ? { licenceId } : {}),
            ...(Number(amount) > 0 ? { amount: Number(amount) } : {}),
          }),
        });
        if (!res.ok) return;
        const q = await res.json();
        if (!cancelled && q && q.available && q.zar > 0) setQuote(q);
      } catch {
        // No quote, no number on the button. Nothing else changes.
      }
    })();
    return () => { cancelled = true; };
  }, [trackId, albumId, licenceId, amount]);

  if (unavailable) return null;
  if (!trackId && !albumId) return null;

  // Nothing below this line can start a payment while the account is not live.
  if (!PAYSTACK_IS_LIVE) {
    if (!announceWhenComingSoon) return null;
    return (
      <div className="w-full px-4 py-2.5 rounded-xl text-sm text-center text-white/40
                      bg-white/[0.03] border border-white/10 select-none">
        Paying in rand is coming soon
      </div>
    );
  }

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
        // This artist is paid through PayPal. Not an error, so it is not
        // styled as one: it explains itself and then gets out of the way.
        setNotice('Card payments in rand are not available for this artist. Use the PayPal button above.');
        setBusy(false);
        onUnavailable?.();
        return;
      }

      // The server keeps its own copy of the live check, and it is the one
      // that counts. If a stale bundle reaches a visitor after the key has
      // been rolled back, this is what stops it.
      if (res.status === 503 && data.error === 'paystack_not_live') {
        setNotice('Paying in rand is not available right now. Use the PayPal button above.');
        setBusy(false);
        onUnavailable?.();
        return;
      }

      if (!res.ok || !data.authorizationUrl) {
        throw new Error(data.message || 'This payment could not be started.');
      }

      const ref = data.reference;

      // The overlay, if Paystack's script is reachable and gave us a code.
      if (data.accessCode) {
        const Pop = await loadInline();
        if (Pop) {
          try {
            const popup = new Pop();
            setAwaiting(ref);
            // The options object is undocumented for resumeTransaction. If
            // Paystack reads it, the buyer moves on the instant they are
            // done; if it ignores it, the watcher above gets there within
            // four seconds. Either way the webhook is what decided.
            popup.resumeTransaction(data.accessCode, {
              onSuccess: () => window.location.assign('/payment/success?ref=' + encodeURIComponent(ref)),
              onCancel: () => { setAwaiting(null); setBusy(false); },
              onError: () => { setAwaiting(null); window.location.href = data.authorizationUrl; },
            });
            return;
          } catch (inlineErr) {
            // Whatever went wrong opening the overlay, the redirect still
            // works. It is the path every sale took until tonight.
            console.error('[PayInRandButton] inline checkout failed, redirecting:', inlineErr);
            setAwaiting(null);
          }
        }
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

  if (notice) {
    return (
      <div className="w-full px-4 py-2.5 rounded-xl text-xs text-center text-white/45
                      bg-white/[0.03] border border-white/10 select-none">
        {notice}
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
        {awaiting
          ? 'Waiting for payment\u2026'
          : busy
            ? 'Starting\u2026'
            : quote
              ? `Pay R${quote.zar} by card`
              : label}
      </button>
      {/* What the extra rand is. Said here rather than discovered on the
          Paystack page, and said the same way the PayPal breakdown says it:
          the artist's price, then the processing on top. */}
      {quote && !busy && !awaiting ? (
        <p className="text-[11px] text-white/35 text-center leading-relaxed">
          R{quote.artistZar} to the artist, R{(quote.zar - quote.artistZar).toFixed(2).replace(/\.00$/, '')} card processing
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}