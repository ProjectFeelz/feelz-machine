/**
 * ForYouPage.js
 *
 * TikTok-style vertical swipe feed.
 * Each card is fullscreen. Swipe up = next, swipe down = previous.
 * Tracks with youtube_url show the YouTube video instead of the vinyl.
 * Tracks without show the spinning VinylRecord exactly as in the full player.
 *
 * Right side action bar: Like · Comment · Add to Playlist · Follow · Share
 * Bottom: track title, artist name, genre pill, reason tag
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import ReactPlayer from 'react-player';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import VinylRecord from '../components/VinylRecord';
import {
  Heart, MessageCircle, ListMusic, UserCheck,
  Share2, Play, Pause, Loader, X, Send, ChevronUp,
  Sparkles, Volume2, VolumeX,
} from 'lucide-react';

const SWIPE_THRESHOLD = 60;
const PRELOAD_AHEAD   = 2;
const PAGE_SIZE       = 20;

// ── Comment sheet ─────────────────────────────────────────────────────────────
function CommentSheet({ track, user, onClose }) {
  const [comments, setComments] = useState([]);
  const [text, setText]         = useState('');
  const [posting, setPosting]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const inputRef                = useRef(null);

  useEffect(() => {
    supabase
      .from('track_comments')
      .select('id, content, created_at, user_id, user_profiles(name, avatar_url), artists(artist_name, profile_image_url)')
      .eq('track_id', track.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setComments(data || []); setLoading(false); });
    setTimeout(() => inputRef.current?.focus(), 300);
  }, [track.id]);

  const post = async () => {
    if (!text.trim() || !user || posting) return;
    setPosting(true);
    const { data } = await supabase
      .from('track_comments')
      .insert({ track_id: track.id, user_id: user.id, content: text.trim() })
      .select('id, content, created_at, user_id')
      .single();
    if (data) setComments(prev => [data, ...prev]);
    setText('');
    setPosting(false);
  };

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-50 rounded-t-3xl overflow-hidden flex flex-col"
      style={{ background: 'rgba(10,10,10,0.97)', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '70vh' }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex justify-between items-center px-5 py-4 flex-shrink-0 border-b border-white/[0.06]">
        <p className="text-sm font-bold text-white">Comments</p>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06]">
          <X className="w-3.5 h-3.5 text-white/60" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading ? (
          <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
        ) : comments.length === 0 ? (
          <p className="text-center text-white/30 text-sm py-8">No comments yet. Be first.</p>
        ) : comments.map(c => (
          <div key={c.id} className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
              {(c.artists?.profile_image_url || c.user_profiles?.avatar_url)
                ? <img src={c.artists?.profile_image_url || c.user_profiles?.avatar_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-xs text-white/30 font-bold">{(c.artists?.artist_name || c.user_profiles?.name || '?')[0]}</span>}
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-white/60 mb-0.5">
                {c.artists?.artist_name || c.user_profiles?.name || 'Listener'}
              </p>
              <p className="text-sm text-white/90 leading-relaxed">{c.content}</p>
            </div>
          </div>
        ))}
      </div>
      <div
        className="flex items-center space-x-3 px-4 py-3 border-t border-white/[0.06] flex-shrink-0"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <input
          ref={inputRef} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && post()}
          placeholder="Add a comment…" maxLength={300}
          className="flex-1 bg-white/[0.06] rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none border border-white/[0.06] focus:border-white/20"
        />
        <button
          onClick={post} disabled={!text.trim() || !user || posting}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition disabled:opacity-30"
          style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)' }}
        >
          {posting ? <Loader className="w-4 h-4 animate-spin text-purple-400" /> : <Send className="w-4 h-4 text-purple-400" />}
        </button>
      </div>
    </div>
  );
}

// ── Playlist sheet ────────────────────────────────────────────────────────────
function PlaylistSheet({ track, user, onClose, navigate }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [added, setAdded]         = useState(new Set());

  useEffect(() => {
    if (!user) return;
    supabase.from('playlists').select('id, name').eq('user_id', user.id).order('name')
      .then(({ data }) => { setPlaylists(data || []); setLoading(false); });
  }, [user]);

  const add = async (playlistId) => {
    const { data: existing } = await supabase.from('playlist_tracks').select('id')
      .eq('playlist_id', playlistId).eq('track_id', track.id).maybeSingle();
    if (!existing) {
      const { data: last } = await supabase.from('playlist_tracks').select('position')
        .eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle();
      await supabase.from('playlist_tracks').insert({
        playlist_id: playlistId, track_id: track.id, position: (last?.position ?? -1) + 1,
      });
    }
    setAdded(prev => new Set([...prev, playlistId]));
  };

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-50 rounded-t-3xl overflow-hidden flex flex-col"
      style={{ background: 'rgba(10,10,10,0.97)', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '60vh' }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.06] flex-shrink-0">
        <p className="text-sm font-bold text-white">Add to Playlist</p>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06]">
          <X className="w-3.5 h-3.5 text-white/60" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
        ) : playlists.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-white/30">No playlists yet</p>
            <button onClick={() => { onClose(); navigate('/library/playlists'); }}
              className="text-xs text-purple-400 hover:text-purple-300 transition">Create one →</button>
          </div>
        ) : playlists.map(pl => (
          <button key={pl.id} onClick={() => add(pl.id)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.04] transition border-b border-white/[0.04]">
            <p className="text-sm text-white">{pl.name}</p>
            {added.has(pl.id)
              ? <span className="text-[10px] text-green-400 font-bold">Added ✓</span>
              : <span className="text-[10px] text-white/30">Add</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Single card ───────────────────────────────────────────────────────────────
function ForYouCard({ track, isActive, user, navigate }) {
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayer();
  const hasVideo  = !!track.youtube_url;
  const isThisOne = currentTrack?.id === track.id;
  const playing   = isThisOne && isPlaying;

  const [liked, setLiked]             = useState(false);
  const [likeCount, setLikeCount]     = useState(0);
  const [following, setFollowing]     = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [sheet, setSheet]             = useState(null);
  const [muted, setMuted]             = useState(true);

  useEffect(() => {
    if (!track.id) return;
    supabase.from('track_likes').select('*', { count: 'exact', head: true }).eq('track_id', track.id)
      .then(({ count }) => setLikeCount(count || 0));
    if (user) {
      supabase.from('track_likes').select('id').eq('track_id', track.id).eq('user_id', user.id).maybeSingle()
        .then(({ data }) => setLiked(!!data));
      if (track.artist_id) {
        supabase.from('follows').select('id').eq('artist_id', track.artist_id).eq('follower_id', user.id).maybeSingle()
          .then(({ data }) => setFollowing(!!data));
      }
    }
    supabase.from('track_comments').select('*', { count: 'exact', head: true }).eq('track_id', track.id)
      .then(({ count }) => setCommentCount(count || 0));
  }, [track.id, user?.id, track.artist_id]);

  useEffect(() => {
    if (isActive && !hasVideo) {
      if (!isThisOne) playTrack(track, [track]);
      else if (!isPlaying) togglePlay();
    }
  }, [isActive]); // eslint-disable-line

  const handleLike = async () => {
    if (!user) { navigate('/login'); return; }
    if (liked) {
      await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id);
      setLiked(false); setLikeCount(p => Math.max(0, p - 1));
    } else {
      await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });
      setLiked(true); setLikeCount(p => p + 1);
    }
  };

  const handleFollow = async () => {
    if (!user) { navigate('/login'); return; }
    if (!track.artist_id) return;
    if (following) {
      await supabase.from('follows').delete().eq('artist_id', track.artist_id).eq('follower_id', user.id);
      setFollowing(false);
    } else {
      await supabase.from('follows').insert({ artist_id: track.artist_id, follower_id: user.id });
      setFollowing(true);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/@${track.artist_slug}`;
    if (navigator.share) navigator.share({ title: track.title, text: `${track.title} by ${track.artist_name}`, url });
    else navigator.clipboard.writeText(url);
  };

  const handleTap = () => {
    if (sheet) { setSheet(null); return; }
    if (hasVideo) return;
    if (!isThisOne) { playTrack(track, [track]); return; }
    togglePlay();
  };

  const vinylSize = Math.min(window.innerWidth - 120, window.innerHeight * 0.42);
  const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none" onClick={handleTap}>

      {/* Blurred background */}
      <div className="absolute inset-0 overflow-hidden">
        {track.cover_artwork_url && (
          <img src={track.cover_artwork_url} alt=""
            className="w-full h-full object-cover"
            style={{ filter: 'blur(40px) brightness(0.25)', transform: 'scale(1.15)' }} />
        )}
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* YouTube video */}
      {hasVideo && isActive && (
        <div className="absolute inset-0 z-10">
          <ReactPlayer
            url={track.youtube_url} playing={isActive} muted={muted} loop
            width="100%" height="100%"
            style={{ position: 'absolute', top: 0, left: 0 }}
            config={{ youtube: { playerVars: { controls: 0, modestbranding: 1, rel: 0, showinfo: 0, iv_load_policy: 3, playsinline: 1, autoplay: 1 } } }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70 z-10 pointer-events-none" />
          <button
            onClick={e => { e.stopPropagation(); setMuted(m => !m); }}
            className="absolute top-16 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-black/50"
          >
            {muted ? <VolumeX className="w-4 h-4 text-white/70" /> : <Volume2 className="w-4 h-4 text-white/70" />}
          </button>
        </div>
      )}

      {/* Vinyl */}
      {!hasVideo && (
        <div className="relative z-10 flex items-center justify-center">
          <VinylRecord coverUrl={track.cover_artwork_url} isPlaying={playing} size={vinylSize} />
          {!playing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur flex items-center justify-center"
                style={{ animation: 'fadeOutHint 1.5s ease forwards' }}>
                <Play className="w-7 h-7 text-white ml-1" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Right action bar */}
      <div className="absolute right-3 bottom-36 z-20 flex flex-col items-center space-y-5"
        onClick={e => e.stopPropagation()}>

        {/* Artist avatar */}
        <div className="flex flex-col items-center space-y-1">
          <button onClick={() => navigate(`/artist/${track.artist_slug}`)}
            className="w-11 h-11 rounded-full overflow-hidden border-2 border-white/30">
            {track.artist_image
              ? <img src={track.artist_image} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-purple-500/30 flex items-center justify-center text-sm font-bold text-white">{track.artist_name?.[0]}</div>}
          </button>
          <button onClick={handleFollow}
            className="w-5 h-5 rounded-full flex items-center justify-center -mt-2.5 border border-white transition"
            style={{ background: following ? '#22c55e' : '#ef4444' }}>
            {following
              ? <UserCheck className="w-2.5 h-2.5 text-white" />
              : <span className="text-white text-[10px] font-black leading-none">+</span>}
          </button>
        </div>

        {/* Like */}
        <button onClick={handleLike} className="flex flex-col items-center space-y-1">
          <div className="w-11 h-11 flex items-center justify-center">
            <Heart className="w-7 h-7 transition-transform active:scale-125"
              fill={liked ? '#ef4444' : 'none'}
              color={liked ? '#ef4444' : 'rgba(255,255,255,0.9)'}
              strokeWidth={liked ? 0 : 2} />
          </div>
          <span className="text-[11px] font-semibold text-white/80">{fmt(likeCount)}</span>
        </button>

        {/* Comment */}
        <button onClick={() => setSheet(s => s === 'comments' ? null : 'comments')}
          className="flex flex-col items-center space-y-1">
          <div className="w-11 h-11 flex items-center justify-center">
            <MessageCircle className="w-7 h-7 text-white/90" strokeWidth={2} />
          </div>
          <span className="text-[11px] font-semibold text-white/80">{fmt(commentCount)}</span>
        </button>

        {/* Playlist */}
        <button onClick={() => setSheet(s => s === 'playlist' ? null : 'playlist')}
          className="flex flex-col items-center space-y-1">
          <div className="w-11 h-11 flex items-center justify-center">
            <ListMusic className="w-7 h-7 text-white/90" strokeWidth={2} />
          </div>
          <span className="text-[11px] font-semibold text-white/80">Save</span>
        </button>

        {/* Share */}
        <button onClick={handleShare} className="flex flex-col items-center space-y-1">
          <div className="w-11 h-11 flex items-center justify-center">
            <Share2 className="w-6 h-6 text-white/90" strokeWidth={2} />
          </div>
          <span className="text-[11px] font-semibold text-white/80">Share</span>
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-8 left-4 right-16 z-20" onClick={e => e.stopPropagation()}>
        <button onClick={() => navigate(`/artist/${track.artist_slug}`)}
          className="text-[13px] font-bold text-white/60 mb-1 text-left hover:text-white transition block">
          @{track.artist_slug || track.artist_name}
        </button>
        <p className="text-lg font-black text-white leading-tight mb-2">{track.title}</p>
        <div className="flex items-center flex-wrap gap-1.5">
          {track.genre && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(167,139,250,0.2)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
              {track.genre}
            </span>
          )}
          {track.reason && !['coldstart','recommended'].includes(track.reason) && (
            <span className="text-[10px] text-white/30 font-medium">
              {track.reason === 'from_following' ? '· Following'
                : track.reason === 'new_release' ? '· Just dropped'
                : track.reason === 'hidden_gem'  ? '· Hidden gem'
                : track.reason === 'trending'    ? '· Trending'
                : ''}
            </span>
          )}
        </div>
      </div>

      {/* First card swipe hint */}
      {track._isFirst && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-30"
          style={{ animation: 'swipeHint 2.5s ease 2s forwards', opacity: 0 }}>
          <div className="flex flex-col items-center space-y-1 text-white/40">
            <ChevronUp className="w-6 h-6" />
            <span className="text-xs font-medium">Swipe up</span>
          </div>
        </div>
      )}

      {/* Sheets */}
      {sheet === 'comments' && (
        <CommentSheet track={track} user={user} onClose={() => setSheet(null)} />
      )}
      {sheet === 'playlist' && (
        <PlaylistSheet track={track} user={user} onClose={() => setSheet(null)} navigate={navigate} />
      )}

      <style>{`
        @keyframes fadeOutHint {
          0%   { opacity: 1; }
          60%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes swipeHint {
          0%   { opacity: 0; transform: translateY(0); }
          20%  { opacity: 1; }
          80%  { opacity: 1; transform: translateY(-14px); }
          100% { opacity: 0; transform: translateY(-14px); }
        }
      `}</style>
    </div>
  );
}

