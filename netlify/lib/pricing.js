/**
 * netlify/lib/pricing.js
 *
 * ONE PLACE CONVERTS A PRICE.
 *
 * Two jobs live here, and they are kept apart on purpose:
 *
 *   1. THE BUYER'S FEE. The artist receives the price they set, so the buyer
 *      covers the payment processing on top. getServiceFee, grossUp and quote
 *      do that arithmetic, and every paid surface on the platform asks them
 *      rather than working it out itself.
 *
 *   2. RAND. Paystack charges in rand, so a stored dollar price has to become
 *      a rand amount at the moment a South African buyer pays. usdToZar,
 *      zarToPaystackMinor and usdToPaystackCharge do that.
 *
 * Both halves have to stay in this one file because four functions require it
 * as a whole: paypal-order.js, tip-artist.js and merch-order.js call the fee
 * half, and paystack-checkout.js calls the rand half. Shipping a version of
 * this file carrying only one half takes down every purchase screen on the
 * site with "pricing.quote is not a function", which is exactly what happened
 * on 21 October 2026. If this file is ever rewritten again, the test is
 * whether all six exported names at the bottom survive.
 *
 *
 * PART ONE: THE BUYER PAYS THE PROCESSING
 *
 * The promise on the site is that the artist gets the number they are shown.
 * Before this existed, PayPal's cut came out of the artist's receipt: on the
 * defaults below a $2.00 sale arrived as $1.59 and a $1.00 tip as $0.65, with
 * the dashboard still displaying the face value and nothing anywhere
 * explaining the gap.
 *
 * So the price the artist sets is grossed up, the difference is shown to the
 * buyer as a separate line before the PayPal button opens, and the artist
 * nets what their page says. Showing $2.00 on our page and $2.43 on PayPal's
 * without explaining the difference is how a platform gets accused of
 * skimming, which is the reverse of what this is for. See
 * src/components/PriceBreakdown.js for the display side.
 *
 * The gross-up is the standard one. To net N after a processor takes p% plus
 * a flat f, the buyer is charged (N + f) / (1 - p/100). At 5.4% + $0.30 a
 * $2.00 price becomes $2.43: the processor takes $0.43 and the artist is left
 * holding $2.00.
 *
 * The percentage and the flat fee are read from platform_settings, so they
 * follow the processor's published rates without a deploy. At zero and zero
 * the buyer pays exactly the artist's price and every screen behaves as it
 * did before any of this existed.
 *
 *
 * WHY THE SETTINGS ARE CLAMPED
 *
 * The divisor is 1 - p/100. A percentage typed into platform_settings as 100
 * makes it zero and the charge infinite; anything above 100 makes it negative
 * and the charge negative. Neither is a price, and both would reach a real
 * payment screen. So the two settings are clamped to a sane band, the clamp
 * is reported back as `capped`, and the callers log it. A fee setting that
 * needs clamping is a typo in an admin field, not a pricing decision.
 *
 *
 * PART TWO: WHEN THE EXCHANGE RATE MOVES
 *
 * The dollar price is fixed, so the rand price is what moves.
 *
 *   Rand weakens, 16.5 to 18.0   a $1.85 track goes from about R31 to R34.
 *                                South African buyers pay more rand for the
 *                                same track. The artist is unaffected in
 *                                dollar terms and receives more rand.
 *   Rand strengthens, 16.5 to 15 the same track drops to about R29.
 *
 * The rate is not read here. Fetching it, sanity checking it, caching it and
 * carrying on with yesterday's number when no source answers is a job of its
 * own, and it lives in netlify/lib/fxRate.js. This file does arithmetic.
 *
 * Pricing the catalogue in rand outright is still the right destination,
 * because the artists and the buyers are here. It is a later migration, worth
 * doing once Paystack is carrying real sales.
 */

// ── Part one: the buyer's fee ────────────────────────────────────────────────

