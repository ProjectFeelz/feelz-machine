// netlify/functions/paypal-order.js
// Creates and captures PayPal orders for track purchases.
// Amount is ALWAYS read from the DB — never trusted from the client.

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

async function getPayPalAccessToken() {
  return new Promise((resolve, reject) => {
    const credentials = Buffer.from(
      `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');
    const payload = 'grant_type=client_credentials';
    const options = {
      hostname: 'api-m.paypal.com',
      path: '/v1/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.access_token) resolve(result.access_token);
          else reject(new Error('No access token: ' + data));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function paypalRequest(method, path, body, accessToken) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api-m.paypal.com',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { action, orderId, trackId, artistName } = body;

  if (!action) {
    return { statusCode: 400, body: JSON.stringify({ error: 'action required: create or capture' }) };
  }

  try {
    const accessToken = await getPayPalAccessToken();

    // ========== CREATE ORDER ==========
    if (action === 'create') {
      if (!trackId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'trackId required' }) };
      }

      // ── Look up authoritative price and title from DB — never trust client ──
      const adminClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { data: track, error: trackErr } = await adminClient
        .from('tracks')
        .select('id, title, download_price, is_downloadable')
        .eq('id', trackId)
        .maybeSingle();

      if (trackErr || !track) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) };
      }
      if (!track.is_downloadable || !track.download_price || track.download_price <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'This track is not available for paid download' }) };
      }

      const safeAmount = parseFloat(track.download_price).toFixed(2);
      const trackTitle = track.title;

      const orderPayload = {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: safeAmount,
          },
          description: `${trackTitle} by ${artistName || 'Artist'} - Feelz Machine`,
          custom_id: trackId,
        }],
        application_context: {
          brand_name: 'Feelz Machine',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW',
          return_url: 'https://www.feelzmachine.com',
          cancel_url: 'https://www.feelzmachine.com',
        },
      };

      const result = await paypalRequest('POST', '/v2/checkout/orders', orderPayload, accessToken);

      if (result.status !== 201) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Failed to create order', details: result.body }),
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ orderId: result.body.id, amount: safeAmount }),
      };
    }

    // ========== CAPTURE ORDER ==========
    if (action === 'capture') {
      if (!orderId) {
        return { statusCode: 400, body: JSON.stringify({ error: 'orderId required' }) };
      }

      const result = await paypalRequest(
        'POST',
        `/v2/checkout/orders/${orderId}/capture`,
        {},
        accessToken
      );

      if (result.status !== 201 && result.status !== 200) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Failed to capture order', details: result.body }),
        };
      }

      const capture = result.body.purchase_units?.[0]?.payments?.captures?.[0];
      const captureId = capture?.id;
      const capturedAmount = parseFloat(capture?.amount?.value || 0);

      // ── Trigger split payout server-side — secret never leaves the server ──
      // Get trackId from custom_id stored on the order
      const captureTrackId = result.body.purchase_units?.[0]?.custom_id;
      if (captureTrackId && captureId && capturedAmount > 0) {
        try {
          const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
          fetch(`${siteUrl}/.netlify/functions/process-split-payout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '',
            },
            body: JSON.stringify({
              track_id:       captureTrackId,
              transaction_id: captureId,
              total_amount:   capturedAmount,
            }),
          }).catch(err => console.error('Split payout trigger failed:', err.message));
        } catch (e) {
          console.error('Split payout trigger error:', e.message);
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          orderId: result.body.id,
          captureId: captureId,
          amount: capture?.amount?.value,
          status: capture?.status,
        }),
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };

  } catch (err) {
    console.error('PayPal order error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};