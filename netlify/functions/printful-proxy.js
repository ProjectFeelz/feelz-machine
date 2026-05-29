/**
 * netlify/functions/printful-proxy.js
 *
 * Server-side proxy for all Printful API calls.
 * Keeps access tokens off the client.
 *
 * POST body: { action, artist_id, ...params }
 *
 * actions:
 *   connect_oauth   — exchange OAuth code for access token, store in artists table
 *   validate_store  — check billing configured + has products
 *   get_products    — list store products with variants
 *   get_product     — single product detail
 *   create_order    — create a Printful order
 *   disconnect      — remove printful credentials from artists table
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRINTFUL_API = 'https://api.printful.com';
const PRINTFUL_CLIENT_ID     = process.env.PRINTFUL_CLIENT_ID;
const PRINTFUL_CLIENT_SECRET = process.env.PRINTFUL_CLIENT_SECRET;

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

async function printfulFetch(path, accessToken, options = {}) {
  const res = await fetch(`${PRINTFUL_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
      ...(options.headers || {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Printful error ${res.status}`);
  return json;
}

// Verify the caller's Supabase JWT and return their user_id
async function verifyUser(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized');
  return user.id;
}

// Get artist's Printful access token (server-side only)
async function getArtistToken(artistId, userId) {
  const { data, error } = await supabase
    .from('artists')
    .select('id, user_id, printful_access_token, printful_store_id, merch_enabled')
    .eq('id', artistId)
    .maybeSingle();
  if (error || !data) throw new Error('Artist not found');
  if (data.user_id !== userId) throw new Error('Forbidden');
  if (!data.printful_access_token) throw new Error('Printful not connected');
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body    = JSON.parse(event.body || '{}');
    const { action, artist_id } = body;
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];

    // ── Connect OAuth ─────────────────────────────────────────────────────────
    if (action === 'connect_oauth') {
      const userId = await verifyUser(authHeader);
      const { code, redirect_uri } = body;

      // Exchange code for access token
      const tokenRes = await fetch('https://www.printful.com/oauth/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type:    'authorization_code',
          client_id:     PRINTFUL_CLIENT_ID,
          client_secret: PRINTFUL_CLIENT_SECRET,
          code,
          redirect_uri,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || 'Failed to get access token');
      }

      const accessToken = tokenData.access_token;

      // Get store info
      const storeData = await printfulFetch('/store', accessToken);
      const storeId   = storeData.result?.id;
      if (!storeId) throw new Error('Could not retrieve store info');

      // Verify artist ownership
      const { data: artist } = await supabase
        .from('artists').select('id, user_id').eq('id', artist_id).maybeSingle();
      if (!artist || artist.user_id !== userId) throw new Error('Forbidden');

      // Save to artists table
      await supabase.from('artists').update({
        printful_access_token: accessToken,
        printful_store_id:     String(storeId),
        merch_enabled:         false, // requires validation before enabling
        updated_at:            new Date().toISOString(),
      }).eq('id', artist_id);

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, store_id: storeId }) };
    }

    // ── Validate store (billing + products) ──────────────────────────────────
    if (action === 'validate_store') {
      const userId  = await verifyUser(authHeader);
      const artist  = await getArtistToken(artist_id, userId);

      const [storeRes, productsRes] = await Promise.all([
        printfulFetch('/store', artist.printful_access_token),
        printfulFetch('/store/products?limit=1', artist.printful_access_token),
      ]);

      const billingOk  = storeRes.result?.billing_address !== null;
      const hasProducts = (productsRes.result?.length || 0) > 0;
      const valid = billingOk && hasProducts;

      if (valid && !artist.merch_enabled) {
        await supabase.from('artists').update({ merch_enabled: true, updated_at: new Date().toISOString() }).eq('id', artist_id);
      }

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, valid, billingOk, hasProducts }) };
    }

    // ── Get products (public — no auth required, but artist must have merch_enabled) ──
    if (action === 'get_products') {
      const { data: artist } = await supabase
        .from('artists')
        .select('printful_access_token, merch_enabled')
        .eq('id', artist_id)
        .maybeSingle();
      if (!artist?.merch_enabled || !artist.printful_access_token) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Merch not available' }) };
      }

      const data = await printfulFetch('/store/products', artist.printful_access_token);
      // For each product, get variant details
      const products = await Promise.all(
        (data.result || []).slice(0, 30).map(async (p) => {
          try {
            const detail = await printfulFetch(`/store/products/${p.id}`, artist.printful_access_token);
            return detail.result;
          } catch { return p; }
        })
      );

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, products }) };
    }

    // ── Get single product ────────────────────────────────────────────────────
    if (action === 'get_product') {
      const { product_id } = body;
      const { data: artist } = await supabase
        .from('artists').select('printful_access_token, merch_enabled').eq('id', artist_id).maybeSingle();
      if (!artist?.merch_enabled || !artist.printful_access_token) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Merch not available' }) };
      }
      const data = await printfulFetch(`/store/products/${product_id}`, artist.printful_access_token);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, product: data.result }) };
    }

    // ── Create order ──────────────────────────────────────────────────────────
    if (action === 'create_order') {
      const { shipping_address, items, email } = body;
      const { data: artist } = await supabase
        .from('artists').select('printful_access_token, merch_enabled, artist_name').eq('id', artist_id).maybeSingle();
      if (!artist?.merch_enabled || !artist.printful_access_token) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Merch not available' }) };
      }

      const orderPayload = {
        recipient: { ...shipping_address, email },
        items: items.map(i => ({ sync_variant_id: i.variant_id, quantity: i.quantity })),
        retail_costs: { currency: 'USD' },
      };

      const data = await printfulFetch('/orders', artist.printful_access_token, {
        method: 'POST',
        body: JSON.stringify(orderPayload),
      });

      // Confirm order (sends to production)
      const confirmed = await printfulFetch(
        `/orders/${data.result.id}/confirm`,
        artist.printful_access_token,
        { method: 'POST' }
      );

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, order: confirmed.result }) };
    }

    // ── Shipping rates ────────────────────────────────────────────────────────
    if (action === 'get_shipping_rates') {
      const { shipping_address, items } = body;
      const { data: artist } = await supabase
        .from('artists').select('printful_access_token, merch_enabled').eq('id', artist_id).maybeSingle();
      if (!artist?.merch_enabled || !artist.printful_access_token) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Merch not available' }) };
      }

      const payload = {
        recipient: shipping_address,
        items: items.map(i => ({ sync_variant_id: i.variant_id, quantity: i.quantity })),
        currency: 'USD',
        locale: 'en_US',
      };

      const data = await printfulFetch('/shipping/rates', artist.printful_access_token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, rates: data.result || [] }) };
    }

    // ── Get order history by email ──────────────────────────────────────────
    if (action === 'get_orders') {
      const userId = await verifyUser(authHeader);
      const { data: artist } = await supabase
        .from('artists').select('printful_access_token, merch_enabled').eq('id', artist_id).maybeSingle();
      if (!artist?.merch_enabled || !artist.printful_access_token) {
        return { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Merch not available' }) };
      }

      // Get user's email
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (!email) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, orders: [] }) };

      const data = await printfulFetch('/orders?limit=20', artist.printful_access_token);
      // Filter orders by recipient email
      const orders = (data.result || []).filter(o =>
        o.recipient?.email?.toLowerCase() === email.toLowerCase()
      );

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, orders }) };
    }

    // ── Disconnect ────────────────────────────────────────────────────────────
    if (action === 'disconnect') {
      const userId = await verifyUser(authHeader);
      const { data: artist } = await supabase
        .from('artists').select('id, user_id').eq('id', artist_id).maybeSingle();
      if (!artist || artist.user_id !== userId) throw new Error('Forbidden');
      await supabase.from('artists').update({
        printful_access_token: null,
        printful_store_id:     null,
        merch_enabled:         false,
        updated_at:            new Date().toISOString(),
      }).eq('id', artist_id);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    console.error('printful-proxy error:', err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};