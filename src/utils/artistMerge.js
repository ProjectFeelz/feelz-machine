/**
 * src/utils/artistMerge.js
 *
 * Merging a duplicate artist into another, and deleting an artist outright.
 *
 *
 * WHY THIS IS ONE FILE NOW
 *
 * The same two operations existed in src/pages/AdminPeople.js and
 * src/pages/AdminDuplicates.js, written twice and drifting: one version
 * checked two of its four writes, the other checked none. That is how the
 * merge ended up able to delete an artist whose tracks had failed to move,
 * in one of the two places you can do it and not the other.
 *
 * Both pages call these now, so a fix lands in both.
 *
 *
 * THE RULE THESE ENFORCE
 *
 * Nothing is deleted until everything that had to move has moved. A merge
 * that cannot move the tracks stops before the delete and says so, because
 * the alternative is a duplicate removed and a catalogue orphaned, reported
 * as success.
 */

/**
 * Move a duplicate's tracks and followers onto the artist being kept, carry
 * over their stream credit, then delete the duplicate.
 *
 * Throws on anything that would make the delete unsafe. The message is
 * written to be shown to an admin as it is.
 */
export async function mergeArtists(supabase, keepId, deleteId) {
  if (!keepId || !deleteId) throw new Error('two artists are needed for a merge');
  if (keepId === deleteId)  throw new Error('an artist cannot be merged into themselves');

  const { error: trackErr } = await supabase
    .from('tracks').update({ artist_id: keepId }).eq('artist_id', deleteId);
  if (trackErr) throw new Error(`the tracks could not be moved, so nothing was deleted: ${trackErr.message}`);

  const { error: followErr } = await supabase
    .from('follows').update({ artist_id: keepId }).eq('artist_id', deleteId);
  if (followErr) throw new Error(`the followers could not be moved, so nothing was deleted: ${followErr.message}`);

  // Stream credit, carried before the row goes for good. Not fatal: the merge
  // is still correct without it, and refusing to finish over a counter would
  // leave the duplicate in place with its catalogue already moved away.
  const { data: dup } = await supabase
    .from('artists').select('total_streams').eq('id', deleteId).maybeSingle();
  if (dup?.total_streams) {
    const { data: keep } = await supabase
      .from('artists').select('total_streams').eq('id', keepId).maybeSingle();
    const { error: creditErr } = await supabase.from('artists')
      .update({ total_streams: (keep?.total_streams || 0) + dup.total_streams })
      .eq('id', keepId);
    if (creditErr) console.error('[artistMerge] stream credit not carried over:', creditErr.message);
  }

  const { error: delErr } = await supabase.from('artists').delete().eq('id', deleteId);
  if (delErr) throw new Error(`the tracks were moved but the duplicate was NOT deleted: ${delErr.message}`);

  return { ok: true };
}

/**
 * Delete an artist and everything hanging off them.
 *
 * Reported step by step, because a half-finished delete leaves rows pointing
 * at an artist who is gone, and knowing which half ran is the difference
 * between retrying and going looking in the database.
 */
export async function deleteArtistCompletely(supabase, artistId) {
  if (!artistId) throw new Error('no artist given');

  for (const [table, label] of [
    ['tracks', 'tracks'],
    ['follows', 'followers'],
    ['notifications', 'notifications'],
  ]) {
    const { error } = await supabase.from(table).delete().eq('artist_id', artistId);
    if (error) throw new Error(`their ${label} could not be deleted, so the artist was left in place: ${error.message}`);
  }

  const { error: artistErr } = await supabase.from('artists').delete().eq('id', artistId);
  if (artistErr) throw new Error(`their content was deleted but the artist row was not: ${artistErr.message}`);

  return { ok: true };
}
