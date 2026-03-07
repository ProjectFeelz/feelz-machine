import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Heart, ListMusic, Maximize2, MoreHorizontal,
  Share2, Download, Check, Loader, X
} from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

export default function DesktopPlayer() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    currentTrack, isPlaying, togglePlay, playNext, playPrev,
    duration, currentTime, seek, volume, setVolume,
    shuffle, toggleShuffle, repeat, toggleRepeat,
    queue, queueIndex, setIsMinimized, addToQueue
  } = usePlayer();

  const [liked, setLiked] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [shared, setShared] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!user || !currentTrack) return;
    supabase.from('track_likes').select('id')
      .eq('track_id', currentTrack.id).eq('user_id', user.id)
      .maybeSingle().then(({ data }) => setLiked(!!data));
  }, [currentTrack?.id, user?.id]);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

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

  const handleShare = async () => {
    if (!currentTrack) return;
    const url = currentTrack.artist_slug
      ? `${window.location.origin}/artist/${currentTrack.artist_slug}`
      : window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: currentTrack.title, url }); } catch (e) {}
    } else {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => { setShared(false); setShowMenu(false); }, 2000);
    }
  };

  const handleDownload = async () => {
    if (!currentTrack?.file_url || !user) return;
    setDownloading(true);
    try {
      await supabase.from('downloads').insert({ user_id: user.id, track_id: currentTrack.id });
      const a = document.createElement('a');
      a.href = currentTrack.file_url;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) { console.error(e); }
    setDownloading(false);
    setShowMenu(false);
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
      {/* Queue panel */}
      {showQueue && (
        <div className="hidden md:block fixed right-0 z-40 w-72 overflow-y-auto"
          style={{
            bottom: '88px', top: '0',
            background: 'rgba(12,12,12,0.95)',
            backdropFilter: 'blur(24px)',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
          }}>
          <div className="sticky top-0 px-5 py-4 flex items-center justify-between"
            style={{ background: 'rgba(12,12,12,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-sm font-semibold text-white">Queue</p>
            <button onClick={() => setShowQueue(false)} className="text-white/30 hover:text-white/60 transition text-lg leading-none">×</button>
          </div>
          <div className="px-3 py-2 space-y-0.5">
            {queue.map((track, i) => (
              <div key={`${track.id}-${i}`}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl transition ${
                  i === queueIndex ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                }`}>
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">♪</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${i === queueIndex ? 'text-white' : 'text-white/70'}`}>{track.title}</p>
                  <p className="text-[10px] text-white/30 truncate">{track.artist_name}</p>
                </div>
                {i === queueIndex && (
                  <div className="flex items-end space-x-0.5 h-3 flex-shrink-0">
                    <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '100%' }} />
                    <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0.15s' }} />
                    <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '80%', animationDelay: '0.3s' }} />
                  </div>
                )}
              </div>
            ))}
            {queue.length === 0 && (
              <p className="text-center text-white/20 text-xs py-8">Queue is empty</p>
            )}
          </div>
        </div>
      )}

      {/* Player bar */}
      <div className="hidden md:block fixed bottom-0 left-64 right-0 z-50"
        style={{
          background: 'rgba(10,10,10,0.92)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
        {/* Seek bar */}
        <div className="h-1 w-full cursor-pointer group relative" onClick={handleSeek}
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full transition-all duration-150 relative"
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
            <button onClick={handleLike}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition flex-shrink-0">
              <Heart className="w-4 h-4" fill={liked ? '#ef4444' : 'none'} color={liked ? '#ef4444' : 'rgba(255,255,255,0.3)'} />
            </button>
          </div>

          {/* Center controls */}
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5">
            <div className="flex items-center space-x-3">
              <button onClick={toggleShuffle}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition ${shuffle ? 'text-white' : 'text-white/30 hover:text-white/60'}`}>
                <Shuffle className="w-4 h-4" />
              </button>
              <button onClick={playPrev}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition text-white/70 hover:text-white">
                <SkipBack className="w-5 h-5" fill="currentColor" />
              </button>
              <button onClick={togglePlay}
                className="w-11 h-11 flex items-center justify-center rounded-full transition active:scale-95"
                style={{ background: 'white' }}>
                {isPlaying
                  ? <Pause className="w-5 h-5 text-black" fill="black" />
                  : <Play className="w-5 h-5 text-black ml-0.5" fill="black" />
                }
              </button>
              <button onClick={playNext}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition text-white/70 hover:text-white">
                <SkipForward className="w-5 h-5" fill="currentColor" />
              </button>
              <button onClick={toggleRepeat}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition ${repeat !== 'none' ? 'text-white' : 'text-white/30 hover:text-white/60'}`}>
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
            <button onClick={() => setVolume(volume > 0 ? 0 : 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition text-white/40 hover:text-white/70">
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <div className="w-24 h-1 rounded-full cursor-pointer relative group"
              style={{ background: 'rgba(255,255,255,0.1)' }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
              }}>
              <div className="h-full rounded-full bg-white/60" style={{ width: `${volume * 100}%` }} />
            </div>
            {/* Queue toggle */}
            <button onClick={() => setShowQueue(p => !p)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition ${showQueue ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'}`}>
              <ListMusic className="w-4 h-4" />
            </button>
            {/* 3-dot menu */}
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowMenu(p => !p)}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition ${showMenu ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'}`}>
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute bottom-10 right-0 w-48 rounded-xl shadow-2xl overflow-hidden z-50"
                  style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <button onClick={() => { if (currentTrack) addToQueue(currentTrack); setShowMenu(false); }}
                    className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                    <ListMusic className="w-4 h-4 text-white/50" />
                    <span className="text-sm text-white/70">Add to Queue</span>
              </button>
                  <button onClick={handleShare}
                    className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                    {shared ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4 text-white/50" />}
                    <span className="text-sm text-white/70">{shared ? 'Copied!' : 'Share'}</span>
                  </button>
                  {currentTrack.is_downloadable && (
                    <button onClick={handleDownload} disabled={downloading}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left disabled:opacity-40">
                      {downloading ? <Loader className="w-4 h-4 animate-spin text-white/50" /> : <Download className="w-4 h-4 text-white/50" />}
                      <span className="text-sm text-white/70">{downloading ? 'Downloading...' : 'Download'}</span>
                    </button>
                  )}
                  {currentTrack.artist_slug && (
                    <button onClick={() => { navigate(`/artist/${currentTrack.artist_slug}`); setShowMenu(false); }}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left border-t border-white/[0.05]">
                      <span className="text-sm text-white/40">View Artist</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Expand to full player */}
            <button onClick={() => setIsMinimized(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition text-white/40 hover:text-white/70">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}