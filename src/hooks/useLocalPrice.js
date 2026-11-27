// src/hooks/useLocalPrice.js
//
// What a price costs in the money the reader actually uses.
//
// WHY THIS EXISTS AS A HOOK
//
// /upgrade converted prices to local currency and the About page did not. It
// printed a hard-coded dollar sign, so somebody in Johannesburg read "$42 a
// year" on the page that is meant to sell them the plan, then saw R754 on the
// page where they pay. Two different numbers for the same thing.
//
// The detection was already written once, inside TierUpgradePage. Copying it
// into the About page would have made a second copy to keep in step, which is
// the same mistake that let platform_tiers charge 20 a year while the page
// quoted 17. So it moved here and both pages read it.
//
// THE TOGGLE
//
// Detection is a guess. A VPN, a roaming phone, a South African working from
// London: any of them see the wrong money and have no way to say so. So the
// reader can switch, and the choice is remembered.
//
// Local is the default when a rate is available, because most people are
// where they appear to be. Nothing here decides what anybody is CHARGED:
// PayPal takes dollars and Paystack takes rand regardless of what is on
// screen. This only picks the number the reader sees.

import { useCallback, useEffect, useState } from 'react';

// Country code -> how to write money there.
export const CURRENCY_MAP = {
  ZA: { currency: 'ZAR', symbol: 'R',   locale: 'en-ZA' },
  NG: { currency: 'NGN', symbol: '₦',   locale: 'en-NG' },
  GH: { currency: 'GHS', symbol: 'GH₵', locale: 'en-GH' },
  KE: { currency: 'KES', symbol: 'KSh', locale: 'en-KE' },
  GB: { currency: 'GBP', symbol: '£',   locale: 'en-GB' },
  EU: { currency: 'EUR', symbol: '€',   locale: 'en-EU' }, // fallback for EU
  DE: { currency: 'EUR', symbol: '€',   locale: 'de-DE' },
  FR: { currency: 'EUR', symbol: '€',   locale: 'fr-FR' },
  AU: { currency: 'AUD', symbol: 'A$',  locale: 'en-AU' },
  CA: { currency: 'CAD', symbol: 'C$',  locale: 'en-CA' },
  US: { currency: 'USD', symbol: '$',   locale: 'en-US' },
};
export const DEFAULT_CURRENCY = { currency: 'USD', symbol: '$', locale: 'en-US' };

const STORE_KEY = 'fm_price_currency';   // 'local' | 'usd'

// Per-browser convenience only, so a failure here changes nothing that
// matters. Private windows and blocked site data both throw on read.
function readChoice() {
  try { return window.localStorage.getItem(STORE_KEY); } catch { return null; }
}
function writeChoice(v) {
  try { window.localStorage.setItem(STORE_KEY, v); } catch { /* not important */ }
}

export default function useLocalPrice() {
  const [geoRate, setGeoRate]       = useState(1);
  const [geoInfo, setGeoInfo]       = useState(null);
  const [geoLoading, setGeoLoading] = useState(true);
  const [forcedUsd, setForcedUsd]   = useState(() => readChoice() === 'usd');

  useEffect(() => {
    let dead = false;
    const detect = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) throw new Error('Geo detection failed');
        const data = await res.json();
        const info = CURRENCY_MAP[data.country_code] || DEFAULT_CURRENCY;

        if (info.currency !== 'USD') {
          try {
            const rateRes  = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const rateData = await rateRes.json();
            const rate     = rateData.rates?.[info.currency];
            if (dead) return;
            if (rate && rate > 0) {
              setGeoRate(rate);
              setGeoInfo(info);          // only local money once a rate exists
            } else {
              setGeoInfo(DEFAULT_CURRENCY);
            }
          } catch {
            if (!dead) setGeoInfo(DEFAULT_CURRENCY);
          }
        } else if (!dead) {
          setGeoInfo(info);
        }
      } catch {
        if (!dead) setGeoInfo(DEFAULT_CURRENCY);
      }
      if (!dead) setGeoLoading(false);
    };
    detect();
    return () => { dead = true; };
  }, []);

  // A local price can only be offered when the country is known AND a rate
  // came back. Without both, there is nothing to toggle to.
  const localAvailable = !!geoInfo && geoInfo.currency !== 'USD' && geoRate > 0 && geoRate !== 1;
  const usingUsd  = forcedUsd || !localAvailable;
  const currency  = usingUsd ? DEFAULT_CURRENCY : geoInfo;
  const rate      = usingUsd ? 1 : geoRate;

  // Small amounts keep their cents, because R88,50 rounded to R89 looks like
  // a different price from the one on the payment button. Larger ones round,
  // because R1 754,00 is harder to read than R1 754.
  const format = useCallback((usd) => {
    const n = Number(usd);
    if (!Number.isFinite(n)) return '';
    const converted = n * rate;
    const amount = converted < 10
      ? converted.toFixed(2)
      : Math.round(converted).toLocaleString(currency.locale);
    return `${currency.symbol}${amount}`;
  }, [rate, currency]);

  const setCurrency = useCallback((which) => {
    setForcedUsd(which === 'usd');
    writeChoice(which === 'usd' ? 'usd' : 'local');
  }, []);

  return {
    geoRate, geoInfo, geoLoading,
    localAvailable,
    currency,
    usingUsd,
    format,
    setCurrency,
  };
}
