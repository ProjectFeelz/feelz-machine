/**
 * src/components/PriceBreakdown.js
 *
 * ONE PLACE SHOWS WHAT A PURCHASE COSTS.
 *
 * The buyer now covers the payment processing so the artist receives the price
 * they set (netlify/lib/pricing.js). That means the number on the artist's page
 * and the number the buyer is charged are no longer the same, and the
 * difference has to be visible BEFORE the PayPal button, not discovered at
 * PayPal. Showing $2.00 on our page and $2.43 on theirs is how a platform gets
 * accused of skimming, which is the reverse of what this change is for.
 *
 * Six screens can start a purchase: the artist page (two modals), the track
 * action sheet, the paid-play gate, the beat page and the album page. The
 * comment at the top of netlify/functions/paypal-order.js describes what
 * happened the last time each of those screens had its own idea of a price —
 * five different prices, three of them wrong. This is the same lesson applied
 * to the display: every screen asks the server what it costs, through this one
 * hook, and none of them does the arithmetic itself.
 *
 * The figures come from paypal-order's `quote` action, which resolves the price
 * through exactly the same code path `create` does. A quote that computed the
 * price a second way is a quote that will eventually disagree with the
 * checkout.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Ask the server what a purchase will cost.
 *
 * Returns { quote, loading, refresh }. `quote` is null until an answer arrives
 * and stays null on any failure — every caller renders the artist's price alone
 * in that case, which is what every screen showed before this existed. A broken
 * quote must never block a sale or hide a price.
 *
 * @param {object|null} params  { trackId } | { albumId } | { trackId, licenceId }
 *                              | { trackId, amount } for pay-what-you-want.
 *                              Pass null to clear.
 * @param {number} debounceMs   for a value the buyer is typing.
 */
export function useQuote(params, debounceMs = 0) {
  const [quote, setQuote]     = useState(null);
  const [loading, setLoading] = useState(false);

  // The key is what decides whether this is a NEW question or the same one
  // asked again during a re-render. Without it, a parent that re-renders on
  // every keystroke re-fetches on every keystroke.
  const key = params ? JSON.stringify(params) : null;

  // Guards a stale answer overwriting a fresh one: two quotes in flight can
  // come back out of order, and the older one landing last would show a total
  // that does not match the amount on screen.
  const latest = useRef(0);

  const run = useCallback(async (p) => {
    if (!p) { setQuote(null); setLoading(false); return; }
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/paypal-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'quote', ...p }),
      });
      if (!res.ok) throw new Error('quote failed');
      const q = await res.json();
      if (ticket === latest.current) setQuote(q?.buyerPays ? q : null);
    } catch {
      if (ticket === latest.current) setQuote(null);
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!key) { setQuote(null); return; }
    const p = JSON.parse(key);
    // Cleared immediately, so a stale total is never shown beside a new amount
    // while the next answer is in flight.
    setQuote(null);
    if (!debounceMs) { run(p); return; }
    const t = setTimeout(() => run(p), debounceMs);
    return () => clearTimeout(t);
  }, [key, debounceMs, run]);

  return { quote, loading, refresh: () => run(params) };
}

/**
 * The three numbers. Renders nothing at all when there is no fee to explain —
 * either the quote has not arrived, or the service fee is off, in which case
 * the price already on screen is the whole story and a breakdown saying
 * "$2.00 + $0.00 = $2.00" is noise.
 *
 * Colours are passed in because the artist page is themed per artist. They
 * default to the app's own palette for every other screen.
 */
export default function PriceBreakdown({
  quote,
  sellerName,
  textColor      = '#ffffff',
  accentColor    = '#a78bfa',
  className      = '',
}) {
  if (!quote) return null;
  const fee = parseFloat(quote.serviceFee);
  if (!(fee > 0)) return null;

  const row = (label, value, strong) => (
    <div className={`flex items-center justify-between ${strong ? 'text-sm font-semibold pt-1.5' : 'text-xs'}`}
      style={strong ? { borderTop: `1px solid ${textColor}10` } : undefined}>
      <span style={{ color: strong ? textColor : `${textColor}50` }}>{label}</span>
      <span style={{ color: strong ? accentColor : textColor }}>${value}</span>
    </div>
  );

  return (
    <div className={`rounded-xl p-3 space-y-1.5 ${className}`}
      style={{ backgroundColor: `${textColor}05`, border: `1px solid ${textColor}10` }}>
      {row(`${sellerName || 'The artist'} receives`, quote.artistPrice)}
      {row('Payment processing', quote.serviceFee)}
      {row('You pay', quote.buyerPays, true)}
    </div>
  );
}