/**
 * src/components/LiveStage.js
 *
 * The Feelz Machine live stage. Plays a YouTube live stream inside our own
 * player so it looks and behaves like part of the app:
 *
 *   - YouTube's own controls, title bar, logo, "watch on YouTube" link and
 *     "more videos" shelf are never shown or clickable. The iframe ignores all
 *     taps (pointer-events: none), its top and bottom edges are cropped away,
 *     and every control on screen is ours.
 *   - Pausing covers the video with our own screen, and when the stream ends
 *     the player is removed and our own end card shows, so YouTube never gets
 *     the chance to suggest other videos.
 *   - youtube-nocookie.com, so nothing is stored in the viewer's browser until
 *     the stream plays.
 *
 * Ads cannot be removed from our side: whether YouTube runs them is set on the
 * stream in YouTube Studio (monetisation off for the stream).
 *
 * Props:
 *   videoId     the 11 character YouTube id
 *   title       stream title, shown on the pause and end screens
 *   hostName    artist name
 *   hostImage   artist photo, used as the backdrop while loading or paused
 *   isHost      shows setup hints on error instead of a plain message
 *   overlay     anything to float over the video (reactions)
 *   topBar      the bar across the top of the stage (LIVE pill, viewers)
 *   replay      a past stream: starts paused, plays from the start, no live edge
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Radio, Loader } from 'lucide-react';

let apiPromise = null;

function loadYouTubeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error('YouTube player could not load')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const canFullscreen = () =>
  typeof document !== 'undefined' &&
  !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export default function LiveStage({ videoId, title, hostName, hostImage, isHost = false, overlay = null, topBar = null, replay = false }) {
  const wrapRef   = useRef(null);
  const mountRef  = useRef(null);
  const playerRef = useRef(null);
  const hideTimer = useRef(null);

  const [phase, setPhase]     = useState('loading'); // loading | playing | paused | ended | error
  const [muted, setMuted]     = useState(true);
  const [volume, setVolume]   = useState(80);
  const [errorCode, setErrorCode] = useState(null);
  const [isFull, setIsFull]   = useState(false);
  const [chrome, setChrome]   = useState(true);   // our controls showing

  // Build the player. A new id rebuilds it from scratch.
  useEffect(() => {
    if (!videoId) return undefined;
    let cancelled = false;
    setPhase('loading');
    setErrorCode(null);

    loadYouTubeApi().then((YT) => {
      if (cancelled || !mountRef.current) return;
      const target = document.createElement('div');
      mountRef.current.innerHTML = '';
      mountRef.current.appendChild(target);

      playerRef.current = new YT.Player(target, {
        host: 'https://www.youtube-nocookie.com',
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: replay ? 0 : 1,
          mute: replay ? 0 : 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          cc_load_policy: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            e.target.setVolume(80);
            if (replay) { setMuted(false); setPhase('paused'); return; }
            e.target.mute();
            e.target.playVideo();
          },
          onStateChange: (e) => {
            if (cancelled) return;
            const S = YT.PlayerState;
            if (e.data === S.PLAYING) setPhase('playing');
            else if (e.data === S.PAUSED) setPhase('paused');
            else if (e.data === S.ENDED) {
              setPhase('ended');
              // Stop the player so YouTube's end screen never shows.
              try { playerRef.current?.stopVideo(); } catch { /* gone already */ }
            }
          },
          onError: (e) => {
            if (cancelled) return;
            setErrorCode(e.data);
            setPhase('error');
          },
        },
      });
    }).catch(() => { if (!cancelled) setPhase('error'); });

    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch { /* already gone */ }
      playerRef.current = null;
    };
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fullscreen state follows the browser, so Esc works too.
  useEffect(() => {
    const onChange = () => setIsFull(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // Our controls fade away while the stream plays and come back on any touch.
  const wake = useCallback(() => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 3000);
  }, []);
  useEffect(() => {
    if (phase === 'playing') wake();
    else { clearTimeout(hideTimer.current); setChrome(true); }
    return () => clearTimeout(hideTimer.current);
  }, [phase, wake]);

  const p = () => playerRef.current;

  const togglePlay = () => {
    if (!p()) return;
    if (phase === 'playing') p().pauseVideo();
    else {
      // Back to the live edge, not where they paused. Replays carry on.
      if (!replay) { try { const d = p().getDuration(); if (d) p().seekTo(d, true); } catch { /* fine */ } }
      p().playVideo();
    }
  };

  const toggleMute = () => {
    if (!p()) return;
    if (muted) { p().unMute(); p().setVolume(volume || 80); setMuted(false); }
    else { p().mute(); setMuted(true); }
  };

  const changeVolume = (v) => {
    setVolume(v);
    if (!p()) return;
    p().setVolume(v);
    if (v === 0) { p().mute(); setMuted(true); }
    else if (muted) { p().unMute(); setMuted(false); }
  };

  const toggleFull = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  };

  const backdrop = hostImage ? (
    <img src={hostImage} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40" />
  ) : null;

  return (
    <div
      ref={wrapRef}
      className={`fm-live-stage relative w-full overflow-hidden bg-black select-none ${isFull ? '' : 'aspect-video'}`}
      style={isFull ? { width: '100%', height: '100%' } : undefined}
      onMouseMove={phase === 'playing' ? wake : undefined}
      onTouchStart={phase === 'playing' ? wake : undefined}
    >
      {/* The YouTube player. Taps never reach it. */}
      <div ref={mountRef} className="fm-live-frame absolute left-0 right-0" aria-hidden="true" />

      {/* Tap anywhere on the video to show the controls. */}
      <button type="button" aria-label="Show controls" onClick={wake}
        className="absolute inset-0 w-full h-full cursor-default" style={{ background: 'transparent' }} />

      {/* Loading */}
      {phase === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
          {backdrop}
          <div className="relative flex flex-col items-center gap-3">
            <div className="relative w-16 h-16">
              <div className="fm-live-ring absolute inset-0 rounded-full" />
              <div className="absolute inset-[3px] rounded-full bg-black flex items-center justify-center overflow-hidden">
                {hostImage ? <img src={hostImage} alt="" className="w-full h-full object-cover" /> : <Radio className="w-6 h-6 text-white/70" />}
              </div>
            </div>
            <p className="text-xs font-semibold text-white/70 flex items-center gap-2">
              <Loader className="w-3.5 h-3.5 animate-spin" /> Joining {hostName || 'the stream'}
            </p>
          </div>
        </div>
      )}

      {/* Paused: our screen covers the video completely. */}
      {phase === 'paused' && (
        <button type="button" onClick={togglePlay}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl">
          {backdrop}
          <span className="relative w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-[0_0_40px_rgba(236,72,153,0.5)]">
            <Play className="w-7 h-7 text-black ml-1" />
          </span>
          <span className="relative mt-3 text-sm font-bold text-white">{replay ? 'Watch the replay' : 'Back to live'}</span>
          {title && <span className="relative mt-1 text-xs text-white/50 max-w-[80%] truncate">{title}</span>}
        </button>
      )}

      {/* Ended */}
      {phase === 'ended' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center px-6">
          {backdrop}
          <p className="relative text-2xl font-black italic uppercase tracking-tight fm-live-gradient-text">That's a wrap</p>
          {replay ? (
            <button type="button" onClick={() => { try { p().seekTo(0, true); p().playVideo(); } catch { /* gone */ } }}
              className="relative mt-3 px-4 py-2 rounded-full bg-white text-black text-xs font-black">Watch again</button>
          ) : (
            <>
              <p className="relative mt-2 text-sm text-white/60">{hostName ? `${hostName} has ended the stream.` : 'The stream has ended.'}</p>
              <p className="relative mt-1 text-xs text-white/40">The chat stays open for a bit. Say thanks.</p>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center px-6">
          {backdrop}
          <Radio className="relative w-8 h-8 text-white/40 mb-3" />
          {isHost ? (
            <>
              <p className="relative text-sm font-bold text-white">This stream cannot play in Feelz Machine yet</p>
              <p className="relative mt-2 text-xs text-white/50 max-w-sm">
                {errorCode === 101 || errorCode === 150
                  ? 'In YouTube Studio, open the stream, then Edit, then turn on "Allow embedding".'
                  : 'Check the link is a live or upcoming stream and that it is Public or Unlisted.'}
              </p>
            </>
          ) : (
            <>
              <p className="relative text-sm font-bold text-white">The stream is not showing right now</p>
              <p className="relative mt-1 text-xs text-white/50">Stay in the chat. It will be back shortly.</p>
            </>
          )}
        </div>
      )}

      {/* Floating reactions */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">{overlay}</div>

      {/* Top bar */}
      {topBar && (
        <div className={`absolute top-0 left-0 right-0 transition-opacity duration-300 ${chrome || phase !== 'playing' ? 'opacity-100' : 'opacity-0'}`}>
          <div className="bg-gradient-to-b from-black/80 via-black/40 to-transparent px-3 pt-3 pb-8">{topBar}</div>
        </div>
      )}

      {/* Tap for sound */}
      {phase === 'playing' && muted && !replay && (
        <button type="button" onClick={toggleMute}
          className="fm-live-sound absolute left-1/2 -translate-x-1/2 bottom-14 sm:bottom-16 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-xs font-black tracking-wide shadow-[0_0_30px_rgba(236,72,153,0.55)]">
          <VolumeX className="w-4 h-4" /> TAP FOR SOUND
        </button>
      )}

      {/* Our controls */}
      {(phase === 'playing' || phase === 'paused') && (
        <div className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${chrome ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-10 flex items-center gap-2">
            <button type="button" onClick={togglePlay} aria-label={phase === 'playing' ? 'Pause' : 'Play'}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center transition">
              {phase === 'playing' ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
            </button>
            <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center transition">
              {muted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
            </button>
            <input type="range" min={0} max={100} value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volume"
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
        /* The iframe is taller than the stage and centred, so YouTube's
           title strip and logo sit in the cropped edges. It never takes
           taps: every control is ours. */
        .fm-live-frame { top: -64px; bottom: -64px; }
        .fm-live-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; border: 0; }
        .fm-live-ring { background: conic-gradient(from 0deg, #ec4899, #8b5cf6, #22d3ee, #f59e0b, #ec4899); animation: fm-live-spin 3s linear infinite; }
        .fm-live-gradient-text { background: linear-gradient(90deg, #f472b6, #a78bfa, #67e8f9); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .fm-live-sound { animation: fm-live-bob 1.6s ease-in-out infinite; }
        @keyframes fm-live-spin { to { transform: rotate(360deg); } }
        @keyframes fm-live-bob { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -4px); } }
        @media (prefers-reduced-motion: reduce) { .fm-live-ring, .fm-live-sound { animation: none; } }
      `}</style>
    </div>
  );
}
