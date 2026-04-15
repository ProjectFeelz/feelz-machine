import { useState, useRef, useCallback } from 'react';

/**
 * usePullToRefresh
 *
 * Detects downward pull gesture at the top of a scrollable container
 * and fires an onRefresh callback.
 *
 * Usage:
 *   const { pullProps, isPulling, pullProgress, isRefreshing } = usePullToRefresh(onRefresh);
 *   <div {...pullProps}>...</div>
 *
 * pullProgress: 0–1, use to animate the indicator
 * isPulling: true while finger is dragging
 * isRefreshing: true while onRefresh promise is pending
 */

const THRESHOLD    = 70;  // px to pull before triggering
const MAX_PULL     = 100; // max visual pull distance

export function usePullToRefresh(onRefresh) {
  const [pullY, setPullY]           = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY    = useRef(null);
  const pulling   = useRef(false);

  const onTouchStart = useCallback((e) => {
    // Only activate at the very top of the scroll container
    const el = e.currentTarget;
    if (el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = false;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (startY.current === null || isRefreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) { setPullY(0); pulling.current = false; return; }
    pulling.current = true;
    // Ease the pull — diminishing returns past threshold
    const eased = Math.min(delta * 0.5, MAX_PULL);
    setPullY(eased);
    if (eased > 10) e.preventDefault(); // stop page scroll while pulling
  }, [isRefreshing]);

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current || startY.current === null) return;
    startY.current = null;
    if (pullY >= THRESHOLD) {
      setIsRefreshing(true);
      setPullY(THRESHOLD); // hold indicator in place
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
