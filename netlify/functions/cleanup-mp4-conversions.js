/**
 * netlify/functions/cleanup-mp4-conversions.js
 *
 * Scheduled to run automatically (see netlify.toml) — deletes temporary
 * MP4 conversion files older than 24 hours from the 'stories' bucket.
 * These files only need to exist long enough for the client to poll for
 * and download them right after conversion (a few minutes at most), so
 * 24 hours is a generous window that won't ever catch a real in-progress
 * conversion while still preventing indefinite storage buildup.
 *
 * Runs as a regular function — listing and deleting a batch of files is
 * fast, no need for background-function time allowances here.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

exports.handler = async () => {
  try {
    const { data: files, error } = await supabase.storage
      .from('stories')
      .list('mp4-conversions', { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });

    if (error) throw error;
    if (!files || files.length === 0) {
      console.log('cleanup-mp4-conversions: nothing to clean up');
      return { statusCode: 200, body: 'Nothing to clean up' };
    }

    const now = Date.now();
    const stale = files.filter(f => {
      const created = new Date(f.created_at || f.updated_at).getTime();
      return now - created > MAX_AGE_MS;
    });

    if (stale.length === 0) {
      console.log(`cleanup-mp4-conversions: ${files.length} file(s) present, none older than 24h`);
      return { statusCode: 200, body: 'No stale files' };
    }

    const paths = stale.map(f => `mp4-conversions/${f.name}`);
    const { error: delErr } = await supabase.storage.from('stories').remove(paths);
    if (delErr) throw delErr;

    console.log(`cleanup-mp4-conversions: deleted ${paths.length} stale file(s)`);
    return { statusCode: 200, body: `Deleted ${paths.length} stale file(s)` };
  } catch (err) {
    console.error('cleanup-mp4-conversions error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};