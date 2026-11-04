/**
 * src/hooks/useRandQuote.js
 *
 * One question, asked once per selling screen: what does this cost in rand,
 * and is this seller paid in rand at all?
 *
 *
 * WHY THIS IS NOT INSIDE PayInRandButton
 *
 * The button used to ask for its own quote, which was fine while the answer
 * only changed the button's own label. It no longer does. The answer now
 * decides which payment option a screen puts first, so the screen has to know
 * it before it lays itself out, and the button cannot be the one holding it.
 *
 * So the hook holds it, src/components/PayOptions.js reads it to decide the
 * order, and the button is handed the result instead of fetching a second
 * copy of it. One request per screen, same as before.
 *
 *
 * WHAT sellerTakesRand MEANS
 *
 *   true   the seller has a Paystack subaccount. Rand is how they get paid,
 *          so rand is the primary way to buy from them.
 *   false  the seller is paid another way. No rand option is offered at all,
 *          which is the end of the old press-it-and-find-out behaviour.
 *   null   could not be determined: the quote failed, the function is older
 *          than this field, or Paystack is not live in this build. The screen
 *          keeps the layout it had before any of this existed.
 *
 * null is deliberately not folded into false. They look the same on a screen
 * for one render and mean opposite things: one is "this artist does not take
 * rand", the other is "we do not know yet", and only the first should ever
 * remove a payment option.
 *
 *
 * THE LIVE GATE
 *
 * Same rule as the button: nothing is asked and nothing is offered unless the
 * public key is a live one. A quote is harmless, it starts no payment and
 * writes no row, but a screen that reorders itself around a rand option that
 * cannot take a card is worse than one that never mentions rand.
 */

import { useState, useEffect } from 'react';

const PUBLIC_KEY = process.env.REACT_APP_PAYSTACK_PUBLIC_KEY || '';
const ALLOW_TEST = process.env.REACT_APP_PAYSTACK_ALLOW_TEST === 'true';

// Exported so PayOptions and the button agree on it without a third copy of
// the rule. Anything that is not a live key, a missing key included, counts as
// not live, so the failure direction is always the safe one.
export const PAYSTACK_IS_LIVE = PUBLIC_KEY.startsWith('pk_live_') || ALLOW_TEST;

const IDLE = { quote: null, sellerTakesRand: null, loading: false };

export default function useRandQuote({
  trackId = null,
  albumId = null,
  licenceId = null,
  amount = null,
} = {}) {
  const [state, setState] = useState({ quote: null, sellerTakesRand: null, loading: true });

  useEffect(() => {
    // Nothing to price, or nothing that could take the payment. Resolved to
    // idle rather than left loading, so a screen is never waiting on an
    // answer that is not coming.
    if (!PAYSTACK_IS_LIVE || (!trackId && !albumId)) {
      setState(IDLE);
      return undefined;
    }

    let cancelled = false;
    setState({ quote: null, sellerTakesRand: null, loading: true });

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

        if (!res.ok) {
          if (!cancelled) setState(IDLE);
          return;
        }

        const q = await res.json();
        if (cancelled) return;

        setState({
          // Only a quote that can actually be charged is a quote. Below
          // Paystack's minimum, or priced at zero, and there is no number to
          // put on a button.
          quote: q && q.available && q.zar > 0 ? q : null,
          // A function deployed before this field existed returns undefined,
          // which is a "cannot tell", not a no.
          sellerTakesRand: typeof q?.sellerTakesRand === 'boolean' ? q.sellerTakesRand : null,
          loading: false,
        });
      } catch {
        // A failed quote is not an error worth showing anybody. The screen
        // simply looks the way it did before.
        if (!cancelled) setState(IDLE);
      }
    })();

    return () => { cancelled = true; };
  }, [trackId, albumId, licenceId, amount]);

  return state;
}
