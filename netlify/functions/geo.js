/**
 * geo.js
 *
 * Returns the caller's own approximate location, read from Netlify's
 * x-nf-geo header. Used by PlayerContext to stamp country and city onto
 * listening_events so artists can see where their music is being played.
 *
 * Same mechanism school-sessions-gate.js already uses. Netlify injects
 * this header on every request through its edge, so there is no
 * third-party geo API, no key, and no cost.
 *
 * Deliberately unauthenticated and side-effect free. It only ever tells a
 * caller about themselves, reads nothing, writes nothing, and touches no
 * database, so there is nothing here worth abusing and nothing to rate
 * limit. If the header is absent it returns nulls rather than an error,
 * because a play with unknown location should still be recorded.
 */

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    // Cache for the session. Location does not change mid listen, and this
    // stops a busy listener hitting the function on every track change.
    'Cache-Control': 'private, max-age=3600',
  };

  try {
    const raw = event.headers['x-nf-geo'] || event.headers['X-Nf-Geo'];
    if (!raw) {
      return { statusCode: 200, headers, body: JSON.stringify({ country: null, country_name: null, city: null, region: null }) };
    }
    const geo = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        country:      geo?.country?.code || null,
        country_name: geo?.country?.name || null,
        city:         geo?.city || null,
        region:       geo?.subdivision?.name || null,
      }),
    };
  } catch {
    return { statusCode: 200, headers, body: JSON.stringify({ country: null, country_name: null, city: null, region: null }) };
  }
};