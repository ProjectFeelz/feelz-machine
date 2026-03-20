import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Send, Loader, Users, Shield,
  AlertTriangle, Trash2, VolumeX, Lock, X, CornerDownRight, BarChart2, Plus, Check, Pin
} from 'lucide-react';

const hasExternalLink = (text) =>
  /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|co|xyz|me|dev|app|gg)[^\s]*/i.test(text);

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeLeft(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function PollCard({ poll, userId, onVote }) {
  const expired = new Date(poll.expires_at) < new Date();
  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);
  const myVote = poll.my_vote;
  const showResults = !!myVote || expired;

  return (
    <div className="mx-2 my-2 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      <div className="flex items-center space-x-1.5 mb-2">
        <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wide">Poll</span>
        <span className="text-[10px] text-white/20 ml-auto">{timeLeft(poll.expires_at)}</span>
      </div>
      <p className="text-sm font-medium text-white mb-3">{poll.question}</p>
      <div className="space-y-2">
        {poll.options.map(opt => {
          const pct = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
          const isMyChoice = myVote === opt.id;
          return (
            <button key={opt.id} disabled={!!myVote || expired}
              onClick={() => !myVote && !expired && onVote(poll.id, opt.id)}
              className="w-full text-left relative overflow-hidden rounded-lg transition">
              <div className="relative z-10 flex items-center justify-between px-3 py-2">
                <div className="flex items-center space-x-2">
                  {isMyChoice && <Check className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                  <span className={`text-sm ${isMyChoice ? 'text-purple-300 font-medium' : 'text-white/70'}`}>{opt.text}</span>
                </div>
                {showResults && <span className="text-xs text-white/40 flex-shrink-0">{pct}%</span>}
              </div>
              {showResults && (
                <div className="absolute inset-0 rounded-lg transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: isMyChoice ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)' }} />
              )}
              {!showResults && <div className="absolute inset-0 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] transition" />}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-white/20 mt-2">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
    </div>
  );
}

function CreatePollModal({ roomId, artistId, onClose, onCreated }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [duration, setDuration] = useState(24);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const addOption = () => { if (options.length < 6) setOptions(prev => [...prev, '']); };
  const removeOption = (i) => { if (options.length > 2) setOptions(prev => prev.filter((_, idx) => idx !== i)); };
  const updateOption = (i, val) => setOptions(prev => prev.map((o, idx) => idx === i ? val : o));

  const handleCreate = async () => {
    if (!question.trim()) { setError('Question is required'); return; }
    const validOptions = options.filter(o => o.trim());
    if (validOptions.length < 2) { setError('At least 2 options required'); return; }
    setCreating(true);
    try {
      const expiresAt = new Date(Date.now() + duration * 3600000).toISOString();
      const formattedOptions = validOptions.map((text, i) => ({
        id: String.fromCharCode(97 + i), text: text.trim(), votes: 0,
      }));
      const { error: err } = await supabase.from('chat_polls').insert({
        room_id: roomId, artist_id: artistId,
        question: question.trim(), options: formattedOptions, expires_at: expiresAt,
      });
      if (err) throw err;
      onCreated(); onClose();
    } catch (err) { setError(err.message); }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg bg-neutral-900 rounded-t-2xl p-5 border-t border-white/[0.08]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Create Poll</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-white/30" /></button>
        </div>
        <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
          placeholder="Ask your fans something..." maxLength={200}
          className="w-full bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none mb-3" />
        <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wide">Options</p>
        <div className="space-y-2 mb-3">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center space-x-2">
              <input type="text" value={opt} onChange={e => updateOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`} maxLength={100}
                className="flex-1 bg-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none" />
              {options.length > 2 && (
                <button onClick={() => removeOption(i)} className="text-white/20 hover:text-red-400 transition">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {options.length < 6 && (
            <button onClick={addOption} className="flex items-center space-x-1.5 text-xs text-white/30 hover:text-white/50 transition">
              <Plus className="w-3.5 h-3.5" /><span>Add option</span>
            </button>
          )}
        </div>
        <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wide">Duration</p>
        <div className="flex space-x-2 mb-4">
          {[1, 6, 12, 24, 48, 72].map(h => (
            <button key={h} onClick={() => setDuration(h)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${duration === h ? 'bg-purple-600 text-white' : 'bg-white/[0.06] text-white/40'}`}>
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <button onClick={handleCreate} disabled={creating}
          className="w-full py-3 bg-purple-600 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition flex items-center justify-center space-x-2">
          {creating ? <Loader className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
          <span>{creating ? 'Creating...' : 'Create Poll'}</span>
        </button>
      </div>
    </div>
  );
}

export default function ChatRoomView() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, artist, isAdmin } = useAuth();

  const [room, setRoom] = useState(null);  const [spendGate, setSpendGate] = useState(false); // true when user hasn't spent $5 on this artist
  const [messages, setMessages] = useState([]);
  const [polls, setPolls] = useState([]);
  const [wordFilters, setWordFilters] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [myMembership, setMyMembership] = useState(null);
  const [joining, setJoining] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [modWarning, setModWarning] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [showPollModal, setShowPollModal] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const isRoomArtist = room?.artists?.user_id === user?.id;

  useEffect(() => {
    if (roomId && user) {
      fetchRoom(); fetchMessages(); fetchPolls(); fetchWordFilters(); checkMembership();
    }
  }, [roomId, user]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`chat-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => { fetchSingleMessage(payload.new.id); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.new.is_deleted) {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, is_deleted: true, deleted_reason: payload.new.deleted_reason } : m));
          }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_polls', filter: `room_id=eq.${roomId}` },
        () => { fetchPolls(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, polls]);

  const fetchRoom = async () => {
    const { data } = await supabase.from('chat_rooms')
      .select('*, artists(id, artist_name, slug, profile_image_url, is_verified, user_id)')
      .eq('id', roomId).maybeSingle();
    setRoom(data); setLoading(false);
  };

  const fetchPolls = async () => {
    const { data: pollsData } = await supabase.from('chat_polls').select('*')
      .eq('room_id', roomId).order('created_at', { ascending: true });
    if (!pollsData || pollsData.length === 0) { setPolls([]); return; }

    const pollIds = pollsData.map(p => p.id);
    const [{ data: myVotes }, { data: allVotes }] = await Promise.all([
      supabase.from('chat_poll_votes').select('poll_id, option_id').eq('user_id', user.id).in('poll_id', pollIds),
      supabase.from('chat_poll_votes').select('poll_id, option_id').in('poll_id', pollIds),
    ]);

    const myVoteMap = {};
    (myVotes || []).forEach(v => { myVoteMap[v.poll_id] = v.option_id; });
    const voteCounts = {};
    (allVotes || []).forEach(v => {
      if (!voteCounts[v.poll_id]) voteCounts[v.poll_id] = {};
      voteCounts[v.poll_id][v.option_id] = (voteCounts[v.poll_id][v.option_id] || 0) + 1;
    });

    setPolls(pollsData.map(poll => ({
      ...poll,
      my_vote: myVoteMap[poll.id] || null,
      options: poll.options.map(opt => ({ ...opt, votes: voteCounts[poll.id]?.[opt.id] || 0 })),
    })));
  };

  const handleVote = async (pollId, optionId) => {
    try {
      await supabase.from('chat_poll_votes').insert({ poll_id: pollId, user_id: user.id, option_id: optionId });
      fetchPolls();
    } catch (err) { console.error('Vote error:', err); }
  };

  const fetchMessages = async () => {
    const { data, error } = await supabase.from('chat_messages')
      .select('id, room_id, user_id, content, created_at, is_deleted, deleted_reason, is_pinned')
      .eq('room_id', roomId).order('is_pinned', { ascending: false }).order('created_at', { ascending: true }).limit(200);
    if (error) { console.error('fetchMessages error:', error); return; }
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(m => m.user_id))];
      const { data: artistsData } = await supabase.from('artists')
        .select('user_id, artist_name, slug, profile_image_url, is_verified').in('user_id', userIds);
      const artistMap = {};
      (artistsData || []).forEach(a => { artistMap[a.user_id] = a; });
      const missingIds = userIds.filter(id => !artistMap[id]);
      const profileMap = {};
      if (missingIds.length > 0) {
        const { data: profilesData } = await supabase.from('user_profiles')
          .select('user_id, name, email, avatar_url').in('user_id', missingIds);
        (profilesData || []).forEach(p => { profileMap[p.user_id] = p; });
      }
      setMessages(data.map(m => {
        if (artistMap[m.user_id]) return { ...m, artist: artistMap[m.user_id] };
        const profile = profileMap[m.user_id];
        if (profile) return { ...m, artist: { artist_name: profile.name || 'Listener', profile_image_url: profile.avatar_url || null, slug: null, is_verified: false } };
        return { ...m, artist: null };
      }));
    } else { setMessages([]); }
  };

  const fetchSingleMessage = async (msgId) => {
    const { data } = await supabase.from('chat_messages')
      .select('id, room_id, user_id, content, created_at, is_deleted, deleted_reason')
      .eq('id', msgId).single();
    if (data) {
      const { data: artistData } = await supabase.from('artists')
        .select('user_id, artist_name, slug, profile_image_url, is_verified')
        .eq('user_id', data.user_id).maybeSingle();
      let resolvedArtist = artistData || null;
      if (!resolvedArtist) {
        const { data: profileData } = await supabase.from('user_profiles')
          .select('user_id, name, avatar_url').eq('user_id', data.user_id).maybeSingle();
        if (profileData) resolvedArtist = { artist_name: profileData.name || 'Listener', profile_image_url: profileData.avatar_url || null, slug: null, is_verified: false };
      }
      const enriched = { ...data, artist: resolvedArtist };
      setMessages(prev => { if (prev.find(m => m.id === enriched.id)) return prev; return [...prev, enriched]; });
    }
  };

  const fetchWordFilters = async () => {
    const { data } = await supabase.from('chat_word_filters').select('word, is_regex, severity');
    setWordFilters(data || []);
  };

  const checkMembership = async () => {
    const { data } = await supabase.from('chat_room_members').select('*')
      .eq('room_id', roomId).eq('user_id', user.id).maybeSingle();
    if (data) { setIsMember(true); setMyMembership(data); } else { setIsMember(false); setMyMembership(null); }
  };

    const joinRoom = async () => {
          if (!user) { navigate('/login'); return; }
              setJoining(true);
                  try {
                        // Subscriber-only rooms require $5 minimum spend on this artist
                              if (room?.is_subscribers_only) {
                                      const artistId = room?.artists?.id;
                                              if (artistId) {
                                                        // Get all track IDs by this artist first
                                                                  const { data: artistTracks } = await supabase
                                                                              .from('tracks')
                                                                                          .select('id')
                                                                                                      .eq('artist_id', artistId);
                                                                                                                const trackIds = (artistTracks || []).map(t => t.id);
                                                                                                                          let totalSpent = 0;
                                                                                                                                    if (trackIds.length > 0) {
                                                                                                                                                const { data: spendData } = await supabase
                                                                                                                                                              .from('downloads')
                                                                                                                                                                            .select('amount_paid')
                                                                                                                                                                                          .eq('user_id', user.id)
                                                                                                                                                                                                        .in('track_id', trackIds);
                                                                                                                                                                                                                    totalSpent = (spendData || []).reduce((sum, d) => sum + (d.amount_paid || 0), 0);
                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                        if (totalSpent < 5) {
                                                                                                                                                                                                                                                    setSpendGate(true);
                                                                                                                                                                                                                                                                setJoining(false);
                                                                                                                                                                                                                                                                            return;
                                                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                                                                                          const { data: existing } = await supabase.from('chat_room_members').select('id')
                                                                                                                                                                                                                                                                                                                  .eq('room_id', roomId).eq('user_id', user.id).maybeSingle();
                                                                                                                                                                                                                                                                                                                        if (existing) { setIsMember(true); setMyMembership({ role: 'member' }); setJoining(false); return; }
                                                                                                                                                                                                                                                                                                                              const { error } = await supabase.from('chat_room_members').insert({ room_id: roomId, user_id: user.id, role: 'member' });
                                                                                                                                                                                                                                                                                                                                    if (error) throw error;
                                                                                                                                                                                                                                                                                                                                          try { await supabase.rpc('increment_chat_member_count', { room_id_input: roomId }); }
                                                                                                                                                                                                                                                                                                                                                catch { await supabase.from('chat_rooms').update({ member_count: (room?.member_count || 0) + 1 }).eq('id', roomId); }
                                                                                                                                                                                                                                                                                                                                                
    }};

  const moderateMessage = useCallback((text) => {
    if (hasExternalLink(text)) return 'External links are not allowed in chat rooms';
    for (const filter of wordFilters) {
      if (filter.is_regex) {
        try { if (new RegExp(filter.word, 'gi').test(text)) return filter.severity === 'high' ? 'Your message contains prohibited content' : 'Please keep the conversation respectful'; } catch {}
      } else {
        if (text.toLowerCase().includes(filter.word.toLowerCase())) return filter.severity === 'high' ? 'Your message contains prohibited content' : 'Please keep the conversation respectful';
      }
    }
    if (/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|pdf|zip|exe|dmg)/i.test(text)) return 'File sharing is not allowed in chat rooms';
    return null;
  }, [wordFilters]);

  const handleSend = async () => {
    if (!input.trim() || sending || !isMember) return;
    if (myMembership?.is_muted) { setModWarning('You are muted in this room'); setTimeout(() => setModWarning(''), 3000); return; }
    const modResult = moderateMessage(input.trim());
    if (modResult) { setModWarning(modResult); setTimeout(() => setModWarning(''), 4000); return; }
    setSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        room_id: roomId, user_id: user.id,
        content: replyingTo ? `@${replyingTo.artist_name} ${input.trim()}` : input.trim(),
      });
      if (error) throw error;
      setInput(''); setReplyingTo(null); inputRef.current?.focus();
    } catch (err) { console.error('Send error:', err); }
    setSending(false);
  };

  const handlePin = async (msgId, currentlyPinned) => {
    try {
      await supabase.from('chat_messages').update({ is_pinned: false }).eq('room_id', roomId);
      if (!currentlyPinned) {
        await supabase.from('chat_messages').update({ is_pinned: true }).eq('id', msgId);
      }
      fetchMessages();
    } catch (err) { console.error('Pin error:', err); }
  };

  const handleDelete = async (msgId) => {
    try { await supabase.from('chat_messages').update({ is_deleted: true, deleted_reason: 'Removed by moderator' }).eq('id', msgId); }
    catch (err) { console.error('Delete error:', err); }
  };

  const isRoomAdmin = room?.artists?.user_id === user?.id || myMembership?.role === 'admin' || myMembership?.role === 'moderator';

  const timeline = [
    ...messages.map(m => ({ ...m, _type: 'message' })),
    ...polls.map(p => ({ ...p, _type: 'poll' })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (!user) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <Lock className="w-12 h-12 text-white/10 mb-4" />
      <p className="text-white/40 text-sm mb-4">Sign in to join chat rooms</p>
      <button onClick={() => navigate('/login')} className="px-6 py-2.5 bg-white text-black rounded-lg text-sm font-medium">Sign In</button>
    </div>
  );

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>;

  if (!room) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
      <AlertTriangle className="w-12 h-12 text-white/10 mb-4" />
      <p className="text-white/40 text-sm">Room not found</p>
      <button onClick={() => navigate('/community')} className="mt-4 text-sm text-white/30 hover:text-white/50">Back to rooms</button>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-black/95 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate('/chat')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <button onClick={() => room.artists?.slug && navigate(`/artist/${room.artists.slug}`)} className="flex items-center space-x-2.5">
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
        <div className="flex items-center space-x-2">
          <button onClick={fetchMessages} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
          <button onClick={() => setShowMembers(!showMembers)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
            <Users className="w-4 h-4 text-white/50" />
          </button>
        </div>
      </div>

      {showMembers && (
        <div className="absolute right-0 top-14 w-64 bg-neutral-900 border border-white/[0.08] rounded-lg shadow-xl z-30 m-2 max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between p-3 border-b border-white/[0.06]">
            <p className="text-xs font-semibold text-white">Members ({room.member_count})</p>
            <button onClick={() => setShowMembers(false)}><X className="w-4 h-4 text-white/30" /></button>
          </div>
          <div className="p-2"><p className="text-[10px] text-white/20 px-2 py-1">Member list loads on join</p></div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        <div className="flex items-center space-x-2 px-2 py-2 mb-2 border-b border-white/[0.04]">
          <div className="w-7 h-7 rounded-lg overflow-hidden bg-gradient-to-br from-purple-600/20 to-blue-600/10 flex items-center justify-center flex-shrink-0">
            {room.artists?.profile_image_url
              ? <img src={room.artists.profile_image_url} alt="" className="w-7 h-7 object-cover" />
              : <span className="text-xs font-bold text-white/30">{room.artists?.artist_name?.[0]}</span>}
          </div>
          <p className="text-xs text-white/30 flex-1">{room.name} · Created by {room.artists?.artist_name}</p>
          <Shield className="w-3 h-3 text-white/15" />
          <span className="text-[10px] text-white/15">Moderated</span>
        </div>

        {timeline.map((item, i) => {
          if (item._type === 'poll') {
            return <PollCard key={`poll-${item.id}`} poll={item} userId={user.id} onVote={handleVote} />;
          }
          const msg = item;
          const prevItem = timeline[i - 1];
          const sameSender = prevItem && prevItem._type === 'message' && prevItem.user_id === msg.user_id &&
            (new Date(msg.created_at) - new Date(prevItem.created_at)) < 120000;
          const isMe = msg.user_id === user.id;
          const isRoomOwner = msg.user_id === room.artists?.user_id;
          const canDelete = isMe || isRoomAdmin;

          if (msg.is_deleted) return (
            <div key={msg.id} className="px-3 py-1.5">
              <p className="text-xs text-white/15 italic">Message removed{msg.deleted_reason ? `: ${msg.deleted_reason}` : ''}</p>
            </div>
          );

          return (
            <div key={msg.id} className={`group flex items-start space-x-2.5 px-2 py-1 rounded-lg hover:bg-white/[0.02] transition ${sameSender ? 'mt-0' : 'mt-2'} ${msg.is_pinned ? 'bg-purple-500/[0.05] border-l-2 border-purple-500/40' : ''}`}>
              {!sameSender ? (
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-purple-600/30 to-blue-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {msg.artist?.profile_image_url
                    ? <img src={msg.artist.profile_image_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    : <span className="text-xs font-bold text-white/40">{(msg.artist?.artist_name || '?')[0]}</span>}
                </div>
              ) : <div className="w-8 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                {!sameSender && (
                  <div className="flex items-center space-x-1.5 mb-0.5">
                    <span className={`text-xs font-semibold ${isRoomOwner ? 'text-purple-400' : 'text-white'}`}>{msg.artist?.artist_name || 'User'}</span>
                    {isRoomOwner && <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded font-medium">HOST</span>}
                    {msg.artist?.is_verified && <span className="text-[9px] text-blue-400">✓</span>}
                    {msg.is_pinned && <span className="flex items-center space-x-0.5 text-[9px] text-purple-400 font-medium"><Pin className="w-2.5 h-2.5" /><span>Pinned</span></span>}
                    <span className="text-[10px] text-white/15">{timeAgo(msg.created_at)}</span>
                  </div>
                )}
                <p className="text-sm text-white/80 break-words leading-relaxed">{msg.content}</p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 flex-shrink-0 transition">
                {isMember && !isMe && (
                  <button onClick={() => { setReplyingTo({ id: msg.id, artist_name: msg.artist?.artist_name || 'User' }); setInput(`@${msg.artist?.artist_name || 'User'} `); inputRef.current?.focus(); }}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition">
                    <CornerDownRight className="w-3 h-3 text-white/30" />
                  </button>
                )}
                {(isRoomAdmin || isAdmin) && (
                  <button onClick={() => handlePin(msg.id, msg.is_pinned)}
                    className={`w-7 h-7 flex items-center justify-center rounded-full hover:bg-purple-500/10 transition ${msg.is_pinned ? 'text-purple-400' : 'text-white/30'}`}>
                    <Pin className="w-3 h-3" />
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => handleDelete(msg.id)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-500/10 transition">
                    <Trash2 className="w-3 h-3 text-red-400/50" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {modWarning && (
        <div className="mx-4 mb-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-400">{modWarning}</p>
        </div>
      )}

      {isMember ? (
        <div className="px-4 py-3 border-t border-white/[0.06] bg-black/95 backdrop-blur-xl flex-shrink-0">
          {myMembership?.is_muted ? (
            <div className="flex items-center justify-center space-x-2 py-2">
              <VolumeX className="w-4 h-4 text-white/20" />
              <p className="text-xs text-white/20">You are muted in this room</p>
            </div>
          ) : (
            <>
              {replyingTo && (
                <div className="flex items-center justify-between mb-2 px-3 py-1.5 bg-purple-500/10 rounded-lg">
                  <span className="text-[11px] text-purple-400">Replying to @{replyingTo.artist_name}</span>
                  <button onClick={() => { setReplyingTo(null); setInput(''); }} className="text-white/30 hover:text-white/60 text-sm leading-none">×</button>
                </div>
              )}
              <div className="flex items-center space-x-2">
                {isRoomArtist && (
                  <button onClick={() => setShowPollModal(true)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.06] hover:bg-purple-600/20 transition flex-shrink-0">
                    <BarChart2 className="w-4 h-4 text-white/40" />
                  </button>
                )}
                <input ref={inputRef} type="text" value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={replyingTo ? `Reply to @${replyingTo.artist_name}...` : 'Type a message...'}
                  maxLength={500}
                  className="flex-1 bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none" />
                <button onClick={handleSend} disabled={!input.trim() || sending}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-purple-600 disabled:opacity-30 transition active:scale-95">
                  {sending ? <Loader className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
                  spendGate ? (
                              <div className="px-4 py-4 border-t border-white/[0.06] flex-shrink-0">
                                            <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-center">
                                                            <Lock className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                                                                            <p className="text-sm font-semibold text-white mb-1">Supporter Access Required</p>
                                                                                            <p className="text-xs text-white/40 mb-3">
                                                                                                              This is a subscriber-only room. Purchase at least <span className="text-white font-semibold">$5</span> of music
                                                                                                                                from <span className="text-white">{room?.artists?.artist_name}</span> to join — a single, multiple singles, or an album all count.
                                                                                                                                                </p>
                                                                                                                                                                <button
                                                                                                                                                                                  onClick={() => navigate(`/artist/${room?.artists?.slug}`)}
                                                                                                                                                                                                    className="w-full py-2.5 bg-yellow-500 text-black rounded-xl font-semibold text-sm transition active:scale-95"
                                                                                                                                                                                                                    >
                                                                                                                                                                                                                                      Browse {room?.artists?.artist_name}&apos;s Music
                                                                                                                                                                                                                                                      </button>
                                                                                                                                                                                                                                                                    </div>
                                                                                                                                                                                                                                                                                </div>
                                                                                                                                                                                                                                                                                          ) : (
                                                                                                                                                                                                                                                                                                      <div className="px-4 py-3 border-t border-white/[0.06] flex-shrink-0">
                                                                                                                                                                                                                                                                                                                    <button onClick={joinRoom} disabled={joining}
                                                                                                                                                                                                                                                                                                                                    className="w-full py-3 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-50 transition">
                                                                                                                                                                                                                                                                                                                                                    {joining ? <Loader className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                                                                                                                                                                                                                                                                                                                                                    <span>{joining ? 'Joining...' : 'Join Room to Chat'}</span>
                                                                                                                                                                                                                                                                                                                                                                                  </button>
                                                                                                                                                                                                                                                                                                                                                                                              </div>
                                                                                                                                                                                                                                                                                                                                                                                                        )
                                                                                                                                                                                                                                                                                                                                                                                                                )}
                                                                                                                                                                                                                                                                                                                                                                                                                
      )
      {showPollModal && (
        <CreatePollModal roomId={roomId} artistId={artist?.id}
          onClose={() => setShowPollModal(false)} onCreated={fetchPolls} />
      )}
    </div>
  );
}
