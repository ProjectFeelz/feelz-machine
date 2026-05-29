// src/components/TrackCommentSheet.js
// Shared comment sheet — ForYouPage, TrackCard, and any other surface.
// Features: keyboard snap, replies, emoji reactions.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader, X, Send, CornerDownRight, Smile } from 'lucide-react';
import { supabase } from '../supabaseClient';

const REACTIONS = ['🔥','❤️','😤','🎯','💯','🙌'];

// Snap the sheet above the iOS soft keyboard using visualViewport
function useKeyboardSnap(sheetRef) {
  useEffect(() => {
    if (!window.visualViewport) return;
    const update = () => {
      if (!sheetRef.current) return;
      const offset = window.innerHeight - window.visualViewport.height;
      sheetRef.current.style.transform = offset > 50
        ? `translateY(-${offset}px)`
        : 'translateY(0)';
    };
    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
    return () => {
      window.visualViewport.removeEventListener('resize', update);
      window.visualViewport.removeEventListener('scroll', update);
    };
  }, [sheetRef]);
}

// ── Reaction bar ──────────────────────────────────────────────────────────────
function ReactionBar({ commentId, userId, onReact }) {
  const [counts, setCounts]   = useState({});
  const [mine,   setMine]     = useState(null);
  const [open,   setOpen]     = useState(false);

  useEffect(() => {
    supabase
      .from('track_comment_reactions')
      .select('emoji, user_id')
      .eq('comment_id', commentId)
      .then(({ data }) => {
        const c = {};
        (data || []).forEach(r => {
          c[r.emoji] = (c[r.emoji] || 0) + 1;
          if (r.user_id === userId) setMine(r.emoji);
        });
        setCounts(c);
      });
  }, [commentId, userId]);

  const react = async (emoji) => {
    setOpen(false);
    if (!userId) return;
    if (mine === emoji) {
      // Un-react
      await supabase.from('track_comment_reactions')
        .delete().eq('comment_id', commentId).eq('user_id', userId);
      setCounts(p => ({ ...p, [emoji]: Math.max(0, (p[emoji] || 1) - 1) }));
      setMine(null);
    } else {
      if (mine) {
        await supabase.from('track_comment_reactions')
          .delete().eq('comment_id', commentId).eq('user_id', userId);
        setCounts(p => ({ ...p, [mine]: Math.max(0, (p[mine] || 1) - 1) }));
      }
      await supabase.from('track_comment_reactions')
        .upsert({ comment_id: commentId, user_id: userId, emoji },
          { onConflict: 'comment_id,user_id' });
      setCounts(p => ({ ...p, [emoji]: (p[emoji] || 0) + 1 }));
      setMine(emoji);
    }
    onReact?.();
  };

  const visible = Object.entries(counts).filter(([, n]) => n > 0);

  return (
    <div className="flex items-center flex-wrap gap-1 mt-1.5 relative">
      {visible.map(([emoji, n]) => (
        <button key={emoji} onClick={() => react(emoji)}
          className={`flex items-center space-x-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition active:scale-90 ${
            mine === emoji
              ? 'bg-purple-500/20 border border-purple-500/30'
              : 'bg-white/[0.05] border border-white/[0.07]'
          }`}>
          <span>{emoji}</span>
          <span className="text-white/40 font-medium">{n}</span>
        </button>
      ))}
      {userId && (
        <div className="relative">
          <button onClick={() => setOpen(o => !o)}
            className="w-6 h-6 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center transition hover:bg-white/[0.08] active:scale-90">
            <Smile className="w-3 h-3 text-white/30" />
          </button>
          {open && (
            <div className="absolute bottom-7 left-0 flex space-x-1 bg-black/90 border border-white/[0.1] rounded-2xl px-2 py-1.5 z-10 shadow-xl"
              onClick={e => e.stopPropagation()}>
              {REACTIONS.map(e => (
                <button key={e} onClick={() => react(e)}
                  className={`text-base transition active:scale-75 ${mine === e ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reply input ───────────────────────────────────────────────────────────────
function ReplyInput({ commentId, trackId, user, parentAuthor, onReplied }) {
  const [text,    setText]    = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = async () => {
    if (!text.trim() || sending || !user) return;
    setSending(true);
    await supabase.from('track_comments').insert({
      track_id:          trackId,
      user_id:           user.id,
      content:           text.trim(),
      parent_comment_id: commentId,
      created_at:        new Date().toISOString(),
    });
    setText('');
    setSending(false);
    onReplied?.();
  };

  return (
    <div className="flex items-center space-x-2 mt-2 pl-2">
      <CornerDownRight className="w-3 h-3 text-white/20 flex-shrink-0" />
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); }}}
        placeholder={`Reply to ${parentAuthor}…`}
        maxLength={200}
        className="flex-1 bg-white/[0.05] rounded-xl px-3 py-1.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20"
      />
      <button onClick={send} disabled={!text.trim() || sending}
        className="w-7 h-7 flex items-center justify-center rounded-xl disabled:opacity-30 active:scale-95"
        style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)' }}>
        {sending ? <Loader className="w-3 h-3 animate-spin text-purple-400" /> : <Send className="w-3 h-3 text-purple-400" />}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TrackCommentSheet({ track, user, onClose }) {
  const sheetRef  = useRef(null);
  const inputRef  = useRef(null);
  const [comments,  setComments]  = useState([]);
  const [text,      setText]      = useState('');
  const [posting,   setPosting]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [replyingTo, setReplyingTo] = useState(null); // { id, authorName }

  useKeyboardSnap(sheetRef);

  const load = useCallback(async () => {
    const { data: raw } = await supabase
      .from('track_comments')
      .select('id, content, created_at, user_id, parent_comment_id')
      .eq('track_id', track.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!raw?.length) { setComments([]); setLoading(false); return; }

    const uids = [...new Set(raw.map(c => c.user_id).filter(Boolean))];
    const [{ data: artists }, { data: profiles }] = await Promise.all([
      supabase.from('artists').select('user_id, artist_name, profile_image_url').in('user_id', uids),
      supabase.from('user_profiles').select('user_id, name, avatar_url').in('user_id', uids),
    ]);
    const aMap = Object.fromEntries((artists  || []).map(a => [a.user_id, a]));
    const pMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));

    // Build threaded: top-level first, then replies nested under parent
    const withMeta = raw.map(c => ({
      ...c,
      artist:  aMap[c.user_id] || null,
      profile: pMap[c.user_id] || null,
    }));
    const topLevel = withMeta.filter(c => !c.parent_comment_id);
    const replies  = withMeta.filter(c =>  c.parent_comment_id);
    const replyMap = {};
    replies.forEach(r => {
      if (!replyMap[r.parent_comment_id]) replyMap[r.parent_comment_id] = [];
      replyMap[r.parent_comment_id].push(r);
    });
    setComments({ topLevel, replyMap });
    setLoading(false);
  }, [track.id]);

  useEffect(() => {
    // Pre-fetch own profile for optimistic post
    if (user?.id) {
      Promise.all([
        supabase.from('artists').select('user_id, artist_name, profile_image_url').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_profiles').select('user_id, name, avatar_url').eq('user_id', user.id).maybeSingle(),
      ]).then(([{ data: a }, { data: p }]) => {
        if (a) user.__artist  = a;
        if (p) user.__profile = p;
      });
    }
    load();
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = async () => {
    if (!text.trim() || !user || posting) return;
    setPosting(true);
    const { data } = await supabase
      .from('track_comments')
      .insert({
        track_id:          track.id,
        user_id:           user.id,
        content:           text.trim(),
        parent_comment_id: replyingTo?.id || null,
      })
      .select('id, content, created_at, user_id, parent_comment_id')
      .single();

    if (data) {
      const newComment = {
        ...data,
        artist:  user?.__artist  || null,
        profile: user?.__profile || null,
      };
      setComments(prev => {
        if (!prev.topLevel) return prev;
        if (data.parent_comment_id) {
          const updated = { ...prev.replyMap };
          if (!updated[data.parent_comment_id]) updated[data.parent_comment_id] = [];
          updated[data.parent_comment_id] = [...updated[data.parent_comment_id], newComment];
          return { ...prev, replyMap: updated };
        }
        return { ...prev, topLevel: [...prev.topLevel, newComment] };
      });

      // Notify track artist
      try {
        const { data: trackRow } = await supabase
          .from('tracks').select('artist_id, title, artists(user_id)').eq('id', track.id).maybeSingle();
        if (trackRow?.artists?.user_id && trackRow.artists.user_id !== user.id) {
          const name = user.__artist?.artist_name || user.__profile?.name || 'Someone';
          await supabase.from('notifications').insert({
            user_id:   trackRow.artists.user_id,
            artist_id: trackRow.artist_id,
            type:      'track_commented',
            title:     `${name} commented on "${trackRow.title}"`,
            message:   text.trim().slice(0, 100),
            metadata:  { track_id: track.id, track_title: trackRow.title, comment: text.trim().slice(0, 100) },
          });
        }
      } catch { /* non-critical */ }
    }
    setText('');
    setReplyingTo(null);
    setPosting(false);
  };

  const CommentRow = ({ comment, isReply = false }) => {
    const name   = comment.artist?.artist_name || comment.profile?.name || 'Listener';
    const avatar = comment.artist?.profile_image_url || comment.profile?.avatar_url;
    const isOwn  = comment.user_id === user?.id;

    return (
      <div className={`flex items-start space-x-2.5 ${isReply ? 'pl-8 mt-2' : 'mt-4'}`}>
        <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {avatar
            ? <img src={avatar} alt="" className="w-full h-full object-cover" />
            : <span className="text-xs font-bold text-white/30">{name[0]?.toUpperCase()}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <p className="text-[11px] font-semibold text-white/60">{name}</p>
            {isOwn && <span className="text-[9px] text-purple-400/60 font-medium">you</span>}
            <p className="text-[10px] text-white/20">
              {new Date(comment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
          <p className="text-sm text-white/90 leading-relaxed mt-0.5">{comment.content}</p>

          <ReactionBar
            commentId={comment.id}
            userId={user?.id}
            onReact={load}
          />

          {!isReply && user && (
            <button
              onClick={() => setReplyingTo(
                replyingTo?.id === comment.id ? null : { id: comment.id, authorName: name }
              )}
              className="mt-1.5 text-[10px] text-white/25 hover:text-white/50 transition font-medium">
              {replyingTo?.id === comment.id ? 'Cancel' : 'Reply'}
            </button>
          )}

          {replyingTo?.id === comment.id && (
            <ReplyInput
              commentId={comment.id}
              trackId={track.id}
              user={user}
              parentAuthor={name}
              onReplied={() => { setReplyingTo(null); load(); }}
            />
          )}
        </div>
      </div>
    );
  };

  const topLevel = comments.topLevel || [];
  const replyMap = comments.replyMap || {};
  const totalCount = topLevel.length +
    Object.values(replyMap).reduce((s, r) => s + r.length, 0);

  return (
    <div
      ref={sheetRef}
      className="flex flex-col w-full h-full"
      onClick={e => e.stopPropagation()}
      style={{ transition: 'transform 0.15s ease-out' }}
    >
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-4 flex-shrink-0 border-b border-white/[0.06]">
        <div>
          <p className="text-sm font-bold text-white">Comments</p>
          {!loading && totalCount > 0 && (
            <p className="text-[11px] text-white/30 mt-0.5">{totalCount} comment{totalCount !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06]">
          <X className="w-3.5 h-3.5 text-white/60" />
        </button>
      </div>

      {/* Track pill */}
      <div className="flex items-center space-x-2 px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.01]">
        {track.cover_artwork_url
          ? <img src={track.cover_artwork_url} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
          : <div className="w-7 h-7 rounded-md bg-white/[0.06] flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white/70 truncate">{track.title}</p>
          <p className="text-[10px] text-white/30 truncate">{track.artist_name || ''}</p>
        </div>
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto px-4 pb-3">
        {loading ? (
          <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
        ) : topLevel.length === 0 ? (
          <div className="flex flex-col items-center py-10">
            <p className="text-center text-white/30 text-sm">No comments yet — be first.</p>
          </div>
        ) : (
          topLevel.map(comment => (
            <div key={comment.id}>
              <CommentRow comment={comment} />
              {(replyMap[comment.id] || []).map(reply => (
                <CommentRow key={reply.id} comment={reply} isReply />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Input — sticks to bottom, keyboard pushes sheet via translateY on parent */}
      <div className="flex-shrink-0 border-t border-white/[0.06] bg-black"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        {replyingTo && (
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <p className="text-[10px] text-white/30">
              <CornerDownRight className="w-2.5 h-2.5 inline mr-1" />
              Replying to <span className="text-white/50 font-medium">{replyingTo.authorName}</span>
            </p>
            <button onClick={() => setReplyingTo(null)} className="text-[10px] text-white/20 hover:text-white/40">
              Cancel
            </button>
          </div>
        )}
        <div className="flex items-center space-x-2 px-4 py-3">
          {!user ? (
            <p className="flex-1 text-xs text-white/25 text-center py-1">Sign in to comment</p>
          ) : (
            <>
              <input
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && post()}
                placeholder={replyingTo ? `Reply to ${replyingTo.authorName}…` : 'Add a comment…'}
                maxLength={300}
                className="flex-1 min-w-0 bg-white/[0.06] rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none border border-white/[0.06] focus:border-white/20"
              />
              <button
                onClick={post}
                disabled={!text.trim() || posting}
                className="w-9 h-9 flex items-center justify-center rounded-xl transition disabled:opacity-30 active:scale-95"
                style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)' }}
              >
                {posting
                  ? <Loader className="w-4 h-4 animate-spin text-purple-400" />
                  : <Send className="w-4 h-4 text-purple-400" />}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}