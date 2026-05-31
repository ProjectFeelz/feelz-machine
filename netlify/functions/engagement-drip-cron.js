/**
 * engagement-drip-cron.js
 *
 * Scheduled: Mon & Thu 08:00 UTC via netlify.toml [[scheduled_functions]]
 * Also accepts manual POST from admin panel (AdminEngagement.js)
 *
 * Acts as a gateway to engagement-drip-background (which is a background
 * function — direct browser calls to background functions return 503).
 * This regular function has 10s to trigger the background function, which
 * then runs for up to 860s.
 */

exports.handler = async (event) => {
  // Accept both scheduled (GET) and manual admin trigger (POST)
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
    const res = await fetch(`${siteUrl}/.netlify/functions/engagement-drip-background`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '',
      },
    });

    // Background functions return 202 immediately then run async
    // Status 202 = accepted and running, 200 = completed synchronously
    const isSuccess = res.status === 200 || res.status === 202;

    let data = {};
    try {
      const text = await res.text();
      if (text) data = JSON.parse(text);
    } catch {}

    console.log(`Drip ${event.httpMethod === 'POST' ? 'manual' : 'scheduled'} trigger — status: ${res.status}`);

    if (!isSuccess) {
      console.error('Background function rejected:', res.status, data);
      return { statusCode: 500, body: JSON.stringify({ error: `Background function returned ${res.status}`, detail: data }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        triggered: true,
        status:    res.status,
        async:     res.status === 202,
        ...data,
      }),
    };
  } catch (err) {
    console.error('Drip cron error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};