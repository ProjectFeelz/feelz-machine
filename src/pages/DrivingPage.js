// src/pages/DrivingPage.js
//
// The screen for a phone clamped to a dashboard.
//
//
// WHAT THIS IS FOR
//
// The full player is a good screen to look at. It is a bad screen to use at
// 120km/h. The controls are around 40 to 56 pixels, the track title is 14
// pixels, half the surface does something when you touch it, and a glance that
// should cost a fifth of a second costs two while you find the right target.
//
// So this is the same four things the full player does, at a size you can hit
// without aiming and read without focusing. Nothing else is on it. No queue,
// no lyrics, no like button, no share. Everything that is not one of those
// four things is a reason to look down for longer.
//
//
// THE RULES IT IS BUILT TO
//
//   Nothing smaller than 96px square, which is roughly a thumb pressed flat
//   against glass in a moving car, and well past the 44px that interface
//   guidelines call a minimum for a person sitting still.
//
//   Nothing smaller than 22px of text, and the title is far larger than that.
//   No secondary text, no timestamps, no counts.
//
//   White on black. Not because it is the house style, though it is, but
//   because at a glance in daylight the only thing that survives is contrast,
//   and pure white on pure black is as far as a screen goes. Everything on
//   this page is 21:1 against its background.
//
//   No gesture does anything. No swipe, no long press, no double tap. A
//   gesture is a thing you have to remember and aim, and a mis-aimed gesture
//   in a car is a driver looking down to find out what just happened.
//
//   Exit is deliberately the smallest target on the page and sits alone in a
//   corner. Leaving by accident is the one mistake here with a real cost.
//
//
// WHAT IT IS NOT
//
// It is not CarPlay or Android Auto, and it cannot be. Both of those need a
// native app: CarPlay needs an audio entitlement from Apple, Android Auto
// needs a MediaBrowserService inside an Android package, and neither is
// reachable from a web app on any browser. This is the honest version of the
// same idea, on the screen we do have.
//
// The steering wheel buttons still work while this is open, because they go
// through the Media Session API and that is running regardless. See
// src/hooks/useMediaSession.js.

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Play, Pause, SkipBack, SkipForward, X } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import useScreenAwake from '../hooks/useScreenAwake';
import { coverUrl } from '../utils/coverUrl';

// A thumb against glass in a moving car. The 44px in the interface guidelines
// assumes a person sitting still, looking at what they are pressing.
//
// Three terms, and all three are load bearing. The pixel value is the size
// worth having. The vw term keeps the row from running off the sides of a
// narrow phone. The vh term is the one that is easy to forget: a phone in a
// dash mount is usually on its side, and 390 pixels of height has to hold the
// artwork, the title, the bar and this row without anything landing on top of
// anything else. Sizing to width alone looks right in portrait and collapses
// in landscape, which is the orientation this screen is actually for.
const TAP         = 'min(104px, 22vw, 24vh)';
const TAP_PRIMARY = 'min(140px, 30vw, 32vh)';

