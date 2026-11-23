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
import DirectStage from '../components/DirectStage';
import StreamThumbPicker from '../components/StreamThumbPicker';
import useDirectLive from '../hooks/useDirectLive';
import { supabase } from '../supabaseClient';
import { resolveStreamSrc, resolveStreamLater, playableFallback } from '../utils/streamUrl';
import { assignPlaybackSrc } from '../utils/offlineStore';
import { useAuth } from '../contexts/AuthContext';
import {
  Play, Pause, SkipForward, X, Users, Music, Radio,
  Plus, Search, Loader, Send,
  ChevronDown, Star, Trash2, BarChart2,
  Pin, Shield, Ban, Clock, AtSign, Check, ArrowDown, Timer, Bell, CalendarPlus,
  Mic, Disc3, Crown, Reply, Share2, CornerDownRight
} from 'lucide-react';
import { searchTracks } from '../utils/searchTracks';

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const REACTIONS = ['❤️', '🔥', '🎵', '⚡', '🙌'];
// Reactions on a chat message (the database only takes these).
const MSG_REACTIONS = ['🔥', '❤️', '😂', '👏', '💯', '😮'];

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
      // Any published song on Feelz Machine, by title or by artist.
      const rows = await searchTracks(supabase, query, { limit: 10, exclude: existingIds });
      setResults(rows);
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
          placeholder="Search songs or artists"
          className="w-full pl-9 pr-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20"
        />
      </div>
      {searching && <div className="text-center py-2"><Loader className="w-4 h-4 animate-spin text-white/30 mx-auto" /></div>}
      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-xs text-white/40 px-1">No songs or artists called "{query.trim()}" yet.</p>
      )}
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
            <p className="text-xs text-white/30 truncate">{[track.artist_name, track.duration ? fmt(track.duration) : ''].filter(Boolean).join(' · ')}</p>
          </div>
          <Plus className="w-4 h-4 text-white/40 flex-shrink-0" />
        </button>
      ))}
    </div>
  );
}

// Counts down to a scheduled start, updating every second.
function Countdown({ to }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!to) return null;
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <p className="relative mt-3 text-2xl font-black fm-gradient-text">Any minute now</p>;
  const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  const cell = (v, l) => (
    <div className="flex flex-col items-center min-w-[52px]">
      <span className="text-3xl sm:text-4xl font-black tabular-nums text-white">{String(v).padStart(2, '0')}</span>
      <span className="text-[9px] font-black tracking-[0.2em] text-white/40">{l}</span>
    </div>
  );
  return (
    <div className="relative mt-3 flex items-end gap-2">
      {d > 0 && cell(d, 'DAYS')}{cell(h, 'HRS')}{cell(m, 'MIN')}{d === 0 && cell(sec, 'SEC')}
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

// The reactions under a message: tap one to add or take back yours.
function ReactionChips({ list, onReact }) {
  if (!list?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {list.map(r => (
        <button key={r.emoji} type="button" onClick={(e) => { e.stopPropagation(); onReact && onReact(r.emoji); }}
          className={`inline-flex items-center gap-1 h-6 px-1.5 rounded-full text-[11px] font-bold transition ${r.mine ? 'bg-pink-500/25 border border-pink-400/50 text-white' : 'bg-white/[0.06] border border-white/[0.08] text-white/70 hover:bg-white/[0.1]'}`}>
          <span className="text-[13px] leading-none">{r.emoji}</span>{r.count}
        </button>
      ))}
    </div>
  );
}

function ChatMessage({ msg, hostUserId, isModUser, myName, onTap, reactions, onReact }) {
  const colour = nameColour(msg.name);
  const isHostMsg = hostUserId && msg.user_id === hostUserId;
  const mentionsMe = !!myName && (msg.content || '').toLowerCase().includes('@' + myName.toLowerCase().replace(/\s+/g, ''));

  const tap = () => onTap && onTap(msg);
  const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } };

  if (msg.is_tip) {
    return (
      <div role="button" tabIndex={0} onClick={tap} onKeyDown={key}
        className="block w-[calc(100%-1.5rem)] text-left mx-3 my-1.5 p-3 rounded-2xl bg-gradient-to-r from-amber-400/20 via-pink-500/15 to-violet-500/20 border border-amber-300/30 cursor-pointer">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-amber-400 text-black text-[11px] font-black">
            ${Number(msg.tip_amount || 0).toFixed(Number(msg.tip_amount) % 1 ? 2 : 0)} TIP
          </span>
          <span className="text-xs font-black truncate" style={{ color: colour }}>{msg.name || 'Listener'}</span>
        </div>
        {msg.content && <p className="text-sm text-white mt-1.5 leading-snug break-words">{msg.content}</p>}
        <ReactionChips list={reactions} onReact={(e) => onReact && onReact(msg, e)} />
      </div>
    );
  }

  return (
    <div role="button" tabIndex={0} onClick={tap} onKeyDown={key}
      className={`w-full text-left flex items-start gap-2.5 px-4 py-1.5 transition hover:bg-white/[0.03] cursor-pointer ${mentionsMe ? 'bg-pink-500/10 border-l-2 border-pink-400' : ''}`}>
      <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden mt-0.5" style={{ background: colour }}>
        {msg.avatar
          ? <img src={msg.avatar} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-[11px] text-black/70 font-black">
              {(msg.name || '?')[0].toUpperCase()}
            </div>}
      </div>
      <div className="flex-1 min-w-0">
        {msg.reply_to_name && (
          <p className="flex items-center gap-1 text-[11px] text-white/45 truncate mb-0.5">
            <CornerDownRight className="w-3 h-3 flex-shrink-0" />
            <span className="font-bold" style={{ color: nameColour(msg.reply_to_name) }}>{msg.reply_to_name}</span>
            <span className="truncate">{msg.reply_to_content}</span>
          </p>
        )}
        <p className="text-sm leading-snug break-words">
          <span className="font-black mr-1.5" style={{ color: colour }}>{msg.name || 'Listener'}</span>
          {isHostMsg && <span className="mr-1.5 px-1.5 py-px rounded bg-gradient-to-r from-pink-500 to-violet-500 text-[9px] font-black tracking-wider align-middle">HOST</span>}
          {!isHostMsg && isModUser && <span className="mr-1.5 px-1.5 py-px rounded bg-emerald-400 text-black text-[9px] font-black tracking-wider align-middle">MOD</span>}
          <span className="text-white/85">{msg.content}</span>
        </p>
        <ReactionChips list={reactions} onReact={(e) => onReact && onReact(msg, e)} />
        <span className="text-[10px] text-white/25">{timeAgo(msg.created_at)}</span>
      </div>
    </div>
  );
}

