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
import { ArtistStoryView } from '../components/ArtistStories';
import {
  Heart, MessageCircle, ListMusic, UserCheck,
  Share2, Loader, X, Send, ChevronUp,
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



// ── LRC parser (same as FullPlayer) ──────────────────────────────────────────
function parseLRC(raw) {
  if (!raw) return null;
  const lines = raw.split('\n');
  const parsed = [];
  const LRC_RE = /^\[(\d{1,2}):(\d{2})(?:[.:](\ d{1,3}))?\]\s*(.*)$/;
  let matched = 0;
  for (const line of lines) {
    const m = line.match(/^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
    if (m) {
      matched++;
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const ms   = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      const text = m[4].trim();
      parsed.push({ time: mins * 60 + secs + ms / 1000, text });
    }
  }
  return matched >= 2 ? parsed.sort((a, b) => a.time - b.time) : null;
}

// ── Caption overlay ───────────────────────────────────────────────────────────
function LyricsCaption({ lyrics, currentTime, isActive }) {
  const [visible, setVisible] = React.useState(true);
  if (!lyrics || !isActive) return null;

  const lrcLines = parseLRC(lyrics);

  if (lrcLines) {
    // Timestamped LRC — show active line
    const activeIdx = lrcLines.reduce((best, line, i) =>
      line.time <= currentTime ? i : best, -1);
    const activeLine = activeIdx >= 0 ? lrcLines[activeIdx] : null;
    const nextLine   = activeIdx >= 0 && activeIdx + 1 < lrcLines.length ? lrcLines[activeIdx + 1] : null;
    if (!activeLine?.text && !nextLine?.text) return null;
    return (
      <div className="absolute bottom-28 left-4 right-20 z-20 pointer-events-none">
        {activeLine?.text && (
          <p key={activeIdx} className="text-center text-white text-base font-bold leading-snug mb-1 drop-shadow-lg"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.7)', animation: 'lyricFade 0.3s ease' }}>
            {activeLine.text}
          </p>
        )}
        {nextLine?.text && (
          <p className="text-center text-white/40 text-sm leading-snug drop-shadow-lg"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}>
            {nextLine.text}
          </p>
        )}
      </div>
    );
  }

  // Plain text — show lines based on time position
  const lines = lyrics.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const totalLines = lines.length;
  // Rough estimate: show one line every 4 seconds
  const lineIdx = Math.min(Math.floor(currentTime / 4), totalLines - 1);
  const line = lines[lineIdx];
  if (!line) return null;
  return (
    <div className="absolute bottom-28 left-4 right-20 z-20 pointer-events-none">
      <p key={lineIdx} className="text-center text-white text-base font-bold leading-snug drop-shadow-lg"
        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.7)', animation: 'lyricFade 0.3s ease' }}>
        {line}
      </p>
    </div>
  );
}

