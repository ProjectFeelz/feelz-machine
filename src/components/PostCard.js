import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Heart, MessageCircle, Share2, MoreHorizontal, Trash2, Flag, Verified, Loader, Send } from 'lucide-react';

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderContent(text, taggedArtists, navigate) {
  if (!text) return null;

  // Parse markdown-lite: **bold**, *italic*, __underline__
  let parts = text;

  // Split by @mentions and format
  const tokens = [];
  let remaining = parts;
  const mentionRegex = /@(\w[\w\s]*?\w|\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(parts)) !== null) {
    // Text before mention
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: parts.substring(lastIndex, match.index) });
    }

    const mentionName = match[1];
    const tagged = taggedArtists?.find(a => a.artist_name === mentionName);

    if (tagged) {
      tokens.push({ type: 'mention', value: mentionName, slug: tagged.slug });
    } else {
      tokens.push({ type: 'mention_text', value: `@${mentionName}` });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < parts.length) {
    tokens.push({ type: 'text', value: parts.substring(lastIndex) });
  }

  return tokens.map((token, i) => {
    if (token.type === 'mention') {
      return (
        <button key={i} onClick={() => navigate(`/artist/${token.slug}`)}
          className="text-purple-400 font-medium hover:text-purple-300 transition">
          @{token.value}
        </button>
      );
    }
    if (token.type === 'mention_text') {
      return <span key={i} className="text-purple-400/60">{token.value}</span>;
    }
    // Parse basic formatting in text
    return <span key={i}>{formatInline(token.value)}</span>;
  });
}

