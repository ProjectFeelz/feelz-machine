// src/utils/askNotificationPermission.js
//
// Browsers give you exactly one chance at the notification prompt. If it's
// denied it stays denied, and the user has to dig into site settings to
// undo it. So the ask has to land at a moment where it obviously connects
// to something the person just chose to do.
//
// The rule here: only ever ask immediately after a real signal of intent
// (following an artist, liking a track). Never on page load, never on a
// timer, never more than once per session.

let askedThisSession = false;

/**
 * Ask for notification permission after a positive user action.
 * Safe to call from anywhere: it no-ops unless conditions are right.
 *
 * @param {Object} opts
 * @param {Function} [opts.onGranted] called if the user allows notifications
 * @param {number}   [opts.delayMs]   small delay so the prompt follows the
 *                                    action's own UI feedback rather than
 *                                    interrupting it
 */
export function askNotificationPermission({ onGranted, delayMs = 900 } = {}) {
  try {
    if (typeof Notification === 'undefined') return;
    // 'granted' means we already have it; 'denied' is permanent and asking
    // again does nothing except in some browsers count against us.
    if (Notification.permission !== 'default') return;
    if (askedThisSession) return;
    askedThisSession = true;

    setTimeout(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted' && typeof onGranted === 'function') {
          onGranted();
        }
      } catch { /* browser refused to show the prompt; nothing to do */ }
    }, delayMs);
  } catch { /* Notification unavailable */ }
}