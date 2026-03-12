import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { Heart, MessageCircle, Share2, MoreHorizontal, Trash2, Flag, Verified, Loader, Send, Music, Play, Pause, CornerDownRight } from 'lucide-react';

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderContent(text, taggedArtists, navigate) {
  if (!text) return null;
  const tokens = [];
  const mentionRegex = /@(\w[\w\s]*?\w|\w+)/g;
  let lastIndex = 0;
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push({ type: 'text', value: text.substring(lastIndex, match.index) });
    const mentionName = match[1];
    const tagged = taggedArtists?.find(a => a.artist_name === mentionName);
    if (tagged) tokens.push({ type: 'mention', value: mentionName, slug: tagged.slug });
    else tokens.push({ type: 'mention_text', value: `@${mentionName}` });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) tokens.push({ type: 'text', value: text.substring(lastIndex) });
  return tokens.map((token, i) => {
    if (token.type === 'mention') return (
      <button key={i} onClick={() => navigate(`/artist/${token.slug}`)} className="text-purple-400 font-medium hover:text-purple-300 transition">
        @{token.value}
      </button>
    );
    if (token.type === 'mention_text') return <span key={i} className="text-purple-400/60">{token.value}</span>;
    return <span key={i}>{formatInline(token.value)}</span>;
  });
}

