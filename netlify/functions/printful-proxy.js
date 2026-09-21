/**
 * netlify/functions/printful-proxy.js
 *
 * Server-side proxy for all Printful API calls.
 * Keeps access tokens off the client.
 *
 * POST body: { action, artist_id, ...params }
 *
 * actions:
 *   connect_api_key    save the artist's Printful private token (server side only)
 *   validate_store     check the token works and the store has products
 *   get_products       list store products with variants
 *   get_product        single product detail
 *   get_shipping_rates shipping estimate
 *   get_orders         the signed-in buyer's orders
 *   create_order       OFF until merch checkout takes payment (see below)
 *   disconnect         remove the saved token
 *
 * Why connecting never worked (fixed 21 Sept 2026):
 *   1. It checked the key with GET /store. That is not a Printful endpoint
 *      (the store endpoints are GET /stores and /store/products etc.), so every
 *      key failed, however it was pasted.
 *   2. Store calls need the X-PF-Store-Id header when the token is an
 *      account-level token. It was never sent.
 * Keys live in artist_printful_credentials (migration 149), which only this
 * function can read. They used to sit on the public artists row.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRINTFUL_API = 'https://api.printful.com';
// OAuth credentials removed, using direct API key flow

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

// Errors that are Printful telling us something about the TOKEN get turned
// into a 400 with an instruction, not a 500.
//
// A 500 says "the server broke". Printful answering
// "This endpoint requires any of the following scopes granted: stores_list/read"
// is not the server breaking, it is a correct, specific answer that the key
// the artist pasted was created without the permissions this needs. Reported
// as a 500 it looked like an outage and the actual instruction (go back to
// Printful and tick the boxes) was nowhere in the response.
class PrintfulError extends Error {
  constructor(message, status, hint) {
    super(message);
    this.name = 'PrintfulError';
    this.status = status;
    this.hint = hint;
  }
}

function tokenHint(message, status) {
  if (/scopes? granted|scope/i.test(message)) {
    return 'That key works, but it was created without enough permissions. In Printful go to '
         + 'Settings > Developers > your token > Edit, and enable read access for Stores, '
         + 'Products, Orders and Shipping. Then paste the key again.';
  }
  if (status === 401 || status === 403) {
    return 'Printful rejected that key. Check it was copied in full and has not been revoked.';
  }
  return null;
}

async function printfulFetch(path, accessToken, options = {}, storeId = null) {
  const res = await fetch(`${PRINTFUL_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
      // Required for account-level tokens, ignored for single-store ones.
      ...(storeId ? { 'X-PF-Store-Id': String(storeId) } : {}),
      ...(options.headers || {}),
    },
  });

  // Printful does not always answer JSON, an edge/gateway error is HTML, and
  // res.json() on that throws a SyntaxError that buries the real status.
  let json = null;
  try { json = await res.json(); } catch { /* handled below */ }

  if (!res.ok) {
    const message = json?.error?.message || json?.result || `Printful error ${res.status}`;
    throw new PrintfulError(message, res.status, tokenHint(String(message), res.status));
  }
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

// The artist's saved Printful token and store, from the private table.
async function getCredentials(artistId) {
  const { data } = await supabase
    .from('artist_printful_credentials')
    .select('access_token, store_id')
    .eq('artist_id', artistId)
    .maybeSingle();
  return data || null;
}

// Owner-only access to the token (validate_store).
async function getArtistToken(artistId, userId) {
  const { data, error } = await supabase
    .from('artists')
    .select('id, user_id, merch_enabled')
    .eq('id', artistId)
    .maybeSingle();
  if (error || !data) throw new Error('Artist not found');
  if (data.user_id !== userId) throw new Error('Forbidden');
  const creds = await getCredentials(artistId);
  if (!creds) throw new Error('Printful not connected');
  return { ...data, printful_access_token: creds.access_token, printful_store_id: creds.store_id };
}

// Public actions: merch must be switched on and a token saved.
async function getShopToken(artistId) {
  const { data: artist } = await supabase
    .from('artists').select('merch_enabled').eq('id', artistId).maybeSingle();
  if (!artist?.merch_enabled) return null;
  const creds = await getCredentials(artistId);
  return creds ? { printful_access_token: creds.access_token, printful_store_id: creds.store_id } : null;
}

