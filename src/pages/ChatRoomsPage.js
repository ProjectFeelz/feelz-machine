import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageCircle, Plus, Loader, Lock, Users, Search, Zap, X, Pencil, Trash2, Trophy, Crown, Clock, Bug
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

// Derive Tailwind-safe inline styles from a hex colour
function accentStyles(color) {
  if (!color) return {};
  return {
    borderColor: `${color}40`,       // 25% opacity border
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
function PinnedRoomCard({ room, lastMessage, onNavigate }) {
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
              <span className="text-[9px] text-white/40 font-bold">—</span>
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
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [lastMessages, setLastMessages] = useState({});
  const [query, setQuery]               = useState('');
  const [error, setError]               = useState('');

  // Create room
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState('');
  const [newColor, setNewColor]     = useState(null);
  const [subOnly, setSubOnly]       = useState(false);
  const [creating, setCreating]     = useState(false);

  // Rename / colour room
  const [editingRoomId, setEditingRoomId]   = useState(null);
  const [editName, setEditName]             = useState('');
  const [editColor, setEditColor]           = useState(null);
  const [renaming, setRenaming]             = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    fetchRooms();
    fetchCompetitions();
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

  const fetchCompetitions = async () => {
    const { data } = await supabase
      .from('competitions')
      .select('id, title, status, brief, prize_description, cash_prize_amount, cash_prize_currency, entries_close_at, voting_close_at')
      .in('status', ['upcoming', 'open', 'voting', 'closed'])
      .order('created_at', { ascending: false });
    setCompetitions(data || []);
  };

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('chat_rooms')
        .select('*, artists(id, artist_name, slug, profile_image_url, is_verified)')
        .order('member_count', { ascending: false });
      const roomData = data || [];
      setRooms(roomData);
      fetchLastMessages(roomData.map(r => r.id));
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
          artist_id:            artist.id,
          name:                 newName.trim(),
          is_subscribers_only:  subOnly,
          max_members:          isPremium ? 500 : 100,
          member_count:         1,
          accent_color:         newColor || null,
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
      setSubOnly(false);
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

  // ── Sort: pinned first (but below competitions), then by member count
  const pinnedRooms  = rooms.filter(r => r.is_pinned);
  const regularRooms = rooms.filter(r => !r.is_pinned);

  const filteredRegular = query.trim()
    ? regularRooms.filter(r =>
        r.name?.toLowerCase().includes(query.toLowerCase()) ||
        r.artists?.artist_name?.toLowerCase().includes(query.toLowerCase())
      )
    : regularRooms;

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
        <title>Chat Rooms · Feelz Machine</title>
        <meta name="description" content="Join artist chat rooms and connect with the Feelz Machine community." />
        <link rel="canonical" href="https://www.feelzmachine.com/chat" />
        <meta property="og:title" content="Chat Rooms · Feelz Machine" />
        <meta property="og:url" content="https://www.feelzmachine.com/chat" />
      </Helmet>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 sticky top-0 z-20 bg-black/95 backdrop-blur-xl md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-14 md:pt-4 pb-3 -mx-6 px-6 border-b border-white/[0.04] md:border-none">
        <h1 className="text-2xl font-bold text-white">Chat Rooms</h1>
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

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white">Subscribers only</p>
                  <p className="text-[10px] text-white/30">Only your followers can join</p>
                </div>
                <button
                  onClick={() => setSubOnly(!subOnly)}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${subOnly ? 'bg-purple-500' : 'bg-white/[0.1]'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${subOnly ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
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

      {/* Competition Rooms — top priority */}
      {competitions.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2 flex items-center space-x-1.5">
            <Trophy className="w-3 h-3 text-yellow-400" />
            <span>Active Competitions</span>
          </p>
          <div className="space-y-2">
            {competitions.map(comp => {
              const isOpen   = comp.status === 'open';
              const isVoting = comp.status === 'voting';
              return (
                <button
                  key={comp.id}
                  onClick={() => navigate(`/competition/${comp.id}`)}
                  className="w-full flex items-center space-x-3 p-3.5 rounded-xl bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/20 hover:border-yellow-500/40 transition text-left"
                >
                  <div className="w-11 h-11 rounded-xl bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{comp.title}</p>
                    {comp.brief && (
                      <p className="text-xs text-white/40 truncate mt-0.5">{comp.brief}</p>
                    )}
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isOpen ? 'bg-green-500/20 text-green-400' : isVoting ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/40'}`}>
                        {isOpen ? 'Entries Open' : isVoting ? 'Voting Open' : comp.status}
                      </span>
                      {comp.prize_description && (
                        <span className="text-[10px] text-yellow-400/60 truncate">
                          🏆 {comp.prize_description}
                        </span>
                      )}
                    </div>
                  </div>
                  <Crown className="w-4 h-4 text-yellow-400/40 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pinned rooms — below competitions, above regular rooms */}
      {filteredPinned.length > 0 && (
        <div>
          {filteredPinned.map(room => (
            <PinnedRoomCard
              key={room.id}
              room={room}
              lastMessage={lastMessages[room.id]}
              onNavigate={(id) => navigate(`/chat/${id}`)}
            />
          ))}
        </div>
      )}

      {/* Regular room list */}
      {filteredRegular.length > 0 && (
        <div className="space-y-2">
          {filteredRegular.map(room => {
            const color = room.accent_color || null;
            const isEditing = editingRoomId === room.id;
            return (
              <button
                key={room.id}
                onClick={() => !isEditing && navigate(`/chat/${room.id}`)}
                className="w-full flex items-center space-x-3 p-3.5 rounded-xl border transition text-left"
                style={color ? accentStyles(color) : {
                  background:   'rgba(255,255,255,0.03)',
                  borderColor:  'rgba(255,255,255,0.06)',
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