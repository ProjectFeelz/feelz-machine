import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useHaptics } from '../hooks/useHaptics';
import { Check, Loader, Music, Play, Square, ChevronRight } from 'lucide-react';

const MIN_FOLLOWS   = 3;
const PREVIEW_START = 30;
const PREVIEW_END   = 45;

// Genre options with emojis — matches your GENRES list in TrackUploadPanel
const GENRE_OPTIONS = [
  { label: 'Afro House',     emoji: '🌍' },
  { label: 'Amapiano',       emoji: '🎹' },
  { label: 'Hip Hop',        emoji: '🎤' },
  { label: 'R&B / Soul',     emoji: '💜' },
  { label: 'Electronic',     emoji: '⚡' },
  { label: 'Afrobeats',      emoji: '🥁' },
  { label: 'Pop',            emoji: '✨' },
  { label: 'Jazz',           emoji: '🎷' },
  { label: 'Gospel',         emoji: '🙏' },
  { label: 'Reggae',         emoji: '🌴' },
  { label: 'Deep House',     emoji: '🔊' },
  { label: 'Gqom',           emoji: '💥' },
  { label: 'Kwaito',         emoji: '🎶' },
  { label: 'Drill',          emoji: '🔩' },
  { label: 'Trap',           emoji: '🎯' },
  { label: 'Alternative',    emoji: '🎸' },
  { label: 'Classical',      emoji: '🎻' },
  { label: 'Other',          emoji: '🎵' },
];

