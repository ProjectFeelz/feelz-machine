/**
 * netlify/lib/payee.js
 *
 * ONE PLACE DECIDES WHERE THE MONEY GOES.
 *
 *
 * TWO PROCESSORS NOW, AND WHY THE SELLER PICKS
 *
 * PayPal pays a seller into a PayPal balance. In South Africa that balance is
 * withdrawable through one bank, in dollars, with a conversion on the way out.
 * For an artist in Johannesburg that is the worst part of getting paid.
 *
 * Paystack settles a subaccount straight into an ordinary South African bank
 * account, in rand, and its subaccounts do the same job PayPal payee does: the
 * buyer pays once and the seller share is split off at settlement. The
 * platform still never holds anybody money, which is the principle this whole
 * module exists to keep.
 *
 * So the processor is decided by THE SELLER, not the buyer. A seller with a
 * Paystack subaccount is paid through Paystack no matter where the buyer is,
 * because Paystack takes international cards too (at a higher rate, which is
 * the platform cost of the seller being paid properly). A seller without one
 * falls through to the PayPal routes exactly as before.
 *
 * Precedence, highest first:
 *
 *   paystack      seller has a subaccount. Settles into their bank, in rand.
 *   multiparty    PayPal Commerce Platform. Needs partner approval AND a
 *                 seller merchant id, so it is usually unreachable.
 *   direct        PayPal, payee by email. What most sellers get today.
 *   unavailable   no payout details at all. The sale is refused rather than
 *                 parked in the platform account.
 *
 * NOTHING ABOUT THE PAYPAL PATHS CHANGED. A caller that ignores
 * decision.processor behaves exactly as it did before this was added, which is
 * deliberate: the PayPal routes are carrying real money today and this is an
 * extension, not a rewrite.
 *
 * Feelz Machine sells music three ways and, until now, all three captured into
 * the platform account and forwarded the artist's share later by PayPal
 * Payouts. Tips were the exception, tip-artist.js sets a payee on the order,
 * so a tip goes straight to the artist. Two conventions, no shared code, and
 * the tip path ended up doing BOTH (payee AND a payout of the same amount),
 * which paid artists twice out of the business account until it was caught.
 *
 * This module is the single answer to "who is PayPal paying for this sale?",
 * used by the order creation and, crucially, by the capture, so nothing ever
 * again forwards money that never arrived.
 *
 *
 * THE THREE ROUTES
 *
 *   'platform'   Capture into the business account, forward the artist's share
 *                afterwards with process-split-payout.js. RETIRED as of
 *                September 2026: only reachable with PAYPAL_DIRECT_TO_ARTIST
 *                set to 'false', as an emergency switch. The platform does not
 *                hold artists' money.
 *
 *   'unavailable' The seller has no PayPal details. The sale is refused with a
 *                message, rather than parked in the business account.
 *
 *   'direct'     payee.email_address on the purchase unit. PayPal puts the
 *                buyer's money straight into the seller's own PayPal. Works
 *                today with an ordinary PayPal business account and no approval
 *                from anyone, this is what tip-artist.js already does.
 *                LIMITATION, and it is not a small one: the platform CANNOT
 *                take a commission at capture on this route. The money never
 *                touches the business account, so there is nothing to take it
 *                from. Commission on a direct sale is recorded as owed and
 *                settled separately, or set to zero.
 *
 *   'multiparty' payee.merchant_id plus platform_fees, i.e. PayPal Commerce
 *                Platform. PayPal splits the payment at capture: the seller
 *                gets their share, the platform's commission arrives in the
 *                business account automatically, one transaction, no payout
 *                fee, no float. This is the right answer and the one to aim at.
 *
 *                IT CANNOT BE SWITCHED ON FROM CODE ALONE. Commerce Platform
 *                requires Feelz Machine to be approved by PayPal as a partner /
 *                platform, which gives you a Partner Attribution (BN) code, and
 *                every seller must then complete a PayPal onboarding flow that
 *                grants the platform permission to act on their behalf. That
 *                produces the merchant id this route needs. Until both exist
 *                this route is unreachable and the code says so rather than
 *                failing at PayPal with something cryptic.
 *
 *
 * WHY IT IS ON BY DEFAULT
 *
 * The owner decided, September 2026: the platform handles only what is its
 * own. Sales go straight to the seller, a track with collaborators pays the
 * owner and records what they owe each collaborator (sale_splits), and a
 * seller with no PayPal cannot sell until they add one. If it ever has to be
 * undone in a hurry, PAYPAL_DIRECT_TO_ARTIST=false and a redeploy restores
 * the old route without a code change.
 */

