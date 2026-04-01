import React, { useState } from 'react';
import { Play, Pause, SkipForward, MoreHorizontal } from 'lucide-react';
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

  return (
    <div
      className="md:hidden fixed left-0 right-0 z-50"
      style={{ bottom: '56px' }}
    >
      {/* Draggable progress bar — tall touch target */}
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
        onClick={() => { tap(); setIsMinimized(false); }}>
        <div className="flex items-center justify-between max-w-lg mx-auto">

          {/* Track info */}
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
              {currentTrack.cover_artwork_url
                ? <img
                    src={currentTrack.cover_artwork_url}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                : <div className="w-full h-full flex items-center justify-center text-white/30 text-lg">♪</div>}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white font-medium truncate leading-tight">{currentTrack.title}</p>
              <button
                onClick={handleArtistClick}
                className="text-xs text-white/50 truncate leading-tight mt-0.5 hover:text-white/80 transition text-left w-full block">
                {currentTrack.artist_name || 'Unknown Artist'}
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
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
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); tap(); setShowActionSheet(true); }}
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10 transition active:scale-90">
                <MoreHorizontal className="w-4 h-4 text-white/60" />
              </button>
              {showActionSheet && (
                <TrackActionSheet
                  track={currentTrack}
                  artist={{ artist_name: currentTrack.artist_name, slug: currentTrack.artist_slug || currentTrack.artists?.slug }}
                  onClose={() => setShowActionSheet(false)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
