export async function downloadTrack(fileUrl, title) {
  const cleanName = (title || 'track').replace(/[^a-z0-9\s-]/gi, '').trim() || 'track';
  const ext = fileUrl.split('.').pop()?.split('?')[0] || 'mp3';
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Fetch failed');
    const blob = await response.blob();
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
  } catch (err) {
    try {
      const response = await fetch(fileUrl, { mode: 'cors', cache: 'no-store' });
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = cleanName + '.' + ext;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch {
      window.open(fileUrl, '_blank');
    }
  }
}