// ── Main feed ─────────────────────────────────────────────────────────────────
export default function ForYouPage() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const { togglePlay } = usePlayer();

  const [tracks, setTracks]           = useState([]);
  const [idx, setIdx]                 = useState(0);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const touchStartY  = useRef(null);
  const touchStartX  = useRef(null);
  const dragging     = useRef(false);
  const dragYRef     = useRef(0);
  const [dragOffset, setDragOffset]   = useState(0);

  const loadTracks = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    try {
      let fetched = [];

      if (user) {
        const { data: recData } = await supabase
          .from('listener_recommendations')
          .select('score, reason, tracks(id, title, genre, mood, cover_artwork_url, file_url, youtube_url, duration, artist_id, artists(artist_name, slug, profile_image_url))')
          .eq('user_id', user.id)
          .order('score', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (recData?.length > 0) {
          fetched = recData.filter(r => r.tracks).map(r => ({
            ...r.tracks,
            artist_name:  r.tracks.artists?.artist_name || 'Unknown',
            artist_slug:  r.tracks.artists?.slug || null,
            artist_image: r.tracks.artists?.profile_image_url || null,
            reason: r.reason,
          }));
        }
      }

      if (fetched.length < PAGE_SIZE) {
        const existingIds = fetched.map(t => t.id);
        let query = supabase.from('tracks')
          .select('id, title, genre, mood, cover_artwork_url, file_url, youtube_url, duration, artist_id, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .order('engagement_score', { ascending: false })
          .limit(PAGE_SIZE - fetched.length);
        if (existingIds.length > 0) query = query.not('id', 'in', `(${existingIds.join(',')})`);
        const { data: trending } = await query;
        fetched = [...fetched, ...(trending || []).map(t => ({
          ...t,
          artist_name:  t.artists?.artist_name || 'Unknown',
          artist_slug:  t.artists?.slug || null,
          artist_image: t.artists?.profile_image_url || null,
          reason: 'trending',
        }))];
      }

      if (offset === 0 && fetched.length > 0) fetched[0]._isFirst = true;
      setTracks(prev => offset === 0 ? fetched : [...prev, ...fetched]);
    } catch (err) {
      console.error('ForYou load error:', err);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [user]);

  useEffect(() => { loadTracks(0); }, [loadTracks]);

  useEffect(() => {
    if (idx >= tracks.length - 3 && !loadingMore && tracks.length > 0) loadTracks(tracks.length);
  }, [idx, tracks.length, loadingMore, loadTracks]);

  const goTo = useCallback((newIdx) => {
    if (newIdx < 0 || newIdx >= tracks.length) return;
    setIdx(newIdx);
    setDragOffset(0);
  }, [tracks.length]);

  const onTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    dragging.current = false;
    dragYRef.current = 0;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (touchStartY.current === null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    const dx = e.touches[0].clientX - touchStartX.current;
    if (!dragging.current) {
      if (Math.abs(dx) > Math.abs(dy)) return;
      dragging.current = true;
    }
    e.preventDefault();
    dragYRef.current = dy;
    setDragOffset(dy * 0.3);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    const dy = dragYRef.current;
    if (dy < -SWIPE_THRESHOLD) goTo(idx + 1);
    else if (dy > SWIPE_THRESHOLD) goTo(idx - 1);
    else setDragOffset(0);
    dragging.current = false;
    touchStartY.current = null;
  }, [idx, goTo]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowUp')   goTo(idx - 1);
      if (e.key === 'ArrowDown') goTo(idx + 1);
      if (e.key === ' ')         togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, goTo, togglePlay]);

  const visibleRange = useMemo(() => {
    const start = Math.max(0, idx - 1);
    const end   = Math.min(tracks.length - 1, idx + PRELOAD_AHEAD);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [idx, tracks.length]);

  const vh = window.innerHeight;

  if (loading) return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
      <Sparkles className="w-8 h-8 text-purple-400 mb-3" />
      <p className="text-sm text-white/40">Building your feed…</p>
    </div>
  );

  if (!tracks.length) return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center px-8 text-center">
      <Sparkles className="w-10 h-10 text-white/10 mb-4" />
      <p className="text-white/40 text-sm mb-2">No tracks yet</p>
      <button onClick={() => navigate('/browse')}
        className="mt-3 px-5 py-2.5 bg-white text-black rounded-xl text-sm font-semibold">Explore Music</button>
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ touchAction: 'none' }}
    >
      <Helmet><title>For You · Feelz Machine</title></Helmet>

      {/* Card stack */}
      <div
        className="relative w-full h-full"
        style={{
          transform: `translateY(${-idx * vh + dragOffset}px)`,
          transition: dragging.current ? 'none' : 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)',
          willChange: 'transform',
        }}
      >
        {visibleRange.map(i => (
          <div key={tracks[i].id} className="absolute inset-x-0" style={{ top: i * vh, height: vh }}>
            <ForYouCard track={tracks[i]} isActive={i === idx} user={user} navigate={navigate} />
          </div>
        ))}
      </div>

      {/* Status bar gradient */}
      <div className="absolute top-0 inset-x-0 h-20 pointer-events-none z-30"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }} />

      {loadingMore && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30">
          <Loader className="w-4 h-4 animate-spin text-white/30" />
        </div>
      )}
    </div>
  );
}