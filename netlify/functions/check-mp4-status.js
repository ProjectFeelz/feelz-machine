/**
 * netlify/functions/check-mp4-status.js
 *
 * Lightweight, fast, regular (non-background) function. The client
 * polls this every few seconds after kicking off a background
 * conversion, since background functions can't return results directly.
 *
 * GET /.netlify/functions/check-mp4-status?jobId=<uuid>
 * Response: { ready: true, url: "<public url>" } once done,
 *           { ready: false, failed: true, reason } if conversion errored,
 *           { ready: false } while still in progress.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const jobId = event.queryStringParameters && event.queryStringParameters.jobId;
  if (!jobId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing jobId' }) };
  }

  try {
    const { data: files, error } = await supabase.storage
      .from('stories')
      .list('mp4-conversions', { search: jobId });

    if (error) throw error;

    const failed = files.find(f => f.name === `${jobId}.failed`);
    if (failed) {
      const { data: reasonData } = await supabase.storage.from('stories').download(`mp4-conversions/${jobId}.failed`);
      const reason = reasonData ? await reasonData.text() : 'Unknown error';
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ready: false, failed: true, reason }),
      };
    }

    const done = files.find(f => f.name === `${jobId}.mp4`);
    if (done) {
      const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl(`mp4-conversions/${jobId}.mp4`);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ready: true, url: publicUrl }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ready: false }),
    };
  } catch (err) {
    console.error('check-mp4-status error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};