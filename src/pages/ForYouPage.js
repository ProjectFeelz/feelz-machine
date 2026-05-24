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
import ShareCard from '../components/ShareCard';
import {
  Heart, MessageCircle, ListMusic, UserCheck,
  Share2, Loader, X, Send, ChevronUp,
  Sparkles, Volume2, VolumeX, Info,
} from 'lucide-react';

const SWIPE_THRESHOLD = 60;
const PRELOAD_AHEAD   = 2;
const PAGE_SIZE       = 20;

// ── Comment sheet ─────────────────────────────────────────────────────────────

// ── Keyboard-aware bottom offset ─────────────────────────────────────────────
// Works on both iOS (visual viewport) and Android (resize event)
function useKeyboardOffset() {
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => {
    if (!window.visualViewport) return;
    const update = () => {
      const keyboardHeight = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
      setOffset(Math.max(0, keyboardHeight));
    };
    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
    return () => {
      window.visualViewport.removeEventListener('resize', update);
      window.visualViewport.removeEventListener('scroll', update);
    };
  }, []);
  return offset;
}

function CommentSheet({ track, user, onClose }) {
  const keyboardOffset = useKeyboardOffset();
  const [comments, setComments] = useState([]);
  const [text, setText]         = useState('');
  const [posting, setPosting]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const inputRef                = useRef(null);

  useEffect(() => {
    // Pre-fetch current user's profile for instant comment display
    if (user?.id) {
      Promise.all([
        supabase.from('artists').select('user_id, artist_name, profile_image_url').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_profiles').select('user_id, name, avatar_url').eq('user_id', user.id).maybeSingle(),
      ]).then(([{ data: a }, { data: p }]) => {
        if (a) user.__artist = a;
        if (p) user.__profile = p;
      });
    }
    supabase
      .from('track_comments')
      .select('id, content, created_at, user_id')
      .eq('track_id', track.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(async ({ data: rawComments }) => {
        if (!rawComments?.length) { setComments([]); setLoading(false); return; }
        // Fetch profiles separately to avoid invalid join
        const uids = [...new Set(rawComments.map(c => c.user_id).filter(Boolean))];
        const [{ data: artists }, { data: profiles }] = await Promise.all([
          supabase.from('artists').select('user_id, artist_name, profile_image_url').in('user_id', uids),
          supabase.from('user_profiles').select('user_id, name, avatar_url').in('user_id', uids),
        ]);
        const artistMap = Object.fromEntries((artists || []).map(a => [a.user_id, a]));
        const profileMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
        setComments(rawComments.map(c => ({
          ...c,
          artists: artistMap[c.user_id] || null,
          user_profiles: profileMap[c.user_id] || null,
        })));
        setLoading(false);
      });
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
  }, [track.id]);

  const post = async () => {
    if (!text.trim() || !user || posting) return;
    setPosting(true);
    const { data } = await supabase
      .from('track_comments')
      .insert({ track_id: track.id, user_id: user.id, content: text.trim() })
      .select('id, content, created_at, user_id')
      .single();
    if (data) {
      // Enrich with current user's profile so it displays immediately
      const enriched = {
        ...data,
        artists: user?.__artist || null,
        user_profiles: user?.__profile || null,
      };
      setComments(prev => [enriched, ...prev]);
      // Notify the track's artist (skip if commenting on own track)
      try {
        const { data: trackRow } = await supabase
          .from('tracks').select('artist_id, title, artists(user_id)').eq('id', track.id).maybeSingle();
        if (trackRow && trackRow.artists?.user_id !== user.id) {
          const commenterName = (await supabase
            .from('artists').select('artist_name').eq('user_id', user.id).maybeSingle()
          ).data?.artist_name || 'Someone';
          await supabase.from('notifications').insert({
            user_id:        trackRow.artists.user_id,
            artist_id:      trackRow.artist_id,
            type:           'track_commented',
            title:          `${commenterName} commented on "${trackRow.title}"`,
            message:        text.trim().slice(0, 100),
            track_id:       track.id,
            from_artist_id: null,
            metadata: {
              track_id:     track.id,
              track_title:  trackRow.title,
              comment:      text.trim().slice(0, 100),
              artist_slug:  null,
            },
          });
        }
      } catch {}
    }
    setText('');
    setPosting(false);
  };

  return (
    <div className="flex flex-col w-full h-full" onClick={e => e.stopPropagation()}>
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
          <div className="flex flex-col items-center py-8 space-y-2">
            <p className="text-center text-white/30 text-sm">No comments yet — be first.</p>
            <p className="text-[11px] text-white/15">Type below and tap send ↓</p>
          </div>
        ) : comments.map(c => (
          <div key={c.id} className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
              {(c.artists?.profile_image_url || c.user_profiles?.avatar_url)
                ? <img src={c.artists?.profile_image_url || c.user_profiles?.avatar_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-xs text-white/30 font-bold">{(c.artists?.artist_name || c.user_profiles?.name || 'L')[0].toUpperCase()}</span>}
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-white/60 mb-0.5">
                {c.artists?.artist_name || c.user_profiles?.name || (c.user_id ? 'Listener' : 'Anonymous')}
              </p>
              <p className="text-sm text-white/90 leading-relaxed">{c.content}</p>
            </div>
          </div>
        ))}
      </div>
      <div
        className="flex items-center space-x-3 px-4 py-3 border-t border-white/[0.06] flex-shrink-0 sticky bottom-0 bg-black"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))'  }}
      >
        <input
          ref={inputRef} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && post()}
          onFocus={() => setTimeout(() => inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
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
    <div className="flex flex-col w-full" style={{ maxHeight: '60vh' }}
      onClick={e => e.stopPropagation()}>
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
      <div className="absolute bottom-44 left-0 right-0 z-20 pointer-events-none text-center px-8">
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
    <div className="absolute bottom-44 left-0 right-0 z-20 pointer-events-none text-center px-8">
      <p key={lineIdx} className="text-center text-white text-base font-bold leading-snug drop-shadow-lg"
        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.7)', animation: 'lyricFade 0.3s ease' }}>
        {line}
      </p>
    </div>
  );
}


