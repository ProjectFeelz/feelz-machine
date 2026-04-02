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
    throw new Error(err.error || 'Failed to get download URL');
  }

  const { signedUrl } = await response.json();

  // On desktop: use anchor download
  // On iOS: open in new tab — user taps Share > Save to Files
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIOS) {
    window.open(signedUrl, '_blank');
  } else {
    const a = document.createElement('a');
    a.href = signedUrl;
    a.download = cleanName + '.mp3';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
