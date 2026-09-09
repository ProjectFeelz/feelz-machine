// src/components/OfflineSaveButton.js
//
// The one control that saves a track for offline listening, in two shapes:
//
//   variant="row"   a full-width row for the track action sheet
//   variant="icon"  a round icon button for anywhere tight
//
// It is one component on purpose. The download button in this codebase exists
// separately in five places, each with its own error handling, and five of
// them showed the person nothing when a rule fired. One component means the
// states — idle, saving with progress, saved, expiring, locked behind Fan Pro
// — are written once and cannot drift.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, Check, Loader, X, CloudOff, Lock, AlertTriangle,
} from 'lucide-react';
import { useOfflineLibrary } from '../contexts/OfflineContext';
import { useTier } from '../contexts/useTier';
import { useAuth } from '../contexts/AuthContext';

function formatMb(bytes) {
  if (!bytes) return '';
  const mb = bytes / 1048576;
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

export default function OfflineSaveButton({
  track,
  variant = 'row',
  onNavigate,          // called before navigating away, so a sheet can close
  className = '',
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isListenerPro, isPro, isPremium } = useTier();
  const {
    supported, isSaved, savingProgress, save, cancelSave, remove,
    items, leaseState: stateOf, daysLeft: daysOf, error, clearError,
  } = useOfflineLibrary();

  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!track?.id) return null;

  // A browser that cannot store blobs at all. Saying so is better than a
  // button that fails every time it is pressed.
  if (!supported) {
    if (variant === 'icon') return null;
    return (
      <div className={`w-full flex items-center space-x-4 px-5 py-3.5 opacity-40 ${className}`}>
        <CloudOff className="w-5 h-5 text-white/40" />
        <div className="text-left">
          <p className="text-sm text-white">Offline listening unavailable</p>
          <p className="text-[11px] text-white/30">This browser can't store music on the device.</p>
        </div>
      </div>
    );
  }

  const meta     = items.find(m => m.trackId === track.id);
  const saved    = isSaved(track.id);
  const progress = savingProgress(track.id);
  const busy     = progress !== undefined;
  const lease    = meta ? stateOf(meta) : 'missing';
  const days     = meta ? daysOf(meta) : null;

  // Which gate to SHOW, not which gate to enforce — enforcement is entirely
  // server-side in get-offline-url.js, because the price is not always on the
  // track object (a track priced through its album has no download_price of
  // its own) and guessing here would lock the wrong tracks.
  //
  // The paywall is the one worth showing up front: it is the common case and
  // the answer is an upgrade rather than a retry. It mirrors the server —
  // ANY paid tier unlocks offline, so Fan Pro, Artist Pro and Artist Premium
  // all pass. A free artist account does not: having uploaded a track is not
  // a payment. It is also not shown for a paid track, where the gate is the
  // purchase and the message would be wrong.
  const isPaidTrack = Number(track.download_price) > 0;
  const onPaidTier  = isListenerPro || isPro || isPremium;
  const locked      = !!user && !onPaidTier && !isPaidTrack;

  const handleClick = async () => {
    clearError();

    if (!user) { onNavigate?.(); navigate('/login'); return; }

    if (busy) { cancelSave(track.id); return; }

    if (saved && lease !== 'expired') {
      if (!confirmRemove) { setConfirmRemove(true); setTimeout(() => setConfirmRemove(false), 4000); return; }
      setConfirmRemove(false);
      await remove(track.id);
      return;
    }

    if (locked) { onNavigate?.(); navigate('/listener/upgrade'); return; }

    await save(track);
  };

  // ── Icon variant ────────────────────────────────────────────────────────────

  if (variant === 'icon') {
    const title = busy   ? 'Saving — tap to cancel'
                : saved  ? (lease === 'expired' ? 'Reconnect to renew' : 'Saved offline — tap to remove')
                : locked ? 'Offline listening is a paid feature'
                : 'Save for offline';

    return (
      <button
        onClick={handleClick}
        title={title}
        aria-label={title}
        className={`relative w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition ${className}`}
      >
        {busy ? (
          <>
            <Loader className="w-3.5 h-3.5 animate-spin text-green-400" />
            {typeof progress === 'number' && progress > 0 && (
              <span className="absolute -bottom-1 left-1 right-1 h-0.5 rounded-full bg-white/10 overflow-hidden">
                <span className="block h-full bg-green-400 transition-all"
                      style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            )}
          </>
        ) : saved && lease === 'expired' ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          : saved                        ? <Check className="w-3.5 h-3.5 text-green-400" />
          : locked                       ? <Lock className="w-3.5 h-3.5 text-white/25" />
          :                                <ArrowDownToLine className="w-3.5 h-3.5 text-white/30" />}
      </button>
    );
  }

  // ── Row variant ─────────────────────────────────────────────────────────────

  const label =
      busy && typeof progress === 'number' ? `Saving… ${Math.round(progress * 100)}%`
    : busy                                 ? 'Saving…'
    : confirmRemove                        ? 'Remove from this device?'
    : saved && lease === 'expired'         ? 'Offline copy expired'
    : saved && lease === 'expiring'        ? `Saved offline · ${days} day${days === 1 ? '' : 's'} left`
    : saved                                ? 'Saved on this device'
    : locked                               ? 'Save for offline · paid feature'
    :                                        'Save for offline';

  const sub =
      busy                          ? 'Tap to cancel'
    : confirmRemove                 ? 'Tap again to remove. The track still streams.'
    : saved && lease === 'expired'  ? 'Go online once to renew it'
    : saved                         ? `Plays with no connection${meta?.bytes ? ` · ${formatMb(meta.bytes)}` : ''}`
    : locked                        ? 'Fan Pro, Artist Pro or Premium'
    :                                 'Plays with no connection';

  return (
    <>
      <button
        onClick={handleClick}
        className={`w-full flex items-center space-x-4 px-5 py-3.5 active:bg-white/[0.04] transition text-left ${className}`}
      >
        <span className="relative flex-shrink-0">
          {busy ? <Loader className="w-5 h-5 animate-spin text-green-400" />
            : confirmRemove                ? <X className="w-5 h-5 text-red-400" />
            : saved && lease === 'expired' ? <AlertTriangle className="w-5 h-5 text-amber-400" />
            : saved                        ? <Check className="w-5 h-5 text-green-400" />
            : locked                       ? <Lock className="w-5 h-5 text-white/30" />
            :                                <ArrowDownToLine className="w-5 h-5 text-white/40" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-white truncate">{label}</span>
          <span className="block text-[11px] text-white/30 truncate">{sub}</span>
          {busy && typeof progress === 'number' && (
            <span className="mt-1.5 block h-0.5 rounded-full bg-white/10 overflow-hidden">
              <span className="block h-full bg-green-400 transition-all"
                    style={{ width: `${Math.round(progress * 100)}%` }} />
            </span>
          )}
        </span>
      </button>

      {error && (
        <p className="px-5 pb-2 text-[11px] text-amber-400/90">{error}</p>
      )}
    </>
  );
}