// What the processor charges, as of writing: 5.4% plus 30 cents. These are
// fallbacks only. The live numbers come from platform_settings, and these
// stand in when that read fails, so a database hiccup charges the current
// rate rather than suddenly charging nothing and paying the artist short.
const DEFAULT_FEE_PERCENT = 5.4;
const DEFAULT_FEE_FIXED   = 0.30;

// The sane band. See the note above on why the divisor must stay positive.
const MAX_FEE_PERCENT = 50;
const MAX_FEE_FIXED   = 10;

/**
 * Money, to the cent. The epsilon keeps binary floating point from rounding
 * 1.005 down, which is the classic way a cent goes missing.
 */
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * The current fee settings, from platform_settings.
 *
 * @param {object} supabase a client that can read platform_settings
 * @returns {Promise<{percent: number, fixed: number, capped: boolean}>}
 */
async function getServiceFee(supabase) {
  let percent = DEFAULT_FEE_PERCENT;
  let fixed   = DEFAULT_FEE_FIXED;

  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['buyer_service_fee_percent', 'buyer_service_fee_fixed']);

    if (error) {
      console.error('[pricing] could not read the fee settings, using the defaults:',
        error.code, error.message);
    } else {
      for (const row of data || []) {
        const v = Number(row && row.value);
        if (!Number.isFinite(v)) continue;
        if (row.key === 'buyer_service_fee_percent') percent = v;
        if (row.key === 'buyer_service_fee_fixed')   fixed   = v;
      }
    }
  } catch (err) {
    console.error('[pricing] fee settings lookup threw, using the defaults:', err.message);
  }

  const clampedPercent = Math.max(0, Math.min(MAX_FEE_PERCENT, percent));
  const clampedFixed   = Math.max(0, Math.min(MAX_FEE_FIXED, fixed));
  const capped = clampedPercent !== percent || clampedFixed !== fixed;

  if (capped) {
    console.error('[pricing] fee settings outside the sane band and clamped:',
      'buyer_service_fee_percent=', percent, '->', clampedPercent,
      'buyer_service_fee_fixed=', fixed, '->', clampedFixed,
      '. Check platform_settings.');
  }

  return { percent: clampedPercent, fixed: clampedFixed, capped };
}

/**
 * What the buyer is charged so that `netAmount` is what is left afterwards.
 *
 * @param {number} netAmount what the seller must end up holding
 * @param {{percent: number, fixed: number, capped?: boolean}} fee
 * @returns {{buyerPays: number, serviceFee: number, capped: boolean}}
 */
function grossUp(netAmount, fee) {
  const net = Number(netAmount);
  const capped = !!(fee && fee.capped);

  if (!Number.isFinite(net) || net <= 0) {
    return { buyerPays: 0, serviceFee: 0, capped };
  }

  const percent = Math.max(0, Math.min(MAX_FEE_PERCENT, Number(fee && fee.percent) || 0));
  const fixed   = Math.max(0, Math.min(MAX_FEE_FIXED,   Number(fee && fee.fixed)   || 0));

  if (percent === 0 && fixed === 0) {
    const flat = round2(net);
    return { buyerPays: flat, serviceFee: 0, capped };
  }

  const buyerPays = round2((net + fixed) / (1 - percent / 100));
  return { buyerPays, serviceFee: round2(buyerPays - round2(net)), capped };
}

/**
 * The whole fee path in one call: an artist's price in, the three numbers the
 * checkout and the breakdown both need out.
 *
 * @param {object} supabase
 * @param {number} artistPriceIn the price the artist set, in dollars
 * @returns {Promise<{artistPrice: number, serviceFee: number, buyerPays: number, capped: boolean}>}
 */
async function quote(supabase, artistPriceIn) {
  const artistPrice = round2(artistPriceIn);

  if (!(artistPrice > 0)) {
    return { artistPrice, serviceFee: 0, buyerPays: artistPrice, capped: false };
  }

  const fee = await getServiceFee(supabase);
  const g = grossUp(artistPrice, fee);

  return {
    artistPrice,
    serviceFee: g.serviceFee,
    buyerPays:  g.buyerPays > 0 ? g.buyerPays : artistPrice,
    capped:     g.capped,
  };
}

