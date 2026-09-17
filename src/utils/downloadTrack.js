/**
 * downloadErrorMessage
 *
 * Turns the codes thrown below into something a person can act on.
 *
 * The backend already does this job well: get-download-url returns a specific
 * 403 with a code AND a human message for each rule it enforces. The codes
 * then reached five call sites that did `catch (err) { console.error(err) }`
 * and showed the user nothing at all — the download button simply stopped
 * spinning. A deliberate, correctly-implemented business rule was
 * indistinguishable from a broken button.
 *
 * That is the sixth instance of the swallowed-error pattern in this codebase
 * (retail recommendations, album upload, For You, useTier counts, the Browse
 * embed, and now this). The map lives here so the five callers cannot each
 * invent their own wording, or forget a case the backend adds later.
 */
export function downloadErrorMessage(err) {
  switch (err?.message) {
    case 'artists_cannot_download':
      // The most confusing one: it fires on your OWN track, which is exactly
      // when you are most likely to be testing and least likely to guess why.
      return "You can't download your own track — it would inflate your download count.";
    case 'not_released_yet':
      return "This track hasn't been released yet. You'll be able to download it on the release date.";
    // Kept, but the server no longer sends it: free listeners now get three
    // a month rather than none at all. A stale bundle in someone's cache can
    // still receive it, so the wording stays accurate for that case.
    case 'fan_pro_required':
      return 'Fan Pro members download without limits. Upgrade to grab this one.';
    case 'monthly_quota_exceeded':
      return "That's your 3 free downloads for this month. They reset on the 1st — or go Fan Pro and download as much as you like, whenever you like.";
    case 'quota_check_failed':
      return "Couldn't check your download allowance just now. Try again in a moment.";
    case 'purchase_required':
      return 'This track needs to be bought before you can download it.';
    case 'insufficient_payment':
      // Distinct from purchase_required on purpose. "You need to buy this"
      // is wrong and infuriating when you HAVE paid — it just went through
      // for less than the artist's minimum.
      return 'The amount paid was below this track\u2019s minimum price. Pay the difference to download it.';
    case 'Not authenticated':
      return 'Sign in to download.';
    default:
      return 'Download failed. Please try again.';
  }
}

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
    if (err.error === 'Insufficient payment')    throw new Error('insufficient_payment');
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