// netlify/functions/verify-auth-bridge.js
// Verifies a signed token handed off from Plugin Gallery's auth bridge.
// Deliberately does NOT check whether an account exists or create one —
// it just proves "this email is a real, currently logged-in Plugin Gallery
// user". The frontend then runs that email through the normal magic-link
// sign-in flow, which already safely handles both new and existing accounts.

const crypto = require('crypto');

const SECRET = process.env.AUTH_BRIDGE_SECRET || '';

const ALLOWED_ORIGINS = [
  'https://www.feelzmachine.com',
  'https://feelzmachine.com',
];

function verifyToken(token) {
  if (!SECRET || !token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null; // bad signature
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload.email || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { token } = JSON.parse(event.body || '{}');
    const payload = verifyToken(token);

    if (!payload) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired token' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ email: payload.email.toLowerCase() }) };
  } catch (err) {
    console.error('[verify-auth-bridge]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};