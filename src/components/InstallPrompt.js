/**
 * InstallPrompt.js
 *
 * Install guidance, per platform.
 *
 *
 * THE THING PEOPLE ASK FOR AND CANNOT HAVE
 *
 * There is no way to install a web app on iPhone from code. Safari does not
 * implement beforeinstallprompt and WebKit exposes no equivalent, so the button
 * Android gets cannot exist on iOS. This is Apple's decision, not a gap in this
 * file, and no library gets around it. The best anything can do is tell the
 * person exactly which taps to make, on their actual device, in their actual
 * browser. That is what this does.
 *
 *
 * THE THREE THINGS IT NOW GETS RIGHT THAT IT USED TO GET WRONG
 *
 * 1. In-app browsers cannot do it at all. A link opened inside Instagram,
 *    Facebook, X, TikTok or WhatsApp runs in a webview with no Add to Home
 *    Screen anywhere in it. This matters more than the rest of this file put
 *    together, because that is where artists share links. Telling someone in a
 *    webview to "tap Share" sends them looking for a button that is not there,
 *    and they conclude the app is broken. So a webview gets its own card and
 *    its own instruction: open it in the real browser first.
 *
 * 2. On iOS 26 the Share button moved. It is behind the three dots next to the
 *    address bar, not sitting on the toolbar where it was. The old copy said
 *    "tap the Share button in Safari" and on a current iPhone there is no such
 *    button in view.
 *
 * 3. iOS 26 added an "Open as Web App" toggle inside the Add to Home Screen
 *    sheet. Leave it off and you get a bookmark that opens in Safari: no icon
 *    of its own, no offline, and no push notifications. Someone can follow
 *    every step, end up with a bookmark, and think they installed the app. The
 *    card now names the toggle.
 *
 * Since iOS 16.4 any browser on iPhone can do this, not only Safari, so the
 * wording no longer insists on Safari when the person is in Chrome or Firefox.
 *
 *
 * ON NAGGING
 *
 * Dismissing used to be permanent. Someone who swiped it away on day one never
 * saw it again, including after they started using the platform daily. It now
 * snoozes for 30 days instead, which is roughly never while still being more
 * than once. Installing it stops the card for good, because a standalone window
 * never shows it.
 *
 * Parameterised so Feelz Retail can use it too, with its own dismiss key so
 * dismissing on one app does not silently hide it on the other.
 */

import React, { useState, useEffect } from 'react';
import { X, Share, Plus, Download, Compass, MoreHorizontal, Copy, Check } from 'lucide-react';

const SNOOZE_DAYS = 30;

// Webviews that host a link inside another app. Add to Home Screen is absent
// from all of them. FBAN/FBAV cover Facebook and Messenger, Instagram ships its
// own token, Line and KakaoTalk matter in their markets, and GSA is Google's
// own iOS app, which is a webview too.
const IN_APP_RE = /(FBAN|FBAV|FB_IAB|Instagram|Twitter|TikTok|Snapchat|LinkedInApp|Pinterest|WhatsApp|Line\/|KAKAOTALK|MicroMessenger|GSA\/)/i;

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// "CPU iPhone OS 26_0 like Mac OS X" → 26. Null when it cannot be read, and
// every use below treats null as "assume the newer flow", because the newer
// flow is what most devices are on and being wrong the other way sends people
// hunting for a toolbar button that was removed.
function iosMajor() {
  const m = navigator.userAgent.match(/OS (\d+)[._]/);
  return m ? parseInt(m[1], 10) : null;
}

function isInAppBrowser() {
  return IN_APP_RE.test(navigator.userAgent);
}

// Safari proper, as opposed to Chrome or Firefox on iOS, which identify
// themselves with CriOS and FxiOS while still claiming Safari further along the
// string. Order matters here.
function isIOSSafari() {
  const ua = navigator.userAgent;
  return isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS|Brave/i.test(ua) && !isInAppBrowser();
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

function snoozed(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    // A bare '1' is what the old version wrote. Treat it as a snooze that
    // started whenever, which is to say expired, so people who dismissed it
    // once a year ago are not silenced permanently by a value this code no
    // longer writes.
    if (raw === '1') return false;
    const until = parseInt(raw, 10);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    // Private mode and blocked site data both throw here. Showing the card is
    // the safer failure: worst case someone sees it twice.
    return false;
  }
}

