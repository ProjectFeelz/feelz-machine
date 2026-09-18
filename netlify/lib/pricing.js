/**
 * netlify/lib/pricing.js
 *
 * THE ARTIST RECEIVES THE PRICE THEY SET.
 *
 *
 * WHAT WAS HAPPENING
 *
 * The buyer was charged tracks.download_price exactly, and then the artist was
 * paid that price minus PayPal's fee minus the platform's 20%. Across the first
 * four sales that worked out at 69.5% of what the buyer paid reaching the
 * artist: $10.33 in, $1.81 to PayPal, $1.34 to the platform, $7.18 to artists.
 *
 * The 20% was believed to be covering PayPal's fee on the artist's behalf. It
 * was not, and it could not have been — nothing was ever added to the buyer's
 * side to fund it, so it could only ever come out of the artist's share.
 *
 * A fee can be absorbed by the seller, or paid by the buyer. It cannot be
 * conjured. This module implements the second: the buyer pays the processing
 * cost as a visible line item, and the artist's set price arrives intact.
 *
 *
 * THE ARITHMETIC
 *
 * PayPal charges a percentage plus a fixed amount per transaction. To leave
 * exactly `artistPrice` behind after both:
 *
 *     buyerPays = (artistPrice + fixedFee) / (1 - percentFee/100)
 *
 * Worked, with the defaults below (5.4% + $0.30) and a $2.00 track:
 *
 *     buyerPays   = (2.00 + 0.30) / 0.946   = 2.4313  -> 2.43
 *     PayPal takes  5.4% of 2.43 + 0.30     = 0.4312
 *     artist gets   2.43 - 0.4312           = 1.9988  -> 2.00
 *
 * The rounding to cents means it lands within a cent, sometimes a hair over,
 * never meaningfully under. Erring a fraction of a cent in the artist's favour
 * is the right direction for a rounding error to go.
 *
 *
 * WHERE THE RATE COMES FROM
 *
 * platform_settings, so it changes with an UPDATE and no deploy — the same
 * pattern as the commission rate. It is NOT hardcoded, because PayPal's cut
 * varies by buyer country and by currency conversion, and a number derived from
 * four South African sales is not a law of nature.
 *
 * The defaults are backed out of those four sales: $1.81 on $10.33 across four
 * transactions is consistent with roughly 5.4% + $0.30, which is PayPal's
 * commercial cross-border shape. Treat them as a starting point to be corrected
 * once there are more sales to measure, not as a finding.
 *
 *
 * WHEN THE FEE IS ZERO
 *
 * Set buyer_service_fee_percent and buyer_service_fee_fixed to 0 and everything
 * here becomes a no-op: the buyer is charged the listed price, exactly as
 * before. That is the off switch, and it needs no code change.
 */

const DEFAULTS = {
  percent: 5.4,
  fixed:   0.30,
  // A ceiling, so a fat-fingered UPDATE cannot double someone's price.
  //
  // It has to be percentage PLUS an allowance for the fixed fee, not a flat
  // percentage. A flat 25% cap looks sensible until you price a $1 track: a
  // $0.30 per-transaction fee is 30% of that sale, legitimately, so a flat cap
  // clamps the honest case and quietly leaves the artist short on every cheap
  // track. Caught by the test table rather than by a musician noticing they
  // were paid $0.88 on a $1 sale.
  //
  //     ceiling = price * 1.25  +  fixedFee * 1.25
  //
  // Generous enough that no plausible PayPal rate trips it, tight enough that
  // percent=45 fixed=9 does.
  maxUpliftPercent:   25,
  maxFixedMultiplier: 1.25,
};

const KEY_PERCENT = 'buyer_service_fee_percent';
const KEY_FIXED   = 'buyer_service_fee_fixed';

/**
 * Read the configured fee. Never throws: an unreadable setting falls back to
 * charging the listed price with no uplift, because over-charging a buyer
 * because a database read failed is the worse of the two errors.
 */
async function getServiceFee(supabase) {
  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', [KEY_PERCENT, KEY_FIXED]);

    if (error) {
      console.error('[pricing] could not read the service fee settings, charging the listed price:',
        error.code, error.message);
      return { percent: 0, fixed: 0, source: 'unreadable' };
    }

    const map = Object.fromEntries((data || []).map(r => [r.key, r.value]));

    // Absent is not the same as zero. A missing key means migration 128 has not
    // run, and the honest behaviour then is the old one: charge the listed
    // price. Silently applying a default uplift to live checkouts because a row
    // is missing is exactly the kind of surprise this module exists to avoid.
    if (map[KEY_PERCENT] === undefined && map[KEY_FIXED] === undefined) {
      console.warn('[pricing] service fee settings not found — run migration 128. Charging the listed price.');
      return { percent: 0, fixed: 0, source: 'not_configured' };
    }

    const percent = Math.max(0, Math.min(50, parseFloat(map[KEY_PERCENT] ?? DEFAULTS.percent) || 0));
    const fixed   = Math.max(0, Math.min(10, parseFloat(map[KEY_FIXED]   ?? DEFAULTS.fixed)   || 0));
    return { percent, fixed, source: 'settings' };
  } catch (e) {
    console.error('[pricing] service fee read threw, charging the listed price:', e.message);
    return { percent: 0, fixed: 0, source: 'threw' };
  }
}

/**
 * Gross a price up so the seller nets it.
 *
 * @param {number} artistPrice  what the artist set, and what they should receive
 * @param {{percent:number, fixed:number}} fee
 * @returns {{artistPrice, serviceFee, buyerPays, feePercent, feeFixed, capped}}
 */
function grossUp(artistPrice, fee) {
  const base = Math.max(0, Number(artistPrice) || 0);
  const pct  = Math.max(0, Number(fee?.percent) || 0);
  const fix  = Math.max(0, Number(fee?.fixed)   || 0);

  if (base <= 0 || (pct === 0 && fix === 0)) {
    return {
      artistPrice: round2(base),
      serviceFee:  0,
      buyerPays:   round2(base),
      feePercent:  pct,
      feeFixed:    fix,
      capped:      false,
    };
  }

  // pct can never reach 100 — clamped to 50 on read — so this cannot divide by
  // zero or go negative.
  let buyerPays = (base + fix) / (1 - pct / 100);
  let capped    = false;

  const ceiling = base * (1 + DEFAULTS.maxUpliftPercent / 100)
                + fix * DEFAULTS.maxFixedMultiplier;
  if (buyerPays > ceiling) {
    console.error('[pricing] computed uplift exceeds the cap — check platform_settings.',
      { artistPrice: base, percent: pct, fixed: fix, computed: buyerPays, ceiling });
    buyerPays = ceiling;
    capped    = true;
  }

  // The buyer's total is the rounded figure, and the fee is whatever the
  // difference turns out to be. Derived in this direction on purpose: rounding
  // both parts separately is how a breakdown ends up not summing to the total,
  // which PayPal rejects the order for.
  const total = round2(buyerPays);
  return {
    artistPrice: round2(base),
    serviceFee:  round2(total - round2(base)),
    buyerPays:   total,
    feePercent:  pct,
    feeFixed:    fix,
    capped,
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Convenience: read the fee and apply it in one call.
 */
async function quote(supabase, artistPrice) {
  const fee = await getServiceFee(supabase);
  return { ...grossUp(artistPrice, fee), feeSource: fee.source };
}

module.exports = { DEFAULTS, KEY_PERCENT, KEY_FIXED, getServiceFee, grossUp, quote, round2 };