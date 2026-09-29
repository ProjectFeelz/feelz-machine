// src/utils/stories.js
//
// One definition of "a story you should be able to see right now".
//
// There are four places that read stories and there is about to be a fifth,
// and until now each one wrote the window out by hand as
// `.gt('expires_at', new Date().toISOString())`. That was correct while a
// story's whole life was the 24 hours after it was written. It stopped being
// correct the moment a story could be scheduled: a story planned for December
// has an expires_at in December, so every one of those four queries would
// happily show the entire future schedule today.
//
// Fixing that in four places and remembering the fifth is how the lyrics
// parser ended up with three copies and two of them wrong. So it lives here.
//
// The database enforces this too, in a restrictive policy added by migration
// 191, and that is the real boundary: without it the schedule is readable
// straight off the API however carefully the client filters. This is the
// client half, and it exists for one reason the policy cannot cover. The
// policy deliberately exempts newsletter editors and admins, otherwise they
// could not see, edit or delete anything they had planned. Without the filter
// below, Davu and Steve would be the only two people on the platform who see
// December's stories in September, in the middle of the ordinary feed, and
// they are exactly the two who most need the feed to look like everyone
// else's.

/**
 * Narrow a PostgREST query on artist_stories to what is live at this moment.
 *
 * publish_at is null on every ordinary story, which means "published when it
 * was written", so a null must pass. PostgREST has no coalesce in a filter,
 * hence the `or`.
 *
 *   visibleNow(supabase.from('artist_stories').select('...'))
 *     .eq('artist_id', id)
 *     .order('created_at', { ascending: false })
 */
export function visibleNow(query, now = new Date()) {
  const iso = now.toISOString();
  return query
    .gt('expires_at', iso)
    .or(`publish_at.is.null,publish_at.lte.${iso}`);
}

/**
 * The same rule applied to a row already in hand, for anything filtering in
 * memory rather than in a query.
 */
export function isVisibleNow(story, now = Date.now()) {
  if (!story) return false;
  const expires = Date.parse(story.expires_at || '');
  if (!Number.isNaN(expires) && expires <= now) return false;
  if (!story.publish_at) return true;
  const publish = Date.parse(story.publish_at);
  return Number.isNaN(publish) || publish <= now;
}

/**
 * The platform's own storyteller, looked up rather than hardcoded.
 *
 * Returns null if migration 191 has not run, and every caller treats that as
 * "no platform stories", which is the correct reading of it.
 */
export async function platformStoryArtistId(supabase) {
  const { data, error } = await supabase.rpc('platform_story_artist_id');
  if (error) {
    console.warn('[stories] platform artist lookup failed:', error.code, error.message);
    return null;
  }
  return data || null;
}