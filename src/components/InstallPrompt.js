/**
 * InstallPrompt.js
 *
 * Shows platform-appropriate install guidance:
 *   - iOS Safari: "tap Share → Add to Home Screen" instruction card
 *   - Anywhere that fires beforeinstallprompt: a real install button.
 *     This used to be gated to Android Chrome, which meant desktop web
 *     never saw a prompt at all even though Chrome and Edge on desktop
 *     support installing perfectly well.
 *   - Already installed (standalone): nothing shown
 *
 * Dismissible, remembered in localStorage.
 *
 * Parameterised so Feelz Retail can use it too. Retail is a separate
 * product with its own manifest, icons and name, and it is the surface
 * that most wants installing since a venue runs it on a tablet all day.
 * The dismiss key differs per app on purpose: dismissing on the main app
 * must not silently hide it in retail.
 */

import React, { useState, useEffect } from 'react';
import { X, Share, Plus, Download } from 'lucide-react';

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

export default function InstallPrompt({
  appName     = 'Feelz Machine',
  iconSrc     = '/icon-192.png',
  storageKey  = 'install_prompt_dismissed',
  blurb       = 'Get push notifications and the full app experience.',
  positionClass = 'fixed bottom-24 left-4 right-4 z-50',
  // Show manual instructions when the browser never offers an automatic
  // install. Opt in, because on the main app a card that cannot be acted on
  // is a nag; on Retail it is the only route in. See the comment below.
  manualFallback = false,
} = {}) {
  const [show, setShow]           = useState(false);
  const [mode, setMode]           = useState(null); // 'ios' | 'prompt' | 'manual'
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (localStorage.getItem(storageKey)) return;

    if (isIOS()) {
      // Delay so it doesn't fire on first load
      const t = setTimeout(() => { setMode('ios'); setShow(true); }, 3000);
      return () => clearTimeout(t);
    }

    // Any browser that offers installation, not just Android Chrome.
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setMode('prompt');
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // WHY RETAIL NEVER GETS AN AUTOMATIC PROMPT ONCE THE MAIN APP IS INSTALLED
    //
    // Not a bug in this file, and not something useRetailManifest can fix.
    // manifest.json declares "scope": "/", so once Feelz Machine is installed
    // the browser treats EVERY page on this origin as already belonging to an
    // installed app — /retail/player included, because /retail is inside /.
    // beforeinstallprompt is suppressed for a page already covered by an
    // installed app, so the handler above simply never fires and the card
    // never appears. Uninstalling the main app makes it appear again, which is
    // exactly the "I can't get them separate" behaviour.
    //
    // The two real options are: serve Retail from its own origin, which is the
    // proper fix and a DNS and deploy change (retail.feelzmachine.com), or
    // tell the venue how to install it by hand. Chrome still allows the manual
    // install, because retail-manifest.json carries its own "id", so the menu
    // route works even when the prompt is suppressed. That is what this is.
    let timer = null;
    if (manualFallback) {
      timer = setTimeout(() => {
        setMode(m => (m ? m : 'manual'));
        setShow(s => s || true);
      }, 6000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      if (timer) clearTimeout(timer);
    };
  }, [storageKey, manualFallback]);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(storageKey, '1');
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    setDeferredPrompt(null);
  };

  if (!show) return null;

  return (
    <div className={`${positionClass} animate-in`}>
      <div className="relative bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-2xl">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition"
        >
          <X className="w-3.5 h-3.5 text-white/60" />
        </button>

        <div className="flex items-start space-x-3 pr-6">
          <img src={iconSrc} alt={appName} className="w-12 h-12 rounded-2xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white mb-0.5">Install {appName}</p>

            {mode === 'ios' && (
              <>
                <p className="text-xs text-white/40 mb-3">{blurb}</p>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Share className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <p className="text-xs text-white/60">
                      Tap the <span className="text-white font-medium">Share</span> button in Safari
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Plus className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <p className="text-xs text-white/60">
                      Tap <span className="text-white font-medium">Add to Home Screen</span>
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-white/20 mt-2">
                  Push notifications require iOS 16.4+ with the app added to your home screen.
                </p>
              </>
            )}

            {mode === 'prompt' && (
              <>
                <p className="text-xs text-white/40 mb-3">{blurb}</p>
                <button
                  onClick={install}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:bg-white/90 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install App</span>
                </button>
              </>
            )}

            {mode === 'manual' && (
              <>
                <p className="text-xs text-white/40 mb-3">{blurb}</p>
                <div className="flex items-start space-x-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <Download className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <p className="text-xs text-white/60">
                    Open the browser menu <span className="text-white font-medium">⋮</span> and choose{' '}
                    <span className="text-white font-medium">Install app</span> or{' '}
                    <span className="text-white font-medium">Add to Home screen</span>.
                  </p>
                </div>
                <p className="text-[10px] text-white/20 mt-2">
                  {appName} installs as its own app with its own icon, even if Feelz Machine
                  is already installed on this device.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}