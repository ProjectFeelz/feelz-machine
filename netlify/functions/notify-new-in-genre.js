/**
 * netlify/functions/notify-new-in-genre.js
 *
 * Tells a listener about one new release in a genre they actually play, by
 * an artist they do not follow.
 *
 *
 * THE GAP THIS FILLS
 *
 * A new track raises a 'new_track' notification to that artist's followers
 * and to nobody else. An artist with no followers ships a release that
 * reaches zero people. That is every artist's first upload, and it is the
 * moment somebody decides the platform does nothing for them.
 *
 * The podcast made it visible: three episodes, one follower, and the first
 * two raised nothing at all because the follower did not exist yet. But the
 * podcast is not the problem, it is just the case that got noticed.
 *
 * The platform already knows who likes what. compute-behavior-profiles writes
 * top_genres per listener from what they actually played. This reads that and
 * closes the loop.
 *
 *
 * THE RULES THAT KEEP IT FROM BECOMING SPAM
 *
 *   One notice per listener per week. Not per run: per week, measured from
 *   the last notice in genre_release_notices, so running this by hand after a
 *   failure cannot double up.
 *
 *   Never the same track to the same person twice, enforced by a unique index
 *   rather than by this file remembering.
 *
 *   Only a listener who has actually played something in the last 30 days.
 *   Somebody who has never pressed play does not need a release notice, they
 *   need a reason to come back, which is a different message.
 *
 *   Never an artist they already follow. They have the 'new_track' card for
 *   that, and two notices for one release is worse than none.
 *
 *
 * WHICH TRACK IT PICKS, AND WHY THE LEAST HEARD
 *
 * Of everything eligible it picks the one with the fewest streams. That is
 * the whole point: a well-heard track in your genre will reach you through
 * For You, Browse and trending anyway. The one that will not reach you by any
 * other route is the one nobody has played yet, which is almost always a new
 * artist. Sorting the other way would make this a second trending feed.
 */

const { createClient } = require('@supabase/supabase-js');
const { recordRun } = require('../lib/jobRun');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// The name in netlify.toml and in job_expectations, so the schedule, the run
// record and the watchdog all refer to the same thing.
const JOB = 'notify-new-in-genre';

const RELEASE_WINDOW_DAYS = 7;   // what counts as new
const COOLDOWN_DAYS       = 7;   // one notice per listener per week
const DORMANT_AFTER_DAYS  = 30;  // past this, a release notice is the wrong message
const SITE = process.env.URL || 'https://www.feelzmachine.com';

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

