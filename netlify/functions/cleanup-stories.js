/**
 * netlify/functions/cleanup-stories.js
 * Runs daily at 02:00 UTC via netlify.toml scheduled function.
 * Deletes expired stories from artist_stories table and storage bucket.
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async () => {
  try {
    const now = new Date().toISOString();

    // Fetch expired stories to get their storage paths
    const { data: expired, error: fetchErr } = await supabase
      .from('artist_stories')
      .select('id, media_url')
      .lt('expires_at', now);

    if (fetchErr) throw fetchErr;
    if (!expired?.length) {
      console.log('No expired stories to clean up');
      return { statusCode: 200, body: JSON.stringify({ deleted: 0 }) };
    }

    console.log(`Cleaning up ${expired.length} expired stories`);

    // Extract storage paths from public URLs and delete from bucket
    const storagePaths = expired
      .map(s => {
        try {
          const url = new URL(s.media_url);
          // URL format: .../storage/v1/object/public/stories/artistId/filename
          const parts = url.pathname.split('/public/stories/');
          return parts[1] ? `stories/${parts[1]}` : null;
        } catch { return null; }
      })
      .filter(Boolean);

    if (storagePaths.length) {
      const { error: storageErr } = await supabase.storage
        .from('stories')
        .remove(storagePaths.map(p => p.replace('stories/', '')));
      if (storageErr) console.error('Storage cleanup error:', storageErr.message);
    }

    // Delete from DB
    const ids = expired.map(s => s.id);
    const { error: deleteErr } = await supabase
      .from('artist_stories')
      .delete()
      .in('id', ids);

    if (deleteErr) throw deleteErr;

    console.log(`Deleted ${ids.length} expired stories`);
    return { statusCode: 200, body: JSON.stringify({ deleted: ids.length }) };
  } catch (err) {
    console.error('Cleanup error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