function formatInline(text) {
  // Simple markdown: **bold** → <strong>, *italic* → <em>, __underline__ → <u>
  const parts = [];
  let remaining = text;
  let key = 0;

  // Process bold
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIdx = 0;
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
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [taggedArtistData, setTaggedArtistData] = useState([]);

  const postArtist = post.artists || post.artist || null;
  const isOwner = user && (post.user_id === user.id);

  useEffect(() => {
    fetchLikeStatus();
    fetchTaggedArtists();
  }, [post.id]);

  const fetchLikeStatus = async () => {
    // Get like count
    const { count } = await supabase
      .from('post_likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id);
    setLikeCount(count || 0);

    // Check if current user liked
    if (user) {
      const { data } = await supabase
        .from('post_likes')
        .select('id')
        .eq('post_id', post.id)
        .eq('user_id', user.id)
        .single();
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
        await supabase.from('post_likes').delete()
          .eq('post_id', post.id).eq('user_id', user.id);
        setLiked(false);
        setLikeCount(prev => Math.max(prev - 1, 0));
      } else {
        await supabase.from('post_likes').insert({ post_id: post.id, user_id: user.id });
        setLiked(true);
        setLikeCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Like error:', err);
    }
  };

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, artists(artist_name, slug, profile_image_url, is_verified)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
      .limit(50);
    setComments(data || []);
  };

  const toggleComments = () => {
    if (!showComments) fetchComments();
    setShowComments(!showComments);
  };

  const submitComment = async () => {
    if (!commentText.trim() || !user) return;
    setPosting(true);
    try {
      const { error } = await supabase.from('comments').insert({
        post_id: post.id,
        user_id: user.id,
        artist_id: myArtist?.id || null,
        content: commentText.trim(),
      });
      if (error) throw error;
      setCommentText('');
      fetchComments();
    } catch (err) {
      console.error('Comment error:', err);
    }
    setPosting(false);
  };

  const handleDelete = async () => {
    if (!isOwner) return;
    try {
      await supabase.from('posts').delete().eq('id', post.id);
      if (onDelete) onDelete(post.id);
    } catch (err) {
      console.error('Delete error:', err);
    }
    setShowMenu(false);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/feed`;
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
              {postArtist?.is_verified && (
                <Verified className="w-3.5 h-3.5 text-blue-400" />
              )}
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

      {/* Post type badge */}
      {post.post_type && post.post_type !== 'standard' && (
        <div className="px-4 pt-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
            backgroundColor: post.post_type === 'news' ? 'rgba(59,130,246,0.1)' : post.post_type === 'trending' ? 'rgba(234,179,8,0.1)' : 'rgba(139,92,246,0.1)',
            color: post.post_type === 'news' ? '#60A5FA' : post.post_type === 'trending' ? '#FBBF24' : '#A78BFA',
          }}>
            {post.post_type === 'news' ? 'News' : post.post_type === 'trending' ? 'Trending' : post.post_type === 'milestone' ? 'Milestone' : post.post_type}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="px-4 py-3">
        <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">
          {renderContent(post.content, taggedArtistData, navigate)}
        </p>
      </div>

      {/* YouTube embed */}
      {post.youtube_id && (
        <div className="px-4 pb-3">
          <div className="rounded-xl overflow-hidden aspect-video bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${post.youtube_id}`}
              className="w-full h-full"
              allowFullScreen
              title="YouTube video"
            />
          </div>
        </div>
      )}

      {/* YouTube embed */}
      {post.youtube_id && (
        <div className="px-4 pb-3">
          <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
            <iframe
              src={`https://www.youtube.com/embed/${post.youtube_id}`}
              className="w-full h-full"
              allowFullScreen
              title="YouTube video"
            />
          </div>
        </div>
      )}

      {/* Tagged artists bar */}
      {taggedArtistData.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center space-x-2 overflow-x-auto">
            {taggedArtistData.map(ta => (
              <button key={ta.id} onClick={() => navigate(`/artist/${ta.slug}`)}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-purple-500/8 rounded-lg flex-shrink-0 hover:bg-purple-500/15 transition">
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
        <button onClick={handleLike}
          className="flex items-center space-x-1.5 mr-5 transition active:scale-90">
          <Heart className={`w-4.5 h-4.5 transition ${liked ? 'text-red-500 fill-red-500' : 'text-white/30'}`} />
          {likeCount > 0 && <span className={`text-xs ${liked ? 'text-red-400' : 'text-white/30'}`}>{likeCount}</span>}
        </button>

        <button onClick={toggleComments}
          className="flex items-center space-x-1.5 mr-5 transition active:scale-90">
          <MessageCircle className="w-4.5 h-4.5 text-white/30" />
          {post.comment_count > 0 && <span className="text-xs text-white/30">{post.comment_count}</span>}
        </button>

        <button onClick={handleShare}
          className="flex items-center space-x-1.5 transition active:scale-90">
          <Share2 className="w-4 h-4 text-white/30" />
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="border-t border-white/[0.04]">
          {/* Comment list */}
          <div className="max-h-64 overflow-y-auto">
            {comments.map(comment => (
              <div key={comment.id} className="flex space-x-3 px-4 py-3 border-b border-white/[0.02]">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600/50 to-blue-600/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {comment.artists?.profile_image_url
                    ? <img src={comment.artists.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                    : <span className="text-[10px] font-bold text-white">{(comment.artists?.artist_name || '?')?.[0]?.toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-medium text-white">{comment.artists?.artist_name || 'User'}</span>
                    <span className="text-[10px] text-white/20">{timeAgo(comment.created_at)}</span>
                  </div>
                  <p className="text-xs text-white/60 mt-0.5">{comment.content}</p>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-center text-xs text-white/20 py-6">No comments yet</p>
            )}
          </div>

          {/* Comment input */}
          {user && (
            <div className="flex items-center space-x-2 px-4 py-3">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                placeholder="Add a comment..."
                maxLength={500}
                className="flex-1 bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none"
              />
              <button onClick={submitComment} disabled={!commentText.trim() || posting}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] disabled:opacity-30 transition">
                {posting ? <Loader className="w-3.5 h-3.5 animate-spin text-white/40" /> : <Send className="w-3.5 h-3.5 text-white/50" />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