exports.handler = async (event) => {
  const started = Date.now();

  // Scheduled in netlify.toml, which means Netlify refuses HTTP on it before
  // a line of this runs. The header check is for a manual run through
  // admin-run-job, which has already checked the caller against the admins
  // table by the time it gets here.
  if (event?.headers?.['x-manual-run']
      && event.headers['x-internal-secret'] !== process.env.INTERNAL_FUNCTION_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    // ── What is new ─────────────────────────────────────────────────────────
    const { data: fresh, error: freshErr } = await supabase
      .from('tracks')
      .select('id, title, slug, genre, mood, artist_id, stream_count, created_at, artists!tracks_artist_id_fkey(artist_name, slug)')
      .eq('is_published', true)
      .gte('created_at', iso(RELEASE_WINDOW_DAYS))
      .not('genre', 'is', null)
      .order('stream_count', { ascending: true })
      .limit(500);

    if (freshErr) {
      console.error('[notify-new-in-genre] could not read new tracks:', freshErr.code, freshErr.message);
      await recordRun(JOB, { ok: false, error: `${freshErr.code} ${freshErr.message}`, startedAt: started });
      return { statusCode: 500, body: JSON.stringify({ error: freshErr.message }) };
    }

    if (!fresh || !fresh.length) {
      // A quiet week is not a failure. Said out loud so a silent run is
      // distinguishable from a run that did not happen.
      console.log('[notify-new-in-genre] nothing published in the last', RELEASE_WINDOW_DAYS, 'days');
      await recordRun(JOB, { ok: true, items: 0, detail: { reason: 'no_new_releases' }, startedAt: started });
      return { statusCode: 200, body: JSON.stringify({ ok: true, sent: 0 }) };
    }

    // ── Who might want to hear about it ─────────────────────────────────────
    const { data: profiles, error: profErr } = await supabase
      .from('listener_behavior_profiles')
      .select('user_id, top_genres, days_since_last, total_streams_30d')
      .not('top_genres', 'is', null)
      .lte('days_since_last', DORMANT_AFTER_DAYS)
      .gt('total_streams_30d', 0)
      .limit(2000);

    if (profErr) {
      console.error('[notify-new-in-genre] could not read profiles:', profErr.code, profErr.message);
      await recordRun(JOB, { ok: false, error: `${profErr.code} ${profErr.message}`, startedAt: started });
      return { statusCode: 500, body: JSON.stringify({ error: profErr.message }) };
    }

    const candidates = (profiles || []).filter(p => Array.isArray(p.top_genres) && p.top_genres.length);
    if (!candidates.length) {
      console.log('[notify-new-in-genre] no listener has a genre to match on yet');
      await recordRun(JOB, { ok: true, items: 0, detail: { reason: 'no_profiles' }, startedAt: started });
      return { statusCode: 200, body: JSON.stringify({ ok: true, sent: 0 }) };
    }

    const userIds = candidates.map(p => p.user_id);

    // ── Who is already inside their cooldown ────────────────────────────────
    const { data: recentNotices } = await supabase
      .from('genre_release_notices')
      .select('user_id, track_id, sent_at')
      .in('user_id', userIds)
      .gte('sent_at', iso(COOLDOWN_DAYS * 4));   // enough history to also cover "never twice"

    const inCooldown = new Set();
    const alreadySent = new Map();              // user_id -> Set(track_id)
    const cooldownEdge = iso(COOLDOWN_DAYS);
    for (const n of recentNotices || []) {
      if (n.sent_at >= cooldownEdge) inCooldown.add(n.user_id);
      if (!alreadySent.has(n.user_id)) alreadySent.set(n.user_id, new Set());
      alreadySent.get(n.user_id).add(n.track_id);
    }

    const due = candidates.filter(p => !inCooldown.has(p.user_id));
    if (!due.length) {
      console.log('[notify-new-in-genre] everybody eligible is inside their week');
      await recordRun(JOB, { ok: true, items: 0, detail: { reason: 'all_in_cooldown' }, startedAt: started });
      return { statusCode: 200, body: JSON.stringify({ ok: true, sent: 0 }) };
    }

    const dueIds = due.map(p => p.user_id);

    // ── What they already follow, and what they have already played ─────────
    //
    // follows is read by artist id rather than from the profile's
    // followed_artists, which holds names. Names are not keys.
    const [{ data: follows }, { data: heard }] = await Promise.all([
      supabase.from('follows').select('user_id, artist_id').in('user_id', dueIds),
      supabase.from('streams')
        .select('user_id, track_id')
        .in('user_id', dueIds)
        .in('track_id', fresh.map(t => t.id)),
    ]);

    const followsBy = new Map();
    for (const f of follows || []) {
      if (!followsBy.has(f.user_id)) followsBy.set(f.user_id, new Set());
      followsBy.get(f.user_id).add(f.artist_id);
    }
    const heardBy = new Map();
    for (const s of heard || []) {
      if (!heardBy.has(s.user_id)) heardBy.set(s.user_id, new Set());
      heardBy.get(s.user_id).add(s.track_id);
    }

    // ── One pick each ───────────────────────────────────────────────────────
    const notices = [];
    const notifications = [];

    for (const p of due) {
      const genres   = p.top_genres.map(g => String(g).toLowerCase());
      const followed = followsBy.get(p.user_id) || new Set();
      const played   = heardBy.get(p.user_id)   || new Set();
      const told     = alreadySent.get(p.user_id) || new Set();

      // fresh is already ordered fewest streams first, so the first match is
      // the least heard one in their genre.
      const pick = fresh.find(t =>
        genres.includes(String(t.genre || '').toLowerCase())
        && !followed.has(t.artist_id)
        && !played.has(t.id)
        && !told.has(t.id)
      );
      if (!pick) continue;

      const artistName = pick.artists?.artist_name || 'An artist';

      notices.push({ user_id: p.user_id, track_id: pick.id, genre: pick.genre });
      notifications.push({
        user_id: p.user_id,
        type:    'new_in_genre',
        title:   `New ${pick.genre} you have not heard`,
        message: `${artistName} just released "${pick.title}". You play a lot of ${pick.genre}, and nobody has heard this one yet.`,
        track_id: pick.id,
        metadata: {
          kind: 'new_in_genre',
          genre: pick.genre,
          artist_id: pick.artist_id,
          track_slug: pick.slug || null,
          url: `${SITE}/track/${pick.slug || pick.id}`,
        },
      });
    }

    if (!notices.length) {
      console.log('[notify-new-in-genre] nothing matched anybody this week');
      await recordRun(JOB, { ok: true, items: 0, detail: { reason: 'no_matches', due: due.length }, startedAt: started });
      return { statusCode: 200, body: JSON.stringify({ ok: true, sent: 0 }) };
    }

    // The notice row goes in FIRST, and the notification only for the rows
    // that survived the unique index. The other order sends a card and then
    // discovers it cannot record having sent it, which is how somebody gets
    // the same release every week.
    const { data: written, error: noticeErr } = await supabase
      .from('genre_release_notices')
      .upsert(notices, { onConflict: 'user_id,track_id', ignoreDuplicates: true })
      .select('user_id, track_id');

    if (noticeErr) {
      console.error('[notify-new-in-genre] notice rows refused, sending nothing:', noticeErr.code, noticeErr.message);
      await recordRun(JOB, { ok: false, error: `${noticeErr.code} ${noticeErr.message}`, startedAt: started });
      return { statusCode: 500, body: JSON.stringify({ error: noticeErr.message }) };
    }

    const confirmed = new Set((written || []).map(r => `${r.user_id}:${r.track_id}`));
    const toSend = notifications.filter(n => confirmed.has(`${n.user_id}:${n.track_id}`));

    if (!toSend.length) {
      console.log('[notify-new-in-genre] every pick was already recorded, nothing sent');
      await recordRun(JOB, { ok: true, items: 0, detail: { reason: 'all_duplicates' }, startedAt: started });
      return { statusCode: 200, body: JSON.stringify({ ok: true, sent: 0 }) };
    }

    const { error: notifyErr } = await supabase.from('notifications').insert(toSend);
    if (notifyErr) {
      // The notice rows are already written, so these listeners will not be
      // offered the same track again. Said loudly rather than retried: a
      // second attempt would need to unpick the rows above, and a missed
      // notice is cheaper than a double one.
      console.error('[notify-new-in-genre] notifications refused:', notifyErr.code, notifyErr.message);
      await recordRun(JOB, { ok: false, error: `${notifyErr.code} ${notifyErr.message}`, startedAt: started });
      return { statusCode: 500, body: JSON.stringify({ error: notifyErr.message }) };
    }

    const artists = new Set(toSend.map(n => n.metadata.artist_id));
    console.log('[notify-new-in-genre] sent', toSend.length, 'notices covering', artists.size, 'artists');

    await recordRun(JOB, {
      ok: true,
      items: toSend.length,
      detail: { listeners: toSend.length, artists: artists.size, eligible: due.length },
      startedAt: started,
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, sent: toSend.length, artists: artists.size }) };
  } catch (err) {
    console.error('[notify-new-in-genre] threw:', err.message);
    await recordRun(JOB, { ok: false, error: err.message, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
