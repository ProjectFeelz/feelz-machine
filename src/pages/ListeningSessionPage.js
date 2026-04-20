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
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Play, Pause, SkipForward, X, Users, Music, Radio,
  Plus, Search, Loader, Send, Youtube, Mic, MicOff,
  ChevronDown, Heart, Flame, Star, Zap, Trash2
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
function FloatingReaction({ emoji, id }) {
  return (
    <div
      key={id}
      className="absolute bottom-0 text-2xl pointer-events-none animate-float-up"
      style={{ left: `${10 + Math.random() * 80}%` }}
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
  const [audioLocked, setAudioLocked] = useState(false);

  const audioRef      = useRef(new Audio());
  const sessionSubRef = useRef(null);
  const chatEndRef    = useRef(null);
  const syncTimerRef  = useRef(null);
  const reactionIdRef = useRef(0);
  // Keep a ref to queue so syncAudio never closes over a stale copy
  const queueRef      = useRef([]);

  const isHost = artist && session?.artist_id === artist.id;

  // Mirror queue state into a ref so syncAudio always has the latest data
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // ── Load session ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    loadSession();
    loadMessages();

    // Track listener count
    const channel = supabase.channel(`session-presence-${sessionId}`, {
      config: { presence: { key: user?.id || 'anon' } }
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        setListenerCount(Object.keys(channel.presenceState()).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: user?.id, joined_at: new Date().toISOString() });
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

    // Realtime chat
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
      supabase.removeChannel(sessionSub);
      supabase.removeChannel(chatSub);
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      audioRef.current.pause();
    };
  }, [sessionId, user?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSession = async () => {
    const { data: s } = await supabase
      .from('listening_sessions').select('*, artists(artist_name, slug, profile_image_url)')
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

    // Compute expected playback position accounting for network latency
    const elapsed = s.is_playing
      ? (Date.now() - new Date(s.started_at).getTime()) / 1000
      : 0;
    const expectedPos = parseFloat(s.playback_pos || 0) + elapsed;
    const drift = Math.abs(audio.currentTime - expectedPos);
    if (drift > 2) audio.currentTime = Math.max(0, expectedPos);

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
    const id = ++reactionIdRef.current;
    setReactions(prev => [...prev, { emoji, id }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2000);
    // Broadcast to other listeners via Supabase realtime broadcast
    if (sessionSubRef.current) {
      sessionSubRef.current.send({
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
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-semibold text-white">LIVE</span>
          </div>
          <p className="text-xs text-white/40 truncate max-w-[180px]">{session.title}</p>
        </div>
        <div className="flex items-center space-x-1 text-white/40">
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs">{listenerCount}</span>
        </div>
      </div>

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
                          : <button onClick={() => removeFromQueue(q)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 transition flex-shrink-0">
                              <Trash2 className="w-3 h-3 text-red-400/50 hover:text-red-400" />
                            </button>
                        }
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Reactions overlay */}
        <div className="relative flex-shrink-0 h-8 mx-4 overflow-hidden pointer-events-none">
          {reactions.map(r => <FloatingReaction key={r.id} emoji={r.emoji} id={r.id} />)}
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="py-2">
            {messages.map((msg, i) => <ChatMessage key={msg.id || i} msg={msg} />)}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Reaction bar + chat input */}
        <div className="flex-shrink-0 px-4 pb-safe pb-4 pt-2 border-t border-white/[0.06] space-y-2">
          <div className="flex space-x-2">
            {REACTIONS.map(emoji => (
              <button key={emoji} onClick={() => sendReaction(emoji)}
                className="flex-1 py-1.5 text-xl rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-90 transition">
                {emoji}
              </button>
            ))}
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