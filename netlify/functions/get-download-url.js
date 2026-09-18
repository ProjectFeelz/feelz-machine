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
    // pay_what_you_want / minimum_price HAVE to be here too, for the same
    // reason is_downloadable did. This function priced every track at
    // download_price and knew nothing about PWYW, so a buyer who paid a
    // pay-what-you-want price BELOW the listed download_price — which is the
    // entire point of pay-what-you-want — was refused her own purchase with
    // "Insufficient payment", and one who paid on a PWYW track with
    // download_price = 0 was handed the file free through the quota path.
    // Same missing-column shape, both directions, on the money path.
    //
    // NOT pwyw_minimum_price. That column is in schema_dump.sql but not in the
    // database — see the note in paypal-order.js. Selecting it here would take
    // out every download on the platform, not just the PWYW ones.
    .select('file_url, title, slug, is_preorder, release_date, download_price, is_downloadable, artist_id, album_id, pay_what_you_want, minimum_price')
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

  // ── Pay what you want ──────────────────────────────────────────────────────
  //
  // A PWYW track has no single price, so `amount_paid >= effectivePrice` is the
  // wrong question to ask about it. The right one is: did this person pay, and
  // was what they paid at least the floor the artist set?
  //
  // minimum_price, the same column paypal-order.js and ArtistProfilePage now
  // read. Three files each having their own idea of the PWYW price is how this
  // broke in the first place; there is one idea of it now.
  const isPwyw = track.pay_what_you_want === true;
  const pwywFloor = isPwyw ? (Number(track.minimum_price) || 0) : 0;

  // A PWYW track with a floor is never "free", whatever download_price says.
  // A PWYW track with no floor genuinely is: the artist chose to allow $0.
  const trackIsFree = isPwyw ? pwywFloor <= 0 : effectivePrice <= 0;

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
    // limit(1) rather than maybeSingle: two existing rows made maybeSingle
    // return PGRST116 and no data, so this inserted a THIRD free grant and
    // charged it against the monthly quota again.
    const { data: existingDls } = await adminClient
      .from('downloads')
      .select('id')
      .eq('user_id', user.id)
      .eq('track_id', trackId)
      .limit(1);
    if (!existingDls?.length) {
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
    // ── A COMPLETED SALE IS NOT RE-PRICED LATER ──────────────────────────────
    //
    // This gate compared what somebody paid against what the track costs TODAY.
    // Today's price is not a fact about a past sale, and treating it as one
    // revokes downloads people have already bought:
    //
    //   * an artist raises a track from $2 to $5 and every earlier buyer is
    //     locked out of their own purchase, silently, months later;
    //   * a pay-what-you-want sale is below the listed price BY DESIGN, so the
    //     moment the PWYW toggle is turned off again, every PWYW buyer of that
    //     track is refused.
    //
    // The second one is not hypothetical. Davu paid $1.00 for Isandla Sami
    // while it was pay-what-you-want. The row now reads pay_what_you_want =
    // false, download_price = 2.00, minimum_price = null. Under the old rule she
    // is refused her own purchase forever and there is nothing she or the artist
    // can do about it short of paying a second time.
    //
    // The authority on "did this person buy this" is the purchases row that
    // PayPal's capture wrote. When one exists and is completed, the download is
    // theirs, at whatever the price is now.
    //
    // An album purchase counts too. paypal-order.js writes no downloads row for
    // an album (`if (!albumId && resolvedUserId)`), so somebody who bought a
    // whole album has never been able to download its tracks. Checking the
    // album id here closes that as well.
    let purchaseLookup = adminClient
      .from('purchases')
      .select('id, amount, track_id, album_id')
      .eq('user_id', user.id)
      .eq('status', 'completed');

    purchaseLookup = track.album_id
      ? purchaseLookup.or(`track_id.eq.${trackId},album_id.eq.${track.album_id}`)
      : purchaseLookup.eq('track_id', trackId);

    const { data: paidRows, error: payErr } = await purchaseLookup.limit(1);

    if (payErr) {
      // Not fatal, and deliberately not a 500: fall through to the grant check
      // below, which is the stricter path. A reader failing must never hand out
      // a file, but it must not lock out everyone either.
      console.error('[get-download-url] purchases lookup failed:', payErr.code, payErr.message);
    }
    const boughtIt = (paidRows?.length || 0) > 0;

    // The grant row. `maybeSingle` is deliberately not used: a buyer can
    // legitimately end up with more than one downloads row for a track (a free
    // grant followed by a purchase, or a re-purchase), and maybeSingle raises
    // PGRST116 on two rows — which the old code turned into a flat "Purchase
    // required" for somebody who had paid twice. Take the highest amount_paid.
    const { data: grants, error: grantErr } = await adminClient
      .from('downloads')
      .select('id, amount_paid')
      .eq('user_id', user.id)
      .eq('track_id', trackId)
      .order('amount_paid', { ascending: false })
      .limit(1);

    if (grantErr) {
      console.error('Purchase check error:', grantErr);
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }

    const purchase = grants?.[0] || null;

    if (boughtIt) {
      // Paid for, so it is theirs. Backfill the grant if it is missing — an
      // album buyer never had one, and a capture that failed to write one left
      // the buyer stranded. Non-fatal: the download proceeds either way.
      if (!purchase) {
        const { error: backfillErr } = await adminClient.from('downloads').insert({
          user_id:       user.id,
          track_id:      trackId,
          download_type: 'paid',
          amount_paid:   Number(paidRows[0].amount) || 0,
          created_at:    new Date().toISOString(),
        });
        if (backfillErr) {
          console.error('[get-download-url] grant backfill failed (download still allowed):',
            backfillErr.code, backfillErr.message);
        } else {
          console.log('[get-download-url] grant backfilled from purchase', paidRows[0].id,
            'for user', user.id, 'track', trackId);
        }
      }
    } else {
      // No purchase behind it. Now the grant has to stand on its own, and the
      // amount check applies — this is where a hand-written or legacy row would
      // otherwise hand out a paid track for nothing.
      if (!purchase) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Purchase required' }) };
      }

      // On a PWYW track the bar is the artist's floor, NOT download_price:
      // paying less than the listed price is the feature. The tolerance absorbs
      // PayPal's rounding, so $0.99 against a $1.00 floor is not read as
      // non-payment.
      const requiredPaid = isPwyw ? pwywFloor : effectivePrice;
      if (requiredPaid > 0 && Number(purchase.amount_paid || 0) + 0.005 < requiredPaid) {
        return {
          statusCode: 403,
          body: JSON.stringify({ error: 'Insufficient payment', minimum: requiredPaid }),
        };
      }
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