/**
 * usePaidPlayLimit
 *
 * Tracks how many times a user has played each paid track (download_price > 0).
 * Free tracks: unlimited plays.
 * Paid tracks: 5 free plays, then show a purchase prompt.
 *
 * Play counts are stored in localStorage under key: 'fm_play_counts'
 * Format: { [trackId]: number }
 *
 * Usage:
 *   const { checkPlayLimit, recordPlay, getPlaysRemaining } = usePaidPlayLimit();
 *
 *   Before playing a paid track:
 *     const { allowed, playsLeft } = checkPlayLimit(track);
 *     if (!allowed) { showPurchaseModal(track); return; }
 *     recordPlay(track.id);
 *     actuallyPlayTrack();
 */

import { useCallback } from 'react';

const STORAGE_KEY = 'fm_play_counts';
const FREE_PLAY_LIMIT = 5;

function getPlayCounts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePlayCounts(counts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {}
}

export function usePaidPlayLimit() {
  // Returns { allowed: bool, playsUsed: number, playsLeft: number }
  const checkPlayLimit = useCallback((track) => {
    // Free music — always allowed
    if (!track?.download_price || track.download_price <= 0) {
      return { allowed: true, playsUsed: 0, playsLeft: Infinity };
    }
    const counts = getPlayCounts();
    const playsUsed = counts[track.id] || 0;
    const playsLeft = Math.max(0, FREE_PLAY_LIMIT - playsUsed);
    return { allowed: playsLeft > 0, playsUsed, playsLeft };
  }, []);

  // Call this AFTER confirming play is allowed
  const recordPlay = useCallback((trackId) => {
    const counts = getPlayCounts();
    counts[trackId] = (counts[trackId] || 0) + 1;
    savePlayCounts(counts);
  }, []);

  const getPlaysRemaining = useCallback((track) => {
    if (!track?.download_price || track.download_price <= 0) return Infinity;
    const counts = getPlayCounts();
    return Math.max(0, FREE_PLAY_LIMIT - (counts[track.id] || 0));
  }, []);

  // Call after purchase to reset the count for a track
  const resetPlayCount = useCallback((trackId) => {
    const counts = getPlayCounts();
    delete counts[trackId];
    savePlayCounts(counts);
  }, []);

  return { checkPlayLimit, recordPlay, getPlaysRemaining, resetPlayCount, FREE_PLAY_LIMIT };
}
