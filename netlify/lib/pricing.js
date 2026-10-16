/**
 * netlify/lib/pricing.js
 *
 * ONE PLACE CONVERTS A PRICE.
 *
 *
 * WHAT THIS IS AND, MORE USEFULLY, WHAT IT IS NOT
 *
 * Prices stay in dollars, exactly as they are stored today. Nothing is
 * repriced, no flag is flipped, and netlify/functions/paypal-order.js is not
 * touched. PayPal keeps charging dollars the way it always has.
 *
 * This file exists for one new thing: Paystack charges in rand, so the dollar
 * price on a track has to become a rand amount at the moment a South African
 * buyer pays. That conversion happens here, in the new code path only.
 *
 * An earlier draft of this file went the other way round, storing rand and
 * converting down to dollars for PayPal. That was the wrong call. It meant
 * repricing the whole catalogue, a migration flag, and editing the file that
 * handles live PayPal money, all before a single Paystack payment had ever
 * been taken. Three risky changes to ship one new feature. This direction
 * touches nothing that currently works.
 *
 * Pricing the catalogue in rand is still the right destination, because the
 * artists and the buyers are here. It is a later migration, worth doing once
 * Paystack is carrying real sales and the risk is worth taking. Not now.
 *
 *
 * WHEN THE EXCHANGE RATE MOVES
 *
 * The dollar price is fixed, so the rand price is what moves.
 *
 *   Rand weakens, 16.5 to 18.0   a $1.85 track goes from about R31 to R34.
 *                                South African buyers pay more rand for the
 *                                same track. The artist is unaffected in
 *                                dollar terms and receives more rand.
 *   Rand strengthens, 16.5 to 15 the same track drops to about R29.
 *
 * Two things keep that from being annoying. The rate is set by hand, so
 * nothing changes until the owner changes it: a buyer never sees a different
 * number between loading a page and pressing pay. And the margin below means
 * ordinary day-to-day drift does not need chasing, because the converted
 * price already sits slightly above the market rate.
 *
 * Updating it is one environment variable and a redeploy. Worth a look monthly
 * rather than daily. If the rand moves hard and the rate is stale, the only
 * consequence is that local buyers are paying slightly less than the dollar
 * price intends, which is a discount rather than a fault.
 */

// Rand per one dollar. No default on purpose: see assertRate.
const RAW_RATE = process.env.USD_ZAR_RATE ? Number(process.env.USD_ZAR_RATE) : null;

// Headroom on the conversion, as a percentage.
//
// Not a cut the platform keeps. The rand moves between the day this rate is
// set and the day it is next looked at, and without headroom every local sale
// in that window quietly pays the artist less than the dollar price says.
// Three percent absorbs ordinary drift. Set to 0 to convert at exactly the
// configured rate.
const FX_MARGIN_PCT = Number(process.env.USD_ZAR_MARGIN_PCT || 3);

/**
 * A rate that is missing, zero, negative or not a number is a configuration
 * error, and the only safe response is to refuse the sale.
 *
 * It would be easy to fall back to 1. That is the bug worth being afraid of:
 * it would charge R1.85 for a track meant to cost about R31, and look like a
 * working checkout while it did it. A checkout that fails is a buyer who tries
 * again in a minute. A checkout that charges a sixteenth of the price is money
 * the artist never sees and nobody notices for a month.
 */
function assertRate() {
  if (RAW_RATE === null || !Number.isFinite(RAW_RATE) || RAW_RATE <= 0) {
    throw new Error(
      'USD_ZAR_RATE is not set to a usable number, so a dollar price cannot be ' +
      'converted to rand for Paystack. Refusing rather than guessing a rate.'
    );
  }
  return RAW_RATE;
}

/**
 * Convert a stored dollar price to the rand amount to charge through Paystack.
 *
 * Rounded UP to a whole rand. Nobody prices anything at R30.53, and rounding
 * up rather than down means the conversion never shortchanges the artist.
 */
function usdToZar(usdAmount) {
  const usd = Number(usdAmount);
  if (!Number.isFinite(usd) || usd <= 0) return 0;

  const rate = assertRate();
  const zar = usd * rate * (1 + FX_MARGIN_PCT / 100);

  // Rounded to a hundredth first so binary floating point does not push an
  // exact value over the line: 1.1 * 100 is 110.00000000000001, and a bare
  // ceiling on that adds a whole rand that the arithmetic never earned.
  return Math.ceil(Math.round(zar * 100) / 100);
}

/**
 * Paystack takes integer minor units, so rand become cents. Handing it rand as
 * though they were cents undercharges by a factor of a hundred, which is the
 * single easiest mistake to make against this API.
 */
function zarToPaystackMinor(zarAmount) {
  const zar = Number(zarAmount);
  if (!Number.isFinite(zar) || zar <= 0) return 0;
  return Math.round(zar * 100);
}

/**
 * The whole path in one call, for the Paystack checkout: a stored dollar price
 * in, the integer the Paystack API wants out, plus the rand figure to show the
 * buyer so the page and the charge can never disagree.
 */
function usdToPaystackCharge(usdAmount) {
  const zar = usdToZar(usdAmount);
  return { zar, minor: zarToPaystackMinor(zar), currency: 'ZAR' };
}

/**
 * PayPal cannot take rand. ZAR is not among the 23 currencies it supports for
 * payments, which is why the Paystack path exists at all rather than simply
 * charging rand everywhere.
 */
function paypalCurrency() {
  return 'USD';
}

module.exports = {
  RAW_RATE,
  FX_MARGIN_PCT,
  assertRate,
  usdToZar,
  zarToPaystackMinor,
  usdToPaystackCharge,
  paypalCurrency,
};