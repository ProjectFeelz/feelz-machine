import React from 'react';
import { Play, Pause, SkipForward, MoreHorizontal, Heart, Download, ListMusic } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { downloadTrack } from '../../utils/downloadTrack';
import { useState } from 'react';
import { usePlayer } from '../../contexts/PlayerContext';

export default function MiniPlayer() {
  const { currentTrack, isPlaying, togglePlay, playNext, duration, currentTime, setIsMinimized, addToQueue } = usePlayer();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const handleDownload = async (e) => {
    e.stopPropagation();
    if (!user) { navigate(`/login`); return; }
    if (!currentTrack?.file_url) return;
    setDownloading(true);
    try { await downloadTrack(currentTrack.file_url, currentTrack.title); } catch {}
    setDownloading(false);
    setShowMenu(false);
  };

  if (!currentTrack) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    // Mobile only — desktop uses DesktopPlayer
    <div className="md:hidden fixed left-0 right-0 z-50" style={{ bottom: '60px' }}>
      <div className="h-[2px] bg-white/10 w-full">
        <div className="h-full bg-white transition-all duration-200" style={{ width: `${progress}%` }} />
      </div>
      <div
        className="bg-[#1a1a1a]/95 backdrop-blur-xl border-t border-white/[0.04] px-3 py-2 cursor-pointer"
        onClick={() => setIsMinimized(false)}>
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-md overflow-hidden bg-white/10 flex-shrink-0">
              {currentTrack.cover_artwork_url
                ? <img src={currentTrack.cover_artwork_url} alt={currentTrack.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-white/30 text-lg">♪</div>
              }
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white font-medium truncate">{currentTrack.title}</p>
              <p className="text-xs text-white/50 truncate">{currentTrack.artist_name || 'Unknown Artist'}</p>
            </div>
          </div>
          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={togglePlay}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition">
              {isPlaying
                ? <Pause className="w-5 h-5 text-white" fill="white" />
                : <Play className="w-5 h-5 text-white" fill="white" />
              }
            </button>
            <button onClick={playNext}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition">
              <SkipForward className="w-4 h-4 text-white" fill="white" />
            </button>
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowMenu(p => !p); }}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition">
                <MoreHorizontal className="w-4 h-4 text-white/60" />
              </button>
              {showMenu && (
                <div onClick={e => e.stopPropagation()}
                  className="absolute bottom-12 right-0 w-48 rounded-xl shadow-2xl z-50 overflow-hidden"
                  style={{ backgroundColor: `#1a1a1a`, border: `1px solid rgba(255,255,255,0.08)` }}>
                  <button onClick={handleDownload}
                    className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                    <Download className="w-4 h-4 text-white/50" />
                    <span className="text-sm text-white/70">{downloading ? `Downloading...` : `Download`}</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); addToQueue(currentTrack); setShowMenu(false); }}
                    className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                    <ListMusic className="w-4 h-4 text-white/50" />
                    <span className="text-sm text-white/70">Add to Queue</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



