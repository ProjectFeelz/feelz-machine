const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const authHeader = event.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let trackId;
  try {
    ({ trackId } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!trackId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'trackId is required' }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
  }

  const { data: track, error: trackError } = await adminClient
    .from('tracks')
    .select('file_url, title, is_preorder, release_date, download_price')
    .eq('id', trackId)
    .maybeSingle();

  if (trackError || !track) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) };
  }

  if (track.is_preorder && track.release_date) {
    const releaseDate = new Date(track.release_date);
    if (releaseDate > new Date()) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'not_released_yet', release_date: track.release_date }),
      };
    }
  }

  const trackIsFree = !track.download_price || track.download_price <= 0;

  if (trackIsFree) {
    await adminClient
      .from('downloads')
      .upsert(
        { user_id: user.id, track_id: trackId, amount_paid: 0 },
        { onConflict: 'user_id,track_id', ignoreDuplicates: true }
      );
  } else {
    const { data: purchase } = await adminClient
      .from('downloads')
      .select('id')
      .eq('user_id', user.id)
      .eq('track_id', trackId)
      .maybeSingle();

    if (!purchase) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Purchase required' }) };
    }
  }

  const storagePathMatch = track.file_url.match(/\/object\/public\/feelz-samples\/(.+)/);
  if (!storagePathMatch) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid file URL format' }) };
  }

  const storagePath = storagePathMatch[1];

  const { data: signedData, error: signedError } = await adminClient
    .storage
    .from('feelz-samples')
    .createSignedUrl(storagePath, 60);

  if (signedError || !signedData?.signedUrl) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not generate download URL' }) };
  }

  // Fetch the file and proxy it back so iOS gets a real download
  const fileRes = await fetch(signedData.signedUrl);
  if (!fileRes.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Failed to fetch file from storage' }) };
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const safeTitle = (track.title || 'track').replace(/[^a-z0-9\s]/gi, '-').trim() || 'track';
  const ext = storagePath.split('.').pop() || 'mp3';
  const filename = `${safeTitle}.${ext}`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': ext === 'wav' ? 'audio/wav' : 'audio/mpeg',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
    body: base64,
    isBase64Encoded: true,
  };
};
