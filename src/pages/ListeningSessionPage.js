/**
 * ListeningSessionPage.js
 *
 * Two roles:
 *   HOST (artist) — controls playback, manages queue, can embed YouTube livestream
 *   LISTENER      — synced audio or YouTube embed, live chat, reactions
 *
 * Two modes:
 *   'audio'   — artist queues tracks from Feelz (incl. unpublished), listeners hear in sync
 *   'youtube' — artist pastes YouTube live URL, everyone watches together + chat
 *
 * Real-time sync via Supabase realtime on listening_sessions row.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TipButton from '../components/TipButton';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Play, Pause, SkipForward, X, Users, Music, Radio,
  Plus, Search, Loader, Send, Youtube, Mic, MicOff,
  ChevronDown, Heart, Flame, Star, Zap, Trash2, BarChart2
} from 'lucide-react';

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const REACTIONS = ['❤️', '🔥', '🎵', '⚡', '🙌'];

function extractYouTubeId(url) {
  const m = url?.match(YOUTUBE_REGEX);
  return m ? m[1] : null;
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// ── Floating reaction ─────────────────────────────────────────────────────────
function FloatingReaction({ emoji, id, left }) {
  return (
    <div
      key={id}
      className="absolute bottom-0 text-2xl pointer-events-none animate-float-up"
      style={{ left: `${left}%` }}
    >
      {emoji}
    </div>
  );
}

// ── Track search for host queue ───────────────────────────────────────────────
function TrackSearch({ artistId, onAdd, existingIds = [] }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from('tracks')
        .select('id, title, cover_artwork_url, duration')
        .eq('artist_id', artistId)
        .ilike('title', `%${query.trim()}%`)
        .limit(8);
      setResults((data || []).filter(t => !existingIds.includes(t.id)));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, artistId, existingIds]);

  const fmt = (s) => { const m = Math.floor(s/60); return `${m}:${String(Math.floor(s%60)).padStart(2,'0')}`; };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your tracks..."
          className="w-full pl-9 pr-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20"
        />
      </div>
      {searching && <div className="text-center py-2"><Loader className="w-4 h-4 animate-spin text-white/30 mx-auto" /></div>}
      {results.map(track => (
        <button key={track.id} onClick={() => { onAdd(track); setQuery(''); setResults([]); }}
          className="w-full flex items-center space-x-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition text-left">
          <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex-shrink-0 overflow-hidden">
            {track.cover_artwork_url
              ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
              : <Music className="w-4 h-4 text-white/20 m-auto" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{track.title}</p>
            {track.duration && <p className="text-xs text-white/30">{fmt(track.duration)}</p>}
          </div>
          <Plus className="w-4 h-4 text-white/40 flex-shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ── Chat message ──────────────────────────────────────────────────────────────
function ChatMessage({ msg }) {
  return (
    <div className="flex items-start space-x-2 px-4 py-1.5 group">
      <div className="w-6 h-6 rounded-full bg-white/[0.08] flex-shrink-0 overflow-hidden mt-0.5">
        {msg.avatar
          ? <img src={msg.avatar} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-[10px] text-white/40 font-bold">
              {(msg.name || '?')[0].toUpperCase()}
            </div>}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-semibold text-white/50 mr-1.5">{msg.name || 'Listener'}</span>
        <span className="text-[10px] text-white/20">{timeAgo(msg.created_at)}</span>
        <p className="text-sm text-white/80 mt-0.5 leading-snug break-words">{msg.content}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
// ── Track Review Submission Queue ────────────────────────────────────────────

// Listener: pick one of their own tracks to submit for review
function SubmitForReviewModal({ sessionId, user, onClose, onSubmitted }) {
  const [tracks, setTracks]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(null);
  const [error, setError]           = useState('');
  const [artistTier, setArtistTier] = useState('free');
  const [alreadyBoosted, setAlreadyBoosted] = useState(false);
  const [usePriority, setUsePriority] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      supabase.from('tracks')
        .select('id, title, cover_artwork_url, duration, artists(id, artist_name)')
        .eq('is_published', true)
        .eq('artists.user_id', user.id)
        .limit(30),
      supabase.from('artists')
        .select('tier')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('session_priority_boosts')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle(),
    ]).then(([tracksRes, artistRes, boostRes]) => {
      setTracks(tracksRes.data || []);
      setArtistTier(artistRes.data?.tier || 'free');
      setAlreadyBoosted(!!boostRes.data);
      setLoading(false);
    });
  }, [user?.id, sessionId]); // eslint-disable-line

  const submit = async (track) => {
    setSubmitting(true); setError('');
    try {
      const artistId = track.artists?.id;
      if (!artistId) throw new Error('Artist profile not found');

      const isPriority = usePriority && ['pro','premium'].includes(artistTier) && !alreadyBoosted;

      const { error: err } = await supabase.from('session_review_submissions').insert({
        session_id:  sessionId,
        user_id:     user.id,
        artist_id:   artistId,
        track_id:    track.id,
        is_priority: isPriority,
        boosted_at:  isPriority ? new Date().toISOString() : null,
      });
      if (err) {
        if (err.code === '23505') throw new Error('This track is already in the review queue');
        throw err;
      }

      // Record the boost usage so they can't do it again this session
      if (isPriority) {
        try {
          await supabase.from('session_priority_boosts').insert({
            session_id: sessionId,
            user_id:    user.id,
          });
        } catch {} // ignore if already exists
        setAlreadyBoosted(true);
      }

      setSubmitted(track);
      setTimeout(() => { onSubmitted(); onClose(); }, 1500);
    } catch (err) { setError(err.message); }
    setSubmitting(false);
  };

  const fmt = (s) => { if (!s) return ''; const m = Math.floor(s/60); return `${m}:${String(Math.floor(s%60)).padStart(2,'0')}`; };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-lg bg-neutral-900 rounded-t-3xl p-5 border-t border-white/[0.08] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1 flex-shrink-0">
          <h3 className="text-sm font-bold text-white">Submit for Review</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-white/30" /></button>
        </div>
        <p className="text-[11px] text-white/30 mb-4 flex-shrink-0">Pick one of your tracks — the host will see it in their review queue</p>

        {submitted ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">🎵</div>
              <p className="text-sm font-bold text-white mb-1">Submitted!</p>
              <p className="text-xs text-white/40">"{submitted.title}" is in the queue</p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader className="w-5 h-5 animate-spin text-white/30" />
          </div>
        ) : tracks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-4">
            <div>
              <Music className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-sm font-semibold text-white mb-1">No published tracks</p>
              <p className="text-xs text-white/30">Upload and publish a track first to submit for review</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {/* Priority boost toggle — Pro/Premium only */}
            {['pro','premium'].includes(artistTier) && (
              <div className={`flex items-center justify-between p-3 rounded-xl border mb-2 transition ${
                alreadyBoosted
                  ? 'bg-white/[0.02] border-white/[0.05] opacity-50'
                  : usePriority
                  ? 'bg-purple-500/15 border-purple-500/30'
                  : 'bg-white/[0.04] border-white/[0.06]'
              }`}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">
                    ⚡ Float to top of queue
                    {alreadyBoosted && <span className="text-white/30 font-normal ml-1">— used this session</span>}
                  </p>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {alreadyBoosted
                      ? 'One boost per session — yours was used'
                      : `${artistTier === 'premium' ? 'Premium' : 'Pro'} perk · one use per session`}
                  </p>
                </div>
                {!alreadyBoosted && (
                  <button onClick={() => setUsePriority(v => !v)}
                    className={`ml-3 w-10 h-6 rounded-full transition-colors flex-shrink-0 relative ${usePriority ? 'bg-purple-600' : 'bg-white/[0.12]'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${usePriority ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                )}
              </div>
            )}

            {tracks.map(track => (
              <button key={track.id} onClick={() => !submitting && submit(track)}
                disabled={submitting}
                className="w-full flex items-center space-x-3 p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.05] transition text-left active:scale-[0.98] disabled:opacity-50">
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex-shrink-0 overflow-hidden">
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <Music className="w-4 h-4 text-white/20 m-auto mt-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{track.title}</p>
                  {track.duration && <p className="text-[10px] text-white/30">{fmt(track.duration)}</p>}
                </div>
                <Plus className="w-4 h-4 text-white/30 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-red-400 mt-3 flex-shrink-0">{error}</p>}
      </div>
    </div>
  );
}

// Host: review queue panel
function ReviewQueuePanel({ sessionId, artistId, onReviewTrack }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('session_review_submissions')
      .select('*, tracks(id, title, cover_artwork_url, duration), artists(artist_name, slug, profile_image_url)')
      .eq('session_id', sessionId)
      .eq('status', 'pending')
      .order('is_priority', { ascending: false })   // priority first
      .order('boosted_at',  { ascending: true })     // earliest boost first among priority
      .order('submitted_at', { ascending: true });   // FIFO for everyone else
    setSubmissions(data || []);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    load();
    const sub = supabase.channel(`review-queue-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_review_submissions', filter: `session_id=eq.${sessionId}` }, load)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [sessionId, load]);

  const dismiss = async (id) => {
    await supabase.from('session_review_submissions').update({ status: 'dismissed' }).eq('id', id);
    setSubmissions(prev => prev.filter(s => s.id !== id));
  };

  const fmt = (s) => { if (!s) return ''; const m = Math.floor(s/60); return `${m}:${String(Math.floor(s%60)).padStart(2,'0')}`; };

  if (loading) return <div className="p-3 text-center"><Loader className="w-4 h-4 animate-spin text-white/30 mx-auto" /></div>;

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">
          Review Queue {submissions.length > 0 && <span className="ml-1 text-purple-400">({submissions.length})</span>}
        </p>
      </div>
      {submissions.length === 0 ? (
        <p className="text-xs text-white/20 text-center py-2">No submissions yet</p>
      ) : (
        submissions.map(sub => (
          <div key={sub.id} className="flex items-center space-x-2 p-2 rounded-xl bg-white/[0.04] border border-white/[0.05]">
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex-shrink-0 overflow-hidden">
              {sub.tracks?.cover_artwork_url
                ? <img src={sub.tracks.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                : <Music className="w-4 h-4 text-white/20 m-auto mt-2.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-1.5 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{sub.tracks?.title}</p>
                {sub.is_priority && (
                  <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/25">⚡</span>
                )}
              </div>
              <p className="text-[10px] text-white/30 truncate">
                {sub.artists?.artist_name}{sub.tracks?.duration ? ` · ${fmt(sub.tracks.duration)}` : ''}
              </p>
            </div>
            <button onClick={() => onReviewTrack(sub)}
              className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 text-[10px] font-bold hover:bg-purple-500/30 transition">
              Review
            </button>
            <button onClick={() => dismiss(sub.id)}
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/20 transition">
              <X className="w-3 h-3 text-white/20 hover:text-red-400" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}


// ── Session Poll components ───────────────────────────────────────────────────

const REVIEW_OPTIONS = [
  { id: 'fire',  text: '🔥 Fire',  emoji: '🔥' },
  { id: 'solid', text: '👍 Solid', emoji: '👍' },
  { id: 'mid',   text: '😐 Mid',   emoji: '😐' },
  { id: 'skip',  text: '❌ Skip',  emoji: '❌' },
];

function SessionPollCard({ poll, userId, onVote }) {
  const expired    = new Date(poll.expires_at) < new Date();
  const totalVotes = (poll.options || []).reduce((s, o) => s + (o.votes || 0), 0);
  const myVote     = poll.my_vote;
  const showResults = !!myVote || expired;
  const isReview   = poll.poll_type === 'track_review';

  return (
    <div className="mx-2 my-2 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      <div className="flex items-center space-x-1.5 mb-2">
        <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wide">
          {isReview ? 'Track Review' : 'Poll'}
        </span>
        <span className="text-[10px] text-white/20 ml-auto">
          {expired ? 'Ended' : 'Live'}
        </span>
      </div>

      {/* Track info for review polls */}
      {isReview && poll.track_title && (
        <div className="flex items-center space-x-2 mb-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
          <Music className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{poll.track_title}</p>
            {poll.track_artist && <p className="text-[10px] text-white/30 truncate">{poll.track_artist}</p>}
          </div>
        </div>
      )}

      <p className="text-sm font-medium text-white mb-3">{poll.question}</p>

      {/* Not logged in — gate */}
      {!userId ? (
        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
          <p className="text-xs font-semibold text-purple-300 mb-1">Sign in to vote</p>
          <p className="text-[10px] text-white/30">Create a free account to rate tracks and join the session</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(poll.options || []).map(opt => {
            const pct = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
            const isMyChoice = myVote === opt.id;
            return (
              <button key={opt.id} disabled={!!myVote || expired}
                onClick={() => !myVote && !expired && onVote(poll.id, opt.id)}
                className="w-full text-left relative overflow-hidden rounded-lg transition active:scale-[0.98]">
                <div className="relative z-10 flex items-center justify-between px-3 py-2.5">
                  <span className={`text-sm ${isMyChoice ? 'text-purple-300 font-semibold' : 'text-white/70'}`}>
                    {opt.text}
                  </span>
                  {showResults && <span className="text-xs font-bold text-white/50">{pct}%</span>}
                </div>
                {showResults && (
                  <div className="absolute inset-0 rounded-lg transition-all duration-500"
                    style={{ width: `${pct}%`, background: isMyChoice ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.04)' }} />
                )}
                {!showResults && <div className="absolute inset-0 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition" />}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-white/20 mt-2">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
    </div>
  );
}

function CreateReviewPollModal({ sessionId, artistId, onClose, onCreated }) {
  const [mode, setMode]             = useState('review'); // 'review' | 'custom'
  const [trackQuery, setTrackQuery] = useState('');
  const [trackResults, setResults]  = useState([]);
  const [selectedTrack, setTrack]   = useState(null);
  const [searching, setSearching]   = useState(false);
  const [customQ, setCustomQ]       = useState('');
  const [customOpts, setCustomOpts] = useState(['', '']);
  const [creating, setCreating]     = useState(false);
  const [error, setError]           = useState('');

  const searchTracks = async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    const { data } = await supabase.from('tracks')
      .select('id, title, artists(artist_name)')
      .eq('is_published', true)
      .ilike('title', `%${q}%`)
      .limit(8);
    setResults(data || []);
    setSearching(false);
  };

  const handleCreate = async () => {
    setCreating(true); setError('');
    try {
      if (mode === 'review') {
        if (!selectedTrack) throw new Error('Pick a track to review');
        const opts = REVIEW_OPTIONS.map(o => ({ ...o, votes: 0 }));
        const { error: err } = await supabase.from('session_polls').insert({
          session_id:   sessionId,
          artist_id:    artistId,
          poll_type:    'track_review',
          track_id:     selectedTrack.id,
          track_title:  selectedTrack.title,
          track_artist: selectedTrack.artists?.artist_name || '',
          question:     `What do you think of "${selectedTrack.title}"?`,
          options:      opts,
          expires_at:   new Date(Date.now() + 4 * 3600000).toISOString(),
        });
        if (err) throw err;
      } else {
        if (!customQ.trim()) throw new Error('Add a question');
        const valid = customOpts.filter(o => o.trim());
        if (valid.length < 2) throw new Error('Need at least 2 options');
        const opts = valid.map((text, i) => ({ id: String.fromCharCode(97 + i), text: text.trim(), votes: 0 }));
        const { error: err } = await supabase.from('session_polls').insert({
          session_id: sessionId,
          artist_id:  artistId,
          poll_type:  'custom',
          question:   customQ.trim(),
          options:    opts,
          expires_at: new Date(Date.now() + 4 * 3600000).toISOString(),
        });
        if (err) throw err;
      }
      onCreated(); onClose();
    } catch (err) { setError(err.message); }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-lg bg-neutral-900 rounded-t-3xl p-5 border-t border-white/[0.08] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Create Poll</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-white/30" /></button>
        </div>

        {/* Mode tabs */}
        <div className="flex space-x-1 p-1 rounded-xl bg-white/[0.04] mb-4">
          <button onClick={() => setMode('review')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${mode === 'review' ? 'bg-white text-black' : 'text-white/40'}`}>
            🎵 Track Review
          </button>
          <button onClick={() => setMode('custom')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${mode === 'custom' ? 'bg-white text-black' : 'text-white/40'}`}>
            ✏️ Custom Poll
          </button>
        </div>

        {mode === 'review' ? (
          <>
            <p className="text-[10px] text-white/30 uppercase tracking-wide mb-2">Search for a track</p>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
              <input value={trackQuery}
                onChange={e => { setTrackQuery(e.target.value); searchTracks(e.target.value); }}
                placeholder="Track title or artist..."
                className="w-full pl-9 pr-4 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20" />
              {searching && <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 animate-spin" />}
            </div>

            {trackResults.length > 0 && (
              <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                {trackResults.map(t => (
                  <button key={t.id} onClick={() => { setTrack(t); setResults([]); setTrackQuery(t.title); }}
                    className={`w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-left transition ${selectedTrack?.id === t.id ? 'bg-purple-500/20 border border-purple-500/30' : 'bg-white/[0.04] hover:bg-white/[0.07] border border-transparent'}`}>
                    <Music className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{t.title}</p>
                      <p className="text-[10px] text-white/30">{t.artists?.artist_name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedTrack && (
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 mb-3">
                <p className="text-[10px] text-purple-400 uppercase tracking-wide mb-0.5">Reviewing</p>
                <p className="text-sm font-bold text-white">{selectedTrack.title}</p>
                <p className="text-[10px] text-white/40">{selectedTrack.artists?.artist_name}</p>
              </div>
            )}

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] mb-4">
              <p className="text-[10px] text-white/30 mb-2">Fans will vote with:</p>
              <div className="flex space-x-2">
                {REVIEW_OPTIONS.map(o => (
                  <span key={o.id} className="flex-1 text-center py-1.5 rounded-lg bg-white/[0.05] text-xs text-white/60">
                    {o.text}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <input value={customQ} onChange={e => setCustomQ(e.target.value)}
              placeholder="Ask your fans something..."
              className="w-full bg-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none mb-3 border border-white/[0.06] focus:border-white/20" />
            <div className="space-y-2 mb-3">
              {customOpts.map((opt, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <input value={opt} onChange={e => setCustomOpts(p => p.map((o, idx) => idx === i ? e.target.value : o))}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 bg-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none" />
                  {customOpts.length > 2 && (
                    <button onClick={() => setCustomOpts(p => p.filter((_, idx) => idx !== i))}>
                      <X className="w-4 h-4 text-white/20 hover:text-red-400 transition" />
                    </button>
                  )}
                </div>
              ))}
              {customOpts.length < 6 && (
                <button onClick={() => setCustomOpts(p => [...p, ''])}
                  className="text-xs text-white/30 hover:text-white/50 flex items-center space-x-1 transition">
                  <Plus className="w-3.5 h-3.5" /><span>Add option</span>
                </button>
              )}
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <button onClick={handleCreate} disabled={creating}
          className="w-full py-3 bg-purple-600 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition flex items-center justify-center space-x-2">
          {creating ? <Loader className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
          <span>{creating ? 'Creating...' : 'Launch Poll'}</span>
        </button>
      </div>
    </div>
  );
}


export default function ListeningSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, artist } = useAuth();

  const [session, setSession]         = useState(null);
  const [queue, setQueue]             = useState([]);
  const [messages, setMessages]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [chatInput, setChatInput]     = useState('');
  const [sending, setSending]         = useState(false);
  const [reactions, setReactions]     = useState([]);
  const [showQueue, setShowQueue]     = useState(false);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [listenerCount, setListenerCount] = useState(0);
  const [audioLocked, setAudioLocked]     = useState(false);
  const [listeners, setListeners]         = useState([]); // who's watching
  const [showListeners, setShowListeners] = useState(false);

  const audioRef      = useRef(new Audio());
  const sessionSubRef = useRef(null);
  const chatEndRef    = useRef(null);
  const syncTimerRef  = useRef(null);
  const reactionIdRef      = useRef(0);
  const reactionChannelRef = useRef(null);
  // Keep a ref to queue so syncAudio never closes over a stale copy
  const queueRef      = useRef([]);

  const isHost = artist && session?.artist_id === artist.id;
  const [polls, setPolls]           = useState([]);
  const [showPollModal, setShowPollModal]   = useState(false);
  const [myVotes, setMyVotes]               = useState({});
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showReviewQueue, setShowReviewQueue] = useState(false);

  // Mirror queue state into a ref so syncAudio always has the latest data
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // ── Load session ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    loadPolls();
    loadSession();
    loadMessages();

    // Track listener count
    const channel = supabase.channel(`session-presence-${sessionId}`, {
      config: { presence: { key: user?.id || 'anon' } }
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const all = Object.values(state).flat();
        setListenerCount(all.length);
        setListeners(all);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track with display info for the who's watching panel
          const { data: myProfile } = await supabase
            .from('artists').select('artist_name, profile_image_url, slug').eq('user_id', user?.id || '').maybeSingle();
          const { data: myListener } = !myProfile
            ? await supabase.from('listeners').select('display_name').eq('user_id', user?.id || '').maybeSingle()
            : { data: null };
          await channel.track({
            user_id:  user?.id || 'anon',
            name:     myProfile?.artist_name || myListener?.display_name || 'Listener',
            avatar:   myProfile?.profile_image_url || null,
            slug:     myProfile?.slug || null,
            joined_at: new Date().toISOString(),
          });
        }
      });

    // Realtime session state changes
    const sessionSub = supabase.channel(`session-state-${sessionId}`);
    sessionSubRef.current = sessionSub;
    sessionSub
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'listening_sessions',
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        setSession(prev => ({ ...prev, ...payload.new }));
        // Use !artist (not !isHost) — isHost closes over stale session state
        // during the initial render before session loads
        if (!artist && payload.new.mode === 'audio') {
          syncAudio(payload.new);
        }
        if (payload.new.status === 'ended') {
          navigate('/');
        }
      })
      .subscribe();

    // Periodic re-sync every 10s for listeners — prevents gradual drift
    if (!artist) {
      syncTimerRef.current = setInterval(async () => {
        const { data: latest } = await supabase
          .from('listening_sessions')
          .select('is_playing, playback_pos, started_at, current_track_id, mode')
          .eq('id', sessionId)
          .maybeSingle();
        if (latest?.mode === 'audio') syncAudio(latest);
      }, 10000);
    }

    // Realtime reactions — shared broadcast channel everyone subscribes to
    const reactionSub = supabase.channel(`session-reactions-${sessionId}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        if (!payload?.emoji) return;
        const id   = ++reactionIdRef.current;
        const left = 10 + Math.random() * 80;
        setReactions(prev => [...prev, { emoji: payload.emoji, id, left }]);
        setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2000);
      })
      .subscribe();
    reactionChannelRef.current = reactionSub;

    // Realtime chat
    // Poll subscription
    const pollSub = supabase.channel(`session-polls-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_polls', filter: `session_id=eq.${sessionId}` },
        () => loadPolls())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_poll_votes' },
        (payload) => {
          // Increment vote count locally for immediate feedback
          const { poll_id, option_id } = payload.new;
          setPolls(prev => prev.map(p => p.id === poll_id
            ? { ...p, options: p.options.map(o => o.id === option_id ? { ...o, votes: (o.votes || 0) + 1 } : o) }
            : p
          ));
        })
      .subscribe();

    const chatSub = supabase.channel(`session-chat-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'session_messages',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(pollSub);
      supabase.removeChannel(sessionSub);
      supabase.removeChannel(chatSub);
      if (reactionChannelRef.current) supabase.removeChannel(reactionChannelRef.current);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      audioRef.current.pause();
    };
  }, [sessionId, user?.id]);

  const loadPolls = useCallback(async () => {
    if (!sessionId) return;
    const { data } = await supabase.from('session_polls')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    if (!data) return;

    // Fetch my votes if logged in
    if (user?.id) {
      const pollIds = data.map(p => p.id);
      const { data: votes } = await supabase.from('session_poll_votes')
        .select('poll_id, option_id')
        .eq('user_id', user.id)
        .in('poll_id', pollIds);
      const voteMap = {};
      (votes || []).forEach(v => { voteMap[v.poll_id] = v.option_id; });
      setMyVotes(voteMap);
      setPolls(data.map(p => ({ ...p, my_vote: voteMap[p.id] || null })));
    } else {
      setPolls(data);
    }
  }, [sessionId, user?.id]); // eslint-disable-line

  const castVote = async (pollId, optionId) => {
    if (!user?.id) return;
    const { error } = await supabase.from('session_poll_votes')
      .insert({ poll_id: pollId, user_id: user.id, option_id: optionId });
    if (!error) {
      setMyVotes(prev => ({ ...prev, [pollId]: optionId }));
      setPolls(prev => prev.map(p => p.id === pollId
        ? { ...p, my_vote: optionId, options: p.options.map(o => o.id === optionId ? { ...o, votes: (o.votes || 0) + 1 } : o) }
        : p
      ));
    }
  };



  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSession = async () => {
    const { data: s } = await supabase
      .from('listening_sessions').select('*, artists(id, artist_name, slug, profile_image_url, paypal_email)')
      .eq('id', sessionId).maybeSingle();
    if (!s || s.status === 'ended') { navigate('/'); return; }
    setSession(s);

    const { data: q } = await supabase
      .from('listening_session_queue')
      .select('*, tracks(id, title, cover_artwork_url, file_url, duration)')
      .eq('session_id', sessionId).order('position');
    const loadedQueue = q || [];
    setQueue(loadedQueue);
    queueRef.current = loadedQueue; // update ref immediately so syncAudio can use it
    setLoading(false);

    // If host session has queued tracks but no current track set, auto-select the first one
    let activeSession = s;
    if (artist && loadedQueue.length > 0 && !s.current_track_id) {
      const firstTrackId = loadedQueue[0].track_id;
      await supabase
        .from('listening_sessions')
        .update({ current_track_id: firstTrackId, playback_pos: 0 })
        .eq('id', sessionId);
      activeSession = { ...s, current_track_id: firstTrackId, playback_pos: 0 };
      setSession(activeSession);
    }

    // Sync audio for listeners using the freshly-loaded queue (not stale state)
    if (!artist && activeSession.mode === 'audio') syncAudio(activeSession, loadedQueue);
  };

  const loadMessages = async () => {
    const { data } = await supabase
      .from('session_messages').select('*')
      .eq('session_id', sessionId).order('created_at').limit(100);
    setMessages(data || []);
  };

  // ── Audio sync for listeners ────────────────────────────────────────────────
  // acceptss an optional `queueOverride` for the initial load call where
  // React state hasn't updated yet but we have the data in hand.
  const syncAudio = useCallback((s, queueOverride) => {
    if (!s.current_track_id) return;
    const q = queueOverride ?? queueRef.current;
    const track = q.find(item => item.track_id === s.current_track_id)?.tracks;
    if (!track?.file_url) return;

    const audio = audioRef.current;
    if (audio.src !== track.file_url) {
      audio.src = track.file_url;
    }

    // Compute expected playback position with sub-second precision
    // Use server started_at + client elapsed to account for network latency
    const elapsed = s.is_playing
      ? (Date.now() - new Date(s.started_at).getTime()) / 1000
      : 0;
    const expectedPos = parseFloat(s.playback_pos || 0) + elapsed;
    const drift = Math.abs(audio.currentTime - expectedPos);
    // Snap if drift > 0.5s (tight), nudge if drift > 0.1s (smooth)
    if (drift > 0.5) {
      audio.currentTime = Math.max(0, expectedPos);
    } else if (drift > 0.1) {
      // Gentle nudge — speed up/slow down by 2% to close the gap
      audio.playbackRate = drift > 0 ? 1.02 : 0.98;
      setTimeout(() => { if (audio) audio.playbackRate = 1.0; }, 2000);
    }

    if (s.is_playing && audio.paused)  audio.play().catch(() => { setAudioLocked(true); });
    if (!s.is_playing && !audio.paused) audio.pause();
  }, []); // no deps needed — reads live data via refs

  // ── Host controls ───────────────────────────────────────────────────────────
  const updateSession = async (updates) => {
    await supabase.from('listening_sessions').update(updates).eq('id', sessionId);
    setSession(prev => ({ ...prev, ...updates }));
  };

  const hostPlay = async () => {
    const currentTrack = queue.find(q => q.track_id === session.current_track_id)?.tracks;
    if (!currentTrack?.file_url) return;
    // Always ensure src is set — may have been lost on re-mount
    if (audioRef.current.src !== currentTrack.file_url) {
      audioRef.current.src = currentTrack.file_url;
    }
    await updateSession({ is_playing: true, started_at: new Date().toISOString() });
    audioRef.current.play().catch(() => {});
  };

  const hostPause = async () => {
    const pos = audioRef.current.currentTime;
    await updateSession({ is_playing: false, playback_pos: pos });
    audioRef.current.pause();
  };

  const hostSkip = async () => {
    const currentIdx = queue.findIndex(q => q.track_id === session.current_track_id);
    const next = queue[currentIdx + 1];
    if (!next) return;
    audioRef.current.src = next.tracks?.file_url || '';
    await updateSession({ current_track_id: next.track_id, playback_pos: 0, is_playing: true, started_at: new Date().toISOString() });
    audioRef.current.play().catch(() => {});
  };

  const addToQueue = async (track) => {
    const position = queue.length;
    const { data } = await supabase.from('listening_session_queue').insert({
      session_id: sessionId, track_id: track.id, position,
    }).select('*, tracks(id, title, cover_artwork_url, file_url, duration)').single();
    if (data) {
      setQueue(prev => [...prev, data]);
      if (!session.current_track_id) {
        audioRef.current.src = track.file_url || '';
        await updateSession({ current_track_id: track.id, playback_pos: 0 });
      }
    }
  };

  const removeFromQueue = async (queueItem) => {
    // Don't allow removing the currently playing track
    if (queueItem.track_id === session.current_track_id) return;
    await supabase.from('listening_session_queue').delete().eq('id', queueItem.id);
    setQueue(prev => prev.filter(q => q.id !== queueItem.id));
    queueRef.current = queueRef.current.filter(q => q.id !== queueItem.id);
  };

  const setYouTube = async () => {
    const ytId = extractYouTubeId(youtubeInput);
    if (!ytId) return;
    await updateSession({ mode: 'youtube', youtube_url: youtubeInput });
    setYoutubeInput('');
  };

  const endSession = async () => {
    if (!window.confirm('End this listening session?')) return;
    // Unsubscribe from realtime FIRST to prevent the UPDATE trigger
    // firing back into this component and causing a 409 conflict race
    if (sessionSubRef.current) {
      supabase.removeChannel(sessionSubRef.current);
      sessionSubRef.current = null;
    }
    audioRef.current.pause();
    await supabase.from('listening_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId);
    navigate('/dashboard');
  };

  // ── Chat ────────────────────────────────────────────────────────────────────
  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || !user || sending) return;
    setSending(true);
    const { data: profile } = await supabase.from('artists').select('artist_name, profile_image_url').eq('user_id', user.id).maybeSingle();
    const { data: listener } = !profile ? await supabase.from('listeners').select('display_name').eq('user_id', user.id).maybeSingle() : { data: null };
    await supabase.from('session_messages').insert({
      session_id: sessionId,
      user_id: user.id,
      content: chatInput.trim(),
      name: profile?.artist_name || listener?.display_name || 'Listener',
      avatar: profile?.profile_image_url || null,
    });
    setChatInput('');
    setSending(false);
  };

  const sendReaction = (emoji) => {
    const id   = ++reactionIdRef.current;
    const left = 10 + Math.random() * 80;
    setReactions(prev => [...prev, { emoji, id, left }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2000);
    // Broadcast to all participants via dedicated reaction channel
    if (reactionChannelRef.current) {
      reactionChannelRef.current.send({
        type: 'broadcast', event: 'reaction', payload: { emoji },
      }).catch(() => {});
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader className="w-6 h-6 animate-spin text-white/30" />
    </div>
  );

  if (!session) return null;

  const currentTrack = queue.find(q => q.track_id === session.current_track_id)?.tracks;
  const ytId = extractYouTubeId(session.youtube_url || '');

  return (
    <div className="min-h-screen bg-black text-white flex flex-col" style={{ maxHeight: '100dvh' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 flex-shrink-0 border-b border-white/[0.06]">
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ChevronDown className="w-5 h-5 text-white" />
        </button>
        <div className="text-center">
          <div className="flex items-center space-x-1.5 justify-center">
            {session.status === 'scheduled' ? (
              <><div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-xs font-semibold text-yellow-400">SCHEDULED</span></>
            ) : (
              <><div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-semibold text-white">LIVE</span></>
            )}
          </div>
          <p className="text-xs text-white/40 truncate max-w-[180px]">{session.title}</p>
        </div>
        <button
          onClick={() => setShowListeners(v => !v)}
          className="flex items-center space-x-1 text-white/40 hover:text-white/60 transition px-2 py-1 rounded-lg hover:bg-white/[0.06]">
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">{listenerCount}</span>
        </button>
      </div>

      {/* Who's watching panel */}
      {showListeners && listeners.length > 0 && (
        <div className="flex-shrink-0 px-4 py-3 border-b border-white/[0.05] bg-white/[0.02]">
          <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-2">Watching now</p>
          <div className="flex items-center space-x-2 overflow-x-auto pb-1">
            {listeners.map((l, i) => (
              <div key={l.user_id || i} className="flex flex-col items-center space-y-1 flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-white/[0.08] overflow-hidden border border-white/[0.1]">
                  {l.avatar
                    ? <img src={l.avatar} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white/40">
                        {(l.name || '?')[0].toUpperCase()}
                      </div>}
                </div>
                <p className="text-[9px] text-white/30 truncate max-w-[48px]">{l.name || 'Guest'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Player / YouTube embed */}
        <div className="flex-shrink-0 px-4 py-4 relative">
          {!isHost && audioLocked && session.mode === 'audio' && (
            <button
              onClick={() => {
                audioRef.current.play().catch(() => {});
                setAudioLocked(false);
              }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm rounded-2xl z-10 space-y-2"
            >
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
                <Play className="w-5 h-5 text-black ml-0.5" />
              </div>
              <span className="text-xs text-white/60">Tap to start audio</span>
            </button>
          )}
          {session.mode === 'youtube' && ytId ? (
            <div className="rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: '16/9' }}>
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&rel=0&playsinline=1`}
                className="w-full h-full"
                allowFullScreen
                allow="autoplay; encrypted-media; picture-in-picture"
                title="Live Stream"
              />
            </div>
          ) : (
            <div className="flex items-center space-x-4 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0">
                {currentTrack?.cover_artwork_url
                  ? <img src={currentTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                  : <Music className="w-6 h-6 text-white/20 m-auto mt-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{currentTrack?.title || 'Nothing playing'}</p>
                <p className="text-xs text-white/40 mt-0.5">{session.artists?.artist_name}</p>
              </div>
              {isHost && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={session.is_playing ? hostPause : hostPlay}
                    disabled={!currentTrack}
                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center disabled:opacity-30 hover:bg-white/90 transition"
                  >
                    {session.is_playing
                      ? <Pause className="w-5 h-5 text-black" />
                      : <Play className="w-5 h-5 text-black ml-0.5" />}
                  </button>
                  <button onClick={hostSkip} disabled={!currentTrack} className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center disabled:opacity-30 hover:bg-white/[0.12] transition">
                    <SkipForward className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}
              {!isHost && (
                <div className="flex items-center space-x-1">
                  {session.is_playing
                    ? <div className="flex space-x-0.5 items-end h-5">
                        {[3,5,4,6,3].map((h,i) => <div key={i} className="w-1 rounded-full bg-green-400 animate-pulse" style={{ height: h*3, animationDelay: `${i*100}ms` }} />)}
                      </div>
                    : <Pause className="w-4 h-4 text-white/30" />}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Host controls */}
        {isHost && (
          <div className="px-4 pb-3 flex-shrink-0 space-y-3">
            {/* Mode toggle + YouTube input */}
            <div className="flex space-x-2">
              <button
                onClick={() => updateSession({ mode: 'audio' })}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${session.mode === 'audio' ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'}`}
              >
                <Music className="w-3.5 h-3.5" /><span>Audio</span>
              </button>
              <button
                onClick={() => updateSession({ mode: 'youtube' })}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${session.mode === 'youtube' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.08]'}`}
              >
                <Youtube className="w-3.5 h-3.5" /><span>YouTube Live</span>
              </button>
              <button onClick={async () => {
                  // Export chat as JSON for replay/archive
                  const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement('a');
                  a.href = url;
                  a.download = `session-chat-${sessionId.slice(0,8)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs text-white/40 bg-white/[0.04] hover:bg-white/[0.08] transition"
                title="Export chat log">
                <Send className="w-3.5 h-3.5 rotate-45" /><span>Save chat</span>
              </button>
              <button onClick={endSession} className="ml-auto flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition">
                <X className="w-3.5 h-3.5" /><span>End</span>
              </button>
            </div>

            {session.mode === 'youtube' && (
              <div className="flex space-x-2">
                <input
                  value={youtubeInput}
                  onChange={e => setYoutubeInput(e.target.value)}
                  placeholder="Paste YouTube live URL..."
                  className="flex-1 px-3 py-2 bg-white/[0.06] border border-white/[0.08] rounded-xl text-xs text-white placeholder-white/25 focus:outline-none focus:border-red-500/40"
                />
                <button onClick={setYouTube} disabled={!youtubeInput.trim()} className="px-3 py-2 rounded-xl bg-red-500/20 text-red-400 text-xs font-medium disabled:opacity-40 hover:bg-red-500/30 transition">
                  Set
                </button>
              </div>
            )}

            {session.mode === 'audio' && (
              <button onClick={() => setShowQueue(v => !v)} className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-white/50 hover:bg-white/[0.07] transition">
                <span>Manage Queue ({queue.length} tracks)</span>
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="flex space-x-2">
              <button onClick={() => setShowPollModal(true)}
                className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 hover:bg-purple-500/15 transition">
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Create Poll</span>
              </button>
              <button onClick={() => setShowReviewQueue(v => !v)}
                className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-xs text-white/50 hover:bg-white/[0.09] transition">
                <Music className="w-3.5 h-3.5" />
                <span>Review Queue</span>
              </button>
            </div>

            {showReviewQueue && (
              <ReviewQueuePanel
                sessionId={sessionId}
                artistId={artist?.id}
                onReviewTrack={(sub) => {
                  // Pre-populate the poll modal with this track
                  setShowPollModal(true);
                  setShowReviewQueue(false);
                  // Mark as reviewing
                  supabase.from('session_review_submissions')
                    .update({ status: 'reviewing' }).eq('id', sub.id).then(() => {});
                }}
              />
            )}

            {showQueue && session.mode === 'audio' && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-3">
                <TrackSearch artistId={artist.id} onAdd={addToQueue} existingIds={queue.map(q => q.track_id)} />
                {queue.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-white/[0.05]">
                    <p className="text-[10px] text-white/25 uppercase tracking-wider font-semibold mb-2">Queue</p>
                    {queue.map((q, i) => (
                      <div key={q.id} className={`flex items-center space-x-2 p-2 rounded-lg ${q.track_id === session.current_track_id ? 'bg-white/[0.08]' : ''}`}>
                        <span className="text-xs text-white/20 w-4">{i + 1}</span>
                        <p className="text-xs text-white truncate flex-1">{q.tracks?.title}</p>
                        {q.track_id === session.current_track_id
                          ? <span className="text-[10px] text-green-400">playing</span>
                          : <div className="flex items-center space-x-1 flex-shrink-0">
                              {i > 0 && q.track_id !== session.current_track_id && (
                                <button onClick={async () => {
                                  // Swap positions with item above
                                  const updated = [...queue];
                                  [updated[i-1], updated[i]] = [updated[i], updated[i-1]];
                                  setQueue(updated);
                                  await supabase.from('listening_session_queue').update({ position: i-1 }).eq('id', q.id);
                                  await supabase.from('listening_session_queue').update({ position: i }).eq('id', updated[i].id);
                                }} className="w-5 h-5 flex items-center justify-center rounded text-white/20 hover:text-white/60 hover:bg-white/[0.08] transition text-xs">↑</button>
                              )}
                              <button onClick={() => removeFromQueue(q)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 transition">
                                <Trash2 className="w-3 h-3 text-red-400/50 hover:text-red-400" />
                              </button>
                            </div>
                        }
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Reactions overlay — absolute so it floats over chat without stealing layout space */}
        <div className="pointer-events-none" style={{ position: 'relative', height: 0 }}>
          <div className="absolute bottom-0 left-4 right-4 pointer-events-none" style={{ height: '120px' }}>
            {reactions.map(r => <FloatingReaction key={r.id} emoji={r.emoji} id={r.id} left={r.left} />)}
          </div>
        </div>

        {/* Active polls */}
        {polls.length > 0 && (
          <div className="flex-shrink-0 max-h-52 overflow-y-auto border-b border-white/[0.05]">
            {polls.map(poll => (
              <SessionPollCard key={poll.id} poll={poll} userId={user?.id} onVote={castVote} />
            ))}
          </div>
        )}

        {/* Chat */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="py-2">
            {messages.map((msg, i) => <ChatMessage key={msg.id || i} msg={msg} />)}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Reaction bar + chat input */}
        <div className="flex-shrink-0 px-4 pb-safe pb-4 pt-2 border-t border-white/[0.06] space-y-2">
          {/* Submit for Review button — listeners only */}
          {!isHost && user && (
            <button onClick={() => setShowSubmitModal(true)}
              className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 font-semibold hover:bg-purple-500/15 transition mb-2">
              <Music className="w-3.5 h-3.5" />
              <span>Submit Track for Review</span>
            </button>
          )}
          {!isHost && !user && (
            <div className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-white/30 mb-2">
              <Music className="w-3.5 h-3.5" />
              <span>Sign in to submit your track for review</span>
            </div>
          )}

          <div className="flex items-center space-x-2">
            {REACTIONS.map(emoji => (
              <button key={emoji} onClick={() => sendReaction(emoji)}
                className="flex-1 py-1.5 text-xl rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-90 transition">
                {emoji}
              </button>
            ))}
            {!isHost && session?.artists?.paypal_email && (
              <TipButton artist={session.artists} />
            )}
          </div>
          {user && (
            <form onSubmit={sendMessage} className="flex space-x-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Say something..."
                maxLength={200}
                className="flex-1 px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20"
              />
              <button type="submit" disabled={!chatInput.trim() || sending}
                className="w-10 h-10 rounded-xl bg-white/[0.08] flex items-center justify-center disabled:opacity-30 hover:bg-white/[0.12] transition flex-shrink-0">
                <Send className="w-4 h-4 text-white" />
              </button>
            </form>
          )}
        </div>
      </div>

      {showPollModal && (
        <CreateReviewPollModal
          sessionId={sessionId}
          artistId={artist?.id}
          onClose={() => setShowPollModal(false)}
          onCreated={() => { setShowPollModal(false); loadPolls(); }}
        />
      )}

      {showSubmitModal && (
        <SubmitForReviewModal
          sessionId={sessionId}
          user={user}
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={() => setShowSubmitModal(false)}
        />
      )}

      <style>{`
        @keyframes float-up {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-80px) scale(1.4); opacity: 0; }
        }
        .animate-float-up { animation: float-up 2s ease-out forwards; }
      `}</style>
    </div>
  );
}