// netlify/functions/stream-url.js
//
// STREAMING — the short-lived URL that replaces the permanent public one.
//
//
// WHAT THIS IS FOR, STATED PRECISELY
//
// The feelz-samples bucket is public, and a public Supabase bucket serves every
// object over plain HTTP to anyone: no account, no token, no RLS. Playback
// needs that today because TrackUploadPanel stores getPublicUrl() into
// tracks.file_url and PlayerContext assigns that straight to audio.src. So the
// full quality MP3 of every paid track is already in the JSON that ordinary
// track queries return. Right click, copy, done — and get-download-url, the
// pay-what-you-want floor, the Fan Pro quota and the album rule are all
// guarding a signed URL to a file that is already public at a URL the page
// hands out.
//
// This function issues a short lived signed URL instead, so the bucket can be
// made private. Be clear about what that does and does not change:
//
//   IT DOES     stop tracks.file_url being a permanent, shareable, saveable
//               link to the master audio, which is the actual hole.
//   IT DOES NOT create a paywall on streaming. There is not one today beyond
//               the five play prompt in usePaidPlayLimit, and inventing one
//               here would silently change the product. Anyone who can play a
//               track in the app today can still play it after this.
//
// So: signed in or not, if the track is published and released, this signs it.
// Unpublished and unreleased tracks are refused for everyone except the artist
// who owns them and admins — which is stricter than the public bucket was,
// because the public bucket had no opinion at all.
//
//
// SEQUENCING. READ THIS BEFORE FLIPPING THE BUCKET.
//
//   1. Deploy this function and the client change. With
//      REACT_APP_PRIVATE_AUDIO unset, nothing changes: the player keeps using
//      file_url.
//   2. Set REACT_APP_PRIVATE_AUDIO=1 and deploy. The player now streams from
//      signed URLs. The bucket is STILL PUBLIC at this point, so if anything
//      about this is wrong, playback falls back to file_url and still works.
//      Test: play, skip, crossfade, the retail player, offline save, the
//      ForYou feed.
//   3. Only when that is proven, set the bucket to private in Supabase.
//      tracks.file_url can stay exactly as it is — the storage path is parsed
//      back out of it, the same way get-offline-url already does.
//
// Doing step 3 first takes the site down for everyone instantly, because every
// file_url in the database stops resolving the moment the bucket changes.

const { createClient } = require('@supabase/supabase-js');

// Long enough to play a long track and a few after it without re-signing,
// short enough that a leaked URL is worth little. A signed URL is still a
// bearer token for one file: treat the number as a tradeoff, not a formality.
const SIGNED_URL_SECONDS = 2 * 60 * 60;

const json = (statusCode, body, cacheSeconds) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    // Never let a CDN or a browser cache hold a signed URL past its life.
    'Cache-Control': cacheSeconds
      ? `private, max-age=${cacheSeconds}`
      : 'no-store',
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let trackIds;
  try {
    const body = JSON.parse(event.body || '{}');
    // Accepts one id or a batch, because the player warms the next track in
    // the queue and a per track round trip on every skip is worse than the
    // problem being solved.
    trackIds = body.trackIds || (body.trackId ? [body.trackId] : []);
  } catch {
    return json(400, { error: 'invalid_body' });
  }

  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    return json(400, { error: 'trackId or trackIds is required' });
  }
  // A cap, so one request cannot ask the storage API to sign a catalogue.
  if (trackIds.length > 25) trackIds = trackIds.slice(0, 25);

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Anonymous is allowed. The token, when present, is only used to decide
  // whether an artist may hear their own unpublished or unreleased track.
  let userId = null;
  const token = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (token) {
    const { data: { user } } = await admin.auth.getUser(token);
    userId = user?.id || null;
  }

  const { data: tracks, error: trackErr } = await admin
    .from('tracks')
    .select('id, file_url, is_published, is_preorder, release_date, artist_id')
    .in('id', trackIds);

  if (trackErr) {
    console.error('[stream-url] track lookup failed:', trackErr.message);
    return json(500, { error: 'lookup_failed' });
  }
  if (!tracks?.length) return json(404, { error: 'track_not_found' });

  // Which of these tracks, if any, belong to the caller. One query rather than
  // one per track. Admins get the same latitude as an owner.
  let ownArtistIds = new Set();
  let isAdmin = false;
  if (userId) {
    const [{ data: ownArtists }, { data: adminRow }] = await Promise.all([
      admin.from('artists').select('id').eq('user_id', userId),
      admin.from('admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ]);
    ownArtistIds = new Set((ownArtists || []).map(a => a.id));
    isAdmin = !!adminRow;
  }

  const now = Date.now();
  const results = {};

  await Promise.all(tracks.map(async (track) => {
    const privileged = isAdmin || (track.artist_id && ownArtistIds.has(track.artist_id));

    if (track.is_published === false && !privileged) {
      results[track.id] = { error: 'track_unavailable' };
      return;
    }

    const unreleased = track.is_preorder
      && track.release_date
      && new Date(track.release_date).getTime() > now;

    // Pre-orders: listed everywhere, playable by nobody but the artist until
    // release. Enforcement for listeners lives in PlayerContext's gate, which
    // covers all 39 play paths; this is the server side of the same rule, so a
    // hand-made request cannot walk around it.
    if (unreleased && !privileged) {
      results[track.id] = { error: 'not_released_yet', release_date: track.release_date };
      return;
    }

    if (!track.file_url) {
      results[track.id] = { error: 'no_audio_file' };
      return;
    }

    // The bucket is read out of the stored URL rather than hardcoded, because
    // audio does not all live in one bucket — feelz-samples for tracks, and
    // the wheel audio moved — and a hardcoded name fails as a 400 that reads
    // like a broken file. Same parser as get-offline-url, deliberately.
    const m = track.file_url.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (!m) {
      // Not a Supabase storage URL at all. Some older rows point straight at
      // an external host; those are already public by their own nature and
      // there is nothing here to sign, so hand the URL back unchanged rather
      // than breaking playback of a track that works today.
      results[track.id] = { url: track.file_url, signed: false };
      return;
    }

    const [, bucket, storagePath] = m;

    const { data: signed, error: signErr } = await admin
      .storage
      .from(bucket)
      .createSignedUrl(decodeURIComponent(storagePath), SIGNED_URL_SECONDS);

    if (signErr || !signed?.signedUrl) {
      console.error('[stream-url] sign failed', bucket, signErr?.message);
      results[track.id] = { error: 'could_not_sign_url' };
      return;
    }

    results[track.id] = {
      url: signed.signedUrl,
      signed: true,
      expiresAt: new Date(now + SIGNED_URL_SECONDS * 1000).toISOString(),
    };
  }));

  // Anything asked for that does not exist gets an explicit answer, so the
  // client can stop asking rather than retrying a missing row forever.
  trackIds.forEach(id => {
    if (!results[id]) results[id] = { error: 'track_not_found' };
  });

  return json(200, { tracks: results });
};