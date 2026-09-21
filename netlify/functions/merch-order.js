/**
 * netlify/functions/merch-order.js
 *
 * Merch checkout: the buyer pays the artist, THEN Printful prints.
 *
 * The old checkout sent an order straight to Printful production, billed to
 * the artist's Printful account, and never charged the buyer. This replaces it.
 *
 *   action 'rates'    shipping options for an address (no auth)
 *   action 'create'   price everything on the server from Printful, save a
 *                     Printful DRAFT (checks the address and product before
 *                     anyone pays), then create a PayPal order that pays the
 *                     artist's own PayPal directly. Returns the PayPal order id.
 *   action 'capture'  capture the payment, check PayPal's own record says the
 *                     right amount went to the right artist, and only then
 *                     confirm the Printful draft into production.
 *   action 'retry'    artist only: confirm again an order that was paid but
 *                     Printful refused (usually billing not set up in Printful).
 *
 * Money: the artist receives item price + shipping, exactly what Printful's
 * store says. The buyer also pays the PayPal processing fee as a visible line
 * (netlify/lib/pricing.js), same as track sales. The platform takes nothing and
 * holds nothing. Printful then charges the artist's Printful account its cost,
 * and the difference is the artist's profit.
 *
 * Nothing the browser sends is trusted for a price: variant, price and shipping
 * all come from Printful at the moment of ordering.
 */

const { createClient } = require('@supabase/supabase-js');
const paypalEnv = require('../lib/paypal-env');
const payeeLib  = require('../lib/payee');
const pricing   = require('../lib/pricing');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRINTFUL_API = 'https://api.printful.com';
const PAYPAL_API   = `https://${paypalEnv.hostApiM}`;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const round2 = pricing.round2;

// ── Printful ─────────────────────────────────────────────────────────────────
class PrintfulError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function printful(path, creds, options = {}) {
  const res = await fetch(`${PRINTFUL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      'Content-Type': 'application/json',
      'X-PF-Store-Id': String(creds.store_id),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = body?.error?.message || (typeof body?.result === 'string' ? body.result : null) || `Printful error ${res.status}`;
    throw new PrintfulError(msg, res.status);
  }
  return body?.result;
}

// The shop must be switched on and have a saved token (migration 149).
async function shopFor(artistId) {
  if (!artistId) return null;
  const { data: artist } = await supabase.from('artists')
    .select('id, user_id, artist_name, merch_enabled').eq('id', artistId).maybeSingle();
  if (!artist?.merch_enabled) return null;
  const { data: creds } = await supabase.from('artist_printful_credentials')
    .select('access_token, store_id').eq('artist_id', artistId).maybeSingle();
  if (!creds) return null;
  return { artist, creds };
}

function cleanRecipient(a = {}, email) {
  const s = v => (typeof v === 'string' ? v.trim().slice(0, 120) : undefined) || undefined;
  return {
    name:         s(a.name),
    address1:     s(a.address1),
    address2:     s(a.address2),
    city:         s(a.city),
    state_code:   s(a.state_code),
    country_code: s(a.country_code)?.toUpperCase().slice(0, 2),
    zip:          s(a.zip),
    phone:        s(a.phone),
    email:        s(email),
  };
}

// The sync variant, read from the artist's own store. Its catalog variant_id
// is what shipping rates need; its retail_price is what the artist charges.
async function loadVariant(creds, syncVariantId) {
  const v = await printful(`/store/variants/${encodeURIComponent(syncVariantId)}`, creds);
  if (!v || v.is_ignored) throw new PrintfulError('That item is not for sale.', 404);
  if (v.availability_status && v.availability_status !== 'active') {
    throw new PrintfulError('That item is out of stock right now.', 409);
  }
  const price = round2(parseFloat(v.retail_price));
  if (!(price > 0)) throw new PrintfulError('That item has no price set in Printful.', 409);
  if (v.currency && String(v.currency).toUpperCase() !== 'USD') {
    throw new PrintfulError('This shop is not priced in US dollars, which checkout needs.', 409);
  }
  return { v, price };
}

async function shippingRates(creds, recipient, catalogVariantId, quantity) {
  const rates = await printful('/shipping/rates', creds, {
    method: 'POST',
    body: JSON.stringify({
      recipient: {
        address1: recipient.address1, city: recipient.city,
        country_code: recipient.country_code, state_code: recipient.state_code, zip: recipient.zip,
      },
      items: [{ variant_id: catalogVariantId, quantity }],
      currency: 'USD',
      locale: 'en_US',
    }),
  });
  return Array.isArray(rates) ? rates : [];
}

// ── PayPal ───────────────────────────────────────────────────────────────────
async function paypalToken() {
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json().catch(() => ({}));
  if (!body.access_token) throw new Error('PayPal sign-in failed');
  return body.access_token;
}

async function paypal(method, path, token, body, headers = {}) {
  const res = await fetch(`${PAYPAL_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, body: data };
}

// ── In-app notices (no email) ────────────────────────────────────────────────
async function notifyArtist(artist, title, message, metadata) {
  const { error } = await supabase.from('notifications').insert({
    artist_id: artist.id, user_id: artist.user_id || null,
    type: 'admin_message', title, message, metadata,
  });
  if (error) console.error('[merch-order] artist notice failed:', error.message);
}

async function notifyAdmins(title, message, metadata) {
  const { data: admins } = await supabase.from('admins').select('user_id');
  const rows = (admins || []).map(a => ({ user_id: a.user_id, type: 'admin_message', title, message, metadata }));
  if (!rows.length) return;
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) console.error('[merch-order] admin notice failed:', error.message);
}

