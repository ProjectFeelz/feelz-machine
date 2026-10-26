/**
 * netlify/lib/merch-fulfil.js
 *
 * The part of a merch order that happens AFTER the money has arrived.
 *
 *
 * WHY THIS IS A LIBRARY AND NOT A BLOCK INSIDE merch-order.js
 *
 * There are now two ways to pay for merch and they finish in different
 * places. A PayPal order is captured by the browser calling merch-order.js
 * with action 'capture', so that function knows the moment the money lands. A
 * rand order is paid on a card at Paystack, and the only thing that knows it
 * worked is paystack-webhook.js, which Paystack signs and calls server to
 * server. Nothing in the browser can be trusted to say a rand payment
 * happened, which is the whole reason the music route is built that way too.
 *
 * So the confirm-and-print step has two callers in two files. It lives here
 * once rather than being copied, because the failure it handles is the
 * expensive one: a buyer who has paid and an artist whose Printful account
 * never got the order.
 *
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not decide whether the money arrived. Each caller proves that in
 * its own way against its own processor, and only then calls in here. This
 * file assumes payment and does the printing.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PRINTFUL_API = 'https://api.printful.com';

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
    const msg = body?.error?.message
      || (typeof body?.result === 'string' ? body.result : null)
      || `Printful error ${res.status}`;
    throw new PrintfulError(msg, res.status);
  }
  return body?.result;
}

async function notifyArtist(artist, title, message, metadata) {
  if (!artist) return;
  const { error } = await supabase.from('notifications').insert({
    artist_id: artist.id, user_id: artist.user_id || null,
    type: 'admin_message', title, message, metadata,
  });
  if (error) console.error('[merch-fulfil] artist notice failed:', error.message);
}

async function notifyAdmins(title, message, metadata) {
  const { data: admins } = await supabase.from('admins').select('user_id');
  const rows = (admins || []).map(a => ({ user_id: a.user_id, type: 'admin_message', title, message, metadata }));
  if (!rows.length) return;
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) console.error('[merch-fulfil] admin notice failed:', error.message);
}

/**
 * Confirm the Printful draft into production.
 *
 * The draft was created before anyone paid, so Printful has already agreed it
 * can ship that item to that address. This is the step that tells it to start.
 */
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

    // The artist is told in the terms of the thing they have to do about it.
    // "Printful returned 400" is not an instruction; "your billing is not set
    // up, fix it and press Retry" is.
    const route = order.processor === 'paystack' ? 'bank account' : 'PayPal';
    await notifyArtist(shop.artist, 'Merch order paid but not printed',
      `A fan paid you ${order.processor === 'paystack'
        ? `R${Number(order.zar_charged || 0).toFixed(2)}`
        : `$${Number(order.artist_receives || 0).toFixed(2)}`} for ${order.product_name || 'merch'}, `
      + `but Printful would not start the order: ${e.message}. Usually this is billing not set up in Printful. `
      + 'Fix it in Printful, then open Merch Store from the Create menu and press Retry on the order. '
      + `If you cannot fulfil it, refund the buyer from your ${route}.`,
      { kind: 'merch_paid_not_fulfilled', merch_order_id: order.id });

    await notifyAdmins('Merch paid, not printed',
      `Order ${order.id} for ${shop.artist?.artist_name || order.artist_id}: ${e.message}`,
      { kind: 'merch_paid_not_fulfilled', merch_order_id: order.id });

    return { ok: false, reason: e.message };
  }
}

/**
 * Everything that happens to a merch order once its payment is proven.
 *
 * Marks it paid, tells the artist they sold something, and sends the Printful
 * draft to production. Written to be safe to call twice, because a webhook is
 * delivered more than once as a matter of course: an order that is already
 * past 'awaiting_payment' is reported, not re-run.
 *
 * @param {object} opts
 * @param {string} opts.merchOrderId
 * @param {string} opts.paidLabel   what to tell the artist arrived, e.g. 'R402.00'
 * @param {object} [opts.patch]     extra columns to write on the order row
 */
async function fulfilPaidMerchOrder({ merchOrderId, paidLabel, patch = {} }) {
  const { data: order } = await supabase.from('merch_orders')
    .select('*').eq('id', merchOrderId).maybeSingle();

  if (!order) return { ok: false, reason: 'order_not_found' };

  // Already handled. A repeat delivery is normal and must not print twice.
  if (['paid', 'in_production', 'paid_not_fulfilled', 'payment_mismatch'].includes(order.status)) {
    return { ok: true, already: true, status: order.status };
  }

  const { data: claimed } = await supabase.from('merch_orders')
    .update({
      ...patch,
      status: 'paid',
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', merchOrderId)
    .in('status', ['awaiting_payment', 'capturing'])
    .select('*').maybeSingle();

  // Lost the race with another delivery of the same event. The other one is
  // doing the work.
  if (!claimed) return { ok: true, already: true };

  const { data: artist } = await supabase.from('artists')
    .select('id, user_id, artist_name').eq('id', claimed.artist_id).maybeSingle();
  const { data: creds } = await supabase.from('artist_printful_credentials')
    .select('access_token, store_id').eq('artist_id', claimed.artist_id).maybeSingle();

  await notifyArtist(artist, 'You sold merch',
    `${claimed.product_name || 'An item'} x${claimed.quantity}. ${paidLabel} is on its way to you. `
    + 'Printful will now print and ship it.',
    { kind: 'merch_sale', merch_order_id: claimed.id });

  if (!creds || !claimed.printful_order_id) {
    await supabase.from('merch_orders')
      .update({ status: 'paid_not_fulfilled', failure_reason: 'printful_not_connected' })
      .eq('id', claimed.id);
    await notifyAdmins('Merch paid, not printed',
      `Order ${claimed.id}: Printful connection missing.`,
      { kind: 'merch_paid_not_fulfilled', merch_order_id: claimed.id });
    return { ok: true, printed: false, reason: 'printful_not_connected' };
  }

  const sent = await sendToProduction(claimed, { artist, creds });
  return { ok: true, printed: sent.ok, reason: sent.reason || null };
}

module.exports = {
  PrintfulError,
  printful,
  notifyArtist,
  notifyAdmins,
  sendToProduction,
  fulfilPaidMerchOrder,
};
