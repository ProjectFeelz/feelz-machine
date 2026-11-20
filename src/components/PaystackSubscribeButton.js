/**
 * src/components/PaystackSubscribeButton.js
 *
 * Pay for a plan in rand, with a South African card.
 *
 * Sits next to the PayPal button on both upgrade pages. One component for both
 * because the only difference between an artist plan and Fan Pro, from the
 * browser's side, is one word in the request.
 *
 * It shows nothing at all until the server says rand payments are switched on
 * AND gives a price for this exact plan and cycle. A button that appears and
 * then fails is worse than no button, and the price shown here is the price
 * the server will charge, because both come from the same answer.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Loader, CreditCard } from 'lucide-react';
import { supabase } from '../supabaseClient';

const ENDPOINT = '/.netlify/functions/tier-paystack-subscription';

async function callEndpoint(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export default function PaystackSubscribeButton({
  subject = 'artist',   // 'artist' or 'fan'
  tier,                 // 'pro' | 'premium' | 'fan_pro'
  cycle = 'monthly',
  accent = '#8b5cf6',
  onError,
}) {
  const [price, setPrice]   = useState(null);
  const [ready, setReady]   = useState(false);
  const [busy, setBusy]     = useState(false);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { ok, json } = await callEndpoint({ action: 'status', subject });
        if (cancelled || !alive.current) return;
        if (!ok || !json.paystackLive) { setReady(false); return; }
        const found = json.prices && json.prices[`${tier}_${cycle}`];
        if (found && found.zar > 0) setPrice(found);
        setReady(Boolean(found && found.zar > 0));
      } catch {
        // Silent on purpose. Rand payment is an extra way to pay, so if this
        // cannot be worked out the page still shows PayPal and works.
        if (!cancelled) setReady(false);
      }
    })();
    return () => { cancelled = true; };
  }, [subject, tier, cycle]);

  if (!ready || !price) return null;

  const start = async () => {
    setBusy(true);
    try {
      const { ok, json } = await callEndpoint({ action: 'start', subject, tier, cycle });
      if (!ok || !json.authorizationUrl) {
        setBusy(false);
        onError?.(json.message || 'Card payment could not be opened. Try again shortly.');
        return;
      }
      // Paystack's own hosted page. We never see or hold card details.
      window.location.href = json.authorizationUrl;
    } catch {
      setBusy(false);
      onError?.('Card payment could not be opened. Try again shortly.');
    }
  };

  const rand = Number(price.zar).toFixed(2);
  const per = cycle === 'annual' ? 'a year' : 'a month';

  return (
    <div className="mt-2">
      <button
        onClick={start}
        disabled={busy}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition active:scale-[0.98]
                   flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ backgroundColor: `${accent}1f`, color: accent, border: `1px solid ${accent}33` }}
      >
        {busy ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            Opening card payment
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            Pay R{rand} {per} by card
          </>
        )}
      </button>
      <p className="text-[11px] text-white/25 text-center mt-1.5 leading-relaxed">
        For South African cards. Charged in rand, so your bank adds no conversion fee.
      </p>
    </div>
  );
}
