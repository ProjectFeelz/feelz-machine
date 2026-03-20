import React, { useState } from 'react';
import { Play, Pause, SkipForward, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import TrackActionSheet from '../TrackActionSheet';
import { usePlayer } from '../../contexts/PlayerContext';

export default function MiniPlayer() {
    const { currentTrack, isPlaying, togglePlay, playNext, duration, currentTime, setIsMinimized } = usePlayer();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [showActionSheet, setShowActionSheet] = useState(false);

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleArtistClick = (e) => {
        e.stopPropagation();
        if (currentTrack?.artist_slug) {
                navigate(`/artist/${currentTrack.artist_slug}`);
        }
  };

  return (
        <div className="md:hidden fixed left-0 right-0 z-50" style={{ bottom: '68px' }}>
      <div className="h-[2px] bg-white/10 w-full">
          <div className="h-full bg-white transition-all duration-200" style={{ width: `${progress}%` }} />
  </div>
      <div
        className="bg-[#1a1a1a]/95 backdrop-blur-xl border-t border-white/[0.04] px-3 py-2.5 cursor-pointer"
        onClick={() => setIsMinimized(false)}>
                  <div className="flex items-center justify-between max-w-lg mx-auto">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-md overflow-hidden bg-white/10 flex-shrink-0">
        {currentTrack.cover_artwork_url
                ? <img src={currentTrack.cover_artwork_url} alt={currentTrack.title} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-white/30 text-lg">&#9835;</div>
}
</div>
            <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate leading-tight">{currentTrack.title}</p>
              <button
                onClick={handleArtistClick}
                className="text-xs text-white/50 truncate leading-tight mt-0.5 hover:text-white/80 transition text-left w-full"
              >
                {currentTrack.artist_name || 'Unknown Artist'}
</button>
  </div>
  </div>
          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={togglePlay}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition">
              {isPlaying
                               ? <Pause className="w-5 h-5 text-white" fill="white" />
                                : <Play className="w-5 h-5 text-white" fill="white" />
                }
                </button>
            <button
              onClick={playNext}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition">
                              <SkipForward className="w-4 h-4 text-white" fill="white" />
                </button>
            <div className="relative">
                              <button
                onClick={(e) => { e.stopPropagation(); setShowActionSheet(true); }}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition">
                                  <MoreHorizontal className="w-4 h-4 text-white/60" />
                  </button>
{showActionSheet && (
                  <TrackActionSheet
                   track={currentTrack}
                   artist={{ artist_name: currentTrack.artist_name, slug: currentTrack.artist_slug }}
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