// What you can do with a message. Everyone can mention or remove their own;
// moderators can pin, remove, time out and ban; the host can also make
// someone a moderator.
function MessageSheet({ msg, me, isMod, isHost, hostUserId, isModUser, onClose, actions }) {
  if (!msg) return null;
  const mine = msg.user_id === me;
  const targetIsHost = msg.user_id === hostUserId;
  const row = 'w-full flex items-center gap-3 px-4 py-3.5 text-sm font-semibold text-left hover:bg-white/[0.05] transition';
  const go = (fn) => async () => { onClose(); await fn(); };
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#121018] border border-white/[0.08] overflow-hidden pb-safe"
        onClick={e => e.stopPropagation()}>
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <p className="text-xs font-black" style={{ color: nameColour(msg.name) }}>{msg.name || 'Listener'}</p>
          {msg.content && <p className="text-sm text-white/70 mt-1 line-clamp-3 break-words">{msg.content}</p>}
        </div>
        {actions.react && (
          <div className="flex items-center justify-between gap-1 px-3 py-2.5 border-b border-white/[0.06]">
            {MSG_REACTIONS.map(e => (
              <button key={e} onClick={go(() => actions.react(msg, e))} aria-label={`React ${e}`}
                className="flex-1 h-11 rounded-2xl text-2xl hover:bg-white/[0.08] active:scale-90 transition">{e}</button>
            ))}
          </div>
        )}
        {actions.reply && (
          <button className={row} onClick={go(() => actions.reply(msg))}>
            <Reply className="w-4 h-4 text-white/50" /> Reply
          </button>
        )}
        {!mine && msg.name && (
          <button className={row} onClick={go(() => actions.mention(msg))}>
            <AtSign className="w-4 h-4 text-white/50" /> Mention {msg.name}
          </button>
        )}
        {isMod && !msg.is_tip && (
          <button className={row} onClick={go(() => actions.pin(msg))}>
            <Pin className="w-4 h-4 text-amber-300" /> Pin to the top of chat
          </button>
        )}
        {(mine || isMod) && (
          <button className={row} onClick={go(() => actions.remove(msg))}>
            <Trash2 className="w-4 h-4 text-red-400" /> Remove message
          </button>
        )}
        {isMod && !mine && !targetIsHost && (!isModUser || isHost) && (
          <>
            <button className={row} onClick={go(() => actions.ban(msg, 5))}>
              <Clock className="w-4 h-4 text-white/50" /> Time out for 5 minutes
            </button>
            <button className={row} onClick={go(() => actions.ban(msg, null))}>
              <Ban className="w-4 h-4 text-red-400" /> Remove from chat for this stream
            </button>
          </>
        )}
        {isHost && !mine && !targetIsHost && (
          isModUser ? (
            <button className={row} onClick={go(() => actions.unmod(msg))}>
              <Shield className="w-4 h-4 text-white/50" /> Remove as moderator
            </button>
          ) : (
            <button className={row} onClick={go(() => actions.mod(msg))}>
              <Shield className="w-4 h-4 text-emerald-400" /> Make moderator
            </button>
          )
        )}
        <button className={`${row} justify-center text-white/50 border-t border-white/[0.06]`} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
// ── Track Review Submission Queue ────────────────────────────────────────────

// Listener: pick one of their own tracks to submit for review
// Gifts that move a track up the live review queue. Each is a tip that goes
// straight to the host through the normal tip flow; bigger gifts go first.
const REVIEW_GIFTS = [
  { id: 'mic',   name: 'Mic',   amount: 2,  line: 'Move up the queue', icon: Mic,   tint: 'from-sky-400 to-violet-500' },
  { id: 'vinyl', name: 'Vinyl', amount: 5,  line: 'Jump ahead',        icon: Disc3, tint: 'from-pink-500 to-violet-500' },
  { id: 'crown', name: 'Crown', amount: 10, line: 'Front of the line', icon: Crown, tint: 'from-amber-300 to-pink-500' },
];
const giftFor = (amount) => [...REVIEW_GIFTS].reverse().find(g => Number(amount) >= g.amount) || null;

function SubmitForReviewModal({ sessionId, user, onClose, onSubmitted, host, onGiftSent }) {
  const [picked, setPicked] = useState(null);   // the track, while choosing free or a gift
  const [gift, setGift]     = useState(null);   // the gift being paid for
  const canGift = !!host?.paypal_email;
  const [tracks, setTracks]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(null);
  const [error, setError]           = useState('');
  const [artistTier, setArtistTier] = useState('free');
  const [alreadyBoosted, setAlreadyBoosted] = useState(false);
  const [usePriority, setUsePriority] = useState(false);

  const [isArtist, setIsArtist] = useState(true);
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      // Your artist profile first, then only your own published tracks.
      const { data: me } = await supabase.from('artists')
        .select('id, artist_name, tier').eq('user_id', user.id).maybeSingle();
      if (!me) { setIsArtist(false); setLoading(false); return; }
      const [tracksRes, boostRes] = await Promise.all([
        supabase.from('tracks')
          .select('id, title, cover_artwork_url, duration')
          .eq('artist_id', me.id)
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(40),
        supabase.from('session_priority_boosts')
          .select('id').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle(),
      ]);
      setTracks((tracksRes.data || []).map(t => ({ ...t, artists: { id: me.id, artist_name: me.artist_name } })));
      setArtistTier(me.tier || 'free');
      setAlreadyBoosted(!!boostRes.data);
      setLoading(false);
    })();
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
        if (err.code === '42501') throw new Error('You already have two tracks waiting, or the host has paused submissions.');
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
        <p className="text-[11px] text-white/40 mb-4 flex-shrink-0">Pick one of your tracks. It joins the queue and gets rated live by everyone watching. Up to two at a time.</p>

        {gift && picked && (
          <TipButton
            artist={host}
            autoOpen
            presetAmount={gift.amount}
            presetMessage={`${gift.name} for "${picked.title}"`}
            onTipSent={async (amount, msg) => {
              const { error: gErr } = await supabase.rpc('submit_review_with_gift', { p_session: sessionId, p_track: picked.id });
              if (gErr) { setError('Your gift went through, but the queue did not update. Tell the host in the chat.'); return; }
              if (onGiftSent) onGiftSent(amount, msg);
              setSubmitted(picked);
              setTimeout(() => { onSubmitted(); onClose(); }, 1800);
            }}
            onClose={(paid) => { if (!paid) setGift(null); }}
          />
        )}

        {submitted ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Check className="w-10 h-10 text-pink-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-white mb-1">You're in the queue</p>
              <p className="text-xs text-white/40">"{submitted.title}" will be rated live. Stay close, we'll tell you when it's on.</p>
            </div>
          </div>
        ) : picked ? (
          <div className="flex-1 overflow-y-auto space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.05] border border-white/[0.07] mb-1">
              <div className="w-11 h-11 rounded-xl bg-white/[0.06] overflow-hidden flex-shrink-0">
                {picked.cover_artwork_url ? <img src={picked.cover_artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-4 h-4 text-white/30 m-auto mt-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-white truncate">{picked.title}</p>
                <button onClick={() => setPicked(null)} className="text-[11px] text-white/40 hover:text-white">Pick another</button>
              </div>
            </div>
            <p className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase pt-1">Send a gift to move up</p>
            {REVIEW_GIFTS.map(g => (
              <button key={g.id} onClick={() => setGift(g)} disabled={submitting}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.07] hover:border-pink-400/40 hover:bg-white/[0.07] transition text-left">
                <span className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${g.tint} flex items-center justify-center flex-shrink-0`}>
                  <g.icon className="w-5 h-5 text-white" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-black text-white">{g.name}</span>
                  <span className="block text-[11px] text-white/50">{g.line}</span>
                </span>
                <span className="text-sm font-black text-white">${g.amount}</span>
              </button>
            ))}
            <button onClick={() => submit(picked)} disabled={submitting}
              className="w-full py-3 rounded-2xl bg-white/[0.08] text-white text-sm font-bold hover:bg-white/[0.12] transition disabled:opacity-40">
              {submitting ? 'Sending...' : 'Join the queue free'}
            </button>
            <p className="text-[10px] text-white/35 text-center leading-relaxed">
              Gifts go straight to {host?.artist_name || 'the host'} through PayPal. Bigger gifts are reviewed first.
            </p>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader className="w-5 h-5 animate-spin text-white/30" />
          </div>
        ) : !isArtist ? (
          <div className="flex-1 flex items-center justify-center text-center px-4">
            <div>
              <Music className="w-8 h-8 text-white/20 mx-auto mb-3" />
              <p className="text-sm font-semibold text-white mb-1">Live reviews are for artists</p>
              <p className="text-xs text-white/40">Set up an artist profile and publish a track to send it in.</p>
            </div>
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
              <button key={track.id} onClick={() => !submitting && (canGift ? setPicked(track) : submit(track))}
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

// Host and moderators: the review queue. "Review live" puts a track on stage
// with a rating poll for everyone; "Finish" closes it and sends the artist the
// result. "Preview" plays it on this device only, for OBS to pick up.
function ReviewQueuePanel({ queue, reviewsOpen, onToggleOpen, onChanged, flash, isAudioMode, onQueueForEveryone, sessionId, canAddSessions }) {
  const [busy, setBusy] = useState(null);
  const [adding, setAdding] = useState(false);
  // Platform hosts: every Sessions cover entry into this queue, in one tap.
  const addSessions = async () => {
    setAdding(true);
    const { data, error } = await supabase.rpc('session_add_sessions_entries', { p_session: sessionId });
    setAdding(false);
    if (error) { flash('Could not add the Sessions entries.'); return; }
    flash(data ? `${data} Sessions ${data === 1 ? 'entry' : 'entries'} added to the queue.` : 'Every Sessions entry is already in the queue.');
    onChanged();
  };
  const [previewId, setPreviewId] = useState(null);
  const previewRef = useRef(null);

  useEffect(() => () => { try { previewRef.current?.pause(); } catch { /* gone */ } }, []);

  const start = async (item) => {
    setBusy(item.id);
    const { error } = await supabase.rpc('session_start_review', { p_submission: item.id });
    setBusy(null);
    if (error) { flash('Could not start that review.'); return; }
    flash(`"${item.track_title}" is on stage. Everyone can rate it now.`);
    onChanged();
  };
  const finish = async (item) => {
    setBusy(item.id);
    const { data, error } = await supabase.rpc('session_finish_review', { p_submission: item.id });
    setBusy(null);
    if (error) { flash('Could not finish that review.'); return; }
    flash(data?.total ? `${data.good_pct}% said Fire or Solid, from ${data.total} votes. Sent to the artist.` : 'Review finished and sent to the artist.');
    if (previewId === item.id) { previewRef.current?.pause(); setPreviewId(null); }
    onChanged();
  };
  const dismiss = async (item) => {
    await supabase.from('session_review_submissions').update({ status: 'dismissed' }).eq('id', item.id);
    onChanged();
  };
  const preview = async (item) => {
    if (previewId === item.id) { previewRef.current?.pause(); setPreviewId(null); return; }
    const { data: t } = await supabase.from('tracks').select('id, file_url').eq('id', item.track_id).maybeSingle();
    if (!t) return;
    const src = (await resolveStreamSrc(t)) || playableFallback(t.file_url) || '';
    if (!src) { flash('That track cannot play here.'); return; }
    if (!previewRef.current) previewRef.current = new Audio();
    previewRef.current.src = src;
    previewRef.current.play().catch(() => {});
    setPreviewId(item.id);
  };

  const onStage = queue.find(q => q.status === 'reviewing');
  const waiting = queue.filter(q => q.status === 'pending');

  return (
    <div className="bg-black/30 border border-white/[0.06] rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-white/50 uppercase tracking-[0.2em] font-black">
          Live reviews <span className="text-pink-300">({waiting.length} waiting)</span>
        </p>
        <button onClick={onToggleOpen}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${reviewsOpen ? 'bg-emerald-400 text-black' : 'bg-white/10 text-white/60'}`}>
          {reviewsOpen ? 'TAKING TRACKS' : 'PAUSED'}
        </button>
      </div>
      {canAddSessions && (
        <button onClick={addSessions} disabled={adding}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gradient-to-r from-amber-400/20 to-pink-500/20 border border-amber-300/30 text-[11px] font-black text-amber-100 disabled:opacity-50">
          {adding ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />} Add the Sessions entries
        </button>
      )}

      {onStage && (
        <div className="p-2.5 rounded-xl bg-gradient-to-r from-pink-500/20 to-violet-500/20 border border-pink-400/30">
          <p className="text-[9px] font-black tracking-[0.2em] text-pink-200 mb-1.5">ON STAGE</p>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex-shrink-0 overflow-hidden">
              {onStage.cover_url ? <img src={onStage.cover_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-4 h-4 text-white/30 m-auto mt-3" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-white truncate">{onStage.track_title}</p>
              <p className="text-[10px] text-white/50 truncate">{onStage.artist_name}</p>
            </div>
            <button onClick={() => preview(onStage)} className="px-2.5 py-1.5 rounded-lg bg-white/10 text-[10px] font-black text-white">
              {previewId === onStage.id ? 'Stop' : 'Preview'}
            </button>
            <button onClick={() => finish(onStage)} disabled={busy === onStage.id}
              className="px-2.5 py-1.5 rounded-lg bg-white text-black text-[10px] font-black disabled:opacity-40">
              Finish
            </button>
          </div>
        </div>
      )}

      {waiting.length === 0 ? (
        <p className="text-xs text-white/30 text-center py-2">No tracks waiting. Artists send theirs from the chat.</p>
      ) : (
        waiting.map(item => (
          <div key={item.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 rounded-xl bg-white/[0.04] border border-white/[0.05]">
            <span className="w-5 text-center text-[11px] font-black text-white/40">{item.place}</span>
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex-shrink-0 overflow-hidden">
              {item.cover_url ? <img src={item.cover_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-4 h-4 text-white/20 m-auto mt-2.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {item.track_title}
                {item.source === 'sessions' && <span className="ml-1.5 text-[9px] font-black px-1.5 py-px rounded bg-amber-300/20 text-amber-200">SESSIONS</span>}
                {item.gift_amount
                  ? <span className="ml-1.5 text-[9px] font-black px-1.5 py-px rounded bg-amber-400 text-black">{(giftFor(item.gift_amount)?.name || 'GIFT').toUpperCase()} ${Number(item.gift_amount)}</span>
                  : item.is_priority && <span className="ml-1.5 text-[9px] font-black px-1.5 py-px rounded bg-violet-500/30 text-violet-200">BOOST</span>}
              </p>
              <p className="text-[10px] text-white/40 truncate">{item.artist_name}</p>
            </div>
            {/* On a phone the buttons drop to their own line so the title has room. */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
            <button onClick={() => preview(item)} className="px-2 py-1.5 rounded-lg bg-white/[0.06] text-[10px] font-bold text-white/70">
              {previewId === item.id ? 'Stop' : 'Preview'}
            </button>
            {isAudioMode && onQueueForEveryone && (
              <button onClick={() => onQueueForEveryone(item)} className="px-2 py-1.5 rounded-lg bg-white/[0.06] text-[10px] font-bold text-white/70">Queue</button>
            )}
            <button onClick={() => start(item)} disabled={busy === item.id}
              className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-violet-500 text-white text-[10px] font-black disabled:opacity-40">
              Review live
            </button>
            <button onClick={() => dismiss(item)} aria-label="Remove from queue"
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/20 transition">
              <X className="w-3 h-3 text-white/30" />
            </button>
            </div>
          </div>
        ))
      )}
      <p className="text-[10px] text-white/30 leading-relaxed">
        Preview plays on this device only, so your stream software can pick it up.
      </p>
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

function SessionPollCard({ poll, userId, onVote, canEnd, onEnd }) {
  const expired    = new Date(poll.expires_at) < new Date();
  const totalVotes = (poll.options || []).reduce((s, o) => s + (o.votes || 0), 0);
  const myVote     = poll.my_vote;
  const showResults = !!myVote || expired;
  const isReview   = poll.poll_type === 'track_review';
  const top = Math.max(0, ...(poll.options || []).map(o => o.votes || 0));

  return (
    <div className="m-2 p-3.5 rounded-2xl bg-gradient-to-br from-violet-500/[0.12] via-white/[0.03] to-pink-500/[0.08] border border-violet-400/20">
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart2 className="w-3.5 h-3.5 text-violet-300" />
        <span className="text-[10px] font-black text-violet-200 uppercase tracking-[0.2em]">
          {isReview ? 'Rate this track' : 'Poll'}
        </span>
        <span className={`ml-auto text-[10px] font-black px-1.5 py-0.5 rounded ${expired ? 'bg-white/10 text-white/50' : 'bg-red-500 text-white'}`}>
          {expired ? 'ENDED' : 'LIVE'}
        </span>
      </div>

      {isReview && poll.track_title && (
        <div className="flex items-center gap-2 mb-2 p-2 rounded-xl bg-black/30">
          <Music className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{poll.track_title}</p>
            {poll.track_artist && <p className="text-[10px] text-white/40 truncate">{poll.track_artist}</p>}
          </div>
        </div>
      )}

      <p className="text-sm font-bold text-white mb-3">{poll.question}</p>

      {!userId ? (
        <p className="text-xs text-violet-200/80 text-center py-2">Sign in to vote</p>
      ) : (
        <div className="space-y-2">
          {(poll.options || []).map(opt => {
            const pct = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
            const isMyChoice = myVote === opt.id;
            const leading = showResults && top > 0 && (opt.votes || 0) === top;
            return (
              <button key={opt.id} disabled={!!myVote || expired}
                onClick={() => !myVote && !expired && onVote(poll.id, opt.id)}
                className={`w-full text-left relative overflow-hidden rounded-xl transition active:scale-[0.98] border ${isMyChoice ? 'border-pink-400/60' : 'border-white/[0.06]'}`}>
                {showResults && (
                  <div className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, background: leading ? 'linear-gradient(90deg, rgba(236,72,153,0.45), rgba(139,92,246,0.45))' : 'rgba(255,255,255,0.08)' }} />
                )}
                {!showResults && <div className="absolute inset-0 bg-white/[0.05] hover:bg-white/[0.1] transition" />}
                <div className="relative flex items-center justify-between px-3 py-2.5">
                  <span className={`text-sm ${isMyChoice ? 'font-black text-white' : 'text-white/85'}`}>
                    {opt.text}{isMyChoice && <Check className="inline w-3.5 h-3.5 ml-1.5 text-pink-300" />}
                  </span>
                  {showResults && <span className="text-xs font-black text-white">{pct}%</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center mt-2">
        <p className="text-[10px] text-white/40">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
        {canEnd && !expired && (
          <button onClick={() => onEnd(poll)} className="ml-auto text-[10px] font-black text-white/60 hover:text-white px-2 py-1 rounded-lg bg-white/[0.06]">
            End poll
          </button>
        )}
      </div>
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
    setResults(await searchTracks(supabase, q, { limit: 10 }));
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
  const { user, artist, isAdmin } = useAuth();

  const [session, setSession]         = useState(null);
  const [queue, setQueue]             = useState([]);
  const [messages, setMessages]       = useState([]);
  const [loading, setLoading]         = useState(true);
  // Shown on the loading screen when the stream takes too long to open.
  const [slowLoad, setSlowLoad]       = useState(false);
  useEffect(() => {
    if (!loading) return undefined;
    const t = setTimeout(() => setSlowLoad(true), 12000);
    return () => clearTimeout(t);
  }, [loading]);
  const [chatInput, setChatInput]     = useState('');
  const [sending, setSending]         = useState(false);
  const [reactions, setReactions]     = useState([]);
  const [showQueue, setShowQueue]     = useState(false);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [listenerCount, setListenerCount] = useState(0);
  const [audioLocked, setAudioLocked]     = useState(false);
  const [listeners, setListeners]         = useState([]); // who's watching
  const [showListeners, setShowListeners] = useState(false);
  const [replyTo, setReplyTo]             = useState(null);  // the message being answered
  const [msgReactions, setMsgReactions]   = useState([]);    // { message_id, user_id, emoji }
  // Replays: where the video is (seconds), and the stream's reactions to play back.
  const [replayT, setReplayT]             = useState(null);
  const replayReactionsRef = useRef([]);
  const replayLastRef      = useRef(null);

  const audioRef      = useRef(new Audio());
  const sessionSubRef = useRef(null);
  const chatEndRef    = useRef(null);
  const syncTimerRef  = useRef(null);
  const reactionIdRef      = useRef(0);
  const reactionChannelRef = useRef(null);
  // Keep a ref to queue so syncAudio never closes over a stale copy
  const queueRef      = useRef([]);

  const isHost = artist && session?.artist_id === artist.id;
  // Host status for realtime callbacks, which close over the first render.
  const hostRef = useRef(false);
  useEffect(() => { hostRef.current = !!isHost; }, [isHost]);

  // ── Moderation ──────────────────────────────────────────────────────────
  // Moderators belong to the artist (artist_moderators), so whoever the
  // artist trusts carries over to every stream.
  const [modIds, setModIds]       = useState(() => new Set());
  const [modNames, setModNames]   = useState({});
  const [myBan, setMyBan]         = useState(null);   // { until } or null
  const [sheetMsg, setSheetMsg]   = useState(null);   // message the action sheet is for
  const [showMods, setShowMods]   = useState(false);
  const [notice, setNotice]       = useState('');
  const [slowLeft, setSlowLeft]   = useState(0);
  const isMod = !!user && (isHost || isAdmin || modIds.has(user.id));

  const flash = useCallback((m) => { setNotice(m); setTimeout(() => setNotice(''), 3500); }, []);

  const loadMods = useCallback(async (artistId) => {
    if (!artistId) return;
    const { data, error } = await supabase.from('artist_moderators').select('user_id').eq('artist_id', artistId);
    if (error) return; // table not created yet: no moderators
    const ids = (data || []).map(r => r.user_id);
    setModIds(new Set(ids));
    if (!ids.length) { setModNames({}); return; }
    const [{ data: as }, { data: ls }] = await Promise.all([
      supabase.from('artists').select('user_id, artist_name').in('user_id', ids),
      supabase.from('listeners').select('user_id, display_name').in('user_id', ids),
    ]);
    const names = {};
    (ls || []).forEach(l => { if (l.display_name) names[l.user_id] = l.display_name; });
    (as || []).forEach(a => { if (a.artist_name) names[a.user_id] = a.artist_name; });
    setModNames(names);
  }, []);

  const loadMyBan = useCallback(async () => {
    if (!user?.id || !sessionId) return;
    const { data, error } = await supabase.from('session_chat_bans')
      .select('until').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle();
    if (error || !data) { setMyBan(null); return; }
    if (data.until && new Date(data.until) <= new Date()) { setMyBan(null); return; }
    setMyBan(data);
  }, [user?.id, sessionId]);
  useEffect(() => { loadMyBan(); }, [loadMyBan]);

  // A timeout lifts on its own.
  useEffect(() => {
    if (!myBan?.until) return undefined;
    const ms = new Date(myBan.until) - Date.now();
    const t = setTimeout(() => setMyBan(null), Math.max(ms, 0) + 500);
    return () => clearTimeout(t);
  }, [myBan]);

  // Slow mode countdown after you send.
  useEffect(() => {
    if (slowLeft <= 0) return undefined;
    const t = setTimeout(() => setSlowLeft(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [slowLeft]);

  const modAction = async (fn, args, ok) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) { flash(error.message.includes('not allowed') ? 'Only the host and moderators can do that.' : error.message); return false; }
    if (ok) flash(ok);
    return true;
  };

  const pinMessage = (m) => modAction('session_pin', { p_session: sessionId, p_message: m ? m.id : null }, m ? 'Pinned to the top of chat' : 'Unpinned');
  const setSlowMode = (secs) => modAction('session_set_slow_mode', { p_session: sessionId, p_seconds: secs }, secs ? `Slow mode on: one message every ${secs}s` : 'Slow mode off');
  const banUser = (m, minutes) => modAction('session_ban', { p_session: sessionId, p_user: m.user_id, p_minutes: minutes },
    minutes ? `${m.name || 'They'} can't chat for ${minutes} minutes` : `${m.name || 'They'} can't chat for the rest of the stream`);
  const deleteMessage = async (m) => {
    const { error } = await supabase.from('session_messages').delete().eq('id', m.id);
    if (error) { flash('That message could not be removed.'); return; }
    setMessages(prev => prev.filter(x => x.id !== m.id));
  };
  const makeMod = async (m) => {
    const { error } = await supabase.from('artist_moderators').insert({ artist_id: session.artist_id, user_id: m.user_id, added_by: user.id });
    if (error && error.code !== '23505') { flash('Could not add that moderator.'); return; }
    flash(`${m.name || 'They'} is now a moderator`);
    loadMods(session.artist_id);
  };
  const removeMod = async (userId, name) => {
    const { error } = await supabase.from('artist_moderators').delete().eq('artist_id', session.artist_id).eq('user_id', userId);
    if (error) { flash('Could not remove that moderator.'); return; }
    flash(`${name || 'They'} is no longer a moderator`);
    loadMods(session.artist_id);
  };
  const mention = (m) => {
    if (!m?.name) return;
    setChatInput(v => (v ? v.replace(/\s*$/, ' ') : '') + '@' + m.name.replace(/\s+/g, '') + ' ');
  };

  // The live review queue as everyone sees it (session_review_queue).
  const [reviewQueue, setReviewQueue] = useState([]);
  const loadReviewQueue = useCallback(async () => {
    if (!sessionId) return;
    const { data, error } = await supabase.rpc('session_review_queue', { p_session: sessionId });
    if (!error) setReviewQueue(data || []);
  }, [sessionId]);
  useEffect(() => {
    loadReviewQueue();
    const t = setInterval(loadReviewQueue, 15000);
    return () => clearInterval(t);
  }, [loadReviewQueue]);

  // Direct streams (Cloudflare Stream): is the host sending video, and where
  // the replay is once it has ended. Polled, since Cloudflare has no push.
  const directCfg = useDirectLive();
  const [direct, setDirect] = useState({ onAir: false, hls: null, poster: null, replayHls: null, replayReady: false });
  const directMode = session?.mode === 'direct' && !!session?.cf_live_uid;
  const directStatus = session?.status;
  useEffect(() => {
    if (!directMode) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        if (directStatus === 'ended') {
          const r = await fetch(`/.netlify/functions/cf-live?action=replay&session=${sessionId}`).then(x => x.json());
          if (!stop) setDirect(d => ({ ...d, replayHls: r.hls || null, replayReady: !!r.ready, poster: r.thumbnail || d.poster }));
          return !!r.ready;
        }
        const r = await fetch(`/.netlify/functions/cf-live?action=status&session=${sessionId}`).then(x => x.json());
        if (!stop) setDirect(d => ({ ...d, onAir: !!r.live, hls: r.hls || null, poster: r.thumbnail || d.poster }));
      } catch { /* try again next tick */ }
      return false;
    };
    tick();
    const t = setInterval(async () => { const done = await tick(); if (done) clearInterval(t); }, directStatus === 'ended' ? 20000 : 10000);
    return () => { stop = true; clearInterval(t); };
  }, [directMode, directStatus, sessionId]);

  // Switch this stream to direct: makes sure the artist has a Cloudflare
  // live input and points the stream at it.
  const switchToDirect = async () => {
    const { data: { session: auth } } = await supabase.auth.getSession();
    const r = await fetch('/.netlify/functions/cf-live', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setup', token: auth?.access_token }),
    }).then(x => x.json()).catch(() => ({}));
    if (!r.uid) { flash('Direct streaming is not set up yet.'); return; }
    await updateSession({ mode: 'direct', cf_live_uid: r.uid });
  };

  // Scheduled streams: "Remind me" and how many are coming.
  const [reminded, setReminded]       = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const loadReminders = useCallback(async () => {
    if (!sessionId) return;
    const { data: n } = await supabase.rpc('session_reminder_count', { p_session: sessionId });
    if (typeof n === 'number') setReminderCount(n);
    if (user?.id) {
      const { data } = await supabase.from('session_reminders').select('session_id')
        .eq('session_id', sessionId).eq('user_id', user.id).maybeSingle();
      setReminded(!!data);
    }
  }, [sessionId, user?.id]);
  useEffect(() => { loadReminders(); }, [loadReminders]);
  const toggleReminder = async () => {
    if (!user?.id) { navigate(`/login?next=/session/${sessionId}`); return; }
    if (reminded) {
      await supabase.from('session_reminders').delete().eq('session_id', sessionId).eq('user_id', user.id);
      setReminded(false); setReminderCount(c => Math.max(0, c - 1));
    } else {
      const { error } = await supabase.from('session_reminders').insert({ session_id: sessionId, user_id: user.id });
      if (!error || error.code === '23505') { setReminded(true); setReminderCount(c => c + 1); flash("We'll remind you 15 minutes before"); }
    }
  };

  const [polls, setPolls]           = useState([]);
  const [pollFolded, setPollFolded] = useState(null);
  const firstPollId = polls[0]?.id;
  useEffect(() => { setPollFolded(null); }, [firstPollId]); // a new poll opens itself
  const [showPollModal, setShowPollModal]   = useState(false);
  const [myVotes, setMyVotes]               = useState({});
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  // The host's review queue opens by itself the first time tracks are waiting.
  const reviewAutoOpened = useRef(false);
  useEffect(() => {
    if (isHost && !reviewAutoOpened.current && reviewQueue.some(q => q.status === 'pending' || q.status === 'reviewing')) {
      reviewAutoOpened.current = true;
      setShowReviewQueue(true);
    }
  }, [isHost, reviewQueue]);

  // Mirror queue state into a ref so syncAudio always has the latest data
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // ── Load session ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    loadPolls();
    // A load that fails or never answers must not leave a spinner up forever.
    loadSession().catch((err) => { console.error('[session] load failed', err); setSlowLoad(true); });
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
        loadReviewQueue();
        // The host drives playback; everyone else, artists included, follows.
        const amHost = !!artist && payload.new.artist_id === artist.id;
        if (!amHost && payload.new.mode === 'audio') {
          syncAudio(payload.new);
        }
        if (payload.new.status === 'ended') {
          audioRef.current.pause();
        }
      })
      .subscribe();

    // Periodic re-sync every 10s for everyone but the host, to stop drift.
    {
      syncTimerRef.current = setInterval(async () => {
        if (hostRef.current) return;
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
          const { poll_id, option_id, user_id: voter } = payload.new;
          if (voter && voter === user?.id) return; // already counted locally
          setPolls(prev => prev.map(p => p.id === poll_id
            ? { ...p, options: p.options.map(o => o.id === option_id ? { ...o, votes: (o.votes || 0) + 1 } : o) }
            : p
          ));
        })
      .subscribe();

    const chatSub = supabase.channel(`session-chat-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'session_message_reactions',
        filter: `session_id=eq.${sessionId}`,
      }, ({ new: r }) => {
        setMsgReactions(prev => prev.some(x => x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji) ? prev : [...prev, r]);
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'session_message_reactions',
        filter: `session_id=eq.${sessionId}`,
      }, ({ old: r }) => {
        if (!r) return;
        setMsgReactions(prev => prev.filter(x => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)));
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'session_messages',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'session_messages',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const gone = payload.old?.id;
        if (gone) setMessages(prev => prev.filter(m => m.id !== gone));
        // Removed by a moderator: check whether that means me.
        if (payload.old?.user_id && payload.old.user_id === user?.id) loadMyBan();
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

    // Count the votes. The options column only holds the choices.
    const ids = data.map(p => p.id);
    if (ids.length) {
      const { data: allVotes } = await supabase.from('session_poll_votes')
        .select('poll_id, option_id').in('poll_id', ids);
      const tally = {};
      (allVotes || []).forEach(v => { tally[v.poll_id + ':' + v.option_id] = (tally[v.poll_id + ':' + v.option_id] || 0) + 1; });
      data.forEach(p => { p.options = (p.options || []).map(o => ({ ...o, votes: tally[p.id + ':' + o.id] || 0 })); });
    }

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



  // Newest message at the top. Follow the chat while you are at the top;
  // scroll down to read older messages and it stays put, with a button to
  // jump back up to the latest.
  const chatScrollRef = useRef(null);
  const atBottomRef   = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const onChatScroll = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollTop < 80;
    if (atBottomRef.current) setUnseen(0);
  };
  const jumpToLatest = () => {
    chatScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    atBottomRef.current = true;
    setUnseen(0);
  };
  const lastCountRef = useRef(0);
  useEffect(() => {
    const added = messages.length - lastCountRef.current;
    lastCountRef.current = messages.length;
    if (atBottomRef.current) chatScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    else if (added > 0) setUnseen(n => n + added);
  }, [messages]);

  const loadSession = async () => {
    const { data: s } = await supabase
      .from('listening_sessions').select('*, artists(id, user_id, artist_name, slug, profile_image_url, paypal_email)')
      .eq('id', sessionId).maybeSingle();
    // An ended stream stays up as a replay while its video is there, unless
    // the host hid it.
    if (!s || (s.status === 'ended' && ((!extractYouTubeId(s.youtube_url || '') && !(s.mode === 'direct' && s.cf_live_uid)) || s.replay_hidden))) { navigate('/'); return; }
    setSession(s);
    loadMods(s.artist_id);
    // Your watch history (Library, Streams).
    if (user?.id) supabase.rpc('mark_stream_watched', { p_session: s.id }).then(() => {}, () => {});
    const amHost = !!artist && s.artist_id === artist.id;

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
    if (amHost && loadedQueue.length > 0 && !s.current_track_id) {
      const firstTrackId = loadedQueue[0].track_id;
      await supabase
        .from('listening_sessions')
        .update({ current_track_id: firstTrackId, playback_pos: 0 })
        .eq('id', sessionId);
      activeSession = { ...s, current_track_id: firstTrackId, playback_pos: 0 };
      setSession(activeSession);
    }

    // Sync audio for listeners using the freshly-loaded queue (not stale state)
    if (!amHost && activeSession.mode === 'audio') syncAudio(activeSession, loadedQueue);
  };

  const loadMessages = async () => {
    // A live chat needs the latest hundred. A replay needs the whole lot, so
    // it can play back in time with the video.
    const { data: st } = await supabase.from('listening_sessions').select('status').eq('id', sessionId).maybeSingle();
    if (st?.status === 'ended') {
      const all = [];
      for (let from = 0; from < 5000; from += 1000) {
        const { data: page } = await supabase.from('session_messages').select('*')
          .eq('session_id', sessionId).order('created_at').range(from, from + 999);
        all.push(...(page || []));
        if (!page || page.length < 1000) break;
      }
      setMessages(all);
      const { data: rx } = await supabase.from('session_reactions').select('emoji, created_at')
        .eq('session_id', sessionId).order('created_at').limit(5000);
      replayReactionsRef.current = (rx || []).map(r => ({ emoji: r.emoji, at: new Date(r.created_at).getTime() }));
    } else {
      const { data } = await supabase
        .from('session_messages').select('*')
        .eq('session_id', sessionId).order('created_at', { ascending: false }).limit(100);
      setMessages((data || []).reverse());
    }
    const { data: mr } = await supabase.from('session_message_reactions')
      .select('message_id, user_id, emoji').eq('session_id', sessionId).limit(5000);
    setMsgReactions(mr || []);
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
  const sendMessage = async (e, isTip = false, tipAmt = null) => {
    e?.preventDefault();
    if (!isTip && !chatInput.trim()) return;
    if (!user || sending || myBan || (slowLeft > 0 && !isMod)) return;
    setSending(true);
    const { data: profile } = await supabase.from('artists').select('artist_name, profile_image_url').eq('user_id', user.id).maybeSingle();
    const { data: listener } = !profile ? await supabase.from('listeners').select('display_name').eq('user_id', user.id).maybeSingle() : { data: null };
    const { data: sent, error } = await supabase.from('session_messages').insert({
      session_id: sessionId,
      user_id:    user.id,
      content:    chatInput.trim(),
      name:       profile?.artist_name || listener?.display_name || 'Listener',
      avatar:     profile?.profile_image_url || null,
      is_tip:     isTip,
      tip_amount: tipAmt,
      ...(replyTo && !isTip ? { reply_to_id: replyTo.id } : {}),
    }).select('*').single();
    setSending(false);
    if (error) {
      await loadMyBan();
      flash(session?.slow_mode_seconds && !isMod
        ? `Slow mode is on. One message every ${session.slow_mode_seconds} seconds.`
        : "You can't send messages in this chat right now.");
      return;
    }
    if (sent) setMessages(prev => prev.some(m => m.id === sent.id) ? prev : [...prev, sent]);
    setChatInput('');
    setReplyTo(null);
    atBottomRef.current = true;
    if (session?.slow_mode_seconds && !isMod) setSlowLeft(session.slow_mode_seconds);
  };

  // Called after PayPal tip completes — inject a tip message into chat
  const onTipSent = async (amount, tipMessage) => {
    const { data: profile } = await supabase.from('artists').select('artist_name, profile_image_url').eq('user_id', user.id).maybeSingle();
    const { data: listener } = !profile ? await supabase.from('listeners').select('display_name').eq('user_id', user.id).maybeSingle() : { data: null };
    await supabase.from('session_messages').insert({
      session_id: sessionId,
      user_id:    user.id,
      content:    (tipMessage || chatInput || '').trim(),
      name:       profile?.artist_name || listener?.display_name || 'Listener',
      avatar:     profile?.profile_image_url || null,
      is_tip:     true,
      tip_amount: parseFloat(amount) || 0,
    });
    setChatInput('');
  };

  // How many reactions landed in the last few seconds, for the combo badge.
  const [combo, setCombo] = useState(0);
  const comboTimes = useRef([]);
  const lastReactionId = reactions.length ? reactions[reactions.length - 1].id : 0;
  useEffect(() => {
    if (!lastReactionId) return undefined;
    const now = Date.now();
    comboTimes.current = [...comboTimes.current.filter(t => now - t < 4000), now];
    setCombo(comboTimes.current.length);
    const t = setTimeout(() => {
      comboTimes.current = comboTimes.current.filter(x => Date.now() - x < 4000);
      setCombo(comboTimes.current.length);
    }, 4100);
    return () => clearTimeout(t);
  }, [lastReactionId]);

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
    // Kept, so the replay plays it back at this moment.
    if (user?.id && session?.status === 'live') {
      supabase.from('session_reactions').insert({ session_id: sessionId, user_id: user.id, emoji }).then(() => {}, () => {});
    }
  };

  // Reactions on a chat message: one of each emoji per person, tap again to take it back.
  const toggleMsgReaction = async (msg, emoji) => {
    if (!user?.id || !msg?.id) return;
    const mine = msgReactions.some(r => r.message_id === msg.id && r.user_id === user.id && r.emoji === emoji);
    if (mine) {
      setMsgReactions(prev => prev.filter(r => !(r.message_id === msg.id && r.user_id === user.id && r.emoji === emoji)));
      await supabase.from('session_message_reactions').delete()
        .eq('message_id', msg.id).eq('user_id', user.id).eq('emoji', emoji);
    } else {
      setMsgReactions(prev => [...prev, { message_id: msg.id, user_id: user.id, emoji }]);
      const { error } = await supabase.from('session_message_reactions')
        .insert({ message_id: msg.id, session_id: sessionId, user_id: user.id, emoji });
      if (error && error.code !== '23505') {
        setMsgReactions(prev => prev.filter(r => !(r.message_id === msg.id && r.user_id === user.id && r.emoji === emoji)));
        flash("You can't react in this chat right now.");
      }
    }
  };

  // The link anyone can open: the stream, its countdown or its replay.
  const shareStream = async () => {
    const url = `https://www.feelzmachine.com/session/${sessionId}`;
    const hostName = session?.artists?.artist_name || 'Feelz Machine';
    const text = session?.status === 'live' ? `${hostName} is live on Feelz Machine`
      : session?.status === 'scheduled' ? `${hostName} goes live on Feelz Machine`
      : `Watch ${hostName} on Feelz Machine`;
    try {
      if (navigator.share) { await navigator.share({ title: session?.title || text, text, url }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); flash('Link copied. Paste it anywhere.'); }
    catch { window.prompt('Copy this link', url); }
  };

  // Replay clock: the video position, as the time it was during the stream.
  const onReplayTime = useCallback((t) => {
    const sec = Math.floor(t);
    setReplayT(prev => (prev === sec ? prev : sec));
    // Reactions that happened since the last tick float up again. A seek
    // (a jump of more than a few seconds) skips them rather than flooding.
    const last = replayLastRef.current;
    replayLastRef.current = t;
    if (last === null || t < last || t - last > 4) return;
    const base = replayBaseRef.current;
    if (!base) return;
    const from = base + last * 1000, to = base + t * 1000;
    const due = replayReactionsRef.current.filter(r => r.at > from && r.at <= to).slice(0, 12);
    due.forEach((r, i) => {
      setTimeout(() => {
        const id = ++reactionIdRef.current;
        const left = 10 + Math.random() * 80;
        setReactions(prev => [...prev, { emoji: r.emoji, id, left }]);
        setTimeout(() => setReactions(prev => prev.filter(x => x.id !== id)), 2000);
      }, i * 60);
    });
  }, []);
  const replayBaseRef = useRef(0);

  if (loading) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Loader className="w-6 h-6 animate-spin text-white/30" />
      {slowLoad && (
        <>
          <p className="text-sm text-white/60">Still connecting to the stream.</p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-full bg-white text-black text-sm font-bold">
            Try again
          </button>
        </>
      )}
    </div>
  );

  if (!session) return null;

  const currentTrack = queue.find(q => q.track_id === session.current_track_id)?.tracks;
  const ytId = extractYouTubeId(session.youtube_url || '');
  const host = session.artists || {};
  const isScheduled = session.status === 'scheduled';
  const isEnded = session.status === 'ended';
  const isReplay = isEnded && !session.replay_hidden && (!!ytId || (session.mode === 'direct' && !!session.cf_live_uid));

  // Replays bring the chat, tips and reactions back in at the moment they
  // happened: video position + when the stream went live (+ the host's nudge).
  const replayBase = isReplay
    ? new Date(session.live_started_at || session.started_at || 0).getTime() + (session.replay_offset_seconds || 0) * 1000
    : 0;
  replayBaseRef.current = replayBase;
  const replayCut = isReplay && replayT !== null ? replayBase + replayT * 1000 : null;
  const shownMessages = !isReplay ? messages
    : replayCut === null ? [] : messages.filter(m => new Date(m.created_at).getTime() <= replayCut);
  const replayTip = replayCut !== null
    ? [...shownMessages].reverse().find(m => m.is_tip && replayCut - new Date(m.created_at).getTime() < 6000)
    : null;
  // Reactions under each message: [{ emoji, count, mine }]
  const reactionsByMsg = {};
  msgReactions.forEach(r => {
    const list = reactionsByMsg[r.message_id] || (reactionsByMsg[r.message_id] = []);
    let row = list.find(x => x.emoji === r.emoji);
    if (!row) { row = { emoji: r.emoji, count: 0, mine: false }; list.push(row); }
    row.count += 1;
    if (r.user_id === user?.id) row.mine = true;
  });
  const canReact = !!user && !isEnded && !myBan;
  const shiftReplayChat = async (secs) => {
    const next = (session.replay_offset_seconds || 0) + secs;
    await updateSession({ replay_offset_seconds: next });
    replayLastRef.current = null;
  };
  const onStage = reviewQueue.find(q => q.status === 'reviewing');
  const waitingReviews = reviewQueue.filter(q => q.status === 'pending');
  const myPlace = waitingReviews.find(q => q.is_mine)?.place || null;
  const reviewedHere = reviewQueue.filter(q => q.status === 'reviewed');

  const goLiveNow = async () => {
    await updateSession({ status: 'live', started_at: new Date().toISOString() });
    const { data: { session: auth } } = await supabase.auth.getSession();
    fetch('/.netlify/functions/notify-session-live', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, artist_id: session.artist_id, token: auth?.access_token }),
    }).catch(() => {});
    flash("You're live. Everyone waiting has been told.");
  };
  const toggleReviewsOpen = async () => {
    if (!isHost) { flash('Only the host can pause submissions.'); return; }
    await updateSession({ reviews_open: !session.reviews_open });
  };
  const hideReplay = async () => {
    await updateSession({ replay_hidden: !session.replay_hidden });
    flash(session.replay_hidden ? 'The replay is showing again' : 'The replay is hidden from fans');
  };
  const calendarHref = () => {
    if (!session.scheduled_at) return null;
    const start = new Date(session.scheduled_at);
    const end = new Date(start.getTime() + 60 * 60000);
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const url = `${window.location.origin}/session/${sessionId}`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Feelz Machine//Live//EN', 'BEGIN:VEVENT',
      `UID:${sessionId}@feelzmachine.com`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
      `SUMMARY:${(host.artist_name || 'Live')}: ${(session.title || 'Live stream').replace(/[,;]/g, ' ')}`,
      `DESCRIPTION:Watch live on Feelz Machine ${url}`, `URL:${url}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  };
  const floating = (
    <>
      {reactions.map(r => <FloatingReaction key={r.id} emoji={r.emoji} id={r.id} left={r.left} />)}
      {onStage && !isEnded && (
        // On screen for everyone while a track is reviewed: the artwork, who
        // made it and a little about them.
        <div className="fm-review-card absolute left-2 sm:left-3 bottom-14 sm:bottom-16 w-[min(78%,440px)] flex items-stretch gap-3 p-2 sm:p-2.5 rounded-2xl bg-black/75 backdrop-blur-md border border-pink-400/40 shadow-[0_0_40px_rgba(236,72,153,0.4)]">
          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-white/10 flex-shrink-0 ring-1 ring-white/10">
            {onStage.cover_url ? <img src={onStage.cover_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-6 h-6 text-white/40 m-auto mt-5 sm:mt-9" />}
          </div>
          <div className="min-w-0 flex-1 py-0.5">
            <p className="text-[9px] sm:text-[10px] font-black tracking-[0.2em] text-pink-300">
              NOW REVIEWING{onStage.source === 'sessions' ? ' · SESSIONS' : ''}
            </p>
            <p className="text-sm sm:text-base font-black text-white truncate leading-tight mt-0.5">{onStage.track_title}</p>
            <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
              {onStage.artist_image && <img src={onStage.artist_image} alt="" className="w-4 h-4 sm:w-5 sm:h-5 rounded-full object-cover flex-shrink-0" />}
              <p className="text-[11px] sm:text-xs font-bold text-white/80 truncate">{onStage.artist_name}</p>
            </div>
            {onStage.artist_bio && (
              <p className="hidden sm:block text-[11px] text-white/55 leading-snug mt-1 line-clamp-2">{onStage.artist_bio}</p>
            )}
          </div>
        </div>
      )}
      {replayTip && (
        <div className="absolute left-0 right-0 top-14 flex justify-center pointer-events-none">
          <div key={replayTip.id} className="fm-combo px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-pink-500 text-black text-xs font-black shadow-[0_0_30px_rgba(251,191,36,0.5)] whitespace-nowrap">
            {replayTip.name || 'Someone'} tipped ${Number(replayTip.tip_amount || 0).toFixed(Number(replayTip.tip_amount) % 1 ? 2 : 0)}
          </div>
        </div>
      )}
      {combo >= 5 && (
        <div key={combo} className="fm-combo absolute right-3 bottom-16 px-3 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-amber-400 text-black text-sm font-black shadow-[0_0_30px_rgba(236,72,153,0.6)]">
          x{combo} HYPE
        </div>
      )}
    </>
  );
  const myName = (listeners.find(l => l.user_id === user?.id)?.name) || null;
  const sheetActions = {
    mention,
    pin: (m) => pinMessage(m),
    remove: (m) => deleteMessage(m),
    ban: (m, mins) => banUser(m, mins),
    mod: (m) => makeMod(m),
    unmod: (m) => removeMod(m.user_id, m.name),
    ...(canReact ? {
      react: (m, e) => toggleMsgReaction(m, e),
      reply: (m) => { setReplyTo(m); setTimeout(() => document.getElementById('fm-live-chat-input')?.focus(), 50); },
    } : {}),
  };
  const endPoll = async (poll) => {
    const { error } = await supabase.from('session_polls').update({ expires_at: new Date().toISOString() }).eq('id', poll.id);
    if (error) flash('Could not end that poll.'); else loadPolls();
  };
  // Open until you vote, then folded, unless you open it again.
  const mobilePollOpen = polls.length > 0 && (pollFolded === null ? !polls[0].my_vote && new Date(polls[0].expires_at) > new Date() : !pollFolded);
  const SLOW_STEPS = [0, 5, 15, 30, 60];
  const slowModeChips = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] font-bold text-white/50 inline-flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> Slow mode</span>
      {SLOW_STEPS.map(sec => (
        <button key={sec} onClick={() => setSlowMode(sec)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition ${(session.slow_mode_seconds || 0) === sec ? 'bg-white text-black' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'}`}>
          {sec ? `${sec}s` : 'Off'}
        </button>
      ))}
    </div>
  );

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
        <span className="px-2 py-1 rounded-md bg-white/20 text-white text-[10px] font-black tracking-wider">{isReplay ? 'REPLAY' : 'ENDED'}</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-black tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
        </span>
      )}
      <button onClick={() => setShowListeners(v => !v)}
        className="pointer-events-auto inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/40 backdrop-blur text-white text-[11px] font-bold">
        <Users className="w-3.5 h-3.5" /> {listenerCount}
      </button>
      <button onClick={shareStream} aria-label="Share this stream"
        className="pointer-events-auto w-8 h-8 flex items-center justify-center rounded-full bg-black/40 backdrop-blur hover:bg-black/60 transition">
        <Share2 className="w-4 h-4 text-white" />
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
              {isReplay ? (
                session.mode === 'direct' ? (
                  <DirectStage
                    src={direct.replayHls}
                    onAir={direct.replayReady}
                    replay
                    poster={session.thumbnail_url || direct.poster}
                    title={session.title}
                    hostName={host.artist_name}
                    hostImage={host.profile_image_url}
                    topBar={stageTopBar}
                    overlay={floating}
                    onTime={onReplayTime}
                  />
                ) : (
                  <LiveStage
                    videoId={ytId}
                    title={session.title}
                    hostName={host.artist_name}
                    hostImage={host.profile_image_url}
                    isHost={isHost}
                    replay
                    poster={session.thumbnail_url || null}
                    topBar={stageTopBar}
                    overlay={floating}
                    onTime={onReplayTime}
                  />
                )
              ) : isScheduled ? (
                <div className="relative aspect-video overflow-hidden bg-black flex flex-col items-center justify-center text-center px-6">
                  {session.thumbnail_url
                    ? <img src={session.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                    : host.profile_image_url && <img src={host.profile_image_url} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />
                  <p className="relative text-[10px] font-black tracking-[0.3em] text-amber-300 uppercase">Going live</p>
                  <p className="relative mt-1 text-sm sm:text-base font-bold text-white/80">
                    {session.scheduled_at ? new Date(session.scheduled_at).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Soon'}
                  </p>
                  <Countdown to={session.scheduled_at} />
                  <div className="relative mt-4 flex flex-wrap justify-center gap-2">
                    {!isHost && (
                      <button onClick={toggleReminder}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black transition ${reminded ? 'bg-white/15 text-white' : 'bg-white text-black'}`}>
                        <Bell className="w-3.5 h-3.5" /> {reminded ? 'Reminder set' : 'Remind me'}
                      </button>
                    )}
                    {session.scheduled_at && (
                      <a href={calendarHref()} download="feelz-machine-live.ics"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/15 text-white text-xs font-black">
                        <CalendarPlus className="w-3.5 h-3.5" /> Add to calendar
                      </a>
                    )}
                  </div>
                  {reminderCount > 0 && <p className="relative mt-3 text-[11px] text-white/50">{reminderCount} {reminderCount === 1 ? 'person is' : 'people are'} coming</p>}
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent px-3 pt-3 pb-8 text-left">{stageTopBar}</div>
                </div>
              ) : isEnded ? (
                <div className="relative aspect-video overflow-hidden bg-black flex flex-col items-center justify-center text-center px-6">
                  {host.profile_image_url && <img src={host.profile_image_url} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40" />}
                  <p className="relative text-3xl font-black italic uppercase tracking-tight fm-gradient-text">That's a wrap</p>
                  <p className="relative mt-2 text-sm text-white/60">{host.artist_name || 'The artist'} has ended the stream. Thanks for being here.</p>
                  <div className="relative mt-4 flex gap-2">
                    {host.slug && <button onClick={() => navigate(`/artist/${host.slug}`)} className="px-4 py-2 rounded-full bg-white text-black text-xs font-black">See their music</button>}
                    <button onClick={() => navigate('/')} className="px-4 py-2 rounded-full bg-white/15 text-white text-xs font-black">Home</button>
                  </div>
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent px-3 pt-3 pb-8 text-left">{stageTopBar}</div>
                </div>
              ) : directMode ? (
                <DirectStage
                  src={direct.hls}
                  onAir={direct.onAir}
                  poster={direct.poster}
                  title={session.title}
                  hostName={host.artist_name}
                  hostImage={host.profile_image_url}
                  overlay={floating}
                  topBar={stageTopBar}
                />
              ) : session.mode === 'youtube' && ytId ? (
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
          {isHost && isScheduled && (
            <button onClick={goLiveNow}
              className="mx-4 lg:mx-0 mt-3 w-[calc(100%-2rem)] lg:w-full py-3 rounded-2xl bg-red-500 hover:bg-red-400 text-white text-sm font-black inline-flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(239,68,68,0.45)]">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Go live now
            </button>
          )}
          {/* The stream's own thumbnail: Feelz Live, Home, Library, the replay
              and shared links. The video's thumbnail on YouTube is not touched. */}
          {isHost && (
            <div className="mx-4 lg:mx-0 mt-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
              <StreamThumbPicker compact artistId={session.artist_id} value={session.thumbnail_url || null}
                fallback={ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null}
                onChange={async (url) => {
                  await updateSession({ thumbnail_url: url });
                  flash(url ? 'Thumbnail updated' : 'Thumbnail removed');
                }} />
            </div>
          )}
          {isHost && isEnded && (
            <div className="mx-4 lg:mx-0 mt-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center gap-3">
              <p className="text-xs text-white/60 flex-1">
                {session.replay_hidden ? 'This replay is hidden from fans.' : 'Fans can watch this replay from your streams.'}
              </p>
              <button onClick={hideReplay} className="px-3 py-2 rounded-xl bg-white/10 text-xs font-black">
                {session.replay_hidden ? 'Show replay' : 'Hide replay'}
              </button>
            </div>
          )}
          {isHost && isReplay && (
            <div className="mx-4 lg:mx-0 mt-2 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
              <p className="text-xs text-white/60">
                The chat, tips and reactions play back as they happened. If they land a little early or late against the video, nudge them.
              </p>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button onClick={() => shiftReplayChat(-15)} className="px-3 py-2 rounded-xl bg-white/10 text-xs font-black">Chat is late: 15s sooner</button>
                <button onClick={() => shiftReplayChat(15)} className="px-3 py-2 rounded-xl bg-white/10 text-xs font-black">Chat is early: 15s later</button>
                {!!session.replay_offset_seconds && (
                  <span className="text-[11px] text-white/40">{session.replay_offset_seconds > 0 ? '+' : ''}{session.replay_offset_seconds}s</span>
                )}
              </div>
            </div>
          )}

          {isHost && !isEnded && (
            <div className="mx-4 lg:mx-0 mt-3 p-3 rounded-2xl bg-white/[0.04] border border-white/[0.07] space-y-3">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => updateSession({ mode: 'audio' })}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${session.mode === 'audio' ? 'bg-white text-black' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'}`}>
                  <Music className="w-3.5 h-3.5" /> Audio
                </button>
                <button onClick={() => updateSession({ mode: 'youtube' })}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${session.mode === 'youtube' ? 'bg-gradient-to-r from-pink-500 to-violet-500 text-white' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'}`}>
                  <Radio className="w-3.5 h-3.5" /> YouTube stream
                </button>
                {directCfg.canHost && (
                  <button onClick={switchToDirect}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${session.mode === 'direct' ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white' : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]'}`}>
                    <Radio className="w-3.5 h-3.5" /> Direct from OBS
                  </button>
                )}
                <button onClick={() => setShowPollModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-violet-500/15 text-violet-200 hover:bg-violet-500/25 transition">
                  <BarChart2 className="w-3.5 h-3.5" /> Poll
                </button>
                <button onClick={() => setShowReviewQueue(v => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/[0.06] text-white/60 hover:bg-white/[0.1] transition">
                  <Music className="w-3.5 h-3.5" /> Live reviews{waitingReviews.length ? ` (${waitingReviews.length})` : ''}
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

              {slowModeChips}

              <div>
                <button onClick={() => setShowMods(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-black/30 border border-white/[0.08] text-xs font-bold text-white/70 hover:bg-black/50 transition">
                  <span className="inline-flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-emerald-400" /> Moderators ({modIds.size})</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMods ? 'rotate-180' : ''}`} />
                </button>
                {showMods && (
                  <div className="mt-2 p-3 rounded-xl bg-black/30 border border-white/[0.06] space-y-2">
                    {[...modIds].map(id => (
                      <div key={id} className="flex items-center gap-2">
                        <span className="px-1.5 py-px rounded bg-emerald-400 text-black text-[9px] font-black">MOD</span>
                        <span className="text-xs font-bold flex-1 truncate">{modNames[id] || 'Moderator'}</span>
                        <button onClick={() => removeMod(id, modNames[id])} className="text-[11px] font-bold text-red-300 hover:text-red-200">Remove</button>
                      </div>
                    ))}
                    <p className="text-[11px] text-white/40 leading-relaxed">
                      To add one, tap their name in the chat and choose Make moderator. Moderators can pin, remove
                      messages, time people out, run polls and set slow mode, on all your streams.
                    </p>
                  </div>
                )}
              </div>

              {directMode && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/[0.08]">
                  <span className={`w-2.5 h-2.5 rounded-full ${direct.onAir ? 'bg-red-500 animate-pulse' : 'bg-white/30'}`} />
                  <p className="text-xs text-white/70 flex-1">
                    {direct.onAir ? 'Your video is reaching fans.' : 'Waiting for your video. Start streaming in OBS with your settings from Live Studio.'}
                  </p>
                  <button onClick={() => navigate('/live/studio')} className="px-3 py-1.5 rounded-lg bg-white/10 text-[11px] font-black">OBS settings</button>
                </div>
              )}
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
                    switch monetisation off for it. Fans watch in Feelz Machine with this chat.
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
                  queue={reviewQueue}
                  reviewsOpen={session.reviews_open !== false}
                  onToggleOpen={toggleReviewsOpen}
                  onChanged={() => { loadReviewQueue(); loadPolls(); }}
                  flash={flash}
                  isAudioMode={session.mode === 'audio'}
                  canAddSessions={!!isHost && !!isAdmin}
                  onQueueForEveryone={async (item) => {
                    const { data: t } = await supabase.from('tracks').select('id, title, cover_artwork_url, file_url, duration').eq('id', item.track_id).maybeSingle();
                    if (t) { await addToQueue(t); flash(`"${t.title}" added to the queue`); }
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

          {/* Moderator tools */}
          {!isHost && isMod && (
            <div className="mx-4 lg:mx-0 mt-3 p-3 rounded-2xl bg-emerald-400/[0.06] border border-emerald-400/20 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-px rounded bg-emerald-400 text-black text-[9px] font-black">MOD</span>
                <span className="text-xs font-bold text-white/70 flex-1">Tap any message to pin, remove or time someone out.</span>
                <button onClick={() => setShowPollModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 transition">
                  <BarChart2 className="w-3.5 h-3.5" /> Poll
                </button>
              </div>
              {slowModeChips}
              <ReviewQueuePanel
                sessionId={sessionId}
                queue={reviewQueue}
                reviewsOpen={session.reviews_open !== false}
                onToggleOpen={toggleReviewsOpen}
                onChanged={() => { loadReviewQueue(); loadPolls(); }}
                flash={flash}
                isAudioMode={false}
                canAddSessions={!!isHost && !!isAdmin}
              />
            </div>
          )}

          {/* Live reviews, as fans see them */}
          {!isHost && !isEnded && (waitingReviews.length > 0 || session.reviews_open !== false) && (
            <div className="mx-4 lg:mx-0 mt-3 p-3 rounded-2xl bg-gradient-to-r from-violet-500/15 via-white/[0.03] to-pink-500/15 border border-violet-400/20 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center flex-shrink-0">
                <Music className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-white">Live reviews</p>
                <p className="text-[11px] text-white/60 truncate">
                  {myPlace ? `You're number ${myPlace} in the queue. Stay close.`
                    : waitingReviews.length ? `${waitingReviews.length} ${waitingReviews.length === 1 ? 'track' : 'tracks'} waiting. Get yours rated live.`
                    : 'Send a track and the room rates it live.'}
                  {session.artists?.paypal_email ? ' Gifts move you up.' : ''}
                </p>
              </div>
              {user && session.reviews_open !== false && (
                <button onClick={() => setShowSubmitModal(true)}
                  className="px-3 py-2 rounded-xl bg-white text-black text-xs font-black flex-shrink-0">Send yours</button>
              )}
            </div>
          )}

          {/* What was reviewed on this stream */}
          {reviewedHere.length > 0 && (
            <div className="mx-4 lg:mx-0 mt-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
              <p className="text-[10px] font-black tracking-[0.2em] uppercase text-white/50 mb-2">Reviewed on this stream</p>
              <div className="space-y-2">
                {reviewedHere.map(r => (
                  <div key={r.id} className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                      {r.cover_url ? <img src={r.cover_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-4 h-4 text-white/30 m-auto mt-2.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{r.track_title}</p>
                      <p className="text-[10px] text-white/40 truncate">{r.artist_name}</p>
                    </div>
                    {r.verdict?.good_pct != null && (
                      <span className="px-2 py-1 rounded-lg bg-gradient-to-r from-pink-500/30 to-violet-500/30 text-[11px] font-black">{r.verdict.good_pct}% fire</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Polls (under the stage on big screens) */}
          {polls.length > 0 && (
            <div className="hidden lg:block mt-3 space-y-2">
              {polls.map(poll => <SessionPollCard key={poll.id} poll={poll} userId={user?.id} onVote={castVote} canEnd={isMod} onEnd={endPoll} />)}
            </div>
          )}
        </div>

        {/* ── Right: chat ────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col mt-3 lg:mt-0 lg:rounded-3xl lg:bg-white/[0.03] lg:border lg:border-white/[0.07] lg:overflow-hidden">
          <div className="hidden lg:flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <p className="text-xs font-black tracking-[0.2em] uppercase text-white/60">Live chat</p>
            <span className="inline-flex items-center gap-1 text-[11px] text-white/40"><Users className="w-3.5 h-3.5" /> {listenerCount}</span>
          </div>

          {/* On phones the newest poll folds into one line, so the chat keeps its room. */}
          {polls.length > 0 && (
            <div className="lg:hidden flex-shrink-0 px-3 pt-2">
              {mobilePollOpen ? (
                <div>
                  <div className="flex justify-end mb-1">
                    <button onClick={() => setPollFolded(true)} aria-label="Fold poll"
                      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-white/[0.06] text-[11px] font-bold text-white/60">
                      Hide poll <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                    </button>
                  </div>
                  <div className="-m-2 max-h-72 overflow-y-auto">
                    <SessionPollCard poll={polls[0]} userId={user?.id} onVote={castVote} canEnd={isMod} onEnd={endPoll} />
                  </div>
                </div>
              ) : (
                <button onClick={() => setPollFolded(false)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-gradient-to-r from-violet-500/20 to-pink-500/15 border border-violet-400/25 text-left">
                  <BarChart2 className="w-4 h-4 text-violet-200 flex-shrink-0" />
                  <span className="text-xs font-bold text-white truncate flex-1">{polls[0].question}</span>
                  <span className="text-[10px] font-black text-violet-100 px-2 py-0.5 rounded bg-white/10">{polls[0].my_vote ? 'RESULTS' : 'VOTE'}</span>
                </button>
              )}
            </div>
          )}

          {/* Pinned */}
          {session.pinned_text && (
            <div className="flex-shrink-0 mx-3 mt-2 p-3 rounded-2xl bg-amber-400/[0.08] border border-amber-300/25 flex items-start gap-2.5">
              <Pin className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black" style={{ color: nameColour(session.pinned_name) }}>{session.pinned_name || 'Pinned'}</p>
                <p className="text-sm text-white/90 leading-snug break-words">{session.pinned_text}</p>
              </div>
              {isMod && (
                <button onClick={() => pinMessage(null)} aria-label="Unpin" className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
              )}
            </div>
          )}

          <div className="relative flex-1 min-h-0">
          <div ref={chatScrollRef} onScroll={onChatScroll} className="absolute inset-0 overflow-y-auto">
            <div className="py-2">
              <div ref={chatEndRef} />
              {shownMessages.filter(m => m.is_tip).slice(-3).reverse().map((msg, i) => (
                <ChatMessage key={(msg.id || i) + '-tip'} msg={msg} hostUserId={host.user_id} isModUser={modIds.has(msg.user_id)} myName={myName} onTap={user ? setSheetMsg : null}
                  reactions={reactionsByMsg[msg.id]} onReact={canReact ? toggleMsgReaction : null} />
              ))}
              {shownMessages.filter(m => !m.is_tip).length === 0 && (
                <p className="text-center text-xs text-white/30 py-8">
                  {isReplay ? (replayCut === null || !replayT ? 'Press play and the chat comes in as it happened.' : 'The chat picks up as the stream goes on.') : 'Say hi. You are first.'}
                </p>
              )}
              {shownMessages.filter(m => !m.is_tip).reverse().map((msg, i) => (
                <ChatMessage key={msg.id || i} msg={msg} hostUserId={host.user_id} isModUser={modIds.has(msg.user_id)} myName={myName} onTap={user ? setSheetMsg : null}
                  reactions={reactionsByMsg[msg.id]} onReact={canReact ? toggleMsgReaction : null} />
              ))}
            </div>
          </div>
          {unseen > 0 && (
            <button onClick={jumpToLatest}
              className="absolute left-1/2 -translate-x-1/2 top-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-xs font-black shadow-lg">
              <ArrowDown className="w-3.5 h-3.5 rotate-180" /> {unseen} new
            </button>
          )}
          {notice && (
            <div className="absolute left-3 right-3 bottom-3 px-3 py-2 rounded-xl bg-black/90 border border-white/10 text-xs font-semibold text-white text-center">
              {notice}
            </div>
          )}
          </div>

          {/* Reactions and the message box */}
          <div className="flex-shrink-0 px-3 pb-safe pb-3 pt-2 border-t border-white/[0.06] space-y-2 bg-[#07060b]/80 backdrop-blur lg:bg-transparent">
            <div className={`flex items-center gap-2 ${isEnded ? 'hidden' : ''}`}>
              {REACTIONS.map(emoji => (
                <button key={emoji} onClick={() => sendReaction(emoji)} aria-label={`React ${emoji}`}
                  className="flex-1 h-10 text-xl rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] hover:-translate-y-0.5 active:scale-90 transition">
                  {emoji}
                </button>
              ))}
            </div>

            {!isHost && user && !isEnded && session.reviews_open !== false && (
              <button onClick={() => setShowSubmitModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-2xl bg-gradient-to-r from-violet-500/20 to-pink-500/20 border border-pink-500/25 text-xs text-pink-100 font-bold hover:from-violet-500/30 hover:to-pink-500/30 transition">
                <Music className="w-3.5 h-3.5" /> {myPlace ? `Your track is number ${myPlace}` : 'Get your track reviewed live'}
              </button>
            )}

            {user ? (
              isEnded ? (
                <p className="text-center text-xs text-white/40 py-2">{isReplay ? 'Chat from the live stream' : 'The stream has ended.'}</p>
              ) : myBan ? (
                <p className="text-center text-xs text-white/50 py-2.5 rounded-2xl bg-white/[0.04]">
                  {myBan.until ? `You can chat again at ${new Date(myBan.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : "You can't chat in this stream."}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {session.slow_mode_seconds > 0 && !isMod && (
                    <p className="text-[10px] text-white/40 inline-flex items-center gap-1"><Timer className="w-3 h-3" /> Slow mode: one message every {session.slow_mode_seconds}s</p>
                  )}
                  {replyTo && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border-l-2 border-pink-400">
                      <Reply className="w-3.5 h-3.5 text-pink-300 flex-shrink-0" />
                      <p className="text-[11px] text-white/60 truncate flex-1">
                        Replying to <span className="font-black" style={{ color: nameColour(replyTo.name) }}>{replyTo.name || 'Listener'}</span>{replyTo.content ? `: ${replyTo.content}` : ''}
                      </p>
                      <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="text-white/40 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                  <form onSubmit={sendMessage} className="flex gap-2">
                    <input id="fm-live-chat-input" value={chatInput} onChange={e => setChatInput(e.target.value)}
                      placeholder={replyTo ? `Reply to ${replyTo.name || 'them'}` : 'Say something'}
                      maxLength={200}
                      className="flex-1 min-w-0 px-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-2xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50" />
                    <button type="submit" disabled={!chatInput.trim() || sending || (slowLeft > 0 && !isMod)} aria-label="Send"
                      className="min-w-[44px] h-11 px-3 rounded-2xl bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center disabled:opacity-30 hover:brightness-110 active:scale-95 transition flex-shrink-0 text-xs font-black">
                      {slowLeft > 0 && !isMod ? `${slowLeft}s` : <Send className="w-4 h-4 text-white" />}
                    </button>
                  </form>
                </div>
              )
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
          artistId={session.artist_id}
          onClose={() => setShowPollModal(false)}
          onCreated={() => { setShowPollModal(false); loadPolls(); }}
        />
      )}

      <MessageSheet
        msg={sheetMsg}
        me={user?.id}
        isMod={isMod}
        isHost={!!isHost}
        hostUserId={host.user_id}
        isModUser={sheetMsg ? modIds.has(sheetMsg.user_id) : false}
        onClose={() => setSheetMsg(null)}
        actions={sheetActions}
      />

      {showSubmitModal && (
        <SubmitForReviewModal
          sessionId={sessionId}
          user={user}
          host={session.artists}
          onGiftSent={(amount, msg) => onTipSent(amount, msg)}
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={() => { setShowSubmitModal(false); loadReviewQueue(); }}
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
        .fm-combo { animation: fm-pop 0.35s cubic-bezier(.2,1.6,.4,1); }
        @keyframes fm-pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fm-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @media (prefers-reduced-motion: reduce) { .fm-spin, .fm-spin-slow, .fm-eq, .fm-sound-pill, .animate-float-up { animation: none; } }
      `}</style>
    </div>
  );
}
