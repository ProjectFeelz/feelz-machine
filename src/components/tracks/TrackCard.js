import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Heart, ListMusic, Share2, Download, Check, Loader, X } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';
import TrackActionSheet from '../TrackActionSheet';
import { useHaptics } from '../../hooks/useHaptics';

const SWIPE_THRESHOLD = 60; // px to reveal actions
const MAX_SWIPE      = 180; // max swipe distance

export default function TrackCard({ track, trackList = [], showArtwork = true, index }) {
  const { currentTrack, isPlaying, playTrack, addToQueue } = usePlayer();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tap, success, light } = useHaptics();

  const isCurrentTrack     = currentTrack?.id === track.id;
  const isCurrentAndPlaying = isCurrentTrack && isPlaying;

  const [liked, setLiked]               = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);

  // Swipe state
  const [swipeX, setSwipeX]       = useState(0);
  const [revealed, setRevealed]   = useState(false);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const swiping     = useRef(false);
  const hapticFired = useRef(false);
  const rowRef      = useRef(null);

  useEffect(() => {
    if (!user || !track.id) return;
    supabase.from('track_likes').select('id')
      .eq('track_id', track.id).eq('user_id', user.id)
      .maybeSingle().then(({ data }) => setLiked(!!data));
  }, [track.id, user?.id]);

  // Close swipe when tapping elsewhere
  useEffect(() => {
    const close = (e) => {
      if (revealed && rowRef.current && !rowRef.current.contains(e.target)) {
        setSwipeX(0); setRevealed(false);
      }
    };
    document.addEventListener('touchstart', close);
    return () => document.removeEventListener('touchstart', close);
  }, [revealed]);

  // ── Touch swipe handlers ──────────────────────────────────────────────────
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = false;
    hapticFired.current = false;
  };

  const onTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Only handle horizontal swipes
    if (!swiping.current) {
      if (Math.abs(dy) > Math.abs(dx)) return; // vertical — let scroll handle it
      swiping.current = true;
    }

    e.stopPropagation();
    const leftSwipe = Math.max(0, -dx); // only left swipe to reveal
    const clamped = Math.min(leftSwipe, MAX_SWIPE);
    setSwipeX(clamped);

    // Haptic at threshold
    if (clamped >= SWIPE_THRESHOLD && !hapticFired.current) {
      light();
      hapticFired.current = true;
    }
    if (clamped < SWIPE_THRESHOLD) hapticFired.current = false;
  };

  const onTouchEnd = () => {
    if (!swiping.current) return;
    if (swipeX >= SWIPE_THRESHOLD) {
      setSwipeX(SWIPE_THRESHOLD + 20); // snap to reveal
      setRevealed(true);
    } else {
      setSwipeX(0);
      setRevealed(false);
    }
    swiping.current = false;
    touchStartX.current = null;
  };

  const closeSwipe = () => { setSwipeX(0); setRevealed(false); };

  // ── Actions ───────────────────────────────────────────────────────────────
  const handlePlay = (e) => {
    e?.stopPropagation();
    heavy?.();
    playTrack(track, trackList);
    closeSwipe();
  };

  const handleLike = async (e) => {
    e?.stopPropagation();
    if (!user) { navigate('/login'); return; }
    success();
    setLiked(prev => !prev);
    if (liked) {
      await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id);
    } else {
      await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id, artist_id: track.artist_id || null });
    }
    closeSwipe();
  };

  const handleQueue = (e) => {
    e?.stopPropagation();
    tap();
    addToQueue(track);
    closeSwipe();
  };

  const handleMore = (e) => {
    e?.stopPropagation();
    tap();
    setShowActionSheet(true);
    closeSwipe();
  };

  const formatDuration = (secs) => {
    if (!secs) return '';
    return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  };

  return (
    <div ref={rowRef} className="relative overflow-hidden">

      {/* ── Swipe action buttons (revealed behind the row) ── */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center"
        style={{ width: MAX_SWIPE }}>
        {/* Like */}
        <button
          onClick={handleLike}
          className="flex-1 h-full flex flex-col items-center justify-center space-y-1 transition-opacity"
          style={{ backgroundColor: liked ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)', opacity: swipeX > 20 ? 1 : 0 }}>
          <Heart className="w-5 h-5" fill={liked ? '#ef4444' : 'none'} color={liked ? '#ef4444' : 'rgba(255,255,255,0.5)'} />
          <span className="text-[9px] text-white/50">{liked ? 'Unlike' : 'Like'}</span>
        </button>
        {/* Queue */}
        <button
          onClick={handleQueue}
          className="flex-1 h-full flex flex-col items-center justify-center space-y-1"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', opacity: swipeX > 20 ? 1 : 0 }}>
          <Play className="w-5 h-5 text-white/50" />
          <span className="text-[9px] text-white/50">Queue</span>
        </button>
        {/* More */}
        <button
          onClick={handleMore}
          className="flex-1 h-full flex flex-col items-center justify-center space-y-1"
          style={{ backgroundColor: 'rgba(139,92,246,0.12)', opacity: swipeX > 20 ? 1 : 0 }}>
          <ListMusic className="w-5 h-5 text-purple-400" />
          <span className="text-[9px] text-purple-400">More</span>
        </button>
      </div>

      {/* ── Main row (slides left to reveal actions) ── */}
      <div
        onClick={swipeX > 10 ? closeSwipe : handlePlay}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(-${swipeX}px)`,
          transition: swiping.current ? 'none' : 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className={`relative flex items-center space-x-3 px-3 py-3 rounded-lg cursor-pointer bg-black transition-colors ${
          isCurrentTrack ? 'bg-white/[0.06]' : ''
        }`}
      >
        {/* Index or artwork */}
        {showArtwork ? (
          <div className="relative w-12 h-12 rounded-md overflow-hidden bg-white/[0.06] flex-shrink-0 group">
            {track.cover_artwork_url ? (
              <img
                src={track.cover_artwork_url}
                alt={track.title}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                style={{ opacity: 0, transition: 'opacity 0.3s' }}
                onLoad={(e) => { e.target.style.opacity = 1; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/20">
                <span className="text-sm">♪</span>
              </div>
            )}
            <div className={`absolute inset-0 flex items-center justify-center bg-black/40 ${
              isCurrentAndPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            } transition-opacity`}>
              {isCurrentAndPlaying
                ? <Pause className="w-4 h-4 text-white" fill="white" />
                : <Play className="w-4 h-4 text-white ml-0.5" fill="white" />}
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
          <p className={`text-sm font-medium truncate ${isCurrentTrack ? 'text-white' : 'text-white/90'}`}>
            {track.title}
          </p>
          <p className="text-xs text-white/40 truncate">
            {track.artist_name || 'Unknown Artist'}
            {track.is_explicit && (
              <span className="inline-block ml-1.5 px-1 py-0.5 text-[9px] bg-white/10 rounded text-white/50 font-medium leading-none">E</span>
            )}
          </p>
        </div>

        {/* Duration + more button */}
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-xs text-white/30 tabular-nums mr-1">{formatDuration(track.duration)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); handleMore(e); }}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition active:scale-90">
            <ListMusic className="w-4 h-4 text-white/30" />
          </button>
        </div>
      </div>

      {/* Bottom sheet action sheet */}
      {showActionSheet && (
        <TrackActionSheet
          track={track}
          artist={{ artist_name: track.artist_name, slug: track.artist_slug }}
          onClose={() => setShowActionSheet(false)}
        />
      )}
    </div>
  );
}
