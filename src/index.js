import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AppRouter from './AppRouter';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);

// ── Service Worker Registration ───────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', {
        // updateViaCache: 'none' tells the browser to NEVER use the HTTP cache
        // when fetching the service-worker.js file itself.
        // This is the primary fix for iPhone/Safari stale SW — Safari was caching
        // the SW file for up to 24hrs, so new deploys weren't picked up.
        updateViaCache: 'none',
      })
      .then(reg => {
        console.log('[SW] Registered:', reg.scope);

        // Check for updates every time the page gains focus
        // (catches the case where user leaves app open for hours)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => {});
          }
        });

        // Also check for updates every 60 seconds while the app is open
        setInterval(() => {
          reg.update().catch(() => {});
        }, 60 * 1000);

        // If a new SW is waiting (downloaded but not yet active), activate it now.
        // This handles the case where the user had the app open during a deploy.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // When a new SW finishes installing and enters the waiting state,
        // tell it to skip waiting and take over immediately.
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New SW is ready — activate it immediately
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(err => console.warn('[SW] Registration failed:', err));

    // When the SW controller changes (new SW took over), reload the page
    // so the user gets the fresh assets. The SW posts SW_UPDATED first,
    // but this is the hard fallback that guarantees a clean reload.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    // Listen for the SW_UPDATED message (sent by the SW on activate)
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SW_UPDATED') {
        console.log('[SW] New version active:', e.data.version);
      }
    });
  });
}


// ── Horizontal rows scroll with a normal mouse wheel ─────────────────────────
//
// Scrollbars are hidden site-wide, which is right on touch and wrong on a
// desktop mouse: rows like "New to you" in Library, the Home carousels and
// Browse had no way to reach the content past the fold. A trackpad can swipe
// sideways, a mouse wheel cannot.
//
// One global listener instead of touching all 47 rows. Vertical wheel input
// over a horizontally scrollable element moves it sideways.
//
// It only takes over while that row still has somewhere to go in the
// direction you are scrolling. At either end the event passes through and the
// page scrolls normally, so a row can never trap you on the way down a page.
// Shift-wheel is left alone since browsers already map it to horizontal.
if (typeof window !== 'undefined') {
  window.addEventListener('wheel', (e) => {
    if (e.shiftKey || e.ctrlKey) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;

    const row = e.target?.closest?.('.overflow-x-auto, .overflow-x-scroll');
    if (!row) return;

    const maxScroll = row.scrollWidth - row.clientWidth;
    if (maxScroll <= 1) return;

    const atStart = row.scrollLeft <= 0;
    const atEnd   = row.scrollLeft >= maxScroll - 1;
    if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;

    row.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
}