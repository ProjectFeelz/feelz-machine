// netlify/functions/get-offline-url.js
//
// OFFLINE LISTENING — the entitlement check
//
// This is deliberately NOT get-download-url. They look similar and do
// different jobs, and merging them would break both.
//
// get-download-url gives somebody a file to keep: it writes a `downloads` row,
// increments tracks.download_count, spends one of a Fan Pro listener's three
// monthly free downloads, and notifies the artist that their track was
// downloaded. Every one of those is correct for a download and wrong for
// "keep this on my phone so it plays on the train" — offline saving would
// inflate download counts, burn the monthly quota after three songs, and fire
// a notification per saved track.
//
// So this function checks the rules, signs a URL, and records a lease. It
// writes no download, counts nothing, and notifies nobody.
//
//
// THE RULES, AND WHY EACH ONE IS HERE
//
//   published        — you cannot stockpile a track the artist has hidden.
//   released         — a pre-order is not listenable yet, offline or not.
//   paid tracks      — must actually be bought first. Streaming a paid track
//                      allows five plays before the purchase prompt
//                      (usePaidPlayLimit); an offline copy is unlimited plays
//                      with no network to check anything, so an unpurchased
//                      paid track saved offline is the paywall removed.
//   Fan Pro          — the offline library is the Fan Pro benefit. Artists get
//                      it too, the same way they bypass the download quota.
//   own tracks       — allowed, unlike downloads. Blocking self-downloads
//                      exists to stop artists inflating their own counts, and
//                      this endpoint increments no counts, so there is nothing
//                      to inflate and every reason to let an artist carry
//                      their own catalogue offline.
//   a cap            — 500 tracks. Not about storage, which is the device's
//                      problem, but about one account mirroring the catalogue.
//
//
// THE LEASE
//
// Offline entitlement cannot be checked at play time; there is no network,
// that is the point of the feature. So the answer is checked once here and
// written to the device as an expiry date, 30 days out. Reconnecting renews
// it silently (renew: true below, which re-runs every rule above and signs
// nothing). A lapsed Fan Pro subscription therefore stops working within a
// month rather than instantly, which is the standard behaviour and the only
// version that does not punish somebody for being on a plane.

const { createClient } = require('@supabase/supabase-js');