// ── Part two: rand ───────────────────────────────────────────────────────────

// Headroom on the conversion, as a percentage.
//
// Not a cut the platform keeps. The rand moves between the day this rate is
// set and the day it is next looked at, and without headroom every local sale
// in that window quietly pays the artist less than the dollar price says.
// It was 3% when the rate was set by hand and could sit stale for months.
// Now that fxRate.js refreshes it within hours, 1.5% is enough to cover the
// drift between one refresh and the next. Set to 0 to convert at exactly the
// rate supplied.
const FX_MARGIN_PCT = Number(process.env.USD_ZAR_MARGIN_PCT || 1.5);

/**
 * A rate that is missing, zero, negative or not a number is the one input this
 * file must never improvise around, so it refuses.
 *
 * It would be easy to fall back to 1. That is the bug worth being afraid of:
 * it would charge R1.85 for a track meant to cost about R31, and look like a
 * working checkout while it did it. A checkout that fails is a buyer who tries
 * again in a minute. A checkout that charges a sixteenth of the price is money
 * the artist never sees and nobody notices for a month.
 */
function assertRate(rate) {
  if (rate === null || rate === undefined || !Number.isFinite(Number(rate)) || Number(rate) <= 0) {
    throw new Error(
      `A usable USD to ZAR rate was not supplied (got ${JSON.stringify(rate)}), so a dollar ` +
      'price cannot be converted to rand. Refusing rather than guessing a rate.'
    );
  }
  return Number(rate);
}

/**
 * Convert a stored dollar price to the rand amount to charge through Paystack.
 *
 * Rounded UP to a whole rand. Nobody prices anything at R30.53, and rounding
 * up rather than down means the conversion never shortchanges the artist.
 */