// ON unless explicitly switched off. Feelz Machine does not hold artists'
// money: a sale is paid straight into the seller's own PayPal, and the
// platform account only ever receives what is the platform's (subscriptions).
// PAYPAL_DIRECT_TO_ARTIST=false is kept as an emergency switch back to the
// old capture-then-payout route, and nothing else.
const DIRECT_ENABLED = process.env.PAYPAL_DIRECT_TO_ARTIST !== 'false';
const BN_CODE        = process.env.PAYPAL_PARTNER_BN_CODE || null;

// Paystack is only offered when there is a key to call it with. Unset means
// every seller falls through to the PayPal routes, which is exactly the
// behaviour that existed before Paystack was added, so a missing key degrades
// to the old world rather than refusing sales.
const PAYSTACK_ENABLED = Boolean(process.env.PAYSTACK_SECRET_KEY);

// What the platform takes on a Paystack sale, as a percentage.
//
// Unlike the PayPal direct route, this one CAN take a commission at the moment
// of payment: a transaction split names the seller share and the remainder
// settles to the platform. Left at 0 so switching processor does not quietly
// change what an artist earns. Changing it is a business decision, made by
// setting this variable, not by editing code.
const PAYSTACK_PLATFORM_PCT = Number(process.env.PAYSTACK_PLATFORM_PCT || 0);

/**
 * Who are we? Used to read a capture response and tell "the money landed with
 * us" from "the money went to the seller". Without this we cannot verify a
 * routing decision after the fact, and an unverifiable decision about money is
 * one we do not act on.
 */
const PLATFORM_MERCHANT_ID = process.env.PAYPAL_PLATFORM_MERCHANT_ID || null;
const PLATFORM_EMAIL       = (process.env.PAYPAL_PLATFORM_EMAIL || '').toLowerCase();

function platformIdentityConfigured() {
  return Boolean(PLATFORM_MERCHANT_ID || PLATFORM_EMAIL);
}

/**
 * Did this capture land in the platform account?
 *
 * Reads the payee off PayPal's own capture response, which is the only
 * authority on the question. Returns null, meaning "cannot tell", when we do
 * not know our own identity, and every caller treats null as "do not forward
 * money", because failing to forward is recoverable by hand and double-paying
 * is not.
 */
function landedWithPlatform(captureBody) {
  if (!platformIdentityConfigured()) return null;

  const payee    = captureBody?.purchase_units?.[0]?.payee || {};
  const email    = (payee.email_address || '').toLowerCase();
  const merchant = payee.merchant_id || null;

  // No payee at all on the response means PayPal paid the API caller, which is
  // us. That is the ordinary shape of a single-party order.
  if (!email && !merchant) return true;

  if (PLATFORM_MERCHANT_ID && merchant) return merchant === PLATFORM_MERCHANT_ID;
  if (PLATFORM_EMAIL && email)          return email === PLATFORM_EMAIL;
  return null;
}

/**
 * Decide the route for one sale.
 *
 * @param {object}  args
 * @param {object}  args.supabase        service-role client
 * @param {string}  args.artistId        the seller
 * @param {string?} args.trackId         set for a track/beat sale; null for an album
 * @param {number}  args.commissionPct   the platform's cut, 0-100
 * @returns {Promise<{route, payee, reason, collaboratorCount, commissionPct, sellerEmail, sellerMerchantId}>}
 */
/**
 * `processors` is what the CALLER can actually carry out, and it defaults to
 * PayPal only. That default is the whole safety of this change.
 *
 * paypal-order.js builds a PayPal order. Hand it a Paystack decision and it
 * would find no payee on the purchase unit, not recognise the route as
 * unavailable, and capture the money into the platform account, which is the
 * one outcome this module exists to prevent. merch-order.js is stricter still
 * and refuses anything that is not 'direct'.
 *
 * So existing callers, which pass nothing, keep getting exactly the routes
 * they got before. The Paystack checkout opts in by passing
 * processors: ['paystack', 'paypal'] when it is built.
 */
