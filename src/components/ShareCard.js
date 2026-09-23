import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Download, Share2, X, Loader, Link, Check, Film, Image } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { buildStoryMp4, MEDIARECORDER_MP4_TYPES } from '../utils/storyMp4';

// ── Helper functions, all defined as hoisted function declarations ──────────

// roundRect first, used by drawFMLogo below
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

// Load ffmpeg.wasm v0.11 via CDN script tag, avoids bundler issues
let _ffmpegLoaded = false;
function loadFFmpegScript() {
  return new Promise((resolve, reject) => {
    if (_ffmpegLoaded || window.FFmpeg) { _ffmpegLoaded = true; resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
    script.crossOrigin = 'anonymous';
    script.onload  = () => { _ffmpegLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function proxyUrl(src) {
  return '/.netlify/functions/image-proxy?url=' + encodeURIComponent(src);
}

// Lyrics for the video. Timestamped [mm:ss.xx] lines are followed exactly;
// plain words are spread evenly across the song so they at least move with it.
function parseLrcForVideo(raw) {
  if (!raw) return null;
  const out = [];
  raw.split('\n').forEach(line => {
    const m = line.match(/^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
    if (!m) return;
    const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
    out.push({ time: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + ms / 1000, text: m[4].trim() });
  });
  return out.length >= 2 ? out.sort((a, b) => a.time - b.time) : null;
}

function lyricLinesAt(lyrics, t, songLength) {
  if (!lyrics) return null;
  const lrc = parseLrcForVideo(lyrics);
  if (lrc) {
    let idx = -1;
    lrc.forEach((l, i) => { if (l.time <= t) idx = i; });
    if (idx < 0) return { index: 0, line: '', next: lrc[0]?.text || '' };
    return { index: idx, line: lrc[idx].text, next: lrc[idx + 1]?.text || '' };
  }
  const lines = lyrics.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const LEAD_IN = 2;
  const span    = Math.max((songLength || lines.length * 4) - LEAD_IN, lines.length);
  const perLine = span / lines.length;
  const idx     = t < LEAD_IN ? 0 : Math.min(Math.floor((t - LEAD_IN) / perLine), lines.length - 1);
  return { index: idx, line: lines[idx], next: lines[idx + 1] || '' };
}

// One line of lyric, in colour. The gradient shifts with the line number so
// consecutive lines are never the same colour, and it is drawn over a dark
// glow so it stays readable on artwork of any brightness.
function drawLyricLine(ctx, text, x, y, maxWidth, index, t) {
  if (!text) return y;
  const hue = (index * 47 + t * 18) % 360;
  const grad = ctx.createLinearGradient(x - maxWidth / 2, y, x + maxWidth / 2, y + 60);
  grad.addColorStop(0,   `hsl(${hue}, 95%, 72%)`);
  grad.addColorStop(0.5, `hsl(${(hue + 40) % 360}, 95%, 82%)`);
  grad.addColorStop(1,   `hsl(${(hue + 80) % 360}, 95%, 70%)`);

  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  words.forEach(w => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  });
  if (line) lines.push(line);

  lines.slice(0, 3).forEach((l, i) => {
    const ly = y + i * 74;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur  = 26;
    ctx.fillStyle   = grad;
    ctx.fillText(l, x, ly);
    ctx.restore();
  });
  return y + Math.min(lines.length, 3) * 74;
}

function loadImage(src) {
  return new Promise(function(resolve, reject) {
    // Try direct load first with cache-bust to prevent stale responses
    var img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload  = function() { resolve(img); };
    img.onerror = function() {
      // Fallback: try via proxy
      var img2 = new window.Image();
      img2.crossOrigin = 'anonymous';
      img2.onload  = function() { resolve(img2); };
      img2.onerror = reject;
      img2.src = proxyUrl(src);
    };
    // Cache-bust so each unique URL gets a fresh load
    img.src = src + (src.includes('?') ? '&' : '?') + '_cb=' + Date.now();
  });
}

// FM logo cache and loader
var _fmLogoImg = null;
function getFMLogo() {
  return new Promise(function(resolve) {
    if (_fmLogoImg) { resolve(_fmLogoImg); return; }
    var img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload  = function() { _fmLogoImg = img; resolve(img); };
    img.onerror = function() { resolve(null); };
    img.src = '/logo.png';
  });
}

function drawFMLogo(ctx, x, y, size) {
  return getFMLogo().then(function(img) {
    if (!img) return;
    ctx.save();
    roundRect(ctx, x, y, size, size, size * 0.22);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  });
}

/**
 * ShareCard
 *
 * Tab 1, Image: 1080×1080 canvas card (existing behaviour)
 * Tab 2, Video: 1080×1920 Stories video with spinning vinyl + audio (30s)
 *
 * Props:
 *   track    - track object (title, artist_name, cover_artwork_url, file_url)
 *   artist   - artist object (for artist share, optional)
 *   shareUrl - URL to share
 *   onClose  - close handler
 */
export default function ShareCard({ track, artist, shareUrl, onClose }) {
  const [tab, setTab]               = useState('image'); // 'image' | 'video'
  const [ready, setReady]           = useState(false);
  const [sharing, setSharing]       = useState(false);
  const [copied, setCopied]         = useState(false);
  const [recording, setRecording]     = useState(false);
  const [videoBlob, setVideoBlob]     = useState(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoError, setVideoError]   = useState('');
  const [startTime, setStartTime]     = useState(0);
  const [duration, setDuration]       = useState(30);
  const [videoFormat, setVideoFormat]   = useState('');
  const [converting, setConverting]     = useState(false);
  const [bgColor, setBgColor]           = useState('#0d0d0d');
  const [lyrics, setLyrics]             = useState(track?.lyrics || null);
  const [showLyrics, setShowLyrics]     = useState(true);

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

  // Lyrics are on the track object almost everywhere (For You, the player).
  // Share can also be opened from places that select fewer columns, so fetch
  // them once if they are missing rather than silently dropping them.
  useEffect(() => {
    if (lyrics !== null || !track?.id) return;
    let cancelled = false;
    supabase.from('tracks').select('lyrics').eq('id', track.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setLyrics(data?.lyrics || ''); });
    return () => { cancelled = true; };
  }, [track?.id, lyrics]);

  // ── Image card ───────────────────────────────────────────────────────────────
  const drawImageCard = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || tab !== 'image') return;
    const ctx = canvas.getContext('2d');
    const W = 1080, H = 1080;
    canvas.width  = W;
    canvas.height = H;

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    if (artworkUrl) {
      // Subtle artwork bleed for depth, matches app aesthetic
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
    // FM logo, top left
    await drawFMLogo(ctx, 60, 60, 100);

    // Feelzmachine.com wordmark, subtle, bottom centre
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
    if (tab === 'image') { setReady(false); drawImageCard(); }
    else {
      setReady(true);
      if (audioUrl) {
        const a = new window.Audio();
        a.src = audioUrl;
        a.onloadedmetadata = () => setDuration(Math.floor(a.duration) || 30);
      }
    }
  }, [tab, drawImageCard, audioUrl]);

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
  const drawVideoFrame = useCallback(async (ctx, artImg, vinylImg, angle, bgOverride, songTime = 0) => {
    const W = 1080, H = 1920;

    // Background, user selected colour with subtle artwork bleed
    const baseBg = bgOverride || '#0d0d0d';
    ctx.fillStyle = baseBg;
    ctx.fillRect(0, 0, W, H);

    if (artImg) {
      // Very subtle blurred artwork at low opacity, just enough to add depth
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.filter = 'blur(120px)';
      ctx.drawImage(artImg, -200, -200, W + 400, H * 0.7);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Purple ambient glow at top, matches app's header glow
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

    // ── Vinyl disc, moved up from centre for better composition ───────────────
    const vinylSize = 840;
    const cx = W / 2;
    const cy = H / 2 - 180; // moved up
    const r  = vinylSize / 2;

    // Outer glow ring, separates vinyl from background
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

    // Subtle rim light, top edge catches light to separate from bg
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
    const words = showLyrics ? lyricLinesAt(lyrics, songTime, track?.duration || 0) : null;
    const hasWords = !!words?.line;

    // With lyrics on the frame the title sits tighter so the words get room.
    const textY = cy + r + (hasWords ? 54 : 80);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${hasWords ? 60 : 72}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    wrapText(ctx, title, W / 2, textY, W - 120, hasWords ? 72 : 84);

    const titleLines = Math.max(1, Math.ceil(title.length / 18));
    const subY = textY + titleLines * (hasWords ? 76 : 88);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `${hasWords ? 40 : 48}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(subtitle, W / 2, subY);

    // ── Lyrics, in colour, moving with the song ──────────────────────────────
    if (hasWords) {
      const lyricY = subY + (hasWords ? 86 : 0);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 62px -apple-system, BlinkMacSystemFont, sans-serif';
      const afterY = drawLyricLine(ctx, words.line, W / 2, lyricY, W - 160, words.index, songTime);

      if (words.next) {
        ctx.save();
        ctx.font = '44px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.32)';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 18;
        const next = String(words.next);
        ctx.fillText(next.length > 38 ? `${next.slice(0, 37)}...` : next, W / 2, afterY + 14);
        ctx.restore();
      }
    }

    // FM logo, top left corner
    await drawFMLogo(ctx, 60, 80, 120);

    // Wordmark only, no track URL
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '34px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('feelzmachine.com', W / 2, H - 72);
    ctx.fillStyle = 'rgba(140,171,46,0.6)';
    ctx.beginPath(); ctx.arc(W/2 - 220, H - 54, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(W/2 + 220, H - 54, 5, 0, Math.PI*2); ctx.fill();
  }, [title, subtitle, artworkUrl, displayUrl, bgColor, lyrics, showLyrics, track?.duration]);

  // Render a static preview frame when on video tab
  useEffect(() => {
    if (tab !== 'video' || recording) return;
    const canvas = previewRef.current;
    if (!canvas) return;
    canvas.width  = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    let cancelled = false;
    (async () => {
      let artImg = null;
      if (artworkUrl) { try { artImg = await loadImage(artworkUrl); } catch {} }
      if (cancelled) return;
      const vinylImg = await buildVinylImage(artImg, 840);
      if (cancelled) return;
      await drawVideoFrame(ctx, artImg, vinylImg, 0, bgColor, startTime);
    })();
    return () => { cancelled = true; };
  }, [tab, artworkUrl, recording, buildVinylImage, drawVideoFrame, startTime]);

  // ── Record video ─────────────────────────────────────────────────────────────
  const recordVideo = useCallback(async () => {
    setRecording(true);
    setVideoBlob(null);
    setVideoError('');
    setVideoProgress(0);
    chunksRef.current = [];

    const canvas = videoRef.current;
    if (!canvas) { setRecording(false); return; }

    canvas.width  = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    let artImg = null;
    if (artworkUrl) {
      try { artImg = await loadImage(artworkUrl); } catch {}
    }

    // Build the vinyl SVG image once, reused every frame
    const vinylImg = await buildVinylImage(artImg, 840);

    const DURATION = 30; // seconds
    const FPS      = 30;
    // Match VinylRecord.js: one full rotation every 2.4s
    const radsPerFrame = (2 * Math.PI / 2.4) / FPS;

    // ── 1. Real MP4 in the browser (Instagram-ready) ──────────────────────────
    // Chrome, Edge and Safari on most phones and computers. See
    // src/utils/storyMp4.js. Falls through to the recorder below if this
    // browser cannot encode H.264 + AAC.
    try {
      setVideoFormat('MP4');
      const mp4 = await buildStoryMp4({
        canvas, fps: FPS, seconds: DURATION, audioUrl, startTime,
        drawFrame: (i) => drawVideoFrame(ctx, artImg, vinylImg, i * radsPerFrame, bgColor, startTime + i / FPS),
        onProgress: setVideoProgress,
      });
      if (mp4) {
        mp4._ext = 'mp4';
        setVideoBlob(mp4);
        setVideoFormat('MP4');
        setRecording(false);
        setVideoProgress(100);
        return;
      }
    } catch (e) {
      console.warn('[share] in-browser MP4 failed, using the recorder:', e?.message || e);
    }

    // Audio, start from user-selected time offset
    let audioStream = null;
    let audioCtx    = null;
    let sourceNode  = null;
    if (audioUrl) {
      try {
        audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
        const res = await fetch(audioUrl);
        const buf = await res.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(buf);
        const dest    = audioCtx.createMediaStreamDestination();
        sourceNode    = audioCtx.createBufferSource();
        sourceNode.buffer = decoded;
        sourceNode.connect(dest);
        sourceNode.connect(audioCtx.destination);
        sourceNode.start(0, startTime); // start from selected offset
        audioStream = dest.stream;
      } catch (e) {
        console.warn('Audio capture failed:', e.message);
      }
    }

    // Combine canvas + audio into one stream
    const canvasStream = canvas.captureStream(FPS);
    const combinedTracks = [...canvasStream.getTracks()];
    if (audioStream) combinedTracks.push(...audioStream.getTracks());
    const combined = new MediaStream(combinedTracks);

    // ── 2. Recorder: MP4 if this browser can record it, WebM otherwise ─────────
    const mimeType = [
      ...MEDIARECORDER_MP4_TYPES,
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ].find(t => window.MediaRecorder && window.MediaRecorder.isTypeSupported(t)) || 'video/webm';
    const recordsMp4 = mimeType.startsWith('video/mp4');
    const fileExt = recordsMp4 ? 'mp4' : 'webm';

    const recorder = new window.MediaRecorder(combined, { mimeType, videoBitsPerSecond: 8000000 });
    recorderRef.current = recorder;
    setVideoFormat(fileExt.toUpperCase());

    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      const webmBlob = new window.Blob(chunksRef.current, { type: mimeType });
      setRecording(false);

      if (sourceNode) try { sourceNode.stop(); } catch {}
      if (audioCtx)   try { audioCtx.close();  } catch {}

      if (recordsMp4) {
        webmBlob._ext = 'mp4';
        setVideoBlob(webmBlob);
        setVideoFormat('MP4');
        setVideoProgress(100);
        return;
      }

      setVideoFormat('CONVERTING');
      setConverting(true);

      // Skip ffmpeg.wasm, requires SharedArrayBuffer which needs COOP/COEP headers
      // that Netlify doesn't send. Go straight to server-side conversion.
      //
      // FIXED: this previously awaited res.json() on the background
      // function's own response, expecting { mp4 } directly. Background
      // functions always return an immediate 202 with no result body -
      // that mismatch is why MP4 conversion has never actually worked,
      // it silently fell back to WebM every single time. The real
      // conversion takes ~30+ seconds for a 30-second story video, which
      // is genuinely too long for a regular function's limit anyway, so
      // background is still the right call, it just needs polling for
      // the real result instead of trusting the immediate response.
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(webmBlob);
        });

        const jobId = (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID()
          : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Fire the conversion, the response here is just Netlify's
        // "accepted" acknowledgment, not the actual result
        await fetch('/.netlify/functions/convert-to-mp4-background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video: base64, jobId }),
        });

        // Poll for the real result, conversion typically takes ~30-35s
        // for a full-length story video, so this polls for up to 90s
        // before giving up and falling back to WebM
        const pollIntervalMs = 3000;
        const maxWaitMs = 90000;
        const startedAt = Date.now();
        let result = null;

        while (Date.now() - startedAt < maxWaitMs) {
          await new Promise(r => setTimeout(r, pollIntervalMs));
          const statusRes = await fetch(`/.netlify/functions/check-mp4-status?jobId=${jobId}`);
          if (!statusRes.ok) continue;
          const status = await statusRes.json();
          if (status.ready) { result = status; break; }
          if (status.failed) { throw new Error(status.reason || 'Conversion failed server-side'); }
        }

        if (!result) throw new Error('MP4 conversion timed out after 90s');

        const mp4Res = await fetch(result.url);
        const mp4Blob = await mp4Res.blob();
        mp4Blob._ext = 'mp4';
        setVideoBlob(mp4Blob);
        setVideoFormat('MP4');
      } catch (err) {
        console.error('MP4 conversion failed:', err.message);
        // Fallback, WebM works on Android Chrome and can still be shared/downloaded
        webmBlob._ext = 'webm';
        setVideoBlob(webmBlob);
        setVideoFormat('WEBM');
      }

      setConverting(false);
      setVideoProgress(100);
    };

    recorder.start(100);

    // Animate
    let frame    = 0;
    let angle    = 0;
    const totalFrames = DURATION * FPS;

    const FRAME_MS = 1000 / FPS; // 33.33ms per frame for consistent timing
    const animate = async () => {
      if (frame >= totalFrames) {
        recorder.stop();
        return;
      }
      const frameStart = performance.now();
      await drawVideoFrame(ctx, artImg, vinylImg, angle, bgColor, startTime + frame / FPS);
      angle += radsPerFrame;
      frame++;
      setVideoProgress(Math.round((frame / totalFrames) * 95));
      // Use setTimeout for consistent frame rate instead of rAF
      // rAF runs as fast as the display refresh which causes short videos
      const elapsed = performance.now() - frameStart;
      const delay = Math.max(0, FRAME_MS - elapsed);
      animFrameRef.current = setTimeout(animate, delay);
    };
    animate();
  }, [audioUrl, artworkUrl, drawVideoFrame, startTime, buildVinylImage, bgColor]);

  const stopRecording = () => {
    if (animFrameRef.current) clearTimeout(animFrameRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    setRecording(false);
  };

  useEffect(() => () => stopRecording(), []); // cleanup on unmount

  // ── Share / download handlers ─────────────────────────────────────────────────
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

  const handleDownloadVideo = () => {
    if (!videoBlob) return;
    const url  = URL.createObjectURL(videoBlob);
    const link = document.createElement('a');
    const ext = videoBlob._ext || 'webm';
    link.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-feelzmachine.${ext}`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleShareVideo = async () => {
    if (!videoBlob) return;
    setSharing(true);
    try {
      const ext2 = videoBlob._ext || 'webm';
      const file = new File([videoBlob], `${title}-feelzmachine.${ext2}`, { type: videoBlob.type });
      const shareData = {
        files: [file],
        title,
        text: track ? `Listen to ${title} by ${track.artist_name} on Feelz Machine` : `Listen to ${title} on Feelz Machine`,
        url: shareUrl || window.location.href,
      };
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        // Desktop or unsupported, download instead
        handleDownloadVideo();
      }
    } catch (e) {
      // User cancelled or share failed, fall back to download
      if (e.name !== 'AbortError') handleDownloadVideo();
    }
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
          {/* Tabs */}
          <div className="flex bg-white/[0.05] rounded-xl p-1 mb-4">
            {[
              { id: 'image', label: 'Image', icon: Image  },
              { id: 'video', label: 'Story Video', icon: Film },
            ].map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setVideoBlob(null); }}
                className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-semibold transition ${
                  tab === t.id ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
                }`}>
                <t.icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Image tab */}
          {tab === 'image' && (
            <div className="relative rounded-2xl overflow-hidden bg-white/[0.04] aspect-square">
              <canvas ref={canvasRef} className="w-full h-full"
                style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.3s' }} />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader className="w-6 h-6 animate-spin text-white/20" />
                </div>
              )}
            </div>
          )}

          {/* Video tab */}
          {tab === 'video' && (
            <div className="space-y-3">
              {/* Hidden recording canvas */}
              <canvas ref={videoRef} className="hidden" />

              {/* Preview, shows a static frame of how the video will look */}
              <div className="rounded-2xl bg-black aspect-[9/16] relative overflow-hidden flex items-center justify-center">
                <canvas ref={previewRef} className="w-full h-full object-contain" />
                {(recording || converting) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 space-y-3">
                    <div className="w-16 h-16 relative">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#8B5CF6" strokeWidth="2"
                          strokeDasharray={`${converting ? 100 : videoProgress} 100`} strokeLinecap="round"
                          style={converting ? { animation: 'spin 1s linear infinite' } : {}} />
                      </svg>
                      {!converting && <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">{videoProgress}%</span>}
                    </div>
                    <p className="text-xs text-white/60">
                      {converting ? 'Converting to MP4 for Instagram...' : 'Rendering...'}
                    </p>
                    {converting && (
                      <p className="text-[10px] text-white/30 px-8 text-center">
                        This takes 30–60s. Don't close the app.
                      </p>
                    )}
                  </div>
                )}
                {videoBlob && !recording && (
                  <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center space-y-2">
                    <div className="px-3 py-1.5 rounded-full bg-green-500/20 border border-green-500/30 flex items-center space-x-1.5">
                      <Check className="w-3 h-3 text-green-400" />
                      <span className="text-xs font-semibold text-green-400">Ready to share</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/30">
                      Save → open Instagram → share as story
                    </span>
                  </div>
                )}
              </div>

              {/* Lyrics on the video */}
              {!recording && lyrics && (
                <button
                  onClick={() => { setShowLyrics(v => !v); setVideoBlob(null); setVideoProgress(0); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  <span className="text-xs text-white/70">Show the lyrics on the video</span>
                  <span className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${showLyrics ? 'bg-purple-500' : 'bg-white/[0.12]'}`}>
                    <span className={`w-4 h-4 rounded-full bg-white transition-transform ${showLyrics ? 'translate-x-4' : 'translate-x-0'}`} />
                  </span>
                </button>
              )}

              {/* Background colour picker */}
              {!recording && (
                <div className="space-y-2">
                  <p className="text-[11px] text-white/40">Background</p>
                  <div className="flex space-x-2">
                    {[
                      { color: '#0d0d0d', label: 'Black' },
                      { color: '#0a0a1a', label: 'Dark Blue' },
                      { color: '#0d0a14', label: 'Dark Purple' },
                      { color: '#0a140a', label: 'Dark Green' },
                      { color: '#14080a', label: 'Dark Red' },
                      { color: '#1a1008', label: 'Dark Amber' },
                    ].map(({ color, label }) => (
                      <button
                        key={color}
                        onClick={() => { setBgColor(color); setVideoBlob(null); setVideoProgress(0); }}
                        title={label}
                        className="w-8 h-8 rounded-lg border-2 transition"
                        style={{
                          backgroundColor: color,
                          borderColor: bgColor === color ? '#8CAB2E' : 'rgba(255,255,255,0.1)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Start time picker */}
              {audioUrl && !recording && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-white/40">Start from</p>
                    <p className="text-[11px] text-white/60 font-medium">
                      {Math.floor(startTime / 60)}:{String(startTime % 60).padStart(2, '0')}
                    </p>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, duration - 30)}
                    value={startTime}
                    onChange={e => { setStartTime(Number(e.target.value)); setVideoBlob(null); }}
                    className="w-full accent-purple-500"
                  />
                  <p className="text-[10px] text-white/20">Drag to choose which 30 seconds to use</p>
                </div>
              )}

              {!audioUrl && (
                <p className="text-[10px] text-amber-400/60 text-center">No audio, video will be visual only</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-7 pt-3 space-y-3">
          {tab === 'image' ? (
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
          ) : (
            <>
              {!videoBlob && !recording && !converting && (
                <button onClick={recordVideo}
                  className="w-full flex items-center justify-center space-x-2 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 transition text-sm font-semibold text-white">
                  <Film className="w-4 h-4" /><span>Generate Story Video</span>
                </button>
              )}
              {recording && (
                <button onClick={stopRecording}
                  className="w-full flex items-center justify-center space-x-2 py-3 rounded-2xl bg-red-500/20 border border-red-500/30 transition text-sm font-semibold text-red-400">
                  <span>Cancel</span>
                </button>
              )}
              {videoBlob && !recording && !converting && (
                <div className={videoFormat === 'MP4' ? 'flex space-x-3' : ''}>
                  <button onClick={handleDownloadVideo}
                    className={`flex items-center justify-center space-x-2 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] transition text-sm font-semibold text-white ${videoFormat === 'MP4' ? 'flex-1' : 'w-full'}`}>
                    <Download className="w-4 h-4" />
                    <span>{videoFormat === 'MP4' ? 'Save' : 'Save to device'}</span>
                  </button>
                  {videoFormat === 'MP4' && (
                    <button onClick={handleShareVideo} disabled={sharing}
                      className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 transition disabled:opacity-30 text-sm font-semibold text-white">
                      {sharing ? <Loader className="w-4 h-4 animate-spin" /> : <><Share2 className="w-4 h-4" /><span>Share</span></>}
                    </button>
                  )}
                </div>
              )}
              {videoBlob && (
                <button onClick={() => { setVideoBlob(null); setVideoProgress(0); }}
                  className="w-full text-center text-xs text-white/20 hover:text-white/40 py-1 transition">
                  Regenerate
                </button>
              )}
              {videoError && <p className="text-xs text-red-400 text-center">{videoError}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}