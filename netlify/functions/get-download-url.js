const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
      if (event.httpMethod !== 'POST') {
              return { statusCode: 405, body: 'Method Not Allowed' };
      }

      // Verify auth token from request header
      const authHeader = event.headers['authorization'] || '';
      const token = authHeader.replace('Bearer ', '').trim();
      if (!token) {
              return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      let trackId;
      try {
              ({ trackId } = JSON.parse(event.body));
      } catch {
              return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
      }

      if (!trackId) {
              return { statusCode: 400, body: JSON.stringify({ error: 'trackId is required' }) };
      }

      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      // Admin client to bypass RLS for purchase check
      const adminClient = createClient(supabaseUrl, serviceKey);

      // Verify the JWT and get the user
      const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
      if (authError || !user) {
              return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) };
      }

      // Check purchase record in downloads table
      const { data: purchase, error: purchaseError } = await adminClient
        .from('downloads')
        .select('id')
        .eq('user_id', user.id)
        .eq('track_id', trackId)
        .maybeSingle();

      if (purchaseError) {
              console.error('Purchase check error:', purchaseError);
              return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
      }

      if (!purchase) {
              return { statusCode: 403, body: JSON.stringify({ error: 'Purchase required' }) };
      }

      // Get the track's file path and pre-order info from the tracks table
      const { data: track, error: trackError } = await adminClient
        .from('tracks')
        .select('file_url, title, is_preorder, release_date')
        .eq('id', trackId)
        .maybeSingle();

      if (trackError || !track) {
              return { statusCode: 404, body: JSON.stringify({ error: 'Track not found' }) };
      }

      // Pre-order check: if track is a pre-order and release date is in the future, block download
      if (track.is_preorder && track.release_date) {
              const now = new Date();
              const releaseDate = new Date(track.release_date);
              if (releaseDate > now) {
                        return {
                                    statusCode: 403,
                                    body: JSON.stringify({
                                                  error: 'not_released_yet',
                                                  release_date: track.release_date,
                                                  message: 'This track has not been released yet. You will be able to download it on the release date.',
                                    }),
                        };
              }
      }

      // Extract the storage path from the file_url
      // file_url format: https://<project>.supabase.co/storage/v1/object/public/feelz-samples/tracks/filename.mp3
      const storagePathMatch = track.file_url.match(/\/object\/public\/feelz-samples\/(.+)/);
      if (!storagePathMatch) {
              return { statusCode: 400, body: JSON.stringify({ error: 'Invalid file URL format' }) };
      }

      const storagePath = storagePathMatch[1];

      // Generate a signed URL valid for 60 seconds
      const { data: signedData, error: signedError } = await adminClient
        .storage
        .from('feelz-samples')
        .createSignedUrl(storagePath, 60);

      if (signedError || !signedData?.signedUrl) {
              console.error('Signed URL error:', signedError);
              return { statusCode: 500, body: JSON.stringify({ error: 'Could not generate download URL' }) };
      }

      return {
              statusCode: 200,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signedUrl: signedData.signedUrl, title: track.title }),
      };
};