// ── Floating hearts + listener bubbles ───────────────────────────────────────
const HEART_COLORS = ['#ef4444','#f472b6','#fb923c','#a78bfa','#f43f5e'];

function FloatingHearts({ trackId }) {
  const [hearts, setHearts] = React.useState([]);
  const [bubbles, setBubbles] = React.useState([]);
  const timerRef = React.useRef(null);

  // Poll for recent likes on this track every 8 seconds
  React.useEffect(() => {
    if (!trackId) return;
    const poll = async () => {
      try {
        const since = new Date(Date.now() - 15000).toISOString();
        const { data: likes } = await supabase
          .from('track_likes')
          .select('id, user_id, created_at')
          .eq('track_id', trackId)
          .gte('created_at', since)
          .limit(5);

        if (!likes?.length) return;

        // Spawn hearts
        const newHearts = likes.map((_, i) => ({
          id: Date.now() + i,
          x: 15 + Math.random() * 60,
          color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
          size: 16 + Math.random() * 14,
          delay: i * 150,
        }));
        setHearts(prev => [...prev, ...newHearts]);
        setTimeout(() => setHearts(prev => prev.filter(h => !newHearts.find(n => n.id === h.id))), 3000);

        // Get liker profile — try artists first, then user_profiles
        const likerId = likes[0].user_id;
        if (!likerId) return;

        let name = '', avatar = null;
        const { data: artist } = await supabase
          .from('artists')
          .select('artist_name, profile_image_url')
          .eq('user_id', likerId)
          .maybeSingle();

        if (artist) {
          name = artist.artist_name || '';
          avatar = artist.profile_image_url || null;
        } else {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('name, avatar_url')
            .eq('user_id', likerId)
            .maybeSingle();
          if (profile) { name = profile.name || ''; avatar = profile.avatar_url || null; }
        }

        if (name) {
          const bubble = { id: Date.now(), name, avatar };
          setBubbles(prev => [...prev, bubble]);
          setTimeout(() => setBubbles(prev => prev.filter(b => b.id !== bubble.id)), 3500);
        }
      } catch {}
    };

    poll();
    timerRef.current = setInterval(poll, 8000);
    return () => clearInterval(timerRef.current);
  }, [trackId]);

  if (!hearts.length && !bubbles.length) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
      {/* Floating hearts */}
      {hearts.map(h => (
        <div key={h.id} className="absolute bottom-36"
          style={{
            left: `${h.x}%`,
            animation: `floatHeart 2.5s ease-out ${h.delay}ms forwards`,
            fontSize: h.size,
          }}>
          <span style={{ color: h.color, filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.5))' }}>❤️</span>
        </div>
      ))}

      {/* Listener bubble — bottom left, fades in and out */}
      {bubbles.map(b => (
        <div key={b.id} className="absolute bottom-36 left-4 flex items-center space-x-2 rounded-full px-3 py-1.5"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', animation: 'bubblePop 3.5s ease forwards' }}>
          <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
            {b.avatar
              ? <img src={b.avatar} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white/50">{b.name[0]}</div>}
          </div>
          <span className="text-[11px] font-semibold text-white/90 max-w-[120px] truncate">{b.name} liked this</span>
          <span>❤️</span>
        </div>
      ))}

      <style>{`
        @keyframes floatHeart {
          0%   { transform: translateY(0) scale(0.5) rotate(-15deg); opacity: 1; }
          50%  { transform: translateY(-120px) scale(1.1) rotate(10deg); opacity: 0.9; }
          100% { transform: translateY(-240px) scale(0.7) rotate(-5deg); opacity: 0; }
        }
        @keyframes bubblePop {
          0%   { opacity: 0; transform: translateY(10px) scale(0.8); }
          15%  { opacity: 1; transform: translateY(0) scale(1); }
          70%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-8px); }
        }
      `}</style>
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
function ForYouCard({ track, isActive, user, navigate, onOpenSheet, onShare, onNext, queue, queueIndex }) {
  const { currentTrack, isPlaying, currentTime, setIsMinimized } = usePlayer();
  const { artist: myArtist } = useAuth();
  const isOwnTrack = myArtist?.id === track.artist_id;

  // Extract dominant color from cover art for background tinting
  const [dominantColor, setDominantColor] = React.useState('0,0,0');
  React.useEffect(() => {
    if (!track.cover_artwork_url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 8; canvas.height = 8;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < d.length; i += 16) {
          // Skip near-black and near-white pixels
          const pr = d[i], pg = d[i+1], pb = d[i+2];
          const brightness = (pr + pg + pb) / 3;
          if (brightness > 20 && brightness < 235) {
            r += pr; g += pg; b += pb; count++;
          }
        }
        if (count > 0) setDominantColor(`${Math.round(r/count)},${Math.round(g/count)},${Math.round(b/count)}`);
      } catch {}
    };
    img.src = track.cover_artwork_url;
  }, [track.cover_artwork_url]);
  const hasVideo   = !!track.youtube_url;
  const isYouTube  = hasVideo && (track.youtube_url.includes('youtube') || track.youtube_url.includes('youtu.be'));
  const isUploadedVideo = hasVideo && track.youtube_url.includes('supabase');
  const isThisOne = currentTrack?.id === track.id;
  const playing   = isThisOne && isPlaying;

  const [liked, setLiked]             = useState(false);
  const [likeCount, setLikeCount]     = useState(0);
  const [following, setFollowing]     = useState(false);
  const [commentCount, setCommentCount] = useState(0);

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
    if (isOwnTrack) return; // can't follow yourself
    if (following) {
      await supabase.from('follows').delete().eq('artist_id', track.artist_id).eq('follower_id', user.id);
      setFollowing(false);
    } else {
      // Prevent duplicate follows
      const { data: existing } = await supabase.from('follows')
        .select('id').eq('artist_id', track.artist_id).eq('follower_id', user.id).maybeSingle();
      if (!existing) {
        await supabase.from('follows').insert({ artist_id: track.artist_id, follower_id: user.id });
      }
      setFollowing(true);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/artist/${track.artist_slug}`;
    onShare({
      artist: {
        artist_name:       track.artist_name,
        slug:              track.artist_slug,
        profile_image_url: track.artist_image,
      },
      url,
      track,
    });
  };

  const goToArtist = () => {
    setIsMinimized(true);
    navigate(`/artist/${track.artist_slug}`);
  };

  const handleTap = () => {
    goToArtist();
  };

  const vinylSize = Math.min(window.innerWidth - 120, window.innerHeight * 0.42);
  const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none" onClick={handleTap}>

      {/* Blurred background with dominant color tint */}
      <div className="absolute inset-0 overflow-hidden">
        {track.cover_artwork_url && (
          <img src={track.cover_artwork_url} alt=""
            className="w-full h-full object-cover"
            style={{ filter: 'blur(48px) brightness(0.3) saturate(1.4)', transform: 'scale(1.2)' }} />
        )}
        {/* Color tint overlay — pulls the dominant color through */}
        <div className="absolute inset-0" style={{
          background: `linear-gradient(180deg,
            rgba(${dominantColor},0.45) 0%,
            rgba(${dominantColor},0.25) 40%,
            rgba(0,0,0,0.7) 100%)`
        }} />
      </div>

      {/* YouTube video */}
      {hasVideo && isActive && (
        <div className="absolute inset-0 z-10">
          {isUploadedVideo ? (
            /* Native video for Supabase-hosted MP4s */
            <video
              src={track.youtube_url}
              autoPlay
              playsInline
              muted
              onEnded={isActive ? onNext : undefined}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : isYouTube ? (
            /* ReactPlayer only for actual YouTube URLs */
            <ReactPlayer
              url={track.youtube_url}
              playing={isActive}
              muted
              playsinline
              onEnded={isActive ? onNext : undefined}
              width="100%"
              height="100%"
              style={{ position: 'absolute', top: 0, left: 0 }}
              config={{
                youtube: {
                  playerVars: {
                    controls: 0, modestbranding: 1, rel: 0,
                    showinfo: 0, iv_load_policy: 3, playsinline: 1,
                    autoplay: 1, mute: 1,
                  },
                },
              }}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70 z-10 pointer-events-none" />

        </div>
      )}

      {/* Vinyl — positioned in upper 55% of screen */}
      {!hasVideo && (
        <div className="relative z-10 flex items-center justify-center" style={{ marginTop: '-12vh' }}>
          <VinylRecord coverUrl={track.cover_artwork_url} isPlaying={playing} size={vinylSize} />

        </div>
      )}

      {/* Lyrics captions */}
      {isThisOne && track.lyrics && (
        <LyricsCaption lyrics={track.lyrics} currentTime={currentTime} isActive={isActive} />
      )}

      {/* Floating hearts — only on active card */}
      {isActive && isThisOne && <FloatingHearts trackId={track.id} />}

      {/* Right action bar */}
      <div className="absolute right-3 bottom-32 z-20 flex flex-col items-center space-y-5"
        onClick={e => e.stopPropagation()}>

        {/* Artist avatar */}
        <div className="flex flex-col items-center space-y-1">
          <button onClick={goToArtist}
            className="w-11 h-11 rounded-full overflow-hidden border-2 border-white/30">
            {track.artist_image
              ? <img src={track.artist_image} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full bg-purple-500/30 flex items-center justify-center text-sm font-bold text-white">{track.artist_name?.[0]}</div>}
          </button>
          {!isOwnTrack && (
            <button onClick={handleFollow}
              className="w-5 h-5 rounded-full flex items-center justify-center -mt-2.5 border border-white transition"
              style={{ background: following ? '#22c55e' : '#ef4444' }}>
              {following
                ? <UserCheck className="w-2.5 h-2.5 text-white" />
                : <span className="text-white text-[10px] font-black leading-none">+</span>}
            </button>
          )}
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
        <button onClick={() => onOpenSheet({ type: 'comments', track })}
          className="flex flex-col items-center space-y-1">
          <div className="w-11 h-11 flex items-center justify-center">
            <MessageCircle className="w-7 h-7 text-white/90" strokeWidth={2} />
          </div>
          <span className="text-[11px] font-semibold text-white/80">{fmt(commentCount)}</span>
        </button>

        {/* Playlist */}
        <button onClick={() => onOpenSheet({ type: 'playlist', track })}
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

        {/* Detail page */}
        <button onClick={() => navigate(track.is_beat ? `/beat/${track.slug}` : `/track/${track.slug}`)}
          className="flex flex-col items-center space-y-1">
          <div className="w-11 h-11 flex items-center justify-center">
            <Info className="w-6 h-6 text-white/90" strokeWidth={2} />
          </div>
          <span className="text-[11px] font-semibold text-white/80">{track.is_beat ? 'Buy' : 'Info'}</span>
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-24 left-4 right-16 z-20" onClick={e => e.stopPropagation()}>
        <button onClick={goToArtist}
          className="text-[13px] font-bold text-white/60 mb-1 text-left hover:text-white transition block">
          @{track.artist_slug || track.artist_name}
        </button>
        <p className="text-lg font-black text-white leading-tight mb-2">{track.title}</p>
        <div className="flex items-center flex-wrap gap-1.5">
          {track.is_beat && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(234,179,8,0.15)', color: '#facc15', border: '1px solid rgba(234,179,8,0.25)' }}>
              BEAT{track.bpm ? ` · ${track.bpm} BPM` : ''}
            </span>
          )}
          {track.beat_key && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
              {track.beat_key} {track.beat_scale || ''}
            </span>
          )}
          {track.genre && !track.is_beat && (
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
        <div className="absolute bottom-36 left-0 right-0 flex justify-center pointer-events-none z-30"
          style={{ animation: 'swipeHint 2.5s ease 2s forwards', opacity: 0 }}>
          <div className="flex flex-col items-center space-y-1 text-white/40">
            <ChevronUp className="w-6 h-6" />
            <span className="text-xs font-medium">Swipe up</span>
          </div>
        </div>
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
  const { user, isBeatmaker } = useAuth();
  const navigate    = useNavigate();
  const { playTrack, setIsMinimized } = usePlayer();



  // Keep screen awake while on the feed
  React.useEffect(() => {
    let wakeLock = null;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {}
    };
    acquire();
    // Re-acquire if page becomes visible again (e.g. user switches tabs)
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release().catch(() => {});
    };
  }, []);


  const [tracks, setTracks]           = useState([]);
  const [feedFilter, setFeedFilter]   = useState('all');
  const [idx, setIdx]                 = useState(0);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewingStory, setViewingStory] = useState(null); // { artist, stories }
  const [activeSheet, setActiveSheet]   = useState(null); // { type, track }
  const [shareCard, setShareCard]         = useState(null);  // { artist, url }

  // When PlayerContext advances to next track (track ended), sync idx
  const { currentTrack } = usePlayer();
  useEffect(() => {
    if (!currentTrack || !filteredTracks.length) return;
    const newIdx = filteredTracks.findIndex(t => t.id === currentTrack.id);
    if (newIdx > -1 && newIdx !== idx) setIdx(newIdx);
  }, [currentTrack?.id]); // eslint-disable-line

  const filteredTracks = feedFilter === 'music' ? tracks.filter(t => !t.is_beat)
    : feedFilter === 'beats' ? tracks.filter(t => t.is_beat)
    : tracks;

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
          .select('score, reason, tracks(id, title, slug, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, is_beat, stream_count, like_count, bpm, beat_key, beat_scale, download_price, engagement_score, artists(artist_name, slug, profile_image_url))')
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
        // Mix: half by engagement, half by recency so new releases get exposure
        const halfPage = Math.ceil((PAGE_SIZE - fetched.length) / 2);
        const existingIdsStr = existingIds.length > 0 ? `(${existingIds.join(',')})` : null;

        let recentQuery = supabase.from('tracks')
          .select('id, title, slug, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, is_beat, stream_count, like_count, bpm, beat_key, beat_scale, download_price, engagement_score, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(halfPage);
        if (existingIdsStr) recentQuery = recentQuery.not('id', 'in', existingIdsStr);

        let topQuery = supabase.from('tracks')
          .select('id, title, slug, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, is_beat, stream_count, like_count, bpm, beat_key, beat_scale, download_price, engagement_score, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .gt('engagement_score', 0)
          .order('engagement_score', { ascending: false })
          .limit(PAGE_SIZE - fetched.length);

        const [{ data: recentTracks }, { data: topTracks }] = await Promise.all([recentQuery, topQuery]);

        // Merge deduped
        const seen = new Set(existingIds);
        const merged = [];
        for (const t of [...(recentTracks || []), ...(topTracks || [])]) {
          if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); }
        }

        let query = { then: (fn) => fn({ data: merged.slice(0, PAGE_SIZE - fetched.length) }) };
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

      // Shuffle so feed feels fresh on every open
      if (offset === 0) {
        for (let i = fetched.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [fetched[i], fetched[j]] = [fetched[j], fetched[i]];
        }
      }

      if (offset === 0 && fetched.length > 0) fetched[0]._isFirst = true;
      if (offset === 0) setTracks(fetched);
      else setTracks(prev => [...prev, ...fetched]);
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
    if (!filteredTracks.length) return;
    const item = tracks[idx];
    if (!item || item._type === 'story') return; // skip story cards
    if (idx === lastPlayedIdx.current) return;   // already played this idx
    lastPlayedIdx.current = idx;
    if (item.file_url && !item.youtube_url) {
      window.__feelz_play_source = 'for_you';
      playTrack(item, filteredTracks.filter(t => t?.file_url && !t?.youtube_url), filteredTracks.filter(t => t?.file_url && !t?.youtube_url).findIndex(t => t.id === item.id));
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
                filteredTracks[i] ? <ForYouCard track={filteredTracks[i]} isActive={i === idx} user={user} navigate={navigate} onOpenSheet={setActiveSheet} onShare={setShareCard} onNext={() => setIdx(i + 1)} queue={filteredTracks} queueIndex={i} /> : null
              )}
            </div>
          );
        })}
      </div>

      {/* Status bar gradient */}
      <div className="absolute top-0 inset-x-0 h-20 pointer-events-none z-30"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }} />

      {/* Feed filter tabs */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex space-x-1 rounded-full p-0.5"
        style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(10px)' }}>
        {[
          { id: 'all',    label: 'All' },
          { id: 'music',  label: 'Music' },
          { id: 'beats',  label: 'Beats' },
        ].map(f => (
          <button key={f.id} onClick={() => { setFeedFilter(f.id); setIdx(0); }}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              feedFilter === f.id ? 'bg-white text-black' : 'text-white/50 hover:text-white/80'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Sign-in nudge for unauthenticated users */}
      {!user && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-6 pointer-events-none">
          <div className="w-full max-w-sm rounded-2xl overflow-hidden pointer-events-auto"
            style={{ background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="px-5 py-4 flex items-center space-x-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Join Feelz Machine</p>
                <p className="text-[11px] text-white/40 mt-0.5">Follow artists, like tracks & more</p>
              </div>
              <button onClick={() => navigate('/login')}
                className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold text-black transition active:scale-95"
                style={{ background: 'white' }}>
                Sign in
              </button>
            </div>
          </div>
        </div>
      )}

      {loadingMore && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30">
          <Loader className="w-4 h-4 animate-spin text-white/30" />
        </div>
      )}

      {/* Comment sheet — fixed overlay, unaffected by keyboard */}
      {activeSheet?.type === 'comments' && (
        <div key={activeSheet?.track?.id} className="fixed inset-0 z-[800] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setActiveSheet(null)}>
          <div className="w-full md:max-w-lg md:mb-6 md:rounded-2xl"
            onClick={e => e.stopPropagation()}
            style={{ maxHeight: 'calc(100vh - 80px)', height: '65vh', display: 'flex', flexDirection: 'column',
                     background: 'rgba(10,10,10,0.98)', borderTop: '1px solid rgba(255,255,255,0.08)',
                     borderRadius: '24px 24px 0 0' }}>
            <CommentSheet track={activeSheet.track} user={user} onClose={() => setActiveSheet(null)} />
          </div>
        </div>
      )}

      {/* Playlist sheet — fixed overlay */}
      {activeSheet?.type === 'playlist' && (
        <div className="fixed inset-0 z-[800] flex items-end"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setActiveSheet(null)}>
          <div className="w-full" onClick={e => e.stopPropagation()}
            style={{ maxHeight: '60vh', display: 'flex', flexDirection: 'column',
                     background: 'rgba(10,10,10,0.98)', borderTop: '1px solid rgba(255,255,255,0.08)',
                     borderRadius: '24px 24px 0 0',
                     paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <PlaylistSheet track={activeSheet.track} user={user} onClose={() => setActiveSheet(null)} navigate={navigate} />
          </div>
        </div>
      )}

      {/* ShareCard overlay */}
      {shareCard && (
        <ShareCard
          artist={shareCard.artist}
          track={shareCard.track}
          shareUrl={shareCard.url}
          onClose={() => setShareCard(null)}
        />
      )}

      {/* Full-screen story viewer — rendered at root level so fixed inset-0 takes full screen */}
      {viewingStory && (
        <ArtistStoryView
          stories={viewingStory.stories}
          artist={viewingStory.artist}
          onClose={() => setViewingStory(null)}
        />
      )}
    </div>
  );
}