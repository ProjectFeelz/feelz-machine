import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Download, Share2, X, Loader, Link, Check, Image } from 'lucide-react';

// ── Helper functions — all defined as hoisted function declarations ──────────

// roundRect first — used by drawFMLogo below
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
  let line = '', lineY = y;
  for (const word of words) {
    const testLine = line + word + ' ';
    if (ctx.measureText(testLine).width > maxWidth && line !== '') {
      ctx.fillText(line.trim(), x, lineY);
      line = word + ' '; lineY += lineHeight;
    } else { line = testLine; }
  }
  ctx.fillText(line.trim(), x, lineY);
}


/**
 * ShareCard
 *
 * Tab 1 — Image: 1080×1080 canvas card (existing behaviour)
 * Tab 2 — Video: 1080×1920 Stories video with spinning vinyl + audio (30s)
 *
 * Props:
 *   track    - track object (title, artist_name, cover_artwork_url, file_url)
 *   artist   - artist object (for artist share, optional)
 *   shareUrl - URL to share
 *   onClose  - close handler
 */
export default function ShareCard({ track, artist, shareUrl, onClose }) {
  const [ready, setReady]           = useState(false);
  const [sharing, setSharing]       = useState(false);
  const [copied, setCopied]         = useState(false);
  const [recording, setRecording]     = useState(false);
  const [startTime, setStartTime]     = useState(0);
  const [duration, setDuration]       = useState(30);
  const [videoFormat, setVideoFormat]   = useState('');
  const [bgColor, setBgColor]           = useState('#0d0d0d');

  const canvasRef    = useRef(null);
  const videoRef     = useRef(null);
  const previewRef   = useRef(null); // live preview canvas
  const animFrameRef = useRef(null);
  const recorderRef  = useRef(null);
  const chunksRef    = useRef([]);

  const title      = track?.title      || artist?.artist_name || 'Feelz Machine';
  const subtitle   = track?.artist_name || (artist ? 'Listen on Feelz Machine' : '');
  const artworkUrl = track?.cover_artwork_url || artist?.profile_image_url || null;
  const audioUrl   = track?.file_url || null;
  const displayUrl = shareUrl
    ? shareUrl.replace('https://www.', '').replace('https://', '')
    : 'feelzmachine.com';

  // ── Image card ───────────────────────────────────────────────────────────────
  const drawImageCard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 1080, H = 1080;
    canvas.width  = W;
    canvas.height = H;

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    if (artworkUrl) {
      // Subtle artwork bleed for depth — matches app aesthetic
      try {
        const bgImg = await loadImage(artworkUrl);
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.filter = 'blur(100px)';
        ctx.drawImage(bgImg, -100, -100, W + 200, H * 0.6);
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.restore();
      } catch {}
    }

    // Purple glow at top
    const topGlow = ctx.createRadialGradient(W/2, 0, 0, W/2, 0, H * 0.55);
    topGlow.addColorStop(0,   'rgba(88,28,220,0.15)');
    topGlow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, W, H);

    if (artworkUrl) {
      try {
        const img = await loadImage(artworkUrl);
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.filter = 'blur(60px)';
        ctx.drawImage(img, -60, -60, W + 120, H + 120);
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.restore();

        const size = 640, x = (W - size) / 2, y = 120;
        roundRect(ctx, x, y, size, size, 40);
        ctx.save(); ctx.clip();
        ctx.drawImage(img, x, y, size, size);
        ctx.restore();
        ctx.save();
        roundRect(ctx, x, y, size, size, 40);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      } catch {}
    } else {
      roundRect(ctx, 220, 120, 640, 640, 40);
      ctx.fillStyle = 'rgba(139,92,246,0.3)'; ctx.fill();
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const titleY = 800;
    wrapText(ctx, title, W / 2, titleY, W - 120, 72);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '40px -apple-system, BlinkMacSystemFont, sans-serif';
    const subtitleLines = Math.ceil(title.length / 20);
    ctx.fillText(subtitle, W / 2, titleY + subtitleLines * 76);
    // FM logo — top left
    await drawFMLogo(ctx, 60, 60, 100);

    // Feelzmachine.com wordmark — subtle, bottom centre
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '28px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('feelzmachine.com', W / 2, H - 56);
    ctx.fillStyle = 'rgba(140,171,46,0.6)';
    ctx.beginPath(); ctx.arc(W / 2 - 180, H - 40, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W / 2 + 180, H - 40, 4, 0, Math.PI * 2); ctx.fill();

    setReady(true);
  }, [tab, title, subtitle, artworkUrl, displayUrl]);

  useEffect(() => {
    setReady(false); drawImageCard();
  }, [drawImageCard]);

  // ── SVG vinyl to canvas image ────────────────────────────────────────────────
  // Renders the VinylRecord SVG to an HTMLImageElement so the canvas draw
  // is pixel-perfect identical to the app's vinyl component
  const buildVinylImage = useCallback((artImg, size) => {
    return new Promise((resolve) => {
      const r         = size / 2;
      const labelR    = r * 0.30;
      const innerRing = labelR + 6;
      const spindleR  = r * 0.025;
      const grooveCount = 22;
      const uid = Math.random().toString(36).slice(2);
      const clipId   = `vc-${uid}`;
      const bodyGid  = `vb-${uid}`;
      const shineId  = `vs-${uid}`;
      const labelGid = `vl-${uid}`;

      const grooves = Array.from({ length: grooveCount }, (_, i) => {
        const min = innerRing + 4, max = r - 6;
        return min + ((max - min) / grooveCount) * i;
      });

      let labelContent = '';
      if (artImg) {
        try {
          // Draw artwork into offscreen canvas and embed as data URI in SVG
          const lSize = Math.round(labelR * 2);
          const offscreen = window.document.createElement('canvas');
          offscreen.width  = lSize;
          offscreen.height = lSize;
          const octx = offscreen.getContext('2d');
          // Fill black first so transparent PNGs look right
          octx.fillStyle = '#000';
          octx.fillRect(0, 0, lSize, lSize);
          octx.drawImage(artImg, 0, 0, lSize, lSize);
          const dataUrl = offscreen.toDataURL('image/jpeg', 0.92);
          if (dataUrl && dataUrl.startsWith('data:image')) {
            labelContent = `<image href="${dataUrl}" x="${r - labelR}" y="${r - labelR}" width="${lSize}" height="${lSize}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`;
          } else {
            labelContent = `<circle cx="${r}" cy="${r}" r="${labelR}" fill="rgba(139,92,246,0.3)"/>`;
          }
        } catch {
          labelContent = `<circle cx="${r}" cy="${r}" r="${labelR}" fill="rgba(139,92,246,0.3)"/>`;
        }
      } else {
        labelContent = `<circle cx="${r}" cy="${r}" r="${labelR}" fill="rgba(139,92,246,0.3)"/>`;
      }

      const grooveSvg = grooves.map((gr, i) =>
        `<circle cx="${r}" cy="${r}" r="${gr}" fill="none" stroke="${
          i % 4 === 0 ? 'rgba(255,255,255,0.055)' : i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.015)'
        }" stroke-width="${i % 4 === 0 ? 0.7 : 0.35}"/>`
      ).join('');

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <defs>
          <clipPath id="${clipId}"><circle cx="${r}" cy="${r}" r="${labelR}"/></clipPath>
          <radialGradient id="${bodyGid}" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stop-color="#1c1c1c"/>
            <stop offset="35%" stop-color="#0e0e0e"/>
            <stop offset="100%" stop-color="#060606"/>
          </radialGradient>
          <radialGradient id="${shineId}" cx="28%" cy="22%" r="55%">
            <stop offset="0%" stop-color="rgba(255,255,255,0.09)"/>
            <stop offset="50%" stop-color="rgba(255,255,255,0.02)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
          </radialGradient>
          <radialGradient id="${labelGid}" cx="50%" cy="50%" r="50%">
            <stop offset="60%" stop-color="rgba(0,0,0,0)"/>
            <stop offset="100%" stop-color="rgba(0,0,0,0.45)"/>
          </radialGradient>
        </defs>
        <circle cx="${r}" cy="${r}" r="${r - 1}" fill="url(#${bodyGid})"/>
        ${grooveSvg}
        <circle cx="${r}" cy="${r}" r="${r - 2}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1.5"/>
        <circle cx="${r}" cy="${r}" r="${innerRing}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
        <circle cx="${r}" cy="${r}" r="${innerRing - 2}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
        ${labelContent}
        <circle cx="${r}" cy="${r}" r="${labelR}" fill="url(#${labelGid})"/>
        <circle cx="${r}" cy="${r}" r="${labelR}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.8"/>
        <circle cx="${r}" cy="${r}" r="${r - 1}" fill="url(#${shineId})"/>
        <circle cx="${r}" cy="${r}" r="${spindleR}" fill="#000" stroke="rgba(255,255,255,0.12)" stroke-width="0.6"/>
      </svg>`;

      const blob = new window.Blob([svg], { type: 'image/svg+xml' });
      const url  = window.URL.createObjectURL(blob);
      const img  = new window.Image();
      img.onload  = () => { window.URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { window.URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }, []);

  // ── Video frame draw ────────────────────────────────────────────────────────
  const drawVideoFrame = useCallback(async (ctx, artImg, vinylImg, angle, bgOverride) => {
    const W = 1080, H = 1920;

    // Background — user selected colour with subtle artwork bleed
    const baseBg = bgOverride || '#0d0d0d';
    ctx.fillStyle = baseBg;
    ctx.fillRect(0, 0, W, H);

    if (artImg) {
      // Very subtle blurred artwork at low opacity — just enough to add depth
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.filter = 'blur(120px)';
      ctx.drawImage(artImg, -200, -200, W + 400, H * 0.7);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Purple ambient glow at top — matches app's header glow
    const topGlow = ctx.createRadialGradient(W/2, 0, 0, W/2, 0, H * 0.5);
    topGlow.addColorStop(0,   'rgba(88,28,220,0.18)');
    topGlow.addColorStop(0.5, 'rgba(88,28,220,0.06)');
    topGlow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, W, H);

    // Bottom fade to pure black
    const bottomFade = ctx.createLinearGradient(0, H * 0.65, 0, H);
    bottomFade.addColorStop(0, 'rgba(0,0,0,0)');
    bottomFade.addColorStop(1, 'rgba(0,0,0,0.95)');
    ctx.fillStyle = bottomFade;
    ctx.fillRect(0, 0, W, H);

    // ── Vinyl disc — moved up from centre for better composition ───────────────
    const vinylSize = 840;
    const cx = W / 2;
    const cy = H / 2 - 180; // moved up
    const r  = vinylSize / 2;

    // Outer glow ring — separates vinyl from background
    const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.15);
    glowGrad.addColorStop(0,   'rgba(100,60,200,0.0)');
    glowGrad.addColorStop(0.6, 'rgba(80,40,160,0.25)');
    glowGrad.addColorStop(0.85,'rgba(60,20,120,0.15)');
    glowGrad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
    ctx.fill();

    // Drop shadow BEFORE vinyl
    const shadow = ctx.createRadialGradient(cx, cy + r - 20, 0, cx, cy + r - 20, r * 0.9);
    shadow.addColorStop(0,   'rgba(0,0,0,0.8)');
    shadow.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    shadow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(cx - r, cy + r * 0.6, r * 2, r * 0.8);

    if (vinylImg) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.drawImage(vinylImg, -vinylSize / 2, -vinylSize / 2, vinylSize, vinylSize);
      ctx.restore();
    }

    // Subtle rim light — top edge catches light to separate from bg
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
    const rimGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    rimGrad.addColorStop(0,    'rgba(255,255,255,0.12)');
    rimGrad.addColorStop(0.15, 'rgba(255,255,255,0.04)');
    rimGrad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // ── Text ───────────────────────────────────────────────────────────────────
    const textY = cy + r + 80;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    wrapText(ctx, title, W / 2, textY, W - 120, 84);

    const titleLines = Math.max(1, Math.ceil(title.length / 18));
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '48px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(subtitle, W / 2, textY + titleLines * 88);

    // FM logo — top left corner
    await drawFMLogo(ctx, 60, 80, 120);

    // Wordmark only — no track URL
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '34px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('feelzmachine.com', W / 2, H - 72);
    ctx.fillStyle = 'rgba(140,171,46,0.6)';
    ctx.beginPath(); ctx.arc(W/2 - 220, H - 54, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(W/2 + 220, H - 54, 5, 0, Math.PI*2); ctx.fill();
  }, [title, subtitle, artworkUrl, displayUrl, bgColor]);

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-feelzmachine.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleShareImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSharing(true);
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `${title}-feelzmachine.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          const trackUrl = shareUrl || window.location.href;
          await navigator.share({
            files: [file], title,
            text: track
              ? `Listen to ${title} by ${track.artist_name} on Feelz Machine\n${trackUrl}`
              : `Listen to ${title} on Feelz Machine\n${trackUrl}`,
          });
        } else { handleDownloadImage(); }
      }, 'image/png');
    } catch {}
    setSharing(false);
  };

  const handleCopyLink = async () => {
    const url = shareUrl || window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = url; document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-4 pb-6 md:pb-4"
      onClick={onClose}>
      <div
        className="relative w-full max-w-sm rounded-3xl"
        style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
          <X className="w-4 h-4 text-white/60" />
        </button>

        <div className="p-5 pb-2">
          <div className="relative rounded-2xl overflow-hidden bg-white/[0.04] aspect-square">
              <canvas ref={canvasRef} className="w-full h-full"
                style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.3s' }} />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader className="w-6 h-6 animate-spin text-white/20" />
                </div>
              )}
            </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-7 pt-3 space-y-3">
          <>
              <div className="flex space-x-3">
                <button onClick={handleDownloadImage} disabled={!ready}
                  className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] transition disabled:opacity-30 text-sm font-semibold text-white">
                  <Download className="w-4 h-4" /><span>Save</span>
                </button>
                <button onClick={handleShareImage} disabled={!ready || sharing}
                  className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 transition disabled:opacity-30 text-sm font-semibold text-white">
                  {sharing ? <Loader className="w-4 h-4 animate-spin" /> : <><Share2 className="w-4 h-4" /><span>Share</span></>}
                </button>
              </div>
              <button onClick={handleCopyLink}
                className="w-full flex items-center justify-center space-x-2 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition text-sm font-semibold text-white/60">
                {copied
                  ? <><Check className="w-4 h-4 text-green-400" /><span className="text-green-400">Link copied!</span></>
                  : <><Link className="w-4 h-4" /><span>Copy link</span></>}
              </button>
              <p className="text-[10px] text-white/20 text-center leading-relaxed">
                For Instagram Stories: save the card, open Instagram, then paste the link in your story.
              </p>
            </>
          </>
        </div>
      </div>
    </div>
  );
}