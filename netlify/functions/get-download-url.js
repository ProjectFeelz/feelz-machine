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
    // is_downloadable HAS to be here. The quota gate below reads it, and
    // without it in the select it was always undefined — so `trackIsFree &&
    // track.is_downloadable` was always false, the whole Fan Pro check and the
    // 3-per-month quota were skipped, and every signed-in listener could
    // download every free track without limit. One missing column, and the
    // paywall had never fired.
    .select('file_url, title, is_preorder, release_date, download_price, is_downloadable, artist_id, album_id')
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
      return { statusCode: 403, body: JSON.stringify({ error: 'artists_cannot_download' }) };
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

  // If track has no individual price but belongs to a paid album,
  // per-track price = album.price / number of tracks in album
  let effectivePrice = track.download_price || 0;
  if (effectivePrice <= 0 && track.album_id) {
    const [{ data: album }, { count: albumTrackCount }] = await Promise.all([
      adminClient.from('albums').select('price').eq('id', track.album_id).maybeSingle(),
      adminClient.from('tracks').select('*', { count: 'exact', head: true }).eq('album_id', track.album_id).eq('is_published', true),
    ]);
    if (album?.price > 0 && albumTrackCount > 0) {
      effectivePrice = parseFloat((album.price / albumTrackCount).toFixed(2));
    }
  }

  const trackIsFree = effectivePrice <= 0;

  // ── Listener download quota check ───────────────────────────────────────────
  // Free listeners cannot download. Pro listeners get 3 free downloads/month.
  // Paid downloads (download_price > 0) bypass the quota — they already paid.
  // `!== false` rather than a truthy check, deliberately. is_downloadable is
  // nullable and older rows have it null; a truthy check would let every one of
  // those straight past the quota, which is the same hole in a smaller shape.
  // An artist who has explicitly turned downloads off is handled separately
  // below — this gate is about who may spend a free download, not whether the
  // track offers one.
  if (trackIsFree && track.is_downloadable !== false) {
    // Check if user is an artist (artists bypass listener quota)
    const { data: artistCheck } = await adminClient
      .from('artists').select('id').eq('user_id', user.id).maybeSingle();

    if (!artistCheck) {
      // This is a listener — check their tier.
      //
      // BOTH sources, in the order they are authoritative. This function used
      // to read only listener_tier_subscriptions, which is the older path.
      // listeners.tier is what the PayPal webhook writes on activation and
      // what an admin grant sets, and it is what useTier checks first on the
      // client — so a listener whose Pro came from there was shown Fan Pro
      // everywhere in the app and then told to upgrade the moment they tried
      // to download. get-offline-url.js checks both; now so does this.
      let isPro = false;

      const { data: listenerRow } = await adminClient
        .from('listeners')
        .select('tier, tier_expires_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (listenerRow?.tier && listenerRow.tier !== 'free') {
        const live = !listenerRow.tier_expires_at
          || new Date(listenerRow.tier_expires_at) > new Date();
        if (live) isPro = true;
      }

      if (!isPro) {
        const { data: listenerSub } = await adminClient
          .from('listener_tier_subscriptions')
          .select('tier_id, expires_at')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        // Look up Pro tier by slug instead of a hardcoded UUID
        const { data: proTier } = await adminClient
          .from('platform_tiers').select('id').eq('slug', 'fan_pro').maybeSingle();
        const PRO_TIER_ID = proTier?.id || 'a421dac1-f492-461c-88a5-f01b6942a042';

        if (listenerSub?.tier_id === PRO_TIER_ID) {
          const live = !listenerSub.expires_at
            || new Date(listenerSub.expires_at) > new Date();
          if (live) isPro = true;
        }
      }

      // These two rules were the wrong way round.
      //
      // As written, a listener who was NOT Fan Pro got a flat 403 and could
      // never download anything, and a listener who WAS Fan Pro got a cap of
      // three a month. So the paid tier was the restricted one and the free
      // tier was locked out entirely — the opposite of what Fan Pro is sold
      // as, and the reason Davu (genuinely Fan Pro, correctly recognised)
      // was refused after her third download.
      //
      // The intended rule:
      //
      //   Fan Pro      unlimited free downloads
      //   everyone else  three a month, then they are invited to upgrade
      //
      // A Fan Pro listener now returns before the quota is ever counted.
      if (isPro) {
        // Unlimited. Nothing else to check.
      } else {
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const { count: monthlyCount, error: quotaErr } = await adminClient
          .from('downloads')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('amount_paid', 0)
          .gte('created_at', monthStart.toISOString());

        // Read, not discarded. A failed count used to come back undefined,
        // which `(monthlyCount || 0) >= FREE_MONTHLY_QUOTA` reads as 0 — so a
        // broken count silently handed out unlimited downloads to everyone.
        if (quotaErr) {
          console.error('[get-download-url] quota count failed:', quotaErr.message);
          return {
            statusCode: 503,
            body: JSON.stringify({
              error: 'quota_check_failed',
              message: 'Could not check your download allowance just now. Try again in a moment.',
            }),
          };
        }

        const FREE_MONTHLY_QUOTA = 3;
        if ((monthlyCount || 0) >= FREE_MONTHLY_QUOTA) {
          return {
            statusCode: 403,
            body: JSON.stringify({
              error: 'monthly_quota_exceeded',
              message: `You have used your ${FREE_MONTHLY_QUOTA} free downloads this month. They reset on the 1st — or go Fan Pro for unlimited downloads.`,
              quota: FREE_MONTHLY_QUOTA,
              used: monthlyCount,
              upgrade: true,
            }),
          };
        }
      }
    }
  }

  if (trackIsFree) {
    const { data: existingDl } = await adminClient
      .from('downloads')
      .select('id')
      .eq('user_id', user.id)
      .eq('track_id', trackId)
      .maybeSingle();
    if (!existingDl) {
      await adminClient.from('downloads').insert({ user_id: user.id, track_id: trackId, amount_paid: 0, download_type: 'free' });
      // Increment download_count on track
      try {
        await adminClient.rpc('increment_download_count', { track_id: trackId });
      } catch {
        const { data } = await adminClient.from('tracks').select('download_count').eq('id', trackId).maybeSingle();
        await adminClient.from('tracks').update({ download_count: (data?.download_count || 0) + 1 }).eq('id', trackId);
      }
    }
  } else {
    // Server-side PWYW minimum check
    if (effectivePrice > 0) {
      const { data: purchase, error: purchaseError } = await adminClient
        .from('downloads')
        .select('id, amount_paid')
        .eq('user_id', user.id)
        .eq('track_id', trackId)
        .maybeSingle();
      if (purchaseError || !purchase) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Purchase required' }) };
      }
      if (purchase.amount_paid < effectivePrice) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Insufficient payment', minimum: effectivePrice }) };
      }
    }

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
    // Increment download_count for paid track
    try {
      await adminClient.rpc('increment_download_count', { track_id: trackId });
    } catch {
      const { data } = await adminClient.from('tracks').select('download_count').eq('id', trackId).maybeSingle();
      await adminClient.from('tracks').update({ download_count: (data?.download_count || 0) + 1 }).eq('id', trackId);
    }
  }

  // Notify artist of download — non-fatal
  try {
    const { data: artistUser } = await adminClient
      .from('artists').select('user_id, artist_name').eq('id', track.artist_id).maybeSingle();
    const { data: downloaderArtist } = await adminClient
      .from('artists').select('id, artist_name, profile_image_url').eq('user_id', user.id).maybeSingle();
    const downloaderName = downloaderArtist?.artist_name || 'Someone';
    if (artistUser?.user_id && artistUser.user_id !== user.id) {
      await adminClient.from('notifications').insert({
        artist_id:      track.artist_id,
        user_id:        artistUser.user_id,
        type:           'download',
        title:          `${downloaderName} downloaded ${track.title}`,
        message:        trackIsFree ? 'Free download' : `Paid download · $${effectivePrice.toFixed(2)}`,
        from_artist_id: downloaderArtist?.id || null,
        metadata: {
          track_id:          trackId,
          track_title:       track.title,
          from_artist_name:  downloaderName,
          from_artist_image: downloaderArtist?.profile_image_url || null,
          amount_paid:       trackIsFree ? 0 : effectivePrice,
        },
      });
    }
  } catch { /* non-fatal */ }

  const storagePathMatch = track.file_url.match(/\/object\/public\/feelz-samples\/(.+)/);
  if (!storagePathMatch) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid file URL format' }) };
  }

  const storagePath = storagePathMatch[1];
  const safeTitle = (track.title || 'track').replace(/[^a-z0-9\s-]/gi, '').trim() || 'track';

  const { data: signedData, error: signedError } = await adminClient
    .storage
    .from('feelz-samples')
    .createSignedUrl(storagePath, 300, {
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
