import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Send, Loader, Users, Settings, Shield,
  AlertTriangle, Trash2, VolumeX, Volume2, Lock, Info, X
} from 'lucide-react';

// Moderation: block external links
const LINK_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|co|xyz|me|dev|app|gg)[^\s]*/gi;

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ChatRoomView() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, artist } = useAuth();

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [wordFilters, setWordFilters] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [myMembership, setMyMembership] = useState(null);
  const [joining, setJoining] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [modWarning, setModWarning] = useState('');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (roomId && user) {
      fetchRoom();
      fetchMessages();
      fetchWordFilters();
      checkMembership();
    }
  }, [roomId, user]);

  // Real-time messages
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`chat-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        // Fetch the full message with artist data
        fetchSingleMessage(payload.new.id);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        // Handle deletions
        if (payload.new.is_deleted) {
          setMessages(prev => prev.map(m =>
            m.id === payload.new.id ? { ...m, is_deleted: true, deleted_reason: payload.new.deleted_reason } : m
          ));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchRoom = async () => {
    const { data } = await supabase
      .from('chat_rooms')
      .select('*, artists(id, artist_name, slug, profile_image_url, is_verified, user_id)')
      .eq('id', roomId)
      .single();
    setRoom(data);
    setLoading(false);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*, artists:user_id(artist_name, slug, profile_image_url, is_verified)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(200);

    // Refetch with proper artist join via user_id
    // Since chat_messages has user_id, we need to match to artists
    if (data) {
      const userIds = [...new Set(data.map(m => m.user_id))];
      const { data: artistsData } = await supabase
        .from('artists')
        .select('user_id, artist_name, slug, profile_image_url, is_verified')
        .in('user_id', userIds);

      const artistMap = {};
      (artistsData || []).forEach(a => { artistMap[a.user_id] = a; });

      const enriched = data.map(m => ({
        ...m,
        artist: artistMap[m.user_id] || null,
      }));

      setMessages(enriched);
    }
  };

  const fetchSingleMessage = async (msgId) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('id', msgId)
      .single();

    if (data) {
      // Get artist info
      const { data: artistData } = await supabase
        .from('artists')
        .select('user_id, artist_name, slug, profile_image_url, is_verified')
        .eq('user_id', data.user_id)
        .single();

      const enriched = { ...data, artist: artistData || null };
      setMessages(prev => {
        if (prev.find(m => m.id === enriched.id)) return prev;
        return [...prev, enriched];
      });
    }
  };

  const fetchWordFilters = async () => {
    const { data } = await supabase
      .from('chat_word_filters')
      .select('word, is_regex, severity');
    setWordFilters(data || []);
  };

  const checkMembership = async () => {
    const { data } = await supabase
      .from('chat_room_members')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .single();

    if (data) {
      setIsMember(true);
      setMyMembership(data);
    }
  };

  const joinRoom = async () => {
    if (!user) { navigate('/login'); return; }
    setJoining(true);

    try {
      const { error } = await supabase.from('chat_room_members').insert({
        room_id: roomId,
        user_id: user.id,
        role: 'member',
      });
      if (error) throw error;

      // Increment member count
      await supabase.rpc('increment_chat_member_count', { room_id_input: roomId }).catch(() => {
        // RPC might not exist, manually update
        supabase.from('chat_rooms').update({
          member_count: (room?.member_count || 0) + 1
        }).eq('id', roomId);
      });

      setIsMember(true);
      setMyMembership({ role: 'member' });
    } catch (err) {
      console.error('Join error:', err);
    }
    setJoining(false);
  };

  // Moderation checks
  const moderateMessage = useCallback((text) => {
    // Check for external links
    if (LINK_REGEX.test(text)) {
      return 'External links are not allowed in chat rooms';
    }

    // Check word filters
    for (const filter of wordFilters) {
      if (filter.is_regex) {
        try {
          const regex = new RegExp(filter.word, 'gi');
          if (regex.test(text)) {
            return filter.severity === 'high'
              ? 'Your message contains prohibited content'
              : 'Please keep the conversation respectful';
          }
        } catch (e) { /* invalid regex, skip */ }
      } else {
        if (text.toLowerCase().includes(filter.word.toLowerCase())) {
          return filter.severity === 'high'
            ? 'Your message contains prohibited content'
            : 'Please keep the conversation respectful';
        }
      }
    }

    // Check for image/file patterns
    if (/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|pdf|zip|exe|dmg)/i.test(text)) {
      return 'File sharing is not allowed in chat rooms';
    }

    return null;
  }, [wordFilters]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    if (!isMember) return;
    if (myMembership?.is_muted) {
      setModWarning('You are muted in this room');
      setTimeout(() => setModWarning(''), 3000);
      return;
    }

    // Run moderation
    const modResult = moderateMessage(input.trim());
    if (modResult) {
      setModWarning(modResult);
      setTimeout(() => setModWarning(''), 4000);
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        room_id: roomId,
        user_id: user.id,
        content: input.trim(),
      });
      if (error) throw error;
      setInput('');
      inputRef.current?.focus();
    } catch (err) {
      console.error('Send error:', err);
    }
    setSending(false);
  };

  const handleDelete = async (msgId) => {
    try {
      await supabase.from('chat_messages').update({
        is_deleted: true,
        deleted_reason: 'Removed by moderator',
      }).eq('id', msgId);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const isRoomAdmin = room?.artists?.user_id === user?.id ||
    myMembership?.role === 'admin' || myMembership?.role === 'moderator';

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <Lock className="w-12 h-12 text-white/10 mb-4" />
        <p className="text-white/40 text-sm mb-4">Sign in to join chat rooms</p>
        <button onClick={() => navigate('/login')} className="px-6 py-2.5 bg-white text-black rounded-lg text-sm font-medium">
          Sign In
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <AlertTriangle className="w-12 h-12 text-white/10 mb-4" />
        <p className="text-white/40 text-sm">Room not found</p>
        <button onClick={() => navigate('/community')} className="mt-4 text-sm text-white/30 hover:text-white/50">
          Back to rooms
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-black/95 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <button onClick={() => room.artists?.slug && navigate(`/artist/${room.artists.slug}`)}
            className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-purple-600/30 to-blue-600/20 flex items-center justify-center">
              {room.artists?.profile_image_url
                ? <img src={room.artists.profile_image_url} alt="" className="w-9 h-9 object-cover" />
                : <span className="text-sm font-bold text-white/40">{room.artists?.artist_name?.[0]}</span>}
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <p className="text-sm font-semibold text-white">{room.name}</p>
                {room.is_subscribers_only && <Lock className="w-3 h-3 text-yellow-400" />}
              </div>
              <p className="text-[10px] text-white/30">{room.artists?.artist_name} · {room.member_count} members</p>
            </div>
          </button>
        </div>

        <button onClick={() => setShowMembers(!showMembers)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
          <Users className="w-4 h-4 text-white/50" />
        </button>
      </div>

      {/* Members sidebar */}
      {showMembers && (
        <div className="absolute right-0 top-14 w-64 bg-neutral-900 border border-white/[0.08] rounded-lg shadow-xl z-30 m-2 max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between p-3 border-b border-white/[0.06]">
            <p className="text-xs font-semibold text-white">Members ({room.member_count})</p>
            <button onClick={() => setShowMembers(false)}>
              <X className="w-4 h-4 text-white/30" />
            </button>
          </div>
          <div className="p-2">
            <p className="text-[10px] text-white/20 px-2 py-1">Member list loads on join</p>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {/* Room welcome */}
        <div className="text-center py-6 mb-4">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 overflow-hidden bg-gradient-to-br from-purple-600/20 to-blue-600/10 flex items-center justify-center">
            {room.artists?.profile_image_url
              ? <img src={room.artists.profile_image_url} alt="" className="w-14 h-14 object-cover" />
              : <span className="text-xl font-bold text-white/30">{room.artists?.artist_name?.[0]}</span>}
          </div>
          <h3 className="text-base font-bold text-white mb-1">{room.name}</h3>
          <p className="text-xs text-white/30">Created by {room.artists?.artist_name}</p>
          <div className="flex items-center justify-center space-x-3 mt-2">
            <span className="inline-flex items-center space-x-1 text-[10px] text-white/20">
              <Shield className="w-3 h-3" />
              <span>No links</span>
            </span>
            <span className="inline-flex items-center space-x-1 text-[10px] text-white/20">
              <Shield className="w-3 h-3" />
              <span>No images</span>
            </span>
            <span className="inline-flex items-center space-x-1 text-[10px] text-white/20">
              <Shield className="w-3 h-3" />
              <span>Moderated</span>
            </span>
          </div>
        </div>

        {messages.map((msg, i) => {
          const prevMsg = messages[i - 1];
          const sameSender = prevMsg && prevMsg.user_id === msg.user_id &&
            (new Date(msg.created_at) - new Date(prevMsg.created_at)) < 120000;
          const isMe = msg.user_id === user.id;
          const isRoomOwner = msg.user_id === room.artists?.user_id;

          if (msg.is_deleted) {
            return (
              <div key={msg.id} className="px-3 py-1.5">
                <p className="text-xs text-white/15 italic">
                  Message removed{msg.deleted_reason ? `: ${msg.deleted_reason}` : ''}
                </p>
              </div>
            );
          }

          return (
            <div key={msg.id} className={`group flex items-start space-x-2.5 px-2 py-1 rounded-lg hover:bg-white/[0.02] transition ${sameSender ? 'mt-0' : 'mt-2'}`}>
              {/* Avatar (only show if different sender) */}
              {!sameSender ? (
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-purple-600/30 to-blue-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {msg.artist?.profile_image_url
                    ? <img src={msg.artist.profile_image_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    : <span className="text-xs font-bold text-white/40">{(msg.artist?.artist_name || '?')[0]}</span>}
                </div>
              ) : (
                <div className="w-8 flex-shrink-0" />
              )}

              {/* Message body */}
              <div className="flex-1 min-w-0">
                {!sameSender && (
                  <div className="flex items-center space-x-1.5 mb-0.5">
                    <span className={`text-xs font-semibold ${isRoomOwner ? 'text-purple-400' : 'text-white'}`}>
                      {msg.artist?.artist_name || 'User'}
                    </span>
                    {isRoomOwner && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded font-medium">HOST</span>
                    )}
                    {msg.artist?.is_verified && (
                      <span className="text-[9px] text-blue-400">✓</span>
                    )}
                    <span className="text-[10px] text-white/15">{timeAgo(msg.created_at)}</span>
                  </div>
                )}
                <p className="text-sm text-white/80 break-words leading-relaxed">{msg.content}</p>
              </div>

              {/* Admin actions */}
              {isRoomAdmin && !isMe && (
                <button onClick={() => handleDelete(msg.id)}
                  className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-500/10 transition flex-shrink-0">
                  <Trash2 className="w-3 h-3 text-red-400/50" />
                </button>
              )}
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Moderation warning */}
      {modWarning && (
        <div className="mx-4 mb-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-400">{modWarning}</p>
        </div>
      )}

      {/* Input area */}
      {isMember ? (
        <div className="px-4 py-3 border-t border-white/[0.06] bg-black/95 backdrop-blur-xl flex-shrink-0">
          {myMembership?.is_muted ? (
            <div className="flex items-center justify-center space-x-2 py-2">
              <VolumeX className="w-4 h-4 text-white/20" />
              <p className="text-xs text-white/20">You are muted in this room</p>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Type a message..."
                maxLength={500}
                className="flex-1 bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none"
              />
              <button onClick={handleSend} disabled={!input.trim() || sending}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-purple-600 disabled:opacity-30 transition active:scale-95">
                {sending
                  ? <Loader className="w-4 h-4 animate-spin text-white" />
                  : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-white/[0.06] flex-shrink-0">
          <button onClick={joinRoom} disabled={joining}
            className="w-full py-3 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-50 transition">
            {joining ? <Loader className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            <span>{joining ? 'Joining...' : 'Join Room to Chat'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
