import React from 'react';
import { Play, Pause, MoreHorizontal } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';

export default function TrackCard({ track, trackList = [], showArtwork = true, index }) {
  const { currentTrack, isPlaying, playTrack } = usePlayer();
  const isCurrentTrack = currentTrack?.id === track.id;
  const isCurrentAndPlaying = isCurrentTrack && isPlaying;

  const handlePlay = (e) => {
    e.stopPropagation();
    playTrack(track, trackList);
  };

  const formatDuration = (secs) => {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      onClick={handlePlay}
      className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isCurrentTrack
          ? 'bg-white/[0.08]'
          : 'hover:bg-white/[0.04] active:bg-white/[0.06]'
      }`}
    >
      {/* Index or artwork */}
      {showArtwork ? (
        <div className="relative w-11 h-11 rounded-md overflow-hidden bg-white/[0.06] flex-shrink-0 group">
          {track.cover_artwork_url ? (
            <img
              src={track.cover_artwork_url}
              alt={track.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              <span className="text-sm">&#9835;</span>
            </div>
          )}
          {/* Play overlay */}
          <div className={`absolute inset-0 flex items-center justify-center bg-black/40 ${
            isCurrentAndPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          } transition-opacity`}>
            {isCurrentAndPlaying ? (
              <Pause className="w-4 h-4 text-white" fill="white" />
            ) : (
              <Play className="w-4 h-4 text-white ml-0.5" fill="white" />
            )}
          </div>
        </div>
      ) : (
        <div className="w-7 flex-shrink-0 text-center">
          {isCurrentAndPlaying ? (
            <div className="flex items-center justify-center space-x-[2px]">
              <div className="w-[3px] h-3 bg-white rounded-full animate-pulse" />
              <div className="w-[3px] h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
              <div className="w-[3px] h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
            </div>
          ) : (
            <span className={`text-sm tabular-nums ${isCurrentTrack ? 'text-white' : 'text-white/30'}`}>
              {index != null ? index + 1 : ''}
            </span>
          )}
        </div>
      )}

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${
          isCurrentTrack ? 'text-white' : 'text-white/90'
        }`}>
          {track.title}
        </p>
        <p className="text-xs text-white/40 truncate">
          {track.artist_name || 'Unknown Artist'}
          {track.is_explicit && (
            <span className="inline-block ml-1.5 px-1 py-0.5 text-[9px] bg-white/10 rounded text-white/50 font-medium leading-none">
              E
            </span>
          )}
        </p>
      </div>

      {/* Duration + more */}
      <div className="flex items-center space-x-2 flex-shrink-0">
        <span className="text-xs text-white/30 tabular-nums">
          {formatDuration(track.duration)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            // TODO: track options menu
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition"
        >
          <MoreHorizontal className="w-4 h-4 text-white/30" />
        </button>
      </div>
    </div>
  );
}