function Control({ onClick, label, size = TAP, children, primary = false }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex items-center justify-center rounded-full flex-shrink-0 transition active:scale-95 ${
        primary ? 'bg-white text-black' : 'bg-white/[0.14] text-white'
      }`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      {children}
    </button>
  );
}

export default function DrivingPage() {
  const navigate = useNavigate();
  const { currentTrack, isPlaying, togglePlay, playNext, playPrev, currentTime, duration, setDrivingMode } = usePlayer();

  // The whole point is a screen that stays lit on a dashboard. Without this it
  // sleeps after thirty seconds and the driver reaches over to wake it, which
  // is the exact thing this page exists to avoid.
  useScreenAwake(true);

  // Tell the player this phone has one job for as long as this screen is open.
  // It claims the speakers and tries harder to get them back after a call or
  // something else that grabs the audio. Always turned off on the way out,
  // including when the driver leaves by the back button, because none of that
  // is behaviour anyone wants following them around the rest of the app.
  useEffect(() => {
    setDrivingMode?.(true);
    return () => setDrivingMode?.(false);
  }, [setDrivingMode]);

  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  if (!currentTrack) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center gap-8 px-8">
        <Helmet><title>Driving</title><meta name="robots" content="noindex" /></Helmet>
        <p className="text-white text-3xl font-bold text-center leading-snug">Nothing is playing</p>
        <button
          onClick={() => navigate(-1)}
          className="px-10 rounded-full bg-white text-black text-2xl font-bold"
          style={{ height: TAP }}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <Helmet>
        <title>Driving</title>
        <meta name="robots" content="noindex, nofollow" />
        {/* Black all the way to the edges, including behind the notch. On a
            dashboard a grey status bar strip reads as the screen having gone
            wrong. */}
        <meta name="theme-color" content="#000000" />
      </Helmet>

      {/* Exit. Small on purpose and alone in the corner: everything else here
          is built to be hit without looking, and this is the one control where
          that would be a problem. */}
      <div className="flex justify-end px-4 pt-[max(env(safe-area-inset-top,0px),12px)] landscape:pt-[max(env(safe-area-inset-top,0px),8px)] flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          aria-label="Leave driving mode"
          className="w-14 h-14 landscape:w-12 landscape:h-12 flex items-center justify-center rounded-full bg-white/[0.08] text-white/50"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* ── What is playing ── */}
      {/* Portrait stacks the art above the words. Landscape, which is how most
          dash mounts hold a phone, puts them side by side so the text keeps its
          size instead of being squeezed into a strip. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col landscape:flex-row items-center justify-center gap-5 landscape:gap-8 px-6 landscape:px-10">
        {/* Landscape gets a much smaller square, because in landscape the
            height is the scarce thing and the artwork is the one element here
            that nobody needs to see in order to drive. */}
        <img
          src={coverUrl(currentTrack.cover_artwork_url, 700)}
          alt=""
          className="rounded-3xl object-cover bg-white/[0.06] flex-shrink-0
                     w-[min(46vh,70vw)] h-[min(46vh,70vw)]
                     landscape:w-[min(30vh,26vw)] landscape:h-[min(30vh,26vw)]"
        />

        <div className="min-w-0 w-full landscape:flex-1 text-center landscape:text-left">
          {/* Two lines maximum, then it stops. A title that wraps to four
              lines pushes the controls off the bottom of the screen, and the
              third line was never going to be read at a glance anyway. */}
          <p
            className="text-white font-black leading-tight break-words"
            style={{ fontSize: 'clamp(30px, 6.2vw, 58px)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {currentTrack.title}
          </p>
          <p
            className="text-white/70 font-semibold mt-2 truncate"
            style={{ fontSize: 'clamp(22px, 3.8vw, 34px)' }}
          >
            {currentTrack.artist_name}
          </p>
        </div>
      </div>

      {/* ── How far through ── */}
      {/* Shown, not touchable. Scrubbing needs precision, precision needs
          looking, and there is nothing on this bar worth looking at for as
          long as that takes. No numbers either: a clock face is a thing you
          read, and this only has to be a thing you notice. */}
      <div className="px-8 landscape:px-10 pt-3 landscape:pt-1 pb-1 flex-shrink-0">
        <div className="h-2.5 w-full rounded-full bg-white/15 overflow-hidden">
          <div className="h-full bg-white rounded-full transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── The four things ── */}
      <div
        className="flex items-center justify-center gap-4 sm:gap-8 px-4 pt-3 landscape:pt-2 flex-shrink-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)' }}
      >
        {/* The icons scale with their buttons for the same reason the buttons
            scale with the screen: a fixed 46px glyph inside an 80px circle on
            a small phone stops looking like a control and starts looking like
            a mistake. */}
        <Control onClick={playPrev} label="Previous track">
          <SkipBack style={{ width: '42%', height: '42%' }} fill="currentColor" />
        </Control>

        <Control onClick={togglePlay} label={isPlaying ? 'Pause' : 'Play'} size={TAP_PRIMARY} primary>
          {isPlaying
            ? <Pause style={{ width: '42%', height: '42%' }} fill="currentColor" />
            : <Play  style={{ width: '42%', height: '42%', marginLeft: '4%' }} fill="currentColor" />}
        </Control>

        <Control onClick={playNext} label="Next track">
          <SkipForward style={{ width: '42%', height: '42%' }} fill="currentColor" />
        </Control>
      </div>
    </div>
  );
}