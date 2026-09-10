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

  // Only allow proxying from our own Supabase project.
  //
  // This was matched with hostname.endsWith(domain) against a list that
  // included the bare 'supabase.co', which is two holes in one:
  //
  //   evilsupabase.co        .endsWith('supabase.co')  -> true
  //   anyproject.supabase.co .endsWith('supabase.co')  -> true
  //
  // The first is an attacker-registered domain, which makes this a
  // server-side request forgery: the function fetches whatever it is pointed
  // at and returns the body. An exact hostname match closes both.
  const allowed = [
    'bycdnwenbjusxpowojdb.supabase.co',
  ];
  let parsedUrl;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return { statusCode: 400, body: 'Invalid url' };
  }

  // Exact match, lowercased, and https only. A hostname is compared whole:
  // no endsWith, no includes, nothing that a longer attacker-chosen domain
  // can satisfy.
  if (parsedUrl.protocol !== 'https:' || !allowed.includes(parsedUrl.hostname.toLowerCase())) {
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