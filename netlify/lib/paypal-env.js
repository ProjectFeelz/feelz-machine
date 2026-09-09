/**
 * netlify/lib/paypal-env.js
 *
 * One answer to "are we on PayPal sandbox or live?".
 *
 *
 * WHY THIS EXISTS
 *
 * There were two conventions in the codebase and only one of them was set in
 * Netlify:
 *
 *   PAYPAL_SANDBOX === 'true'    paypal-payout.js, process-split-payout.js
 *   PAYPAL_ENV === 'sandbox'     tip-artist.js, paypal-webhook.js,
 *                                retail-paypal-subscription.js
 *   (nothing)                    paypal-order.js — api-m.paypal.com hardcoded
 *
 * `PAYPAL_SANDBOX` is defined — currently `false` in every deploy context.
 * `PAYPAL_ENV` is not defined at all, so the three functions reading it fell
 * back to live.
 *
 * Today that is harmless: everything resolves to live and nothing is
 * mismatched. The danger is the day someone sets `PAYPAL_SANDBOX=true` to test
 * a payout. Payouts and split payouts would move to sandbox while tips,
 * subscriptions and the webhook stayed on live, so the platform would capture
 * real money from a real card and pay it out in sandbox dollars. Nothing in
 * either code path would look wrong, and the split would be discovered from a
 * PayPal statement rather than from a log.
 *
 * So the flag now has exactly one source. Flipping it moves the whole platform
 * together, which is the only safe way for a switch like this to behave.
 *
 *
 * WHY PAYPAL_SANDBOX AND NOT PAYPAL_ENV
 *
 * Because PAYPAL_SANDBOX is the one that is actually set. Choosing the other
 * would have required an environment change to keep production working, and a
 * refactor that needs a simultaneous env edit to avoid breaking payments is a
 * refactor that will break payments.
 *
 * `PAYPAL_ENV` is still honoured if present, so an existing deploy that sets it
 * does not silently change behaviour — but it is no longer required, and
 * PAYPAL_SANDBOX wins when the two disagree, with a warning, because a
 * disagreement means someone edited one and forgot the other.
 */

function isSandbox() {
  const sandboxFlag = process.env.PAYPAL_SANDBOX;
  const envFlag     = process.env.PAYPAL_ENV;

  const bySandbox = sandboxFlag === undefined ? null : sandboxFlag === 'true';
  const byEnv     = envFlag === undefined ? null : envFlag === 'sandbox';

  if (bySandbox !== null && byEnv !== null && bySandbox !== byEnv) {
    console.warn(
      `[paypal] PAYPAL_SANDBOX=${sandboxFlag} and PAYPAL_ENV=${envFlag} disagree. ` +
      `Using PAYPAL_SANDBOX (${bySandbox ? 'sandbox' : 'LIVE'}). Set one and remove the other.`
    );
  }

  if (bySandbox !== null) return bySandbox;
  if (byEnv !== null)     return byEnv;

  // Neither set. Live is the safe default for a platform that is already
  // taking real payments: a live key against the sandbox host fails loudly,
  // whereas the reverse quietly takes real money on a test.
  return false;
}

const SANDBOX = isSandbox();

module.exports = {
  isSandbox,
  SANDBOX,
  // Both host spellings are in use across the functions. api-m is PayPal's
  // current recommendation; api.paypal.com is the older alias and equivalent.
  // Each is exported so no function has to change the host it already calls.
  hostApiM: SANDBOX ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com',
  hostApi:  SANDBOX ? 'api.sandbox.paypal.com'   : 'api.paypal.com',
  baseApiM: SANDBOX ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com',
};