export default function InstallPrompt({
  appName     = 'Feelz Machine',
  iconSrc     = '/icon-192.png',
  storageKey  = 'install_prompt_dismissed',
  blurb       = 'Get push notifications and the full app experience.',
  positionClass = 'fixed bottom-24 left-4 right-4 z-50',
  manualFallback = false,
} = {}) {
  const [show, setShow]   = useState(false);
  const [mode, setMode]   = useState(null); // 'inapp' | 'ios' | 'prompt' | 'manual'
  const [copied, setCopied] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (snoozed(storageKey)) return;

    // Checked before the iOS branch on purpose: an Instagram webview on an
    // iPhone is both, and the webview instruction is the one that works.
    if (isInAppBrowser()) {
      const t = setTimeout(() => { setMode('inapp'); setShow(true); }, 3000);
      return () => clearTimeout(t);
    }

    if (isIOS()) {
      const t = setTimeout(() => { setMode('ios'); setShow(true); }, 3000);
      return () => clearTimeout(t);
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setMode('prompt');
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // WHY RETAIL NEVER GETS AN AUTOMATIC PROMPT ONCE THE MAIN APP IS INSTALLED
    //
    // manifest.json declares "scope": "/", so once Feelz Machine is installed
    // the browser treats every page on this origin as already belonging to an
    // installed app, /retail/player included. beforeinstallprompt is suppressed
    // for a page already covered by an installed app, so the handler above
    // never fires. Serving Retail from its own origin is the proper fix and a
    // DNS change. Until then, manual instructions.
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
    try {
      localStorage.setItem(storageKey, String(Date.now() + SNOOZE_DAYS * 864e5));
    } catch {
      // Nothing to do. The card reappears next visit, which is the old
      // behaviour for anyone browsing privately and is not worth handling.
    }
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    setDeferredPrompt(null);
  };

  // Copy rather than a button claiming to open Safari. The x-safari- scheme
  // works in some webviews and silently does nothing in others, and a button
  // that does nothing is worse than no button.
  const copyLink = async () => {
    const url = window.location.origin;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard is unavailable in plenty of webviews, which is exactly where
      // this button lives, so the old selection trick is the fallback.
      try {
        const el = document.createElement('textarea');
        el.value = url;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch {
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!show) return null;

  const major     = iosMajor();
  const newFlow   = major == null || major >= 26;
  const safari    = isIOSSafari();
  const pushReady = major == null || major >= 17;

  const browserName = safari ? 'Safari' : 'your browser';

  const steps = newFlow
    ? [
        { icon: MoreHorizontal, text: <>Tap the <b className="text-white font-medium">•••</b> next to the address bar, then <b className="text-white font-medium">Share</b></> },
        { icon: Plus,  text: <>Scroll down and tap <b className="text-white font-medium">Add to Home Screen</b></> },
        { icon: Check, text: <>Leave <b className="text-white font-medium">Open as Web App</b> switched on, then tap <b className="text-white font-medium">Add</b></> },
      ]
    : [
        { icon: Share, text: <>Tap the <b className="text-white font-medium">Share</b> button at the bottom of {browserName}</> },
        { icon: Plus,  text: <>Scroll down and tap <b className="text-white font-medium">Add to Home Screen</b></> },
      ];

  const Step = ({ icon: Icon, text, tone = 'blue' }) => (
    <div className="flex items-start space-x-2">
      <div className={`w-6 h-6 rounded-lg ${tone === 'blue' ? 'bg-blue-500/20' : 'bg-purple-500/20'} flex items-center justify-center flex-shrink-0 mt-px`}>
        <Icon className={`w-3.5 h-3.5 ${tone === 'blue' ? 'text-blue-400' : 'text-purple-400'}`} />
      </div>
      <p className="text-xs text-white/60 leading-relaxed">{text}</p>
    </div>
  );

  return (
    <div className={`${positionClass} animate-in`}>
      <div className="relative bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-2xl">
        <button
          onClick={dismiss}
          aria-label="Not now"
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition"
        >
          <X className="w-3.5 h-3.5 text-white/60" />
        </button>

        <div className="flex items-start space-x-3 pr-6">
          <img src={iconSrc} alt={appName} className="w-12 h-12 rounded-2xl flex-shrink-0" />
          <div className="flex-1 min-w-0">

            {mode === 'inapp' && (
              <>
                <p className="text-sm font-semibold text-white mb-0.5">Open in your browser first</p>
                <p className="text-xs text-white/40 mb-3">
                  {appName} can be installed as an app, but not from inside this window.
                  Open it in {isIOS() ? 'Safari' : 'Chrome'} and the option appears.
                </p>
                <div className="space-y-2">
                  <Step
                    icon={Compass}
                    text={<>Tap the <b className="text-white font-medium">•••</b> or <b className="text-white font-medium">Share</b> icon in this window, then <b className="text-white font-medium">Open in {isIOS() ? 'Safari' : 'Chrome'}</b></>}
                  />
                </div>
                <button
                  onClick={copyLink}
                  className="mt-3 flex items-center space-x-2 px-3 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/15 transition">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Link copied' : 'Copy the link instead'}</span>
                </button>
              </>
            )}

            {mode === 'ios' && (
              <>
                <p className="text-sm font-semibold text-white mb-0.5">Install {appName}</p>
                <p className="text-xs text-white/40 mb-3">{blurb}</p>
                <div className="space-y-2">
                  {steps.map((s, i) => <Step key={i} icon={s.icon} text={s.text} />)}
                </div>
                <p className="text-[10px] text-white/20 mt-2 leading-relaxed">
                  {pushReady
                    ? 'Push notifications start working once it is on your home screen.'
                    : 'Push notifications need iOS 16.4 or newer, with the app added to your home screen.'}
                </p>
              </>
            )}

            {mode === 'prompt' && (
              <>
                <p className="text-sm font-semibold text-white mb-0.5">Install {appName}</p>
                <p className="text-xs text-white/40 mb-3">{blurb}</p>
                <button
                  onClick={install}
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:bg-white/90 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Install app</span>
                </button>
              </>
            )}

            {mode === 'manual' && (
              <>
                <p className="text-sm font-semibold text-white mb-0.5">Install {appName}</p>
                <p className="text-xs text-white/40 mb-3">{blurb}</p>
                <Step
                  icon={Download}
                  tone="purple"
                  text={<>Open the browser menu <b className="text-white font-medium">⋮</b> and choose <b className="text-white font-medium">Install app</b> or <b className="text-white font-medium">Add to Home screen</b>.</>}
                />
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