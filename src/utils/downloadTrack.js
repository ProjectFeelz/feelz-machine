// Downloads a track via the secure get-download-url netlify function.
// Requires the user's auth token and track ID — the backend verifies
// a purchase record exists before issuing a short-lived signed URL.
// For free tracks, the backend handles recording the download automatically.

export async function downloadTrack(trackId, title, authToken) {
  if (!authToken) throw new Error('Not authenticated');
  if (!trackId) throw new Error('No track ID provided');

  const cleanName = (title || 'track').replace(/[^a-z0-9\s-]/gi, '').trim() || 'track';

  // Request a signed URL from the backend (verifies purchase server-side)
  const response = await fetch('/.netlify/functions/get-download-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ trackId }),
  });

  if (response.status === 403) {
    const err = await response.json().catch(() => ({}));
    if (err.error === 'not_released_yet') throw new Error('not_released_yet');
    throw new Error('purchase_required');
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get download URL');
  }

  const { signedUrl } = await response.json();
  const ext = signedUrl.split('?')[0].split('.').pop() || 'mp3';

  // On iOS Safari, fetch+blob is blocked by CORS. Use direct anchor with signed URL instead.
  const a = document.createElement('a');
  a.href = signedUrl;
  a.download = cleanName + '.' + ext;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
