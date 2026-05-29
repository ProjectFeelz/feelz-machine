// src/components/TrackCommentSheet.js
// Shared comment bottom sheet used by TrackCard, ForYouPage, and any other surface.
// Props: track, user, onClose

import React, { useState, useEffect, useRef } from 'react';
import { Loader, X, Send } from 'lucide-react';
import { supabase } from '../supabaseClient';

// Respect the iOS soft keyboard by shifting the sheet up
function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!window.visualViewport) return;
    const update = () => {
      const gap = window.innerHeight - window.visualViewport.height;
      setOffset(gap > 50 ? gap : 0);
    };
    window.visualViewport.addEventListener('resize', update);
    return () => window.visualViewport.removeEventListener('resize', update);
  }, []);
  return offset;
}

export default function TrackCommentSheet({ track, user, onClose }) {
  const keyboardOffset = useKeyboardOffset();
  const [comments, setComments] = useState([]);
  const [text,     setText]     = useState('');
  const [posting,  setPosting]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    // Pre-fetch current user's profile so newly posted comments display instantly
    if (user?.id) {
      Promise.all([
        supabase.from('artists').select('user_id, artist_name, profile_image_url').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_profiles').select('user_id, name, avatar_url').eq('user_id', user.id).maybeSingle(),
      ]).then(([{ data: a }, { data: p }]) => {
        if (a) user.__artist  = a;
        if (p) user.__profile = p;
      });
    }

    supabase
      .from('track_comments')
      .select('id, content, created_at, user_id')
      .eq('track_id', track.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(async ({ data: raw }) => {
        if (!raw?.length) { setComments([]); setLoading(false); return; }
        const uids = [...new Set(raw.map(c => c.user_id).filter(Boolean))];
        const [{ data: artists }, { data: profiles }] = await Promise.all([
          supabase.from('artists').select('user_id, artist_name, profile_image_url').in('user_id', uids),
          supabase.from('user_profiles').select('user_id, name, avatar_url').in('user_id', uids),
        ]);
        const aMap = Object.fromEntries((artists  || []).map(a => [a.user_id, a]));
        const pMap = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
        setComments(raw.map(c => ({
          ...c,
          artists:       aMap[c.user_id] || null,
          user_profiles: pMap[c.user_id] || null,
        })));
        setLoading(false);
      });

    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }, [track.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = async () => {
    if (!text.trim() || !user || posting) return;
    setPosting(true);
    const { data } = await supabase
      .from('track_comments')
      .insert({ track_id: track.id, user_id: user.id, content: text.trim() })
      .select('id, content, created_at, user_id')
      .single();

    if (data) {
      setComments(prev => [{
        ...data,
        artists:       user?.__artist  || null,
        user_profiles: user?.__profile || null,
      }, ...prev]);

      // Notify the track's artist — skip if they're commenting on their own track
      try {
        const { data: trackRow } = await supabase
          .from('tracks').select('artist_id, title, artists(user_id)').eq('id', track.id).maybeSingle();
        if (trackRow?.artists?.user_id && trackRow.artists.user_id !== user.id) {
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
              track_id:    track.id,
              track_title: trackRow.title,
              comment:     text.trim().slice(0, 100),
              artist_slug: null,
            },
          });
        }
      } catch { /* notifications are non-critical */ }
    }

    setText('');
    setPosting(false);
  };

  return (
    <div
      className="flex flex-col w-full h-full"
      onClick={e => e.stopPropagation()}
      style={{ paddingBottom: keyboardOffset ? `${keyboardOffset}px` : undefined }}
    >
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

      {/* Track context pill */}
      <div className="flex items-center space-x-2 px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.01]">
        {track.cover_artwork_url
          ? <img src={track.cover_artwork_url} alt="" className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
          : <div className="w-7 h-7 rounded-md bg-white/[0.06] flex items-center justify-center flex-shrink-0"><span className="text-[10px] text-white/30">♪</span></div>}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white/70 truncate">{track.title}</p>
          <p className="text-[10px] text-white/30 truncate">{track.artist_name || ''}</p>
        </div>
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader className="w-5 h-5 animate-spin text-white/20" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center py-10 space-y-2">
            <p className="text-center text-white/30 text-sm">No comments yet — be first.</p>
            <p className="text-[11px] text-white/15">Type below and tap send ↓</p>
          </div>
        ) : (
          comments.map(c => {
            const name   = c.artists?.artist_name || c.user_profiles?.name || (c.user_id ? 'Listener' : 'Anonymous');
            const avatar = c.artists?.profile_image_url || c.user_profiles?.avatar_url;
            const isOwn  = c.user_id === user?.id;
            return (
              <div key={c.id} className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {avatar
                    ? <img src={avatar} alt="" className="w-full h-full object-cover" />
                    : <span className="text-xs text-white/30 font-bold">{name[0].toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-[11px] font-semibold text-white/60">{name}</p>
                    {isOwn && <span className="text-[9px] text-purple-400/60 font-medium">you</span>}
                  </div>
                  <p className="text-sm text-white/90 leading-relaxed mt-0.5">{c.content}</p>
                  <p className="text-[10px] text-white/20 mt-1">
                    {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="flex items-center space-x-2 pl-4 pr-4 py-3 border-t border-white/[0.06] flex-shrink-0 sticky bottom-0 bg-black"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        {!user ? (
          <p className="flex-1 text-xs text-white/25 text-center py-1">Sign in to comment</p>
        ) : (
          <>
            <input
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && post()}
              onFocus={() => setTimeout(() => inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)}
              placeholder="Add a comment…"
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
  );
}