const LEASE_DAYS         = 30;
const MAX_OFFLINE_TRACKS = 500;
const SIGNED_URL_SECONDS = 900;  // 15 min: an offline save is a whole file on
                                 // a phone connection, not a click-download

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const token = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return json(401, { error: 'Not authenticated' });

  let trackId, renew;
  try {
    ({ trackId, renew } = JSON.parse(event.body || '{}'));
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  if (!trackId) return json(400, { error: 'trackId is required' });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json(401, { error: 'Not authenticated' });

  // ── The track ───────────────────────────────────────────────────────────────
  const { data: track, error: trackError } = await admin
    .from('tracks')
    .select('id, title, file_url, is_published, is_preorder, release_date, download_price, is_downloadable, artist_id, album_id')
    .eq('id', trackId)
    .maybeSingle();

  if (trackError) return json(500, { error: 'lookup_failed' });
  if (!track)     return json(404, { error: 'track_not_found' });

  // 410 rather than 404: the app treats Gone as "you had this, you no longer
  // may" and removes the local copy, which is exactly right for a track the
  // artist has since pulled.
  if (track.is_published === false) return json(410, { error: 'track_unavailable' });

  if (track.is_preorder && track.release_date && new Date(track.release_date) > new Date()) {
    return json(403, {
      error: 'not_released_yet',
      release_date: track.release_date,
      message: 'This track has not been released yet.',
    });
  }

  if (!track.file_url) return json(404, { error: 'no_audio_file' });

  // ── Is it a paid track, and did they buy it? ─────────────────────────────────
  // Same album-derived pricing as get-download-url: a track with no price of
  // its own inside a paid album costs album.price / tracks.
  let effectivePrice = Number(track.download_price) || 0;
  if (effectivePrice <= 0 && track.album_id) {
    const [{ data: album }, { count: albumTrackCount }] = await Promise.all([
      admin.from('albums').select('price').eq('id', track.album_id).maybeSingle(),
      admin.from('tracks').select('*', { count: 'exact', head: true })
        .eq('album_id', track.album_id).eq('is_published', true),
    ]);
    if (album?.price > 0 && albumTrackCount > 0) {
      effectivePrice = parseFloat((album.price / albumTrackCount).toFixed(2));
    }
  }

  const isOwnTrack = await (async () => {
    if (!track.artist_id) return false;
    const { data } = await admin.from('artists')
      .select('user_id').eq('id', track.artist_id).maybeSingle();
    return data?.user_id === user.id;
  })();

  if (effectivePrice > 0 && !isOwnTrack) {
    // Same rule as get-download-url.js. A completed purchase of the track or
    // its album is the authority, at whatever the price is now. The grant
    // row is read with limit(1), not maybeSingle: someone with two rows for
    // one track (a free grant then a purchase) made maybeSingle fail, which
    // came back as "Buy this track" for a buyer, the 403 in the console.
    let lookup = admin.from('purchases').select('id')
      .eq('user_id', user.id).eq('status', 'completed');
    lookup = track.album_id
      ? lookup.or(`track_id.eq.${trackId},album_id.eq.${track.album_id}`)
      : lookup.eq('track_id', trackId);
    const { data: paidRows } = await lookup.limit(1);

    const { data: grants } = await admin
      .from('downloads')
      .select('id, amount_paid')
      .eq('user_id', user.id)
      .eq('track_id', trackId)
      .order('amount_paid', { ascending: false })
      .limit(1);
    const purchase = grants?.[0] || null;
    const bought = (paidRows?.length || 0) > 0 || Number(purchase?.amount_paid) > 0;

    if (!bought) {
      return json(403, {
        error: 'purchase_required',
        minimum: effectivePrice,
        message: 'Buy this track to keep it offline.',
      });
    }
  }

  // ── Paying accounts only ────────────────────────────────────────────────────
  //
  // Offline listening is a paid feature. Any PAID tier unlocks it — Fan Pro,
  // Artist Pro, Artist Premium — because they are all paying accounts and
  // charging an artist who already pays $5 a month a second subscription to
  // save a song reads as nickel-and-diming. A free artist account does NOT
  // unlock it; having uploaded a track is not a payment.
  //
  // Every source is checked, in the order they are authoritative:
  //
  //   listeners.tier              — what the PayPal webhook writes and what an
  //                                 admin grant sets. useTier reads this first,
  //                                 so this endpoint must too. get-download-url
  //                                 does NOT, which is why a listener whose Pro
  //                                 came from here is told to upgrade when they
  //                                 try to download. Same bug, different file.
  //   listener_tier_subscriptions — the older listener path.
  //   artist_tier_subscriptions   — Artist Pro / Premium.
  //
  // "Paid" is decided by the tier's slug not being 'free' rather than by
  // matching a list of slug names, because platform_tiers is shared between
  // artist and listener tiers and the naming is inconsistent across them
  // ('pro' and 'fan_pro' are both in use for the same tier id). Asking what
  // it is NOT is the version that does not break when a tier is renamed.
  if (!isOwnTrack) {
    const paidReason = await (async () => {
      // 1. listeners.tier
      const { data: listenerRow } = await admin
        .from('listeners')
        .select('tier, tier_expires_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (listenerRow?.tier && listenerRow.tier !== 'free') {
        const live = !listenerRow.tier_expires_at
          || new Date(listenerRow.tier_expires_at) > new Date();
        if (live) return `listeners.tier=${listenerRow.tier}`;
      }

      // Which tier ids are not the free one. One query, reused below.
      const { data: tiers } = await admin
        .from('platform_tiers')
        .select('id, slug');
      const paidTierIds = new Set(
        (tiers || []).filter(t => t.slug && t.slug !== 'free').map(t => t.id)
      );

      // 2. listener_tier_subscriptions
      const { data: listenerSubs } = await admin
        .from('listener_tier_subscriptions')
        .select('tier_id, expires_at')
        .eq('user_id', user.id)
        .eq('status', 'active');

      for (const sub of listenerSubs || []) {
        if (!paidTierIds.has(sub.tier_id)) continue;
        if (sub.expires_at && new Date(sub.expires_at) <= new Date()) continue;
        return 'listener_tier_subscription';
      }

      // 3. artist_tier_subscriptions — Artist Pro / Premium
      const { data: artistRows } = await admin
        .from('artists')
        .select('id')
        .eq('user_id', user.id);

      const artistIds = (artistRows || []).map(a => a.id);
      if (artistIds.length > 0) {
        const { data: artistSubs } = await admin
          .from('artist_tier_subscriptions')
          .select('tier_id, expires_at')
          .in('artist_id', artistIds)
          .eq('status', 'active');

        for (const sub of artistSubs || []) {
          if (!paidTierIds.has(sub.tier_id)) continue;
          if (sub.expires_at && new Date(sub.expires_at) <= new Date()) continue;
          return 'artist_tier_subscription';
        }
      }

      return null;
    })();

    if (!paidReason) {
      // A track already saved is NOT deleted when a subscription lapses — the
      // renew path returns this same 403 and the client leaves the existing
      // lease to run out. Somebody whose card is declined mid-holiday keeps
      // their music until the lease expires, with a visible countdown.
      return json(403, {
        error: 'paid_tier_required',
        message: 'Offline listening is included with Fan Pro, Artist Pro and Artist Premium.',
      });
    }
  }

  const expiresAt = new Date(Date.now() + LEASE_DAYS * 86400000).toISOString();

  // ── Record the lease ────────────────────────────────────────────────────────
  // Best effort on purpose. The device's own copy of expiresAt is what governs
  // playback; this table is so the platform can see what is held offline and
  // so a future revoke has something to act on. A failed write here must not
  // stop somebody saving a song.
  let held = 0;
  try {
    const { count } = await admin
      .from('offline_leases')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString())
      .neq('track_id', trackId);
    held = count || 0;

    if (held >= MAX_OFFLINE_TRACKS) {
      return json(403, {
        error: 'offline_limit_reached',
        limit: MAX_OFFLINE_TRACKS,
        message: `You can keep ${MAX_OFFLINE_TRACKS} tracks offline. Remove some to add more.`,
      });
    }

    await admin.from('offline_leases').upsert({
      user_id:    user.id,
      track_id:   trackId,
      granted_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'user_id,track_id' });
  } catch { /* see above */ }

  // ── Renewal stops here ──────────────────────────────────────────────────────
  // Every rule above has now run. No URL is signed and nothing is downloaded:
  // the device already has the audio and only needs a fresh expiry.
  if (renew) {
    return json(200, { expiresAt, renewed: true });
  }

  // ── Sign the URL ────────────────────────────────────────────────────────────
  // The bucket is read out of the stored URL rather than hardcoded, because
  // audio does not all live in one bucket (feelz-samples for tracks, and the
  // wheel audio moved) and a hardcoded name fails as a 400 that reads like a
  // broken file.
  const m = track.file_url.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return json(400, { error: 'unrecognised_file_url' });

  const [, bucket, storagePath] = m;

  const { data: signed, error: signError } = await admin
    .storage
    .from(bucket)
    .createSignedUrl(decodeURIComponent(storagePath), SIGNED_URL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.error('[get-offline-url] sign failed', bucket, signError);
    return json(500, { error: 'could_not_sign_url' });
  }

  return json(200, {
    signedUrl: signed.signedUrl,
    expiresAt,
    mimeType: 'audio/mpeg',
    title: track.title,
    held: held + 1,
    limit: MAX_OFFLINE_TRACKS,
  });
};