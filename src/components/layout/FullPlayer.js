import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown,
  Shuffle, Repeat, Repeat1, Heart, Share2, ListMusic
} from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function FullPlayer() {
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    playNext,
    playPrev,
    seek,
    duration,
    currentTime,
    shuffle,
    repeat,
    toggleShuffle,
    toggleRepeat,
    isMinimized,
    setIsMinimized,
  } = usePlayer();

  if (!currentTrack || isMinimized) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    seek(pct * duration);
  };

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4">
        <button
          onClick={() => setIsMinimized(true)}
          className="w-10 h-10 flex items-center justify-center"
        >
          <ChevronDown className="w-6 h-6 text-white" />
        </button>
        <p className="text-xs text-white/50 uppercase tracking-widest font-medium">
          Now Playing
        </p>
        <button className="w-10 h-10 flex items-center justify-center">
          <ListMusic className="w-5 h-5 text-white/50" />
        </button>
      </div>

      {/* Album artwork */}
      <div className="flex-1 flex items-center justify-center px-10 py-4">
        <div className="w-full max-w-[340px] aspect-square rounded-xl overflow-hidden shadow-2xl shadow-black/50">
          {currentTrack.cover_artwork_url ? (
            <img
              src={currentTrack.cover_artwork_url}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center">
              <span className="text-6xl text-white/20">&#9835;</span>
            </div>
          )}
        </div>
      </div>

      {/* Track info + controls */}
      <div className="px-8 pb-10">
        {/* Title + Like */}
        <div className="flex items-center justify-between mb-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-white truncate">
              {currentTrack.title}
            </h2>
            <p className="text-base text-white/50 truncate">
              {currentTrack.artist_name || 'Unknown Artist'}
            </p>
          </div>
          <button className="ml-4 w-10 h-10 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white/50" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div
            className="h-1 bg-white/10 rounded-full cursor-pointer group"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-white rounded-full relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition" />
            </div>
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[11px] text-white/40 tabular-nums">
              {formatTime(currentTime)}
            </span>
            <span className="text-[11px] text-white/40 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Main controls */}
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={toggleShuffle}
            className={`w-10 h-10 flex items-center justify-center ${
              shuffle ? 'text-white' : 'text-white/30'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button onClick={playPrev} className="w-14 h-14 flex items-center justify-center">
            <SkipBack className="w-7 h-7 text-white" fill="white" />
          </button>

          <button
            onClick={togglePlay}
            className="w-16 h-16 flex items-center justify-center rounded-full bg-white"
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 text-black" fill="black" />
            ) : (
              <Play className="w-8 h-8 text-black ml-1" fill="black" />
            )}
          </button>

          <button onClick={playNext} className="w-14 h-14 flex items-center justify-center">
            <SkipForward className="w-7 h-7 text-white" fill="white" />
          </button>

          <button
            onClick={toggleRepeat}
            className={`w-10 h-10 flex items-center justify-center ${
              repeat !== 'none' ? 'text-white' : 'text-white/30'
            }`}
          >
            {repeat === 'one' ? (
              <Repeat1 className="w-5 h-5" />
            ) : (
              <Repeat className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Share */}
        <div className="flex items-center justify-center mt-6">
          <button className="flex items-center space-x-2 text-white/40">
            <Share2 className="w-4 h-4" />
            <span className="text-xs">Share</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
