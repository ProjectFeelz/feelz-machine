import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  MessageCircle, Plus, Loader, Lock, Users, Search, Crown, Zap, X
} from 'lucide-react';
import TierGate from '../components/TierGate';
import { useTier } from '../contexts/useTier';

export default function ChatRoomsPage() {
  const navigate = useNavigate();
  const { user, artist } = useAuth();
  const { isPro, isPremium, tierSlug } = useTier();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [subOnly, setSubOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const { data } = await supabase
        .from('chat_rooms')
        .select('*, artists(id, artist_name, slug, profile_image_url, is_verified)')
        .order('member_count', { ascending: false });
      setRooms(data || []);
    } catch (err) {
      console.error('Fetch rooms error:', err);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (!artist) { setError('Only artists can create rooms'); return; }

    setCreating(true);
    setError('');

    try {
      if (!isPro && !isPremium) {
        setError('Chat rooms require a Pro or Premium plan');
        setCreating(false);
        return;
      }

      // Check room limit (Pro = 1, Premium = unlimited)
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
          artist_id: artist.id,
          name: newName.trim(),
          is_subscribers_only: subOnly,
          max_members: isPremium ? 500 : 100,
          member_count: 1,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Add creator as admin member
      await supabase.from('chat_room_members').insert({
        room_id: room.id,
        user_id: user.id,
        role: 'admin',
      });

      setShowCreate(false);
      setNewName('');
      setSubOnly(false);
      fetchRooms();
    } catch (err) {
      setError('Failed to create room: ' + err.message);
    }
    setCreating(false);
  };

  const filtered = query.trim()
    ? rooms.filter(r =>
        r.name?.toLowerCase().includes(query.toLowerCase()) ||
        r.artists?.artist_name?.toLowerCase().includes(query.toLowerCase())
      )
    : rooms;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/20" />
      </div>
    );
  }

  return (
    <div className="pt-12 md:pt-0 pb-4 px-6 md:px-0 md:max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Chat Rooms</h1>
        {artist && (
          <button onClick={() => setShowCreate(!showCreate)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
            {showCreate ? <X className="w-4 h-4 text-white/60" /> : <Plus className="w-4 h-4 text-white/60" />}
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
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Studio Sessions, Fan Zone..."
                maxLength={50}
                className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none placeholder-white/20"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Subscribers only</p>
                <p className="text-[10px] text-white/30">Only your followers can join</p>
              </div>
              <button onClick={() => setSubOnly(!subOnly)}
                className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                  subOnly ? 'bg-purple-500' : 'bg-white/[0.1]'
                }`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  subOnly ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </button>
            </div>
            <button onClick={handleCreate} disabled={!newName.trim() || creating}
              className="w-full py-2.5 bg-white text-black rounded-lg font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-40 transition">
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rooms..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/30 outline-none"
          />
        </div>
      )}

      {/* Room list */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map(room => (
            <button key={room.id}
              onClick={() => navigate(`/chat/${room.id}`)}
              className="w-full flex items-center space-x-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition text-left">
              {/* Artist avatar */}
              <div className="w-11 h-11 rounded-xl overflow-hidden bg-gradient-to-br from-purple-600/30 to-blue-600/20 flex items-center justify-center flex-shrink-0">
                {room.artists?.profile_image_url
                  ? <img src={room.artists.profile_image_url} alt="" className="w-11 h-11 object-cover" />
                  : <MessageCircle className="w-5 h-5 text-white/30" />}
              </div>

              {/* Room info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1.5">
                  <p className="text-sm font-semibold text-white truncate">{room.name}</p>
                  {room.is_subscribers_only && <Lock className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs text-white/40 truncate">{room.artists?.artist_name}</span>
                  {room.artists?.is_verified && (
                    <span className="text-[9px] text-blue-400">✓</span>
                  )}
                </div>
              </div>

              {/* Member count */}
              <div className="flex items-center space-x-1 flex-shrink-0">
                <Users className="w-3 h-3 text-white/20" />
                <span className="text-xs text-white/30">{room.member_count || 0}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <MessageCircle className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-sm text-white/30 mb-1">
            {query ? 'No rooms match your search' : 'No chat rooms yet'}
          </p>
          {!query && artist && (
            <p className="text-xs text-white/15">Create the first one!</p>
          )}
          {!query && !artist && (
            <p className="text-xs text-white/15">Artist chat rooms will appear here</p>
          )}
        </div>
      )}

      {/* Info card */}
      {!artist && rooms.length === 0 && (
        <div className="mt-6 rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Zap className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-semibold text-white/50">Artist Feature</h4>
          </div>
          <p className="text-[11px] text-white/25 leading-relaxed">
            Chat rooms are created by artists on Pro or Premium plans.
            Follow your favorite artists to join their rooms and connect with the community.
          </p>
        </div>
      )}
    </div>
  );
}

