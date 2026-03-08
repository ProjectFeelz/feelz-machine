export async function downloadTrack(fileUrl, title) {
  const cleanName = (title || 'track').replace(/[^a-z0-9\s-]/gi, '').trim() || 'track';
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Fetch failed');
    const blob = await response.blob();
    const mp3Blob = new Blob([blob], { type: 'audio/mpeg' });
    const blobUrl = URL.createObjectURL(mp3Blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${cleanName}.mp3`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch {
    window.open(fileUrl, '_blank');
  }
}