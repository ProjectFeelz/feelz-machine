/**
 * engagement-drip-cron.js
 *
 * Scheduled function — runs Mon & Thu at 08:00 UTC.
 * Calls the main engagement-drip HTTP function internally.
 * This separation lets the admin panel also POST to engagement-drip directly.
 */

const { createClient } = require('@supabase/supabase-js');

exports.handler = async () => {
  try {
    const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
    const res = await fetch(`${siteUrl}/.netlify/functions/engagement-drip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    console.log('Scheduled drip complete:', JSON.stringify(data));
    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    console.error('Scheduled drip error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
