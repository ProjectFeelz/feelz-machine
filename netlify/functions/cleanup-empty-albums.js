/**
 * cleanup-empty-albums.js
 * Scheduled: daily at 02:30 UTC
 * Deletes albums that have no tracks and were created more than 24 hours ago.
 * Protects against orphaned albums from failed uploads or abandoned sessions.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async () => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find albums with no tracks that are older than 24h
    const { data: emptyAlbums, error: fetchErr } = await supabase
      .from('albums')
      .select('id, title, artist_id, created_at')
      .lt('created_at', cutoff);

    if (fetchErr) throw fetchErr;
    if (!emptyAlbums?.length) {
      console.log('cleanup-empty-albums: nothing to clean');
      return { statusCode: 200, body: JSON.stringify({ deleted: 0 }) };
    }

    // Check each for track count
    const toDelete = [];
    for (const album of emptyAlbums) {
      const { count } = await supabase
        .from('tracks')
        .select('id', { count: 'exact', head: true })
        .eq('album_id', album.id);
      if ((count || 0) === 0) toDelete.push(album.id);
    }

    if (!toDelete.length) {
      console.log('cleanup-empty-albums: all albums have tracks');
      return { statusCode: 200, body: JSON.stringify({ deleted: 0 }) };
    }

    const { error: delErr } = await supabase
      .from('albums')
      .delete()
      .in('id', toDelete);

    if (delErr) throw delErr;

    console.log(`cleanup-empty-albums: deleted ${toDelete.length} empty albums`);
    return { statusCode: 200, body: JSON.stringify({ deleted: toDelete.length }) };

  } catch (err) {
    console.error('cleanup-empty-albums error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
