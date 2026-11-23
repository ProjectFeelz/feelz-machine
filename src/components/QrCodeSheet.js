// src/components/QrCodeSheet.js
//
// A QR code for any Feelz Machine link: an artist, a track, an album.
// Show it on your screen and anyone can point their phone camera at it and
// land on the page. Drawn in the browser (src/utils/qrcode.js), so it costs
// nothing and works offline once the page is open.
//
// Props:
//   url       the link the code opens (required)
//   title     big line under the code: the track, album or artist name
//   subtitle  smaller line: "by Artist" or "Artist on Feelz Machine"
//   onClose

import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Share2, Maximize2 } from 'lucide-react';
import qrcode from '../utils/qrcode';

const SIZE = 1080;           // the saved image, square-ish: 1080 x 1350
const HEIGHT = 1350;

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The code itself: rounded dots, the three corner squares drawn as rounded
// frames, and room in the middle for the Feelz Machine logo. Level H keeps it
// readable with the logo covering the centre.
function drawCode(ctx, url, x, y, size, logo) {
  const qr = qrcode(0, 'H');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  const isFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const hole = Math.floor(n * 0.22);                 // modules left clear for the logo
  const lo = Math.floor((n - hole) / 2), hi = lo + hole;
  ctx.fillStyle = '#0b0b10';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c) || isFinder(r, c)) continue;
      if (logo && r >= lo && r < hi && c >= lo && c < hi) continue;
      ctx.beginPath();
      ctx.arc(x + (c + 0.5) * cell, y + (r + 0.5) * cell, cell * 0.46, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const fx = x + c * cell, fy = y + r * cell;
    ctx.fillStyle = '#0b0b10';
    roundRect(ctx, fx, fy, cell * 7, cell * 7, cell * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, fx + cell, fy + cell, cell * 5, cell * 5, cell * 1.4); ctx.fill();
    // The centre of each corner square stays dark: cameras find the code by these.
    ctx.fillStyle = '#0b0b10';
    roundRect(ctx, fx + cell * 2, fy + cell * 2, cell * 3, cell * 3, cell * 1); ctx.fill();
  }
  if (logo) {
    const s = hole * cell * 0.86, lx = x + size / 2 - s / 2, ly = y + size / 2 - s / 2;
    ctx.save();
    roundRect(ctx, lx, ly, s, s, s * 0.22); ctx.clip();
    ctx.drawImage(logo, lx, ly, s, s);
    ctx.restore();
  }
}

export async function renderCard(canvas, { url, title, subtitle }) {
  canvas.width = SIZE; canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  // background
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, '#15131c'); bg.addColorStop(1, '#07060b');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, SIZE, HEIGHT);
  const glow = ctx.createRadialGradient(SIZE / 2, 420, 60, SIZE / 2, 420, 700);
  glow.addColorStop(0, 'rgba(140,171,46,0.28)'); glow.addColorStop(1, 'rgba(140,171,46,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, SIZE, HEIGHT);
  // white card behind the code
  const pad = 54, codeSize = 760, cardX = (SIZE - codeSize) / 2 - pad, cardY = 120;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cardX, cardY, codeSize + pad * 2, codeSize + pad * 2, 56); ctx.fill();
  const logo = await loadImage('/icon-192.png');
  drawCode(ctx, url, cardX + pad, cardY + pad, codeSize, logo);
  // words
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 64px Inter, system-ui, sans-serif';
  const t = String(title || 'Feelz Machine');
  ctx.fillText(t.length > 28 ? t.slice(0, 27) + '…' : t, SIZE / 2, 1060);
  if (subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '600 40px Inter, system-ui, sans-serif';
    const st = String(subtitle);
    ctx.fillText(st.length > 40 ? st.slice(0, 39) + '…' : st, SIZE / 2, 1124);
  }
  ctx.fillStyle = '#8CAB2E';
  ctx.font = '800 34px Inter, system-ui, sans-serif';
  ctx.fillText('SCAN TO LISTEN ON FEELZ MACHINE', SIZE / 2, 1240);
}

export default function QrCodeSheet({ url, title, subtitle, onClose }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [big, setBig] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!url || !canvasRef.current) return undefined;
    renderCard(canvasRef.current, { url, title, subtitle }).then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [url, title, subtitle]);

  const fileName = `feelz-machine-${String(title || 'qr').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'qr'}.png`;
  const toBlob = () => new Promise(res => canvasRef.current.toBlob(res, 'image/png'));

  const save = async () => {
    const blob = await toBlob();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const share = async () => {
    setBusy(true);
    try {
      const blob = await toBlob();
      const file = blob && new File([blob], fileName, { type: 'image/png' });
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: title || 'Feelz Machine', text: url });
      } else {
        await save();
      }
    } catch (e) { /* closed the share sheet */ }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.82)' }} onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-[#0f0e14] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-5 pb-8"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-white">QR code</p>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>
        <button type="button" onClick={() => setBig(true)} className="relative block w-full rounded-2xl overflow-hidden bg-black/40" aria-label="Show the code full screen">
          <canvas ref={canvasRef} className="w-full h-auto block" style={{ aspectRatio: `${SIZE} / ${HEIGHT}` }} />
          {ready && (
            <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
              <Maximize2 className="w-4 h-4 text-white/80" />
            </span>
          )}
        </button>
        <p className="text-[11px] text-white/40 text-center mt-3">
          Anyone can scan this with their phone camera to open it. Tap the code to show it full screen.
        </p>
        <div className="flex gap-3 mt-4">
          <button onClick={save} disabled={!ready}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/[0.06] text-sm font-semibold text-white disabled:opacity-40">
            <Download className="w-4 h-4" /> Save image
          </button>
          <button onClick={share} disabled={!ready || busy}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-black disabled:opacity-40"
            style={{ background: '#8CAB2E' }}>
            <Share2 className="w-4 h-4" /> Share image
          </button>
        </div>
      </div>

      {big && (
        <div className="fixed inset-0 z-[710] bg-white flex items-center justify-center p-6" onClick={e => { e.stopPropagation(); setBig(false); }}>
          <BigCode url={url} />
          <p className="absolute bottom-8 left-0 right-0 text-center text-sm text-black/50">Tap anywhere to close</p>
        </div>
      )}
    </div>
  );
}

// Full screen, black on white, as large as the screen allows: easiest for a
// camera across a room.
function BigCode({ url }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const s = Math.min(window.innerWidth, window.innerHeight) - 48;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    c.width = c.height = Math.round(s * dpr);
    c.style.width = c.style.height = s + 'px';
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    loadImage('/icon-192.png').then(logo => drawCode(ctx, url, c.width * 0.04, c.width * 0.04, c.width * 0.92, logo));
  }, [url]);
  return <canvas ref={ref} />;
}
