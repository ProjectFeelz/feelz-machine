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
    .select('id, title, file_url, is_published, is_preorder, release_date, download_price, is_downloadable, artist_id, album_id, preorder_early_access')
    .eq('id', trackId)
    .maybeSingle();

  if (trackError) return json(500, { error: 'lookup_failed' });
  if (!track)     return json(404, { error: 'track_not_found' });

  // The availability gates USED TO BE HERE, above everything else, and that
  // was the bug. See the block further down, after entitlement is known.

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

  // Hoisted out of the block below so the tier gate can see it. Somebody who
  // has PAID for a track has already bought the right to keep it, and being
  // asked for a monthly subscription on top of a purchase is the one refusal
  // in here a buyer would rightly call a con. A free track is different and
  // still needs a tier: nothing was paid for, so there is nothing to honour.
  let boughtThisTrack = false;

  // DETECTION ONLY. The refusal is further down, because the availability
  // gates have to know whether this person bought the track before they can
  // decide whether it is gone for them.
  //
  // Same rule as get-download-url.js. A completed purchase of the track or
  // its album is the authority, at whatever the price is now. The grant
  // row is read with limit(1), not maybeSingle: someone with two rows for
  // one track (a free grant then a purchase) made maybeSingle fail, which
  // came back as "Buy this track" for a buyer, the 403 in the console.
  if (effectivePrice > 0 && !isOwnTrack) {
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
    boughtThisTrack = (paidRows?.length || 0) > 0 || Number(purchase?.amount_paid) > 0;
  }

  // ── Availability, now that we know what this person is owed ─────────────────
  //
  // THE BUG THIS FIXES
  //
  // The unpublished check used to run before any of the above, and the client
  // DELETES the local copy on a 410 (see renewLeases in offlineStore.js). So
  // an artist unpublishing a track silently wiped it off the device of every
  // person who had paid for it, at the next renewal, with no warning and no
  // way to get it back. A purchase is permanent; an artist taking a track off
  // the shelf is not a refund.
  //
  // A buyer and the artist themselves now pass this gate. Everybody else gets
  // the same 410 as before, and their copy is removed, which is still right:
  // they were holding it on a subscription, not on a receipt.
  const keepsItRegardless = isOwnTrack || boughtThisTrack;

  if (track.is_published === false && !keepsItRegardless) {
    return json(410, { error: 'track_unavailable' });
  }

  // Pre-order. A buyer waits unless the artist has said otherwise on this
  // release, because the file is DRM-free and an early copy cannot be
  // recalled. preorder_early_access is that decision, and it is off unless
  // somebody deliberately turned it on. The artist always passes: it is their
  // own record.
  //
  // The album flag counts as well as the track's own, so an artist pre-selling
  // a record sets it once instead of on every track and cannot half-set it by
  // forgetting one. Read here rather than via the SQL helper to keep this to a
  // single round trip on a gate that runs on every save.
  if (track.is_preorder && track.release_date
      && new Date(track.release_date) > new Date() && !isOwnTrack) {
    let earlyAccess = track.preorder_early_access === true;
    if (!earlyAccess && track.album_id) {
      const { data: alb } = await admin.from('albums')
        .select('preorder_early_access').eq('id', track.album_id).maybeSingle();
      earlyAccess = alb?.preorder_early_access === true;
    }

    // Only a BUYER gets in early. Early access is what the pre-order buys, so
    // a subscriber who has not bought it still waits for release day.
    if (!(earlyAccess && boughtThisTrack)) {
      return json(403, {
        error: 'not_released_yet',
        release_date: track.release_date,
        // The client decides the wording: somebody who has paid should be told
        // they own it and when it unlocks, not handed a stranger's refusal.
        owned: boughtThisTrack === true,
        message: 'This track has not been released yet.',
      });
    }
  }

  // No exemption possible. There is no file to hand over.
  if (!track.file_url) return json(404, { error: 'no_audio_file' });

  // The refusal that was lifted out of the detection block above.
  if (effectivePrice > 0 && !isOwnTrack && !boughtThisTrack) {
    return json(403, {
      error: 'purchase_required',
      minimum: effectivePrice,
      message: 'Buy this track to keep it offline.',
    });
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
  // A bought track skips this gate entirely. See the note on boughtThisTrack
  // above: the purchase IS the entitlement, and it only applies to the track
  // that was paid for, never to the rest of the catalogue.
  if (!isOwnTrack && !boughtThisTrack) {
    const paidReason = await (async () => {
      // 0. Platform admins.
      //
      // Deliberately first and deliberately not a tier. Somebody who runs the
      // platform cannot test what a paying listener gets if the feature is
      // shut to them, and the alternative, giving yourself a fake paid
      // subscription row, puts made-up revenue in the same tables the payout
      // and reporting queries read. A grant that lives in code and leaves no
      // financial trace is the honest version.
      const { data: adminRow } = await admin
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (adminRow) return 'platform_admin';

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