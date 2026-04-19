import { useState, useRef, useCallback } from 'react';

/**
 * usePullToRefresh
 * Detects downward pull gesture at the top of a scrollable container
 * and fires an onRefresh callback.
 *
 * iOS: higher threshold (110px) and requires scroll to be truly at top
 * Android: moderate threshold (85px)
 */

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

const THRESHOLD  = isIOS ? 110 : 85;   // px before triggering
const MAX_PULL   = 130;                  // max visual pull distance
const RESISTANCE = isIOS ? 0.38 : 0.48; // lower = harder to pull

export function usePullToRefresh(onRefresh) {
  const [pullY, setPullY]               = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY    = useRef(null);
  const pulling   = useRef(false);

  const onTouchStart = useCallback((e) => {
    const el = e.currentTarget;
    // On iOS, scrollTop can be negative during bounce — treat <= 1 as top
    if (el.scrollTop > 1) return;
    startY.current = e.touches[0].clientY;
    pulling.current = false;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (startY.current === null || isRefreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) { setPullY(0); pulling.current = false; return; }
    pulling.current = true;
    const eased = Math.min(delta * RESISTANCE, MAX_PULL);
    setPullY(eased);
    if (eased > 8) e.preventDefault();
  }, [isRefreshing]);

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current || startY.current === null) return;
    startY.current = null;
    if (pullY >= THRESHOLD) {
      setIsRefreshing(true);
      setPullY(THRESHOLD);
      try { await onRefresh(); } catch {}
      setIsRefreshing(false);
    }
    setPullY(0);
    pulling.current = false;
  }, [pullY, onRefresh]);

  return {
    pullProps: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      style: { touchAction: pullY > 0 ? 'none' : 'pan-y' },
    },
    pullProgress: Math.min(pullY / THRESHOLD, 1),
    isPulling: pulling.current,
    isRefreshing,
    pullY,
  };
}