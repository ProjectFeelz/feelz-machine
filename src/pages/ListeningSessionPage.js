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
import useGoBack from '../hooks/useGoBack';
import TipButton from '../components/TipButton';
import LiveStage from '../components/LiveStage';
import { supabase } from '../supabaseClient';
import { resolveStreamSrc, resolveStreamLater, playableFallback } from '../utils/streamUrl';
import { assignPlaybackSrc } from '../utils/offlineStore';
import { useAuth } from '../contexts/AuthContext';
import {
  Play, Pause, SkipForward, X, Users, Music, Radio,
  Plus, Search, Loader, Send, Gift,
  ChevronDown, Star, Trash2, BarChart2
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
// Every name gets its own colour, worked out from the name so it stays the
// same for that person all stream.
const NAME_COLOURS = ['#f472b6', '#a78bfa', '#67e8f9', '#fbbf24', '#86efac', '#fb923c', '#f9a8d4', '#93c5fd'];
function nameColour(name) {
  const n = String(name || '?');
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return NAME_COLOURS[h % NAME_COLOURS.length];
}

function ChatMessage({ msg, hostUserId }) {
  const colour = nameColour(msg.name);
  const isHostMsg = hostUserId && msg.user_id === hostUserId;

  if (msg.is_tip) {
    return (
      <div className="mx-3 my-1.5 p-3 rounded-2xl bg-gradient-to-r from-amber-400/20 via-pink-500/15 to-violet-500/20 border border-amber-300/30">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-amber-400 text-black text-[11px] font-black">
            ${Number(msg.tip_amount || 0).toFixed(Number(msg.tip_amount) % 1 ? 2 : 0)} TIP
          </span>
          <span className="text-xs font-black truncate" style={{ color: colour }}>{msg.name || 'Listener'}</span>
        </div>
        {msg.content && <p className="text-sm text-white mt-1.5 leading-snug break-words">{msg.content}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 px-4 py-1.5">
      <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden mt-0.5" style={{ background: colour }}>
        {msg.avatar
          ? <img src={msg.avatar} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-[11px] text-black/70 font-black">
              {(msg.name || '?')[0].toUpperCase()}
            </div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug break-words">
          <span className="font-black mr-1.5" style={{ color: colour }}>{msg.name || 'Listener'}</span>
          {isHostMsg && <span className="mr-1.5 px-1.5 py-px rounded bg-gradient-to-r from-pink-500 to-violet-500 text-[9px] font-black tracking-wider align-middle">HOST</span>}
          <span className="text-white/85">{msg.content}</span>
        </p>
        <span className="text-[10px] text-white/25">{timeAgo(msg.created_at)}</span>
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
  // Back that works on a cold deep link. navigate(-1) does nothing when
  // this page IS the first history entry, which is every shared link and
  // every tapped push notification. See src/hooks/useGoBack.js.
  const goBack = useGoBack('/browse');
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
      .from('listening_sessions').select('*, artists(id, user_id, artist_name, slug, profile_image_url, paypal_email)')
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
    // Compared by track id, not by URL.
    //
    // This used to be `audio.src !== track.file_url`, which stops being a
    // stable comparison the moment the src is a short lived signed URL: the
    // strings never match, so every sync tick would reassign the source and
    // restart the song under everybody in the room. The id is the thing that
    // actually identifies what is loaded.
    if (audio.dataset.feelzTrackId !== String(track.id)) {
      audio.dataset.feelzTrackId = String(track.id);
      // Was `audio.src = track.file_url`, the one assignment on this page that
      // never went near the signing path. With feelz-samples private that is a
      // URL which no longer resolves, so it goes through the same resolver as
      // every other play path.
      assignPlaybackSrc(audio, track).then(() => resolveStreamLater(audio, track));
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
    // Always ensure src is set — may have been lost on re-mount.
    // Compared by id for the same reason as syncAudio above.
    if (audioRef.current.dataset.feelzTrackId !== String(currentTrack.id)) {
      audioRef.current.dataset.feelzTrackId = String(currentTrack.id);
      // playableFallback and not file_url: the bucket is private, so a stored
      // public-object URL answers 400, and assigning one would error and look
      // like the session had died. See src/utils/streamUrl.js.
      const src = (await resolveStreamSrc(currentTrack)) || playableFallback(currentTrack.file_url);
      if (!src) {
        console.warn('[session] no playable URL for track', currentTrack.id, '- not starting playback.');
        return;
      }
      audioRef.current.src = src;
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
    audioRef.current.dataset.feelzTrackId = String(next.tracks?.id || '');
    audioRef.current.src = (next.tracks ? await resolveStreamSrc(next.tracks) : null)
                        || playableFallback(next.tracks?.file_url)
                        || '';
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
        audioRef.current.dataset.feelzTrackId = String(track.id);
        audioRef.current.src = (await resolveStreamSrc(track))
                            || playableFallback(track.file_url)
                            || '';
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
  const [tipChatAmount, setTipChatAmount] = useState('');
  const [showTipChat,   setShowTipChat]   = useState(false);

  const sendMessage = async (e, isTip = false, tipAmt = null) => {
    e?.preventDefault();
    if (!isTip && !chatInput.trim()) return;
    if (!user || sending) return;
    setSending(true);
    const { data: profile } = await supabase.from('artists').select('artist_name, profile_image_url').eq('user_id', user.id).maybeSingle();
    const { data: listener } = !profile ? await supabase.from('listeners').select('display_name').eq('user_id', user.id).maybeSingle() : { data: null };
    await supabase.from('session_messages').insert({
      session_id: sessionId,
      user_id:    user.id,
      content:    chatInput.trim(),
      name:       profile?.artist_name || listener?.display_name || 'Listener',
      avatar:     profile?.profile_image_url || null,
      is_tip:     isTip,
      tip_amount: tipAmt,
    });
    setChatInput('');
    setShowTipChat(false);
    setTipChatAmount('');
    setSending(false);
  };

  // Called after PayPal tip completes — inject a tip message into chat
  const onTipSent = async (amount) => {
    const { data: profile } = await supabase.from('artists').select('artist_name, profile_image_url').eq('user_id', user.id).maybeSingle();
    const { data: listener } = !profile ? await supabase.from('listeners').select('display_name').eq('user_id', user.id).maybeSingle() : { data: null };
    await supabase.from('session_messages').insert({
      session_id: sessionId,
      user_id:    user.id,
      content:    chatInput.trim() || '',
      name:       profile?.artist_name || listener?.display_name || 'Listener',
      avatar:     profile?.profile_image_url || null,
      is_tip:     true,
      tip_amount: parseFloat(amount) || 0,
    });
    setChatInput('');
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
  const host = session.artists || {};
  const isScheduled = session.status === 'scheduled';
  const isEnded = session.status === 'ended';
  const floating = reactions.map(r => <FloatingReaction key={r.id} emoji={r.emoji} id={r.id} left={r.left} />);

  // The strip across the top of the stage: who is live and how many watch.
  const stageTopBar = (
    <div className="flex items-center gap-2">
      <button onClick={() => goBack()} aria-label="Back"
        className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur hover:bg-black/60 transition">
        <ChevronDown className="w-5 h-5 text-white" />
      </button>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="relative w-8 h-8 flex-shrink-0">
          <div className="absolute inset-0 rounded-full fm-host-ring" />
          <div className="absolute inset-[2px] rounded-full bg-black overflow-hidden">
            {host.profile_image_url
              ? <img src={host.profile_image_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-[11px] font-bold">{(host.artist_name || '?')[0]}</div>}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-white truncate leading-tight">{host.artist_name || 'Live'}</p>
          <p className="text-[11px] text-white/60 truncate leading-tight">{session.title}</p>
        </div>
      </div>
      {isScheduled ? (
        <span className="px-2 py-1 rounded-md bg-amber-400 text-black text-[10px] font-black tracking-wider">SOON</span>
      ) : isEnded ? (
        <span className="px-2 py-1 rounded-md bg-white/20 text-white text-[10px] font-black tracking-wider">ENDED</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-black tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
        </span>
      )}
      <button onClick={() => setShowListeners(v => !v)}
        className="pointer-events-auto inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/40 backdrop-blur text-white text-[11px] font-bold">
        <Users className="w-3.5 h-3.5" /> {listenerCount}
      </button>
    </div>
  );

  return (
    <div className="fm-live min-h-[100dvh] lg:h-[100dvh] bg-[#07060b] text-white flex flex-col lg:overflow-hidden" style={{ maxHeight: '100dvh' }}>
      {/* Neon glow behind everything */}
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-24 w-80 h-80 rounded-full bg-fuchsia-600/25 blur-[100px]" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute -bottom-24 left-1/4 w-72 h-72 rounded-full bg-cyan-500/10 blur-[100px]" />
      </div>

      <div className="relative z-10 flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5 lg:p-5 lg:max-w-[1500px] lg:mx-auto lg:w-full">

        {/* ── Left: the stage and the host's tools ───────────────────────── */}
        <div className="flex-shrink-0 lg:min-h-0 lg:overflow-y-auto no-scrollbar">
          <div className="relative pt-safe lg:pt-0">
            <div className="fm-stage-glow lg:rounded-3xl overflow-hidden">
              {session.mode === 'youtube' && ytId ? (
                <LiveStage
                  videoId={ytId}
                  title={session.title}
                  hostName={host.artist_name}
                  hostImage={host.profile_image_url}
                  isHost={isHost}
                  overlay={floating}
                  topBar={stageTopBar}
                />
              ) : (
                /* Audio sessions and streams that have not started yet */
                <div className="relative aspect-video overflow-hidden bg-black">
                  {(currentTrack?.cover_artwork_url || host.profile_image_url) && (
                    <img src={currentTrack?.cover_artwork_url || host.profile_image_url} alt=""
                      className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />

                  {!isHost && audioLocked && session.mode === 'audio' && (
                    <button onClick={() => { audioRef.current.play().catch(() => {}); setAudioLocked(false); }}
                      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-2">
                      <span className="fm-sound-pill inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black text-xs font-black tracking-wide">
                        <Play className="w-4 h-4" /> TAP TO LISTEN
                      </span>
                    </button>
                  )}

                  <div className="absolute inset-0 flex items-center justify-center px-6">
                    {session.mode === 'youtube' ? (
                      <div className="text-center">
                        <div className="relative w-20 h-20 mx-auto mb-3">
                          <div className="absolute inset-0 rounded-full fm-host-ring fm-spin" />
                          <div className="absolute inset-[3px] rounded-full bg-black overflow-hidden">
                            {host.profile_image_url && <img src={host.profile_image_url} alt="" className="w-full h-full object-cover" />}
                          </div>
                        </div>
                        <p className="text-lg font-black italic uppercase tracking-tight fm-gradient-text">
                          {isHost ? 'Add your stream link below' : 'Starting soon'}
                        </p>
                        <p className="text-xs text-white/50 mt-1">
                          {isHost ? 'Paste the YouTube live link and it plays here.' : 'Hang out in the chat. The stream shows up here.'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 sm:gap-6 w-full max-w-xl">
                        <div className="relative w-24 h-24 sm:w-36 sm:h-36 flex-shrink-0">
                          <div className={`absolute -inset-1 rounded-2xl fm-host-ring ${session.is_playing ? 'fm-spin-slow' : ''} opacity-80 blur-[2px]`} />
                          <div className="absolute inset-0 rounded-2xl overflow-hidden bg-white/[0.06]">
                            {currentTrack?.cover_artwork_url
                              ? <img src={currentTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8 text-white/30" /></div>}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black tracking-[0.25em] text-pink-300 uppercase">Now playing</p>
                          <p className="text-xl sm:text-3xl font-black leading-tight truncate">{currentTrack?.title || 'Nothing yet'}</p>
                          <p className="text-sm text-white/60 truncate">{host.artist_name}</p>
                          <div className="mt-3 flex items-center gap-2">
                            {isHost ? (
                              <>
                                <button onClick={session.is_playing ? hostPause : hostPlay} disabled={!currentTrack}
                                  className="w-11 h-11 rounded-full bg-white flex items-center justify-center disabled:opacity-30 hover:scale-105 active:scale-95 transition shadow-[0_0_24px_rgba(236,72,153,0.5)]">
                                  {session.is_playing ? <Pause className="w-5 h-5 text-black" /> : <Play className="w-5 h-5 text-black ml-0.5" />}
                                </button>
                                <button onClick={hostSkip} disabled={!currentTrack}
                                  className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center disabled:opacity-30 hover:bg-white/25 transition">
                                  <SkipForward className="w-4 h-4 text-white" />
                                </button>
                              </>
                            ) : session.is_playing ? (
                              <div className="flex gap-1 items-end h-6">
                                {[3, 6, 4, 7, 5, 3].map((h, i) => (
                                  <div key={i} className="w-1.5 rounded-full fm-eq" style={{ height: h * 3, animationDelay: `${i * 120}ms` }} />
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-white/40 inline-flex items-center gap-1.5"><Pause className="w-3.5 h-3.5" /> Paused</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="absolute inset-0 pointer-events-none overflow-hidden">{floating}</div>
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent px-3 pt-3 pb-8">{stageTopBar}</div>
                </div>
              )}
            </div>
          </div>

          {/* Who's watching */}
          {showListeners && listeners.length > 0 && (
            <div className="mx-4 lg:mx-0 mt-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] font-black mb-2">Watching now</p>
              <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                {listeners.map((l, i) => (
                  <div key={l.user_id || i} className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/10" style={{ background: nameColour(l.name) }}>
                      {l.avatar
                        ? <img src={l.avatar} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xs font-black text-black/70">{(l.name || '?')[0].toUpperCase()}</div>}
                    </div>
                    <p className="text-[10px] text-white/50 truncate max-w-[56px]">{l.name || 'Guest'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Host strip: tip the artist, open their page */}
          {!isHost && (
            <div className="mx-4 lg:mx-0 mt-3 flex items-center gap-2">
              {host.slug && (
                <button onClick={() => navigate(`/artist/${host.slug}`)}
                  className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/[0.05] border border-white/[0.07] hover:bg-white/[0.08] transition text-left">
                  <Star className="w-4 h-4 text-amber-300 flex-shrink-0" />
                  <span className="text-xs font-bold truncate">See {host.artist_name}'s music</span>
                </button>
              )}
              {host.paypal_email && <TipButton artist={host} onTipSent={onTipSent} />}
            </div>
          )}

          {/* Host tools */}
          {isHost && (
            <div className="mx-4 lg:mx-0 mt-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.07] space-y-3">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => updateSession({ mode: 'audio' })}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${session.mode === 'audio' ? 'bg-white text-black' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'}`}>
                  <Music className="w-3.5 h-3.5" /> Audio
                </button>
                <button onClick={() => updateSession({ mode: 'youtube' })}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${session.mode === 'youtube' ? 'bg-gradient-to-r from-pink-500 to-violet-500 text-white' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'}`}>
                  <Radio className="w-3.5 h-3.5" /> Video stream
                </button>
                <button onClick={() => setShowPollModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-violet-500/15 text-violet-200 hover:bg-violet-500/25 transition">
                  <BarChart2 className="w-3.5 h-3.5" /> Poll
                </button>
                <button onClick={() => setShowReviewQueue(v => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/[0.06] text-white/60 hover:bg-white/[0.1] transition">
                  <Music className="w-3.5 h-3.5" /> Review queue
                </button>
                <button onClick={() => {
                    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement('a');
                    a.href = url;
                    a.download = `session-chat-${sessionId.slice(0, 8)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/[0.06] text-white/60 hover:bg-white/[0.1] transition"
                  title="Save the chat">
                  <Send className="w-3.5 h-3.5 rotate-45" /> Save chat
                </button>
                <button onClick={endSession}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-red-500 text-white hover:bg-red-400 transition">
                  <X className="w-3.5 h-3.5" /> End
                </button>
              </div>

              {session.mode === 'youtube' && (
                <>
                  <div className="flex gap-2">
                    <input value={youtubeInput} onChange={e => setYoutubeInput(e.target.value)}
                      placeholder={ytId ? 'Paste a new YouTube live link to switch' : 'Paste your YouTube live link'}
                      className="flex-1 min-w-0 px-3 py-2.5 bg-black/40 border border-white/[0.1] rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50" />
                    <button onClick={setYouTube} disabled={!extractYouTubeId(youtubeInput)}
                      className="px-4 py-2.5 rounded-xl bg-white text-black text-xs font-black disabled:opacity-30 transition">
                      Go
                    </button>
                  </div>
                  <p className="text-[11px] text-white/40 leading-relaxed">
                    Stream from OBS to YouTube as usual. In YouTube Studio, set the stream to allow embedding and
                    switch monetisation off for it, so no ads play here. Fans watch in Feelz Machine with this chat.
                  </p>
                </>
              )}

              {session.mode === 'audio' && (
                <button onClick={() => setShowQueue(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-black/30 border border-white/[0.08] text-xs font-bold text-white/70 hover:bg-black/50 transition">
                  <span>Queue ({queue.length} {queue.length === 1 ? 'track' : 'tracks'})</span>
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}

              {showReviewQueue && (
                <ReviewQueuePanel
                  sessionId={sessionId}
                  artistId={artist?.id}
                  onReviewTrack={(sub) => {
                    setShowPollModal(true);
                    setShowReviewQueue(false);
                    supabase.from('session_review_submissions')
                      .update({ status: 'reviewing' }).eq('id', sub.id).then(() => {});
                  }}
                />
              )}

              {showQueue && session.mode === 'audio' && (
                <div className="bg-black/30 border border-white/[0.06] rounded-xl p-3 space-y-3">
                  <TrackSearch artistId={artist.id} onAdd={addToQueue} existingIds={queue.map(q => q.track_id)} />
                  {queue.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-white/[0.05]">
                      {queue.map((q, i) => (
                        <div key={q.id} className={`flex items-center gap-2 p-2 rounded-lg ${q.track_id === session.current_track_id ? 'bg-white/[0.08]' : ''}`}>
                          <span className="text-xs text-white/25 w-4">{i + 1}</span>
                          <p className="text-xs text-white truncate flex-1">{q.tracks?.title}</p>
                          {q.track_id === session.current_track_id
                            ? <span className="text-[10px] font-bold text-pink-300">playing</span>
                            : <div className="flex items-center gap-1 flex-shrink-0">
                                {i > 0 && (
                                  <button onClick={async () => {
                                    const updated = [...queue];
                                    [updated[i - 1], updated[i]] = [updated[i], updated[i - 1]];
                                    setQueue(updated);
                                    await supabase.from('listening_session_queue').update({ position: i - 1 }).eq('id', q.id);
                                    await supabase.from('listening_session_queue').update({ position: i }).eq('id', updated[i].id);
                                  }} aria-label="Move up"
                                    className="w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-white hover:bg-white/[0.08] transition">
                                    <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                                  </button>
                                )}
                                <button onClick={() => removeFromQueue(q)} aria-label="Remove"
                                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 transition">
                                  <Trash2 className="w-3 h-3 text-red-400/60" />
                                </button>
                              </div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Polls (under the stage on big screens) */}
          {polls.length > 0 && (
            <div className="hidden lg:block mt-3 space-y-2">
              {polls.map(poll => <SessionPollCard key={poll.id} poll={poll} userId={user?.id} onVote={castVote} />)}
            </div>
          )}
        </div>

        {/* ── Right: chat ────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col mt-3 lg:mt-0 lg:rounded-3xl lg:bg-white/[0.03] lg:border lg:border-white/[0.07] lg:overflow-hidden">
          <div className="hidden lg:flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <p className="text-xs font-black tracking-[0.2em] uppercase text-white/60">Live chat</p>
            <span className="inline-flex items-center gap-1 text-[11px] text-white/40"><Users className="w-3.5 h-3.5" /> {listenerCount}</span>
          </div>

          {polls.length > 0 && (
            <div className="lg:hidden flex-shrink-0 max-h-52 overflow-y-auto border-b border-white/[0.05]">
              {polls.map(poll => <SessionPollCard key={poll.id} poll={poll} userId={user?.id} onVote={castVote} />)}
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="py-2">
              {messages.filter(m => m.is_tip).slice(-3).map((msg, i) => (
                <ChatMessage key={(msg.id || i) + '-tip'} msg={msg} hostUserId={host.user_id} />
              ))}
              {messages.filter(m => !m.is_tip).length === 0 && (
                <p className="text-center text-xs text-white/30 py-8">Say hi. You are first.</p>
              )}
              {messages.filter(m => !m.is_tip).map((msg, i) => (
                <ChatMessage key={msg.id || i} msg={msg} hostUserId={host.user_id} />
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Reactions and the message box */}
          <div className="flex-shrink-0 px-3 pb-safe pb-3 pt-2 border-t border-white/[0.06] space-y-2 bg-[#07060b]/80 backdrop-blur lg:bg-transparent">
            <div className="flex items-center gap-2">
              {REACTIONS.map(emoji => (
                <button key={emoji} onClick={() => sendReaction(emoji)} aria-label={`React ${emoji}`}
                  className="flex-1 h-10 text-xl rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] hover:-translate-y-0.5 active:scale-90 transition">
                  {emoji}
                </button>
              ))}
            </div>

            {!isHost && user && (
              <button onClick={() => setShowSubmitModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-2xl bg-gradient-to-r from-violet-500/20 to-pink-500/20 border border-pink-500/25 text-xs text-pink-100 font-bold hover:from-violet-500/30 hover:to-pink-500/30 transition">
                <Music className="w-3.5 h-3.5" /> Send your track in for review
              </button>
            )}

            {user ? (
              <div className="space-y-2">
                {showTipChat && (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-black text-amber-300 inline-flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> Tip with a message</p>
                      <button onClick={() => setShowTipChat(false)} aria-label="Close" className="text-white/40 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="flex gap-2">
                      {['1', '2', '5', '10'].map(amt => (
                        <button key={amt} onClick={() => setTipChatAmount(amt)}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-black transition ${tipChatAmount === amt ? 'bg-amber-400 text-black' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'}`}>
                          ${amt}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-white/40">Tips go to the artist through PayPal. Your message shows in the chat straight away.</p>
                  </div>
                )}
                <form onSubmit={sendMessage} className="flex gap-2">
                  {!isHost && host.paypal_email && (
                    <button type="button" onClick={() => setShowTipChat(p => !p)} aria-label="Tip with a message"
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition ${showTipChat ? 'bg-amber-400 text-black' : 'bg-white/[0.06] text-amber-300 hover:bg-white/[0.1]'}`}>
                      <Gift className="w-4 h-4" />
                    </button>
                  )}
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                    placeholder={showTipChat ? 'Add a message to your tip' : 'Say something'}
                    maxLength={200}
                    className="flex-1 min-w-0 px-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-2xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50" />
                  <button type="submit" disabled={(!chatInput.trim() && !showTipChat) || sending} aria-label="Send"
                    className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center disabled:opacity-30 hover:brightness-110 active:scale-95 transition flex-shrink-0">
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </form>
              </div>
            ) : (
              <button onClick={() => navigate(`/login?next=/session/${sessionId}`)}
                className="w-full py-3 rounded-2xl bg-white text-black text-sm font-black">
                Sign in to chat
              </button>
            )}
          </div>
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
          100% { transform: translateY(-160px) scale(1.6); opacity: 0; }
        }
        .animate-float-up { animation: float-up 2.2s ease-out forwards; }
        .fm-host-ring { background: conic-gradient(from 0deg, #ec4899, #8b5cf6, #22d3ee, #f59e0b, #ec4899); }
        .fm-spin { animation: fm-spin 3s linear infinite; }
        .fm-spin-slow { animation: fm-spin 8s linear infinite; }
        .fm-gradient-text { background: linear-gradient(90deg, #f472b6, #a78bfa, #67e8f9); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .fm-stage-glow { box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 20px 80px -20px rgba(236,72,153,0.45); }
        .fm-eq { background: linear-gradient(to top, #ec4899, #a78bfa); animation: fm-eq 0.9s ease-in-out infinite alternate; transform-origin: bottom; }
        .fm-sound-pill { animation: fm-bob 1.6s ease-in-out infinite; }
        @keyframes fm-spin { to { transform: rotate(360deg); } }
        @keyframes fm-eq { from { transform: scaleY(0.35); } to { transform: scaleY(1); } }
        @keyframes fm-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @media (prefers-reduced-motion: reduce) { .fm-spin, .fm-spin-slow, .fm-eq, .fm-sound-pill, .animate-float-up { animation: none; } }
      `}</style>
    </div>
  );
}
