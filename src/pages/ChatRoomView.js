import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import {
  ArrowLeft, Send, Loader, Users, Shield,
  AlertTriangle, Trash2, VolumeX, Lock, X,
  CornerDownRight, BarChart2, Plus, Check, Pin,
  Smile, Music, Play, Bug, CheckCircle,
  ChevronDown, 
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const EMOJIS = [
  '😀','😂','🥹','😍','🔥','💯','🎵','🎶','🎤','🎧','💜','❤️','👏','🙌',
  '😭','😤','🤯','👀','✨','💀','🫶','🤝','🎉','🥳','😎','🤘','💪','🫡',
];

const REACTION_EMOJIS = ['🔥','❤️','😂','😍','👏','💯','🎵','💀'];

const BUG_CATEGORIES = [
  'Playback / Audio',
  'Upload / Publishing',
  'Profile / Account',
  'Payments / Downloads',
  'Notifications',
  'Chat / Community',
  'Performance / Crashes',
  'Other',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
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

const hasExternalLink = (text) =>
  /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|co|xyz|me|dev|app|gg)[^\s]*/i.test(text);

// ── TrackPill ─────────────────────────────────────────────────────────────────
function TrackPill({ trackId, navigate }) {
  const [track, setTrack] = React.useState(null);
  React.useEffect(() => {
    supabase.from('tracks')
      .select('id, title, cover_artwork_url, artists(artist_name, slug)')
      .eq('id', trackId).maybeSingle()
      .then(({ data }) => setTrack(data));
  }, [trackId]);
  if (!track) return <span className="text-white/30 text-xs italic">♪</span>;
  return (
    <button
      onClick={e => { e.stopPropagation(); if (track.artists?.slug) navigate(`/artist/${track.artists.slug}`); }}
      className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/20 hover:bg-purple-500/25 transition mx-0.5 align-middle"
    >
      <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0 bg-white/10">
        {track.cover_artwork_url
          ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
          : <Music className="w-3 h-3 text-purple-400" style={{ margin: 'auto', marginTop: 4 }} />}
      </div>
      <span className="text-xs font-medium text-purple-300 max-w-[110px] truncate">{track.title}</span>
      <Play className="w-2.5 h-2.5 text-purple-400 flex-shrink-0" fill="currentColor" />
    </button>
  );
}

function MessageContent({ content, navigate }) {
  const parts = content.split(/(\[\[track:[^\]]+\]\])/g);
  if (parts.length === 1) return <p className="text-sm text-white/80 break-words leading-relaxed">{content}</p>;
  return (
    <p className="text-sm text-white/80 break-words leading-relaxed">
      {parts.map((part, i) => {
        const m = part.match(/^\[\[track:([^\]]+)\]\]$/);
        if (m) return <TrackPill key={i} trackId={m[1]} navigate={navigate} />;
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

// ── Reaction bar ──────────────────────────────────────────────────────────────
function ReactionBar({ messageId, userId, onClose }) {
  const [saving, setSaving] = useState(false);

  const react = async (emoji) => {
    if (saving) return;
    setSaving(true);
    try {
      // Toggle: if already reacted with this emoji, remove it
      const { data: existing } = await supabase.from('chat_reactions')
        .select('id').eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji).maybeSingle();
      if (existing) {
        await supabase.from('chat_reactions').delete().eq('id', existing.id);
      } else {
        await supabase.from('chat_reactions').insert({ message_id: messageId, user_id: userId, emoji });
      }
    } catch (err) { console.error('Reaction error:', err); }
    setSaving(false);
    onClose();
  };

  return (
    <div className="flex items-center space-x-1 px-2 py-1.5 bg-neutral-900 border border-white/[0.1] rounded-2xl shadow-xl">
      {REACTION_EMOJIS.map(emoji => (
        <button key={emoji} onClick={() => react(emoji)}
          className="text-lg p-1 rounded-lg hover:bg-white/[0.1] transition active:scale-90 leading-none">
          {emoji}
        </button>
      ))}
    </div>
  );
}

// ── Inline reactions display ──────────────────────────────────────────────────
function MessageReactions({ reactions, userId, messageId }) {
  if (!reactions?.length) return null;
  const grouped = {};
  reactions.forEach(r => {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, mine: false };
    grouped[r.emoji].count++;
    if (r.user_id === userId) grouped[r.emoji].mine = true;
  });
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(grouped).map(([emoji, { count, mine }]) => (
        <span key={emoji}
          className={`inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded-full text-xs border transition ${mine ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'bg-white/[0.06] border-white/[0.08] text-white/60'}`}>
          <span>{emoji}</span>
          <span className="text-[10px]">{count}</span>
        </span>
      ))}
    </div>
  );
}

