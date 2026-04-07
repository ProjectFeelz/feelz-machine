import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Download, Share2, X, Loader } from 'lucide-react';

/**
 * ShareCard
 *
 * Generates a shareable image card for a track or artist using HTML Canvas.
 * The card includes: artwork, title, artist name, platform branding.
 *
 * Props:
 *   track  - track object (title, artist_name, cover_artwork_url)
 *   artist - artist object (for artist share, optional)
 *   onClose - close handler
 *
 * Usage:
 *   <ShareCard track={currentTrack} onClose={() => setShowShare(false)} />
 */
export default function ShareCard({ track, artist, onClose }) {
  const canvasRef          = useRef(null);
  const [ready, setReady]  = useState(false);
  const [sharing, setSharing] = useState(false);

  const title      = track?.title || artist?.artist_name || 'Feelz Machine';
  const subtitle   = track?.artist_name || (artist ? 'Artist Profile' : '');
  const artworkUrl = track?.cover_artwork_url || artist?.profile_image_url || null;
  const displayUrl = shareUrl
    ? shareUrl.replace('https://www.', '').replace('https://', '')
    : 'feelzmachine.com';

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 1080, H = 1080;
    canvas.width  = W;
    canvas.height = H;

    // ── Background ──
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a0a0a');
    bg.addColorStop(1, '#111111');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ── Artwork ──
    if (artworkUrl) {
      try {
        const img = await loadImage(artworkUrl);
        // Blurred background version
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.filter = 'blur(60px)';
        ctx.drawImage(img, -60, -60, W + 120, H + 120);
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.restore();

        // Main artwork — centred square with rounded corners
        const size   = 640;
        const x      = (W - size) / 2;
        const y      = 120;
        roundRect(ctx, x, y, size, size, 40);
        ctx.save();
        ctx.clip();
        ctx.drawImage(img, x, y, size, size);
        ctx.restore();

        // Subtle inner shadow on artwork
        ctx.save();
        roundRect(ctx, x, y, size, size, 40);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } catch {}
    } else {
      // Fallback artwork placeholder
      roundRect(ctx, 220, 120, 640, 640, 40);
      ctx.fillStyle = 'rgba(139,92,246,0.3)';
      ctx.fill();
    }

    // ── Text ──
    // Title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const titleY = 800;
    wrapText(ctx, title, W / 2, titleY, W - 120, 72);

    // Subtitle
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '40px -apple-system, BlinkMacSystemFont, sans-serif';
    const subtitleLines = Math.ceil(title.length / 20);
    ctx.fillText(subtitle, W / 2, titleY + subtitleLines * 76);

    // ── Branding ──
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(displayUrl, W / 2, H - 60);

    // Small dot before and after
    ctx.fillStyle = 'rgba(139,92,246,0.7)';
    ctx.beginPath();
    ctx.arc(W / 2 - 210, H - 44, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W / 2 + 210, H - 44, 5, 0, Math.PI * 2);
    ctx.fill();

    setReady(true);
  }, [title, subtitle, artworkUrl]);

  useEffect(() => { draw(); }, [draw]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link    = document.createElement('a');
    link.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-feelzmachine.png`;
    link.href     = canvas.toDataURL('image/png');
    link.click();
  };

  const handleShare = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSharing(true);
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `${title}-feelzmachine.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title,
            text: `Listen to ${title}${subtitle ? ` by ${subtitle}` : ''} on Feelz Machine`,
            url: shareUrl || window.location.href,
          });
        } else {
          handleDownload();
        }
      }, 'image/png');
    } catch {}
    setSharing(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="relative w-full max-w-sm mx-4 mb-6 md:mb-0 rounded-3xl overflow-hidden animate-slide-up md:animate-none"
        style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
          <X className="w-4 h-4 text-white/60" />
        </button>

        <div className="p-5 pb-2">
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-3">Share Card</p>

          {/* Canvas preview */}
          <div className="relative rounded-2xl overflow-hidden bg-white/[0.04] aspect-square">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.3s' }}
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader className="w-6 h-6 animate-spin text-white/20" />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-3 px-5 pb-7 pt-3">
          <button
            onClick={handleDownload}
            disabled={!ready}
            className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] transition disabled:opacity-30 text-sm font-semibold text-white"
          >
            <Download className="w-4 h-4" />
            <span>Save</span>
          </button>
          <button
            onClick={handleShare}
            disabled={!ready || sharing}
            className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 transition disabled:opacity-30 text-sm font-semibold text-white"
          >
            {sharing
              ? <Loader className="w-4 h-4 animate-spin" />
              : <><Share2 className="w-4 h-4" /><span>Share</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img   = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line    = '';
  let lineY   = y;
  for (const word of words) {
    const testLine  = line + word + ' ';
    const metrics   = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line.trim(), x, lineY);
      line  = word + ' ';
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, lineY);
}
