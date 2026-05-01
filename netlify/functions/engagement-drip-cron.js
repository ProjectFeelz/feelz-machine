/**
 * engagement-drip-cron.js
 *
 * Scheduled function — runs Mon & Thu at 08:00 UTC.
 * Calls the main engagement-drip BACKGROUND function internally.
 * Background functions have a 15-min timeout vs 10s for regular functions.
 * This separation lets the admin panel also POST to engagement-drip-background directly.
 */

exports.handler = async () => {
  try {
    const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
    const res = await fetch(`${siteUrl}/.netlify/functions/engagement-drip-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    // Background functions return 202 immediately — don't wait for body
    console.log('Scheduled drip triggered, status:', res.status);
    return { statusCode: 200, body: JSON.stringify({ triggered: true, status: res.status }) };
  } catch (err) {
    console.error('Scheduled drip error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};