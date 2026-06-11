/**
 * FanLeaderboardPage.js
 * src/pages/FanLeaderboardPage.js
 *
 * Premium-only fan leaderboard for artists.
 * Shows top fans ranked by streams, likes, comments and follows.
 * Artist can share to stories with a tagged track.
 *
 * Route: /artist/:slug/fans  (artist-only, premium gate)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/useTier';
import {
  ArrowLeft, Crown, Music, Share2, Zap,
  Heart, MessageCircle, Play, Download, Loader,
  Lock, ChevronDown,
} from 'lucide-react';

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const RANK_LABELS = ['👑', '🥈', '🥉'];

export default function FanLeaderboardPage() {
  const { slug } = useParams();
  const navigate  = useNavigate();
  const { user, artist: myArtist } = useAuth();
  const { isPremium } = useTier();

  const [artist, setArtist]         = useState(null);
  const [fans, setFans]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [period, setPeriod]         = useState('alltime'); // alltime | month | week
  const [shareTrack, setShareTrack] = useState(null);
  const [tracks, setTracks]         = useState([]);
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [sharing, setSharing]       = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const canvasRef = useRef(null);

  const isOwner = user && myArtist && myArtist.slug === slug;

  useEffect(() => {
    fetchArtist();
  }, [slug]);

  useEffect(() => {
    if (artist?.id) {
      fetchLeaderboard();
      fetchTracks();
    }
  }, [artist?.id, period]);

  const fetchArtist = async () => {
    const { data } = await supabase.from('artists').select('id, artist_name, slug, profile_image_url').eq('slug', slug).maybeSingle();
    if (!data) { navigate('/browse'); return; }
    setArtist(data);
  };

  const fetchTracks = async () => {
    if (!artist?.id) return;
    const { data } = await supabase.from('tracks').select('id, title, cover_artwork_url, slug')
      .eq('artist_id', artist.id).eq('is_published', true)
      .order('engagement_score', { ascending: false }).limit(20);
    setTracks(data || []);
  };

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      // Date filter
      let since = null;
      if (period === 'week')  since = new Date(Date.now() - 7  * 86400000).toISOString();
      if (period === 'month') since = new Date(Date.now() - 30 * 86400000).toISOString();

      // Get all track IDs for this artist
      const { data: trackData } = await supabase
        .from('tracks').select('id').eq('artist_id', artist.id).eq('is_published', true);
      const trackIds = (trackData || []).map(t => t.id);
      if (!trackIds.length) { setFans([]); setLoading(false); return; }

      // Streams per user
      let streamQuery = supabase.from('streams').select('user_id').in('track_id', trackIds);
      if (since) streamQuery = streamQuery.gte('created_at', since);
      const { data: streamData } = await streamQuery;

      // Likes per user
      let likeQuery = supabase.from('track_likes').select('user_id').in('track_id', trackIds);
      if (since) likeQuery = likeQuery.gte('created_at', since);
      const { data: likeData } = await likeQuery;

      // Comments per user
      let commentQuery = supabase.from('track_comments').select('user_id').in('track_id', trackIds);
      if (since) commentQuery = commentQuery.gte('created_at', since);
      const { data: commentData } = await commentQuery;

      // Follow (binary — did they follow?)
      const { data: followData } = await supabase
        .from('follows').select('follower_id').eq('artist_id', artist.id);

      // Aggregate scores per user
      // Weights: stream=1, like=3, comment=5, follow=10
      const scores = {};
      const counts = {};

      const add = (userId, field, pts) => {
        if (!userId) return;
        if (!scores[userId]) { scores[userId] = 0; counts[userId] = { streams: 0, likes: 0, comments: 0, follows: 0 }; }
        scores[userId] += pts;
        counts[userId][field]++;
      };

      (streamData  || []).forEach(s => add(s.user_id,     'streams',  1));
      (likeData    || []).forEach(l => add(l.user_id,     'likes',    3));
      (commentData || []).forEach(c => add(c.user_id,     'comments', 5));
      (followData  || []).forEach(f => add(f.follower_id, 'follows',  10));

      // Sort by score, take top 50
      const top = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([uid, score]) => ({ user_id: uid, score, ...counts[uid] }));

      if (!top.length) { setFans([]); setLoading(false); return; }

      // Enrich with profile data
      const uids = top.map(t => t.user_id);
      const [{ data: artistProfiles }, { data: listenerProfiles }] = await Promise.all([
        supabase.from('artists').select('user_id, artist_name, profile_image_url, slug').in('user_id', uids),
        supabase.from('listeners').select('user_id, display_name, avatar_url').in('user_id', uids),
      ]);

      const artistMap  = Object.fromEntries((artistProfiles  || []).map(a => [a.user_id, a]));
      const listenerMap = Object.fromEntries((listenerProfiles || []).map(l => [l.user_id, l]));

      setFans(top.map((f, i) => {
        const a = artistMap[f.user_id];
        const l = listenerMap[f.user_id];
        return {
          ...f,
          rank:   i + 1,
          name:   a?.artist_name || l?.display_name || 'Listener',
          avatar: a?.profile_image_url || l?.avatar_url || null,
          slug:   a?.slug || null,
        };
      }));
    } catch (err) { console.error('Leaderboard error:', err); }
    setLoading(false);
  };

  // Generate a shareable image card and post to stories
  const handleShareToStory = async () => {
    if (!shareTrack) { setShowTrackPicker(true); return; }
    setSharing(true);
    try {
      const top3 = fans.slice(0, 3);
      // Build story content as a text-based notification/story
      const storyContent = `🏆 My Top Fans\n\n${top3.map((f, i) => `${RANK_LABELS[i]} ${f.name} — ${formatNumber(f.score)} pts`).join('\n')}\n\n🎵 ${shareTrack.title}`;

      await supabase.from('artist_stories').insert({
        artist_id:   artist.id,
        type:        'fan_leaderboard',
        content:     storyContent,
        track_id:    shareTrack.id,
        expires_at:  new Date(Date.now() + 24 * 3600000).toISOString(),
        metadata: {
          leaderboard: top3.map(f => ({ name: f.name, avatar: f.avatar, score: f.score, rank: f.rank })),
          track_title: shareTrack.title,
          track_cover: shareTrack.cover_artwork_url,
          period,
        },
      });

      setShareSuccess(true);
      setTimeout(() => { setShareSuccess(false); setShowTrackPicker(false); setShareTrack(null); }, 2000);
    } catch (err) { console.error('Share error:', err); }
    setSharing(false);
  };

  // Premium gate — non-owners or non-premium see locked state
  if (!isOwner) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center">
        <Lock className="w-12 h-12 text-white/10 mb-4" />
        <p className="text-white/40 text-sm">This page is only visible to the artist</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-xs text-white/25 hover:text-white/40">Go back</button>
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center pb-32">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.1))', border: '1px solid rgba(139,92,246,0.3)' }}>
          <Crown className="w-8 h-8 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Premium Feature</h2>
        <p className="text-sm text-white/40 mb-6 max-w-xs">
          The Fan Leaderboard is available on Premium. Upgrade to see who your most loyal fans are and share it to your story.
        </p>
        <button onClick={() => navigate('/upgrade')}
          className="px-6 py-3 rounded-2xl text-sm font-semibold text-white transition active:scale-95"
          style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
          Upgrade to Premium
        </button>
        <button onClick={() => navigate(-1)} className="mt-4 text-xs text-white/25 hover:text-white/40">Go back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-32">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.04]"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}>
        <div className="flex items-center justify-between px-4 pb-3 pt-2">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="text-center">
            <p className="text-sm font-bold text-white">Fan Leaderboard</p>
            <p className="text-[11px] text-white/30">{artist?.artist_name}</p>
          </div>
          <button
            onClick={() => shareTrack ? handleShareToStory() : setShowTrackPicker(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition active:scale-95"
            style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', color: '#fff' }}>
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
        </div>

        {/* Period tabs */}
        <div className="flex space-x-1 mx-4 mb-3 bg-white/[0.04] rounded-xl p-1">
          {[
            { key: 'alltime', label: 'All Time' },
            { key: 'month',   label: 'This Month' },
            { key: 'week',    label: 'This Week' },
          ].map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
                period === p.key ? 'bg-white text-black' : 'text-white/40'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top 3 podium */}
      {!loading && fans.length >= 3 && (
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-end justify-center space-x-3">
            {/* 2nd place */}
            <div className="flex flex-col items-center flex-1">
              <div className="relative mb-2">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2"
                  style={{ borderColor: RANK_COLORS[1] }}>
                  {fans[1].avatar
                    ? <img src={fans[1].avatar} alt={fans[1].name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-lg font-bold bg-white/10 text-white">{fans[1].name[0]}</div>}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                  style={{ background: RANK_COLORS[1], color: '#000' }}>2</div>
              </div>
              <p className="text-xs font-semibold text-white truncate max-w-[70px] text-center">{fans[1].name}</p>
              <p className="text-[10px] text-white/40">{formatNumber(fans[1].score)} pts</p>
              <div className="w-full h-16 rounded-t-xl mt-2" style={{ background: 'rgba(192,192,192,0.15)', border: '1px solid rgba(192,192,192,0.2)' }} />
            </div>

            {/* 1st place */}
            <div className="flex flex-col items-center flex-1">
              <div className="text-2xl mb-1">👑</div>
              <div className="relative mb-2">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2"
                  style={{ borderColor: RANK_COLORS[0], boxShadow: `0 0 20px ${RANK_COLORS[0]}60` }}>
                  {fans[0].avatar
                    ? <img src={fans[0].avatar} alt={fans[0].name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xl font-bold bg-white/10 text-white">{fans[0].name[0]}</div>}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                  style={{ background: RANK_COLORS[0], color: '#000' }}>1</div>
              </div>
              <p className="text-xs font-bold text-white truncate max-w-[80px] text-center">{fans[0].name}</p>
              <p className="text-[10px] text-white/40">{formatNumber(fans[0].score)} pts</p>
              <div className="w-full h-24 rounded-t-xl mt-2" style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.25)' }} />
            </div>

            {/* 3rd place */}
            <div className="flex flex-col items-center flex-1">
              <div className="relative mb-2">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2"
                  style={{ borderColor: RANK_COLORS[2] }}>
                  {fans[2].avatar
                    ? <img src={fans[2].avatar} alt={fans[2].name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-lg font-bold bg-white/10 text-white">{fans[2].name[0]}</div>}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                  style={{ background: RANK_COLORS[2], color: '#fff' }}>3</div>
              </div>
              <p className="text-xs font-semibold text-white truncate max-w-[70px] text-center">{fans[2].name}</p>
              <p className="text-[10px] text-white/40">{formatNumber(fans[2].score)} pts</p>
              <div className="w-full h-10 rounded-t-xl mt-2" style={{ background: 'rgba(205,127,50,0.15)', border: '1px solid rgba(205,127,50,0.2)' }} />
            </div>
          </div>
        </div>
      )}

      {/* Score legend */}
      <div className="mx-6 mb-4 p-3 rounded-xl flex items-center justify-between"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center space-x-1 text-[10px] text-white/30">
          <Play className="w-3 h-3" /><span>Stream=1</span>
        </div>
        <div className="flex items-center space-x-1 text-[10px] text-white/30">
          <Heart className="w-3 h-3" /><span>Like=3</span>
        </div>
        <div className="flex items-center space-x-1 text-[10px] text-white/30">
          <MessageCircle className="w-3 h-3" /><span>Comment=5</span>
        </div>
        <div className="flex items-center space-x-1 text-[10px] text-white/30">
          <Zap className="w-3 h-3" /><span>Follow=10</span>
        </div>
      </div>

      {/* Full list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader className="w-5 h-5 animate-spin text-white/30" />
        </div>
      ) : fans.length === 0 ? (
        <div className="text-center py-16 px-6">
          <Crown className="w-10 h-10 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">No fan activity yet for this period</p>
        </div>
      ) : (
        <div className="px-4 space-y-1">
          {fans.map((fan, i) => (
            <div key={fan.user_id}
              className="flex items-center space-x-3 px-3 py-3 rounded-xl transition"
              style={{
                background: i < 3 ? `rgba(255,215,0,${0.04 - i * 0.01})` : 'transparent',
                border: i < 3 ? `1px solid rgba(255,215,0,${0.12 - i * 0.03})` : '1px solid transparent',
              }}>
              {/* Rank */}
              <div className="w-7 flex-shrink-0 text-center">
                {i < 3
                  ? <span className="text-base">{RANK_LABELS[i]}</span>
                  : <span className="text-xs font-bold text-white/25">{fan.rank}</span>}
              </div>

              {/* Avatar */}
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-white/[0.06]">
                {fan.avatar
                  ? <img src={fan.avatar} alt={fan.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white/60">{fan.name[0]}</div>}
              </div>

              {/* Name + stats */}
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => fan.slug && navigate(`/artist/${fan.slug}`)}
                  className="text-sm font-semibold text-white truncate text-left block w-full hover:text-purple-300 transition">
                  {fan.name}
                </button>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="text-[10px] text-white/25 flex items-center space-x-0.5">
                    <Play className="w-2.5 h-2.5" /><span>{formatNumber(fan.streams)}</span>
                  </span>
                  <span className="text-[10px] text-white/25 flex items-center space-x-0.5">
                    <Heart className="w-2.5 h-2.5" /><span>{formatNumber(fan.likes)}</span>
                  </span>
                  <span className="text-[10px] text-white/25 flex items-center space-x-0.5">
                    <MessageCircle className="w-2.5 h-2.5" /><span>{formatNumber(fan.comments)}</span>
                  </span>
                </div>
              </div>

              {/* Score */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold" style={{ color: i < 3 ? RANK_COLORS[i] : 'rgba(255,255,255,0.5)' }}>
                  {formatNumber(fan.score)}
                </p>
                <p className="text-[9px] text-white/20">pts</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Track picker + share sheet */}
      {showTrackPicker && (
        <div className="fixed inset-0 z-[700] flex items-end justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowTrackPicker(false)}>
          <div className="w-full max-w-lg rounded-t-3xl overflow-hidden"
            style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <p className="text-sm font-bold text-white">Tag a track to share</p>
              <p className="text-xs text-white/30 mt-0.5">Choose a track to feature alongside your leaderboard story</p>
            </div>
            <div className="max-h-80 overflow-y-auto p-3 space-y-1">
              {tracks.map(track => (
                <button key={track.id}
                  onClick={() => { setShareTrack(track); setShowTrackPicker(false); setTimeout(handleShareToStory, 100); }}
                  className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition hover:bg-white/[0.06] active:scale-[0.98] text-left"
                  style={{ background: shareTrack?.id === track.id ? 'rgba(139,92,246,0.15)' : 'transparent' }}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.06]">
                    {track.cover_artwork_url
                      ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover" />
                      : <Music className="w-4 h-4 text-white/20 m-auto mt-3" />}
                  </div>
                  <p className="text-sm text-white truncate flex-1">{track.title}</p>
                  {shareSuccess && shareTrack?.id === track.id && (
                    <span className="text-[10px] text-green-400 font-semibold">Shared!</span>
                  )}
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-white/[0.06]">
              <button onClick={() => setShowTrackPicker(false)}
                className="w-full py-2 text-sm text-white/30">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
