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


// ── Where did they come from ─────────────────────────────────────────────────
//
// projectfeelz.com puts ?ref=plugin-gallery on every link it sends here, and
// that is the whole mechanism. The gallery does not have to call us, there is
// no cross-site request and no CORS: the visitor arrives holding the receipt.
//
// Recorded ONCE per browser session. Somebody who opens four plugin pages and
// clicks through from each is one arrival, which is the number worth having.
// sessionStorage rather than localStorage on purpose, so coming back next week
// counts again.
//
// Deliberately in index.js and not in the router. It has to run on the very
// first paint whatever page they land on, and this file is the only thing that
// always does.
//
// The source is allow-listed. ?ref= is a public query parameter that anybody
// can put anything into, and an open one would let a stranger write arbitrary
// rows into app_events just by sending people a link.
if (typeof window !== 'undefined') {
  const KNOWN_SOURCES = ['plugin-gallery', 'studio-assistant', 'pjf-blog', 'pjf-store'];
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && KNOWN_SOURCES.includes(ref)) {
      const seenKey = `fm_ref_${ref}`;
      if (!sessionStorage.getItem(seenKey)) {
        sessionStorage.setItem(seenKey, '1');
        // Imported lazily so analytics is never on the critical path of the
        // first render, and a failure to load it cannot stop the app booting.
        import('./utils/track')
          .then(({ referral }) => referral(ref, window.location.pathname))
          .catch(() => {});
      }
    }
  } catch {
    // Private mode, blocked storage, a malformed URL. None of it is worth a
    // broken page.
  }
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