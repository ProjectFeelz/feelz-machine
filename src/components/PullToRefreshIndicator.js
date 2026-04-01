import React from 'react';
import { Loader } from 'lucide-react';

/**
 * PullToRefreshIndicator
 *
 * Shows a subtle pull indicator at the top of the page.
 * Animates from nothing → spinner as user pulls.
 */
export default function PullToRefreshIndicator({ pullProgress, isRefreshing }) {
  if (pullProgress === 0 && !isRefreshing) return null;

  const opacity  = Math.min(pullProgress * 2, 1);
  const scale    = 0.6 + pullProgress * 0.4;
  const rotation = pullProgress * 180;

  return (
    <div
      className="flex items-center justify-center w-full"
      style={{
        height: `${Math.max(pullProgress * 50, isRefreshing ? 44 : 0)}px`,
        overflow: 'hidden',
        transition: isRefreshing ? 'height 0.2s ease' : 'none',
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          transition: isRefreshing ? 'all 0.2s ease' : 'none',
        }}
      >
        {isRefreshing ? (
          <Loader className="w-5 h-5 text-white/40 animate-spin" />
        ) : (
          <div
            className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        )}
      </div>
    </div>
  );
}
