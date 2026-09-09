// src/contexts/OfflineContext.js
//
// OFFLINE LISTENING — the React side
//
// One shared source of truth for what is saved on this device. It has to be
// shared rather than a plain hook, because three separate places ask the same
// question at the same time: the action sheet ("is this one saved?"), the
// offline library page ("show me all of them"), and the player ("play the
// local copy"). Three copies of that state would disagree the moment somebody
// saved a track from the action sheet while the library page was open.
//
// Everything about storage lives in utils/offlineStore.js. This file is only
// about React: keeping the list warm, tracking progress, and turning the
// server's error codes into something a person can read.

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';
import {
  listOffline, saveTrackOffline, removeOffline, clearOffline,
  offlineUsage, renewLeases, primeSavedIds, leaseState, daysLeft,
} from '../utils/offlineStore';

const OfflineContext = createContext(null);

// The server's codes, turned into sentences. Same reasoning as
// downloadErrorMessage in utils/downloadTrack.js: without this, five callers
// each invent their own wording, or — far more likely, going by the six
// swallowed-error bugs already found in this codebase — show nothing at all
// and leave a button spinning forever.
export function offlineErrorMessage(err) {
  switch (err?.message) {
    case 'fan_pro_required':
      return 'Offline listening is a Fan Pro feature. Upgrade to keep music on your device.';
    case 'purchase_required':
      return 'Buy this track first — then you can keep it offline.';
    case 'not_released_yet':
      return "This track hasn't been released yet.";
    case 'track_unavailable':
      return 'The artist has taken this track down.';
    case 'offline_limit_reached':
      return "You've reached the offline limit. Remove a few tracks to make room.";
    case 'device_storage_full':
      return "Your device is out of space. Free some up, or remove a few saved tracks.";
    case 'audio_fetch_failed':
    case 'audio_empty':
      return 'The download stopped partway. Try again on a better connection.';
    case 'offline_unsupported':
      return "This browser can't store music offline. Try the installed app.";
    case 'not_authenticated':
      return 'Sign in to save music offline.';
    default:
      return "Couldn't save this for offline. Try again.";
  }
}

export function OfflineProvider({ children }) {
  const { user } = useAuth();

  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [usage,   setUsage]   = useState({ count: 0, bytes: 0, quota: null });
  const [saving,  setSaving]  = useState({});   // trackId -> 0..1 or null
  const [error,   setError]   = useState('');
  const [supported, setSupported] = useState(true);

  const abortRefs = useRef({});   // trackId -> AbortController

  const refresh = useCallback(async () => {
    try {
      const list = await listOffline();
      setItems(list);
      primeSavedIds(list.filter(m => leaseState(m) !== 'expired').map(m => m.trackId));
      setUsage(await offlineUsage());
      setSupported(true);
    } catch (err) {
      // A browser with IndexedDB disabled, or private mode on some versions of
      // Safari. Not an error to shout about — the feature simply isn't there.
      if (err?.message === 'offline_unsupported') setSupported(false);
      setItems([]);
      primeSavedIds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Renew on reconnect, and once on load if we already have a network.
  //
  // This is the only moment entitlement can be re-checked, so it is also the
  // only moment a lease can be taken away — which is the right place for it:
  // the person is online and can be told why.
  const renewRef = useRef(0);
  const renew = useCallback(async () => {
    if (!user) return;
    // Once an hour at most. This fires on every online event, and phones on a
    // flaky signal emit that repeatedly.
    if (Date.now() - renewRef.current < 3600000) return;
    renewRef.current = Date.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const result = await renewLeases(session.access_token);
      if (result.renewed || result.revoked) await refresh();
    } catch { /* next reconnect will try again */ }
  }, [user, refresh]);

  useEffect(() => {
    if (!user) return;
    if (navigator.onLine) renew();
    const onOnline = () => renew();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [user, renew]);

  // ── Saving ──────────────────────────────────────────────────────────────────

  const save = useCallback(async (track) => {
    if (!track?.id) return false;
    if (!user) { setError(offlineErrorMessage({ message: 'not_authenticated' })); return false; }
    if (saving[track.id] !== undefined) return false;   // already going

    setError('');
    setSaving(s => ({ ...s, [track.id]: 0 }));

    const controller = new AbortController();
    abortRefs.current[track.id] = controller;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      await saveTrackOffline(track, {
        authToken: session?.access_token,
        signal: controller.signal,
        onProgress: p => setSaving(s => (s[track.id] === undefined ? s : { ...s, [track.id]: p })),
      });
      await refresh();
      return true;
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(offlineErrorMessage(err));
        console.warn('[offline] save failed', track.id, err?.message || err);
      }
      return false;
    } finally {
      delete abortRefs.current[track.id];
      setSaving(s => { const next = { ...s }; delete next[track.id]; return next; });
    }
  }, [user, saving, refresh]);

  const cancelSave = useCallback((trackId) => {
    abortRefs.current[trackId]?.abort();
  }, []);

  // ── Removing ────────────────────────────────────────────────────────────────

  const remove = useCallback(async (trackId) => {
    try {
      await removeOffline(trackId);
      // Free the slot server-side too. Own-row delete is allowed by RLS
      // (migration 103); failing is harmless, the lease just expires.
      if (user) {
        await supabase.from('offline_leases')
          .delete().eq('user_id', user.id).eq('track_id', trackId);
      }
      await refresh();
      return true;
    } catch (err) {
      console.warn('[offline] remove failed', trackId, err?.message || err);
      return false;
    }
  }, [user, refresh]);

  const removeAll = useCallback(async () => {
    try {
      await clearOffline();
      if (user) await supabase.from('offline_leases').delete().eq('user_id', user.id);
      await refresh();
      return true;
    } catch (err) {
      console.warn('[offline] clear failed', err?.message || err);
      return false;
    }
  }, [user, refresh]);

  const savedIds = React.useMemo(
    () => new Set(items.filter(m => leaseState(m) !== 'expired').map(m => m.trackId)),
    [items]
  );

  const value = {
    items,
    loading,
    supported,
    usage,
    saving,
    error,
    clearError: () => setError(''),
    savedIds,
    isSaved:    id => savedIds.has(id),
    savingProgress: id => saving[id],
    save,
    cancelSave,
    remove,
    removeAll,
    refresh,
    leaseState,
    daysLeft,
  };

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

// Safe defaults if something renders outside the provider, matching the
// pattern useTier already uses. A missing provider must not crash a page —
// it just means nothing is saved.
const FALLBACK = {
  items: [], loading: false, supported: false,
  usage: { count: 0, bytes: 0, quota: null },
  saving: {}, error: '', clearError: () => {},
  savedIds: new Set(), isSaved: () => false, savingProgress: () => undefined,
  save: async () => false, cancelSave: () => {},
  remove: async () => false, removeAll: async () => false,
  refresh: async () => {},
  leaseState: () => 'missing', daysLeft: () => null,
};

export function useOfflineLibrary() {
  return useContext(OfflineContext) || FALLBACK;
}