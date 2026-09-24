// src/hooks/useScreenAwake.js
//
// Keeps the screen on while the full player is open.
//
// A phone dims and then locks after 30 seconds of no touches. With the player
// open and a song playing that is exactly what happens, so the artwork, the
// lyrics and the scrubber all go dark mid-song and you have to wake the phone
// to see what is playing.
//
// WHAT THIS IS, AND WHAT IT IS NOT
//
// The web has no way to set screen brightness. Nothing in a browser can turn a
// screen up or down; that is deliberate and it is not coming. What a browser
// CAN do is ask the system not to dim or lock in the first place, through the
// Screen Wake Lock API. So the screen stays at whatever brightness the person
// has it on, instead of fading out. That is the behaviour people mean when
// they ask for this.
//
// WHERE IT WORKS
//
//   Chrome, Edge and Samsung Internet on Android, and Safari 16.4 and up on
//   iOS. Everywhere else the request throws or the API is absent and the hook
//   quietly does nothing, which is exactly today's behaviour.
//   It also requires a secure context (https), which the app is on.
//
// WHY IT RE-REQUESTS ON VISIBILITY
//
// The system releases the lock whenever the tab is hidden or the phone is
// locked by the power button. Without the visibilitychange listener the screen
// would dim again on every return from a notification, and it would look like
// the feature works once and then stops.
//
// The lock is ALWAYS released when the player closes, on unmount and when the
// `active` flag goes false. Holding a wake lock on a page nobody is looking at
// is a battery complaint waiting to happen.

import { useEffect, useRef } from 'react';

export default function useScreenAwake(active) {
  const lockRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let cancelled = false;

    const request = async () => {
      // Requesting while the document is hidden throws, and there is no point
      // holding one then anyway.
      if (document.visibilityState !== 'visible') return;
      if (lockRef.current) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) { try { await lock.release(); } catch {} return; }
        lockRef.current = lock;
        // The system can drop it on its own, low battery being the usual
        // reason. Clearing the ref means the next visibility change asks again
        // rather than assuming we still hold one.
        lock.addEventListener('release', () => { lockRef.current = null; });
      } catch {
        // Not supported, blocked by policy, or the battery is too low. All
        // three mean the same thing here: carry on without it.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') request();
      else lockRef.current = null;   // the system already released it
    };

    request();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock) { try { lock.release(); } catch {} }
    };
  }, [active]);
}