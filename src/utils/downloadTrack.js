// Downloads a track via the secure get-download-url netlify function.
// Backend verifies auth + purchase and returns a signed URL with proper
// Content-Disposition headers. We then fetch the file client-side as a
// blob and trigger a named download — works on desktop and Android.
// iOS Safari will open the file in browser (tap Share > Save to Files).
export async function downloadTrack(trackId, title, authToken) {
  if (!authToken) throw new Error('Not authenticated');
  if (!trackId) throw new Error('No track ID provided');

  const cleanName = (title || 'track').replace(/[^a-z0-9\s-]/gi, '').trim() || 'track';

  // Step 1: get signed URL from backend (verifies purchase server-side)
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

  // Step 2: fetch the file as a blob from the signed URL.
  // This bypasses the cross-origin a.download restriction on desktop browsers.
  try {
    const fileResponse = await fetch(signedUrl);
    if (!fileResponse.ok) throw new Error('File fetch failed');
    const blob = await fileResponse.blob();
    const ext = signedUrl.split('?')[0].split('.').pop() || 'mp3';
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = cleanName + '.' + ext;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch {
    // Fallback for iOS Safari — open signed URL directly.
    // User taps Share > Save to Files.
    window.open(signedUrl, '_blank');
  }
}
