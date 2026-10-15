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

// Sign one stored URL.
//
// The bucket is read out of the URL rather than hardcoded, because audio does
// not all live in one bucket, and a URL that is not a Supabase storage URL at
// all is handed back untouched rather than treated as broken.
async function signStoredUrl(admin, assetUrl, now) {
  const m = assetUrl.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return { url: assetUrl, signed: false };

  const [, bucket, storagePath] = m;
  const { data: signed, error } = await admin
    .storage
    .from(bucket)
    .createSignedUrl(decodeURIComponent(storagePath), SIGNED_URL_SECONDS);

  if (error || !signed?.signedUrl) {
    console.error('[stream-url] sign failed', bucket, error?.message);
    return { error: 'could_not_sign_url' };
  }
  return {
    url: signed.signedUrl,
    signed: true,
    expiresAt: new Date(now + SIGNED_URL_SECONDS * 1000).toISOString(),
  };
}

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
  let versionIds = [];
  let beatIds = [];
  let memoIds = [];
  let kind = 'audio';
  try {
    const body = JSON.parse(event.body || '{}');
    // Accepts one id or a batch, because the player warms the next track in
    // the queue and a per track round trip on every skip is worse than the
    // problem being solved.
    trackIds = body.trackIds || (body.trackId ? [body.trackId] : []);
    // 'video' signs the uploaded MP4 instead of the audio master, so the
    // track-videos bucket can go private the same way feelz-samples did.
    // Anything other than 'video' is audio, so an old client that sends no
    // kind at all keeps the behaviour it had.
    if (body.kind === 'video') kind = 'video';
    // Two assets that are not tracks but sit in the same bucket, so they go
    // dead at the same moment it is made private.
    //
    // versionIds  Alternate takes in track_versions. These used to be signed
    //             in the browser by TrackVersions.js, which only works for a
    //             signed in caller, because the storage policy allowing it is
    //             feelz_samples_authenticated_select. A free track's versions
    //             play for anyone today, logged in or not, so signing them
    //             here keeps that true rather than failing silently for every
    //             visitor who is not signed in.
    // beatIds     Sessions competition beats in
    //             school_sessions_shortlist_songs.beat_url, fetched straight
    //             off the public URL by BeatDownloadButton. Nothing signs
    //             those today, so they would simply stop downloading.
    if (Array.isArray(body.versionIds)) versionIds = body.versionIds.filter(Boolean);
    else if (body.versionId) versionIds = [body.versionId];
    if (Array.isArray(body.beatIds)) beatIds = body.beatIds.filter(Boolean);
    else if (body.beatId) beatIds = [body.beatId];
    // memoIds   Artist voice memos. The artist-voice-memos bucket was public
    //           and empty, which made it the one bucket that could be closed
    //           with nothing to migrate and nothing to break. A memo plays on
    //           a public artist profile, so a logged out visitor has to be
    //           able to hear it, which rules out signing in the browser and
    //           means it is signed here with the service role instead.
    if (Array.isArray(body.memoIds)) memoIds = body.memoIds.filter(Boolean);
    else if (body.memoId) memoIds = [body.memoId];
  } catch {
    return json(400, { error: 'invalid_body' });
  }

  if (!Array.isArray(trackIds)) trackIds = [];
  if (trackIds.length === 0 && versionIds.length === 0 && beatIds.length === 0 && memoIds.length === 0) {
    return json(400, { error: 'trackId, trackIds, versionIds, beatIds or memoIds is required' });
  }
  // A cap, so one request cannot ask the storage API to sign a catalogue.
  if (trackIds.length > 25) trackIds = trackIds.slice(0, 25);
  if (versionIds.length > 25) versionIds = versionIds.slice(0, 25);
  if (beatIds.length > 25) beatIds = beatIds.slice(0, 25);
  if (memoIds.length > 25) memoIds = memoIds.slice(0, 25);

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Anonymous is allowed. The token, when present, is only used to decide
  // whether an artist may hear their own unpublished or unreleased track.
  let userId = null;
  const token = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (token) {
    const { data: { user } } = await admin.auth.getUser(token);
    userId = user?.id || null;
  }

  let tracks = [];
  if (trackIds.length) {
    const { data, error: trackErr } = await admin
      .from('tracks')
      .select('id, file_url, youtube_url, is_published, is_preorder, release_date, artist_id')
      .in('id', trackIds);

    if (trackErr) {
      console.error('[stream-url] track lookup failed:', trackErr.message);
      return json(500, { error: 'lookup_failed' });
    }
    tracks = data || [];
    // Only a request that asked for tracks and got none is a 404. A request
    // for versions, beats or memos alongside them is not.
    if (!tracks.length && !versionIds.length && !beatIds.length && !memoIds.length) {
      return json(404, { error: 'track_not_found' });
    }
  }

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

    // Which asset this request is for. youtube_url is the column an uploaded
    // MP4 lands in, alongside genuine YouTube links; a real YouTube link is
    // not a storage URL and falls through to the unchanged branch below, which
    // hands the URL back as is.
    const assetUrl = kind === 'video' ? track.youtube_url : track.file_url;

    if (!assetUrl) {
      results[track.id] = { error: kind === 'video' ? 'no_video_file' : 'no_audio_file' };
      return;
    }

    // The bucket is read out of the stored URL rather than hardcoded, because
    // audio does not all live in one bucket — feelz-samples for tracks, and
    // the wheel audio moved — and a hardcoded name fails as a 400 that reads
    // like a broken file. Same parser as get-offline-url, deliberately.
    const m = assetUrl.match(/\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (!m) {
      // Not a Supabase storage URL at all. Some older rows point straight at
      // an external host, and a genuine YouTube link lands here too; those are
      // already public by their own nature and there is nothing here to sign,
      // so hand the URL back unchanged rather than breaking playback of a
      // track that works today.
      results[track.id] = { url: assetUrl, signed: false };
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

  // ── Versions ──────────────────────────────────────────────────────────────
  //
  // A version inherits its parent track's availability, so the same published
  // and pre-order rules are applied through the parent row. Whether a paid
  // track's versions may be heard at all is still decided client side before
  // the request is made, exactly as it is today; this does not loosen that,
  // and it does not tighten it either, because the stored URL is public right
  // now anyway.
  const versionResults = {};
  if (versionIds.length) {
    const { data: rows, error: vErr } = await admin
      .from('track_versions')
      .select('id, file_url, track_id')
      .in('id', versionIds);

    if (vErr) {
      console.error('[stream-url] version lookup failed:', vErr.message);
    } else {
      const parentIds = [...new Set((rows || []).map(r => r.track_id).filter(Boolean))];
      let parents = new Map();
      if (parentIds.length) {
        const { data: pt } = await admin
          .from('tracks')
          .select('id, is_published, is_preorder, release_date, artist_id')
          .in('id', parentIds);
        parents = new Map((pt || []).map(t => [t.id, t]));
      }

      await Promise.all((rows || []).map(async (v) => {
        const parent = parents.get(v.track_id);
        const privileged = isAdmin || (parent?.artist_id && ownArtistIds.has(parent.artist_id));

        if (parent && parent.is_published === false && !privileged) {
          versionResults[v.id] = { error: 'track_unavailable' };
          return;
        }
        const unreleased = parent?.is_preorder
          && parent.release_date
          && new Date(parent.release_date).getTime() > now;
        if (unreleased && !privileged) {
          versionResults[v.id] = { error: 'not_released_yet', release_date: parent.release_date };
          return;
        }
        if (!v.file_url) {
          versionResults[v.id] = { error: 'no_audio_file' };
          return;
        }
        versionResults[v.id] = await signStoredUrl(admin, v.file_url, now);
      }));
    }
    versionIds.forEach(id => {
      if (!versionResults[id]) versionResults[id] = { error: 'version_not_found' };
    });
  }

  // ── Sessions beats ────────────────────────────────────────────────────────
  //
  // A competition beat is meant to be taken by whoever wants to enter, so
  // there is nothing to gate here beyond the row existing.
  const beatResults = {};
  if (beatIds.length) {
    const { data: rows, error: bErr } = await admin
      .from('school_sessions_shortlist_songs')
      .select('id, beat_url')
      .in('id', beatIds);

    if (bErr) {
      console.error('[stream-url] beat lookup failed:', bErr.message);
    } else {
      await Promise.all((rows || []).map(async (s) => {
        if (!s.beat_url) {
          beatResults[s.id] = { error: 'no_beat_file' };
          return;
        }
        beatResults[s.id] = await signStoredUrl(admin, s.beat_url, now);
      }));
    }
    beatIds.forEach(id => {
      if (!beatResults[id]) beatResults[id] = { error: 'beat_not_found' };
    });
  }

  // ── Artist voice memos ────────────────────────────────────────────────────
  //
  // A memo is published by the artist onto their own public profile, so there
  // is nothing to gate beyond the row existing. Signing it is only about the
  // bucket no longer being world readable.
  const memoResults = {};
  if (memoIds.length) {
    const { data: rows, error: mErr } = await admin
      .from('artist_voice_memos')
      .select('id, audio_url')
      .in('id', memoIds);

    if (mErr) {
      console.error('[stream-url] memo lookup failed:', mErr.message);
    } else {
      await Promise.all((rows || []).map(async (m) => {
        if (!m.audio_url) {
          memoResults[m.id] = { error: 'no_audio_file' };
          return;
        }
        memoResults[m.id] = await signStoredUrl(admin, m.audio_url, now);
      }));
    }
    memoIds.forEach(id => {
      if (!memoResults[id]) memoResults[id] = { error: 'memo_not_found' };
    });
  }

  return json(200, { tracks: results, versions: versionResults, beats: beatResults, memos: memoResults });
};