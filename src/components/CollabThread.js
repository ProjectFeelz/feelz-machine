import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useHaptics } from '../hooks/useHaptics';
import {
  Send, Loader, Check, X, Radio,
  Mic2, Headphones, PenLine, Shuffle, Blend, MoreHorizontal,
  ChevronRight, Verified,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TYPE_LABELS = {
  featured:  { label: 'Featured',   icon: Mic2 },
  beat:      { label: 'Beat',       icon: Headphones },
  'co-write':{ label: 'Co-write',   icon: PenLine },
  remix:     { label: 'Remix',      icon: Shuffle },
  mix:       { label: 'Mix/Master', icon: Blend },
  other:     { label: 'Other',      icon: MoreHorizontal },
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)   return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Single collab request card (incoming or outgoing) ────────────────────────
function RequestCard({ request, myArtistId, onRespond, onClick, isSelected }) {
  const isMine     = request.from_artist_id === myArtistId;
  const other      = isMine ? request.to_artist   : request.from_artist;
  const TypeIcon   = TYPE_LABELS[request.collab_type]?.icon || MoreHorizontal;
  const typeLabel  = TYPE_LABELS[request.collab_type]?.label || 'Collab';
  const { tap }    = useHaptics();

  const statusColor = {
    pending:  'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    accepted: 'text-green-400 bg-green-400/10 border-green-400/20',
    declined: 'text-white/20 bg-white/[0.03] border-white/[0.05]',
  }[request.status] || '';

  return (
    <div
      onClick={() => { tap(); onClick(request); }}
      className={`rounded-2xl border cursor-pointer transition-all ${
        isSelected
          ? 'border-purple-500/40 bg-purple-500/[0.06]'
          : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05]'
      }`}
    >
      <div className="flex items-center space-x-3 p-3.5">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0">
          {other?.profile_image_url
            ? <img src={other.profile_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-blue-600/20">
                <span className="text-sm font-bold text-white/40">{other?.artist_name?.[0]}</span>
              </div>}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-1.5 mb-0.5">
            <p className="text-sm font-semibold text-white truncate">{other?.artist_name}</p>
            {other?.is_verified && <Verified className="w-3 h-3 text-blue-400 flex-shrink-0" />}
          </div>
          <div className="flex items-center space-x-1.5">
            <TypeIcon className="w-3 h-3 text-white/30 flex-shrink-0" />
            <span className="text-[11px] text-white/40">{typeLabel}</span>
            <span className="text-[11px] text-white/20">·</span>
            <span className="text-[11px] text-white/20">{timeAgo(request.created_at)}</span>
          </div>
        </div>

        <div className="flex flex-col items-end space-y-1.5 flex-shrink-0">
          <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusColor}`}>
            {isMine ? (request.status === 'pending' ? 'Sent' : request.status) : request.status}
          </span>
          {request.status === 'accepted' && (
            <ChevronRight className="w-3.5 h-3.5 text-white/20" />
          )}
        </div>
      </div>

      {/* Pitch snippet */}
      {request.message && (
        <p className="px-3.5 pb-3 text-xs text-white/30 truncate">"{request.message}"</p>
      )}

      {/* Respond buttons — only show on incoming pending */}
      {!isMine && request.status === 'pending' && (
        <div className="flex space-x-2 px-3.5 pb-3.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onRespond(request.id, 'accepted')}
            className="flex-1 py-2 rounded-xl bg-green-500/15 text-green-400 border border-green-500/20 text-xs font-semibold flex items-center justify-center space-x-1.5 transition active:scale-95">
            <Check className="w-3.5 h-3.5" /><span>Accept</span>
          </button>
          <button
            onClick={() => onRespond(request.id, 'declined')}
            className="flex-1 py-2 rounded-xl bg-white/[0.04] text-white/30 border border-white/[0.06] text-xs font-semibold flex items-center justify-center space-x-1.5 transition active:scale-95">
            <X className="w-3.5 h-3.5" /><span>Decline</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Message thread for an accepted request ───────────────────────────────────
function MessageThread({ request, myArtistId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const endRef                  = useRef(null);
  const { tap }                 = useHaptics();
  const navigate                = useNavigate();

  const isMine = request.from_artist_id === myArtistId;
  const other  = isMine ? request.to_artist : request.from_artist;
  const TypeIcon = TYPE_LABELS[request.collab_type]?.icon || MoreHorizontal;

  useEffect(() => {
    fetchMessages();
    // Realtime subscription
    const channel = supabase.channel(`collab-${request.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'collab_messages',
        filter: `request_id=eq.${request.id}`,
      }, (payload) => {
        fetchSingleMessage(payload.new.id);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [request.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('collab_messages')
      .select('*, sender:artists(id, artist_name, profile_image_url)')
      .eq('request_id', request.id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const fetchSingleMessage = async (id) => {
    const { data } = await supabase
      .from('collab_messages')
      .select('*, sender:artists(id, artist_name, profile_image_url)')
      .eq('id', id).single();
    if (data) setMessages(prev => prev.find(m => m.id === id) ? prev : [...prev, data]);
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await supabase.from('collab_messages').insert({
        request_id: request.id,
        sender_id:  myArtistId,
        content:    input.trim(),
      });
      setInput('');
    } catch (err) { console.error(err); }
    setSending(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="flex items-center space-x-3 p-4 border-b border-white/[0.06] flex-shrink-0">
        <button
          onClick={() => { tap(); navigate(`/artist/${other?.slug}`); }}
          className="w-10 h-10 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0"
        >
          {other?.profile_image_url
            ? <img src={other.profile_image_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center">
                <span className="text-sm font-bold text-white/40">{other?.artist_name?.[0]}</span>
              </div>}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{other?.artist_name}</p>
          <div className="flex items-center space-x-1">
            <TypeIcon className="w-3 h-3 text-purple-400" />
            <span className="text-[11px] text-purple-400">{TYPE_LABELS[request.collab_type]?.label}</span>
          </div>
        </div>
      </div>

      {/* Original pitch as first message */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {request.message && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 bg-white/[0.06]">
              <p className="text-[10px] text-white/30 mb-1 uppercase tracking-wide">Original pitch</p>
              <p className="text-sm text-white/70 leading-relaxed">{request.message}</p>
            </div>
          </div>
        )}

        {messages.map(msg => {
          const isMe = msg.sender_id === myArtistId;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                isMe
                  ? 'bg-purple-600 rounded-tr-sm'
                  : 'bg-white/[0.06] rounded-tl-sm'
              }`}>
                <p className="text-sm text-white leading-relaxed">{msg.content}</p>
                <p className={`text-[9px] mt-1 ${isMe ? 'text-purple-200/50' : 'text-white/20'}`}>
                  {timeAgo(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}

        {messages.length === 0 && !request.message && (
          <div className="text-center py-8">
            <p className="text-sm text-white/20">No messages yet — start the conversation</p>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex items-center space-x-2 p-4 border-t border-white/[0.06] flex-shrink-0">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 500))}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Send a message…"
          maxLength={500}
          className="flex-1 bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20 transition"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-purple-600 disabled:opacity-30 transition active:scale-95">
          {sending ? <Loader className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
        </button>
      </div>
    </div>
  );
}

// ── Main CollabThread hub section ─────────────────────────────────────────────
export default function CollabThread() {
  const { user, artist }          = useAuth();
  const [requests, setRequests]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [filter, setFilter]       = useState('all'); // 'all' | 'incoming' | 'sent' | 'active'
  const { tap, success }          = useHaptics();
  const navigate                  = useNavigate();

  useEffect(() => { if (artist) fetchRequests(); }, [artist?.id]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('collab_requests')
        .select(`
          *,
          from_artist:artists!collab_requests_from_artist_id_fkey(id, artist_name, slug, profile_image_url, is_verified),
          to_artist:artists!collab_requests_to_artist_id_fkey(id, artist_name, slug, profile_image_url, is_verified)
        `)
        .or(`from_artist_id.eq.${artist.id},to_artist_id.eq.${artist.id}`)
        .order('created_at', { ascending: false });
      setRequests(data || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleRespond = async (requestId, status) => {
    tap();
    try {
      await supabase
        .from('collab_requests')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', requestId);

      const req = requests.find(r => r.id === requestId);
      if (req && status === 'accepted') {
        success();
        // Notify the sender
        await supabase.from('notifications').insert({
          artist_id:      req.from_artist_id,
          type:           'collab_accepted',
          title:          'Collab Request Accepted!',
          message:        `${artist.artist_name} accepted your ${req.collab_type} request`,
          from_artist_id: artist.id,
          metadata:       { request_id: requestId },
        });
      }

      setRequests(prev => prev.map(r =>
        r.id === requestId ? { ...r, status } : r
      ));
    } catch (err) { console.error(err); }
  };

  const filtered = requests.filter(r => {
    if (filter === 'incoming') return r.to_artist_id === artist?.id;
    if (filter === 'sent')     return r.from_artist_id === artist?.id;
    if (filter === 'active')   return r.status === 'accepted';
    return true;
  });

  const pendingIncoming = requests.filter(
    r => r.to_artist_id === artist?.id && r.status === 'pending'
  ).length;

  if (!artist) return (
    <div className="py-12 text-center">
      <Radio className="w-10 h-10 mx-auto text-white/10 mb-3" />
      <p className="text-sm text-white/30">Artist account required</p>
    </div>
  );

  // Mobile: show thread full-screen when selected
  if (selected?.status === 'accepted') {
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
        <button
          onClick={() => { tap(); setSelected(null); }}
          className="flex items-center space-x-2 px-4 py-3 text-white/40 hover:text-white/70 transition flex-shrink-0">
          <span className="text-sm">← All collabs</span>
        </button>
        <div className="flex-1 min-h-0 rounded-2xl border border-white/[0.06] overflow-hidden">
          <MessageThread request={selected} myArtistId={artist.id} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Radio className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-bold text-white">Collab Radar</h2>
          {pendingIncoming > 0 && (
            <span className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-[10px] font-bold text-white">
              {pendingIncoming}
            </span>
          )}
        </div>
        <button
          onClick={() => { tap(); navigate('/collab-radar'); }}
          className="text-[11px] text-purple-400 hover:text-purple-300 transition font-medium">
          Find matches →
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex space-x-2 overflow-x-auto scrollbar-hide">
        {[
          { key: 'all',      label: 'All' },
          { key: 'incoming', label: `Incoming${pendingIncoming > 0 ? ` (${pendingIncoming})` : ''}` },
          { key: 'sent',     label: 'Sent' },
          { key: 'active',   label: 'Active' },
        ].map(({ key, label }) => (
          <button key={key}
            onClick={() => { tap(); setFilter(key); }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filter === key ? 'bg-white text-black' : 'bg-white/[0.06] text-white/40 hover:text-white/60'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader className="w-5 h-5 animate-spin text-white/20" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-white/20">No {filter !== 'all' ? filter : ''} requests yet</p>
          <button
            onClick={() => { tap(); navigate('/collab-radar'); }}
            className="mt-3 text-xs text-purple-400 hover:text-purple-300 transition">
            Scan for matches →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <RequestCard
              key={req.id}
              request={req}
              myArtistId={artist.id}
              onRespond={handleRespond}
              onClick={setSelected}
              isSelected={selected?.id === req.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
