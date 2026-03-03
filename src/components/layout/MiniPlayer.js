import React from 'react';
import { Play, Pause, SkipForward, X } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';

export default function MiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    playNext,
    duration,
    currentTime,
    setIsMinimized,
  } = usePlayer();

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-14 left-0 right-0 z-50">
      {/* Progress bar - thin line at top */}
      <div className="h-[2px] bg-white/10 w-full">
        <div
          className="h-full bg-white transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div
        className="bg-[#1a1a1a]/95 backdrop-blur-xl border-t border-white/[0.04] px-3 py-2 cursor-pointer"
        onClick={() => setIsMinimized(false)}
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {/* Track info */}
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            {/* Album art */}
            <div className="w-10 h-10 rounded-md overflow-hidden bg-white/10 flex-shrink-0">
              {currentTrack.cover_artwork_url ? (
                <img
                  src={currentTrack.cover_artwork_url}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/30">
                  <span className="text-lg">♪</span>
                </div>
              )}
            </div>

            {/* Title + Artist */}
            <div className="min-w-0">
              <p className="text-sm text-white font-medium truncate">
                {currentTrack.title}
              </p>
              <p className="text-xs text-white/50 truncate">
                {currentTrack.artist_name || 'Unknown Artist'}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={togglePlay}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-white" fill="white" />
              ) : (
                <Play className="w-5 h-5 text-white" fill="white" />
              )}
            </button>
            <button
              onClick={playNext}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition"
            >
              <SkipForward className="w-4 h-4 text-white" fill="white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
