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
import { resolveStreamSrc } from '../utils/streamUrl';
import { sendNotification } from '../utils/notify';
import TrackCommentSheet from '../components/TrackCommentSheet';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import VinylRecord from '../components/VinylRecord';
import PreorderTag from '../components/PreorderTag';

import { ArtistStoryView } from '../components/ArtistStories';
import ShareCard from '../components/ShareCard';
import { askNotificationPermission } from '../utils/askNotificationPermission';
import {
  Heart, MessageCircle, ListMusic, UserCheck,
  Share2, Loader, X, Send, ChevronUp,
  Sparkles, Volume2, VolumeX, Info, EyeOff,
} from 'lucide-react';

// True when this page is running inside the phone on the sign-in page.
const IN_PHONE_PREVIEW = typeof window !== 'undefined' && (
  (() => { try { return window.self !== window.top; } catch { return true; } })()
  || new URLSearchParams(window.location.search).get('preview') === 'phone'
);

// Search engines and link previews must still see the feed at "/".
const IS_BOT = typeof navigator !== 'undefined' && /bot|crawl|spider|slurp|facebookexternalhit|lighthouse|headless|preview/i.test(navigator.userAgent || '');

// No artist gets the feed to themselves.
//
// One account uploading a lot can take over For You: the ranking reads
// engagement, and a burst of new tracks from one artist scores as a burst of
// new tracks. This deals the page out like cards instead, one track per
// artist per round, in the order the ranking put them.
//
// Nothing is dropped and nothing is reordered within an artist. An artist with
// nine tracks in a page still has all nine, spaced out, with everyone else's
// music in between.
function spreadByArtist(list) {
  if (!Array.isArray(list) || list.length < 3) return list || [];

  const buckets = new Map();   // artist -> their tracks, in ranking order
  list.forEach(t => {
    const key = t.artist_id || t.artist_name || 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  });
  if (buckets.size === 1) return list;

  const queues = [...buckets.values()];
  const out = [];
  while (out.length < list.length) {
    let placedThisRound = false;
    for (const q of queues) {
      if (!q.length) continue;
      out.push(q.shift());
      placedThisRound = true;
    }
    if (!placedThisRound) break;   // belt and braces, never loop forever
  }
  return out;
}

// Every listener_feedback write in this file was fire-and-forget: no await, no
// .then, no error read. So the 400 they have all been returning was invisible,
// and Hide *looked* like it worked, the card slid away, the row was never
// written, and the track came back next session. Same for the skip and
// deep-listen signals the recommender is supposed to be learning from.
//
// One reporter rather than four, so a new call site cannot quietly be added
// without error handling.
function reportFeedbackWrite(label, promise) {
  Promise.resolve(promise)
    .then(({ error }) => {
      if (error) {
        console.error(
          `[ForYou] listener_feedback ${label} failed:`,
          error.code, error.message, error.details || '', error.hint || ''
        );
      }
    })
    .catch(err => console.error(`[ForYou] listener_feedback ${label} threw:`, err));
}