async function resolvePayee({ supabase, artistId, trackId, commissionPct = 0, processors = ['paypal'] }) {
  const allows = (p) => Array.isArray(processors) && processors.includes(p);
  // Every return carries a processor so a caller never has to infer one from
  // the route name. 'paypal' is the default because every pre-existing route
  // is a PayPal route.
  const stay = (reason, extra = {}) => ({
    processor: 'paypal',
    route: 'platform', payee: null, reason, collaboratorCount: 0,
    commissionPct, sellerEmail: null, sellerMerchantId: null,
    subaccountCode: null, ...extra,
  });

  if (!DIRECT_ENABLED)  return stay('direct_routing_disabled');
  if (!artistId)        return stay('no_seller_on_the_item');

  // ── Collaborators ─────────────────────────────────────────────────────────
  //
  // They used to force the sale onto the platform route, so the platform could
  // split it. That meant holding the collaborators' money, which the platform
  // no longer does. The buyer pays the OWNER directly, and the agreed split is
  // recorded as what the owner owes each collaborator (sale_splits, written at
  // capture). The count here is informational only: whether or not it can be
  // read, the payee is the owner.
  let collaboratorCount = 0;
  if (trackId) {
    const { data: collabs, error } = await supabase
      .from('collaborations')
      .select('artist_id, invited_by')
      .eq('track_id', trackId)
      .eq('status', 'accepted');
    if (error) {
      console.error('[payee] could not count collaborators for', trackId, ':', error.code, error.message);
    } else {
      collaboratorCount = (collabs || []).filter(c => c.invited_by === artistId).length;
    }
  }

  // ── The seller's PayPal ───────────────────────────────────────────────────
  //
  // Both places an address can live, in the order the payments UI owns them -
  // the same precedence process-split-payout.js and release-pending-payouts.js
  // use. artist_payment_profiles is what PaymentSettings writes; artists is
  // what Profile > Edit writes.
  const [profileRes, artistRes] = await Promise.all([
    supabase.from('artist_payment_profiles')
      .select('paypal_email, paypal_merchant_id, paystack_subaccount_code')
      .eq('artist_id', artistId).maybeSingle(),
    supabase.from('artists')
      .select('paypal_email').eq('id', artistId).maybeSingle(),
  ]);

  if (profileRes.error && profileRes.error.code !== 'PGRST116') {
    console.error('[payee] payment profile read failed:', profileRes.error.code, profileRes.error.message);
  }

  const sellerMerchantId = profileRes.data?.paypal_merchant_id || null;
  const sellerEmail      = profileRes.data?.paypal_email || artistRes.data?.paypal_email || null;
  const subaccountCode   = profileRes.data?.paystack_subaccount_code || null;

  // ── Paystack, first because it is the best outcome for the seller ─────────
  //
  // Settles into their own bank account, in rand, no conversion and no
  // withdrawal step. Checked ahead of the PayPal routes on purpose: an artist
  // who has done the work of adding bank details should not keep being paid
  // the awkward way because they also happen to have a PayPal address on file.
  if (allows('paystack') && PAYSTACK_ENABLED && subaccountCode) {
    return {
      processor: 'paystack',
      route: 'paystack_split',
      // Not a PayPal purchase_unit payee. Paystack takes the subaccount on the
      // charge itself, so this is carried separately and purchaseUnitFor()
      // returns nothing for it.
      payee: null,
      subaccountCode,
      reason: 'seller_has_paystack_subaccount',
      collaboratorCount,
      // The platform share is set by PAYSTACK_PLATFORM_PCT rather than the
      // commissionPct passed in, because this route really can collect it at
      // payment time and the two numbers answer different questions.
      commissionPct: PAYSTACK_PLATFORM_PCT,
      sellerEmail,
      sellerMerchantId: null,
    };
  }

  // ── Multiparty, if it is actually available ───────────────────────────────
  if (sellerMerchantId && BN_CODE) {
    return {
      processor: 'paypal',
      route: 'multiparty',
      payee: { merchant_id: sellerMerchantId },
      reason: 'seller_onboarded_to_platform',
      collaboratorCount,
      commissionPct,
      sellerEmail,
      sellerMerchantId,
      subaccountCode: null,
    };
  }

  if (sellerMerchantId && !BN_CODE) {
    // The seller did the onboarding but we are not a PayPal partner, so the
    // merchant id is not usable. Say so loudly, this is a business step that
    // is stuck, and it will otherwise look like the seller's problem.
    console.warn('[payee] artist', artistId, 'has a PayPal merchant id but PAYPAL_PARTNER_BN_CODE is unset -',
      'Commerce Platform is not available, falling back.');
  }

  // ── Direct by email ───────────────────────────────────────────────────────
  if (sellerEmail) {
    return {
      processor: 'paypal',
      route: 'direct',
      payee: { email_address: sellerEmail },
      subaccountCode: null,
      // Not a mistake and not a rounding-down: on this route the money never
      // reaches the business account, so there is nothing to take a commission
      // out of. The sale is recorded with the commission the platform WOULD
      // have taken, marked unpaid, so it is visible rather than forgotten.
      reason: 'seller_has_paypal_email',
      collaboratorCount,
      commissionPct,
      sellerEmail,
      sellerMerchantId: null,
    };
  }

  // Nothing on file: the sale does NOT fall back to the platform account.
  // Money that lands there is money the platform is holding for someone, which
  // is exactly what this module exists to prevent. The order is refused with a
  // message the buyer can read, and the artist is told to add payout details.
  //
  // The reason string now says "payout" rather than "paypal", because with two
  // processors there are two ways to fix it and a message naming only one
  // sends a South African artist to the wrong screen.
  return {
    processor: null,
    route: 'unavailable', payee: null, reason: 'seller_has_no_payout_details',
    collaboratorCount, commissionPct, sellerEmail: null, sellerMerchantId: null,
    subaccountCode: null,
  };
}

