// src/hooks/useRetailManifest.js
//
// Makes Feelz Retail install as its own app.
//
// index.html hardcodes <link rel="manifest" href="/manifest.json">, and a
// single-page app never reloads that document, so a venue installing from
// /retail/player was handed the Feelz Machine manifest: same id, same
// scope, same icons. The browser therefore treated both products as one
// installed app, which is why installing one appeared to install the other.
//
// public/retail-manifest.json already had the right shape (its own "id",
// scope "/retail", its own icons and name). Nothing was pointing at it.
//
// This mutates the existing link element rather than adding a second one.
// With two manifest links a browser uses the first and ignores the rest, so
// appending would have changed nothing.
//
// The swap must happen before the install prompt fires, which is why it runs
// on mount of the retail pages rather than at install time.

import { useEffect } from 'react';

const MAIN_MANIFEST   = '/manifest.json';
const RETAIL_MANIFEST = '/retail-manifest.json';

export default function useRetailManifest() {
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;

    const previous = link.getAttribute('href');
    link.setAttribute('href', RETAIL_MANIFEST);

    // apple-mobile-web-app-title drives the name iOS puts under the icon,
    // and iOS ignores the manifest for that.
    let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    const previousAppleTitle = appleTitle?.getAttribute('content');
    if (!appleTitle) {
      appleTitle = document.createElement('meta');
      appleTitle.setAttribute('name', 'apple-mobile-web-app-title');
      document.head.appendChild(appleTitle);
    }
    appleTitle.setAttribute('content', 'Feelz Retail');

    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    const previousAppleIcon = appleIcon?.getAttribute('href');
    if (appleIcon) appleIcon.setAttribute('href', '/retail-icon-192.png');

    return () => {
      // Restore on the way out, so navigating from retail back into the main
      // app in the same session does not leave the wrong manifest in place.
      link.setAttribute('href', previous || MAIN_MANIFEST);
      if (previousAppleTitle) appleTitle.setAttribute('content', previousAppleTitle);
      if (appleIcon && previousAppleIcon) appleIcon.setAttribute('href', previousAppleIcon);
    };
  }, []);
}