async function signedInUser(event) {
  const h = event.headers?.authorization || event.headers?.Authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const { data: { user } } = await supabase.auth.getUser(h.slice(7).trim());
  return user || null;
}

// Confirm the Printful draft. Used by capture and by the artist's retry.
async function sendToProduction(order, shop) {
  try {
    const result = await printful(`/orders/${order.printful_order_id}/confirm`, shop.creds, { method: 'POST' });
    await supabase.from('merch_orders').update({
      status: 'in_production', printful_status: result?.status || 'pending',
      fulfilled_at: new Date().toISOString(), failure_reason: null, updated_at: new Date().toISOString(),
    }).eq('id', order.id);
    return { ok: true };
  } catch (e) {
    await supabase.from('merch_orders').update({
      status: 'paid_not_fulfilled', failure_reason: e.message.slice(0, 500), updated_at: new Date().toISOString(),
    }).eq('id', order.id);
    await notifyArtist(shop.artist, 'Merch order paid but not printed',
      `A fan paid you $${Number(order.buyer_pays - order.service_fee).toFixed(2)} for ${order.product_name || 'merch'}, `
      + `but Printful would not start the order: ${e.message}. Usually this is billing not set up in Printful. `
      + 'Fix it in Printful, then open Merch Store from the Create menu and press Retry on the order. If you cannot fulfil it, refund the buyer from your PayPal.',
      { kind: 'merch_paid_not_fulfilled', merch_order_id: order.id });
    await notifyAdmins('Merch paid, not printed',
      `Order ${order.id} for ${shop.artist.artist_name}: ${e.message}`,
      { kind: 'merch_paid_not_fulfilled', merch_order_id: order.id });
    return { ok: false, reason: e.message };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  try {
    // ── Shipping options ────────────────────────────────────────────────────
    if (body.action === 'rates') {
      const shop = await shopFor(body.artist_id);
      if (!shop) return json(403, { error: 'This shop is not open.' });
      const quantity = Math.max(1, Math.min(10, parseInt(body.quantity, 10) || 1));
      const recipient = cleanRecipient(body.shipping_address);
      if (!recipient.country_code) return json(400, { error: 'Choose a country.' });
      const { v, price } = await loadVariant(shop.creds, body.variant_id);
      const rates = await shippingRates(shop.creds, recipient, v.variant_id, quantity);
      // The full price per option, so the buyer sees exactly what they will pay
      // before PayPal opens. Same arithmetic as 'create'.
      const fee = await pricing.getServiceFee(supabase);
      const itemTotal = round2(price * quantity);
      const priced = rates.map(r => {
        const shippingCost = round2(parseFloat(r.rate));
        const g = pricing.grossUp(round2(itemTotal + shippingCost), fee);
        return { ...r, itemTotal, shippingCost, serviceFee: round2(g.buyerPays - (itemTotal + shippingCost)), buyerPays: round2(g.buyerPays) };
      });
      return json(200, { ok: true, rates: priced });
    }

    // ── Create: price on the server, draft at Printful, order at PayPal ─────
    if (body.action === 'create') {
      const shop = await shopFor(body.artist_id);
      if (!shop) return json(403, { error: 'This shop is not open.' });
      const user = await signedInUser(event);

      const quantity  = Math.max(1, Math.min(10, parseInt(body.quantity, 10) || 1));
      const email     = String(body.email || user?.email || '').trim().slice(0, 200);
      const recipient = cleanRecipient(body.shipping_address, email);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { error: 'Enter a valid email.' });
      for (const k of ['name', 'address1', 'city', 'country_code', 'zip']) {
        if (!recipient[k]) return json(400, { error: 'Fill in your full shipping address.' });
      }

      // Where the money goes. No PayPal on file, no sale: the platform never
      // holds the money for them.
      const route = await payeeLib.resolvePayee({ supabase, artistId: shop.artist.id, trackId: null });
      if (route.route !== 'direct' || !route.sellerEmail) {
        await notifyArtist(shop.artist, 'A merch sale could not go through',
          'Someone tried to buy your merch, but you have not added a PayPal email yet. Add one in Payment Settings. Merch is paid straight into your PayPal.',
          { kind: 'payments_not_set_up', item: 'merch' });
        return json(409, { error: 'This artist cannot take payments yet. We have let them know.' });
      }

      const { v, price } = await loadVariant(shop.creds, body.variant_id);
      const rates = await shippingRates(shop.creds, recipient, v.variant_id, quantity);
      const rate  = rates.find(r => String(r.id) === String(body.shipping_method)) || rates[0];
      if (!rate) return json(409, { error: 'Printful cannot ship this item to that address.' });
      const shippingCost = round2(parseFloat(rate.rate));

      const itemTotal      = round2(price * quantity);
      const artistReceives = round2(itemTotal + shippingCost);
      const q = await pricing.quote(supabase, artistReceives);
      const buyerPays  = round2(q.buyerPays);
      const serviceFee = round2(buyerPays - artistReceives);

      // Our record first, so every later step has an id to hang off.
      const { data: order, error: insErr } = await supabase.from('merch_orders').insert({
        artist_id: shop.artist.id, buyer_user_id: user?.id || null, buyer_email: email, recipient,
        sync_variant_id: v.id, product_name: v.name || null, variant_name: v.name || null,
        thumbnail_url: v.files?.find(f => f.type === 'preview')?.preview_url || null,
        quantity, unit_price: price, item_total: itemTotal,
        shipping_method: String(rate.id), shipping_name: rate.name || null, shipping_cost: shippingCost,
        artist_receives: artistReceives, service_fee: serviceFee, buyer_pays: buyerPays,
        currency: 'USD', payee_email: route.sellerEmail,
      }).select('id').single();
      if (insErr) {
        console.error('[merch-order] insert failed:', insErr.message);
        return json(500, { error: 'Could not start your order. Try again.' });
      }

      // Printful draft: checks the address and item BEFORE anyone pays.
      // Nothing is printed or charged until it is confirmed after payment.
      let draft;
      try {
        draft = await printful('/orders', shop.creds, {
          method: 'POST',
          body: JSON.stringify({
            external_id: order.id.replace(/-/g, ''),
            shipping: String(rate.id),
            recipient,
            items: [{ sync_variant_id: v.id, quantity }],
            retail_costs: { currency: 'USD', subtotal: itemTotal.toFixed(2), shipping: shippingCost.toFixed(2) },
          }),
        });
      } catch (e) {
        await supabase.from('merch_orders').update({ status: 'abandoned', failure_reason: e.message.slice(0, 500) }).eq('id', order.id);
        return json(409, { error: `Printful could not take this order: ${e.message}` });
      }

      const token = await paypalToken();
      const unit = payeeLib.purchaseUnitFor(route, { grossValue: buyerPays });
      const pp = await paypal('POST', '/v2/checkout/orders', token, {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: order.id,
          custom_id: order.id,
          description: `${(v.name || 'Merch').slice(0, 100)} x${quantity}`,
          amount: {
            currency_code: 'USD',
            value: buyerPays.toFixed(2),
            breakdown: {
              item_total: { currency_code: 'USD', value: itemTotal.toFixed(2) },
              shipping:   { currency_code: 'USD', value: shippingCost.toFixed(2) },
              handling:   { currency_code: 'USD', value: serviceFee.toFixed(2) },
            },
          },
          items: [{
            name: (v.name || 'Merch').slice(0, 127),
            quantity: String(quantity),
            unit_amount: { currency_code: 'USD', value: price.toFixed(2) },
            category: 'PHYSICAL_GOODS',
          }],
          ...unit.fragment,
        }],
        application_context: { shipping_preference: 'NO_SHIPPING', brand_name: 'Feelz Machine', user_action: 'PAY_NOW' },
      }, { 'PayPal-Request-Id': order.id, ...unit.headers });

      if (pp.status !== 201 || !pp.body?.id) {
        console.error('[merch-order] PayPal create refused:', pp.status, JSON.stringify(pp.body).slice(0, 500));
        await supabase.from('merch_orders').update({ status: 'abandoned', printful_order_id: draft?.id || null, failure_reason: 'paypal_create_refused' }).eq('id', order.id);
        const refusedPayee = JSON.stringify(pp.body || {}).includes('PAYEE');
        if (refusedPayee) {
          await notifyArtist(shop.artist, 'A merch sale could not go through',
            'PayPal would not accept payments to the address in your Payment Settings. It must be a PayPal account that can receive payments.',
            { kind: 'payments_not_set_up', item: 'merch' });
        }
        return json(409, { error: refusedPayee ? 'This artist cannot take payments right now. We have let them know.' : 'PayPal could not start the payment. Try again.' });
      }

      await supabase.from('merch_orders').update({
        paypal_order_id: pp.body.id, printful_order_id: draft?.id || null, printful_status: draft?.status || 'draft',
        updated_at: new Date().toISOString(),
      }).eq('id', order.id);

      return json(200, {
        ok: true, orderID: pp.body.id,
        quote: { itemTotal, shippingCost, serviceFee, buyerPays, shippingName: rate.name || null },
      });
    }

    // ── Capture: take the money, check it, then print ───────────────────────
    if (body.action === 'capture') {
      const paypalOrderId = String(body.orderID || '');
      if (!paypalOrderId) return json(400, { error: 'orderID required' });

      // Claim the order so a double click cannot capture or print twice.
      const { data: claimed } = await supabase.from('merch_orders')
        .update({ status: 'capturing', updated_at: new Date().toISOString() })
        .eq('paypal_order_id', paypalOrderId).eq('status', 'awaiting_payment')
        .select('*').maybeSingle();

      if (!claimed) {
        const { data: existing } = await supabase.from('merch_orders')
          .select('id, status').eq('paypal_order_id', paypalOrderId).maybeSingle();
        if (!existing) return json(404, { error: 'Order not found.' });
        return json(200, { ok: ['in_production', 'paid'].includes(existing.status), order: existing });
      }

      const token = await paypalToken();
      let cap = await paypal('POST', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, token, null,
        { 'PayPal-Request-Id': `cap-${claimed.id}` });
      if (cap.status === 422) cap = await paypal('GET', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, token);

      const unit    = cap.body?.purchase_units?.[0];
      const capture = unit?.payments?.captures?.[0];
      if (cap.body?.status !== 'COMPLETED' || !capture || capture.status !== 'COMPLETED') {
        // Not paid: put it back so the buyer can try again.
        await supabase.from('merch_orders').update({ status: 'awaiting_payment', updated_at: new Date().toISOString() }).eq('id', claimed.id);
        return json(402, { error: 'The payment did not go through. Nothing was charged.' });
      }

      // PayPal's own record must say: the right amount, in USD, to this artist.
      const paidValue = round2(parseFloat(capture.amount?.value));
      const paidTo    = String(unit?.payee?.email_address || '').toLowerCase();
      const ok = capture.amount?.currency_code === 'USD'
        && paidValue === round2(claimed.buyer_pays)
        && paidTo === String(claimed.payee_email).toLowerCase();

      await supabase.from('merch_orders').update({
        paypal_capture_id: capture.id, paid_at: new Date().toISOString(),
        status: ok ? 'paid' : 'payment_mismatch',
        failure_reason: ok ? null : `paid ${capture.amount?.currency_code} ${paidValue} to ${paidTo || 'unknown'}`,
        updated_at: new Date().toISOString(),
      }).eq('id', claimed.id);

      const shop = { artist: null, creds: null };
      const { data: artist } = await supabase.from('artists').select('id, user_id, artist_name').eq('id', claimed.artist_id).maybeSingle();
      const { data: creds }  = await supabase.from('artist_printful_credentials').select('access_token, store_id').eq('artist_id', claimed.artist_id).maybeSingle();
      shop.artist = artist; shop.creds = creds;

      if (!ok) {
        await notifyAdmins('Merch payment did not match',
          `Order ${claimed.id}: expected $${claimed.buyer_pays} to ${claimed.payee_email}, PayPal says ${capture.amount?.currency_code} ${paidValue} to ${paidTo}. Not sent to Printful.`,
          { kind: 'merch_payment_mismatch', merch_order_id: claimed.id });
        return json(200, { ok: false, error: 'Your payment went through but needs a quick check before printing. We will be in touch.' });
      }

      if (artist) {
        await notifyArtist(artist, 'You sold merch',
          `${claimed.product_name || 'An item'} x${claimed.quantity}. $${Number(claimed.artist_receives).toFixed(2)} is in your PayPal. Printful will now print and ship it.`,
          { kind: 'merch_sale', merch_order_id: claimed.id });
      }

      if (!creds || !claimed.printful_order_id) {
        await supabase.from('merch_orders').update({ status: 'paid_not_fulfilled', failure_reason: 'printful_not_connected' }).eq('id', claimed.id);
        await notifyAdmins('Merch paid, not printed', `Order ${claimed.id}: Printful connection missing.`, { kind: 'merch_paid_not_fulfilled', merch_order_id: claimed.id });
        return json(200, { ok: true, order: { id: claimed.id, status: 'paid' } });
      }

      const sent = await sendToProduction(claimed, shop);
      return json(200, { ok: true, order: { id: claimed.id, status: sent.ok ? 'in_production' : 'paid' } });
    }

    // ── Artist retries a paid order Printful refused ────────────────────────
    if (body.action === 'retry') {
      const user = await signedInUser(event);
      if (!user) return json(401, { error: 'Sign in first.' });
      const { data: order } = await supabase.from('merch_orders').select('*').eq('id', body.merch_order_id).maybeSingle();
      if (!order || order.status !== 'paid_not_fulfilled') return json(409, { error: 'Nothing to retry on that order.' });
      const { data: artist } = await supabase.from('artists').select('id, user_id, artist_name').eq('id', order.artist_id).maybeSingle();
      if (!artist || artist.user_id !== user.id) return json(403, { error: 'Not your order.' });
      const { data: creds } = await supabase.from('artist_printful_credentials').select('access_token, store_id').eq('artist_id', artist.id).maybeSingle();
      if (!creds || !order.printful_order_id) return json(409, { error: 'Reconnect Printful first.' });
      const sent = await sendToProduction(order, { artist, creds });
      return sent.ok ? json(200, { ok: true }) : json(409, { error: sent.reason });
    }

    return json(400, { error: 'Unknown action' });
  } catch (e) {
    if (e instanceof PrintfulError) {
      return json(e.status >= 400 && e.status < 500 ? 409 : 502, { error: e.message });
    }
    console.error('[merch-order] failed:', e.message);
    return json(500, { error: 'Something went wrong. Try again, and if you were charged, contact us.' });
  }
};