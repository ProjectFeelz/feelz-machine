import { useState, useEffect } from 'react';
import React from 'react';
import { WifiOff, Wifi } from 'lucide-react';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline  = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  return isOffline;
}

// ── Banner ────────────────────────────────────────────────────────────────────

/**
 * OfflineBanner
 * Renders a fixed banner at the top of the screen when offline.
 * Briefly shows a "back online" confirmation before disappearing.
 *
 * Place once inside AppLayout, above everything else.
 */
export function OfflineBanner() {
  const isOffline = useOffline();
  const [visible, setVisible]   = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (isOffline) {
      setVisible(true);
      setWasOffline(true);
    } else if (wasOffline) {
      // Show "back online" briefly then hide
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        setWasOffline(false);
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [isOffline]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[500] flex items-center justify-center px-4 py-2.5 text-xs font-semibold transition-all"
      style={{
        backgroundColor: isOffline ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center space-x-2">
        {isOffline
          ? <><WifiOff className="w-3.5 h-3.5 text-white" /><span className="text-white">No internet connection</span></>
          : <><Wifi className="w-3.5 h-3.5 text-white" /><span className="text-white">Back online</span></>}
      </div>
    </div>
  );
}