function formatInline(text) {
  const parts = [];
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIdx = 0;
  let key = 0;
  let m;
  while ((m = boldRegex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(<span key={key++}>{text.substring(lastIdx, m.index)}</span>);
    parts.push(<strong key={key++} className="font-semibold">{m[1]}</strong>);
    lastIdx = m.index + m[0].length;
  }
  if (parts.length === 0) return text;
  if (lastIdx < text.length) parts.push(<span key={key++}>{text.substring(lastIdx)}</span>);
  return parts;
}

export default function PostCard({ post, onDelete, onUpdate }) {
  const navigate = useNavigate();
  const { user, artist: myArtist } = useAuth();
  const playerContext = usePlayer?.();
  const { playTrack, currentTrack, isPlaying, togglePlay } = playerContext || {};

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // { id, artist_name }
  const [posting, setPosting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [taggedArtistData, setTaggedArtistData] = useState([]);
  const [trackData, setTrackData] = useState(null);
  const [trackArtist, setTrackArtist] = useState(null); // the actual artist who owns the track

  const postArtist = post.artists || post.artist || null;
  const isOwner = user && myArtist && (post.artist_id === myArtist.id);
  const isTrackActive = currentTrack?.id === post.track_id;
  const isTrackPlaying = isTrackActive && isPlaying;

  useEffect(() => {
    fetchLikeStatus();
    fetchTaggedArtists();
    if (post.track_id) fetchTrack();
  }, [post.id]);

  const fetchTrack = async () => {
    const { data } = await supabase
      .from('tracks')
      .select('id, title, cover_artwork_url, file_url, duration, stream_count, artist_id')
      .eq('id', post.track_id)
      .maybeSingle();
    if (data) {
      setTrackData(data);
      // FIX: fetch the actual artist who owns the track, not the post author
      if (data.artist_id) {
        const { data: artistData } = await supabase
          .from('artists')
          .select('id, artist_name, slug, profile_image_url, is_verified')
          .eq('id', data.artist_id)
          .maybeSingle();
        setTrackArtist(artistData || null);
      }
    }
  };

  const fetchLikeStatus = async () => {
    const { count } = await supabase
      .from('artist_post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id);
    setLikeCount(count || 0);

    if (user) {
      const { data } = await supabase
        .from('artist_post_likes')
        .select('id')
        .eq('post_id', post.id)
        .eq('user_id', user.id)
        .maybeSingle();
      setLiked(!!data);
    }
  };

  const fetchTaggedArtists = async () => {
    if (post.tagged_artist_ids?.length > 0) {
      const { data } = await supabase
        .from('artists')
        .select('id, artist_name, slug, profile_image_url, is_verified')
        .in('id', post.tagged_artist_ids);
      setTaggedArtistData(data || []);
    }
  };

  const handleLike = async () => {
    if (!user) { navigate('/login'); return; }
    try {
      if (liked) {
        await supabase.from('artist_post_likes').delete()
          .eq('post_id', post.id).eq('user_id', user.id);
        setLiked(false);
        setLikeCount(prev => Math.max(prev - 1, 0));
      } else {
        await supabase.from('artist_post_likes').insert({ post_id: post.id, user_id: user.id });
        setLiked(true);
        setLikeCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Like error:', err);
    }
  };

  const handlePlayTrack = (e) => {
    e.stopPropagation();
    if (!trackData || !playTrack) return;
    if (isTrackActive) {
      togglePlay?.();
    } else {
      // FIX: use trackArtist (track owner) not postArtist (post author)
      const artist = trackArtist || postArtist;
      const enriched = { ...trackData, artist_name: artist?.artist_name, artist_slug: artist?.slug };
      playTrack(enriched, [enriched]);
    }
  };

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('artist_post_comments')
      .select('id, post_id, user_id, content, created_at')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) { console.error('fetchComments error:', error); return; }

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(c => c.user_id))];

      // Fetch artists first
      const { data: artistsData } = await supabase
        .from('artists')
        .select('user_id, artist_name, slug, profile_image_url, is_verified')
        .in('user_id', userIds);
      const artistMap = {};
      (artistsData || []).forEach(a => { artistMap[a.user_id] = a; });

      // Fetch user_profiles for listeners (those without an artist row)
      const missingIds = userIds.filter(id => !artistMap[id]);
      const profileMap = {};
      if (missingIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('user_profiles')
          .select('user_id, name')
          .in('user_id', missingIds);
        (profilesData || []).forEach(p => { profileMap[p.user_id] = p; });
      }

      setComments(data.map(c => {
        if (artistMap[c.user_id]) return { ...c, artists: artistMap[c.user_id] };
        const profile = profileMap[c.user_id];
        if (profile) return {
          ...c,
          artists: {
            artist_name: profile.name || 'Listener',
            profile_image_url: null,
            slug: null,
            is_verified: false,
          }
        };
        return { ...c, artists: null };
      }));
    } else {
      setComments([]);
    }
  };

  const toggleComments = () => {
    if (!showComments) fetchComments();
    setShowComments(!showComments);
  };

  const handleReply = (comment) => {
    setReplyingTo({ id: comment.id, artist_name: comment.artists?.artist_name || 'User' });
    setCommentText(`@${comment.artists?.artist_name || 'User'} `);
  };

  const submitComment = async () => {
    if (!commentText.trim() || !user) return;
    setPosting(true);
    try {
      const { error } = await supabase.from('artist_post_comments').insert({
        post_id: post.id,
        user_id: user.id,
        content: commentText.trim(),
      });
      if (error) throw error;
      setCommentText('');
      setReplyingTo(null);
      fetchComments();
    } catch (err) {
      console.error('Comment error:', err);
    }
    setPosting(false);
  };

  const handleDelete = async () => {
    if (!isOwner) return;
    try {
      await supabase.from('artist_posts').delete().eq('id', post.id);
      if (onDelete) onDelete(post.id);
    } catch (err) {
      console.error('Delete error:', err);
    }
    setShowMenu(false);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/feed?post=${post.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Feelz Machine', text: post.content?.substring(0, 100), url }); } catch (e) {}
    } else {
      await navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-0">
        <button onClick={() => postArtist?.slug && navigate(`/artist/${postArtist.slug}`)}
          className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center overflow-hidden flex-shrink-0">
            {postArtist?.profile_image_url
              ? <img src={postArtist.profile_image_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              : <span className="text-sm font-bold text-white">{(postArtist?.artist_name || '?')?.[0]?.toUpperCase()}</span>}
          </div>
          <div className="text-left">
            <div className="flex items-center space-x-1.5">
              <span className="text-sm font-semibold text-white">{postArtist?.artist_name || 'Anonymous'}</span>
              {postArtist?.is_verified && <Verified className="w-3.5 h-3.5 text-blue-400" />}
            </div>
            <span className="text-[11px] text-white/30">{timeAgo(post.created_at)}</span>
          </div>
        </button>

        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.05] transition">
            <MoreHorizontal className="w-4 h-4 text-white/30" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-neutral-900 border border-white/[0.08] rounded-lg overflow-hidden z-20 shadow-xl min-w-[140px]">
              {isOwner && (
                <button onClick={handleDelete}
                  className="w-full flex items-center space-x-2 px-4 py-2.5 text-red-400 hover:bg-white/[0.05] transition text-left text-sm">
                  <Trash2 className="w-3.5 h-3.5" /><span>Delete</span>
                </button>
              )}
              <button onClick={() => setShowMenu(false)}
                className="w-full flex items-center space-x-2 px-4 py-2.5 text-white/50 hover:bg-white/[0.05] transition text-left text-sm">
                <Flag className="w-3.5 h-3.5" /><span>Report</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">
          {renderContent(post.content, taggedArtistData, navigate)}
        </p>
      </div>

      {/* Tagged track preview */}
      {trackData && (
        <div className="px-4 pb-3">
          <button
            onClick={handlePlayTrack}
            className="w-full flex items-center space-x-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition active:scale-[0.99] text-left"
          >
            <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.08]">
              {trackData.cover_artwork_url
                ? <img src={trackData.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5 text-white/20" /></div>}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                {isTrackPlaying
                  ? <Pause className="w-4 h-4 text-white" fill="white" />
                  : <Play className="w-4 h-4 text-white" fill="white" />}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{trackData.title}</p>
              {/* FIX: show track's actual artist, not post author */}
              <button
                onClick={(e) => { e.stopPropagation(); trackArtist?.slug && navigate(`/artist/${trackArtist.slug}`); }}
                className="text-xs text-white/40 mt-0.5 hover:text-purple-400 transition text-left"
              >
                {trackArtist?.artist_name || postArtist?.artist_name}
                {trackData.duration ? ` · ${formatDuration(trackData.duration)}` : ''}
              </button>
            </div>
            <div className="flex-shrink-0 px-2.5 py-1 rounded-full bg-white/[0.08]">
              <span className="text-[10px] text-white/40 font-medium">
                {isTrackActive && isTrackPlaying ? 'Playing' : 'Play'}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Tagged artists bar */}
      {taggedArtistData.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center space-x-2 overflow-x-auto">
            {taggedArtistData.map(ta => (
              <button key={ta.id} onClick={() => navigate(`/artist/${ta.slug}`)}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-purple-500/[0.08] rounded-lg flex-shrink-0 hover:bg-purple-500/15 transition">
                <div className="w-5 h-5 rounded-full overflow-hidden bg-purple-600/30 flex-shrink-0">
                  {ta.profile_image_url
                    ? <img src={ta.profile_image_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                    : <span className="text-[8px] font-bold text-white flex items-center justify-center w-full h-full">{ta.artist_name?.[0]}</span>}
                </div>
                <span className="text-xs text-purple-400 font-medium">{ta.artist_name}</span>
                {ta.is_verified && <Verified className="w-2.5 h-2.5 text-blue-400" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center px-4 py-2.5 border-t border-white/[0.04]">
        <button onClick={handleLike} className="flex items-center space-x-1.5 mr-5 transition active:scale-90">
          <Heart className={`w-4 h-4 transition ${liked ? 'text-red-500 fill-red-500' : 'text-white/30'}`} />
          {likeCount > 0 && <span className={`text-xs ${liked ? 'text-red-400' : 'text-white/30'}`}>{likeCount}</span>}
        </button>
        <button onClick={toggleComments} className="flex items-center space-x-1.5 mr-5 transition active:scale-90">
          <MessageCircle className="w-4 h-4 text-white/30" />
          {post.comment_count > 0 && <span className="text-xs text-white/30">{post.comment_count}</span>}
        </button>
        <button onClick={handleShare} className="flex items-center space-x-1.5 transition active:scale-90">
          <Share2 className="w-4 h-4 text-white/30" />
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="border-t border-white/[0.04]">
          <div className="max-h-64 overflow-y-auto">
            {comments.map(comment => (
              <div key={comment.id} className="flex space-x-3 px-4 py-3 border-b border-white/[0.02] group">
                <button
                  onClick={() => comment.artists?.slug && navigate(`/artist/${comment.artists.slug}`)}
                  className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600/50 to-blue-600/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {comment.artists?.profile_image_url
                    ? <img src={comment.artists.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                    : <span className="text-[10px] font-bold text-white">{(comment.artists?.artist_name || '?')?.[0]?.toUpperCase()}</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => comment.artists?.slug && navigate(`/artist/${comment.artists.slug}`)}
                      className="text-xs font-medium text-white hover:text-purple-300 transition">
                      {comment.artists?.artist_name || 'User'}
                    </button>
                    <span className="text-[10px] text-white/20">{timeAgo(comment.created_at)}</span>
                  </div>
                  <p className="text-xs text-white/60 mt-0.5">{comment.content}</p>
                </div>
                {/* Reply button */}
                {user && (
                  <button
                    onClick={() => handleReply(comment)}
                    className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 text-[10px] text-white/30 hover:text-purple-400 transition flex-shrink-0 mt-1">
                    <CornerDownRight className="w-3 h-3" />
                    <span>Reply</span>
                  </button>
                )}
              </div>
            ))}
            {comments.length === 0 && <p className="text-center text-xs text-white/20 py-6">No comments yet</p>}
          </div>
          {user && (
            <div className="px-4 py-3">
              {replyingTo && (
                <div className="flex items-center justify-between mb-2 px-2 py-1 bg-purple-500/10 rounded-lg">
                  <span className="text-[11px] text-purple-400">Replying to @{replyingTo.artist_name}</span>
                  <button onClick={() => { setReplyingTo(null); setCommentText(''); }} className="text-white/30 hover:text-white/60">
                    ×
                  </button>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                  placeholder={replyingTo ? `Reply to @${replyingTo.artist_name}...` : 'Add a comment...'}
                  maxLength={500}
                  className="flex-1 bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none"
                />
                <button onClick={submitComment} disabled={!commentText.trim() || posting}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] disabled:opacity-30 transition">
                  {posting ? <Loader className="w-3.5 h-3.5 animate-spin text-white/40" /> : <Send className="w-3.5 h-3.5 text-white/50" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}