// src/config/features.js
//
// One place to turn a part of the platform off, so that turning it back on is
// a one-line change and not an archaeology exercise.

// ── Merch ──────────────────────────────────────────────────────────────────
//
// PARKED, September 2026.
//
// The Printful integration is written and works against the API; what does not
// work is authenticating with it. The store connection refuses the API secret
// no matter how it is supplied, and no amount of re-issuing keys has changed
// that. Rather than keep a storefront on the platform that can take an order
// it might not be able to fulfil, merch is off.
//
// NOTHING IS DELETED. printful-proxy.js, MerchPage, MerchCheckoutPage,
// MerchOrdersPage, MerchConnectSheet and every merch row in the database are
// untouched. Any artist who connected a store stays connected. Flip this to
// false and the whole feature comes back exactly as it was.
export const MERCH_PARKED = true;

// What people are told, in one place, so the shop page, the create menu and
// the tier list cannot end up saying three different things.
export const MERCH_PARKED_HEADLINE = 'Merch is paused';
export const MERCH_PARKED_BODY =
  'Our print partner’s connection is not working reliably at our end, and we would rather '
  + 'have the shop off than have somebody pay for a t-shirt we cannot be certain will ship. '
  + 'Nothing has been deleted — any store you have connected stays connected, and your '
  + 'products are still there. We will turn it back on once it is solid, and you will get a '
  + 'notification when we do.';