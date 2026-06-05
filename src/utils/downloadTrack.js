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
    if (err.error === 'not_released_yet')        throw new Error('not_released_yet');
    if (err.error === 'artists_cannot_download') throw new Error('artists_cannot_download');
    if (err.error === 'fan_pro_required')        throw new Error('fan_pro_required');
    if (err.error === 'monthly_quota_exceeded')  throw new Error('monthly_quota_exceeded');
    throw new Error('purchase_required');
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get download URL');
  }

  const { signedUrl } = await response.json();

  // Step 2: download the file.
  // iOS Safari can't blob-fetch cross-origin audio — use direct link with download attr.
  // The signed URL already has Content-Disposition: attachment set by Supabase.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  if (isIOS) {
    // iOS Safari cannot save blobs — open in new tab, user taps Share > Save to Files
    // Show a brief toast if possible
    if (window.showToast) window.showToast('Tap Share → Save to Files to save your download');
    const a = document.createElement('a');
    a.href = signedUrl + '&download=' + encodeURIComponent(cleanName + '.mp3');
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  // Desktop + Android: use arrayBuffer → Blob so a.download is always
  // respected and the filename is never pulled from the storage URL string.
  try {
    const fileResponse = await fetch(signedUrl);
    if (!fileResponse.ok) throw new Error('File fetch failed');
    const blob = new Blob([await fileResponse.arrayBuffer()], { type: 'audio/mpeg' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = cleanName + '.mp3';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  } catch {
    // Last resort fallback
    window.open(signedUrl, '_blank');
  }
}