// ── Story feed card ───────────────────────────────────────────────────────────
function StoryFeedCard({ item, isActive, onOpen, navigate }) {
  const { artist, stories } = item;
  const first = stories[0];
  const thumb = first?.media_url;

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none"
      onClick={onOpen}>
      <div className="absolute inset-0 overflow-hidden">
        {thumb && first?.media_type === 'image' && (
          <img src={thumb} alt="" className="w-full h-full object-cover"
            style={{ filter: 'blur(30px) brightness(0.3)', transform: 'scale(1.15)' }} />
        )}
        <div className="absolute inset-0 bg-black/50" />
      </div>
      <div className="absolute top-16 left-4 z-20">
        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
          style={{ background: 'linear-gradient(135deg,#a855f7,#ec4899)', color: '#fff' }}>
          STORY
        </span>
      </div>
      <div className="relative z-10 flex flex-col items-center space-y-4 px-8">
        <div className="w-24 h-24 rounded-full p-0.5 bg-gradient-to-tr from-purple-500 to-pink-400">
          <div className="w-full h-full rounded-full overflow-hidden bg-black border-2 border-black">
            {artist.profile_image_url
              ? <img src={artist.profile_image_url} alt={artist.artist_name} className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-purple-500/30 flex items-center justify-center text-2xl font-bold text-white">{artist.artist_name?.[0]}</div>}
          </div>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <p className="text-base font-bold text-white">{artist.artist_name}</p>
          <span className="text-xs text-white/50">{stories.length} new {stories.length === 1 ? 'story' : 'stories'}</span>
        </div>
        {stories.length > 1 && (
          <div className="flex space-x-2">
            {stories.slice(0, 3).map(s => (
              <div key={s.id} className="w-16 h-16 rounded-xl overflow-hidden bg-white/10 border border-white/20">
                {s.media_type === 'image'
                  ? <img src={s.media_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-2xl">{s.media_type === 'audio' ? '🎵' : '▶️'}</div>}
              </div>
            ))}
          </div>
        )}
        <div className="px-6 py-3 rounded-2xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.4),rgba(236,72,153,0.3))', border: '1px solid rgba(167,139,250,0.4)' }}>
          Tap to view
        </div>
      </div>
      <div className="absolute bottom-8 left-4 right-4 z-20 text-center">
        <button onClick={e => { e.stopPropagation(); navigate('/artist/' + artist.slug); }}
          className="text-xs text-white/40 hover:text-white/70 transition">
          @{artist.slug}
        </button>
      </div>
    </div>
  );
}

// ── Single card ───────────────────────────────────────────────────────────────
function ForYouCard({ track, isActive, user, navigate }) {
  const { currentTrack, isPlaying, currentTime, setIsMinimized } = usePlayer();
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

  // Auto-play when card becomes active
  useEffect(() => {
    if (isActive && !hasVideo && track.file_url) {
      if (!isThisOne) playTrack(track, [track]);
    }
  }, [isActive]); // eslint-disable-line

  const goToArtist = () => {
    setIsMinimized(true);
    navigate(`/artist/${track.artist_slug}`);
  };

  const handleTap = () => {
    if (sheet) { setSheet(null); return; }
    goToArtist();
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

        </div>
      )}

      {/* Lyrics captions */}
      {isThisOne && track.lyrics && (
        <LyricsCaption lyrics={track.lyrics} currentTime={currentTime} isActive={isActive} />
      )}

      {/* Right action bar */}
      <div className="absolute right-3 bottom-36 z-20 flex flex-col items-center space-y-5"
        onClick={e => e.stopPropagation()}>

        {/* Artist avatar */}
        <div className="flex flex-col items-center space-y-1">
          <button onClick={goToArtist}
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
        <button onClick={goToArtist}
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
        @keyframes lyricFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
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
  const { playTrack, setIsMinimized } = usePlayer();


  const [tracks, setTracks]           = useState([]);
  const [idx, setIdx]                 = useState(0);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewingStory, setViewingStory] = useState(null); // { artist, stories }

  const touchStartY  = useRef(null);
  const touchStartX  = useRef(null);
  const touchStartT  = useRef(0);      // timestamp for velocity calc
  const lastY        = useRef(0);       // last Y position
  const dragging     = useRef(false);
  const dragYRef     = useRef(0);
  const velocityRef  = useRef(0);       // px/ms at release
  const preloadedRef = useRef(new Set()); // track IDs already preloaded
  const [dragOffset, setDragOffset]   = useState(0);

  const loadTracks = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    try {
      let fetched = [];

      if (user) {
        const { data: recData } = await supabase
          .from('listener_recommendations')
          .select('score, reason, tracks(id, title, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, artists(artist_name, slug, profile_image_url))')
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
          .select('id, title, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, artists(artist_name, slug, profile_image_url)')
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

      // Fetch stories from followed artists — inject every 5 tracks
      if (offset === 0 && user) {
        try {
          const { data: follows } = await supabase
            .from('follows').select('artist_id').eq('follower_id', user.id).limit(20);
          if (follows?.length) {
            const artistIds = follows.map(f => f.artist_id);
            const { data: stories } = await supabase
              .from('artist_stories')
              .select('id, media_url, media_type, caption, expires_at, view_count, artist_id, artists(id, artist_name, slug, profile_image_url)')
              .in('artist_id', artistIds)
              .gt('expires_at', new Date().toISOString())
              .order('created_at', { ascending: false })
              .limit(10);
            if (stories?.length) {
              // Group by artist
              const byArtist = {};
              stories.forEach(s => {
                const aid = s.artist_id;
                if (!byArtist[aid]) byArtist[aid] = { artist: s.artists, stories: [] };
                byArtist[aid].stories.push(s);
              });
              // Build story cards and splice every 5 tracks
              const storyCards = Object.values(byArtist).map(g => ({
                _type: 'story',
                _id: `story-${g.artist.id}`,
                artist: g.artist,
                stories: g.stories,
              }));
              let result = [...fetched];
              storyCards.forEach((card, i) => {
                const pos = Math.min((i + 1) * 5, result.length);
                result.splice(pos, 0, card);
              });
              fetched = result;
            }
          }
        } catch {}
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

  // Preload next track's audio so it starts instantly when swiped to
  useEffect(() => {
    const next = tracks[idx + 1];
    if (next?.file_url && !next.youtube_url && !preloadedRef.current.has(next.id)) {
      preloadedRef.current.add(next.id);
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = next.file_url;
    }
  }, [idx, tracks]);

  // Single source of truth for playback — fires when idx changes
  const lastPlayedIdx = React.useRef(-1);
  useEffect(() => {
    if (!tracks.length) return;
    const item = tracks[idx];
    if (!item || item._type === 'story') return; // skip story cards
    if (idx === lastPlayedIdx.current) return;   // already played this idx
    lastPlayedIdx.current = idx;
    if (item.file_url && !item.youtube_url) {
      playTrack(item, [item]);
      setIsMinimized(true); // keep player hidden while on feed
    }
  }, [idx, tracks]); // eslint-disable-line

  const goTo = useCallback((newIdx) => {
    if (newIdx < 0 || newIdx >= tracks.length) return;
    setIdx(newIdx);
    setDragOffset(0);
  }, [tracks.length]);

  const onTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    touchStartT.current = Date.now();
    lastY.current = e.touches[0].clientY;
    dragging.current = false;
    dragYRef.current = 0;
    velocityRef.current = 0;
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
    // Track velocity: px per ms over last move
    const now = Date.now();
    const dt  = now - touchStartT.current;
    if (dt > 0) velocityRef.current = (e.touches[0].clientY - lastY.current) / Math.max(dt, 16);
    lastY.current = e.touches[0].clientY;
    touchStartT.current = now;
    dragYRef.current = dy;
    // Rubber band: feels natural, less resistance at start
    setDragOffset(dy * 0.35);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    const dy  = dragYRef.current;
    const vel = velocityRef.current; // px/ms — negative = moving up (next)
    // Fast flick (>0.3px/ms) only needs 20px. Slow drag needs full threshold.
    const speed     = Math.abs(vel);
    const threshold = speed > 0.3 ? 20 : SWIPE_THRESHOLD;
    if      (dy < -threshold) goTo(idx + 1);
    else if (dy >  threshold) goTo(idx - 1);
    else setDragOffset(0);
    dragging.current = false;
    touchStartY.current = null;
    velocityRef.current = 0;
  }, [idx, goTo]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowUp')   goTo(idx - 1);
      if (e.key === 'ArrowDown') goTo(idx + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, goTo]);

  // Mouse wheel / trackpad scroll on desktop
  const wheelLocked = React.useRef(false);
  useEffect(() => {
    const onWheel = (e) => {
      e.preventDefault();
      if (wheelLocked.current) return;
      wheelLocked.current = true;
      if (e.deltaY > 30)       goTo(idx + 1); // scroll down = next
      else if (e.deltaY < -30) goTo(idx - 1); // scroll up = prev
      // Debounce — prevent rapid firing on trackpad momentum
      setTimeout(() => { wheelLocked.current = false; }, 600);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [idx, goTo]);

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
      className="fixed inset-0 bg-black overflow-hidden md:left-64"
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
          // Snappy spring — 0.2s feels instant, still smooth
          transition: dragging.current ? 'none' : 'transform 0.2s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
      >
        {visibleRange.map(i => {
          const item = tracks[i];
          const isStoryCard = item?._type === 'story';
          const isCurrentCard = i === idx;
          const isDraggingDown = dragOffset > 0;
          const isDraggingUp   = dragOffset < 0;
          // Current card scales down slightly while dragging, confirms gesture
          const scale = isCurrentCard && Math.abs(dragOffset) > 8
            ? Math.max(0.96, 1 - Math.abs(dragOffset) / (vh * 6))
            : 1;
          // Next/prev card fades in from edge as you drag toward it
          const isNextCard = i === idx + 1;
          const isPrevCard = i === idx - 1;
          const peekOpacity = isNextCard && isDraggingUp
            ? Math.min(1, Math.abs(dragOffset) / 80)
            : isPrevCard && isDraggingDown
              ? Math.min(1, dragOffset / 80)
              : isCurrentCard ? 1 : 0.6;
          return (
            <div key={tracks[i].id} className="absolute inset-x-0"
              style={{
                top: i * vh, height: vh,
                transform: `scale(${scale})`,
                opacity: peekOpacity,
                transition: dragging.current ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
                borderRadius: isCurrentCard && scale < 1 ? '16px' : '0',
                overflow: 'hidden',
              }}>
              {isStoryCard ? (
                <StoryFeedCard
                  item={tracks[i]}
                  isActive={i === idx}
                  onOpen={() => setViewingStory({ artist: tracks[i].artist, stories: tracks[i].stories })}
                  navigate={navigate}
                />
              ) : (
                <ForYouCard track={tracks[i]} isActive={i === idx} user={user} navigate={navigate} />
              )}
            </div>
          );
        })}
      </div>

      {/* Status bar gradient */}
      <div className="absolute top-0 inset-x-0 h-20 pointer-events-none z-30"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }} />

      {loadingMore && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30">
          <Loader className="w-4 h-4 animate-spin text-white/30" />
        </div>
      )}

      {/* Full-screen story viewer */}
      {viewingStory && (
        <div className="absolute inset-0 z-50">
          <ArtistStoryView
            stories={viewingStory.stories}
            artist={viewingStory.artist}
            onClose={() => setViewingStory(null)}
          />
        </div>
      )}
    </div>
  );
}