// ── Poll card ─────────────────────────────────────────────────────────────────
function PollCard({ poll, userId, onVote }) {
  const expired     = new Date(poll.expires_at) < new Date();
  const totalVotes  = poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);
  const myVote      = poll.my_vote;
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
          const pct        = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
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
              {showResults && <div className="absolute inset-0 rounded-lg transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: isMyChoice ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)' }} />}
              {!showResults && <div className="absolute inset-0 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] transition" />}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-white/20 mt-2">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
    </div>
  );
}

// ── Create poll modal ─────────────────────────────────────────────────────────
function CreatePollModal({ roomId, artistId, onClose, onCreated }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions]   = useState(['', '']);
  const [duration, setDuration] = useState(24);
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');

  const addOption    = () => { if (options.length < 6) setOptions(p => [...p, '']); };
  const removeOption = (i) => { if (options.length > 2) setOptions(p => p.filter((_, idx) => idx !== i)); };
  const updateOption = (i, v) => setOptions(p => p.map((o, idx) => idx === i ? v : o));

  const handleCreate = async () => {
    if (!question.trim()) { setError('Question is required'); return; }
    const valid = options.filter(o => o.trim());
    if (valid.length < 2) { setError('At least 2 options required'); return; }
    setCreating(true);
    try {
      const expiresAt = new Date(Date.now() + duration * 3600000).toISOString();
      const formatted = valid.map((text, i) => ({ id: String.fromCharCode(97 + i), text: text.trim(), votes: 0 }));
      const { error: err } = await supabase.from('chat_polls').insert({
        room_id: roomId, artist_id: artistId,
        question: question.trim(), options: formatted, expires_at: expiresAt,
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
                <button onClick={() => removeOption(i)} className="text-white/20 hover:text-red-400 transition"><X className="w-4 h-4" /></button>
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

// ── Bug report form (shown instead of chat in pinned bug rooms) ───────────────
function BugReportForm({ roomId, userId, isAdmin }) {
  const [category, setCategory]     = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [reports, setReports]       = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoadingReports(true);
    const { data } = await supabase
      .from('bug_reports')
      .select('id, user_id, category, description, status, resolved_at, created_at')
      .order('created_at', { ascending: false });
    setReports(data || []);
    setLoadingReports(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleSubmit = async () => {
    if (!category || !description.trim() || submitting) return;
    setSubmitting(true);
    try {
      await supabase.from('bug_reports').insert({
        user_id:     userId,
        category,
        description: description.trim(),
        status:      'open',
      });
      setSubmitted(true);
      setCategory('');
      setDescription('');
      fetchReports();
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err) { console.error('Bug report error:', err); }
    setSubmitting(false);
  };

  const handleResolve = async (reportId) => {
    try {
      await supabase.from('bug_reports').update({
        status:      'resolved',
        resolved_at: new Date().toISOString(),
      }).eq('id', reportId);
      fetchReports();
    } catch (err) { console.error('Resolve error:', err); }
  };

  const open     = reports.filter(r => r.status === 'open');
  const resolved = reports.filter(r => r.status === 'resolved');

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      {/* Submit form */}
      <div className="p-4 rounded-xl bg-red-500/[0.06] border border-red-500/20">
        <div className="flex items-center space-x-2 mb-3">
          <Bug className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-semibold text-red-300">Report an Issue</h3>
        </div>

        {submitted ? (
          <div className="flex items-center space-x-2 py-3 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">Got it, thanks for the report!</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wide mb-1.5 block">Category</label>
              <div className="grid grid-cols-2 gap-1.5">
                {BUG_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setCategory(cat)}
                    className={`px-2.5 py-2 rounded-lg text-xs text-left transition ${category === cat ? 'bg-red-500/25 border border-red-500/40 text-red-300' : 'bg-white/[0.04] border border-white/[0.06] text-white/40 hover:bg-white/[0.07]'}`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wide mb-1.5 block">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe what happened and how to reproduce it..."
                rows={4}
                maxLength={1000}
                autoComplete="off"
                className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none resize-none"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={!category || !description.trim() || submitting}
              className="w-full py-2.5 bg-red-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center space-x-2"
            >
              {submitting ? <Loader className="w-4 h-4 animate-spin" /> : <Bug className="w-4 h-4" />}
              <span>{submitting ? 'Submitting...' : 'Submit Report'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Open reports */}
      {loadingReports ? (
        <div className="flex justify-center py-4"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
      ) : (
        <>
          {open.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-2">
                Open ({open.length})
              </p>
              <div className="space-y-2">
                {open.map(report => (
                  <div key={report.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="flex items-start justify-between space-x-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">
                            {report.category}
                          </span>
                          <span className="text-[10px] text-white/20">{timeAgo(report.created_at)}</span>
                        </div>
                        <p className="text-sm text-white/70 leading-relaxed">{report.description}</p>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => handleResolve(report.id)}
                          title="Mark as resolved"
                          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-medium hover:bg-green-500/25 transition"
                        >
                          <CheckCircle className="w-3 h-3" />
                          <span>Resolve</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {open.length === 0 && (
            <p className="text-sm text-white/20 text-center py-4">No open reports right now</p>
          )}

          {/* Resolved reports (collapsed by default) */}
          {resolved.length > 0 && (
            <div>
              <button
                onClick={() => setShowResolved(p => !p)}
                className="flex items-center space-x-2 text-[10px] uppercase tracking-widest text-white/20 font-semibold mb-2 hover:text-white/40 transition"
              >
                <CheckCircle className="w-3 h-3 text-green-400/50" />
                <span>Resolved ({resolved.length})</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showResolved ? 'rotate-180' : ''}`} />
              </button>
              {showResolved && (
                <div className="space-y-2">
                  {resolved.map(report => (
                    <div key={report.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] opacity-60">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400/70 font-medium">
                          {report.category}
                        </span>
                        <CheckCircle className="w-3 h-3 text-green-400/50" />
                        <span className="text-[10px] text-white/20">
                          Resolved {report.resolved_at ? timeAgo(report.resolved_at) : ''}
                        </span>
                      </div>
                      <p className="text-sm text-white/40 leading-relaxed">{report.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChatRoomView() {
  const { roomId } = useParams();
  const navigate   = useNavigate();
  const { user, artist, isAdmin } = useAuth();

  const [room, setRoom]                           = useState(null);
  const [spendGate, setSpendGate]                 = useState(false);
  const [messages, setMessages]                   = useState([]);
  const [polls, setPolls]                         = useState([]);
  const [reactions, setReactions]                 = useState({});   // { messageId: [{emoji,user_id},...] }
  const [wordFilters, setWordFilters]             = useState([]);
  const [input, setInput]                         = useState('');
  const [loading, setLoading]                     = useState(true);
  const [sending, setSending]                     = useState(false);
  const [isMember, setIsMember]                   = useState(false);
  const [myMembership, setMyMembership]           = useState(null);
  const [joining, setJoining]                     = useState(false);
  const [showMembers, setShowMembers]             = useState(false);
  const [modWarning, setModWarning]               = useState('');
  const [replyingTo, setReplyingTo]               = useState(null);
  const [showPollModal, setShowPollModal]         = useState(false);
  const [showEmojiPicker, setShowEmojiPicker]     = useState(false);
  const [showTrackSearch, setShowTrackSearch]     = useState(false);
  const [trackQuery, setTrackQuery]               = useState('');
  const [trackResults, setTrackResults]           = useState([]);
  const [trackSearching, setTrackSearching]       = useState(false);
  const [mentionResults, setMentionResults]       = useState([]);
  const [roomMembers, setRoomMembers]             = useState([]);
  const [typingUsers, setTypingUsers]             = useState([]);   // names of people currently typing
  const [reactionTarget, setReactionTarget]       = useState(null); // msgId showing reaction bar
  const [longPressTimer, setLongPressTimer]       = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const presenceRef    = useRef(null);
  const typingTimerRef = useRef(null);

  const isRoomArtist  = room?.artists?.user_id === user?.id;
  const isBugRoom     = room?.is_pinned && !!room?.accent_color;
  const accentColor   = room?.accent_color || null;
  const isRoomAdmin   = room?.artists?.user_id === user?.id || myMembership?.role === 'admin' || myMembership?.role === 'moderator';

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (roomId && user) {
      fetchRoom(); fetchMessages(); fetchPolls(); fetchWordFilters(); checkMembership();
    }
  }, [roomId, user]);

  // ── Realtime: messages, polls, reactions ────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`chat-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        payload => fetchSingleMessage(payload.new.id))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        payload => setMessages(prev => prev.map(m =>
          m.id === payload.new.id ? { ...m, is_deleted: payload.new.is_deleted, deleted_reason: payload.new.deleted_reason, is_pinned: payload.new.is_pinned } : m
        )))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_polls', filter: `room_id=eq.${roomId}` },
        () => fetchPolls())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' },
        () => fetchReactions())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [roomId]);

  // ── Presence: typing indicators ─────────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !user || !isMember) return;
    const myName = artist?.artist_name || 'Someone';

    const channel = supabase.channel(`presence-${roomId}`, { config: { presence: { key: user.id } } });
    presenceRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typing = Object.values(state)
          .flat()
          .filter(p => p.typing && p.user_id !== user.id)
          .map(p => p.name);
        setTypingUsers([...new Set(typing)]);
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: user.id, name: myName, typing: false });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      presenceRef.current = null;
    };
  }, [roomId, user, isMember, artist?.artist_name]);

  // Broadcast typing state when input changes
  const broadcastTyping = useCallback((isTyping) => {
    if (!presenceRef.current) return;
    presenceRef.current.track({
      user_id: user?.id,
      name:    artist?.artist_name || 'Someone',
      typing:  isTyping,
    });
  }, [user?.id, artist?.artist_name]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    broadcastTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => broadcastTyping(false), 2000);
  };

  // ── Long press for reaction bar ──────────────────────────────────────────────
  const startLongPress = (msgId) => {
    const timer = setTimeout(() => setReactionTarget(msgId), 500);
    setLongPressTimer(timer);
  };

  const cancelLongPress = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
  };

  // ── Room members for @mention ────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    supabase.from('chat_room_members').select('user_id').eq('room_id', roomId).limit(100)
      .then(async ({ data }) => {
        if (!data?.length) return;
        const userIds = data.map(m => m.user_id).filter(Boolean);
        const { data: artists } = await supabase.from('artists')
          .select('user_id, artist_name, profile_image_url, slug').in('user_id', userIds);
        setRoomMembers((artists || []).map(a => ({ user_id: a.user_id, artists: a })));
      });
  }, [roomId]);

  // @mention autocomplete
  useEffect(() => {
    const m = input.match(/@(\w*)$/);
    if (m) {
      const q = m[1].toLowerCase();
      setMentionResults(roomMembers.filter(mb => mb.artists?.artist_name?.toLowerCase().includes(q) && mb.user_id !== user?.id).slice(0, 5));
    } else {
      setMentionResults([]);
    }
  }, [input, roomMembers, user?.id]);

  // Track search
  useEffect(() => {
    if (!trackQuery.trim() || trackQuery.length < 2) { setTrackResults([]); return; }
    const t = setTimeout(async () => {
      setTrackSearching(true);
      const { data } = await supabase.from('tracks')
        .select('id, title, cover_artwork_url, artists(artist_name)')
        .ilike('title', `%${trackQuery.trim()}%`).eq('is_published', true).limit(6);
      setTrackResults(data || []);
      setTrackSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [trackQuery]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, polls]);

  // Update last_read_at when entering the room
  useEffect(() => {
    if (!roomId || !user || !isMember) return;
    supabase.from('chat_room_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('room_id', roomId).eq('user_id', user.id)
      .then(() => {});
  }, [roomId, user, isMember]);

  // ── Data fetchers ────────────────────────────────────────────────────────────
  const fetchRoom = async () => {
    const { data } = await supabase.from('chat_rooms')
      .select('*, artists(id, artist_name, slug, profile_image_url, is_verified, user_id)')
      .eq('id', roomId).maybeSingle();
    setRoom(data); setLoading(false);
  };

  const fetchReactions = async () => {
    const { data } = await supabase.from('chat_reactions')
      .select('id, message_id, user_id, emoji');
    if (!data) return;
    const map = {};
    data.forEach(r => {
      if (!map[r.message_id]) map[r.message_id] = [];
      map[r.message_id].push(r);
    });
    setReactions(map);
  };

  const fetchPolls = async () => {
    const { data: pollsData } = await supabase.from('chat_polls').select('*')
      .eq('room_id', roomId).order('created_at', { ascending: true });
    if (!pollsData?.length) { setPolls([]); return; }
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
      .eq('room_id', roomId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) { console.error('fetchMessages error:', error); return; }
    if (data?.length) {
      const userIds = [...new Set(data.map(m => m.user_id))];
      const { data: artistsData } = await supabase.from('artists')
        .select('user_id, artist_name, slug, profile_image_url, is_verified').in('user_id', userIds);
      const artistMap = {};
      (artistsData || []).forEach(a => { artistMap[a.user_id] = a; });
      const missingIds = userIds.filter(id => !artistMap[id]);
      const profileMap = {};
      if (missingIds.length) {
        const { data: profilesData } = await supabase.from('user_profiles')
          .select('user_id, name, avatar_url').in('user_id', missingIds);
        (profilesData || []).forEach(p => { profileMap[p.user_id] = p; });
      }
      setMessages(data.map(m => {
        if (artistMap[m.user_id]) return { ...m, artist: artistMap[m.user_id] };
        const profile = profileMap[m.user_id];
        if (profile) return { ...m, artist: { artist_name: profile.name || 'Listener', profile_image_url: profile.avatar_url || null, slug: null, is_verified: false } };
        return { ...m, artist: null };
      }));
    } else { setMessages([]); }
    fetchReactions();
  };

  const fetchSingleMessage = async (msgId) => {
    const { data } = await supabase.from('chat_messages')
      .select('id, room_id, user_id, content, created_at, is_deleted, deleted_reason, is_pinned')
      .eq('id', msgId).single();
    if (!data) return;
    const { data: artistData } = await supabase.from('artists')
      .select('user_id, artist_name, slug, profile_image_url, is_verified')
      .eq('user_id', data.user_id).maybeSingle();
    let resolvedArtist = artistData || null;
    if (!resolvedArtist) {
      const { data: profileData } = await supabase.from('user_profiles')
        .select('user_id, name, avatar_url').eq('user_id', data.user_id).maybeSingle();
      if (profileData) resolvedArtist = { artist_name: profileData.name || 'Listener', profile_image_url: profileData.avatar_url || null, slug: null, is_verified: false };
    }
    setMessages(prev => prev.find(m => m.id === data.id) ? prev : [...prev, { ...data, artist: resolvedArtist }]);
  };

  const fetchWordFilters = async () => {
    const { data } = await supabase.from('chat_word_filters').select('word, is_regex, severity');
    setWordFilters(data || []);
  };

  const checkMembership = async () => {
    const { data } = await supabase.from('chat_room_members').select('*')
      .eq('room_id', roomId).eq('user_id', user.id).maybeSingle();
    if (data) { setIsMember(true); setMyMembership(data); }
    else       { setIsMember(false); setMyMembership(null); }
  };

  const joinRoom = async () => {
    if (!user) { navigate('/login'); return; }
    setJoining(true);
    try {
      if (room?.is_subscribers_only) {
        const artistId = room?.artists?.id;
        if (artistId) {
          const { data: artistTracks } = await supabase.from('tracks').select('id').eq('artist_id', artistId);
          const trackIds = (artistTracks || []).map(t => t.id);
          let totalSpent = 0;
          if (trackIds.length) {
            const { data: spendData } = await supabase.from('downloads')
              .select('amount_paid').eq('user_id', user.id).in('track_id', trackIds);
            totalSpent = (spendData || []).reduce((sum, d) => sum + (d.amount_paid || 0), 0);
          }
          if (totalSpent < 5) { setSpendGate(true); setJoining(false); return; }
        }
      }
      const { data: existing } = await supabase.from('chat_room_members').select('id')
        .eq('room_id', roomId).eq('user_id', user.id).maybeSingle();
      if (existing) { setIsMember(true); setMyMembership({ role: 'member' }); setJoining(false); return; }
      const { error } = await supabase.from('chat_room_members').insert({ room_id: roomId, user_id: user.id, role: 'member' });
      if (error) throw error;
      try {
        await supabase.rpc('increment_chat_member_count', { room_id_input: roomId });
      } catch {
        await supabase.from('chat_rooms').update({ member_count: (room?.member_count || 0) + 1 }).eq('id', roomId);
      }
      setIsMember(true); setMyMembership({ role: 'member' });
    } catch (err) { console.error('Join error:', err); }
    setJoining(false);
  };

  const insertMention = (member) => {
    setInput(prev => prev.replace(/@\w*$/, '@' + member.artists.artist_name + ' '));
    setMentionResults([]);
    inputRef.current?.focus();
  };

  const insertTrackTag = (track) => {
    setInput(prev => prev + `[[track:${track.id}]] `);
    setShowTrackSearch(false); setTrackQuery(''); setTrackResults([]);
    inputRef.current?.focus();
  };

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
    broadcastTyping(false);
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
      if (!currentlyPinned) await supabase.from('chat_messages').update({ is_pinned: true }).eq('id', msgId);
      fetchMessages();
    } catch (err) { console.error('Pin error:', err); }
  };

  const handleDelete = async (msgId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, deleted_reason: 'Removed by moderator' } : m));
    try {
      await supabase.from('chat_messages').update({ is_deleted: true, deleted_reason: 'Removed by moderator' }).eq('id', msgId);
    } catch (err) {
      console.error('Delete error:', err);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: false, deleted_reason: null } : m));
    }
  };

  const refreshMessages = useCallback(async () => {
    await Promise.all([fetchMessages(), fetchPolls()]);
  }, []);

  const { pullProps, pullProgress, isRefreshing } = usePullToRefresh(refreshMessages);

  const timeline = [
    ...messages.map(m => ({ ...m, _type: 'message' })),
    ...polls.map(p => ({ ...p, _type: 'poll' })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // ── Guards ───────────────────────────────────────────────────────────────────
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
      <button onClick={() => navigate('/chat')} className="mt-4 text-sm text-white/30 hover:text-white/50">Back to rooms</button>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      id="chat-room-root"
      className="flex flex-col bg-black text-white"
      style={{ minHeight: '100dvh', maxHeight: '100dvh' }}
      onClick={() => { if (reactionTarget) setReactionTarget(null); }}
    >
      {/* Top bar — paddingTop accounts for iPhone notch/dynamic island */}
      <div
        className="flex items-center justify-between px-4 pb-3 border-b backdrop-blur-xl flex-shrink-0 sticky top-0 z-30"
        style={isBugRoom
          ? { background: `linear-gradient(to right, ${accentColor}18, #000000f2)`, borderColor: `${accentColor}30`, paddingTop: 'max(12px, env(safe-area-inset-top, 12px))' }
          : { background: 'rgba(0,0,0,0.95)', borderColor: 'rgba(255,255,255,0.06)', paddingTop: 'max(12px, env(safe-area-inset-top, 12px))' }
        }
      >
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate('/chat')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <button onClick={() => room.artists?.slug && navigate(`/artist/${room.artists.slug}`)} className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
              style={isBugRoom ? { background: `${accentColor}25` } : { background: 'linear-gradient(135deg,rgba(124,58,237,0.3),rgba(37,99,235,0.2))' }}>
              {isBugRoom
                ? <Bug className="w-5 h-5" style={{ color: accentColor }} />
                : room.artists?.profile_image_url
                  ? <img src={room.artists.profile_image_url} alt="" className="w-9 h-9 object-cover" />
                  : <span className="text-sm font-bold text-white/40">{room.artists?.artist_name?.[0]}</span>}
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <p className="text-sm font-semibold" style={isBugRoom ? { color: accentColor } : { color: '#fff' }}>{room.name}</p>
                {room.is_subscribers_only && <Lock className="w-3 h-3 text-yellow-400" />}
              </div>
              <p className="text-[10px] text-white/30">{room.artists?.artist_name} · {room.member_count} members</p>
            </div>
          </button>
        </div>
        <button onClick={() => setShowMembers(!showMembers)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
          <Users className="w-4 h-4 text-white/50" />
        </button>
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

      {/* Bug room: show structured form instead of chat timeline */}
      {isBugRoom ? (
        isMember ? (
          <BugReportForm roomId={roomId} userId={user.id} isAdmin={isAdmin} />
        ) : (
          <div className="px-4 py-3 border-t border-white/[0.06] flex-shrink-0 mt-auto">
            <button onClick={joinRoom} disabled={joining}
              className="w-full py-3 bg-white text-black rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-50 transition">
              {joining ? <Loader className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              <span>{joining ? 'Joining...' : 'Join to Submit a Report'}</span>
            </button>
          </div>
        )
      ) : (
        <>
          {/* Regular chat timeline */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" {...pullProps}>
              <PullToRefreshIndicator pullProgress={pullProgress} isRefreshing={isRefreshing} />
              <div className="flex items-center space-x-2 px-2 py-2 mb-2 border-b border-white/[0.04]">
                <div className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.2),rgba(37,99,235,0.1))' }}>
                  {room.artists?.profile_image_url
                    ? <img src={room.artists.profile_image_url} alt="" className="w-7 h-7 object-cover" />
                    : <span className="text-xs font-bold text-white/30">{room.artists?.artist_name?.[0]}</span>}
                </div>
                <p className="text-xs text-white/30 flex-1">{room.name} · Created by {room.artists?.artist_name}</p>
                <Shield className="w-3 h-3 text-white/15" />
                <span className="text-[10px] text-white/15">Moderated</span>
              </div>

              {timeline.map((item, i) => {
                if (item._type === 'poll') return <PollCard key={`poll-${item.id}`} poll={item} userId={user.id} onVote={handleVote} />;
                const msg         = item;
                const prevItem    = timeline[i - 1];
                const sameSender  = prevItem && prevItem._type === 'message' && prevItem.user_id === msg.user_id && (new Date(msg.created_at) - new Date(prevItem.created_at)) < 120000;
                const isMe        = msg.user_id === user.id;
                const isRoomOwner = msg.user_id === room.artists?.user_id;
                const canDelete   = isMe || isRoomAdmin;
                const msgReactions = reactions[msg.id] || [];

                if (msg.is_deleted) return (
                  <div key={msg.id} className="px-3 py-1.5">
                    <p className="text-xs text-white/15 italic">Message removed{msg.deleted_reason ? `: ${msg.deleted_reason}` : ''}</p>
                  </div>
                );

                return (
                  <div key={msg.id}
                    className={`group flex items-start space-x-2.5 px-2 py-1 rounded-lg hover:bg-white/[0.02] transition select-none ${sameSender ? 'mt-0' : 'mt-2'} ${msg.is_pinned ? 'bg-purple-500/[0.05] border-l-2 border-purple-500/40' : ''}`}
                    onTouchStart={() => startLongPress(msg.id)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onMouseDown={() => startLongPress(msg.id)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                  >
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
                      <MessageContent content={msg.content} navigate={navigate} />
                      <MessageReactions reactions={msgReactions} userId={user.id} messageId={msg.id} />

                      {/* Reaction bar — appears on long press */}
                      {reactionTarget === msg.id && (
                        <div className="mt-1" onClick={e => e.stopPropagation()}>
                          <ReactionBar messageId={msg.id} userId={user.id} onClose={() => setReactionTarget(null)} />
                        </div>
                      )}
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

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex items-center space-x-2 px-3 py-1">
                  <div className="flex space-x-0.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="text-[11px] text-white/30">
                    {typingUsers.length === 1
                      ? `${typingUsers[0]} is typing...`
                      : `${typingUsers.slice(0, 2).join(', ')} are typing...`}
                  </span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {modWarning && (
            <div className="mx-4 mb-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">{modWarning}</p>
            </div>
          )}

          {/* Input bar or join prompt */}
          {isMember ? (
            <div className="px-3 pt-2 pb-3 border-t border-white/[0.06] bg-black/95 backdrop-blur-xl flex-shrink-0">
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
                  {mentionResults.length > 0 && (
                    <div className="mb-2 bg-neutral-900 border border-white/[0.08] rounded-xl overflow-hidden">
                      {mentionResults.map(m => (
                        <button key={m.user_id} onClick={() => insertMention(m)}
                          className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-white/[0.06] transition text-left border-b border-white/[0.04] last:border-0">
                          <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                            {m.artists.profile_image_url
                              ? <img src={m.artists.profile_image_url} alt="" className="w-full h-full object-cover" />
                              : <span className="text-[10px] font-bold text-white/40">{m.artists.artist_name[0]}</span>}
                          </div>
                          <span className="text-sm text-white">@{m.artists.artist_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showTrackSearch && (
                    <div className="mb-2 bg-neutral-900 border border-white/[0.08] rounded-xl overflow-hidden">
                      <div className="flex items-center space-x-2 px-3 py-2 border-b border-white/[0.06]">
                        <Music className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                        <input value={trackQuery} onChange={e => setTrackQuery(e.target.value)}
                          placeholder="Search tracks to tag..." autoFocus
                          className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none" />
                        {trackSearching && <Loader className="w-3.5 h-3.5 animate-spin text-white/30 flex-shrink-0" />}
                        <button onClick={() => { setShowTrackSearch(false); setTrackQuery(''); setTrackResults([]); }}>
                          <X className="w-3.5 h-3.5 text-white/30" />
                        </button>
                      </div>
                      {trackResults.length > 0 ? trackResults.map(track => (
                        <button key={track.id} onClick={() => insertTrackTag(track)}
                          className="w-full flex items-center space-x-2.5 px-3 py-2.5 hover:bg-white/[0.06] transition text-left border-b border-white/[0.04] last:border-0">
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                            {track.cover_artwork_url
                              ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                              : <Music className="w-3.5 h-3.5 text-white/20 m-auto mt-2" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{track.title}</p>
                            <p className="text-[10px] text-white/30">{track.artists?.artist_name}</p>
                          </div>
                        </button>
                      )) : trackQuery.length >= 2 && !trackSearching
                        ? <p className="text-xs text-white/30 text-center py-3">No tracks found</p>
                        : <p className="text-[10px] text-white/20 text-center py-3">Type to search published tracks</p>}
                    </div>
                  )}
                  {showEmojiPicker && (
                    <div className="mb-2 p-2 bg-neutral-900 border border-white/[0.08] rounded-xl">
                      <div className="grid grid-cols-8 gap-1">
                        {EMOJIS.map(emoji => (
                          <button key={emoji} onClick={() => { setInput(prev => prev + emoji); setShowEmojiPicker(false); inputRef.current?.focus(); }}
                            className="text-xl p-1 rounded-lg hover:bg-white/[0.08] transition active:scale-90 leading-none">{emoji}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <button onClick={() => { setShowEmojiPicker(p => !p); setShowTrackSearch(false); }}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl transition flex-shrink-0 ${showEmojiPicker ? 'bg-purple-600/30 text-purple-300' : 'bg-white/[0.06] hover:bg-white/[0.1] text-white/40'}`}>
                      <Smile className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setShowTrackSearch(p => !p); setShowEmojiPicker(false); }}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl transition flex-shrink-0 ${showTrackSearch ? 'bg-purple-600/30 text-purple-300' : 'bg-white/[0.06] hover:bg-white/[0.1] text-white/40'}`}>
                      <Music className="w-4 h-4" />
                    </button>
                    {isRoomArtist && (
                      <button onClick={() => setShowPollModal(true)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.06] hover:bg-purple-600/20 transition flex-shrink-0">
                        <BarChart2 className="w-4 h-4 text-white/40" />
                      </button>
                    )}
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                      placeholder={replyingTo ? `Reply to @${replyingTo.artist_name}...` : 'Type a message...'}
                      maxLength={500}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="sentences"
                      spellCheck="true"
                      data-lpignore="true"
                      data-form-type="other"
                      className="flex-1 min-w-0 bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none"
                    />
                    <button onClick={handleSend} disabled={!input.trim() || sending}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-purple-600 disabled:opacity-30 transition active:scale-95 flex-shrink-0">
                      {sending ? <Loader className="w-4 h-4 animate-spin text-white" /> : <Send className="w-4 h-4 text-white" />}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : spendGate ? (
            <div className="px-4 py-4 border-t border-white/[0.06] flex-shrink-0">
              <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-center">
                <Lock className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-white mb-1">Supporter Access Required</p>
                <p className="text-xs text-white/40 mb-3">
                  Purchase at least <span className="text-white font-semibold">$5</span> of music from <span className="text-white">{room?.artists?.artist_name}</span> to join.
                </p>
                <button onClick={() => navigate(`/artist/${room?.artists?.slug}`)}
                  className="w-full py-2.5 bg-yellow-500 text-black rounded-xl font-semibold text-sm transition active:scale-95">
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
          )}
        </>
      )}

      {showPollModal && (
        <CreatePollModal roomId={roomId} artistId={artist?.id}
          onClose={() => setShowPollModal(false)} onCreated={fetchPolls} />
      )}
    </div>
  );
}