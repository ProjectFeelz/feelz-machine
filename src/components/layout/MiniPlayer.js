import React, { useState } from 'react';
import { Play, Pause, SkipForward, ChevronUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import TrackActionSheet from '../TrackActionSheet';
import { usePlayer } from '../../contexts/PlayerContext';
import { useHaptics } from '../../hooks/useHaptics';

export default function MiniPlayer() {
  const {
    currentTrack, isPlaying, togglePlay, playNext,
    duration, currentTime, seek, setIsMinimized,
  } = usePlayer();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tap, heavy } = useHaptics();
  const [showActionSheet, setShowActionSheet] = useState(false);

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleArtistClick = (e) => {
    e.stopPropagation();
    tap();
    const slug = currentTrack?.artist_slug || currentTrack?.artists?.slug;
    if (slug) navigate(`/artist/${slug}`);
  };

  const handleProgressSeek = (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches
      ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX)
      : e.clientX;
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(pct * duration);
    tap();
  };

  const handleExpand = () => {
    tap();
    setIsMinimized(false);
  };

  return (
    <div
      className="md:hidden fixed left-0 right-0 z-50"
      style={{ bottom: '56px' }}
    >
      {/* Draggable progress bar */}
      <div
        className="h-1 flex items-center cursor-pointer"
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => { e.stopPropagation(); handleProgressSeek(e); }}
        onTouchEnd={(e) => { e.stopPropagation(); handleProgressSeek(e); }}
        onClick={(e) => { e.stopPropagation(); handleProgressSeek(e); }}
        style={{ touchAction: 'none' }}
      >
        <div className="w-full h-[2px] bg-white/10 relative">
          <div className="h-full bg-white transition-none" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Player bar */}
      <div
        className="bg-[#111]/95 backdrop-blur-xl border-t border-white/[0.06] px-3 py-2.5 cursor-pointer"
        onClick={handleExpand}
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">

          {/* Expand hint + Track info */}
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            {/* Artwork with expand chevron overlay */}
            <div className="relative w-11 h-11 flex-shrink-0">
              <div className="w-11 h-11 rounded-lg overflow-hidden bg-white/10">
                {currentTrack.cover_artwork_url
                  ? <img
                      src={currentTrack.cover_artwork_url}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover"
                      loading="eager"
                    />
                  : <div className="w-full h-full flex items-center justify-center text-white/30 text-lg">♪</div>}
              </div>
              {/* Chevron overlay — makes it obvious this is tappable */}
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 hover:opacity-100 transition">
                <ChevronUp className="w-4 h-4 text-white" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm text-white font-medium truncate leading-tight">{currentTrack.title}</p>
              <button
                onClick={handleArtistClick}
                className="text-xs text-white/50 truncate leading-tight mt-0.5 hover:text-white/80 transition text-left w-full block">
                {currentTrack.artist_name || 'Unknown Artist'}
              </button>
            </div>
          </div>

          {/* Expand pill — always visible affordance */}
          <button
            onClick={handleExpand}
            className="flex items-center space-x-1 px-2 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] mr-1 flex-shrink-0"
            aria-label="Open full player"
          >
            <ChevronUp className="w-3 h-3 text-white/40" />
            <span className="text-[9px] text-white/30 font-medium uppercase tracking-wide">Open</span>
          </button>

          {/* Controls */}
          <div className="flex items-center space-x-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { heavy(); togglePlay(); }}
              className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10 transition active:scale-90">
              {isPlaying
                ? <Pause className="w-5 h-5 text-white" fill="white" />
                : <Play className="w-5 h-5 text-white" fill="white" />}
            </button>
            <button
              onClick={() => { heavy(); playNext(); }}
              className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10 transition active:scale-90">
              <SkipForward className="w-4 h-4 text-white" fill="white" />
            </button>
          </div>
        </div>
      </div>

      {showActionSheet && (
        <TrackActionSheet
          track={currentTrack}
          artist={{ artist_name: currentTrack.artist_name, slug: currentTrack.artist_slug || currentTrack.artists?.slug }}
          onClose={() => setShowActionSheet(false)}
        />
      )}
    </div>
  );
}
