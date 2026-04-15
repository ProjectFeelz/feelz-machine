import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Heart, MessageCircle, Trash2, Verified, Send, Loader, ChevronDown, ChevronUp } from 'lucide-react';

const EMOJI_REACTIONS = ['🔥', '❤️', '👏', '😮', '😂', '🎵'];

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ExpiryBar({ createdAt }) {
  const created = new Date(createdAt).getTime();
  const total = 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - created;
  const pct = Math.min(100, (elapsed / total) * 100);
  const remaining = total - elapsed;
  const hrs = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const label = hrs > 0 ? `${hrs}h left` : `${mins}m left`;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/20">Expires in {label}</span>
        <span className="text-[10px] text-white/20">{Math.round(100 - pct)}%</span>
      </div>
      <div className="w-full h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-500/60 to-blue-500/40 transition-all duration-1000"
          style={{ width: `${100 - pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ThoughtCard({ thought, onDeleted }) {
  const navigate = useNavigate();
  const { user, artist: myArtist, isAdmin } = useAuth();

  const postArtist = thought.artists || null;
  const isOwner = user && myArtist && thought.artist_id === myArtist.id;
  const canDelete = isOwner || isAdmin;

  const [reactions, setReactions] = useState({});       // { emoji: count }
  const [myReactions, setMyReactions] = useState({});   // { emoji: true/false }
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    fetchReactions();
    fetchLikes();
    fetchCommentCount();
  }, [thought.id]);

  const fetchReactions = async () => {
    const { data } = await supabase
      .from('thought_reactions')
      .select('emoji, user_id')
      .eq('thought_id', thought.id);
    const counts = {};
    const mine = {};
    (data || []).forEach(r => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      if (user && r.user_id === user.id) mine[r.emoji] = true;
    });
    setReactions(counts);
    setMyReactions(mine);
  };

  const fetchLikes = async () => {
    const { count } = await supabase
      .from('thought_reactions')
      .select('*', { count: 'exact', head: true })
      .eq('thought_id', thought.id)
      .eq('emoji', 'like');
    setLikeCount(count || 0);
    if (user) {
      const { data } = await supabase
        .from('thought_reactions')
        .select('id')
        .eq('thought_id', thought.id)
        .eq('user_id', user.id)
        .eq('emoji', 'like')
        .maybeSingle();
      setLiked(!!data);
    }
  };

  const fetchCommentCount = async () => {
    const { count } = await supabase
      .from('thought_comments')
      .select('*', { count: 'exact', head: true })
      .eq('thought_id', thought.id);
    setCommentCount(count || 0);
  };

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('thought_comments')
      .select('id, thought_id, user_id, content, created_at')
      .eq('thought_id', thought.id)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) { console.error('fetchComments error:', error); return; }
    if (!data || data.length === 0) { setComments([]); return; }

    const userIds = [...new Set(data.map(c => c.user_id))];
    const { data: artistsData } = await supabase
      .from('artists')
      .select('user_id, artist_name, slug, profile_image_url, is_verified')
      .in('user_id', userIds);
    const artistMap = {};
    (artistsData || []).forEach(a => { artistMap[a.user_id] = a; });

    const missingIds = userIds.filter(id => !artistMap[id]);
    const profileMap = {};
    if (missingIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('user_profiles')
        .select('user_id, name, avatar_url')
        .in('user_id', missingIds);
      (profilesData || []).forEach(p => { profileMap[p.user_id] = p; });
    }

    setComments(data.map(c => {
      if (artistMap[c.user_id]) return { ...c, commenter: artistMap[c.user_id] };
      const profile = profileMap[c.user_id];
      return {
        ...c,
        commenter: profile
          ? { artist_name: profile.name || 'Listener', profile_image_url: profile.avatar_url || null, slug: null, is_verified: false }
          : null,
      };
    }));
  };

  const handleLike = async () => {
    if (!user) { navigate('/login'); return; }
    if (liked) {
      await supabase.from('thought_reactions')
        .delete()
        .eq('thought_id', thought.id)
        .eq('user_id', user.id)
        .eq('emoji', 'like');
      setLiked(false);
      setLikeCount(prev => Math.max(prev - 1, 0));
    } else {
      await supabase.from('thought_reactions')
        .insert({ thought_id: thought.id, user_id: user.id, emoji: 'like' });
      setLiked(true);
      setLikeCount(prev => prev + 1);
    }
  };

  const handleEmojiReact = async (emoji) => {
    if (!user) { navigate('/login'); return; }
    setShowEmojiPicker(false);
    if (myReactions[emoji]) {
      await supabase.from('thought_reactions')
        .delete()
        .eq('thought_id', thought.id)
        .eq('user_id', user.id)
        .eq('emoji', emoji);
      setReactions(prev => ({ ...prev, [emoji]: Math.max((prev[emoji] || 1) - 1, 0) }));
      setMyReactions(prev => { const n = { ...prev }; delete n[emoji]; return n; });
    } else {
      await supabase.from('thought_reactions')
        .insert({ thought_id: thought.id, user_id: user.id, emoji });
      setReactions(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
      setMyReactions(prev => ({ ...prev, [emoji]: true }));
    }
  };

  const toggleComments = () => {
    if (!showComments) fetchComments();
    setShowComments(p => !p);
  };

  const submitComment = async () => {
    if (!commentText.trim() || !user) return;
    setPosting(true);
    try {
      const { error } = await supabase.from('thought_comments').insert({
        thought_id: thought.id,
        user_id: user.id,
        content: commentText.trim(),
      });
      if (error) throw error;
      setCommentText('');
      setCommentCount(prev => prev + 1);
      fetchComments();
    } catch (err) {
      console.error('Comment error:', err);
    }
    setPosting(false);
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      await supabase.from('artist_thoughts').delete().eq('id', thought.id);
      if (onDeleted) onDeleted(thought.id);
    } catch (err) {
      console.error('Delete error:', err);
    }
    setDeleting(false);
  };

  const activeReactions = Object.entries(reactions).filter(([emoji, count]) => emoji !== 'like' && count > 0);

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-0">
        <button
          onClick={() => postArtist?.slug && navigate(`/artist/${postArtist.slug}`)}
          className="flex items-center space-x-2.5"
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center overflow-hidden flex-shrink-0">
            {postArtist?.profile_image_url
              ? <img src={postArtist.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover" />
              : <span className="text-xs font-bold text-white">{(postArtist?.artist_name || '?')[0]?.toUpperCase()}</span>}
          </div>
          <div className="text-left">
            <div className="flex items-center space-x-1.5">
              <span className="text-sm font-semibold text-white">{postArtist?.artist_name || 'Artist'}</span>
              {postArtist?.is_verified && <Verified className="w-3.5 h-3.5 text-blue-400" />}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-medium">💭 Thought</span>
            </div>
            <span className="text-[11px] text-white/30">{timeAgo(thought.created_at)}</span>
          </div>
        </button>

        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-500/10 transition"
          >
            {deleting
              ? <Loader className="w-3.5 h-3.5 animate-spin text-white/30" />
              : <Trash2 className="w-3.5 h-3.5 text-white/20 hover:text-red-400 transition" />}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{thought.content}</p>
        <ExpiryBar createdAt={thought.created_at} />
      </div>

      {/* Active emoji reactions display */}
      {activeReactions.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {activeReactions.map(([emoji, count]) => (
            <button
              key={emoji}
              onClick={() => handleEmojiReact(emoji)}
              className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs transition active:scale-90 ${
                myReactions[emoji]
                  ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300'
                  : 'bg-white/[0.05] border border-white/[0.08] text-white/60 hover:bg-white/[0.08]'
              }`}
            >
              <span>{emoji}</span>
              <span>{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center px-4 py-2.5 border-t border-white/[0.04] relative">
        {/* Like */}
        <button onClick={handleLike} className="flex items-center space-x-1.5 mr-4 transition active:scale-90">
          <Heart className={`w-4 h-4 transition ${liked ? 'text-red-500 fill-red-500' : 'text-white/30'}`} />
          {likeCount > 0 && <span className={`text-xs ${liked ? 'text-red-400' : 'text-white/30'}`}>{likeCount}</span>}
        </button>

        {/* Emoji picker toggle */}
        <div className="relative mr-4">
          <button
            onClick={() => {
              if (!user) { navigate('/login'); return; }
              setShowEmojiPicker(p => !p);
            }}
            className="flex items-center space-x-1 text-white/30 hover:text-white/60 transition active:scale-90"
          >
            <span className="text-base leading-none">😊</span>
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-8 left-0 z-50 flex items-center space-x-1.5 p-2 rounded-xl shadow-2xl"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}>
              {EMOJI_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleEmojiReact(emoji)}
                  className={`text-xl transition active:scale-90 hover:scale-125 w-8 h-8 flex items-center justify-center rounded-lg ${
                    myReactions[emoji] ? 'bg-purple-500/20' : 'hover:bg-white/[0.06]'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comments toggle */}
        <button onClick={toggleComments} className="flex items-center space-x-1.5 transition active:scale-90">
          <MessageCircle className="w-4 h-4 text-white/30" />
          {commentCount > 0 && <span className="text-xs text-white/30">{commentCount}</span>}
          {showComments
            ? <ChevronUp className="w-3 h-3 text-white/20" />
            : <ChevronDown className="w-3 h-3 text-white/20" />}
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="border-t border-white/[0.04]">
          <div className="max-h-56 overflow-y-auto">
            {comments.map(comment => (
              <div key={comment.id} className="flex space-x-3 px-4 py-3 border-b border-white/[0.02]">
                <button
                  onClick={() => comment.commenter?.slug && navigate(`/artist/${comment.commenter.slug}`)}
                  className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600/50 to-blue-600/50 flex items-center justify-center overflow-hidden flex-shrink-0"
                >
                  {comment.commenter?.profile_image_url
                    ? <img src={comment.commenter.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                    : <span className="text-[10px] font-bold text-white">{(comment.commenter?.artist_name || '?')[0]?.toUpperCase()}</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-medium text-white">{comment.commenter?.artist_name || 'User'}</span>
                    <span className="text-[10px] text-white/20">{timeAgo(comment.created_at)}</span>
                  </div>
                  <p className="text-xs text-white/60 mt-0.5">{comment.content}</p>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-center text-xs text-white/20 py-6">No comments yet. Be the first!</p>
            )}
          </div>

          {user && (
            <div className="px-4 py-3">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                  placeholder="Add a comment..."
                  maxLength={500}
                  className="flex-1 bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none"
                />
                <button
                  onClick={submitComment}
                  disabled={!commentText.trim() || posting}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] disabled:opacity-30 transition"
                >
                  {posting
                    ? <Loader className="w-3.5 h-3.5 animate-spin text-white/40" />
                    : <Send className="w-3.5 h-3.5 text-white/50" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
