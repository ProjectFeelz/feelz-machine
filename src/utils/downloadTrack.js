// Downloads a track by proxying file bytes through the Netlify function.
// The backend verifies auth + purchase, fetches from Supabase storage,
// and returns the file directly with Content-Disposition headers.
// This approach works on iOS Safari which ignores a.download on cross-origin URLs.
export async function downloadTrack(trackId, title, authToken) {
  if (!authToken) throw new Error('Not authenticated');
  if (!trackId) throw new Error('No track ID provided');

  const cleanName = (title || 'track').replace(/[^a-z0-9\s-]/gi, '').trim() || 'track';

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
    throw new Error(err.error || 'Failed to download track');
  }

  // Response is now the file itself, not JSON
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = cleanName + '.mp3';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}
