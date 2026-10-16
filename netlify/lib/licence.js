/**
 * netlify/lib/licence.js
 *
 * What a beat licence costs.
 *
 * This was a private function inside netlify/functions/paypal-order.js. It is
 * here because netlify/functions/paystack-checkout.js needs the same answer,
 * and a second copy of a function that decides a price is a second place for
 * that price to be wrong. Two implementations of this would mean a beat
 * quoting $99 on one button and $3 on the other, and nobody finding out until
 * an artist asked where their money went.
 *
 * The code below is paypal-order.js's function, moved rather than rewritten.
 * There is a differential test that runs this and the original side by side
 * across every shape beat_licence has ever been written in, and asserts they
 * agree. If this ever needs editing, run that test again.
 *
 *
 * WHY THERE ARE FOUR SHAPES
 *
 * beat_licence has been written by more than one version of the upload form.
 * An earlier version of this function understood only an array of
 * { id, price }, which is a shape the upload form does not actually write, so
 * every beat quoted $0.00 and every order was refused as "licence not
 * offered". All four shapes are handled here for that reason.
 */

// Returns { price, label } or null when the licence is not offered.
function resolveLicence(track, licenceId) {
  const want = String(licenceId || '');
  const titleCase = (id) => id.charAt(0).toUpperCase() + id.slice(1);
  let raw = track?.beat_licence ?? null;

  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try { raw = JSON.parse(t); } catch { raw = null; }
    } else {
      // Shape 2: a bare licence id.
      return want === (t || 'basic')
        ? { price: Number(track.download_price) || 0, label: titleCase(want) }
        : null;
    }
  }

  if (raw && typeof raw === 'object') {
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw.licences) ? raw.licences : null);
    if (list) {
      const lic = list.find(l => String(l.id) === want);
      return lic ? { price: Number(lic.price) || 0, label: lic.label || titleCase(want) } : null;
    }
    if (raw.enabled && raw.prices) {
      if (!raw.enabled[want]) return null;
      return { price: parseFloat(raw.prices[want]) || 0, label: titleCase(want) };
    }
  }

  // Shape 3, or JSON the page could not use either: the page falls back to a
  // single "basic" licence at download_price, so the server does too.
  return want === 'basic'
    ? { price: Number(track.download_price) || 0, label: 'Basic' }
    : null;
}

module.exports = { resolveLicence };