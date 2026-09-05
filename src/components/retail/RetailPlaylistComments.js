// src/components/retail/RetailPlaylistComments.js
// Comments on a retail playlist, adapted from TrackCommentSheet.
//
// Differences from the main app version, all deliberate:
//   - The author is a venue, not a user. The commenter name comes from
//     venue_name on the row, stamped in by a SECURITY DEFINER trigger,
//     because retail_venues RLS only lets a venue read its own row.
//   - Flat thread, no replies or reactions. Venues are leaving feedback
//     on a vibe, not having a conversation. The tables for reactions
//     don't exist on the retail side and inventing them now would be
//     building ahead of a need.
//   - Same keyboard handling and input bar behaviour as the main app,
//     since retail runs as an installed PWA on venue tablets and hits
//     exactly the same iOS keyboard problem.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader, X, Send, MessageCircle, Heart, CornerDownRight } from 'lucide-react';
import { supabase } from '../../supabaseClient';

function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!window.visualViewport) return;
    const update = () => {
      const kh = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
      setOffset(Math.max(0, kh));
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

export default function RetailPlaylistComments({ playlist, venue, isPreviewMode = false, onClose }) {
  const keyboardOffset = useKeyboardOffset();
  const [comments, setComments] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // One call for the whole thread. get_retail_playlist_comments returns
  // like counts and whether this venue liked each comment, which would
  // otherwise be a query per comment on a venue tablet.
  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase
      .rpc('get_retail_playlist_comments', { p_playlist_id: playlist.id });
    if (rpcError) setError('Could not load comments.');
    setComments(data || []);
    setLoading(false);
  }, [playlist.id]);

  useEffect(() => {
    load();
    setTimeout(() => inputRef.current?.focus(), 400);
  }, [load]);

  const post = async () => {
    if (!text.trim() || !venue || posting) return;
    if (isPreviewMode) {
      setError('Admin preview, comments are not recorded against this venue.');
      return;
    }
    setPosting(true);
    setError('');
    const { error: insertError } = await supabase
      .from('retail_playlist_comments')
      .insert({
        playlist_id: playlist.id,
        venue_id: venue.id,
        content: text.trim(),
        parent_comment_id: replyTo?.id || null,
      });
    setPosting(false);
    if (insertError) {
      setError('Could not post that. Try again.');
      return;
    }
    setText('');
    setReplyTo(null);
    // Reload rather than splice: a reply has to land under its parent, and
    // the ordering that does that lives in the function.
    load();
  };

  const remove = async (comment) => {
    const { error: deleteError } = await supabase
      .from('retail_playlist_comments')
      .delete()
      .eq('id', comment.id)
      .eq('venue_id', venue.id);
    // Deleting a parent cascades to its replies in the database, so the
    // list is reloaded rather than filtered by id.
    if (!deleteError) load();
  };

  const toggleLike = async (comment) => {
    if (!venue || isPreviewMode) return;
    // Optimistic, then reconciled by load() on failure only. A like that
    // does not appear instantly feels broken on a tablet.
    setComments(prev => prev.map(c => c.id === comment.id
      ? { ...c, liked_by_me: !c.liked_by_me, like_count: c.like_count + (c.liked_by_me ? -1 : 1) }
      : c));

    if (comment.liked_by_me) {
      const { error: delError } = await supabase.from('retail_comment_likes')
        .delete().eq('comment_id', comment.id).eq('venue_id', venue.id);
      if (delError) load();
    } else {
      const { error: insError } = await supabase.from('retail_comment_likes')
        .insert({ comment_id: comment.id, venue_id: venue.id });
      if (insError) load();
    }
  };

  // The function returns replies grouped under their parent already, so the
  // tree is built here rather than sorted again.
  const topLevel = comments.filter(c => !c.parent_comment_id);
  const repliesFor = (id) => comments.filter(c => c.parent_comment_id === id);

  const Comment = ({ c, isReply }) => {
    const name = c.venue_name || 'A venue';
    const isOwn = c.venue_id === venue?.id;
    return (
      <div className={`flex items-start space-x-3 ${isReply ? 'mt-3' : ''}`}>
        <div className={`rounded-full bg-purple-500/15 border border-purple-400/20 flex-shrink-0 flex items-center justify-center ${
          isReply ? 'w-6 h-6' : 'w-8 h-8'}`}>
          <span className={`text-purple-200/70 font-bold ${isReply ? 'text-[10px]' : 'text-xs'}`}>
            {name[0]?.toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 flex-wrap">
            <p className="text-[11px] font-semibold text-white/60">{name}</p>
            {isOwn && <span className="text-[9px] text-purple-400/60 font-medium">you</span>}
          </div>
          <div className="flex items-start justify-between space-x-2">
            <p className="text-sm text-white/90 leading-relaxed mt-0.5 flex-1">{c.content}</p>
            {isOwn && (
              <button onClick={() => remove(c)}
                className="flex-shrink-0 p-1 rounded-lg hover:bg-white/[0.06] transition active:scale-90 mt-0.5">
                <X className="w-3 h-3 text-white/20 hover:text-red-400/60" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <button onClick={() => toggleLike(c)}
              className="flex items-center gap-1 group active:scale-90 transition"
              aria-label={c.liked_by_me ? 'Unlike' : 'Like'}>
              <Heart className={`w-3.5 h-3.5 transition ${
                c.liked_by_me ? 'text-red-400 fill-red-400' : 'text-white/25 group-hover:text-white/50'}`} />
              {c.like_count > 0 && (
                <span className={`text-[10px] ${c.liked_by_me ? 'text-red-400/70' : 'text-white/25'}`}>
                  {c.like_count}
                </span>
              )}
            </button>
            {/* Replies attach to the top level comment, so replying to a
                reply threads under the same parent rather than nesting
                without limit. */}
            <button onClick={() => setReplyTo(isReply ? { id: c.parent_comment_id, venue_name: c.venue_name } : c)}
              className="text-[10px] text-white/25 hover:text-white/50 transition">
              Reply
            </button>
            <span className="text-[10px] text-white/15">
              {new Date(c.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const Thread = ({ comment, replies }) => (
    <div>
      <Comment c={comment} isReply={false} />
      {replies.length > 0 && (
        <div className="ml-5 pl-4 border-l border-white/[0.06] mt-1">
          {replies.map(r => <Comment key={r.id} c={r} isReply />)}
        </div>
      )}
    </div>
  );

  const inputBarBottom = keyboardOffset > 0 ? keyboardOffset : 0;

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}>
      <div
        className="relative w-full sm:max-w-lg h-[80vh] sm:h-[70vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(30,20,60,0.98) 0%, rgba(14,14,18,0.99) 100%)',
          border: '1px solid rgba(167,139,250,0.22)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}>

        <div className="flex justify-between items-center px-5 py-4 flex-shrink-0 border-b border-white/[0.06]">
          <div>
            <p className="text-sm font-bold text-white">Comments</p>
            {!loading && comments.length > 0 && (
              <p className="text-[11px] text-white/30 mt-0.5">
                {comments.length} comment{comments.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06]">
            <X className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>

        <div className="flex items-center space-x-2 px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.01] flex-shrink-0">
          {playlist.cover_image_url
            ? <img src={playlist.cover_image_url} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
            : <div className="w-7 h-7 rounded-md bg-purple-500/15 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white/70 truncate">{playlist.title}</p>
            {playlist.mood && <p className="text-[10px] text-white/30 truncate">{playlist.mood}</p>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ paddingBottom: '120px' }}>
          {loading ? (
            <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center py-10 space-y-2">
              <MessageCircle className="w-6 h-6 text-white/10" />
              <p className="text-center text-white/30 text-sm">No comments on this vibe yet.</p>
              <p className="text-[11px] text-white/15">Tell us how it plays in your space.</p>
            </div>
          ) : (
            topLevel.map(c => <Thread key={c.id} comment={c} replies={repliesFor(c.id)} />)
          )}
        </div>

        <div
          className="border-t border-white/[0.06] flex-shrink-0"
          style={{
            background: 'rgba(14,14,18,0.98)',
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: inputBarBottom > 0 ? `${inputBarBottom}px` : 0,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            transition: 'bottom 0.12s ease',
          }}>
          {replyTo && (
            <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
              <CornerDownRight className="w-3 h-3 text-purple-400/60 flex-shrink-0" />
              <p className="text-[11px] text-white/40 flex-1 truncate">
                Replying to {replyTo.venue_name || 'a venue'}
              </p>
              <button onClick={() => setReplyTo(null)}
                className="p-1 rounded-lg hover:bg-white/[0.06] transition">
                <X className="w-3 h-3 text-white/30" />
              </button>
            </div>
          )}
          {error && <p className="text-[11px] text-red-400 px-4 pt-2">{error}</p>}
          <div className="flex items-center space-x-2 px-4 py-2.5">
            <input
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && post()}
              placeholder={replyTo ? "Write a reply…" : "Add a comment…"}
              maxLength={500}
              className="flex-1 min-w-0 bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none border border-white/[0.06] focus:border-purple-400/40"
            />
            <button
              onClick={post}
              disabled={!text.trim() || !venue || posting}
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl transition active:scale-95 disabled:opacity-30"
              style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)' }}>
              {posting
                ? <Loader className="w-4 h-4 animate-spin text-purple-400" />
                : <Send className="w-4 h-4 text-purple-400" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}