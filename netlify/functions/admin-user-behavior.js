// netlify/functions/admin-user-behavior.js
const https = require('https');

function supabaseGet(path, serviceKey, supabaseUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(supabaseUrl);
    const options = {
      hostname: url.hostname,
      path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
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
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) return { statusCode: 500, body: JSON.stringify({ error: 'Missing env vars' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { user_id, action_types = [], from_date, to_date, artist_id, format = 'json' } = body;

  // ── AUTHENTICATION ─────────────────────────────────────────────────────────
  //
  // This function had none. It read `user_id` FROM THE REQUEST BODY and asked
  // the database whether THAT user was a master artist:
  //
  //     /rest/v1/artists?user_id=eq.${user_id}&select=is_master
  //
  // No bearer token was ever verified. So anyone who knew or guessed a master
  // artist's user id got everything below — every stream, download, like and
  // playlist row, plus a user_id-to-EMAIL map for up to a thousand accounts —
  // from an endpoint holding the service role key.
  //
  // The interpolation made it worse: `user_id` went into the query string
  // unescaped, so a value containing `&` could append its own PostgREST
  // filters and satisfy the is_master test without knowing anybody's id.
  //
  // Identity now comes from the Authorization header, which is signed and
  // cannot be chosen by the caller. `user_id` from the body is used only as
  // the SUBJECT of the report, never as the authority for reading it.
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { createClient } = require('@supabase/supabase-js');
  const authClient = createClient(supabaseUrl, serviceKey);
  const { data: { user: caller }, error: authError } =
    await authClient.auth.getUser(authHeader.slice(7).trim());

  if (authError || !caller) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // Is the CALLER an admin? Two accepted sources, because this codebase has
  // three different answers to "who is an admin" and the admins table is the
  // one the other privileged functions use.
  const [{ data: adminRow }, { data: masterRows }] = await Promise.all([
    authClient.from('admins').select('id').eq('user_id', caller.id).maybeSingle(),
    authClient.from('artists').select('is_master').eq('user_id', caller.id),
  ]);
  const isAdmin = !!adminRow || (Array.isArray(masterRows) && masterRows.some(a => a.is_master));
  if (!isAdmin) return { statusCode: 403, body: JSON.stringify({ error: 'Admin only' }) };

  // The report subject still has to be a well-formed uuid, because it is
  // interpolated into PostgREST paths below and that is how the filter
  // injection above was possible in the first place.
  if (user_id && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(user_id)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'user_id must be a uuid' }) };
  }
  if (artist_id && !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(artist_id)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'artist_id must be a uuid' }) };
  }

  const dateFilter = (table, col) => {
    let f = '';
    if (from_date) f += `&${col}=gte.${from_date}`;
    if (to_date) f += `&${col}=lte.${to_date}`;
    return f;
  };

  const artistFilter = artist_id ? `&artist_id=eq.${artist_id}` : '';
  const trackArtistFilter = artist_id ? `&tracks.artist_id=eq.${artist_id}` : '';

  const results = {};

  try {
    // Streams
    if (!action_types.length || action_types.includes('streams')) {
      const res = await supabaseGet(
        `/rest/v1/streams?select=id,track_id,user_id,created_at,duration_played,platform,device_type,tracks(title,artist_id,artists(artist_name))${dateFilter('streams', 'created_at')}&order=created_at.desc&limit=5000`,
        serviceKey, supabaseUrl
      );
      results.streams = Array.isArray(res.body) ? res.body : [];
    }

    // Downloads
    if (!action_types.length || action_types.includes('downloads')) {
      const res = await supabaseGet(
        `/rest/v1/downloads?select=id,track_id,user_id,created_at,amount_paid,tracks(title,artist_id,artists(artist_name))${dateFilter('downloads', 'created_at')}&order=created_at.desc&limit=5000`,
        serviceKey, supabaseUrl
      );
      results.downloads = Array.isArray(res.body) ? res.body : [];
    }

    // Likes
    if (!action_types.length || action_types.includes('likes')) {
      const res = await supabaseGet(
        `/rest/v1/track_likes?select=id,track_id,user_id,created_at,tracks(title,artist_id,artists(artist_name))${dateFilter('track_likes', 'created_at')}&order=created_at.desc&limit=5000`,
        serviceKey, supabaseUrl
      );
      results.likes = Array.isArray(res.body) ? res.body : [];
    }

    // Playlist activity
    if (!action_types.length || action_types.includes('playlists')) {
      const res = await supabaseGet(
        `/rest/v1/playlist_tracks?select=id,track_id,playlist_id,created_at,tracks(title,artist_id,artists(artist_name)),playlists(name,user_id)${dateFilter('playlist_tracks', 'created_at')}&order=created_at.desc&limit=5000`,
        serviceKey, supabaseUrl
      );
      results.playlists = Array.isArray(res.body) ? res.body : [];
    }

    // Auth/session activity from auth.users
    if (!action_types.length || action_types.includes('logins')) {
      const res = await supabaseGet(
        `/auth/v1/admin/users?per_page=1000`,
        serviceKey, supabaseUrl
      );
      const users = res.body?.users || [];
      results.logins = users.map(u => ({
        user_id: u.id,
        email: u.email,
        last_sign_in: u.last_sign_in_at,
        created_at: u.created_at,
        confirmed: !!u.confirmed_at,
      })).filter(u => {
        if (from_date && u.last_sign_in < from_date) return false;
        if (to_date && u.last_sign_in > to_date) return false;
        return true;
      });
    }

    // Build user email map
    const authRes = await supabaseGet(`/auth/v1/admin/users?per_page=1000`, serviceKey, supabaseUrl);
    const emailMap = {};
    (authRes.body?.users || []).forEach(u => { emailMap[u.id] = u.email; });

    // Filter by artist if specified
    if (artist_id) {
      if (results.streams) results.streams = results.streams.filter(s => s.tracks?.artist_id === artist_id);
      if (results.downloads) results.downloads = results.downloads.filter(d => d.tracks?.artist_id === artist_id);
      if (results.likes) results.likes = results.likes.filter(l => l.tracks?.artist_id === artist_id);
    }

    // Enrich with emails
    const enrichWithEmail = (arr, key = 'user_id') => (arr || []).map(r => ({ ...r, user_email: emailMap[r[key]] || '' }));
    if (results.streams) results.streams = enrichWithEmail(results.streams);
    if (results.downloads) results.downloads = enrichWithEmail(results.downloads);
    if (results.likes) results.likes = enrichWithEmail(results.likes);
    if (results.playlists) results.playlists = enrichWithEmail(results.playlists);

    if (format === 'csv') {
      const rows = [];
      rows.push('type,user_email,track_title,artist_name,date,extra');
      (results.streams || []).forEach(r => rows.push(`stream,"${r.user_email}","${r.tracks?.title || ''}","${r.tracks?.artists?.artist_name || ''}","${r.created_at}","${r.platform || ''}"`));
      (results.downloads || []).forEach(r => rows.push(`download,"${r.user_email}","${r.tracks?.title || ''}","${r.tracks?.artists?.artist_name || ''}","${r.created_at}","$${r.amount_paid || 0}"`));
      (results.likes || []).forEach(r => rows.push(`like,"${r.user_email}","${r.tracks?.title || ''}","${r.tracks?.artists?.artist_name || ''}","${r.created_at}",""`));
      (results.playlists || []).forEach(r => rows.push(`playlist_add,"${r.user_email}","${r.tracks?.title || ''}","${r.tracks?.artists?.artist_name || ''}","${r.created_at}","${r.playlists?.name || ''}"`));
      (results.logins || []).forEach(r => rows.push(`login,"${r.email}","","","${r.last_sign_in}",""`));
      return { statusCode: 200, body: JSON.stringify({ csv: rows.join('\n'), counts: { streams: results.streams?.length, downloads: results.downloads?.length, likes: results.likes?.length, playlists: results.playlists?.length, logins: results.logins?.length } }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        data: results,
        counts: {
          streams: results.streams?.length || 0,
          downloads: results.downloads?.length || 0,
          likes: results.likes?.length || 0,
          playlists: results.playlists?.length || 0,
          logins: results.logins?.length || 0,
        },
        email_map: emailMap,
      }),
    };
  } catch (err) {
    console.error('User behavior error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};