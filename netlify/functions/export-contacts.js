// netlify/functions/export-contacts.js
// Exports follower contact list for premium artists

const https = require('https');

function supabaseRequest(path, method, body, serviceKey, supabaseUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(supabaseUrl);
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
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

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing env vars' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { artist_id, user_id } = body;
  if (!artist_id || !user_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'artist_id and user_id required' }) };
  }

  try {
    // Verify the requesting user owns this artist profile
    const artistRes = await supabaseRequest(
      `/rest/v1/artists?id=eq.${artist_id}&user_id=eq.${user_id}&select=id,artist_name,tier`,
      'GET', null, serviceKey, supabaseUrl
    );
    const artists = artistRes.body;
    if (!Array.isArray(artists) || artists.length === 0) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const artist = artists[0];

    // Check tier via artist_tier_subscriptions
    const subRes = await supabaseRequest(
      `/rest/v1/artist_tier_subscriptions?artist_id=eq.${artist_id}&status=eq.active&select=tier_id`,
      'GET', null, serviceKey, supabaseUrl
    );
    const subs = subRes.body;
    let isPremium = ['premium', 'master'].includes(artist.tier);

    if (Array.isArray(subs) && subs.length > 0) {
      const tierRes = await supabaseRequest(
        `/rest/v1/platform_tiers?id=eq.${subs[0].tier_id}&select=slug`,
        'GET', null, serviceKey, supabaseUrl
      );
      const tiers = tierRes.body;
      if (Array.isArray(tiers) && tiers.length > 0) {
        isPremium = ['premium', 'master', 'pro'].includes(tiers[0].slug);
      }
    }

    if (!isPremium) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Premium or Pro plan required' }) };
    }

    // Get follower user_ids
    const followsRes = await supabaseRequest(
      `/rest/v1/follows?artist_id=eq.${artist_id}&select=follower_id`,
      'GET', null, serviceKey, supabaseUrl
    );
    const follows = followsRes.body;
    if (!Array.isArray(follows) || follows.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ csv: 'name,email\n', count: 0 }) };
    }

    const followerIds = follows.map(f => f.follower_id);

    // Get emails from auth.users using service role
    const authRes = await supabaseRequest(
      `/auth/v1/admin/users?per_page=1000`,
      'GET', null, serviceKey, supabaseUrl
    );

    const authUsers = authRes.body?.users || [];
    const emailMap = {};
    authUsers.forEach(u => { emailMap[u.id] = u.email; });

    // Get display names from user_profiles
    const profileIds = followerIds.join(',');
    const profileRes = await supabaseRequest(
      `/rest/v1/user_profiles?user_id=in.(${followerIds.join(',')})&select=user_id,name`,
      'GET', null, serviceKey, supabaseUrl
    );
    const profiles = profileRes.body || [];
    const nameMap = {};
    profiles.forEach(p => { nameMap[p.user_id] = p.name; });

    // Also check artists table for artist names
    const artistProfileRes = await supabaseRequest(
      `/rest/v1/artists?user_id=in.(${followerIds.join(',')})&select=user_id,artist_name`,
      'GET', null, serviceKey, supabaseUrl
    );
    const artistProfiles = artistProfileRes.body || [];
    artistProfiles.forEach(a => {
      if (!nameMap[a.user_id]) nameMap[a.user_id] = a.artist_name;
    });

    // Build CSV
    const rows = followerIds
      .map(id => ({
        name: nameMap[id] || '',
        email: emailMap[id] || '',
      }))
      .filter(r => r.email);

    const csv = ['name,email', ...rows.map(r => `"${r.name}","${r.email}"`)].join('\n');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv, count: rows.length }),
    };

  } catch (err) {
    console.error('Export contacts error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};