import { useEffect, useRef } from 'react';

/**
 * Coming back from Paystack's hosted page.
 *
 * Paying by card is not like paying with PayPal. The PayPal button stays on
 * the page and hands back a subscription id, so there is a moment to record.
 * The card button sends the browser away to Paystack entirely, and Paystack
 * sends it back to `?billing=started`. Nothing read that parameter, so every
 * rand subscription arrived back on the plan list as though nothing had
 * happened: no receipt, nothing recorded, and the buyer left wondering whether
 * their money had gone anywhere.
 *
 * The subscription is switched on by paystack-webhook, on the server, so it
 * may not be in the table the instant the browser returns.
 *
 * WHY THIS KEEPS GOING AFTER IT HAS SPOKEN
 *
 * The first version stopped asking after about twenty seconds and told the
 * buyer to refresh. A person who has just paid should not be given a chore,
 * and a person who does not do the chore is left believing it failed. So the
 * message now appears at twenty seconds and the asking carries on behind it
 * for another minute or so. When the webhook lands, the page switches itself
 * to the receipt and the message is replaced. Nobody refreshes anything.
 *
 *   ready     - wait until the page knows who it is looking at
 *   check     - async, answers the current tier slug ('free' if none)
 *   onPaid    - called once, with the slug, when it lands
 *   onPending - called once, with Paystack's reference, if it is slow. Polling
 *               continues afterwards, so onPaid may still follow.
 */
export default function usePaystackReturn({ ready, check, onPaid, onPending }) {
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') !== 'started') return;
    done.current = true;

    // Paystack appends its own reference to the callback url. Worth keeping:
    // it is the only thing a buyer whose plan never arrives can quote, and the
    // only thing support can search paystack_intents by.
    const reference = params.get('reference') || params.get('trxref') || null;

    // Out of the address bar immediately, so a refresh or a pasted link does
    // not run this a second time and record a second payment. Only `billing`
    // is removed, so the reference stays visible if somebody screenshots it.
    params.delete('billing');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));

    let stop = false;
    (async () => {
      // Gaps widen rather than repeat, so a webhook that lands in two seconds
      // is caught almost at once and one that takes a minute is still caught,
      // without hammering the table ninety times. Cumulative: about 95s.
      const waits  = [0, 1500, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 15000, 15000];
      // The point at which the buyer is told it is coming. Around twenty
      // seconds in, which is where the old schedule used to give up entirely.
      const SPEAK_AFTER = 6;
      let spoke = false;

      for (let i = 0; i < waits.length; i++) {
        if (stop) return;
        if (waits[i]) await new Promise(r => setTimeout(r, waits[i]));
        let slug = null;
        try { slug = await check(); } catch { /* the next attempt can have it */ }
        if (stop) return;
        if (slug && slug !== 'free') { onPaid(slug); return; }

        // Say something, then keep looking. The message is replaced by the
        // receipt if a later attempt finds it.
        if (!spoke && i >= SPEAK_AFTER) {
          spoke = true;
          onPending?.(reference);
        }
      }
      // Ran out of attempts without it appearing. onPending has already been
      // called, so the buyer is not staring at an unchanged page; there is
      // nothing further this side can do.
    })();

    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
