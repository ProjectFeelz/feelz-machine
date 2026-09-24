import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageCircle, Plus, Loader, Lock, Users, Search, Zap, X, Pencil, Trash2, Trophy, Crown, Clock, Bug, ArrowLeft
} from 'lucide-react';
import TierGate from '../components/TierGate';
import { useTier } from '../contexts/useTier';

function timeAgo(date) {
  if (!date) return null;
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Accent colour presets ─────────────────────────────────────────────────────
const COLOR_SWATCHES = [
  { label: 'Purple',  value: '#7c3aed' },
  { label: 'Blue',    value: '#2563eb' },
  { label: 'Cyan',    value: '#0891b2' },
  { label: 'Green',   value: '#16a34a' },
  { label: 'Amber',   value: '#d97706' },
  { label: 'Red',     value: '#ef4444' },
  { label: 'Pink',    value: '#db2777' },
  { label: 'Default', value: null      },
];

function accentStyles(color) {
  if (!color) return {};
  return {
    borderColor: `${color}40`,
    background:  `linear-gradient(to right, ${color}15, transparent)`,
  };
}

function accentIconStyle(color) {
  if (!color) return {};
  return { background: `${color}25` };
}

function accentTextStyle(color) {
  if (!color) return {};
  return { color };
}

// ── Pinned room card ──────────────────────────────────────────────────────────
function PinnedRoomCard({ room, lastMessage, unreadCount, onNavigate }) {
  const color = room.accent_color || '#ef4444';
  return (
    <button
      onClick={() => onNavigate(room.id)}
      className="w-full flex items-center space-x-3 p-3.5 rounded-xl border transition text-left mb-5"
      style={accentStyles(color)}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={accentIconStyle(color)}
      >
        <Bug className="w-5 h-5" style={accentTextStyle(color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-bold truncate" style={accentTextStyle(color)}>
            {room.name}
          </p>
          <span
            className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: `${color}20`, color }}
          >
            Pinned
          </span>
        </div>
        {lastMessage?.content ? (
          <p className="text-[11px] truncate mt-0.5" style={{ color: `${color}80` }}>
            {lastMessage.content}
          </p>
        ) : (
          <p className="text-[11px] mt-0.5" style={{ color: `${color}60` }}>
            Share feedback or report issues
          </p>
        )}
      </div>
      <div className="flex flex-col items-end space-y-1 flex-shrink-0">
        {lastMessage && (
          <div className="flex items-center space-x-1">
            <Clock className="w-2.5 h-2.5" style={{ color: `${color}50` }} />
            <span className="text-[10px]" style={{ color: `${color}60` }}>
              {timeAgo(lastMessage.created_at)}
            </span>
          </div>
        )}
        <div className="flex items-center space-x-1">
          <Users className="w-3 h-3" style={{ color: `${color}50` }} />
          <span className="text-xs" style={{ color: `${color}60` }}>{room.member_count || 0}</span>
        </div>
        {unreadCount > 0 && (
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: color }}>
            <span className="text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

// ── Colour picker strip ───────────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-white/40 mb-2">Room Colour</label>
      <div className="flex items-center space-x-2 flex-wrap gap-y-2">
        {COLOR_SWATCHES.map(s => (
          <button
            key={s.label}
            title={s.label}
            onClick={() => onChange(s.value)}
            className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center"
            style={{
              background:   s.value || 'rgba(255,255,255,0.08)',
              borderColor:  value === s.value ? '#fff' : 'transparent',
            }}
          >
            {s.value === null && (
              <span className="text-[9px] text-white/40 font-bold">, </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChatRoomsPage() {
  const navigate = useNavigate();
  const { user, artist } = useAuth();
  const { isPro, isPremium, tierSlug } = useTier();

  const [rooms, setRooms]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [lastMessages, setLastMessages] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [myRoomIds, setMyRoomIds]       = useState([]);
  const [query, setQuery]               = useState('');
  const [error, setError]               = useState('');

  // Create room
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState('');
  const [newColor, setNewColor]     = useState(null);
  // EVERY ARTIST ROOM IS SUBSCRIBERS ONLY.
  //
  // This was a toggle that defaulted to off, so most rooms came out open to
  // anybody and an "exclusive" fan chat was exclusive only if the artist
  // happened to notice the switch. A room anyone can walk into is not a
  // reason to follow an artist, which is the entire point of having one.
  //
  // Kept as state rather than inlining `true` at the insert so there is one
  // place to change it if that decision is ever revisited.
  const [subOnly] = useState(true);
  const [creating, setCreating]     = useState(false);

  // Rename / colour room
  const [editingRoomId, setEditingRoomId]     = useState(null);
  const [editName, setEditName]               = useState('');
  const [editColor, setEditColor]             = useState(null);
  const [renaming, setRenaming]               = useState(false);
  const [deletingRoomId, setDeletingRoomId]   = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchLastMessages = async (roomIds) => {
    if (!roomIds?.length) return;
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('room_id, content, created_at')
        .in('room_id', roomIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (!data) return;
      const map = {};
      data.forEach(msg => { if (!map[msg.room_id]) map[msg.room_id] = msg; });
      setLastMessages(map);
    } catch (err) { console.error('Last messages error:', err); }
  };

  const fetchUnreadCounts = async (roomIds) => {
    if (!user || !roomIds?.length) return;
    try {
      const { data: memberships } = await supabase
        .from('chat_room_members')
        .select('room_id, last_read_at')
        .eq('user_id', user.id)
        .in('room_id', roomIds);
      if (!memberships?.length) return;
      setMyRoomIds(memberships.map(m => m.room_id));

      const counts = {};
      await Promise.all(memberships.map(async (m) => {
        if (!m.last_read_at) return;
        const { count } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', m.room_id)
          .eq('is_deleted', false)
          .gt('created_at', m.last_read_at);
        if (count > 0) counts[m.room_id] = count;
      }));
      setUnreadCounts(counts);
    } catch (err) { console.error('Unread counts error:', err); }
  };


  const fetchRooms = async () => {
    setLoading(true);
    try {
      // is_active was not filtered. A room an artist had deactivated still
      // appeared in this list and still opened, and migration 117 treats an
      // inactive room as gone, so the browse list and the Chat button could
      // disagree about whether a room exists. They agree now.
      const { data, error } = await supabase
        .from('chat_rooms')
        .select('*, artists(id, artist_name, slug, profile_image_url, is_verified)')
        .eq('is_active', true)
        .order('member_count', { ascending: false });
      if (error) console.error('[chat] room list failed:', error.code, error.message);
      const roomData = data || [];
      setRooms(roomData);
      fetchLastMessages(roomData.map(r => r.id));
      fetchUnreadCounts(roomData.map(r => r.id));
    } catch (err) {
      console.error('Fetch rooms error:', err);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !artist) return;
    setCreating(true);
    setError('');
    try {
      if (!isPro && !isPremium) {
        setError('Chat rooms require a Pro or Premium plan');
        setCreating(false);
        return;
      }
      if (tierSlug === 'pro') {
        const { count } = await supabase
          .from('chat_rooms')
          .select('*', { count: 'exact', head: true })
          .eq('artist_id', artist.id);
        if (count >= 1) {
          setError('Pro plan allows 1 chat room. Upgrade to Premium for unlimited.');
          setCreating(false);
          return;
        }
      }
      const { data: room, error: insertErr } = await supabase
        .from('chat_rooms')
        .insert({
          artist_id:           artist.id,
          name:                newName.trim(),
          is_subscribers_only: subOnly,
          max_members:         isPremium ? 500 : 100,
          member_count:        1,
          accent_color:        newColor || null,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;
      await supabase.from('chat_room_members').insert({
        room_id: room.id,
        user_id: user.id,
        role:    'admin',
      });
      setShowCreate(false);
      setNewName('');
      setNewColor(null);
      fetchRooms();
    } catch (err) {
      setError('Failed to create room: ' + err.message);
    }
    setCreating(false);
  };

  const startRename = (e, room) => {
    e.stopPropagation();
    setEditingRoomId(room.id);
    setEditName(room.name);
    setEditColor(room.accent_color || null);
  };

  const handleRename = async (room) => {
    const nameChanged  = editName.trim() && editName.trim() !== room.name;
    const colorChanged = editColor !== (room.accent_color || null);
    if (!nameChanged && !colorChanged) { setEditingRoomId(null); return; }
    setRenaming(true);
    try {
      await supabase
        .from('chat_rooms')
        .update({ name: editName.trim() || room.name, accent_color: editColor })
        .eq('id', room.id);
      fetchRooms();
    } catch (err) { console.error('Rename error:', err); }
    setRenaming(false);
    setEditingRoomId(null);
  };

  const handleDeleteRoom = async (e, roomId) => {
    e.stopPropagation();
    if (confirmDeleteId !== roomId) { setConfirmDeleteId(roomId); return; }
    setDeletingRoomId(roomId);
    try {
      await supabase.from('chat_messages').delete().eq('room_id', roomId);
      await supabase.from('chat_room_members').delete().eq('room_id', roomId);
      await supabase.from('chat_rooms').delete().eq('id', roomId);
      setRooms(prev => prev.filter(r => r.id !== roomId));
    } catch (err) { console.error('Delete room error:', err); }
    setDeletingRoomId(null);
    setConfirmDeleteId(null);
  };

  // Pinned first, then regular by member count
  // The bug-report room is reachable from the Hub by its own button and is
  // kept out of this list on purpose.
  //
  // It was pinned, so it sat at the very top of Chat Rooms, and any
  // notification that fell through to /community landed people on it by
  // accident. A room for reporting faults is not somewhere you want someone
  // arriving without meaning to; it fills up with confused messages and
  // buries the real reports.
  //
  // Matched on the name rather than an id so this survives the room being
  // recreated, and kept as one predicate so there is a single place to
  // change if it is ever renamed.
  const isBugRoom = r => /report\s*a?\s*bug/i.test(r.name || '');

  const visibleRooms = rooms.filter(r => !isBugRoom(r));
  const pinnedRooms  = visibleRooms.filter(r => r.is_pinned);
  const regularRooms = visibleRooms.filter(r => !r.is_pinned);

  const filteredRegular = query.trim()
    ? regularRooms.filter(r =>
        r.name?.toLowerCase().includes(query.toLowerCase()) ||
        r.artists?.artist_name?.toLowerCase().includes(query.toLowerCase())
      )
    : regularRooms;

  // The circles along the top: rooms this person is in, the busiest for
  // them first (unread messages, then most recent activity). Never the bug
  // room.
  const myRooms = visibleRooms
    .filter(r => myRoomIds.includes(r.id))
    .sort((a, b) =>
      (unreadCounts[b.id] || 0) - (unreadCounts[a.id] || 0)
      || new Date(lastMessages[b.id]?.created_at || 0) - new Date(lastMessages[a.id]?.created_at || 0))
    .slice(0, 20);

  const filteredPinned = query.trim()
    ? pinnedRooms.filter(r => r.name?.toLowerCase().includes(query.toLowerCase()))
    : pinnedRooms;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/20" />
      </div>
    );
  }

  return (
    <div className="pb-4 px-6 md:px-0">
      <Helmet>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <title>Chat Rooms · Feelz Machine</title>
        <meta name="description" content="Join artist chat rooms and connect with the Feelz Machine community." />
        <link rel="canonical" href="https://www.feelzmachine.com/chat" />
        <meta property="og:title" content="Chat Rooms · Feelz Machine" />
        <meta property="og:url" content="https://www.feelzmachine.com/chat" />
      </Helmet>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 sticky top-0 z-20 bg-black/95 backdrop-blur-xl md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-14 md:pt-4 pb-3 -mx-6 px-6 border-b border-white/[0.04] md:border-none">
        <div className="flex items-center space-x-3">
          {/* This page is now arrived AT, from Library's "Browse all" and
              from a competition room, rather than being somewhere you just
              were. It had no way back. History first, Library as the fallback
              for a cold link. */}
          <button
            onClick={() => { if (window.history.length > 2) navigate(-1); else navigate('/library'); }}
            aria-label="Back"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition active:scale-95">
            <ArrowLeft className="w-4 h-4 text-white/70" />
          </button>
          <h1 className="text-2xl font-bold text-white">Chat Rooms</h1>
        </div>
        {/* The ONLY control that opened the create form was a floating button
            carrying `md:hidden`, so on any screen at the md breakpoint or
            above an artist had no way at all to make a room. This is the same
            action, visible exactly where that one is not. */}
        {artist && (
          <button
            onClick={() => { setShowCreate(!showCreate); setError(''); }}
            className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white transition active:scale-95"
            style={{ backgroundColor: showCreate ? 'rgba(255,255,255,0.15)' : '#7c3aed' }}>
            {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showCreate ? 'Cancel' : 'New room'}</span>
          </button>
        )}
      </div>

      {/* Create room form */}
      {showCreate && (
        <TierGate feature="chat_rooms">
          <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 mb-4">
            <h3 className="text-sm font-semibold text-white mb-3">Create a Chat Room</h3>
            {error && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-500/10 text-xs text-red-400">{error}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/40 mb-1">Room Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. Studio Sessions, Fan Zone..."
                  maxLength={50}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none placeholder-white/20"
                />
              </div>

              {/* Colour picker */}
              <ColorPicker value={newColor} onChange={setNewColor} />

              {/* Preview */}
              {newColor && (
                <div
                  className="flex items-center space-x-2 p-2.5 rounded-lg border"
                  style={accentStyles(newColor)}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={accentIconStyle(newColor)}>
                    <MessageCircle className="w-4 h-4" style={accentTextStyle(newColor)} />
                  </div>
                  <span className="text-xs font-semibold truncate" style={accentTextStyle(newColor)}>
                    {newName || 'Room Name Preview'}
                  </span>
                </div>
              )}

              {/* Not a choice any more. See the note on subOnly above. */}
              <div className="flex items-start space-x-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <Lock className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-white">Followers only</p>
                  <p className="text-[10px] text-white/30 leading-relaxed">
                    Every room is for the people who follow you. That is what makes it
                    worth following you for.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="w-full py-2.5 bg-white text-black rounded-lg font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-40 transition"
              >
                {creating ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{creating ? 'Creating...' : 'Create Room'}</span>
              </button>
            </div>
          </div>
        </TierGate>
      )}

      {/* Search */}
      {rooms.length > 3 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search rooms..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/30 outline-none"
          />
        </div>
      )}

{/* Your chats, as circles */}
      {!query.trim() && myRooms.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2.5">Your chats</p>
          <div className="flex space-x-4 overflow-x-auto scrollbar-hide -mx-6 px-6 md:mx-0 md:px-0 pb-1">
            {myRooms.map(room => {
              const unread = unreadCounts[room.id] || 0;
              const color = room.accent_color || '#7c3aed';
              return (
                <button key={room.id} onClick={() => navigate(`/chat/${room.id}`)}
                  className="flex-shrink-0 w-16 flex flex-col items-center active:scale-95 transition">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full p-[2px]"
                      style={{ background: unread ? `linear-gradient(135deg, ${color}, #ec4899)` : 'rgba(255,255,255,0.1)' }}>
                      <div className="w-full h-full rounded-full overflow-hidden bg-black flex items-center justify-center border-2 border-black">
                        {room.artists?.profile_image_url
                          ? <img src={room.artists.profile_image_url} alt="" className="w-full h-full object-cover" />
                          : <span className="text-base font-bold" style={{ color }}>{(room.name || '?')[0].toUpperCase()}</span>}
                      </div>
                    </div>
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-[10px] font-bold text-white flex items-center justify-center border-2 border-black">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/60 mt-1.5 w-full truncate text-center">{room.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pinned rooms */}
      {filteredPinned.length > 0 && (
        <div>
          {filteredPinned.map(room => (
            <PinnedRoomCard
              key={room.id}
              room={room}
              lastMessage={lastMessages[room.id]}
              unreadCount={unreadCounts[room.id] || 0}
              onNavigate={(id) => navigate(`/chat/${id}`)}
            />
          ))}
        </div>
      )}

      {/* Regular room list */}
      {filteredRegular.length > 0 && (
        <div className="space-y-2">
          {filteredRegular.map(room => {
            const color     = room.accent_color || null;
            const isEditing = editingRoomId === room.id;
            const unread    = unreadCounts[room.id] || 0;
            return (
              <button
                key={room.id}
                onClick={() => !isEditing && navigate(`/chat/${room.id}`)}
                className="w-full flex items-center space-x-3 p-3.5 rounded-xl border transition text-left"
                style={color ? accentStyles(color) : {
                  background:  'rgba(255,255,255,0.03)',
                  borderColor: 'rgba(255,255,255,0.06)',
                }}
              >
                {/* Avatar */}
                <div
                  className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
                  style={color ? accentIconStyle(color) : { background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(37,99,235,0.2))' }}
                >
                  {room.artists?.profile_image_url
                    ? <img src={room.artists.profile_image_url} alt="" className="w-11 h-11 object-cover" />
                    : <MessageCircle className="w-5 h-5" style={color ? accentTextStyle(color) : { color: 'rgba(255,255,255,0.3)' }} />
                  }
                </div>

                {/* Room info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    {isEditing ? (
                      <div className="flex-1 space-y-2" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRename(room);
                            if (e.key === 'Escape') setEditingRoomId(null);
                            e.stopPropagation();
                          }}
                          className="bg-white/[0.08] text-white text-sm rounded px-2 py-0.5 outline-none w-full border border-white/[0.15]"
                        />
                        <ColorPicker value={editColor} onChange={setEditColor} />
                        <button
                          onClick={e => { e.stopPropagation(); handleRename(room); }}
                          className="text-xs text-purple-400 font-semibold"
                        >
                          {renaming ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    ) : (
                      <p
                        className="text-sm font-semibold truncate"
                        style={color ? accentTextStyle(color) : { color: '#fff' }}
                      >
                        {room.name}
                      </p>
                    )}
                    {room.is_subscribers_only && <Lock className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                  </div>
                  {!isEditing && (
                    <>
                      <div className="flex items-center space-x-1.5 mt-0.5">
                        <span className="text-xs text-white/40 truncate">{room.artists?.artist_name}</span>
                        {room.artists?.is_verified && (
                          <span className="text-[9px] text-blue-400">✓</span>
                        )}
                      </div>
                      {lastMessages[room.id]?.content && (
                        <p className="text-[11px] text-white/20 truncate mt-0.5 max-w-[160px]">
                          {lastMessages[room.id].content}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Right side */}
                {!isEditing && (
                  <div className="flex flex-col items-end space-y-1 flex-shrink-0">
                    {lastMessages[room.id] && (
                      <div className="flex items-center space-x-1">
                        <Clock className="w-2.5 h-2.5 text-white/20" />
                        <span className="text-[10px] text-white/25">{timeAgo(lastMessages[room.id].created_at)}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1">
                      <Users className="w-3 h-3 text-white/20" />
                      <span className="text-xs text-white/30">{room.member_count || 0}</span>
                    </div>
                    {/* Unread badge */}
                    {unread > 0 && (
                      <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-white">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      </div>
                    )}
                    {room.artist_id === artist?.id && (
                      <>
                        <button
                          onClick={e => startRename(e, room)}
                          className="p-1.5 hover:bg-white/[0.08] rounded-lg transition"
                          title="Edit room"
                        >
                          <Pencil className="w-3 h-3 text-white/30" />
                        </button>
                        <button
                          onClick={e => handleDeleteRoom(e, room.id)}
                          disabled={deletingRoomId === room.id}
                          className={`p-1.5 rounded-lg transition ${confirmDeleteId === room.id ? 'bg-red-500/20' : 'hover:bg-white/[0.08]'}`}
                          title={confirmDeleteId === room.id ? 'Click again to confirm' : 'Delete room'}
                        >
                          {deletingRoomId === room.id
                            ? <Loader className="w-3 h-3 animate-spin text-red-400" />
                            : <Trash2 className={`w-3 h-3 ${confirmDeleteId === room.id ? 'text-red-400' : 'text-white/30'}`} />
                          }
                        </button>
                      </>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {filteredRegular.length === 0 && filteredPinned.length === 0 && (
        <div className="text-center py-16">
          <MessageCircle className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-sm text-white/30 mb-1">
            {query ? 'No rooms match your search' : 'No chat rooms yet'}
          </p>
          {!query && artist  && <p className="text-xs text-white/15">Create the first one!</p>}
          {!query && !artist && <p className="text-xs text-white/15">Artist chat rooms will appear here</p>}
        </div>
      )}

      {/* Info card for listeners with no rooms */}
      {!artist && rooms.length === 0 && (
        <div className="mt-6 rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Zap className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-semibold text-white/50">Chat Rooms</h4>
          </div>
          <p className="text-[11px] text-white/25 leading-relaxed">
            Follow your favourite artists to join their chat rooms and connect with the community.
          </p>
        </div>
      )}

      {/* Create room FAB */}
      {artist && (
        <button
          onClick={() => { setShowCreate(!showCreate); setError(''); }}
          className="fixed bottom-28 right-5 z-[200] w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-purple-900/40 transition-all active:scale-95 md:hidden"
          style={{ backgroundColor: showCreate ? 'rgba(255,255,255,0.15)' : '#7c3aed' }}
        >
          {showCreate
            ? <X className="w-5 h-5 text-white" />
            : <Plus className="w-5 h-5 text-white" />}
        </button>
      )}
    </div>
  );
}