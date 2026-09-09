// src/pages/OfflinePage.js
//
// The offline library. The one page in the app that must work with the network
// completely gone, so it reads nothing from Supabase — not the track list, not
// the titles, not even the artwork. Every pixel comes out of IndexedDB.
//
// That constraint is the whole design. A page that fetches "just the artist
// name" is a page that renders blank on a plane, which is the exact moment
// somebody opens it.

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Music, Trash2, ArrowDownToLine,
  AlertTriangle, HardDrive, WifiOff, CloudOff, Loader,
} from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import { useOfflineLibrary } from '../contexts/OfflineContext';
import { useOffline } from '../hooks/useOffline';
import { getOfflineCoverBlob, offlineAudioPath } from '../utils/offlineStore';

function formatSize(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1048576;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Artwork from the stored blob. The remote cover URL is kept in the metadata
// too, but using it here would mean an offline library with no covers, which
// looks broken rather than offline.
function OfflineCover({ trackId, coverUrl }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let url = null;
    let alive = true;
    getOfflineCoverBlob(trackId)
      .then(blob => {
        if (!alive || !blob) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {});
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [trackId]);

  const shown = src || coverUrl;
  if (!shown) {
    return (
      <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center">
        <Music className="w-4 h-4 text-white/20" />
      </div>
    );
  }
  return <img src={shown} alt="" className="w-12 h-12 rounded-lg object-cover" />;
}

export default function OfflinePage() {
  const navigate  = useNavigate();
  const isOffline = useOffline();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const {
    items, loading, supported, usage, remove, removeAll,
    leaseState: stateOf, daysLeft: daysOf,
  } = useOfflineLibrary();

  const [confirmClear, setConfirmClear] = useState(false);
  const [removing, setRemoving] = useState(null);

  // A saved track, shaped like a track the player understands.
  //
  // file_url has to be present or playTrack's own guard rejects it, and
  // is_published has to be true or getTrackAvailability blocks it. Both are
  // honest: the track WAS published and streamable when the server granted the
  // lease, and that grant is the only entitlement check possible with no
  // network. The player resolves the local copy over file_url anyway.
  const playable = useMemo(() => items.map(m => ({
    id:                 m.trackId,
    title:              m.title,
    slug:               m.slug,
    artist_id:          m.artistId,
    artist_name:        m.artistName,
    artist_slug:        m.artistSlug,
    artist:             { id: m.artistId, artist_name: m.artistName, slug: m.artistSlug },
    cover_artwork_url:  m.coverUrl,
    duration:           m.duration,
    album_id:           m.albumId,
    is_beat:            m.isBeat,
    is_published:       true,
    file_url:           m.fileUrl || offlineAudioPath(m.trackId),
    __offline:          true,
  })), [items]);

  const handlePlay = (index) => {
    const track = playable[index];
    if (!track) return;
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    // The queue is the whole offline library from this point, so "next"
    // continues into other saved tracks rather than trying to fetch a
    // suggestion that needs a network.
    playTrack(track, playable);
  };

  const handleRemove = async (trackId) => {
    setRemoving(trackId);
    await remove(trackId);
    setRemoving(null);
  };

  const expiredCount = items.filter(m => stateOf(m) === 'expired').length;

  return (
    <div className="pb-32 px-4">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6 sticky top-0 z-20 bg-black/95 backdrop-blur-xl md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04] md:border-none">
        <button onClick={() => navigate('/library')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">Offline</h1>
          <p className="text-xs text-white/30">
            {items.length} {items.length === 1 ? 'track' : 'tracks'} · {formatSize(usage.bytes)}
          </p>
        </div>
        {isOffline && (
          <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 flex-shrink-0">
            <WifiOff className="w-3 h-3 text-green-400" />
            <span className="text-[10px] font-semibold text-green-400">Playing offline</span>
          </span>
        )}
      </div>

      {/* Storage bar. Only shown when the browser gives a real number — a
          made-up percentage would be worse than none. */}
      {usage.quota > 0 && usage.bytes > 0 && (
        <div className="mb-5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5">
              <HardDrive className="w-3 h-3 text-white/40" />
              <p className="text-xs font-semibold text-white">Device storage</p>
            </div>
            <p className="text-[11px] text-white/40">
              {formatSize(usage.bytes)} of {formatSize(usage.quota)} available
            </p>
          </div>
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full rounded-full bg-green-400/70"
              style={{ width: `${Math.min(100, Math.max(1, (usage.bytes / usage.quota) * 100))}%` }} />
          </div>
        </div>
      )}

      {expiredCount > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber-200">
              {expiredCount} {expiredCount === 1 ? 'track has' : 'tracks have'} expired
            </p>
            <p className="text-[11px] text-amber-200/60 mt-0.5">
              Offline copies renew themselves every time you open the app with a connection.
              Go online once and these come back.
            </p>
          </div>
        </div>
      )}

      {!supported ? (
        <div className="text-center py-20">
          <CloudOff className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">Offline listening isn't available here</p>
          <p className="text-white/15 text-xs mt-1 max-w-xs mx-auto">
            This browser can't store music on the device. Installing Feelz Machine
            to your home screen usually fixes it.
          </p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <Loader className="w-6 h-6 animate-spin text-white/30" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <ArrowDownToLine className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">Nothing saved yet</p>
          <p className="text-white/15 text-xs mt-1 max-w-xs mx-auto">
            Tap the three dots on any track and choose <span className="text-white/30">Save for offline</span>.
            Saved music plays with no connection at all.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {items.map((m, i) => {
              const isActive   = currentTrack?.id === m.trackId;
              const isPlaying_ = isActive && isPlaying;
              const lease      = stateOf(m);
              const days       = daysOf(m);

              return (
                <div key={m.trackId}
                  className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/[0.04] transition group">

                  <div className="relative w-12 h-12 flex-shrink-0">
                    <OfflineCover trackId={m.trackId} coverUrl={m.coverUrl} />
                    <button onClick={() => handlePlay(i)}
                      disabled={lease === 'expired'}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition disabled:cursor-not-allowed">
                      {isPlaying_
                        ? <Pause className="w-4 h-4 text-white" />
                        : <Play className="w-4 h-4 text-white" />}
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => handlePlay(i)}
                      disabled={lease === 'expired'}
                      className="text-sm font-medium truncate text-left block w-full disabled:opacity-40"
                      style={{ color: isActive ? '#4ade80' : 'white' }}
                    >
                      {m.title}
                    </button>
                    <p className="text-xs text-white/30 truncate">
                      {m.artistName}
                      {m.duration ? ` · ${formatDuration(m.duration)}` : ''}
                      {m.bytes ? ` · ${formatSize(m.bytes)}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
                    {lease === 'expired' ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-medium">
                        Expired
                      </span>
                    ) : lease === 'expiring' ? (
                      <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-[10px] text-white/40 font-medium">
                        {days}d
                      </span>
                    ) : null}

                    <button
                      onClick={() => handleRemove(m.trackId)}
                      disabled={removing === m.trackId}
                      title="Remove from this device"
                      aria-label={`Remove ${m.title} from this device`}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] hover:bg-red-500/10 transition disabled:opacity-40"
                    >
                      {removing === m.trackId
                        ? <Loader className="w-3.5 h-3.5 animate-spin text-white/30" />
                        : <Trash2 className="w-3.5 h-3.5 text-white/30" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={async () => {
              if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 4000); return; }
              setConfirmClear(false);
              await removeAll();
            }}
            className="mt-6 w-full py-3 rounded-xl border border-white/[0.06] text-xs font-semibold transition"
            style={{ color: confirmClear ? '#f87171' : 'rgba(255,255,255,0.35)' }}
          >
            {confirmClear
              ? `Tap again to remove all ${items.length} · nothing is deleted from Feelz Machine`
              : 'Remove all offline music'}
          </button>
        </>
      )}
    </div>
  );
}