const merchUnavailable = { statusCode: 403, headers: cors, body: JSON.stringify({ error: 'Merch not available' }) };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body    = JSON.parse(event.body || '{}');
    const { action, artist_id } = body;
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];

    // ── Connect via API key (replaces OAuth) ────────────────────────────────
    if (action === 'connect_api_key') {
      const userId  = await verifyUser(authHeader);
      const { api_key } = body;
      if (!api_key) throw new Error('API key required');

      // Ownership first, so a stranger's request never reaches Printful.
      const { data: artist } = await supabase
        .from('artists').select('id, user_id').eq('id', artist_id).maybeSingle();
      if (!artist || artist.user_id !== userId) throw new Error('Forbidden');

      // GET /stores answers for both token types: one store for a
      // single-store token, every store for an account-level token.
      const storesData = await printfulFetch('/stores', api_key);
      const stores = Array.isArray(storesData.result) ? storesData.result : [];
      if (stores.length === 0) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'That key has no Printful store attached.' }) };
      }
      if (stores.length > 1) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({
          ok: false,
          error: 'That key opens more than one Printful store, so we cannot tell which one is your shop.',
          hint: 'In Printful create a token with Access level set to "A single store" and pick your merch store.',
        }) };
      }
      const storeId = String(stores[0].id);

      const { error: credErr } = await supabase.from('artist_printful_credentials').upsert({
        artist_id:    artist_id,
        access_token: api_key,
        store_id:     storeId,
        updated_at:   new Date().toISOString(),
      });
      if (credErr) throw new Error('Could not save your Printful connection');

      await supabase.from('artists').update({
        printful_store_id: storeId,
        merch_enabled:     false, // validate_store enables it
        updated_at:        new Date().toISOString(),
      }).eq('id', artist_id);

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, store_id: storeId }) };
    }

    // ── Legacy OAuth handler (kept for backwards compat, proxies to api_key flow) ──
    if (action === 'connect_oauth') {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'OAuth flow deprecated. Use connect_api_key instead.' }) };
    }

    // ── Validate store (billing + products) ──────────────────────────────────
    if (action === 'validate_store') {
      const userId  = await verifyUser(authHeader);
      const artist  = await getArtistToken(artist_id, userId);

      const productsRes = await printfulFetch('/store/products?limit=1', artist.printful_access_token, {}, artist.printful_store_id);

      // Printful's API does not expose whether billing is set up. Printful
      // itself refuses to confirm an order without it, so it is enforced there.
      const billingOk  = true;
      const hasProducts = (productsRes.result?.length || 0) > 0;
      const valid = hasProducts;

      if (valid && !artist.merch_enabled) {
        await supabase.from('artists').update({ merch_enabled: true, updated_at: new Date().toISOString() }).eq('id', artist_id);
      }

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, valid, billingOk, hasProducts }) };
    }

    // ── Get products (public, no auth required, but artist must have merch_enabled) ──
    if (action === 'get_products') {
      const artist = await getShopToken(artist_id);
      if (!artist) return merchUnavailable;

      const data = await printfulFetch('/store/products', artist.printful_access_token, {}, artist.printful_store_id);
      // For each product, get variant details
      const products = await Promise.all(
        (data.result || []).slice(0, 30).map(async (p) => {
          try {
            const detail = await printfulFetch(`/store/products/${p.id}`, artist.printful_access_token, {}, artist.printful_store_id);
            return detail.result;
          } catch { return p; }
        })
      );

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, products }) };
    }

    // ── Get single product ────────────────────────────────────────────────────
    if (action === 'get_product') {
      const { product_id } = body;
      const artist = await getShopToken(artist_id);
      if (!artist) return merchUnavailable;
      const data = await printfulFetch(`/store/products/${encodeURIComponent(product_id)}`, artist.printful_access_token, {}, artist.printful_store_id);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, product: data.result }) };
    }

    // ── Create order: OFF ────────────────────────────────────────────────────
    // The checkout never took payment. It created a Printful order and
    // confirmed it straight to production, billed to the ARTIST's Printful
    // account, and the buyer paid nothing. So a connected artist would have
    // paid for every t-shirt out of pocket. It stays off until the checkout
    // takes the buyer's payment first (straight to the artist's PayPal, like
    // track sales) and this function checks that capture before confirming.
    if (action === 'create_order') {
      return { statusCode: 503, headers: cors, body: JSON.stringify({ ok: false, error: 'Merch checkout is not open yet.' }) };
    }

    // ── Shipping rates ────────────────────────────────────────────────────────
    if (action === 'get_shipping_rates') {
      const { shipping_address, items } = body;
      if (!shipping_address || !Array.isArray(items) || items.length === 0) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'shipping_address and items required' }) };
      }
      const artist = await getShopToken(artist_id);
      if (!artist) return merchUnavailable;

      const payload = {
        recipient: shipping_address,
        items: items.map(i => ({ sync_variant_id: i.variant_id, quantity: i.quantity })),
        currency: 'USD',
        locale: 'en_US',
      };

      const data = await printfulFetch('/shipping/rates', artist.printful_access_token, {
        method: 'POST',
        body: JSON.stringify(payload),
      }, artist.printful_store_id);

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, rates: data.result || [] }) };
    }

    // ── Get order history by email ──────────────────────────────────────────
    if (action === 'get_orders') {
      const userId = await verifyUser(authHeader);
      const artist = await getShopToken(artist_id);
      if (!artist) return merchUnavailable;

      // Get user's email
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      if (!email) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, orders: [] }) };

      const data = await printfulFetch('/orders?limit=20', artist.printful_access_token, {}, artist.printful_store_id);
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
      await supabase.from('artist_printful_credentials').delete().eq('artist_id', artist_id);
      await supabase.from('artists').update({
        printful_store_id:     null,
        merch_enabled:         false,
        updated_at:            new Date().toISOString(),
      }).eq('id', artist_id);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch (err) {
    console.error('printful-proxy error:', err.name, err.status || '', err.message);

    // A refusal from Printful, or from our own ownership checks, is a 4xx.
    // Only an actual unhandled fault is a 500.
    if (err instanceof PrintfulError) {
      const status = err.status >= 400 && err.status < 500 ? 400 : 502;
      return {
        statusCode: status,
        headers: cors,
        body: JSON.stringify({ ok: false, error: err.message, hint: err.hint || undefined }),
      };
    }
    if (/^(Unauthorized|Forbidden|Artist not found|Printful not connected|API key required)$/.test(err.message)) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ ok: false, error: err.message }) };
    }

    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: 'Something went wrong talking to Printful. Try again shortly.' }) };
  }
};