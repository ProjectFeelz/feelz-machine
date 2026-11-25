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
 * may not be in the table the instant the browser returns. This asks a few
 * times across about twenty seconds. If it still is not there it says so
 * plainly, because "we have your payment and it is coming" is a far better
 * thing to read than an unchanged page.
 *
 *   ready  - wait until the page knows who it is looking at
 *   check  - async, answers the current tier slug ('free' if none)
 *   onPaid - called once, with the slug, when it lands
 */
export default function usePaystackReturn({ ready, check, onPaid, onPending }) {
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') !== 'started') return;
    done.current = true;

    // Out of the address bar immediately, so a refresh or a pasted link does
    // not run this a second time and record a second payment.
    params.delete('billing');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));

    let stop = false;
    (async () => {
      const waits = [0, 1500, 3000, 4000, 5000, 6000];
      for (const wait of waits) {
        if (stop) return;
        if (wait) await new Promise(r => setTimeout(r, wait));
        let slug = null;
        try { slug = await check(); } catch { /* the next attempt can have it */ }
        if (stop) return;
        if (slug && slug !== 'free') { onPaid(slug); return; }
      }
      if (!stop) onPending?.();
    })();

    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
