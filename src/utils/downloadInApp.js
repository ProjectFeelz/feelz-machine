// src/utils/downloadInApp.js
//
// Downloads a file without leaving Feelz Machine.
//
// A plain <a href download> on a cross-origin URL is ignored by browsers: the
// file opens in a new tab instead, which is exactly the "links away from the
// app" behaviour we do not want. So the file is fetched, turned into a blob on
// this origin, and saved from there. The tab never changes.
//
// Returns true when the file was saved. On failure the caller decides what to
// say; nothing is opened behind the person's back.

export async function downloadInApp(url, filename, onProgress) {
  if (!url) return false;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const total = Number(res.headers.get('content-length')) || 0;
    let blob;

    // Progress only where the server says how big the file is. Without a
    // length there is nothing honest to report, so the whole body is read in
    // one go instead of pretending.
    if (total > 0 && res.body && typeof ReadableStream !== 'undefined') {
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress?.(Math.min(1, received / total));
      }
      blob = new Blob(chunks, { type: res.headers.get('content-type') || 'application/octet-stream' });
    } else {
      blob = await res.blob();
    }

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || 'download';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next tick: revoking immediately cancels the save in
    // Safari, which reads the blob after the click returns.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    return true;
  } catch (err) {
    console.error('[download] failed:', err.message);
    return false;
  }
}

export default downloadInApp;