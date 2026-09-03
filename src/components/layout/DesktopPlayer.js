import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1,
    Volume2, VolumeX, Heart, ListMusic, Maximize2, MoreHorizontal,
} from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import TrackActionSheet from '../TrackActionSheet';

export default function DesktopPlayer() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const {
          currentTrack, isPlaying, togglePlay, playNext, playPrev,
          duration, currentTime, seek, volume, setVolume,
          shuffle, toggleShuffle, repeat, toggleRepeat,
          setIsMinimized, desktopPanelView, setDesktopPanelView,
    } = usePlayer();

  const [liked, setLiked] = useState(false);
    const [showActionSheet, setShowActionSheet] = useState(false);

  // Sync liked state when track changes
  React.useEffect(() => {
        if (!user || !currentTrack) return;
        supabase.from('track_likes').select('id')
          .eq('track_id', currentTrack.id).eq('user_id', user.id)
          .maybeSingle().then(({ data }) => setLiked(!!data));
  }, [currentTrack?.id, user?.id]);

  const handleLike = async () => {
        if (!user || !currentTrack) return;
        setLiked(p => !p);
        if (liked) {
                await supabase.from('track_likes').delete()
                  .eq('track_id', currentTrack.id).eq('user_id', user.id);
        } else {
                await supabase.from('track_likes').insert({
                          track_id: currentTrack.id, user_id: user.id,
                });
        }
  };

  const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        seek(Math.max(0, Math.min(duration, ratio * duration)));
  };

  const formatTime = (s) => {
        if (!s || isNaN(s)) return '0:00';
        return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!currentTrack) return null;

  return (
        <>
{/* Player bar */}
      <div
        className="hidden md:block fixed bottom-0 left-64 right-0 z-50"
        style={{
                    background: 'rgba(14,14,16,0.96)',
                    backdropFilter: 'blur(32px)',
                    WebkitBackdropFilter: 'blur(32px)',
                    borderTop: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 -8px 32px rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.04)',
        }}>
{/* Seek bar */}
        <div
          className="h-1 w-full cursor-pointer group relative"
          onClick={handleSeek}
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full transition-all duration-150 relative"
            style={{ width: `${progress}%`, background: 'rgba(255,255,255,0.7)' }}>
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition shadow-lg" />
              </div>
              </div>

        <div className="flex items-center px-6 py-3 gap-4">
            {/* Track info */}
          <div className="flex items-center space-x-3 w-64 flex-shrink-0 min-w-0">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0 shadow-lg">
            {currentTrack.cover_artwork_url
                ? <img src={currentTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-white/20">♪</div>
}
</div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{currentTrack.title}</p>
              <button
                onClick={() => currentTrack.artist_slug && navigate(`/artist/${currentTrack.artist_slug}`)}
                className="text-xs text-white/40 hover:text-white/70 transition truncate text-left w-full">
                {currentTrack.artist_name || 'Unknown Artist'}
</button>
  </div>
            <button onClick={handleLike} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition flex-shrink-0">
                <Heart className="w-4 h-4" fill={liked ? '#ef4444' : 'none'} color={liked ? '#ef4444' : 'rgba(255,255,255,0.3)'} />
  </button>
  </div>

{/* Center controls */}
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5">
                        <div className="flex items-center space-x-3">
                          <button onClick={toggleShuffle} className={`w-8 h-8 flex items-center justify-center rounded-full transition ${shuffle ? 'text-white' : 'text-white/30 hover:text-white/60'}`}>
                <Shuffle className="w-4 h-4" />
            </button>
              <button onClick={playPrev} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition text-white/70 hover:text-white">
                            <SkipBack className="w-5 h-5" fill="currentColor" />
            </button>
              <button onClick={togglePlay} className="w-11 h-11 flex items-center justify-center rounded-full transition active:scale-95" style={{ background: 'white' }}>
{isPlaying
                  ? <Pause className="w-5 h-5 text-black" fill="black" />
                    : <Play className="w-5 h-5 text-black ml-0.5" fill="black" />
  }
</button>
               <button onClick={playNext} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition text-white/70 hover:text-white">
                  <SkipForward className="w-5 h-5" fill="currentColor" />
  </button>
               <button onClick={toggleRepeat} className={`w-8 h-8 flex items-center justify-center rounded-full transition ${repeat !== 'none' ? 'text-white' : 'text-white/30 hover:text-white/60'}`}>
{repeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
</button>
  </div>
 {/* Time */}
             <div className="flex items-center space-x-2 text-[10px] text-white/30">
                             <span>{formatTime(currentTime)}</span>
               <span>/</span>
                             <span>{formatTime(duration)}</span>
               </div>
               </div>

 {/* Right controls */}
           <div className="flex items-center space-x-2 w-64 justify-end flex-shrink-0">
           {/* Volume */}
                         <button
               onClick={() => setVolume(volume > 0 ? 0 : 1)}
               className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition text-white/40 hover:text-white/70">
               {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                            <div
                              className="w-24 h-1 rounded-full cursor-pointer relative group"
                              style={{ background: 'rgba(255,255,255,0.1)' }}
              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
              }}>
                              <div className="h-full rounded-full bg-white/60" style={{ width: `${volume * 100}%` }} />
                </div>

{/* Queue toggle — opens the same docked panel FullPlayer uses, on its queue tab */}
            <button
              onClick={() => { setDesktopPanelView('queue'); setIsMinimized(false); }}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition ${desktopPanelView === 'queue' ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'}`}>
              <ListMusic className="w-4 h-4" />
                </button>

{/* 3-dot — opens TrackActionSheet */}
            <button
              onClick={() => setShowActionSheet(true)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition ${showActionSheet ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'}`}>
              <MoreHorizontal className="w-4 h-4" />
                </button>

{/* Expand to full player */}
            <button
              onClick={() => { setDesktopPanelView('player'); setIsMinimized(false); }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition text-white/40 hover:text-white/70">
                              <Maximize2 className="w-4 h-4" />
                </button>
                </div>
                </div>
                </div>

{/* TrackActionSheet — same one used on album art cards */}
{showActionSheet && (
          <TrackActionSheet
           track={currentTrack}
           artist={{
                         artist_name: currentTrack.artist_name,
                         slug: currentTrack.artist_slug || currentTrack.artists?.slug,
           }}
          onClose={() => setShowActionSheet(false)}
        />
                  )}
            </>
  );
}