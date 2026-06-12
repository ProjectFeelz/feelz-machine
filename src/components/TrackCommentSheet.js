// src/components/TrackCommentSheet.js
// Fixed: input always visible, reply context chip, iOS keyboard handling

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader, X, Send, CornerDownRight, Smile } from 'lucide-react';
import { supabase } from '../supabaseClient';

const REACTIONS = ['🔥','❤️','😤','🎯','💯','🙌'];

// ── Keyboard offset ───────────────────────────────────────────────────────────
function useKeyboardOffset() {
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => {
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

// ── Reaction bar ──────────────────────────────────────────────────────────────
function ReactionBar({ commentId, userId }) {
  const [counts, setCounts] = useState({});
  const [mine,   setMine]   = useState(null);
  const [open,   setOpen]   = useState(false);

  useEffect(() => {
    supabase.from('track_comment_reactions')
      .select('emoji, user_id').eq('comment_id', commentId)
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
        .upsert({ comment_id: commentId, user_id: userId, emoji }, { onConflict: 'comment_id,user_id' });
      setCounts(p => ({ ...p, [emoji]: (p[emoji] || 0) + 1 }));
      setMine(emoji);
    }
  };

  const visible = Object.entries(counts).filter(([, n]) => n > 0);

  return (
    <div className="flex items-center flex-wrap gap-1 mt-1.5 relative">
      {visible.map(([emoji, n]) => (
        <button key={emoji} onClick={() => react(emoji)}
          className={`flex items-center space-x-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition active:scale-90 ${
            mine === emoji ? 'bg-purple-500/20 border border-purple-500/30' : 'bg-white/[0.05] border border-white/[0.07]'
          }`}>
          <span>{emoji}</span>
          <span className="text-white/40 font-medium">{n}</span>
        </button>
      ))}
      {userId && (
        <div className="relative">
          <button onClick={() => setOpen(o => !o)}
            className="w-6 h-6 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] active:scale-90">
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

// ── Main component ────────────────────────────────────────────────────────────
export default function TrackCommentSheet({ track, user, onClose, routePrefix = 'track' }) {
  const keyboardOffset = useKeyboardOffset();
  const [comments,   setComments]   = useState([]);
  const [text,       setText]       = useState('');
  const [posting,    setPosting]    = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [replyingTo, setReplyingTo] = useState(null); // { id, authorName }
  const inputRef = useRef(null);

  useEffect(() => {
    if (user?.id) {
      Promise.all([
        supabase.from('artists').select('user_id, artist_name, profile_image_url').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_profiles').select('user_id, name, avatar_url').eq('user_id', user.id).maybeSingle(),
        supabase.from('listeners').select('user_id, display_name, avatar_url').eq('user_id', user.id).maybeSingle(),
      ]).then(([{ data: a }, { data: p }, { data: l }]) => {
        if (a) user.__artist  = a;
        if (p) user.__profile = p;
        // Use listener display_name as fallback profile name
        if (l && !p?.name) user.__profile = { ...l, name: l.display_name, avatar_url: l.avatar_url };
      });
    }
    load();
    // Focus input after sheet animates in
    setTimeout(() => inputRef.current?.focus(), 400);
  }, [track.id]); // eslint-disable-line

  const load = useCallback(async () => {
    const { data: raw } = await supabase
      .from('track_comments')
      .select('id, content, created_at, user_id, parent_comment_id')
      .eq('track_id', track.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!raw?.length) { setComments([]); setLoading(false); return; }

    const uids = [...new Set(raw.map(c => c.user_id).filter(id => id && id !== 'null'))];
    const [{ data: artists }, { data: profiles }, { data: listenerProfiles }] = uids.length > 0
      ? await Promise.all([
          supabase.from('artists').select('user_id, artist_name, profile_image_url').in('user_id', uids),
          supabase.from('user_profiles').select('user_id, name, avatar_url').in('user_id', uids),
          supabase.from('listeners').select('user_id, display_name, avatar_url, tier, preferences').in('user_id', uids),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

    const artistMap   = Object.fromEntries((artists          || []).map(a => [a.user_id, a]));
    const profileMap  = Object.fromEntries((profiles         || []).map(p => [p.user_id, p]));
    const listenerMap = Object.fromEntries((listenerProfiles || []).map(l => [l.user_id, { ...l, name: l.display_name || 'Listener', isFanPro: ['fan_pro','pro','premium'].includes(l.tier) && l.preferences?.fanBadge !== false }]));

    setComments(raw.map(c => ({
      ...c,
      artists:       artistMap[c.user_id]  || null,
      user_profiles: profileMap[c.user_id] || listenerMap[c.user_id] || null,
    })));
    setLoading(false);
  }, [track.id]);

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
      const enriched = { ...data, artists: user.__artist || null, user_profiles: user.__profile || null };
      setComments(prev => {
        if (data.parent_comment_id) {
          // Insert reply right after its parent comment
          const idx = prev.findIndex(c => c.id === data.parent_comment_id);
          if (idx !== -1) {
            const next = [...prev];
            next.splice(idx + 1, 0, enriched);
            return next;
          }
        }
        // Top-level comment — prepend
        return [enriched, ...prev];
      });
      try {
        const [{ data: trackRow }, { data: commenterArtist }] = await Promise.all([
          supabase.from('tracks').select('artist_id, title, slug, artists(user_id)').eq('id', track.id).maybeSingle(),
          supabase.from('artists').select('id, artist_name, profile_image_url').eq('user_id', user.id).maybeSingle(),
        ]);
        if (trackRow?.artists?.user_id && trackRow.artists.user_id !== user.id) {
          const name = commenterArtist?.artist_name || user.__profile?.name || 'Someone';
          await supabase.from('notifications').insert({
            user_id:        trackRow.artists.user_id,
            artist_id:      trackRow.artist_id,
            type:           'track_commented',
            title:          `${name} commented on "${trackRow.title}"`,
            message:        text.trim().slice(0, 100),
            track_id:       track.id,
            from_artist_id: commenterArtist?.id || null,
            metadata: {
              track_id:           track.id,
              track_slug:         trackRow.slug || track.slug || null,
              track_route_prefix: routePrefix,
              track_title:        trackRow.title,
              comment:            text.trim().slice(0, 100),
              from_artist_name:   name,
              from_artist_image:  commenterArtist?.profile_image_url || null,
            },
          });
        }
      } catch {}
    }
    setText('');
    setReplyingTo(null);
    setPosting(false);
  };

  const topLevel = comments.filter(c => !c.parent_comment_id);
  const replyMap = {};
  comments.filter(c => c.parent_comment_id).forEach(r => {
    if (!replyMap[r.parent_comment_id]) replyMap[r.parent_comment_id] = [];
    replyMap[r.parent_comment_id].push(r);
  });

  const renderComment = (c, isReply = false) => {
    const name     = c.artists?.artist_name || c.user_profiles?.name || c.user_profiles?.display_name || 'Listener';
    const avatar   = c.artists?.profile_image_url || c.user_profiles?.avatar_url;
    const isFanPro = c.user_profiles?.isFanPro || false;
    const isOwn  = c.user_id === user?.id;
    return (
      <div key={c.id} className={`flex items-start space-x-3 ${isReply ? 'pl-8 mt-2' : ''}`}>
        <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {avatar
            ? <img src={avatar} alt="" className="w-full h-full object-cover" />
            : <span className="text-xs text-white/30 font-bold">{name[0]?.toUpperCase()}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 flex-wrap">
            <p className="text-[11px] font-semibold text-white/60">{name}</p>
            {isFanPro && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
                ⚡ Fan
              </span>
            )}
            {isOwn && <span className="text-[9px] text-purple-400/60 font-medium">you</span>}
          </div>
          <p className="text-sm text-white/90 leading-relaxed mt-0.5">{c.content}</p>
          <ReactionBar commentId={c.id} userId={user?.id} />
          {!isReply && user && (
            <button
              onClick={() => {
                if (replyingTo?.id === c.id) {
                  setReplyingTo(null);
                } else {
                  setReplyingTo({ id: c.id, authorName: name });
                  setTimeout(() => inputRef.current?.focus(), 150);
                }
              }}
              className="mt-1 text-[10px] text-white/25 hover:text-white/50 transition font-medium">
              {replyingTo?.id === c.id ? 'Cancel reply' : 'Reply'}
            </button>
          )}
          {/* Reply indicator under the comment being replied to */}
          {replyingTo?.id === c.id && (
            <div className="flex items-center space-x-1 mt-1">
              <CornerDownRight className="w-3 h-3 text-purple-400/50 flex-shrink-0" />
              <span className="text-[11px] text-purple-400/60">Type your reply below ↓</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Fixed bottom position — accounts for keyboard on all platforms
  const inputBarBottom = keyboardOffset > 0 ? keyboardOffset : 0;

  return (
    <div className="flex flex-col w-full h-full" onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-4 flex-shrink-0 border-b border-white/[0.06]">
        <div>
          <p className="text-sm font-bold text-white">Comments</p>
          {!loading && comments.length > 0 && (
            <p className="text-[11px] text-white/30 mt-0.5">{comments.length} comment{comments.length !== 1 ? 's' : ''}</p>
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
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ paddingBottom: "140px" }}>
        {loading ? (
          <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
        ) : topLevel.length === 0 ? (
          <div className="flex flex-col items-center py-8 space-y-2">
            <p className="text-center text-white/30 text-sm">No comments yet — be first.</p>
            <p className="text-[11px] text-white/15">Type below and tap send ↓</p>
          </div>
        ) : (
          topLevel.map(c => (
            <div key={c.id}>
              {renderComment(c, false)}
              {(replyMap[c.id] || []).map(r => renderComment(r, true))}
            </div>
          ))
        )}
      </div>

      {/* Input bar — fixed to bottom, moves up with keyboard on all platforms */}
      <div
        className="border-t border-white/[0.06] bg-black"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          // Sit above nav (64px) + safe area when keyboard is closed,
          // or above keyboard when it's open (keyboard already pushes above nav)
          bottom: inputBarBottom > 0
            ? `${inputBarBottom}px`
            : 'calc(64px + env(safe-area-inset-bottom, 0px))',
          paddingBottom: inputBarBottom > 0 ? '8px' : '8px',
          transition: 'bottom 0.12s ease',
          zIndex: 900,
        }}
      >
        {/* Reply context chip */}
        {replyingTo && (
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <div className="flex items-center space-x-1.5">
              <CornerDownRight className="w-3 h-3 text-purple-400/60" />
              <span className="text-[11px] text-purple-400/70">
                Replying to <span className="font-semibold">{replyingTo.authorName}</span>
              </span>
            </div>
            <button
              onClick={() => { setReplyingTo(null); setText(''); }}
              className="text-white/30 hover:text-white/60 transition p-1"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        {/* Input row */}
        <div className="flex items-center space-x-2 px-4 py-2">
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && post()}
            placeholder={replyingTo ? `Reply to ${replyingTo.authorName}…` : 'Add a comment…'}
            maxLength={300}
            className="flex-1 min-w-0 bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none border border-white/[0.06] focus:border-white/20"
          />
          <button
            onClick={post}
            disabled={!text.trim() || !user || posting}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl transition active:scale-95 disabled:opacity-30"
            style={{ background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.3)' }}
          >
            {posting
              ? <Loader className="w-4 h-4 animate-spin text-purple-400" />
              : <Send className="w-4 h-4 text-purple-400" />}
          </button>
        </div>
      </div>
    </div>
  );
}