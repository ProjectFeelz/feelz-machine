/**
 * netlify/functions/image-proxy.js
 *
 * Proxies images from Supabase storage with CORS headers so they can be
 * drawn onto an HTML Canvas without tainting it.
 *
 * Usage: /.netlify/functions/image-proxy?url=<encoded_image_url>
 */
exports.handler = async (event) => {
  const imageUrl = event.queryStringParameters?.url;

  if (!imageUrl) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }

  // Only allow proxying from our own Supabase project
  const allowed = [
    'bycdnwenbjusxpowojdb.supabase.co',
    'supabase.co',
  ];
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return { statusCode: 400, body: 'Invalid url' };
  }

  if (!allowed.some(domain => parsedUrl.hostname.endsWith(domain))) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      return { statusCode: res.status, body: `Upstream error: ${res.status}` };
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=86400',
      },
      body: base64,
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: `Proxy error: ${err.message}` };
  }
};
