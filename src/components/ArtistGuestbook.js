/**
 * ArtistGuestbook.js
 * Listeners leave a message on an artist's profile.
 * One entry per listener per artist (upsert).
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, Send, Loader } from 'lucide-react';

function timeAgo(date) {
  const d = Math.floor((Date.now() - new Date(date)) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ArtistGuestbook({ artistId, textColor = '#ffffff', accentColor = '#a855f7' }) {
  const { user } = useAuth();
  const [entries, setEntries]   = useState([]);
  const [myEntry, setMyEntry]   = useState('');
  const [saved, setSaved]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [showAll, setShowAll]   = useState(false);

  useEffect(() => {
    if (!artistId) return;
    supabase.from('artist_guestbook')
      .select('id, user_id, message, created_at, listeners(display_name), artists(artist_name)')
      .eq('artist_id', artistId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setEntries(data || []);
        const mine = (data || []).find(e => e.user_id === user?.id);
        if (mine) setSaved(mine.message);
        setLoading(false);
      });
  }, [artistId, user?.id]);

  const submit = async () => {
    if (!myEntry.trim() || !user || saving) return;
    setSaving(true);
    const name = await getDisplayName();
    const { data, error } = await supabase.from('artist_guestbook')
      .upsert({ artist_id: artistId, user_id: user.id, message: myEntry.trim() }, { onConflict: 'artist_id,user_id' })
      .select().single();
    if (!error) {
      setSaved(myEntry.trim());
      setEntries(prev => {
        const without = prev.filter(e => e.user_id !== user.id);
        return [{ ...data, _name: name }, ...without];
      });
    }
    setSaving(false);
  };

  const getDisplayName = async () => {
    const { data: a } = await supabase.from('artists').select('artist_name').eq('user_id', user.id).maybeSingle();
    if (a) return a.artist_name;
    const { data: l } = await supabase.from('listeners').select('display_name').eq('user_id', user.id).maybeSingle();
    return l?.display_name || 'Listener';
  };

  const getName = (e) => e._name || e.artists?.artist_name || e.listeners?.display_name || 'Listener';

  const visible = showAll ? entries : entries.slice(0, 5);

  return (
    <div className="mb-8 px-6">
      <div className="flex items-center space-x-2 mb-4">
        <MessageSquare className="w-4 h-4" style={{ color: `${textColor}40` }} />
        <h2 className="text-base font-semibold" style={{ color: textColor }}>Listener Wall</h2>
        {entries.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${accentColor}20`, color: accentColor }}>{entries.length}</span>}
      </div>

      {user && (
        <div className="mb-4 flex space-x-2">
          <input
            value={myEntry}
            onChange={e => setMyEntry(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={saved ? 'Update your message...' : 'Leave a message for this artist...'}
            maxLength={150}
            className="flex-1 px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none"
            style={{ background: `${textColor}08`, border: `1px solid ${textColor}12` }}
          />
          <button onClick={submit} disabled={!myEntry.trim() || saving}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-30 transition"
            style={{ background: `${accentColor}20` }}>
            {saving ? <Loader className="w-4 h-4 animate-spin" style={{ color: accentColor }} /> : <Send className="w-4 h-4" style={{ color: accentColor }} />}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader className="w-4 h-4 animate-spin" style={{ color: `${textColor}30` }} /></div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-center py-4" style={{ color: `${textColor}25` }}>Be the first to leave a message</p>
      ) : (
        <div className="space-y-3">
          {visible.map(e => (
            <div key={e.id} className="flex items-start space-x-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                style={{ background: `${accentColor}20`, color: accentColor }}>
                {getName(e)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline space-x-2">
                  <span className="text-xs font-semibold" style={{ color: textColor }}>{getName(e)}</span>
                  <span className="text-[10px]" style={{ color: `${textColor}30` }}>{timeAgo(e.created_at)}</span>
                  {e.user_id === user?.id && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${accentColor}15`, color: accentColor }}>You</span>}
                </div>
                <p className="text-sm mt-0.5 leading-snug" style={{ color: `${textColor}70` }}>{e.message}</p>
              </div>
            </div>
          ))}
          {entries.length > 5 && (
            <button onClick={() => setShowAll(v => !v)} className="text-xs font-medium" style={{ color: `${textColor}40` }}>
              {showAll ? 'Show less' : `Show all ${entries.length} messages`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}