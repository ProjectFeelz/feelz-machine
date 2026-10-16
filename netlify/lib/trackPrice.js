/**
 * netlify/lib/trackPrice.js
 *
 * What a track costs, in dollars, decided on the server.
 *
 * netlify/functions/paystack-checkout.js used to work out the price inline,
 * and it got three cases wrong by simply not having them:
 *
 *   A beat licence. The price comes from the licence, not from
 *   download_price, so an exclusive at $99 would have been charged at the
 *   beat's download price while the records said $99.
 *
 *   A pay-what-you-want offer. The buyer names the amount. Charging the
 *   minimum instead means quietly taking less than somebody offered.
 *
 *   A track with no price of its own inside a paid album. PayPal falls back
 *   to the album price divided by its published tracks; without that, the
 *   track reads as free.
 *
 * The rules below are netlify/functions/paypal-order.js's rules, matched case
 * for case, including the floors and the cap. That is the point of the file:
 * the two buttons on the same screen must never quote different numbers for
 * the same track. netlify/lib/__tests__ has a test that walks each case.
 *
 *
 * WHY paypal-order.js STILL HAS ITS OWN COPY
 *
 * Because it works, and it is the path real money goes through today.
 * Rewriting the pricing block of a live payment function to prove a point
 * about tidiness is how a working checkout stops working. The shared piece
 * that was safe to move, resolveLicence, has moved, and both files now call
 * netlify/lib/licence.js. The rest is matched by test rather than by import,
 * deliberately, and this comment is here so the next person knows the two are
 * meant to agree and where to check.
 */

const { resolveLicence } = require('./licence');

// The least a pay-what-you-want track can go for, whatever the artist set.
// Same number paypal-order.js uses. Below this the processor's own fee is
// most of the transaction.
const PWYW_HARD_FLOOR = 0.50;

// A fat finger, not a generous buyer. Refused rather than charged.
const MAX_PRICE = 10000;

/**
 * @returns {Promise<{price: number, label: string, source: string} | {error: string, message: string, status: number}>}
 */
async function resolveTrackPrice({ supabase, track, licenceId = null, offeredAmount = null }) {
  if (!track) return { error: 'not_found', message: 'This track could not be found.', status: 404 };

  // ── A beat licence ────────────────────────────────────────────────────────
  //
  // Checked first, because a beat is also a track with a download_price, and
  // falling through to that price is exactly the bug this guards.
  if (licenceId) {
    const lic = resolveLicence(track, licenceId);
    if (!lic) {
      return {
        error: 'licence_not_offered',
        message: 'That licence is not offered on this beat.',
        status: 400,
      };
    }
    if (!(Number(lic.price) > 0)) {
      return {
        error: 'not_for_sale',
        message: 'This licence has no price set.',
        status: 400,
      };
    }
    return {
      price: Number(lic.price),
      label: `${track.title || 'Beat'}, ${lic.label} Lease`,
      source: `licence:${licenceId}`,
    };
  }

  // ── Pay what you want ─────────────────────────────────────────────────────
  //
  // The one case where the buyer's number is the right number. Floored at
  // what the artist set, so "pay what you want" cannot be read as "pay one
  // cent", and the floor wins when nothing was offered at all.
  if (track.pay_what_you_want) {
    const floor = Math.max(Number(track.minimum_price) || 0, PWYW_HARD_FLOOR);
    const offered = Number(offeredAmount) || 0;
    const price = Math.max(floor, Math.round(offered * 100) / 100);

    if (price > MAX_PRICE) {
      return { error: 'amount_too_large', message: 'That amount is too large.', status: 400 };
    }
    return {
      price,
      label: track.title || 'Track',
      source: `pwyw (offered ${offered}, floor ${floor})`,
    };
  }

  // ── An ordinary paid download ─────────────────────────────────────────────
  let price = Number(track.download_price) || 0;
  let source = 'download_price';

  // A track with no price of its own, sitting in a paid album, is sold at the
  // album price split across its published tracks. Without this the track
  // reads as free and the checkout refuses a sale the artist expected.
  if (price <= 0 && track.album_id) {
    const [{ data: album }, { count: trackCount }] = await Promise.all([
      supabase.from('albums').select('price').eq('id', track.album_id).maybeSingle(),
      supabase.from('tracks').select('id', { count: 'exact', head: true })
        .eq('album_id', track.album_id).eq('is_published', true),
    ]);
    const albumPrice = Number(album?.price) || 0;
    if (albumPrice > 0 && trackCount > 0) {
      price = Math.round((albumPrice / trackCount) * 100) / 100;
      source = `album_share (${albumPrice} / ${trackCount})`;
    }
  }

  if (!(price > 0)) {
    return {
      error: 'not_for_sale',
      message: 'This is a free download, there is nothing to pay.',
      status: 400,
    };
  }
  if (price > MAX_PRICE) {
    return { error: 'amount_too_large', message: 'That amount is too large.', status: 400 };
  }

  return { price, label: track.title || 'Track', source };
}

module.exports = { resolveTrackPrice, PWYW_HARD_FLOOR, MAX_PRICE };