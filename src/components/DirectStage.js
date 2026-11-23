/**
 * src/components/DirectStage.js
 *
 * The stage for direct streams (Cloudflare Stream): plays the HLS feed in our
 * own player with the same look and controls as LiveStage, so a viewer cannot
 * tell which kind of stream they are watching. Safari plays HLS on its own;
 * everywhere else hls.js is loaded the first time it is needed.
 *
 * Props:
 *   src        the .m3u8 address (live input or recording)
 *   onAir      for a live stream: whether the host is sending video yet
 *   replay     a recording: starts paused, plays from the start
 *   onTime     replays only: called with the video position in seconds
 *   poster     image shown before playing
 *   hostName, hostImage, title, overlay, topBar   as LiveStage
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Radio, Loader } from 'lucide-react';

const HLS_JS = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
let hlsPromise = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsPromise) return hlsPromise;
  hlsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HLS_JS; s.async = true;
    s.onload = () => resolve(window.Hls);
    s.onerror = () => { hlsPromise = null; reject(new Error('player could not load')); };
    document.head.appendChild(s);
  });
  return hlsPromise;
}

const canFullscreen = () => typeof document !== 'undefined' && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };

export default function DirectStage({ src, onAir = true, replay = false, poster, hostName, hostImage, title, overlay = null, topBar = null, onTime = null }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const hideTimer = useRef(null);
  const [phase, setPhase] = useState('loading'); // loading | playing | paused | waiting | error
  const [muted, setMuted] = useState(!replay);
  const [volume, setVolume] = useState(0.8);
  const [isFull, setIsFull] = useState(false);
  const [chrome, setChrome] = useState(true);
  // Replays: where the video is and how long it is, for the seek bar.
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  // Replays report where the video is, so the chat, reactions and tips can
  // come back in at the moment they happened.
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;
  useEffect(() => {
    if (!replay || !onTime) return undefined;
    const t = setInterval(() => {
      try { const s = videoRef.current?.currentTime; if (typeof s === 'number' && !Number.isNaN(s)) onTimeRef.current?.(s); } catch { /* not ready */ }
    }, 500);
    return () => clearInterval(t);
  }, [replay, !!onTime]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    if (!src || !onAir) { setPhase('waiting'); return undefined; }
    let cancelled = false;
    setPhase('loading');
    v.muted = !replay;
    const start = () => {
      if (replay) { setPhase('paused'); return; }
      v.play().then(() => !cancelled && setPhase('playing')).catch(() => !cancelled && setPhase('paused'));
    };
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src;
      v.addEventListener('loadedmetadata', start, { once: true });
    } else {
      loadHls().then((Hls) => {
        if (cancelled) return;
        if (!Hls.isSupported()) { setPhase('error'); return; }
        const hls = new Hls({ lowLatencyMode: !replay, liveSyncDurationCount: 3 });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, start);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { setPhase('waiting'); setTimeout(() => hls.startLoad(), 4000); }
          else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          else setPhase('error');
        });
        hls.loadSource(src);
        hls.attachMedia(v);
      }).catch(() => !cancelled && setPhase('error'));
    }
    const onPlay = () => setPhase('playing');
    const onPause = () => setPhase(p => (p === 'loading' ? p : 'paused'));
    v.addEventListener('playing', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      cancelled = true;
      v.removeEventListener('playing', onPlay);
      v.removeEventListener('pause', onPause);
      try { hlsRef.current?.destroy(); } catch { /* gone */ }
      hlsRef.current = null;
    };
  }, [src, onAir, replay]);

  useEffect(() => {
    const onChange = () => setIsFull(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const wake = useCallback(() => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 3000);
  }, []);
  useEffect(() => {
    if (phase === 'playing') wake(); else { clearTimeout(hideTimer.current); setChrome(true); }
    return () => clearTimeout(hideTimer.current);
  }, [phase, wake]);

  useEffect(() => {
    const el = videoRef.current;
    if (!replay || !el) return undefined;
    const tick = () => { setPos(el.currentTime || 0); if (Number.isFinite(el.duration)) setDur(el.duration || 0); };
    el.addEventListener('timeupdate', tick); el.addEventListener('durationchange', tick); el.addEventListener('loadedmetadata', tick);
    return () => { el.removeEventListener('timeupdate', tick); el.removeEventListener('durationchange', tick); el.removeEventListener('loadedmetadata', tick); };
  }, [replay, src]);
  const v = () => videoRef.current;
  const togglePlay = () => {
    if (!v()) return;
    if (phase === 'playing') { v().pause(); return; }
    // Live: back to the live edge.
    if (!replay && hlsRef.current?.liveSyncPosition) v().currentTime = hlsRef.current.liveSyncPosition;
    v().play().catch(() => {});
  };
  const seekTo = (t) => { if (!v()) return; const d = Number.isFinite(v().duration) ? v().duration : dur; v().currentTime = Math.max(0, Math.min(d || t, t)); setPos(v().currentTime); wake(); };
  const seekBy = (d) => { if (v()) seekTo((v().currentTime || 0) + d); };
  const toggleMute = () => { if (!v()) return; v().muted = !muted; if (!v().muted) v().volume = volume || 0.8; setMuted(!muted); };
  const changeVolume = (n) => { setVolume(n); if (!v()) return; v().volume = n; v().muted = n === 0; setMuted(n === 0); };
  const toggleFull = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  };

  const backdrop = hostImage ? <img src={hostImage} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40" /> : null;

  return (
    <div ref={wrapRef}
      className={`relative w-full overflow-hidden bg-black select-none ${isFull ? '' : 'aspect-video'}`}
      style={isFull ? { width: '100%', height: '100%' } : undefined}
      onMouseMove={phase === 'playing' ? wake : undefined}
      onTouchStart={phase === 'playing' ? wake : undefined}>
      <video ref={videoRef} playsInline poster={poster || undefined} className="absolute inset-0 w-full h-full object-contain bg-black" />
      <button type="button" aria-label="Show controls" onClick={wake} className="absolute inset-0 w-full h-full cursor-default" style={{ background: 'transparent' }} />

      {(phase === 'loading' || phase === 'waiting') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center px-6">
          {backdrop}
          <div className="relative w-16 h-16 mb-3">
            <div className="absolute inset-0 rounded-full fm-direct-ring" />
            <div className="absolute inset-[3px] rounded-full bg-black flex items-center justify-center overflow-hidden">
              {hostImage ? <img src={hostImage} alt="" className="w-full h-full object-cover" /> : <Radio className="w-6 h-6 text-white/70" />}
            </div>
          </div>
          <p className="relative text-sm font-bold text-white/80 flex items-center gap-2">
            {phase === 'loading'
              ? <><Loader className="w-4 h-4 animate-spin" /> Joining {hostName || 'the stream'}</>
              : (replay ? 'The replay is being prepared. Check back in a minute.' : `Waiting for ${hostName || 'the host'} to start the video`)}
          </p>
        </div>
      )}

      {phase === 'paused' && (
        <button type="button" onClick={togglePlay} className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <span className="relative w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-[0_0_40px_rgba(236,72,153,0.5)]">
            <Play className="w-7 h-7 text-black ml-1" />
          </span>
          <span className="relative mt-3 text-sm font-bold text-white">{replay ? 'Watch the replay' : 'Back to live'}</span>
          {title && <span className="relative mt-1 text-xs text-white/50 max-w-[80%] truncate">{title}</span>}
        </button>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center px-6">
          {backdrop}
          <p className="relative text-sm font-bold text-white">The stream is not showing right now</p>
          <p className="relative mt-1 text-xs text-white/50">Stay in the chat. It will be back shortly.</p>
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none overflow-hidden">{overlay}</div>

      {topBar && (
        <div className={`absolute top-0 left-0 right-0 transition-opacity duration-300 ${chrome || phase !== 'playing' ? 'opacity-100' : 'opacity-0'}`}>
          <div className="bg-gradient-to-b from-black/80 via-black/40 to-transparent px-3 pt-3 pb-8">{topBar}</div>
        </div>
      )}

      {phase === 'playing' && muted && !replay && (
        <button type="button" onClick={toggleMute}
          className="absolute left-1/2 -translate-x-1/2 bottom-14 sm:bottom-16 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-xs font-black tracking-wide shadow-[0_0_30px_rgba(236,72,153,0.55)]">
          <VolumeX className="w-4 h-4" /> TAP FOR SOUND
        </button>
      )}

      {(phase === 'playing' || phase === 'paused') && (
        <div className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${chrome ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {replay && dur > 0 && (
            <div className="bg-gradient-to-t from-black/85 to-black/60 px-3 pt-6 flex items-center gap-2 text-[11px] font-bold text-white/80 tabular-nums">
              <button type="button" onClick={() => seekBy(-10)} aria-label="Back 10 seconds"
                className="px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white">-10s</button>
              <span>{clock(pos)}</span>
              <input type="range" min={0} max={dur} step={1} value={Math.min(pos, dur)}
                onChange={(e) => seekTo(Number(e.target.value))} aria-label="Seek"
                className="flex-1 accent-pink-500" />
              <span>{clock(dur)}</span>
              <button type="button" onClick={() => seekBy(10)} aria-label="Forward 10 seconds"
                className="px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white">+10s</button>
            </div>
          )}
          <div className={`${replay && dur > 0 ? 'bg-black/60 pt-2' : 'bg-gradient-to-t from-black/85 to-transparent pt-10'} px-3 pb-3 flex items-center gap-2`}>
            <button type="button" onClick={togglePlay} aria-label={phase === 'playing' ? 'Pause' : 'Play'}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center transition">
              {phase === 'playing' ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
            </button>
            <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center transition">
              {muted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))} aria-label="Volume"
              className="hidden sm:block w-24 accent-pink-500" />
            <span className="flex-1" />
            {canFullscreen() && (
              <button type="button" onClick={toggleFull} aria-label={isFull ? 'Exit full screen' : 'Full screen'}
                className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center transition">
                {isFull ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4 text-white" />}
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        .fm-direct-ring { background: conic-gradient(from 0deg, #ec4899, #8b5cf6, #22d3ee, #f59e0b, #ec4899); animation: fm-direct-spin 3s linear infinite; }
        @keyframes fm-direct-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .fm-direct-ring { animation: none; } }
      `}</style>
    </div>
  );
}
