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

  let trackId, isFree;
  try {
    ({ trackId, isFree } = JSON.parse(event.body));
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
    .select('file_url, title, is_preorder, release_date, download_price, artist_id')
    .eq('id', trackId)
    .maybeSingle();

  if (trackError || !track) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) };
  }

  // Block self-downloads from inflating counts
  if (track.artist_id) {
    const { data: trackArtist } = await adminClient
      .from('artists')
      .select('user_id')
      .eq('id', track.artist_id)
      .maybeSingle();
    if (trackArtist?.user_id === user.id) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Artists cannot download their own tracks' }) };
    }
  }

  if (track.is_preorder && track.release_date) {
    const now = new Date();
    const releaseDate = new Date(track.release_date);
    if (releaseDate > now) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'not_released_yet',
          release_date: track.release_date,
          message: 'This track has not been released yet. You will be able to download it on the release date.',
        }),
      };
    }
  }

  const trackIsFree = !track.download_price || track.download_price <= 0;

  // ── Listener download quota check ───────────────────────────────────────────
  // Free listeners cannot download. Pro listeners get 3 free downloads/month.
  // Paid downloads (download_price > 0) bypass the quota — they already paid.
  if (trackIsFree && track.is_downloadable) {
    // Check if user is an artist (artists bypass listener quota)
    const { data: artistCheck } = await adminClient
      .from('artists').select('id').eq('user_id', user.id).maybeSingle();

    if (!artistCheck) {
      // This is a listener — check their tier
      const { data: listenerSub } = await adminClient
        .from('listener_tier_subscriptions')
        .select('tier_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      const PRO_TIER_ID = 'a421dac1-f492-461c-88a5-f01b6942a042';
      const isPro = listenerSub?.tier_id === PRO_TIER_ID;

      if (!isPro) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: 'fan_pro_required',
            message: 'Upgrade to Fan Pro to download tracks',
          }),
        };
      }

      // Pro listener — check monthly quota (3/month)
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const { count: monthlyCount } = await adminClient
        .from('downloads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('amount_paid', 0)
        .gte('created_at', monthStart.toISOString());

      if ((monthlyCount || 0) >= 3) {
        return {
          statusCode: 403,
          body: JSON.stringify({
            error: 'monthly_quota_exceeded',
            message: 'You have used your 3 free downloads this month. They reset on the 1st.',
            quota: 3,
            used: monthlyCount,
          }),
        };
      }
    }
  }

  if (trackIsFree) {
    await adminClient
      .from('downloads')
      .upsert(
        { user_id: user.id, track_id: trackId, amount_paid: 0 },
        { onConflict: 'user_id,track_id', ignoreDuplicates: true }
      );
  } else {
    const { data: purchase, error: purchaseError } = await adminClient
      .from('downloads')
      .select('id')
      .eq('user_id', user.id)
      .eq('track_id', trackId)
      .maybeSingle();

    if (purchaseError) {
      console.error('Purchase check error:', purchaseError);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }

    if (!purchase) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Purchase required' }) };
    }
  }

  const storagePathMatch = track.file_url.match(/\/object\/public\/feelz-samples\/(.+)/);
  if (!storagePathMatch) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid file URL format' }) };
  }

  const storagePath = storagePathMatch[1];

  const safeTitle = (track.title || 'track').replace(/[^a-z0-9\s-]/gi, '').trim() || 'track';

  const { data: signedData, error: signedError } = await adminClient
    .storage
    .from('feelz-samples')
    .createSignedUrl(storagePath, 60, {
      download: safeTitle + '.mp3',
    });

  if (signedError || !signedData?.signedUrl) {
    console.error('Signed URL error:', signedError);
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not generate download URL' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedUrl: signedData.signedUrl, title: track.title }),
  };
};