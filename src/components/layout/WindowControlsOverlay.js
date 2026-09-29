// src/components/layout/WindowControlsOverlay.js
//
// The installed desktop app's title bar, drawn by us instead of by Chrome.
//
// WHAT THIS ACTUALLY DOES
//
// A PWA in "standalone" mode gets a Chrome-drawn strip across the top holding
// the page title, a back caret, the extensions icon and the three dot menu,
// and then the system minimize, maximize and close buttons. Window Controls
// Overlay hands that strip to the app. The three system buttons stay, because
// they belong to the operating system and no web app can remove them, but
// everything else becomes ours.
//
// WHY THE MANIFEST ALONE WAS NOT ENOUGH
//
// public/manifest.json has listed window-controls-overlay in display_override
// for a while, which is the half that asks for the strip. Without the CSS half
// the app simply paints from y=0 with no idea the buttons are there, so the
// sidebar and whatever is in the top right of the page end up underneath them.
// That is why this ships as a component and a block of CSS together, and why
// turning the manifest line on without them would have looked broken.
//
// ── THE GEOMETRY, WHICH IS THE PART THAT BITES ──────────────────────────────
//
// env(titlebar-area-x/y/width/height) describe the part of the strip that is
// SAFE to draw in, not the whole strip. On Windows the buttons sit right, so x
// is 0 and width stops short of the window edge. On a Mac the traffic lights
// sit left, so x is the width of those lights and the safe area starts after
// them. Using left:0 and width:100% would put our content under the buttons on
// one platform and be fine on the other, which is exactly the sort of bug that
// only shows up on the machine you do not own.
//
// Those variables exist ONLY while the overlay is on. Everywhere else they are
// undefined and the fallbacks apply, which is why --fm-titlebar is 0px outside
// the media query and nothing about the normal layout shifts.
//
// The whole strip is a drag region so the window can still be moved. Anything
// clickable inside it has to opt back out with no-drag, or it becomes part of
// the handle and stops responding to clicks.

import React from 'react';

const QUERY = '(display-mode: window-controls-overlay)';

export default function WindowControlsOverlay() {
  const [on, setOn] = React.useState(() => {
    try { return window.matchMedia(QUERY).matches; } catch { return false; }
  });

  React.useEffect(() => {
    let mq;
    try { mq = window.matchMedia(QUERY); } catch { return undefined; }
    const sync = () => setOn(mq.matches);

    // Two listeners, because the overlay can be turned on and off from the
    // app's own menu while it is running. The media query fires on that, and
    // geometrychange fires when the window is resized or the buttons move,
    // which also changes how much room we have.
    mq.addEventListener?.('change', sync);
    const wco = navigator.windowControlsOverlay;
    wco?.addEventListener?.('geometrychange', sync);

    return () => {
      mq.removeEventListener?.('change', sync);
      wco?.removeEventListener?.('geometrychange', sync);
    };
  }, []);

  if (!on) return null;

  return (
    <div className="fm-titlebar" role="presentation">
      <span className="fm-titlebar-mark">FM</span>
      <span className="fm-titlebar-name">Feelz Machine</span>
    </div>
  );
}