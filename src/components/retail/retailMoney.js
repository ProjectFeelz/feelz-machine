// src/components/retail/retailMoney.js
//
// One place that decides how a retail price is written.
//
//
// WHY THIS FILE EXISTS
//
// The Pricing tab suggests what to charge a venue. The Venues tab sets what
// that venue is actually charged. Those two numbers are read minutes apart by
// the same person, and until now each screen formatted its own: Venues hard
// coded `$${fee} / month`, Pricing had its own dollar sign.
//
// Two screens formatting the same quantity separately is how somebody reads
// R450 on one and types 450 into the other. The currency now lives on the row
// in both tables (migration 217), and both screens read it through here, so
// they cannot disagree about what a number means.
//
// Add a currency in CURRENCIES and both screens learn it at once. That is the
// whole point of the file: there is no second place to update.

export const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'USD', processor: 'PayPal' },
  { code: 'ZAR', symbol: 'R', label: 'ZAR', processor: 'Paystack' },
];

export const DEFAULT_CURRENCY = 'USD';

const byCode = Object.fromEntries(CURRENCIES.map(c => [c.code, c]));

export const currencyOf = (code) => byCode[code] || byCode[DEFAULT_CURRENCY];

/**
 * A single amount, e.g. $40 or R750.
 *
 * `decimals` defaults to 0 because retail fees are whole-unit monthly prices
 * and "$40.00 / month" reads like a bill rather than a price. Pass 2 where
 * the cents matter, such as a payout figure.
 */
export function price(amount, code = DEFAULT_CURRENCY, decimals = 0) {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `${currencyOf(code).symbol}${n.toFixed(decimals)}`;
}

/**
 * A range, which may be open at either end: "$40 – $80", "from $40", "up to $80".
 *
 * Worded rather than printed as "40 – " because a dash trailing into nothing
 * reads as a missing number, and "from $40" is what a person would say.
 */
export function priceRange(min, max, code = DEFAULT_CURRENCY) {
  const hasMin = min != null && min !== '';
  const hasMax = max != null && max !== '';
  if (!hasMin && !hasMax) return '—';
  if (hasMin && hasMax)   return `${price(min, code)} – ${price(max, code)}`;
  if (hasMin)             return `from ${price(min, code)}`;
  return `up to ${price(max, code)}`;
}

/** "$40 / month", the form both screens use for a recurring fee. */
export const perMonth = (amount, code = DEFAULT_CURRENCY) =>
  amount == null || amount === '' ? '—' : `${price(amount, code)} / month`;
