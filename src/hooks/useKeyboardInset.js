// src/hooks/useKeyboardInset.js
//
// How much of the screen the on-screen keyboard is covering.
//
//
// WHY A HOOK AND NOT JUST CSS
//
// `height: 100dvh` is supposed to handle this, and on iOS it mostly does. On
// Android Chrome it does not, because of a default nobody sets deliberately:
//
//     <meta name="viewport" content="width=device-width, initial-scale=1" />
//
// With no `interactive-widget` value, Chrome uses `resizes-visual`. The LAYOUT
// viewport stays the full height of the screen when the keyboard opens; only
// the VISUAL viewport shrinks, and the browser scrolls it to bring the focused
// input into view. So 100dvh is still the whole screen, the composer is still
// laid out below the keyboard, and what the user sees is the browser's own
// scroll guess. That is the jitter: the composer lands in a slightly different
// place each time, sometimes with its top row clipped.
//
// public/index.html now asks for `interactive-widget=resizes-content`, which
// makes Chrome shrink the layout viewport and fixes it properly. This hook is
// the belt to that pair of braces: older Chrome, Android WebView and every iOS
// version ignore the meta value, and there the measurement is the only way to
// know.
//
// TrackCommentSheet.js has had a private copy of this logic for a while and it
// works. This is that, lifted out so the chat room and anything else with a
// bottom-anchored input can use the same one rather than each growing its own
// slightly different version.
//
//
// WHAT IT RETURNS
//
// The number of CSS pixels covered at the bottom. 0 when the keyboard is
// closed, when visualViewport is unavailable, or when the browser resizes the
// layout viewport itself (in which case the layout has already handled it and
// adding padding on top would push the composer up twice).

import { useState, useEffect, useRef } from 'react';

/**
 * Is the on-screen keyboard open?
 *
 * A DIFFERENT QUESTION FROM THE ONE BELOW, and it needs a different measurement.
 *
 * useKeyboardInset asks "how much is covered that the layout does not already
 * know about", so it correctly returns 0 under `interactive-widget=
 * resizes-content`: the layout viewport already shrank and there is nothing to
 * compensate for.
 *
 * "Is the keyboard open" is not that. MobileNav used the same shape of sum to
 * answer it:
 *
 *     vv.height / window.innerHeight < 0.8
 *
 * Under resizes-content BOTH heights shrink together, so that ratio stays near
 * 1 and the nav concludes the keyboard is closed — while sitting directly on
 * top of it, eating 64px of an already short screen and pushing every comment
 * composer 64px further from the keyboard than it should be.
 *
 * The signal that holds in both modes is the visual viewport's height compared
 * against the tallest it has been. The visual viewport always shrinks when a
 * keyboard appears, whichever mode is in force; it is only `window.innerHeight`
 * that behaves differently. The tallest-seen value is reset on an orientation
 * change, because it is a different number in landscape.
 */
export function useKeyboardOpen(threshold = 120) {
  const [open, setOpen] = useState(false);
  const tallest = useRef(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let frame = null;

    const measure = () => {
      frame = null;
      const h = vv.height;
      if (h > tallest.current) tallest.current = h;
      setOpen(tallest.current - h > threshold);
    };

    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };

    const reset = () => {
      // The tallest height in portrait means nothing in landscape, and keeping
      // it would leave the nav hidden for as long as the phone stays turned.
      tallest.current = 0;
      schedule();
    };

    measure();
    vv.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', reset);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', reset);
    };
  }, [threshold]);

  return open;
}

export default function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let frame = null;

    const measure = () => {
      frame = null;
      // window.innerHeight is the LAYOUT viewport. vv.height is what is
      // actually visible. The difference, minus how far the visual viewport has
      // been scrolled down, is what the keyboard is covering.
      const covered = window.innerHeight - vv.height - vv.offsetTop;

      // Under 80px is browser chrome appearing and disappearing, not a
      // keyboard. Treating that as a keyboard makes the composer twitch on
      // every scroll, which is the complaint this is meant to fix.
      setInset(covered > 80 ? Math.round(covered) : 0);
    };

    // Coalesced into a frame: resize and scroll both fire in bursts while the
    // keyboard animates, and setting state on every one of them is what makes
    // the bar visibly chase the keyboard instead of arriving with it.
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };

    measure();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    window.addEventListener('orientationchange', schedule);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, []);

  return inset;
}