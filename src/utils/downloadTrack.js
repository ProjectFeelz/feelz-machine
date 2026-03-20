—// Downloads a track via the secure get-download-url netlify function.
// Requires the user's auth token and track ID — the backend verifies
// a purchase record exists before issuing a short-lived signed URL.
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
        throw new Error('purchase_required');
  }
    if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to get download URL');
    }

  const { signedUrl } = await response.json();
    const ext = signedUrl.split('?')[0].split('.').pop() || 'mp3';

  // Fetch the actual file using the signed URL and trigger download
  try {
        const fileResponse = await fetch(signedUrl);
        if (!fileResponse.ok) throw new Error('File fetch failed');
        const blob = await fileResponse.blob();
        const typedBlob = new Blob([blob], { type: ext === 'wav' ? 'audio/wav' : 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(typedBlob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = cleanName + '.' + ext;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  } catch {
        // Fallback: open signed URL in new tab
      window.open(signedUrl, '_blank');
  }
}
