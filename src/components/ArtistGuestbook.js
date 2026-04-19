/**
 * ArtistGuestbook.js
 * Listeners leave a message on an artist's profile.
 * One entry per listener per artist (upsert).
 *
 * Artist-owner features:
 *  - Delete any message (trash icon)
 *  - Pin / highlight a favourite (star icon) — pinned entry always shows first
 *
 * Listener features:
 *  - Quick emoji picker to append emoji to message input
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, Send, Loader, Trash2, Star } from 'lucide-react';

const QUICK_EMOJIS = ['❤️', '🔥', '🎵', '🙌', '💯', '🎤', '👏', '✨'];

function timeAgo(date) {
  const d = Math.floor((Date.now() - new Date(date)) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ArtistGuestbook({ artistId, textColor = '#ffffff', accentColor = '#a855f7', isOwner = false }) {
  const { user } = useAuth();
  const [entries, setEntries]   = useState([]);
  const [myEntry, setMyEntry]   = useState('');
  const [saved, setSaved]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [showAll, setShowAll]   = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [pinning, setPinning]   = useState(null);

  useEffect(() => {
    if (!artistId) return;
    const load = async () => {
      const { data } = await supabase
        .from('artist_guestbook')
        .select('id, user_id, display_name, message, created_at, pinned')
        .eq('artist_id', artistId)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      const rows = data || [];
      setEntries(rows);
      const mine = rows.find(e => e.user_id === user?.id);
      if (mine) setSaved(mine.message);
      setLoading(false);
    };
    load();
  }, [artistId, user?.id]);

  const getDisplayName = async () => {
    const { data: a } = await supabase
      .from('artists').select('artist_name').eq('user_id', user.id).maybeSingle();
    if (a?.artist_name) return a.artist_name;
    const { data: l } = await supabase
      .from('listeners').select('display_name').eq('user_id', user.id).maybeSingle();
    return l?.display_name || 'Listener';
  };

  const submit = async () => {
    if (!myEntry.trim() || !user || saving) return;
    setSaving(true);
    const display_name = await getDisplayName();
    const { data, error } = await supabase
      .from('artist_guestbook')
      .upsert(
        { artist_id: artistId, user_id: user.id, message: myEntry.trim(), display_name },
        { onConflict: 'artist_id,user_id' }
      )
      .select('id, user_id, display_name, message, created_at, pinned')
      .single();
    if (!error && data) {
      setSaved(myEntry.trim());
      setEntries(prev => [data, ...prev.filter(e => e.user_id !== user.id)]);
    }
    setSaving(false);
  };

  const deleteEntry = async (id) => {
    if (!isOwner || deleting) return;
    setDeleting(id);
    const { error } = await supabase.from('artist_guestbook').delete().eq('id', id);
    if (!error) setEntries(prev => prev.filter(e => e.id !== id));
    setDeleting(null);
  };

  const togglePin = async (entry) => {
    if (!isOwner || pinning) return;
    setPinning(entry.id);
    const newPinned = !entry.pinned;
    const { error } = await supabase
      .from('artist_guestbook')
      .update({ pinned: newPinned })
      .eq('id', entry.id);
    if (!error) {
      setEntries(prev => {
        const updated = prev.map(e => e.id === entry.id ? { ...e, pinned: newPinned } : e);
        return updated.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return new Date(b.created_at) - new Date(a.created_at);
        });
      });
    }
    setPinning(null);
  };

  const appendEmoji = (emoji) => setMyEntry(prev => prev + emoji);
  const getName = (e) => e.display_name || 'Listener';
  const visible = showAll ? entries : entries.slice(0, 5);

  return (
    <div className="mb-8 px-6">
      <div className="flex items-center space-x-2 mb-4">
        <MessageSquare className="w-4 h-4" style={{ color: `${textColor}40` }} />
        <h2 className="text-base font-semibold" style={{ color: textColor }}>Listener Wall</h2>
        {entries.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${accentColor}20`, color: accentColor }}>
            {entries.length}
          </span>
        )}
      </div>

      {user && (
        <div className="mb-4 space-y-2">
          {/* Emoji quick-pick */}
          <div className="flex space-x-1.5">
            {QUICK_EMOJIS.map(em => (
              <button
                key={em}
                onClick={() => appendEmoji(em)}
                className="flex-1 py-1 rounded-lg text-base transition active:scale-90"
                style={{ background: `${textColor}06` }}
              >
                {em}
              </button>
            ))}
          </div>
          {/* Input row */}
          <div className="flex space-x-2">
            <input
              value={myEntry}
              onChange={e => setMyEntry(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder={saved ? 'Update your message...' : 'Leave a message for this artist...'}
              maxLength={150}
              className="flex-1 px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none"
              style={{ background: `${textColor}08`, border: `1px solid ${textColor}12` }}
            />
            <button
              onClick={submit}
              disabled={!myEntry.trim() || saving}
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-30 transition"
              style={{ background: `${accentColor}20` }}
            >
              {saving
                ? <Loader className="w-4 h-4 animate-spin" style={{ color: accentColor }} />
                : <Send className="w-4 h-4" style={{ color: accentColor }} />}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader className="w-4 h-4 animate-spin" style={{ color: `${textColor}30` }} />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-center py-4" style={{ color: `${textColor}25` }}>
          Be the first to leave a message
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map(e => (
            <div
              key={e.id}
              className="flex items-start space-x-3 rounded-xl px-3 py-2.5 transition-all"
              style={{
                background: e.pinned ? `${accentColor}12` : 'transparent',
                border: e.pinned ? `1px solid ${accentColor}25` : '1px solid transparent',
              }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                style={{ background: `${accentColor}20`, color: accentColor }}
              >
                {getName(e)[0]?.toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-xs font-semibold" style={{ color: textColor }}>{getName(e)}</span>
                  <span className="text-[10px]" style={{ color: `${textColor}30` }}>{timeAgo(e.created_at)}</span>
                  {e.user_id === user?.id && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${accentColor}15`, color: accentColor }}>
                      You
                    </span>
                  )}
                  {e.pinned && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${accentColor}20`, color: accentColor }}>
                      ⭐ Favourite
                    </span>
                  )}
                </div>
                <p className="text-sm mt-0.5 leading-snug" style={{ color: `${textColor}70` }}>{e.message}</p>
              </div>

              {isOwner && (
                <div className="flex items-center space-x-1 flex-shrink-0 mt-0.5">
                  <button
                    onClick={() => togglePin(e)}
                    disabled={pinning === e.id}
                    title={e.pinned ? 'Unpin message' : 'Pin as favourite'}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition disabled:opacity-40"
                    style={{ background: e.pinned ? `${accentColor}25` : `${textColor}06` }}
                  >
                    {pinning === e.id
                      ? <Loader className="w-3.5 h-3.5 animate-spin" style={{ color: accentColor }} />
                      : <Star
                          className="w-3.5 h-3.5"
                          style={{ color: e.pinned ? accentColor : `${textColor}30` }}
                          fill={e.pinned ? accentColor : 'none'}
                        />}
                  </button>
                  <button
                    onClick={() => deleteEntry(e.id)}
                    disabled={deleting === e.id}
                    title="Delete message"
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition disabled:opacity-40 hover:bg-red-500/20"
                    style={{ background: `${textColor}06` }}
                  >
                    {deleting === e.id
                      ? <Loader className="w-3.5 h-3.5 animate-spin text-red-400" />
                      : <Trash2 className="w-3.5 h-3.5 text-red-400/60" />}
                  </button>
                </div>
              )}
            </div>
          ))}

          {entries.length > 5 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="text-xs font-medium"
              style={{ color: `${textColor}40` }}
            >
              {showAll ? 'Show less' : `Show all ${entries.length} messages`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}