const SWIPE_THRESHOLD = 60;
const PRELOAD_AHEAD   = 2;
const PAGE_SIZE       = 20;
// How many curated picks lead the first page for a listener who already has
// recommendations. Small enough that their own feed still starts near the top,
// big enough that the list in /admin/cold-start is actually seen.
const LEAD_PICKS      = 4;

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
function LyricsCaption({ lyrics, currentTime, isActive, duration }) {
  const [visible, setVisible] = React.useState(true);
  if (!lyrics || !isActive) return null;

  const lrcLines = parseLRC(lyrics);

  if (lrcLines) {
    // Timestamped LRC, show active line
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

  // Plain text, no timestamps. Spread the words across the song itself rather
  // than a fixed four seconds a line: a two minute song with forty lines used
  // to run out of lyrics after two and a half minutes of nothing, and a short
  // one finished its words long before the music did.
  const lines = lyrics.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const totalLines = lines.length;
  const LEAD_IN = 2;                       // most songs have an intro
  const span    = Math.max((duration || totalLines * 4) - LEAD_IN, totalLines);
  const perLine = span / totalLines;
  const lineIdx = currentTime < LEAD_IN
    ? 0
    : Math.min(Math.floor((currentTime - LEAD_IN) / perLine), totalLines - 1);
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

function FloatingHearts({ trackId, isActive }) {
  const [hearts, setHearts]   = React.useState([]);
  const [bubbles, setBubbles] = React.useState([]);
  const likersRef  = React.useRef([]); // cached liker profiles [{ name, avatar }]
  const burstIdx   = React.useRef(0);  // which liker to show next
  const ambientRef = React.useRef(null);
  const pollRef    = React.useRef(null);

  React.useEffect(() => {
    if (!trackId || !isActive) return; // only run when card is visible

    // ── Step 1: load all likers once on mount ──────────────────────────────
    const loadLikers = async () => {
      try {
        const { data: likes } = await supabase
          .from('track_likes')
          .select('user_id')
          .eq('track_id', trackId)
          .limit(30);

        if (!likes?.length) return;

        // Batch fetch profiles
        const ids = likes.map(l => l.user_id).filter(Boolean);
        const [{ data: artists }, { data: profiles }, { data: listenerRows }] = await Promise.all([
          supabase.from('artists').select('user_id, artist_name, profile_image_url').in('user_id', ids),
          supabase.from('user_profiles').select('user_id, name, avatar_url').in('user_id', ids),
          supabase.from('listeners').select('user_id, display_name, avatar_url').in('user_id', ids),
        ]);

        const artistMap   = Object.fromEntries((artists      || []).map(a => [a.user_id, { name: a.artist_name,   avatar: a.profile_image_url }]));
        const profileMap  = Object.fromEntries((profiles     || []).map(p => [p.user_id, { name: p.name,           avatar: p.avatar_url }]));
        const listenerMap = Object.fromEntries((listenerRows || []).map(l => [l.user_id, { name: l.display_name,   avatar: l.avatar_url }]));

        // Priority: artist name > user_profiles name > listener display_name
        likersRef.current = ids
          .map(id => artistMap[id] || profileMap[id] || listenerMap[id])
          .filter(l => l?.name)
          // Shuffle so order is random
          .sort(() => Math.random() - 0.5);
      } catch {}
    };

    // ── Step 2: spawn a burst (2-4 hearts + one name pill) ────────────────
    const spawnBurst = () => {
      const likers = likersRef.current;
      const count  = likers.length;

      // Hearts, 2 to 4 at a time
      const n = 2 + Math.floor(Math.random() * 3);
      const newHearts = Array.from({ length: n }, (_, i) => ({
        id:    Date.now() + i + Math.random(),
        x:     10 + Math.random() * 70,
        color: HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)],
        size:  14 + Math.random() * 12,
        delay: i * 120,
      }));
      setHearts(prev => [...prev, ...newHearts]);
      setTimeout(() => setHearts(prev => prev.filter(h => !newHearts.find(n => n.id === h.id))), 3000);

      // Name pill, cycle through likers
      if (count > 0) {
        const liker = likers[burstIdx.current % count];
        burstIdx.current++;
        const bubble = {
          id:     Date.now() + Math.random(),
          name:   liker.name,
          avatar: liker.avatar,
          x:      8 + Math.random() * 40,
        };
        setBubbles(prev => [...prev, bubble]);
        setTimeout(() => setBubbles(prev => prev.filter(b => b.id !== bubble.id)), 3500);
      }
    };

    // ── Step 3: run at natural-feeling intervals ───────────────────────────
    const startAmbient = (likeCount) => {
      if (ambientRef.current) return; // already running
      if (likeCount < 1) return;

      // Interval scales with likes: 1 like = every ~12s, 10 likes = ~6s, 50+ = ~3s
      const interval = Math.max(3000, 13000 - likeCount * 200);

      const tick = () => {
        spawnBurst();
        // Slightly randomise next tick so it feels organic
        ambientRef.current = setTimeout(tick, interval + (Math.random() - 0.5) * 2000);
      };
      // First burst after 1.5s so it feels immediate
      ambientRef.current = setTimeout(tick, 1500);
    };

    const init = async () => {
      await loadLikers();
      // Also check total like count to decide interval
      const { count } = await supabase
        .from('track_likes')
        .select('*', { count: 'exact', head: true })
        .eq('track_id', trackId);
      startAmbient(count || 0);

      // Still poll for real-time new likes every 10s
      pollRef.current = setInterval(async () => {
        try {
          const since = new Date(Date.now() - 12000).toISOString();
          const { data: newLikes } = await supabase
            .from('track_likes')
            .select('user_id')
            .eq('track_id', trackId)
            .gte('created_at', since)
            .limit(3);
          if (newLikes?.length) {
            // Reload likers to include new one
            await loadLikers();
            spawnBurst();
          }
        } catch {}
      }, 10000);
    };

    init();

    return () => {
      clearTimeout(ambientRef.current);
      clearInterval(pollRef.current);
      ambientRef.current = null;
    };
  }, [trackId, isActive]); // eslint-disable-line

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

      {/* Listener name pills, float upward alongside hearts */}
      {bubbles.map(b => (
        <div key={b.id}
          className="absolute flex items-center space-x-1.5 rounded-full px-2.5 py-1.5"
          style={{
            bottom: '144px',
            left: `${b.x || 8}%`,
            maxWidth: '60%',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.14)',
            animation: 'bubbleFloat 3.2s ease forwards',
            zIndex: 41,
          }}>
          <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
            {b.avatar
              ? <img src={b.avatar} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white/50">{b.name[0]}</div>}
          </div>
          <span className="text-[11px] font-semibold text-white/90 truncate">{b.name}</span>
          <span style={{ fontSize: 13 }}>❤️</span>
        </div>
      ))}

      <style>{`
        @keyframes floatHeart {
          0%   { transform: translateY(0) scale(0.5) rotate(-15deg); opacity: 1; }
          50%  { transform: translateY(-120px) scale(1.1) rotate(10deg); opacity: 0.9; }
          100% { transform: translateY(-240px) scale(0.7) rotate(-5deg); opacity: 0; }
        }
        @keyframes bubbleFloat {
          0%   { opacity: 0; transform: translateY(12px) scale(0.85); }
          12%  { opacity: 1; transform: translateY(0) scale(1); }
          60%  { opacity: 1; transform: translateY(-60px); }
          100% { opacity: 0; transform: translateY(-130px) scale(0.9); }
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
function ForYouCard({ track, isActive, user, navigate, onOpenSheet, onShare, onNext, onHide, queue, queueIndex, storyArtistIds }) {
  const [justHid, setJustHid] = React.useState(null); // { id, title } for undo
  const { currentTrack, isPlaying, currentTime, setIsMinimized, togglePlay } = usePlayer();
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
  const [following, setFollowing]     = useState(null); // null = loading, false = not following, true = following
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
      // Notify the track artist
      if (track.artist_id && track.artist_id !== user.id) {
        try {
          const [{ data: liker }, { data: listenerProfile }, { data: artistRow }] = await Promise.all([
            supabase.from('artists').select('id, artist_name, profile_image_url, slug').eq('user_id', user.id).maybeSingle(),
            supabase.from('listeners').select('display_name, avatar_url').eq('user_id', user.id).maybeSingle(),
            supabase.from('artists').select('user_id').eq('id', track.artist_id).maybeSingle(),
          ]);
          if (artistRow?.user_id) {
            const likerName = liker?.artist_name || listenerProfile?.display_name || 'Someone';
            // Check for recent existing like notification for same track to group
            const since = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // last 30 min
            const { data: recent } = await supabase
              .from('notifications')
              .select('id, title, metadata')
              .eq('user_id', artistRow.user_id)
              .eq('type', 'track_liked')
              .eq('track_id', track.id)
              .gte('created_at', since)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (recent) {
              // Update existing notification, group it
              const count = (recent.metadata?.like_count || 1) + 1;
              const firstLiker = recent.metadata?.first_liker_name || likerName;
              await supabase.from('notifications').update({
                title: `${firstLiker} and ${count - 1} other${count - 1 !== 1 ? 's' : ''} liked "${track.title}"`,
                read: false,
                metadata: { ...(recent.metadata || {}), like_count: count, track_title: track.title, track_id: track.id },
                updated_at: new Date().toISOString(),
              }).eq('id', recent.id);
            } else {
              // Migration 106, see TrackDetailPage for the same conversion.
              await sendNotification(supabase, 'track_liked (for you)', {
                type:     'track_liked',
                artistId: track.artist_id,
                title:    `${likerName} liked "${track.title}"`,
                trackId:  track.id,
                metadata: {
                  track_id:          track.id,
                  track_title:       track.title,
                  track_slug:        track.slug || null,
                  like_count:        1,
                  first_liker_name:  likerName,
                  from_artist_id:    liker?.id || null,
                  from_artist_name:  likerName,
                  from_artist_image: liker?.profile_image_url || null,
                  from_artist_slug:  liker?.slug || null,
                },
              });
            }
          }
        } catch {}
      }
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
      askNotificationPermission();
    }
  };

  const handleShare = () => {
    // The handle form, which is shorter and already redirects to
    // /artist/<slug> (see NotFoundRedirect in src/AppRouter.js).
    const url = `${window.location.origin}/@${track.artist_slug}`;
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
    // Guarded. Without a slug this navigated to /artist/null, which renders
    // the "artist not found" page, so a track whose artist row is missing a
    // slug gave the credit the look of a working link and the behaviour of a
    // dead end.
    if (!track.artist_slug) return;
    setIsMinimized(true);
    navigate(`/artist/${track.artist_slug}`);
  };

  // What the credit on the card actually says.
  //
  // This used to be `@{track.artist_slug || track.artist_name}`, slug FIRST,
  // so the card showed a database key in preference to the name the artist
  // typed in. On any account created during the old signup race that key is
  // something like `eon-jams-mooqa3lj`, a real name with a random suffix
  // welded on. The name comes first now, and the `@` goes with it only when
  // there is no name and a handle is genuinely all we have: `@` prefixes a
  // handle, it does not prefix "EON Jams".
  const artistLabel = (track.artist_name || '').trim()
    || (track.artist_slug ? `@${track.artist_slug}` : 'Unknown artist');

  // Does this artist have a story running right now?
  //
  // Stories reach this page as their own injected cards, but only from
  // artists the viewer already FOLLOWS and only on the first page of the
  // feed. So an artist you have just discovered here can be mid-story and
  // give no sign of it. The credit pill is already the tap target for "go see
  // this artist", so it carries the signal: it glows, and the artist profile
  // it opens is where the story ring lives.
  const hasStory = !!track.artist_id && !!storyArtistIds && storyArtistIds.has(track.artist_id);

  const handleTap = () => {
    togglePlay();
  };

  const vinylSize = Math.min(window.innerWidth - 120, window.innerHeight * 0.42);
  const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);
  const videoRef = React.useRef(null);

  // The video starts where the song starts.
  //
  // It used to be left wherever it was and only nudged once it had drifted
  // more than half a second, so a card you came back to carried on from the
  // middle of the clip while the song started from the top. This puts it back
  // to the song's position the moment this card becomes the playing one, and
  // again whenever the track changes.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    try { video.currentTime = isThisOne ? (currentTime || 0) : 0; } catch {}
  }, [track.id, isThisOne]); // eslint-disable-line

  // Then keep the two together while they run.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      if (Math.abs(video.currentTime - currentTime) > 0.3) {
        try { video.currentTime = currentTime; } catch {}
      }
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [playing, currentTime]);

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none" onClick={handleTap}>

      {/* Blurred background with dominant color tint */}
      <div className="absolute inset-0 overflow-hidden">
        {track.cover_artwork_url && (
          <img src={track.cover_artwork_url} alt=""
            className="w-full h-full object-cover"
            style={{ filter: 'blur(48px) brightness(0.3) saturate(1.4)', transform: 'scale(1.2)' }} />
        )}
        {/* Color tint overlay, pulls the dominant color through */}
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
            /* Native video for Supabase-hosted MP4s, synced to audio player */
            <video
              ref={videoRef}
              src={track.youtube_url}
              playsInline
              muted
              onEnded={isActive ? onNext : undefined}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : isYouTube ? (
            /* ReactPlayer only for actual YouTube URLs */
            <ReactPlayer
              url={track.youtube_url}
              playing={playing}
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

      {/* Vinyl, positioned in upper 55% of screen */}
      {!hasVideo && (
        <div className="relative z-10 flex items-center justify-center" style={{ marginTop: '-12vh' }}>
          <VinylRecord coverUrl={track.cover_artwork_url} isPlaying={playing} size={vinylSize} />

        </div>
      )}

      {/* Lyrics captions */}
      {isThisOne && track.lyrics && (
        <LyricsCaption lyrics={track.lyrics} currentTime={currentTime} isActive={isActive}
          duration={track.duration || 0} />
      )}

      {/* Floating hearts, only on active card */}
      {isActive && isThisOne && <FloatingHearts trackId={track.id} isActive={isActive} />}

      {/* Right action bar */}
      <div className="absolute bottom-32 z-20 flex flex-col items-center space-y-5" style={{ right: "16px" }}
        onClick={e => e.stopPropagation()}>

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

      {/* Undo hide toast, fixed centered above nav */}
      {justHid && (
        <div
          style={{
            position: 'fixed',
            bottom: '90px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 900,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 16px',
            borderRadius: '20px',
            background: 'rgba(20,20,30,0.95)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
            whiteSpace: 'nowrap',
          }}
          onClick={e => e.stopPropagation()}
        >
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Song hidden</span>
          <button
            onClick={e => {
              e.stopPropagation();
              clearTimeout(window.__feelz_hide_timer);
              reportFeedbackWrite('undo hide', supabase.from('listener_feedback')
                .delete()
                .eq('user_id', user.id)
                .eq('track_id', justHid.id));
              setJustHid(null);
            }}
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: '10px',
              background: 'rgba(139,92,246,0.25)',
              color: '#a78bfa',
              border: '1px solid rgba(139,92,246,0.4)',
            }}
          >
            Undo
          </button>
        </div>
      )}

      {/* Bottom info */}
      <div className="absolute bottom-24 left-4 right-16 z-20" onClick={e => e.stopPropagation()}>
        {/* min-w-0 on the row, so the credit pill below is allowed to shrink.
            A flex child will not go narrower than its content unless it can,
            and without this the long-name truncation never engages, the pill
            just pushes Follow and the hide button off the right edge. */}
        <div className="flex items-center space-x-2 mb-1 min-w-0">
          {/* The credit, as a pill.
              Deliberately the QUIET one. Follow beside it is the action and
              keeps the loud red treatment; identity should not compete with
              it, so this is neutral glass, it reads as a pill and as
              tappable without pulling the eye off the button that matters.
              No max-width on purpose: `min-w-0` plus `truncate` lets flex give
              the pill whatever the row has left after Follow and the hide
              button (both flex-shrink-0), so a name is cut ONLY when it
              genuinely does not fit. A fixed cap would have clipped
              "EON Jams Collective" on a phone that had room for all of it.
              The full name stays available on long-press via `title`. */}
          <button onClick={goToArtist}
            title={hasStory ? `${artistLabel}, story running now` : artistLabel}
            className={`min-w-0 truncate px-2.5 py-0.5 rounded-full
                       text-[12px] font-bold text-left transition active:scale-95
                       ${hasStory ? 'text-white' : 'text-white/75 hover:text-white hover:bg-white/[0.14]'}`}
            style={hasStory
              ? {
                  background: 'linear-gradient(90deg, rgba(217,70,239,0.30), rgba(236,72,153,0.26))',
                  border: '1px solid rgba(244,114,182,0.60)',
                  boxShadow: '0 0 10px rgba(236,72,153,0.45)',
                }
              : { background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)' }}>
            {artistLabel}
          </button>
          {user && !isOwnTrack && following === false && (
            <button onClick={e => { e.stopPropagation(); handleFollow(); }}
              className="flex-shrink-0 flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white transition active:scale-95"
              style={{ background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.4)' }}>
              <span>+ Follow</span>
            </button>
          )}
          {user && !isOwnTrack && (
            <button
              onClick={e => {
                e.stopPropagation();
                setJustHid({ id: track.id, title: track.title });
                reportFeedbackWrite('hide', supabase.from('listener_feedback').upsert({
                  user_id:    user.id,
                  track_id:   track.id,
                  artist_id:  track.artist_id,
                  signal:     'not_interested',
                  listen_pct: 0,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id,track_id' }));
                const t = setTimeout(() => {
                  if (onHide) onHide(track.id); else onNext();
                }, 3000);
                window.__feelz_hide_timer = t;
              }}
              className="flex-shrink-0 flex items-center space-x-1 opacity-40 hover:opacity-70 transition active:scale-90"
            >
              <EyeOff className="w-3.5 h-3.5 text-white/70" strokeWidth={2} />
              <span className="text-[11px] text-white/60">Hide</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0 mb-2">
          <p className="text-lg font-black text-white leading-tight truncate">{track.title}</p>
          <PreorderTag track={track} variant="inline" />
        </div>
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
          {(() => {
            // AI label, same rule as Browse and the track page: an admin
            // override wins over what the artist declared.
            const ai = track.ai_content_admin_override || track.ai_content;
            if (!ai || ai === 'human') return null;
            return (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(236,72,153,0.15)', color: '#f9a8d4', border: '1px solid rgba(236,72,153,0.3)' }}>
                {ai === 'ai_generated' ? 'AI generated' : 'AI assisted'}
              </span>
            );
          })()}
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

// ── Keyboard-aware comment sheet overlay ─────────────────────────────────────
function CommentSheetOverlay({ track, user, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 800,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        // Isolate this layer, prevent iOS from reflowing the page beneath
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
      }}
      onClick={onClose}
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          height: '65vh',
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(10,10,10,0.98)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '24px 24px 0 0',
          // No marginBottom here, TrackCommentSheet's fixed input handles keyboard
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
        }}>
        <TrackCommentSheet track={track} user={user} onClose={onClose} />
      </div>
    </div>
  );
}

export default function ForYouPage() {
  const { user, isBeatmaker, loading: authLoading } = useAuth();
  const navigate    = useNavigate();
  const { playTrack, setIsMinimized } = usePlayer();

  // On a computer, signed-out visitors get the sign-in page with the app
  // running in a phone beside it, instead of the feed under a sign-in banner.
  // Phones keep the feed. Never inside the preview itself, never for bots.
  React.useEffect(() => {
    if (authLoading || user || IN_PHONE_PREVIEW || IS_BOT) return;
    if (window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) {
      navigate('/login', { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Inside the phone on the sign-in page the feed is look-only: swipe and
  // scroll to move between tracks, but taps and clicks do nothing. Only for
  // the preview URL the sign-in page loads, so the real app is never affected.
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('preview') !== 'phone') return;
    let startX = 0, startY = 0, moved = false;
    const block = (e) => { e.preventDefault(); e.stopPropagation(); };
    const onStart = (e) => { const t = e.touches[0]; startX = t.clientX; startY = t.clientY; moved = false; };
    const onMove  = (e) => { const t = e.touches[0]; if (Math.abs(t.clientY - startY) > 8 || Math.abs(t.clientX - startX) > 8) moved = true; };
    // A tap (no movement) is swallowed; a swipe carries on to the feed.
    const onEnd   = (e) => { if (!moved) block(e); };
    const onKey   = (e) => { if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') block(e); };
    const opts = { capture: true, passive: false };
    const clickTypes = ['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'pointerup'];
    clickTypes.forEach(t => window.addEventListener(t, block, opts));
    window.addEventListener('touchstart', onStart, { capture: true, passive: true });
    window.addEventListener('touchmove', onMove, { capture: true, passive: true });
    window.addEventListener('touchend', onEnd, opts);
    window.addEventListener('keydown', onKey, opts);
    document.documentElement.style.cursor = 'default';
    return () => {
      clickTypes.forEach(t => window.removeEventListener(t, block, opts));
      window.removeEventListener('touchstart', onStart, { capture: true });
      window.removeEventListener('touchmove', onMove, { capture: true });
      window.removeEventListener('touchend', onEnd, opts);
      window.removeEventListener('keydown', onKey, opts);
    };
  }, []);



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

  // Every artist with a story running right now, regardless of whether the
  // viewer follows them. The story CARDS injected into this feed are
  // follow-gated and first-page only; this is just the set of ids, so the
  // credit pill on any card can light up. One small query, once per mount.
  const [storyArtistIds, setStoryArtistIds] = useState(() => new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('artist_stories')
        .select('artist_id')
        .gt('expires_at', new Date().toISOString())
        .limit(500);
      if (error) { console.error('[foryou] active stories failed:', error.code, error.message); return; }
      if (!cancelled) setStoryArtistIds(new Set((data || []).map(r => r.artist_id).filter(Boolean)));
    })();
    return () => { cancelled = true; };
  }, []);

  // Deep-link support, notifications land here with ?openComments=<trackId>
  // or ?openCommentsSlug=<slug> instead of going to the separate track page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trackId = params.get('openComments');
    const trackSlug = params.get('openCommentsSlug');
    if (!trackId && !trackSlug) return;
    (async () => {
      let query = supabase.from('tracks').select('id, title, slug, cover_artwork_url, artists!tracks_artist_id_fkey(artist_name)');
      query = trackId ? query.eq('id', trackId) : query.eq('slug', trackSlug);
      const { data } = await query.maybeSingle();
      if (data) {
        setActiveSheet({
          type: 'comments',
          track: { ...data, artist_name: data.artists?.artist_name || '' },
        });
      }
      window.history.replaceState({}, '', '/');
    })();
  }, []); // eslint-disable-line


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
  const [loadError, setLoadError]     = useState('');

  // Persistent hidden IDs ref, survives across loadTracks calls and page re-renders
  const hiddenIdsRef = React.useRef(new Set());

  const loadTracks = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    try {
      let fetched = [];
      let hiddenIds = [...hiddenIdsRef.current]; // start with locally known hidden IDs

      if (user) {
        // Fetch hidden track IDs so we can exclude them
        const { data: hiddenData } = await supabase
          .from('listener_feedback')
          .select('track_id')
          .eq('user_id', user.id)
          .eq('signal', 'not_interested');
        const dbHiddenIds = (hiddenData || []).map(h => h.track_id).filter(Boolean);
        dbHiddenIds.forEach(id => hiddenIdsRef.current.add(id));
        hiddenIds = [...hiddenIdsRef.current];

        // ── Session re-rank ──────────────────────────────────────────────
        // get_ranked_feed reorders the stored candidate pool using what the
        // listener has done in the last 45 minutes. Only on the first page:
        // the function applies a random serendipity nudge, so calling it per
        // page would reshuffle between pages and produce duplicates. Deeper
        // pages continue on the stable stored ordering below.
        //
        // Any failure falls through to that same stored ordering, so a bad
        // RPC degrades to exactly today's behaviour rather than an empty feed.
        let rankedIds = null;
        if (offset === 0) {
          try {
            const { data: ranked, error: rankErr } = await supabase
              .rpc('get_ranked_feed', { p_limit: PAGE_SIZE });
            if (!rankErr && ranked?.length > 0) {
              rankedIds = ranked.map(r => ({ id: r.track_id, reason: r.reason }));
            }
          } catch {
            // Fall through to the stored ordering.
          }
        }

        if (rankedIds) {
          const idList = rankedIds.map(r => r.id);
          const { data: rankedTracks, error: rankedErr } = await supabase
            .from('tracks')
            .select('id, title, slug, short_code, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, is_beat, stream_count, like_count, bpm, beat_key, beat_scale, download_price, engagement_score, is_published, is_preorder, release_date, ai_content, ai_content_admin_override, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
            .in('id', idList);

          if (rankedErr) console.error('[ForYou] ranked tracks query failed:', rankedErr.code, rankedErr.message, rankedErr.hint || '');

          if (rankedTracks?.length > 0) {
            // Restore the order the RPC returned. The `in` filter does not
            // preserve it and the order is the entire point here.
            const byId = Object.fromEntries(rankedTracks.map(t => [t.id, t]));
            const REASON_LABELS_RANKED = {
              from_following: 'Following', genre_match: 'Your genre',
              mood_match: 'Your mood', new_release: 'New release',
              hidden_gem: 'Hidden gem', trending: 'Trending',
              top_artist: 'Your fave', feat_following: 'Features who you follow',
              your_beats: 'Your kind of beat', recommended: 'For you',
              playlisted_artist: 'In your playlists', downloaded_artist: 'You downloaded them',
              editors_pick: "Editor's pick",
            };
            fetched = rankedIds
              .map(r => {
                const t = byId[r.id];
                if (!t || hiddenIdsRef.current.has(t.id)) return null;
                return {
                  ...t,
                  artist_name:  t.artists?.artist_name || 'Unknown',
                  artist_slug:  t.artists?.slug || null,
                  artist_image: t.artists?.profile_image_url || null,
                  reason:       r.reason || 'recommended',
                  reason_label: REASON_LABELS_RANKED[r.reason] || 'For you',
                };
              })
              .filter(Boolean);
          }
        }

        let recQuery = supabase
          .from('listener_recommendations')
          .select('score, reason, tracks(id, title, slug, short_code, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, is_beat, stream_count, like_count, bpm, beat_key, beat_scale, download_price, engagement_score, is_published, is_preorder, release_date, ai_content, ai_content_admin_override, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url))')
          .eq('user_id', user.id)
          .order('score', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (hiddenIds.length > 0) {
          recQuery = recQuery.not('track_id', 'in', `(${hiddenIds.join(',')})`);
        }

        const { data: recData } = fetched.length > 0 ? { data: null } : await recQuery;

        if (recData?.length > 0) {
          const REASON_LABELS = {
            from_following: 'Following', genre_match: 'Your genre',
            mood_match: 'Your mood', new_release: 'New release',
            hidden_gem: 'Hidden gem', trending: 'Trending',
            top_artist: 'Your fave', feat_following: 'Features who you follow',
            your_beats: 'Your kind of beat', recommended: 'For you',
            playlisted_artist: 'In your playlists', downloaded_artist: 'You downloaded them',
            editors_pick: "Editor's pick",
          };
          fetched = recData.filter(r => r.tracks).map(r => ({
            ...r.tracks,
            artist_name:  r.tracks.artists?.artist_name || 'Unknown',
            artist_slug:  r.tracks.artists?.slug || null,
            artist_image: r.tracks.artists?.profile_image_url || null,
            reason:       r.reason,
            reason_label: REASON_LABELS[r.reason] || 'For you',
          }));
        }
      }

      // The curated opening.
      //
      // This used to run only when the recommender returned nothing at all,
      // which in practice meant only a brand new listener ever saw it. Anyone
      // with a single recommendation row, which is everyone the nightly job
      // has ever scored, skipped it entirely, so the list built in
      // /admin/cold-start was invisible on the platform.
      //
      // Now it always leads the first page. Two cases:
      //
      //   no recommendations   the curated list fills the page, as before.
      //   recommendations      the first LEAD_PICKS picks lead, in the order
      //                        they were put in, and the recommender fills
      //                        the rest of the page behind them.
      //
      // The leading picks are held apart in `leadPicks` rather than pushed
      // into `fetched`, because `fetched` is shuffled and dealt out by artist
      // further down and the curated order is the whole point of this list.
      // They are re-joined at the very end.
      let leadPicks = [];
      if (offset === 0) {
        const { data: picks, error: picksErr } = await supabase
          .from('cold_start_picks')
          .select('position, tracks(id, title, slug, short_code, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, is_beat, stream_count, like_count, bpm, beat_key, beat_scale, download_price, engagement_score, is_published, is_preorder, release_date, ai_content, ai_content_admin_override, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url))')
          .eq('is_active', true)
          .order('position');

        if (picksErr) console.error('[ForYou] cold start picks query failed:', picksErr.code, picksErr.message, picksErr.hint || '');

        const pickTracks = (picks || [])
          .map(p => p.tracks)
          .filter(t => t && t.is_published && !hiddenIdsRef.current.has(t.id))
          .map(t => ({
            ...t,
            artist_name:  t.artists?.artist_name || 'Unknown',
            artist_slug:  t.artists?.slug || null,
            artist_image: t.artists?.profile_image_url || null,
            reason:       'editors_pick',
            reason_label: "Editor's pick",
          }));

        if (pickTracks.length > 0) {
          // ROTATE, DO NOT ALWAYS START AT ONE.
          //
          // Taking picks 1 to 4 every time means the same song opens the app
          // on every refresh. That track then collects every first play on the
          // platform, its engagement score runs away from everything else, and
          // the feed genuinely does become rigged towards it. It also just
          // gets irritating.
          //
          // So the window moves. The whole list still gets shown, in the order
          // it was built, it just starts somewhere different each time and
          // wraps around, so no pick is permanently first and none is
          // permanently unseen. Random rather than a stored cursor because a
          // cursor is one more thing to keep per listener for no gain here.
          const start = Math.floor(Math.random() * pickTracks.length);
          const rotate = (list, n) => list.slice(n).concat(list.slice(0, n));
          const rotated = rotate(pickTracks, start);

          if (fetched.length === 0) {
            // Nothing from the recommender: the curated list is the feed.
            fetched = rotated.slice(0, PAGE_SIZE);
          } else {
            leadPicks = rotated.slice(0, LEAD_PICKS);
            // A pick the recommender also chose must not appear twice, and the
            // curated position wins.
            const leadIds = new Set(leadPicks.map(t => t.id));
            fetched = fetched.filter(t => !leadIds.has(t.id));
          }
        }
      }

      // The curated picks already count towards the page, so the top-up asks
      // for what is left after them. Without this the first page would come
      // back LEAD_PICKS cards longer than every other page.
      const pageRoom = PAGE_SIZE - leadPicks.length;

      if (fetched.length < pageRoom) {
        const existingIds = fetched.map(t => t.id);
        // Combine with hidden IDs, and the leading picks, so the fallback
        // query cannot hand back a track that is already on the page.
        const allExcludeIds = [...new Set([...existingIds, ...leadPicks.map(t => t.id), ...hiddenIds])];
        // Mix: half by engagement, half by recency so new releases get exposure
        const halfPage = Math.ceil((pageRoom - fetched.length) / 2);
        const existingIdsStr = allExcludeIds.length > 0 ? `(${allExcludeIds.join(',')})` : null;

        let recentQuery = supabase.from('tracks')
          .select('id, title, slug, short_code, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, is_beat, stream_count, like_count, bpm, beat_key, beat_scale, download_price, engagement_score, is_published, is_preorder, release_date, ai_content, ai_content_admin_override, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(halfPage);
        if (existingIdsStr) recentQuery = recentQuery.not('id', 'in', existingIdsStr);

        // Fallback: mix engagement + recency so new users get a meaningful feed.
        // Ordered by engagement_score, which as of migration 60 has a single
        // writer (the nightly update-engagement-scores job, normalised 0-100).
        // Before that three functions fought over this column and it drifted
        // through the day, so stream_count was the safer proxy. It is no
        // longer, stream_count ignores likes, comments and downloads entirely.
        // stream_count stays as the tiebreak for tracks not yet scored.
        let topQuery = supabase.from('tracks')
          .select('id, title, slug, short_code, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, is_beat, stream_count, like_count, bpm, beat_key, beat_scale, download_price, engagement_score, is_published, is_preorder, release_date, ai_content, ai_content_admin_override, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .order('engagement_score', { ascending: false, nullsFirst: false })
          .order('stream_count', { ascending: false })
          .limit(pageRoom - fetched.length);

        const [{ data: recentTracks, error: recentErr }, { data: topTracks, error: topErr }] =
          await Promise.all([recentQuery, topQuery]);

        // This fallback is the last line of defence for this page. When it
        // failed silently the feed was empty with a clean console, which is
        // exactly how the ambiguous artists embed hid for so long.
        if (recentErr) console.error('[ForYou] recent fallback query failed:', recentErr.code, recentErr.message, recentErr.hint || '');
        if (topErr)    console.error('[ForYou] top fallback query failed:', topErr.code, topErr.message, topErr.hint || '');

        // Merge deduped
        const seen = new Set(existingIds);
        const merged = [];
        for (const t of [...(recentTracks || []), ...(topTracks || [])]) {
          if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); }
        }

        let query = { then: (fn) => fn({ data: merged.slice(0, pageRoom - fetched.length) }) };
        const { data: trending } = await query;
        fetched = [...fetched, ...(trending || []).map(t => ({
          ...t,
          artist_name:  t.artists?.artist_name || 'Unknown',
          artist_slug:  t.artists?.slug || null,
          artist_image: t.artists?.profile_image_url || null,
          reason: 'trending',
        }))];
      }

      // Fetch stories from followed artists, inject every 5 tracks
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

      // Spread first, then put the curated picks back on the front in the
      // order they were chosen, then mark the swipe hint, so the hint lands on
      // whatever card actually ends up first. The picks are deliberately not
      // shuffled and not dealt out by artist: an ordered opening is the point.
      const spread = leadPicks.length > 0
        ? [...leadPicks, ...spreadByArtist(fetched)]
        : spreadByArtist(fetched);
      if (offset === 0 && spread.length > 0) spread[0]._isFirst = true;
      if (offset === 0) setTracks(spread);
      else setTracks(prev => [...prev, ...spread]);
    } catch (err) {
      // This catch used to swallow everything and leave the feed empty, so a
      // thrown query looked exactly like "no music available". Every other
      // page worked, which made it look like a data problem when it was not.
      console.error('ForYou load error:', err, err?.message, err?.details, err?.hint);
      if (offset === 0) setLoadError(err?.message || 'Could not load your feed.');
    }
    setLoading(false);
    setLoadingMore(false);
  }, [user]);

  useEffect(() => { loadTracks(0); }, [loadTracks]);

  // If the whole chain failed and the feed is empty, fall back to plain
  // published tracks. Recommendations, ranking and cold start are all
  // improvements on top of "show the music"; none of them should be able to
  // take the music away.
  useEffect(() => {
    if (loading || tracks.length > 0 || !loadError) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('tracks')
        .select('id, title, slug, short_code, genre, mood, cover_artwork_url, file_url, youtube_url, duration, lyrics, artist_id, is_beat, stream_count, like_count, bpm, beat_key, beat_scale, download_price, engagement_score, is_published, is_preorder, release_date, ai_content, ai_content_admin_override, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(30);
      if (cancelled || !data?.length) return;
      setTracks(data.map(t => ({
        ...t,
        artist_name:  t.artists?.artist_name || 'Unknown',
        artist_slug:  t.artists?.slug || null,
        artist_image: t.artists?.profile_image_url || null,
        reason_label: 'New',
      })));
      setLoadError('');
    })();
    return () => { cancelled = true; };
  }, [loading, tracks.length, loadError]);

  useEffect(() => {
    if (idx >= tracks.length - 3 && !loadingMore && tracks.length > 0) loadTracks(tracks.length);
  }, [idx, tracks.length, loadingMore, loadTracks]);

  // Preload next track's audio so it starts instantly when swiped to
  useEffect(() => {
    const next = tracks[idx + 1];
    if (next?.file_url && !next.youtube_url && !preloadedRef.current.has(next.id)) {
      preloadedRef.current.add(next.id);
      // Resolved rather than read straight off the row, so this keeps working
      // when feelz-samples goes private. With REACT_APP_PRIVATE_AUDIO unset it
      // resolves to file_url synchronously enough to be the same preload.
      resolveStreamSrc(next).then(src => {
        if (!src) return;
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = src;
      });
    }
  }, [idx, tracks]);

  // Single source of truth for playback, fires when idx changes
  const lastPlayedIdx = React.useRef(-1);
  // Reset lastPlayedIdx when the track at current idx changes (e.g. after hide)
  const currentTrackId = filteredTracks[idx]?.id;
  React.useEffect(() => {
    // If the track at current index changed (hide removed it), force playback
    if (lastPlayedIdx.current === idx) lastPlayedIdx.current = -1;
  }, [currentTrackId]); // eslint-disable-line

  const hasUserGestured = React.useRef(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const [showTapToPlay, setShowTapToPlay] = useState(false);

  // Show tap-to-play prompt on iOS until first gesture
  useEffect(() => {
    if (isIOS && filteredTracks.length > 0 && !hasUserGestured.current) {
      setShowTapToPlay(true);
    }
  }, [filteredTracks.length]); // eslint-disable-line

  const unlockAndPlay = () => {
    hasUserGestured.current = true;
    setShowTapToPlay(false);
    const item = filteredTracks[idx];
    if (item && item.file_url) {
      window.__feelz_play_source = 'for_you';
      const playableQueue = filteredTracks.filter(t => t?.file_url);
      playTrack(item, playableQueue, playableQueue.findIndex(t => t.id === item.id));
      lastPlayedIdx.current = idx;
      setIsMinimized(true);
    }
  };

  useEffect(() => {
    if (!filteredTracks.length) return;
    const item = filteredTracks[idx];
    if (!item || item._type === 'story') return;
    if (idx === lastPlayedIdx.current) return;
    // iOS: skip useEffect auto-play until unlocked via tap or swipe
    if (isIOS && !hasUserGestured.current) return;
    lastPlayedIdx.current = idx;
    if (item.file_url) {
      window.__feelz_play_source = 'for_you';
      const playableQueue = filteredTracks.filter(t => t?.file_url);
      playTrack(item, playableQueue, playableQueue.findIndex(t => t.id === item.id));
      setIsMinimized(true);
    }
  }, [idx, filteredTracks]); // eslint-disable-line

  const trackStartTime = React.useRef(null);

  const goTo = useCallback((newIdx) => {
    if (newIdx < 0 || newIdx >= tracks.length) return;
    // Capture listen depth for the track being left
    const currentItem = filteredTracks[idx];
    if (currentItem && user && trackStartTime.current) {
      const elapsed = (Date.now() - trackStartTime.current) / 1000;
      const duration = currentItem.duration || 180;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      // Log as implicit signal: < 10% = skip, > 70% = deep listen
      if (pct < 10 && elapsed < 15) {
        // Quick skip, negative signal, record in listener_feedback
        reportFeedbackWrite('skip', supabase.from('listener_feedback').upsert({
          user_id:    user.id,
          track_id:   currentItem.id,
          artist_id:  currentItem.artist_id,
          signal:     'skip',
          listen_pct: pct,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,track_id' }));
      } else if (pct >= 70) {
        // Deep listen, positive signal
        reportFeedbackWrite('deep listen', supabase.from('listener_feedback').upsert({
          user_id:    user.id,
          track_id:   currentItem.id,
          artist_id:  currentItem.artist_id,
          signal:     'deep_listen',
          listen_pct: pct,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,track_id' }));
      }
    }
    hasUserGestured.current = true;
    trackStartTime.current = Date.now();
    // iOS fix: call playTrack synchronously here (inside user gesture)
    // rather than waiting for the useEffect to fire after setIdx
    const nextItem = filteredTracks[newIdx];
    if (nextItem && nextItem.file_url && nextItem._type !== 'story') {
      window.__feelz_play_source = 'for_you';
      const playableQueue = filteredTracks.filter(t => t?.file_url);
      playTrack(nextItem, playableQueue, playableQueue.findIndex(t => t.id === nextItem.id));
      lastPlayedIdx.current = newIdx;
    }
    setIdx(newIdx);
    setDragOffset(0);
  }, [tracks.length, filteredTracks, idx, user, playTrack]);

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
    // Clamp at boundaries, resist pulling past first/last card
    let clamped = dy;
    if (idx === 0 && dy > 0) clamped = dy * 0.12; // rubber band top
    if (idx >= filteredTracks.length - 1 && dy < 0) clamped = dy * 0.12; // rubber band bottom
    setDragOffset(clamped * 0.35);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    const dy  = dragYRef.current;
    const vel = velocityRef.current; // px/ms, negative = moving up (next)
    // Fast flick (>0.3px/ms) only needs 20px. Slow drag needs full threshold.
    const speed     = Math.abs(vel);
    const threshold = speed > 0.3 ? 20 : SWIPE_THRESHOLD;
    if      (dy < -threshold && idx < filteredTracks.length - 1) goTo(idx + 1);
    else if (dy >  threshold && idx > 0) goTo(idx - 1);
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
      // Debounce, prevent rapid firing on trackpad momentum
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
      className="bg-black overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        // On desktop, offset by sidebar width
        ...(window.innerWidth >= 768 ? { left: '256px' } : {}),
        touchAction: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <Helmet><title>For You · Feelz Machine</title><link rel="icon" href="/favicon.ico" /><link rel="apple-touch-icon" href="/logo192.png" /></Helmet>

      {/* Card stack */}
      <div
        className="relative w-full h-full"
        style={{
          transform: `translateY(${-idx * vh + dragOffset}px)`,
          // Snappy spring, 0.2s feels instant, still smooth
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
                filteredTracks[i] ? <ForYouCard track={filteredTracks[i]} isActive={i === idx} user={user} navigate={navigate} onOpenSheet={setActiveSheet} onShare={setShareCard} onNext={() => setIdx(i + 1)} onHide={async (id) => {
                    hiddenIdsRef.current.add(id);
                    setTracks(prev => prev.filter(t => t.id !== id));
                    setIdx(prev => prev);
                    if (user) {
                      // THIS is the 400 in the console.
                      //
                      // It sent `created_at`, and listener_feedback has no such
                      // column, verified against the live API: every other
                      // column returns 200, created_at returns
                      // 42703 "column listener_feedback.created_at does not
                      // exist". The table's timestamp is updated_at, which is
                      // what the other three writes in this file use.
                      //
                      // It was hidden twice over: an awaited Supabase call
                      // returns { error } rather than throwing, so the empty
                      // `catch {}` never even ran, the error was simply
                      // discarded. Hiding a track from this card therefore
                      // never persisted, and the track returned next session.
                      //
                      // artist_id and listen_pct added to match the other hide
                      // path, so the recommender sees the same shape whichever
                      // control the person used.
                      const hidden = filteredTracks.find(t => t?.id === id);
                      reportFeedbackWrite('hide (card)', supabase.from('listener_feedback').upsert({
                        user_id:    user.id,
                        track_id:   id,
                        artist_id:  hidden?.artist_id ?? null,
                        signal:     'not_interested',
                        listen_pct: 0,
                        updated_at: new Date().toISOString(),
                      }, { onConflict: 'user_id,track_id' }));
                    }
                  }} queue={filteredTracks} queueIndex={i} storyArtistIds={storyArtistIds} /> : null
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state for a filter that matched nothing. Without this, picking
          Beats when the loaded page happens to contain none just shows a
          blank screen with no explanation of why. */}
      {!loading && filteredTracks.length === 0 && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-8 pointer-events-none">
          <div className="text-center pointer-events-auto">
            <p className="text-white/50 text-sm mb-1">
              {feedFilter === 'beats' ? 'No beats in your feed right now.'
                : feedFilter === 'music' ? 'No songs in your feed right now.'
                : 'Nothing to show yet.'}
            </p>
            {feedFilter !== 'all' && (
              <button onClick={() => setFeedFilter('all')}
                className="text-xs text-lime-400 hover:text-lime-300 transition mt-1">
                Show everything instead
              </button>
            )}
          </div>
        </div>
      )}

      {/* Status bar gradient */}
      <div className="absolute top-0 inset-x-0 h-20 pointer-events-none z-30"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }} />

      {/* Feed filter tabs, fixed so they never move. Centered on the
          content column, not the full viewport: on mobile there's no
          sidebar so those are the same thing, but on desktop the sidebar
          eats 256px off the left, so viewport-center and content-center
          are different points. */}
      <div className="fixed left-1/2 -translate-x-1/2 md:left-[calc(50%+128px)] z-[55] flex space-x-1 rounded-full p-0.5"
        style={{
          top: 'calc(max(env(safe-area-inset-top, 0px), 14px) + 56px)',
          background: 'rgba(20,20,20,0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
        {[
          { id: 'all',    label: 'All' },
          { id: 'music',  label: 'Music' },
          { id: 'beats',  label: 'Beats' },
        ].map(f => (
          <button key={f.id} onClick={() => { setFeedFilter(f.id); setIdx(0); lastPlayedIdx.current = -1; }}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              feedFilter === f.id ? 'bg-white text-black' : 'text-white/50 hover:text-white/80'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Sign-in nudge for unauthenticated users. Not shown inside the phone
          preview on the sign-in page (src/pages/LoginPage.js), where the
          sign-in form is right next to it. */}
      {!user && !IN_PHONE_PREVIEW && (
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

      {/* Comment sheet, keyboard-aware wrapper component */}
      {activeSheet?.type === 'comments' && (
        <CommentSheetOverlay
          key={activeSheet.track?.id}
          track={activeSheet.track}
          user={user}
          onClose={() => setActiveSheet(null)}
        />
      )}

      {/* Playlist sheet, fixed overlay */}
      {activeSheet?.type === 'playlist' && (
        <div className="fixed inset-0 z-[800] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setActiveSheet(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '480px',
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(10,10,10,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px 24px 0 0',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}>
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

      {/* Full-screen story viewer, rendered at root level so fixed inset-0 takes full screen */}
      {viewingStory && (
        <ArtistStoryView
          stories={viewingStory.stories}
          artist={viewingStory.artist}
          onClose={() => setViewingStory(null)}
        />
      )}

      {/* iOS tap-to-play, positioned over the vinyl area (~center of screen minus 12vh) */}
      {showTapToPlay && (
        <div
          className="fixed inset-0 z-[900]"
          style={{ background: 'transparent' }}
          onClick={e => { e.stopPropagation(); unlockAndPlay(); }}
          onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); unlockAndPlay(); }}
        >
          {/* Circle positioned to exactly match vinyl: center of screen offset by -12vh */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, calc(-50% - 6vh))',
            width: `min(calc(100vw - 120px), 42vh)`,
            height: `min(calc(100vw - 120px), 42vh)`,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(4px)',
            border: '2px solid rgba(255,255,255,0.15)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}>
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="25" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
              <polygon points="21,16 21,36 38,26" fill="white"/>
            </svg>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>Tap to play</p>
          </div>
        </div>
      )}
    </div>
  );
}