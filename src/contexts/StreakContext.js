/**
 * StreakContext.js
 * 
 * Single source of truth for streak data. useStreak() runs ONE database
 * check per session (in AppLayout), all other components read from this context.
 * Prevents multiple DB writes / visual jitter when several pages mount at once.
 */
import React, { createContext, useContext } from 'react';

export const StreakContext = createContext({
  streak: 0,
  longestStreak: 0,
  discoveryStreak: 0,
  recordDiscovery: () => {},
  loading: true,
});

export function useStreakContext() {
  return useContext(StreakContext);
}