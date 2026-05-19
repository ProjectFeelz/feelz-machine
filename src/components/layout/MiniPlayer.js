import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, ChevronUp, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import TrackActionSheet from '../TrackActionSheet';
import { usePlayer } from '../../contexts/PlayerContext';
import { supabase } from '../../supabaseClient';
import { useHaptics } from '../../hooks/useHaptics';

export default function MiniPlayer() {
  const {
    currentTrack, isPlaying, togglePlay, playNext, playTrack,
    duration, currentTime, seek, setIsMinimized,
    queue, queueIndex,
  } = usePlayer();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tap, heavy } = useHaptics();
  const [showActionSheet, setShowActionSheet] = useState(false);

  const [radioSuggestions, setRadioSuggestions] = useState([]);
  const [showRadioEnd, setShowRadioEnd]         = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [trackToast, setTrackToast]             = useState(null);
  const prevTrackIdRef                          = React.useRef(null);

  const isQueueEnd = queue.length > 0 && queueIndex >= queue.length - 1 && !isPlaying && currentTime > 0 && duration > 0 && currentTime >= duration - 2;

  // Track change toast
  useEffect(() => {
    if (!currentTrack) return;
    if (prevTrackIdRef.current && prevTrackIdRef.current !== currentTrack.id) {
      setTrackToast({ title: currentTrack.title, artist: currentTrack.artist_name || currentTrack.artists?.artist_name });
      const t = setTimeout(() => setTrackToast(null), 3000);
      return () => clearTimeout(t);
    }
    prevTrackIdRef.current = currentTrack.id;
  }, [currentTrack?.id]); // eslint-disable-line

  useEffect(() => {
    if (!isQueueEnd || !currentTrack) return;
    if (radioSuggestions.length > 0) { setShowRadioEnd(true); return; }
    setLoadingSuggestions(true);
    const fetch = async () => {
      try {
        const filters = [];
        if (currentTrack.genre) filters.push(`genre.eq.${currentTrack.genre}`);
        if (currentTrack.mood)  filters.push(`mood.eq.${currentTrack.mood}`);
        const playedIds = queue.map(t => t.id).join(',');
        let query = supabase
          .from('tracks')
          .select('id, title, cover_artwork_url, artist_name, artist_slug, file_url, genre, mood, artists(artist_name, slug)')
          .eq('is_published', true)
          .not('id', 'in', `(${playedIds})`)
          .order('engagement_score', { ascending: false })
          .limit(4);
        if (filters.length > 0) query = query.or(filters.join(','));
        const { data } = await query;
        const norm = (data || []).map(t => ({
          ...t,
          artist_name: t.artists?.artist_name || t.artist_name || 'Unknown',
          artist_slug: t.artists?.slug || t.artist_slug || null,
        }));
        setRadioSuggestions(norm);
        if (norm.length > 0) setShowRadioEnd(true);
      } catch (err) { console.error('Radio end fetch:', err); }
      setLoadingSuggestions(false);
    };
    fetch();
  }, [isQueueEnd, currentTrack?.id]);

  const handlePlaySuggestion = (track) => {
    setShowRadioEnd(false);
    setRadioSuggestions([]);
    playTrack(track, radioSuggestions);
  };

  const handleDismissRadioEnd = () => {
    setShowRadioEnd(false);
  };

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

  const handleExpand = () => {
    tap();
    setIsMinimized(false);
  };

  return (
    <>
      {/* Track change toast */}
      {trackToast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[400] pointer-events-none" style={{ bottom: '90px' }}>
          <div className="flex items-center space-x-2.5 px-4 py-2.5 rounded-2xl shadow-2xl"
            style={{ backgroundColor: 'rgba(20,20,28,0.95)', border: '1px solid rgba(139,92,246,0.25)', backdropFilter: 'blur(12px)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate max-w-[200px]">{trackToast.title}</p>
              {trackToast.artist && (
                <p className="text-[10px] text-white/40 truncate max-w-[200px]">{trackToast.artist}</p>
              )}
            </div>
          </div>
        </div>
      )}
    <div
      className="md:hidden fixed left-0 right-0 z-50"
      style={{ bottom: 'calc(56px + var(--safe-area-bottom, 0px))' }}
    >
      {/* End-of-queue: More like this */}
      {showRadioEnd && radioSuggestions.length > 0 && (
        <div className="bg-[#111]/98 backdrop-blur-xl border-t border-white/[0.06] px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-semibold text-white/60">More like this</span>
            </div>
            <button onClick={handleDismissRadioEnd} className="text-[10px] text-white/25 hover:text-white/50 transition">Dismiss</button>
          </div>
          <div className="flex space-x-2 overflow-x-auto scrollbar-hide pb-1">
            {radioSuggestions.map(track => (
              <button
                key={track.id}
                onClick={() => handlePlaySuggestion(track)}
                className="flex-shrink-0 flex items-center space-x-2 px-2.5 py-2 rounded-xl bg-white/[0.05] border border-white/[0.07] hover:bg-white/[0.09] transition"
              >
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-white/20 text-sm">♪</div>}
                </div>
                <div className="text-left min-w-0">
                  <p className="text-xs font-medium text-white truncate max-w-[90px]">{track.title}</p>
                  <p className="text-[10px] text-white/40 truncate max-w-[90px]">{track.artist_name}</p>
                </div>
                <Play className="w-3 h-3 text-white/40 flex-shrink-0 ml-1" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Draggable progress bar */}
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
        onClick={handleExpand}
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">

          {/* Expand hint + Track info */}
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            {/* Artwork with expand chevron overlay */}
            <div className="relative w-11 h-11 flex-shrink-0">
              <div className="w-11 h-11 rounded-lg overflow-hidden bg-white/10">
                {currentTrack.cover_artwork_url
                  ? <img
                      src={currentTrack.cover_artwork_url}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover"
                      loading="eager"
                    />
                  : <div className="w-full h-full flex items-center justify-center text-white/30 text-lg">♪</div>}
              </div>
              {/* Chevron overlay — makes it obvious this is tappable */}
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 hover:opacity-100 transition">
                <ChevronUp className="w-4 h-4 text-white" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm text-white font-medium truncate leading-tight">{currentTrack.title}</p>
              <button
                onClick={handleArtistClick}
                className="text-xs text-white/50 truncate leading-tight mt-0.5 hover:text-white/80 transition text-left w-full block">
                {currentTrack.artist_name || 'Unknown Artist'}
              </button>
            </div>
          </div>

          {/* Expand pill — always visible affordance */}
          <button
            onClick={handleExpand}
            className="flex items-center space-x-1 px-2 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] mr-1 flex-shrink-0"
            aria-label="Open full player"
          >
            <ChevronUp className="w-3 h-3 text-white/40" />
            <span className="text-[9px] text-white/30 font-medium uppercase tracking-wide">Open</span>
          </button>

          {/* Controls */}
          <div className="flex items-center space-x-0.5" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
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
  );
}