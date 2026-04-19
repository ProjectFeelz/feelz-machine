/**
 * InstallPrompt.js
 *
 * Shows platform-appropriate install guidance:
 *   - iOS Safari: "tap Share → Add to Home Screen" instruction card
 *   - Android Chrome: uses the beforeinstallprompt event for native banner
 *   - Already installed (standalone): nothing shown
 *
 * Shown once per session, dismissible, stored in localStorage.
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

function isAndroidChrome() {
  return /android/i.test(navigator.userAgent) && /chrome/i.test(navigator.userAgent);
}

export default function InstallPrompt() {
  const [show, setShow]           = useState(false);
  const [mode, setMode]           = useState(null); // 'ios' | 'android'
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (localStorage.getItem('install_prompt_dismissed')) return;

    if (isIOS()) {
      // Delay so it doesn't fire on first load
      const t = setTimeout(() => { setMode('ios'); setShow(true); }, 3000);
      return () => clearTimeout(t);
    }

    if (isAndroidChrome()) {
      const handler = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setMode('android');
        setShow(true);
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem('install_prompt_dismissed', '1');
  };

  const installAndroid = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    setDeferredPrompt(null);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 animate-in">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-2xl">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition"
        >
          <X className="w-3.5 h-3.5 text-white/60" />
        </button>

        <div className="flex items-start space-x-3 pr-6">
          <img src="/icon-192.png" alt="Feelz Machine" className="w-12 h-12 rounded-2xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white mb-0.5">Install Feelz Machine</p>

            {mode === 'ios' && (
              <>
                <p className="text-xs text-white/40 mb-3">
                  Get push notifications and the full app experience.
                </p>
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

            {mode === 'android' && (
              <>
                <p className="text-xs text-white/40 mb-3">
                  Install for push notifications and offline access.
                </p>
                <button
                  onClick={installAndroid}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:bg-white/90 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install App</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}