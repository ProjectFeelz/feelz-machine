import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useHaptics } from '../hooks/useHaptics';
import { Check, Loader, Music, Play, Square, Verified } from 'lucide-react';

const MIN_FOLLOWS   = 3;
const PREVIEW_START = 30;  // seek to 30s
const PREVIEW_END   = 45;  // stop at 45s

/**
 * ArtistFollowPrompt
 *
 * Modal that appears after ProfileSetup step 4.
 * Shows top artists, lets users tap to preview 15s of their top track,
 * and requires following at least MIN_FOLLOWS before continuing.
 *
 * Props:
 *   onComplete - called when user taps Continue
 */
export default function ArtistFollowPrompt({ onComplete }) {
  const { user } = useAuth();
  const { tap, success } = useHaptics();

  const [artists, setArtists]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [following, setFollowing]     = useState({}); // { artistId: true }
  const [following_req, setFollReq]   = useState({}); // { artistId: true } loading state
  const [previewingId, setPreviewingId] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);

  const audioRef  = useRef(null);
  const timerRef  = useRef(null);

  // ── Fetch artists with their top track ──────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: artistData } = await supabase
        .from('artists')
        .select('id, artist_name, slug, profile_image_url, is_verified, follower_count, genre')
        .order('follower_count', { ascending: false })
        .limit(20);

      if (!artistData?.length) { setLoading(false); return; }

      // Fetch top track for each artist (for previewing)
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

      // Filter out artists without a top track for preview quality
      const enriched = withTracks.filter(a => a.id !== user?.id);
      setArtists(enriched);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  // ── Cleanup audio on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, []);

  // ── Audio preview ────────────────────────────────────────────────────────
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

    // Toggle off if already previewing this artist
    if (previewingId === artist.id) {
      stopPreview();
      return;
    }

    // Stop any existing preview
    stopPreview();

    setPreviewLoading(artist.id);

    try {
      const audio       = new Audio();
      audioRef.current  = audio;
      audio.src         = artist.topTrack.file_url;
      audio.volume      = 0.8;
      audio.preload     = 'auto';

      await new Promise((resolve, reject) => {
        audio.addEventListener('canplay', resolve, { once: true });
        audio.addEventListener('error',   reject,  { once: true });
        audio.load();
      });

      audio.currentTime = PREVIEW_START;
      await audio.play();
      setPreviewLoading(null);
      setPreviewingId(artist.id);

      // Auto-stop at PREVIEW_END
      const remaining = (PREVIEW_END - PREVIEW_START) * 1000;
      timerRef.current = setTimeout(() => {
        stopPreview();
      }, remaining);

      // Also stop when audio ends naturally before preview window
      audio.addEventListener('ended', stopPreview, { once: true });

    } catch (err) {
      console.warn('Preview failed:', err);
      setPreviewLoading(null);
      setPreviewingId(null);
    }
  }, [previewingId, stopPreview, tap]);

  // ── Follow / unfollow ────────────────────────────────────────────────────
  const toggleFollow = async (artist) => {
    if (!user) return;
    tap();
    const isFollowing = following[artist.id];
    setFollReq(prev => ({ ...prev, [artist.id]: true }));

    if (isFollowing) {
      await supabase.from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('artist_id', artist.id);
      setFollowing(prev => { const n = { ...prev }; delete n[artist.id]; return n; });
    } else {
      await supabase.from('follows')
        .insert({ follower_id: user.id, artist_id: artist.id });
      success();
      setFollowing(prev => ({ ...prev, [artist.id]: true }));
    }

    setFollReq(prev => { const n = { ...prev }; delete n[artist.id]; return n; });
  };

  const followCount = Object.keys(following).length;
  const canContinue = followCount >= MIN_FOLLOWS;

  const handleContinue = () => {
    tap();
    stopPreview();
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-14 pb-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.06] flex items-center justify-center mx-auto mb-4">
          <Music className="w-6 h-6 text-purple-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Follow some artists</h1>
        <p className="text-sm text-white/40 leading-relaxed">
          Tap an artist to hear a preview, then follow to personalise your feed.
          Follow at least {MIN_FOLLOWS} to continue.
        </p>

        {/* Follow counter */}
        <div className="flex items-center justify-center space-x-1.5 mt-4">
          {Array.from({ length: MIN_FOLLOWS }).map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: i < followCount
                  ? '#8B5CF6'
                  : 'rgba(255,255,255,0.1)',
                transform: i < followCount ? 'scale(1.3)' : 'scale(1)',
              }}
            />
          ))}
          {followCount > MIN_FOLLOWS && (
            <span className="text-xs text-purple-400 font-medium ml-1">+{followCount - MIN_FOLLOWS}</span>
          )}
        </div>
      </div>

      {/* Artist grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader className="w-6 h-6 animate-spin text-white/20" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-32">
          <div className="grid grid-cols-2 gap-3">
            {artists.map((artist) => {
              const isFollowed  = !!following[artist.id];
              const isPreviewing = previewingId === artist.id;
              const isLoadingPreview = previewLoading === artist.id;
              const isFollowingReq = !!following_req[artist.id];
              const hasTrack    = !!artist.topTrack?.file_url;

              return (
                <div
                  key={artist.id}
                  className={`relative rounded-2xl overflow-hidden border transition-all duration-200 ${
                    isFollowed
                      ? 'border-purple-500/40 bg-purple-500/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.03]'
                  }`}
                >
                  <div className="p-3">
                    {/* Avatar + preview button */}
                    <div className="relative mb-2.5">
                      <div
                        className="w-full aspect-square rounded-xl overflow-hidden bg-white/[0.06] cursor-pointer"
                        onClick={() => hasTrack && startPreview(artist)}
                      >
                        {artist.profile_image_url ? (
                          <img
                            src={artist.profile_image_url}
                            alt={artist.artist_name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-blue-600/20">
                            <span className="text-2xl font-bold text-white/40">
                              {artist.artist_name?.[0]}
                            </span>
                          </div>
                        )}

                        {/* Preview overlay */}
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

                        {/* Now playing pulse ring */}
                        {isPreviewing && (
                          <div className="absolute inset-0 rounded-xl border-2 border-purple-400 animate-pulse" />
                        )}
                      </div>
                    </div>

                    {/* Artist info */}
                    <div className="mb-2.5">
                      <div className="flex items-center space-x-1">
                        <p className="text-sm font-semibold text-white truncate">{artist.artist_name}</p>
                        {artist.is_verified && <Verified className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                      </div>
                      {artist.topTrack && (
                        <p className="text-[10px] text-white/30 truncate mt-0.5">
                          ♪ {artist.topTrack.title}
                        </p>
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
                      }`}
                    >
                      {isFollowingReq ? (
                        <Loader className="w-3 h-3 animate-spin" />
                      ) : isFollowed ? (
                        <><Check className="w-3 h-3" /><span>Following</span></>
                      ) : (
                        <span>Follow</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Continue button — fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 px-6 pb-10 pt-4 bg-gradient-to-t from-black via-black/95 to-transparent">
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all active:scale-98 ${
            canContinue
              ? 'bg-white text-black shadow-lg shadow-white/10'
              : 'bg-white/[0.06] text-white/20 cursor-not-allowed'
          }`}
        >
          {canContinue
            ? `Continue → Following ${followCount}`
            : `Follow ${MIN_FOLLOWS - followCount} more to continue`}
        </button>
      </div>
    </div>
  );
}