/**
 * Build the purchase_unit fragment PayPal needs for a route, and the headers
 * that must go with it. Keeping these together is the point: a multiparty order
 * without the BN header is rejected by PayPal in a way that reads like a
 * permissions problem.
 */
function purchaseUnitFor(decision, { grossValue, currency = 'USD' }) {
  // A Paystack decision has no PayPal purchase unit to build. Returning empty
  // here is a backstop rather than a path: resolvePayee only returns a
  // Paystack route to a caller that asked for one, and a PayPal caller never
  // does. If this ever fires, something upstream passed the wrong decision to
  // the wrong processor, so it is logged rather than silently ignored.
  if (decision && decision.processor === 'paystack') {
    console.error('[payee] a Paystack decision reached purchaseUnitFor, which builds PayPal orders.',
      'route=', decision.route, '- the caller should not have asked for the paystack processor.');
    return { fragment: {}, headers: {} };
  }

  if (!decision || decision.route === 'platform' || decision.route === 'unavailable') {
    return { fragment: {}, headers: {} };
  }

  if (decision.route === 'direct') {
    return { fragment: { payee: decision.payee }, headers: {} };
  }

  // multiparty
  const fee = Math.max(0, Number(
    ((Number(decision.commissionPct) / 100) * Number(grossValue)).toFixed(2)
  ));

  return {
    fragment: {
      payee: decision.payee,
      ...(fee > 0 ? {
        payment_instruction: {
          disbursement_mode: 'INSTANT',
          platform_fees: [{
            amount: { currency_code: currency, value: fee.toFixed(2) },
          }],
        },
      } : {}),
    },
    headers: { 'PayPal-Partner-Attribution-Id': BN_CODE },
  };
}

module.exports = {
  DIRECT_ENABLED,
  BN_CODE,
  PAYSTACK_ENABLED,
  PAYSTACK_PLATFORM_PCT,
  PLATFORM_MERCHANT_ID,
  PLATFORM_EMAIL,
  platformIdentityConfigured,
  landedWithPlatform,
  resolvePayee,
  purchaseUnitFor,
};