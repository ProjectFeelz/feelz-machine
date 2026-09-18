// src/hooks/useGoBack.js
//
// A back button that always goes somewhere.
//
//
// THE PROBLEM
//
// Thirty-five back buttons across the app call `navigate(-1)` with nothing
// behind it. That works when the person arrived by tapping through the app. It
// does NOTHING when this page is the first entry in the history stack, and that
// is the common case for exactly the pages people share:
//
//   * a track or album link opened from WhatsApp or Instagram
//   * a push notification tapped from the lock screen
//   * the PWA launched straight onto a route
//   * a bookmark, or a page reopened from browser history
//
// In all of those the person lands on, say, /track/isandla-sami, taps the arrow
// in the corner, and nothing happens. The arrow looks broken because it is.
//
//
// WHY location.key AND NOT history.length
//
// `window.history.length > 1` is the usual workaround and it is wrong often
// enough to matter: it counts the whole TAB's history, including every page
// visited before this site was opened. Someone who browsed three other sites
// and then opened a shared track link has history.length of 4, so the check
// passes, `navigate(-1)` fires, and it takes them OUT of Feelz Machine
// entirely.
//
// React Router gives the honest answer. Every location it pushes gets a
// generated key; the entry the app was loaded on has the key 'default'. So
// key === 'default' means "there is no in-app history behind this", which is
// the actual question.
//
//
// USE
//
//   const goBack = useGoBack('/browse');
//   <button onClick={goBack}>
//
// The fallback is where a person with no history should land, and it should be
// the natural parent of the page, not the home screen: a track goes to browse,
// an admin screen to the admin dashboard, a retail page to retail.

import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    if (location.key && location.key !== 'default') {
      navigate(-1);
    } else {
      // `replace`, so the dead first entry is not left in the stack for the
      // person to bounce off if they press back again.
      navigate(fallback, { replace: true });
    }
  }, [navigate, location.key, fallback]);
}