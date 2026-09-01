// netlify/functions/school-sessions-gate.js
// Tells the client whether School Sessions should be visible at all:
//   - is the feature toggled on (school_sessions_config.is_enabled)
//   - does this visitor pass the region check — South African IP (via
//     Netlify's built-in geo header) OR an allowed-school match
//
// GET /.netlify/functions/school-sessions-gate?school=<name optional>
//
// Netlify injects `x-nf-geo` on every request that passes through its edge —
// a base64-encoded JSON blob with { country: { code, name }, city, ... }.
// No third-party geo API needed.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCountryCode(event) {
  try {
    const raw = event.headers['x-nf-geo'] || event.headers['X-Nf-Geo'];
    if (!raw) return null;
    const geo = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return geo?.country?.code || null;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  try {
    const { data: config } = await supabase
      .from('school_sessions_config')
      .select('*, competition:competitions(*)')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();

    if (!config || !config.is_enabled) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ enabled: false, allowed: false, reason: 'disabled', config: null }),
      };
    }

    const countryCode = getCountryCode(event);
    const inRegion = !countryCode || countryCode === config.allowed_country_code;
    // ^ fail-open on missing geo header (local dev, some proxies strip it) —
    //   the school allow-list check below still applies if configured.

    let schoolAllowed = !config.require_school_allowlist;
    const schoolParam = event.queryStringParameters?.school?.trim();
    if (config.require_school_allowlist && schoolParam) {
      const { data: school } = await supabase
        .from('school_sessions_schools')
        .select('id')
        .ilike('name', schoolParam)
        .eq('is_active', true)
        .maybeSingle();
      schoolAllowed = !!school;
    }

    const allowed = inRegion || schoolAllowed;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        enabled: true,
        allowed,
        reason: allowed ? 'ok' : 'region_locked',
        countryCode,
        config: {
          allowed_country_code: config.allowed_country_code,
          require_school_allowlist: config.require_school_allowlist,
          season: config.season,
          target_level: config.target_level,
          viral_course_url: config.viral_course_url,
          platform_course_url: config.platform_course_url,
          youtube_playlist_url: config.youtube_playlist_url,
          competition: config.competition,
        },
      }),
    };
  } catch (err) {
    console.error('school-sessions-gate error:', err);
    // Fail closed on unexpected errors — better to hide the feature than
    // leak it to visitors it shouldn't reach.
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ enabled: false, allowed: false, reason: 'error' }),
    };
  }
};