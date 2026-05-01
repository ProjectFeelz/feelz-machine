import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Download, Share2, X, Loader, Link, Check, Film, Image } from 'lucide-react';

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
  const [tab, setTab]               = useState('image'); // 'image' | 'video'
  const [ready, setReady]           = useState(false);
  const [sharing, setSharing]       = useState(false);
  const [copied, setCopied]         = useState(false);
  const [recording, setRecording]   = useState(false);
  const [videoBlob, setVideoBlob]   = useState(null);
  const [videoProgress, setVideoProgress] = useState(0); // 0-100
  const [videoError, setVideoError] = useState('');

  const canvasRef   = useRef(null);
  const videoRef    = useRef(null);
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
    if (!canvas || tab !== 'image') return;
    const ctx = canvas.getContext('2d');
    const W = 1080, H = 1080;
    canvas.width  = W;
    canvas.height = H;

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a0a0a');
    bg.addColorStop(1, '#111111');
    ctx.fillStyle = bg;
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
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '32px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(displayUrl, W / 2, H - 60);
    ctx.fillStyle = 'rgba(139,92,246,0.7)';
    ctx.beginPath(); ctx.arc(W / 2 - 210, H - 44, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W / 2 + 210, H - 44, 5, 0, Math.PI * 2); ctx.fill();

    setReady(true);
  }, [tab, title, subtitle, artworkUrl, displayUrl]);

  useEffect(() => {
    if (tab === 'image') { setReady(false); drawImageCard(); }
    else { setReady(true); }
  }, [tab, drawImageCard]);

  // ── Vinyl canvas draw (single frame, angle in radians) ───────────────────────
  const drawVideoFrame = useCallback(async (ctx, artImg, angle) => {
    const W = 1080, H = 1920;

    // Background — blurred artwork
    ctx.fillStyle = '#060606';
    ctx.fillRect(0, 0, W, H);
    if (artImg) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.filter = 'blur(80px)';
      ctx.drawImage(artImg, -100, -100, W + 200, H + 200);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Dark vignette overlay
    const vignette = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    // ── Vinyl disc ──────────────────────────────────────────────────────────────
    const cx = W / 2, cy = H / 2;
    const r  = 420;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Record body
    const bodyGrad = ctx.createRadialGradient(-r*0.12, -r*0.18, 0, 0, 0, r);
    bodyGrad.addColorStop(0,   '#1c1c1c');
    bodyGrad.addColorStop(0.35,'#0e0e0e');
    bodyGrad.addColorStop(1,   '#060606');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Grooves
    const grooveCount = 22;
    const labelR = r * 0.30;
    const innerRing = labelR + 6;
    for (let i = 0; i < grooveCount; i++) {
      const gr = (innerRing + 4) + (((r - 6) - (innerRing + 4)) / grooveCount) * i;
      ctx.beginPath();
      ctx.arc(0, 0, gr, 0, Math.PI * 2);
      ctx.strokeStyle = i % 4 === 0
        ? 'rgba(255,255,255,0.055)'
        : i % 2 === 0
          ? 'rgba(255,255,255,0.025)'
          : 'rgba(255,255,255,0.015)';
      ctx.lineWidth = i % 4 === 0 ? 0.7 : 0.35;
      ctx.stroke();
    }

    // Outer edge
    ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1.5; ctx.stroke();

    // Accent rings around label
    ctx.beginPath(); ctx.arc(0, 0, innerRing, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, innerRing - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5; ctx.stroke();

    // Label artwork
    if (artImg) {
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, labelR, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(artImg, -labelR, -labelR, labelR * 2, labelR * 2);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, labelR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(139,92,246,0.3)'; ctx.fill();
    }

    // Label vignette
    const labelVig = ctx.createRadialGradient(0, 0, labelR * 0.6, 0, 0, labelR);
    labelVig.addColorStop(0, 'rgba(0,0,0,0)');
    labelVig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.beginPath(); ctx.arc(0, 0, labelR, 0, Math.PI * 2);
    ctx.fillStyle = labelVig; ctx.fill();

    // Label border
    ctx.beginPath(); ctx.arc(0, 0, labelR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.8; ctx.stroke();

    // Shine
    const shine = ctx.createRadialGradient(-r*0.28, -r*0.22, 0, 0, 0, r);
    shine.addColorStop(0,   'rgba(255,255,255,0.09)');
    shine.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    shine.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = shine; ctx.fill();

    // Spindle
    ctx.beginPath(); ctx.arc(0, 0, r * 0.025, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.6;
    ctx.fill(); ctx.stroke();

    ctx.restore();

    // Drop shadow under vinyl
    const shadow = ctx.createRadialGradient(cx, cy + r + 30, 0, cx, cy + r + 30, r * 0.8);
    shadow.addColorStop(0,   'rgba(0,0,0,0.5)');
    shadow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(cx - r, cy + r - 20, r * 2, 120);

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

    // Branding
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '36px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(displayUrl, W / 2, H - 80);
    ctx.fillStyle = 'rgba(139,92,246,0.7)';
    ctx.beginPath(); ctx.arc(W/2 - 240, H - 62, 6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(W/2 + 240, H - 62, 6, 0, Math.PI*2); ctx.fill();
  }, [title, subtitle, artworkUrl, displayUrl]);

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

    const DURATION = 30; // seconds
    const FPS      = 30;
    const RPM      = 33.3;
    const radsPerFrame = (RPM / 60) * 2 * Math.PI / FPS;

    // Audio
    let audioStream = null;
    let audioCtx    = null;
    let sourceNode  = null;
    if (audioUrl) {
      try {
        audioCtx  = new AudioContext();
        const res = await fetch(audioUrl);
        const buf = await res.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(buf);
        const dest    = audioCtx.createMediaStreamDestination();
        sourceNode    = audioCtx.createBufferSource();
        sourceNode.buffer = decoded;
        sourceNode.connect(dest);
        sourceNode.connect(audioCtx.destination);
        sourceNode.start(0);
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

    // Pick best supported codec
    const mimeType = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']
      .find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 8_000_000 });
    recorderRef.current = recorder;

    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setVideoBlob(blob);
      setRecording(false);
      setVideoProgress(100);
      if (sourceNode) try { sourceNode.stop(); } catch {}
      if (audioCtx)   try { audioCtx.close();  } catch {}
    };

    recorder.start(100);

    // Animate
    let frame    = 0;
    let angle    = 0;
    const totalFrames = DURATION * FPS;

    const animate = async () => {
      if (frame >= totalFrames) {
        recorder.stop();
        return;
      }
      await drawVideoFrame(ctx, artImg, angle);
      angle += radsPerFrame;
      frame++;
      setVideoProgress(Math.round((frame / totalFrames) * 95));
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, [audioUrl, artworkUrl, drawVideoFrame]);

  const stopRecording = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
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
          await navigator.share({
            files: [file], title,
            text: track ? `Listen to ${title} by ${track.artist_name} on Feelz Machine` : `Listen to ${title} on Feelz Machine`,
            url: shareUrl || window.location.href,
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
    link.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-feelzmachine.webm`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleShareVideo = async () => {
    if (!videoBlob) return;
    setSharing(true);
    try {
      const file = new File([videoBlob], `${title}-feelzmachine.webm`, { type: videoBlob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title,
          text: track ? `Listen to ${title} by ${track.artist_name} on Feelz Machine` : `Listen to ${title} on Feelz Machine`,
        });
      } else { handleDownloadVideo(); }
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
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="relative w-full max-w-sm mx-4 mb-6 md:mb-0 rounded-3xl overflow-hidden"
        style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)' }}
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

              <div className="rounded-2xl bg-white/[0.04] aspect-[9/16] flex flex-col items-center justify-center space-y-4 relative overflow-hidden">
                {!recording && !videoBlob && (
                  <>
                    <div className="w-20 h-20 rounded-full bg-purple-500/15 flex items-center justify-center">
                      <Film className="w-8 h-8 text-purple-400" />
                    </div>
                    <div className="text-center px-6">
                      <p className="text-sm font-semibold text-white mb-1">30-second Story video</p>
                      <p className="text-xs text-white/30">Spinning vinyl with your track audio — ready to share to Instagram Stories</p>
                    </div>
                  </>
                )}
                {recording && (
                  <>
                    <div className="w-16 h-16 relative">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#8B5CF6" strokeWidth="2"
                          strokeDasharray={`${videoProgress} 100`} strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">{videoProgress}%</span>
                    </div>
                    <p className="text-xs text-white/40">Rendering video...</p>
                  </>
                )}
                {videoBlob && !recording && (
                  <>
                    <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                      <Check className="w-8 h-8 text-green-400" />
                    </div>
                    <p className="text-sm font-semibold text-white">Video ready!</p>
                    <p className="text-xs text-white/30 text-center px-6">Share directly to Instagram Stories or save to camera roll</p>
                  </>
                )}
              </div>

              {!audioUrl && (
                <p className="text-[10px] text-amber-400/60 text-center">No audio on this track — video will be visual only</p>
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
              {!videoBlob && !recording && (
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
              {videoBlob && !recording && (
                <div className="flex space-x-3">
                  <button onClick={handleDownloadVideo}
                    className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] transition text-sm font-semibold text-white">
                    <Download className="w-4 h-4" /><span>Save</span>
                  </button>
                  <button onClick={handleShareVideo} disabled={sharing}
                    className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 transition disabled:opacity-30 text-sm font-semibold text-white">
                    {sharing ? <Loader className="w-4 h-4 animate-spin" /> : <><Share2 className="w-4 h-4" /><span>Share</span></>}
                  </button>
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

// ── Canvas helpers ─────────────────────────────────────────────────────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
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