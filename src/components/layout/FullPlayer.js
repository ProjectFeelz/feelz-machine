import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown,
  Shuffle, Repeat, Repeat1, Heart, Share2, ListMusic, Check,
  Volume2, VolumeX, X, MoreHorizontal,
} from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import TrackActionSheet from '../TrackActionSheet';
import { useHaptics } from '../../hooks/useHaptics';
import VinylRecord from '../VinylRecord';
import ShareCard from '../ShareCard';
import ReactPlayer from 'react-player';

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  return `${Math.floor(secs / 60)}:${Math.floor(secs % 60).toString().padStart(2, '0')}`;
}

const IconImage = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);
const IconVinyl = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const IconVideo = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);

const ALL_MODES = ['artwork', 'vinyl', 'video'];

export default function FullPlayer() {
  const navigate = useNavigate();
  const {
    currentTrack, isPlaying, togglePlay,
    playNext, playPrev, seek, duration, currentTime,
    shuffle, repeat, toggleShuffle, toggleRepeat,
    isMinimized, setIsMinimized, queue, volume, setVolumeLevel,
    removeFromQueue,
  } = usePlayer();
  const { user } = useAuth();
  const { tap, success, heavy } = useHaptics();

  const [liked, setLiked]                     = useState(false);
  const [showShareCard, setShowShareCard]      = useState(false);
  const [showQueue, setShowQueue]             = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [displayMode, setDisplayMode]         = useState('artwork');
  const [videoMuted, setVideoMuted]           = useState(true);

  const y       = useMotionValue(0);
  const opacity = useTransform(y, [0, 300], [1, 0]);

  const hasVideo       = !!currentTrack?.youtube_url;
  const availableModes = hasVideo ? ALL_MODES : ALL_MODES.filter(m => m !== 'video');

  useEffect(() => {
    if (!hasVideo && displayMode === 'video') setDisplayMode('artwork');
  }, [currentTrack?.id]);

  useEffect(() => {
    if (!currentTrack || !user) { setLiked(false); return; }
    supabase.from('track_likes')
      .select('id').eq('track_id', currentTrack.id).eq('user_id', user.id)
      .maybeSingle().then(({ data }) => setLiked(!!data));
  }, [currentTrack?.id, user?.id]);

  useEffect(() => {
    if (!isMinimized) animate(y, 0, { type: 'spring', damping: 30, stiffness: 300 });
  }, [isMinimized]);

  if (!currentTrack || isMinimized) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const coverArt = currentTrack.cover_artwork_url;

  const handleSeek = (e) => {
    const rect    = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches
      ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX)
      : e.clientX;
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(pct * duration);
    tap();
  };

  const handleLike = async () => {
    if (!user) return;
    success();
    setLiked(prev => !prev);
    if (liked) {
      await supabase.from('track_likes').delete().eq('track_id', currentTrack.id).eq('user_id', user.id);
    } else {
      await supabase.from('track_likes').insert({ track_id: currentTrack.id, user_id: user.id });
    }
  };

  const handleDragEnd = (_, info) => {
    if (info.offset.y > 120 || info.velocity.y > 500) {
      animate(y, window.innerHeight, { duration: 0.25 }).then(() => {
        setIsMinimized(true);
        animate(y, 0, { duration: 0 });
      });
    } else {
      animate(y, 0, { type: 'spring', damping: 30, stiffness: 300 });
    }
  };

  const setMode = (m) => { tap(); setDisplayMode(m); };

  return (
    <>
      <motion.div
        style={{ y, opacity }}
        drag="y"
        dragConstraints={{ top: 0, bottom: window.innerHeight }}
        dragElastic={{ top: 0, bottom: 0.3 }}
        onDragEnd={handleDragEnd}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-0 z-[100] bg-black flex flex-col"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
          <button onClick={() => { tap(); setIsMinimized(true); }}
            className="w-10 h-10 flex items-center justify-center">
            <ChevronDown className="w-6 h-6 text-white" />
          </button>
          <p className="text-xs text-white/50 uppercase tracking-widest font-medium">Now Playing</p>
          <button onClick={() => { tap(); setShowQueue(p => !p); }}
            className="w-10 h-10 flex items-center justify-center">
            <ListMusic className={`w-5 h-5 ${showQueue ? 'text-white' : 'text-white/50'}`} />
          </button>
        </div>

        {/* Queue view */}
        {showQueue ? (
          <div className="flex-1 overflow-y-auto px-5 pb-10">
            <p className="text-xs uppercase tracking-wider text-white/30 font-semibold mb-3">Up Next</p>
            {(queue || []).length === 0 ? (
              <p className="text-sm text-white/20 text-center py-12">No tracks in queue</p>
            ) : (queue || []).map((track, i) => (
              <div key={track.id}
                className={`flex items-center space-x-3 py-3 border-b border-white/[0.04] ${track.id === currentTrack.id ? 'opacity-100' : 'opacity-50'}`}>
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20">♪</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${track.id === currentTrack.id ? 'text-white' : 'text-white/60'}`}>{track.title}</p>
                  <p className="text-xs text-white/30 truncate">{track.artist_name}</p>
                </div>
                {track.id === currentTrack.id ? (
                  <div className="flex items-end space-x-0.5 h-4 flex-shrink-0">
                    {[100, 60, 80].map((h, i) => (
                      <div key={i} className="w-0.5 bg-white rounded-full animate-pulse"
                        style={{ height: `${h}%`, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                ) : (
                  <button onClick={() => { tap(); removeFromQueue(i); }}
                    className="p-1.5 rounded-full hover:bg-white/10 flex-shrink-0">
                    <X className="w-3.5 h-3.5 text-white/30" />
                  </button>
                )}
              </div>
            ))}
          </div>

        ) : (
          <>
            {/* Main display area */}
            <div className="flex-1 relative flex flex-col items-center justify-center px-8 min-h-0 overflow-hidden">

              {/* Video layer */}
              {displayMode === 'video' && hasVideo && (
                <div className="absolute inset-0">
                  <ReactPlayer
                    url={currentTrack.youtube_url}
                    playing={isPlaying}
                    muted={videoMuted}
                    loop
                    width="100%"
                    height="100%"
                    style={{ position: 'absolute', top: 0, left: 0 }}
                    config={{
                      youtube: {
                        playerVars: {
                          controls: 0, modestbranding: 1, rel: 0,
                          showinfo: 0, iv_load_policy: 3, playsinline: 1,
                        },
                      },
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
                </div>
              )}

              {/* Artwork mode */}
              {displayMode === 'artwork' && (
                <div className="w-full max-w-[300px] aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
                  {coverArt
                    ? <img src={coverArt} alt={currentTrack.title} className="w-full h-full object-cover" loading="eager" />
                    : <div className="w-full h-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center">
                        <span className="text-6xl text-white/20">♪</span>
                      </div>}
                </div>
              )}

              {/* Vinyl mode */}
              {displayMode === 'vinyl' && (
                <VinylRecord
                  coverUrl={coverArt}
                  isPlaying={isPlaying}
                  size={Math.min(300, window.innerWidth - 80)}
                />
              )}

              {/* Video unavailable fallback */}
              {displayMode === 'video' && !hasVideo && (
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center mx-auto">
                    <IconVideo />
                  </div>
                  <p className="text-sm text-white/30">No video for this track</p>
                  <p className="text-xs text-white/15">Artists can add a YouTube URL when uploading</p>
                </div>
              )}

              {/* Mode toggle */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center bg-black/60 backdrop-blur-xl rounded-full border border-white/[0.08] overflow-hidden">
                {[
                  { key: 'artwork', Icon: IconImage, label: 'Art' },
                  { key: 'vinyl',   Icon: IconVinyl, label: 'Vinyl' },
                  { key: 'video',   Icon: IconVideo, label: 'Video' },
                ].map(({ key, Icon, label }) => {
                  const disabled = key === 'video' && !hasVideo;
                  const active   = displayMode === key;
                  return (
                    <button key={key} onClick={() => !disabled && setMode(key)}
                      className={`flex items-center space-x-1.5 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider transition-all ${
                        active
                          ? 'bg-white text-black'
                          : disabled
                            ? 'text-white/15 cursor-default'
                            : 'text-white/40 hover:text-white/70 active:bg-white/10'
                      }`}>
                      <Icon />
                      <span>{label}</span>
                    </button>
                  );
                })}
                {displayMode === 'video' && hasVideo && (
                  <>
                    <div className="w-px h-5 bg-white/10 mx-0.5" />
                    <button onClick={() => { tap(); setVideoMuted(m => !m); }}
                      className="px-3 py-2 text-white/40 hover:text-white/70 transition">
                      {videoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Track info + controls */}
            <div className="px-8 flex-shrink-0" style={{ paddingBottom: 'max(40px, calc(env(safe-area-inset-bottom) + 24px))' }}>
              {/* Title + Like */}
              <div className="flex items-center justify-between mb-5 mt-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-white truncate">{currentTrack.title}</h2>
                  <button
                    onClick={() => {
                      tap();
                      const slug = currentTrack.artist_slug || currentTrack.artists?.slug;
                      if (slug) navigate(`/artist/${slug}`);
                    }}
                    className="text-base text-white/50 truncate hover:text-white/80 transition text-left">
                    {currentTrack.artist_name || 'Unknown Artist'}
                  </button>
                </div>
                <button onClick={handleLike}
                  className="ml-4 w-12 h-12 flex items-center justify-center active:scale-90 transition-transform">
                  <Heart className="w-6 h-6 transition"
                    fill={liked ? '#ef4444' : 'none'}
                    color={liked ? '#ef4444' : 'rgba(255,255,255,0.5)'} />
                </button>
              </div>

              {/* Seeker */}
              <div className="mb-2">
                <div
                  className="h-10 flex items-center cursor-pointer group -mx-2 px-2"
                  onClick={handleSeek}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => { e.stopPropagation(); handleSeek(e); }}
                  onTouchEnd={(e) => { e.stopPropagation(); handleSeek(e); }}
                  style={{ touchAction: 'none' }}
                >
                  <div className="w-full h-1.5 bg-white/10 rounded-full">
                    <div className="h-full bg-white rounded-full relative transition-none" style={{ width: `${progress}%` }}>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg scale-0 group-active:scale-100 transition-transform" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-between -mt-1">
                  <span className="text-[11px] text-white/40 tabular-nums">{formatTime(currentTime)}</span>
                  <span className="text-[11px] text-white/40 tabular-nums">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Playback controls */}
              <div className="flex items-center justify-between mt-4">
                <button onClick={() => { tap(); toggleShuffle(); }}
                  className={`w-12 h-12 flex items-center justify-center ${shuffle ? 'text-white' : 'text-white/30'}`}>
                  <Shuffle className="w-5 h-5" />
                </button>
                <button onClick={() => { heavy(); playPrev(); }}
                  className="w-14 h-14 flex items-center justify-center active:scale-95 transition-transform">
                  <SkipBack className="w-7 h-7 text-white" fill="white" />
                </button>
                <button onClick={() => { heavy(); togglePlay(); }}
                  className="w-16 h-16 flex items-center justify-center rounded-full bg-white active:scale-95 transition-transform shadow-lg">
                  {isPlaying
                    ? <Pause className="w-8 h-8 text-black" fill="black" />
                    : <Play className="w-8 h-8 text-black ml-1" fill="black" />}
                </button>
                <button onClick={() => { heavy(); playNext(); }}
                  className="w-14 h-14 flex items-center justify-center active:scale-95 transition-transform">
                  <SkipForward className="w-7 h-7 text-white" fill="white" />
                </button>
                <button onClick={() => { tap(); toggleRepeat(); }}
                  className={`w-12 h-12 flex items-center justify-center ${repeat !== 'none' ? 'text-white' : 'text-white/30'}`}>
                  {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                </button>
              </div>

              {/* Volume — desktop only */}
              <div className="hidden md:flex items-center space-x-3 mt-4 px-2">
                <button onClick={() => setVolumeLevel(volume > 0 ? 0 : 1)} className="text-white/40">
                  {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input type="range" min="0" max="1" step="0.01" value={volume}
                  onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
                  className="flex-1 h-1 rounded-full appearance-none bg-white/10"
                  style={{ accentColor: 'white' }} />
              </div>

              {/* Share / More */}
              <div className="flex items-center justify-center mt-5 space-x-8">
                <button
                  onClick={() => { tap(); setShowShareCard(true); }}
                  className="flex flex-col items-center space-y-1 text-white/40 hover:text-white/70 transition active:scale-95">
                  <Share2 className="w-5 h-5" />
                  <span className="text-[10px]">Share</span>
                </button>
                <button onClick={() => { tap(); setShowActionSheet(true); }}
                  className="flex flex-col items-center space-y-1 text-white/40 hover:text-white/70 transition active:scale-95">
                  <MoreHorizontal className="w-5 h-5" />
                  <span className="text-[10px]">More</span>
                </button>
              </div>

              {showActionSheet && (
                <TrackActionSheet
                  track={currentTrack}
                  artist={{ artist_name: currentTrack.artist_name, slug: currentTrack.artist_slug || currentTrack.artists?.slug }}
                  onClose={() => setShowActionSheet(false)}
                />
              )}
            </div>
          </>
        )}
      </motion.div>

      {/* ShareCard — rendered outside the player motion div to avoid z-index conflicts */}
      {showShareCard && (
        <ShareCard track={currentTrack} onClose={() => setShowShareCard(false)} />
      )}
    </>
  );
}
