// netlify/functions/grant-featured-placement.js
// Called by Plugin Gallery when an admin crowns a Studio Challenges winner
// who should be featured on Feelz Machine. Authenticated with a shared
// secret — Plugin Gallery never touches this database directly.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SECRET = process.env.CHALLENGE_FEATURE_SECRET || '';
const FEATURE_DAYS = 7;

const ALLOWED_ORIGINS = [
  'https://www.projectfeelz.com',
  'https://projectfeelz.com',
];

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
    const { secret, artistSlug, email } = JSON.parse(event.body || '{}');

    if (!SECRET || secret !== SECRET) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    if (!artistSlug && !email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'artistSlug or email required' }) };
    }

    // Find the artist — by slug if given, otherwise by the email on their account
    let artist = null;
    if (artistSlug) {
      const { data } = await supabase.from('artists').select('id, artist_name').eq('slug', artistSlug).maybeSingle();
      artist = data;
    } else {
      const { data: user } = await supabase.auth.admin.listUsers();
      const match = (user?.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (match) {
        const { data } = await supabase.from('artists').select('id, artist_name').eq('user_id', match.id).maybeSingle();
        artist = data;
      }
    }

    if (!artist) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Artist not found on Feelz Machine' }) };
    }

    const featuredUntil = new Date(Date.now() + FEATURE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('artists')
      .update({ featured: true, featured_until: featuredUntil })
      .eq('id', artist.id);

    try {
      await supabase.from('notifications').insert({
        artist_id: artist.id,
        type: 'competition_winner',
        title: '🏆 You\'re featured on Feelz Machine!',
        message: `You won a Studio Challenge on Plugin Gallery — you're now featured for ${FEATURE_DAYS} days.`,
        metadata: { source: 'plugin_gallery_challenge' },
      });
    } catch { /* notification failure shouldn't block the actual feature grant */ }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, artist_name: artist.artist_name, featured_until: featuredUntil }) };
  } catch (err) {
    console.error('[grant-featured-placement]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};