function usdToZar(usdAmount, rateIn) {
  const usd = Number(usdAmount);
  if (!Number.isFinite(usd) || usd <= 0) return 0;

  const rate = assertRate(rateIn);
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
function usdToPaystackCharge(usdAmount, rate) {
  const zar = usdToZar(usdAmount, rate);
  return { zar, minor: zarToPaystackMinor(zar), currency: 'ZAR' };
}

// ── The card fee on a rand sale, and who carries it ─────────────────────────
//
// Paystack South Africa charges 2.9% plus R1 per transaction, excluding VAT,
// with the R1 waived under R10. At 15% VAT that reproduces the first live
// sale exactly: R24.00 charged, R0.70 plus R1.00 is R1.70, plus VAT is R1.96,
// which is the figure on the transaction.
//
// The checkout sets bearer: 'subaccount', so that fee comes off the artist's
// side. On its own that would mean a rand sale paid the artist less than the
// price on their page, while a PayPal sale paid them all of it, because the
// PayPal path already grosses up. Two routes, two different answers to "what
// do I actually get", and only one of them matching what the artist was told.
//
// So the rand charge is grossed up the same way: the buyer covers the card
// fee, and the artist nets the price they set on both routes.
//
// The rates are environment variables because they are Paystack's to change,
// not ours. If they move, these move without a code change.
const PAYSTACK_FEE_PCT       = Number(process.env.PAYSTACK_FEE_PCT       || 2.9);
const PAYSTACK_FEE_FLAT_ZAR  = Number(process.env.PAYSTACK_FEE_FLAT_ZAR  || 1);
const PAYSTACK_FEE_VAT_PCT   = Number(process.env.PAYSTACK_FEE_VAT_PCT   || 15);
const PAYSTACK_FLAT_WAIVED_BELOW_ZAR = 10;

/**
 * What Paystack takes from a charge of `chargeZar` rand, VAT included.
 *
 * Rounded the way their own invoice reads: the percentage to the cent first,
 * then the flat fee, then VAT on the total.
 */
function paystackFeeZar(chargeZar) {
  const c = Number(chargeZar);
  if (!Number.isFinite(c) || c <= 0) return 0;
  // Worked in integer cents from end to end. In rand it is not arithmetic,
  // it is luck: (0.70 + 1.00) * 1.15 is 1.9549999999999998 in binary floating
  // point, which rounds to R1.95, and Paystack's invoice for that exact
  // transaction says R1.96. A cent out on every sale is the kind of error
  // that only shows up in a reconciliation nobody runs.
  const cents     = Math.round(c * 100);
  const pctCents  = Math.round(cents * (PAYSTACK_FEE_PCT / 100));
  const flatCents = c < PAYSTACK_FLAT_WAIVED_BELOW_ZAR ? 0 : Math.round(PAYSTACK_FEE_FLAT_ZAR * 100);
  return Math.round(((pctCents + flatCents) * (100 + PAYSTACK_FEE_VAT_PCT)) / 100) / 100;
}

/**
 * The whole rand amount to charge so that `targetZar` survives the fee.
 *
 * The closed form is only an approximation here: the flat fee is waived below
 * R10, which makes the function piecewise, and both the fee and the charge
 * are rounded. So the closed form is used as a starting point and then
 * checked against the same arithmetic the fee itself uses, a rand at a time,
 * until the remainder really does cover the target. It normally does not loop
 * at all, and it is bounded either way.
 *
 * Rounded UP to a whole rand, like usdToZar: nobody prices anything at
 * R26.02, and rounding up never shortchanges the artist.
 */
function grossUpZar(targetZar) {
  const t = Number(targetZar);
  if (!Number.isFinite(t) || t <= 0) return 0;

  const vat  = 1 + PAYSTACK_FEE_VAT_PCT / 100;
  const pct  = (PAYSTACK_FEE_PCT / 100) * vat;
  const flat = PAYSTACK_FEE_FLAT_ZAR * vat;

  let charge = Math.ceil((t + flat) / (1 - pct));
  for (let i = 0; i < 20 && charge - paystackFeeZar(charge) < t; i += 1) charge += 1;
  return charge;
}

/**
 * The whole path for the Paystack checkout, with the buyer carrying the card
 * fee so the artist nets their price.
 *
 * Returns the buyer's charge AND the artist's share, because the two are now
 * different numbers and every screen and record that shows one of them has to
 * be told which it is holding.
 */
function usdToPaystackChargeGrossedUp(usdAmount, rate) {
  const artistZar = usdToZar(usdAmount, rate);
  if (!artistZar) return { zar: 0, minor: 0, currency: 'ZAR', artistZar: 0, feeZar: 0 };

  const zar = grossUpZar(artistZar);
  return {
    zar,
    minor: zarToPaystackMinor(zar),
    currency: 'ZAR',
    artistZar,
    feeZar: paystackFeeZar(zar),
  };
}

/**
 * PayPal cannot take rand. ZAR is not among the 23 currencies it supports for
 * payments, which is why the Paystack path exists at all rather than simply
 * charging rand everywhere.
 */
function paypalCurrency() {
  return 'USD';
}

// Every name below is required by a deployed function. paypal-order.js,
// tip-artist.js and merch-order.js use round2, getServiceFee, grossUp and
// quote; paystack-checkout.js uses usdToPaystackCharge. Removing any of them
// breaks a live payment screen.
module.exports = {
  // the buyer's fee
  DEFAULT_FEE_PERCENT,
  DEFAULT_FEE_FIXED,
  round2,
  getServiceFee,
  grossUp,
  quote,
  // rand
  FX_MARGIN_PCT,
  assertRate,
  usdToZar,
  zarToPaystackMinor,
  usdToPaystackCharge,
  paypalCurrency,
  // the card fee on a rand sale
  PAYSTACK_FEE_PCT,
  PAYSTACK_FEE_FLAT_ZAR,
  PAYSTACK_FEE_VAT_PCT,
  paystackFeeZar,
  grossUpZar,
  usdToPaystackChargeGrossedUp,
};