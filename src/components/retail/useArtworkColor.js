// src/components/retail/useArtworkColor.js
//
// The colour of a piece of artwork, for the glow behind the record.
//
// Not a plain average. An average of most covers is a muddy brown-grey, and a
// glow in that colour reads as dirt rather than light. Each pixel is weighted
// by how saturated and how bright it is, so the colour that comes out is the
// one your eye picks out of the cover: the moon-blue on a night scene, the
// pink on a stage shot. Near-black and near-white pixels count for almost
// nothing.
//
// Reading pixels needs the image served with CORS. Supabase public storage
// sends Access-Control-Allow-Origin: *, so it works for covers there. For
// anything that does not, the canvas is "tainted", getImageData throws, and
// this quietly returns the fallback rather than breaking the page.

import React from 'react';

const cache = new Map();   // url -> [r, g, b]

function extract(img) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);   // throws when tainted

  let r = 0, g = 0, b = 0, total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i], pg = data[i + 1], pb = data[i + 2];
    const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
    const sat = max === 0 ? 0 : (max - min) / max;
    const light = max / 255;
    // Saturated and reasonably bright wins. The small floor keeps a fully
    // grey cover from dividing by zero.
    const w = sat * sat * light + 0.002;
    r += pr * w; g += pg * w; b += pb * w; total += w;
  }
  r /= total; g /= total; b /= total;

  // Lift it so a dark cover still gives off light. Scale the brightest
  // channel up towards 230 without changing the hue.
  const peak = Math.max(r, g, b, 1);
  const lift = Math.max(1, 230 / peak);
  return [r, g, b].map(v => Math.round(Math.min(255, v * lift)));
}

export default function useArtworkColor(url, fallback = [139, 92, 246]) {
  const [rgb, setRgb] = React.useState(() => (url && cache.get(url)) || fallback);

  React.useEffect(() => {
    if (!url) { setRgb(fallback); return undefined; }
    if (cache.has(url)) { setRgb(cache.get(url)); return undefined; }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      try {
        const c = extract(img);
        cache.set(url, c);
        setRgb(c);
      } catch (e) {
        // Tainted canvas: the host does not send CORS headers. Keep the
        // fallback and remember that, so it is not retried every render.
        cache.set(url, fallback);
        setRgb(fallback);
      }
    };
    img.onerror = () => { if (!cancelled) setRgb(fallback); };
    img.src = url;
    return () => { cancelled = true; };
    // fallback is a constant array from the caller; comparing it by identity
    // would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return rgb;
}