export default function ArtistFollowPrompt({ onDone }) {
  const { user } = useAuth();
  const { tap, success } = useHaptics();

  // Step 1 = genre picker, Step 2 = artist grid
  const [step, setStep]                     = useState(1);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [allArtists, setAllArtists]         = useState([]);
  const [displayArtists, setDisplayArtists] = useState([]);
  const [loading, setLoading]               = useState(false);
  const [following, setFollowing]           = useState({});
  const [followingReq, setFollowingReq]     = useState({});
  const [previewingId, setPreviewingId]     = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);

  const audioRef = useRef(null);
  const timerRef = useRef(null);

  // Load ALL artists once (with their top track) — we filter client-side by genre
  const loadArtists = useCallback(async () => {
    setLoading(true);
    const { data: artistData } = await supabase
      .from('artists')
      .select('id, artist_name, slug, profile_image_url, is_verified, follower_count, genre')
      .not('profile_image_url', 'is', null)
      .neq('profile_image_url', '')
      .order('follower_count', { ascending: false })
      .limit(60);

    if (!artistData?.length) { setLoading(false); return; }

    const withTracks = await Promise.all(
      (artistData || []).map(async (a) => {
        const { data: tracks } = await supabase
          .from('tracks')
          .select('id, title, file_url, cover_artwork_url')
          .eq('artist_id', a.id)
          .eq('is_published', true)
          .order('stream_count', { ascending: false })
          .limit(1);
        return { ...a, topTrack: tracks?.[0] || null };
      })
    );

    const enriched = withTracks.filter(a => a.id !== user?.id);
    setAllArtists(enriched);
    setLoading(false);
  }, [user?.id]);

  // When genres are confirmed, filter artists. If no match, show all.
  const applyGenreFilter = useCallback((genres) => {
    if (!genres.length) {
      setDisplayArtists(allArtists);
      return;
    }
    const normalise = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const genreSet  = new Set(genres.map(normalise));
    const matched   = allArtists.filter(a => genreSet.has(normalise(a.genre)));
    // If fewer than 6 matched artists, pad with popular ones to avoid an empty screen
    if (matched.length < 6) {
      const matchedIds = new Set(matched.map(a => a.id));
      const padding    = allArtists.filter(a => !matchedIds.has(a.id)).slice(0, 12 - matched.length);
      setDisplayArtists([...matched, ...padding]);
    } else {
      setDisplayArtists(matched);
    }
  }, [allArtists]);

  const handleGenreToggle = (label) => {
    tap();
    setSelectedGenres(prev =>
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  const handleGenreContinue = async () => {
    tap();
    if (!allArtists.length) await loadArtists();
    applyGenreFilter(selectedGenres);
    setStep(2);
  };

  // Re-filter when allArtists loads after step change
  useEffect(() => {
    if (step === 2 && allArtists.length) applyGenreFilter(selectedGenres);
  }, [allArtists, step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { stopPreview(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    clearTimeout(timerRef.current);
    setPreviewingId(null);
    setPreviewLoading(null);
  }, []);

  const startPreview = useCallback(async (artist) => {
    tap();
    if (!artist.topTrack?.file_url) return;
    if (previewingId === artist.id) { stopPreview(); return; }
    stopPreview();
    setPreviewLoading(artist.id);
    try {
      const audio      = new Audio();
      audioRef.current = audio;
      audio.src        = artist.topTrack.file_url;
      audio.volume     = 0.8;
      audio.preload    = 'auto';
      await new Promise((resolve, reject) => {
        audio.addEventListener('canplay', resolve, { once: true });
        audio.addEventListener('error',   reject,  { once: true });
        audio.load();
      });
      audio.currentTime = PREVIEW_START;
      await audio.play();
      setPreviewLoading(null);
      setPreviewingId(artist.id);
      timerRef.current = setTimeout(() => stopPreview(), (PREVIEW_END - PREVIEW_START) * 1000);
      audio.addEventListener('ended', stopPreview, { once: true });
    } catch (err) {
      console.warn('Preview failed:', err);
      setPreviewLoading(null);
      setPreviewingId(null);
    }
  }, [previewingId, stopPreview, tap]);

  const toggleFollow = async (artist) => {
    if (!user) return;
    tap();
    const isFollowed = following[artist.id];
    setFollowingReq(prev => ({ ...prev, [artist.id]: true }));
    if (isFollowed) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('artist_id', artist.id);
      setFollowing(prev => { const n = { ...prev }; delete n[artist.id]; return n; });
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, artist_id: artist.id });
      success();
      setFollowing(prev => ({ ...prev, [artist.id]: true }));
    }
    setFollowingReq(prev => { const n = { ...prev }; delete n[artist.id]; return n; });
  };

  const followCount = Object.keys(following).length;
  const canContinue = followCount >= MIN_FOLLOWS;

  const handleContinue = () => {
    tap();
    stopPreview();
    onDone();
  };

  // ── Step 1: Genre picker ────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div className="flex-1 flex flex-col w-full max-w-2xl mx-auto">
        <div className="flex-shrink-0 px-6 pt-14 pb-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/15 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🎵</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">What do you listen to?</h1>
          <p className="text-sm text-white/40 leading-relaxed">
            Pick your genres and we'll show you artists you'll actually want to follow.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-36">
          <div className="grid grid-cols-2 gap-2.5">
            {GENRE_OPTIONS.map(({ label, emoji }) => {
              const selected = selectedGenres.includes(label);
              return (
                <button
                  key={label}
                  onClick={() => handleGenreToggle(label)}
                  className={`flex items-center space-x-3 px-4 py-3.5 rounded-2xl border transition-all active:scale-95 text-left ${
                    selected
                      ? 'border-purple-500/50 bg-purple-500/15 text-white'
                      : 'border-white/[0.07] bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="text-xl flex-shrink-0">{emoji}</span>
                  <span className="text-sm font-medium truncate">{label}</span>
                  {selected && (
                    <div className="ml-auto flex-shrink-0 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-6 pb-10 pt-4 bg-gradient-to-t from-black via-black/95 to-transparent">
          <button
            onClick={handleGenreContinue}
            className="w-full py-4 rounded-2xl font-bold text-base bg-white text-black shadow-lg shadow-white/10 transition-all active:scale-98 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>{selectedGenres.length > 0 ? `Show ${selectedGenres.length} genre${selectedGenres.length > 1 ? 's' : ''}` : 'Show me everyone'}</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
          {selectedGenres.length === 0 && (
            <p className="text-center text-xs text-white/20 mt-2">No preference? We'll show you all artists</p>
          )}
        </div>
      </div>
      </div>
    );
  }

  // ── Step 2: Artist grid ─────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div className="flex-1 flex flex-col w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-14 pb-5 text-center">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.06] flex items-center justify-center mx-auto mb-4">
          <Music className="w-6 h-6 text-purple-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          {selectedGenres.length > 0 ? 'Artists you might love' : 'Follow some artists'}
        </h1>
        <p className="text-sm text-white/40 leading-relaxed">
          Tap to hear a preview, then follow to personalise your feed.
          Follow at least {MIN_FOLLOWS} to continue.
        </p>
        {/* Progress dots */}
        <div className="flex items-center justify-center space-x-1.5 mt-4">
          {Array.from({ length: MIN_FOLLOWS }).map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: i < followCount ? '#8B5CF6' : 'rgba(255,255,255,0.1)',
                transform: i < followCount ? 'scale(1.3)' : 'scale(1)',
              }} />
          ))}
          {followCount > MIN_FOLLOWS && (
            <span className="text-xs text-purple-400 font-medium ml-1">+{followCount - MIN_FOLLOWS}</span>
          )}
        </div>
        {/* Change genres link */}
        <button onClick={() => { stopPreview(); setStep(1); }}
          className="mt-2 text-xs text-white/25 hover:text-white/50 transition underline">
          Change genres
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader className="w-6 h-6 animate-spin text-white/20" />
        </div>
      ) : displayArtists.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <Music className="w-12 h-12 text-white/10 mb-3" />
          <p className="text-sm text-white/30 mb-6">No artists to show yet</p>
          <button onClick={handleContinue}
            className="px-6 py-3 bg-white text-black rounded-xl font-semibold text-sm">
            Skip for now
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-32">
          {/* Genre badge row */}
          {selectedGenres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {selectedGenres.map(g => (
                <span key={g} className="text-[11px] px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-300 font-medium">
                  {g}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {displayArtists.map((artist) => {
              const isFollowed       = !!following[artist.id];
              const isPreviewing     = previewingId === artist.id;
              const isLoadingPreview = previewLoading === artist.id;
              const isFollowingReq   = !!followingReq[artist.id];
              const hasTrack         = !!artist.topTrack?.file_url;

              return (
                <div key={artist.id}
                  className={`relative rounded-2xl overflow-hidden border transition-all duration-200 ${
                    isFollowed
                      ? 'border-purple-500/40 bg-purple-500/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.03]'
                  }`}>
                  <div className="p-3">
                    {/* Avatar */}
                    <div className="relative mb-2.5">
                      <div
                        className="w-full aspect-square rounded-xl overflow-hidden bg-white/[0.06] cursor-pointer"
                        onClick={() => hasTrack && startPreview(artist)}
                      >
                        <img
                          src={artist.profile_image_url}
                          alt={artist.artist_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {hasTrack && (
                          <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity rounded-xl ${
                            isPreviewing || isLoadingPreview ? 'opacity-100' : 'opacity-0 hover:opacity-100'
                          }`}>
                            {isLoadingPreview ? (
                              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                                <Loader className="w-4 h-4 text-white animate-spin" />
                              </div>
                            ) : isPreviewing ? (
                              <div className="w-10 h-10 rounded-full bg-purple-500/80 backdrop-blur flex items-center justify-center">
                                <Square className="w-4 h-4 text-white" fill="white" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                                <Play className="w-4 h-4 text-white ml-0.5" fill="white" />
                              </div>
                            )}
                          </div>
                        )}
                        {isPreviewing && (
                          <div className="absolute inset-0 rounded-xl border-2 border-purple-400 animate-pulse" />
                        )}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="mb-2.5">
                      <div className="flex items-center space-x-1">
                        <p className="text-sm font-semibold text-white truncate">{artist.artist_name}</p>
                        {artist.is_verified && (
                          <div className="w-3.5 h-3.5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                            <Check className="w-2 h-2 text-white" />
                          </div>
                        )}
                      </div>
                      {artist.genre && (
                        <p className="text-[10px] text-white/30 truncate mt-0.5">{artist.genre}</p>
                      )}
                      {artist.topTrack && (
                        <p className="text-[10px] text-white/20 truncate">♪ {artist.topTrack.title}</p>
                      )}
                    </div>

                    {/* Follow button */}
                    <button
                      onClick={() => toggleFollow(artist)}
                      disabled={isFollowingReq}
                      className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 flex items-center justify-center space-x-1.5 ${
                        isFollowed
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-white text-black hover:bg-white/90'
                      }`}>
                      {isFollowingReq
                        ? <Loader className="w-3 h-3 animate-spin" />
                        : isFollowed
                          ? <><Check className="w-3 h-3" /><span>Following</span></>
                          : <span>Follow</span>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Continue */}
      <div className="fixed bottom-0 left-0 right-0 px-6 pb-10 pt-4 bg-gradient-to-t from-black via-black/95 to-transparent">
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-98 ${
            canContinue
              ? 'bg-white text-black shadow-lg shadow-white/10'
              : 'bg-white/[0.06] text-white/20 cursor-not-allowed'
          }`}>
          {canContinue
            ? `Let's go  →  Following ${followCount}`
            : `Follow ${MIN_FOLLOWS - followCount} more to continue`}
        </button>
      </div>
      </div>
    </div>
  );
}
