import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useMediaSession } from '../hooks/useMediaSession';

// Preload a track's cover art into the browser cache so VinylRecord/Cassette show instantly
function preloadCover(track) {
  if (!track?.cover_artwork_url) return;
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.src = track.cover_artwork_url;
}

const PlayerContext = createContext({});

function PlayerProviderInner({ children, value, isPlaying, togglePlay, playNext, playPrev, currentTrack }) {
  useMediaSession({ currentTrack, isPlaying, togglePlay, playNext, playPrev });
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function PlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [duration, setDuration]         = useState(0);
  const [currentTime, setCurrentTime]   = useState(0);
  const [volume, setVolume]             = useState(1);
  const [queue, setQueue]               = useState([]);
  const [queueIndex, setQueueIndex]     = useState(-1);
  const [shuffle, setShuffle]           = useState(false);
  const [repeat, setRepeat]             = useState('none');
  const [isMinimized, setIsMinimized]   = useState(false);

  const audioRef        = useRef(new Audio());
  const audioRefB       = useRef(new Audio());  // second element for crossfade
  const crossfadingRef  = useRef(false);
  const CROSSFADE_SECS  = 3; // seconds of overlap
  const streamLoggedRef = useRef(false);
  const queueRef        = useRef([]);
  const queueIndexRef   = useRef(-1);
  const shuffleRef      = useRef(false);
  const repeatRef       = useRef('none');
  const volumeRef       = useRef(1);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  const fetchingSuggestionsRef = useRef(false);

  // When we reach the last 2 tracks in the queue, silently fetch similar tracks and append
  const extendQueueWithSuggestions = useCallback(async (currentTrack) => {
    if (fetchingSuggestionsRef.current || !currentTrack) return;
    fetchingSuggestionsRef.current = true;
    try {
      const filters = [];
      if (currentTrack.genre) filters.push(`genre.eq.${currentTrack.genre}`);
      if (currentTrack.mood)  filters.push(`mood.eq.${currentTrack.mood}`);

      const existingIds = queueRef.current.map(t => t.id).filter(Boolean);

      let query = supabase
        .from('tracks')
        .select('*, artists(artist_name, slug, profile_image_url)')
        .eq('is_published', true)
        .not('id', 'in', `(${existingIds.join(',')})`)
        .order('engagement_score', { ascending: false })
        .limit(10);

      if (filters.length > 0) query = query.or(filters.join(','));

      const { data } = await query;
      if (!data?.length) return;

      const normalised = data.map(t => ({
        ...t,
        artist_name: t.artists?.artist_name || t.artist_name || 'Unknown Artist',
        artist_slug: t.artists?.slug || null,
      }));

      setQueue(prev => [...prev, ...normalised]);
      queueRef.current = [...queueRef.current, ...normalised];
    } catch (err) {
      console.error('Queue suggestion error:', err);
    } finally {
      fetchingSuggestionsRef.current = false;
    }
  }, []);

  const playNextFromRef = useCallback(() => {
    const q   = queueRef.current;
    const idx = queueIndexRef.current;
    const isShuffled = shuffleRef.current;
    const rep = repeatRef.current;
    if (q.length === 0) return;
    let nextIndex;
    if (isShuffled) {
      nextIndex = Math.floor(Math.random() * q.length);
    } else {
      nextIndex = idx + 1;
      if (nextIndex >= q.length) {
        if (rep === 'all') { nextIndex = 0; } else { return; }
      }
    }
    const nextTrack = q[nextIndex];
    if (nextTrack?.file_url) {
      streamLoggedRef.current = false;

      // ── Crossfade: use a temporary second element to fade out the current
      // track, then switch audioRef (the primary, event-listened element) to
      // the new track once the overlap completes.
      // We never swap refs — audioRef stays as the primary element throughout
      // so all event listeners (timeupdate, ended, play, pause) remain valid.
      const primaryAudio = audioRef.current;
      const targetVol    = volumeRef.current;
      crossfadingRef.current = true;

      // Clone current playback into the secondary element so it can fade out
      const fadeOutAudio  = audioRefB.current;
      fadeOutAudio.src    = primaryAudio.src;
      fadeOutAudio.volume = targetVol;
      try {
        fadeOutAudio.currentTime = primaryAudio.currentTime;
        fadeOutAudio.play().catch(() => {});
      } catch {}

      // Switch the primary element to the new track immediately (silent)
      primaryAudio.src    = nextTrack.file_url;
      primaryAudio.volume = 0;
      primaryAudio.play().catch(console.error);

      setCurrentTrack(nextTrack);
      preloadCover(nextTrack);
      if (q[nextIndex + 1]) preloadCover(q[nextIndex + 1]);
      setQueueIndex(nextIndex);
      setCurrentTime(0);

      const steps    = 30;
      const interval = (CROSSFADE_SECS * 1000) / steps;
      let   step     = 0;

      const fade = setInterval(() => {
        step++;
        const progress        = step / steps;
        fadeOutAudio.volume   = Math.max(0, targetVol * (1 - progress));
        primaryAudio.volume   = Math.min(targetVol, targetVol * progress);
        if (step >= steps) {
          clearInterval(fade);
          fadeOutAudio.pause();
          fadeOutAudio.src    = '';
          fadeOutAudio.volume = targetVol;
          primaryAudio.volume = targetVol;
          crossfadingRef.current = false;
        }
      }, interval);

      // When 2 or fewer tracks remain, extend queue silently
      if (!shuffleRef.current && rep !== 'all' && q.length - nextIndex <= 2) {
        extendQueueWithSuggestions(nextTrack);
      }
    }
  }, [extendQueueWithSuggestions]);

  useEffect(() => {
    const audio = audioRef.current;
    const onTimeUpdate      = () => setCurrentTime(audio.currentTime);
    const onDurationChange  = () => setDuration(audio.duration || 0);
    const onEnded           = () => {
      if (repeatRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().catch(console.error);
      } else {
        playNextFromRef();
      }
    };
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener('timeupdate',     onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended',          onEnded);
    audio.addEventListener('play',           onPlay);
    audio.addEventListener('pause',          onPause);
    return () => {
      audio.removeEventListener('timeupdate',     onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended',          onEnded);
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
      audio.pause();
    };
  }, [playNextFromRef]);

  useEffect(() => {
    if (currentTime >= 30 && !streamLoggedRef.current && currentTrack) {
      streamLoggedRef.current = true;
      logStream(currentTrack.id);
    }
  }, [currentTime, currentTrack?.id]);

  const logStream = async (trackId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      // 1. Fetch track + artist FIRST
      const { data: track } = await supabase
        .from('tracks')
        .select('stream_count, artist_id, title')
        .eq('id', trackId)
        .single();

      if (!track) return;

      const { data: art } = await supabase
        .from('artists')
        .select('total_streams, user_id')
        .eq('id', track.artist_id)
        .single();

      // STREAM GUARD: owner plays never count
      if (userId && art?.user_id === userId) return;

      // Always increment counts — logged in or anonymous
      await supabase.rpc('increment_stream_count', { track_id: trackId });
      await supabase.rpc('increment_artist_streams', { artist_id: track.artist_id });

      // Anonymous listeners stop here — no streams table insert, no milestones
      if (!userId) return;

      // 2. Insert stream record (logged-in listeners only)
      await supabase.from('streams').insert({
        track_id: trackId,
        user_id: userId,
        duration_played: Math.floor(audioRef.current.currentTime),
        completed: true,
        platform: 'web',
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      });


      // 5. Stream milestone notifications for the artist are handled by DB trigger.

      // 5b. Fan milestone — celebrate the LISTENER's loyalty to this artist.
      //     "You've played [Artist] 100 times" — fires at 10, 50, 100, 250, 500, 1000.
      const FAN_MILESTONES = [10, 50, 100, 250, 500, 1000];
      try {
        const { count: totalPlays } = await supabase
          .from('streams')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('track_id',
            // Get all track IDs by this artist so we count artist-level plays
            (await supabase.from('tracks').select('id').eq('artist_id', track.artist_id))
              .data?.map(t => t.id) || [trackId]
          );

        if (FAN_MILESTONES.includes(totalPlays)) {
          const { data: artistInfo } = await supabase
            .from('artists').select('artist_name').eq('id', track.artist_id).maybeSingle();
          const name = artistInfo?.artist_name || 'this artist';

          const milestoneMessages = {
            10:   { title: `10 plays with ${name}`, message: `You keep coming back. That's what being a real fan looks like.` },
            50:   { title: `50 plays with ${name}`, message: `Fifty plays in. You clearly know something others don't.` },
            100:  { title: `100 plays with ${name} 🎯`, message: `One hundred plays. You're not just a listener — you're a supporter.` },
            250:  { title: `250 plays with ${name}`, message: `250 plays deep. The artist notices fans like you.` },
            500:  { title: `500 plays with ${name} 🔥`, message: `500 plays. That's dedication. Top fan energy.` },
            1000: { title: `1000 plays with ${name} 🏆`, message: `A thousand plays. Legendary listener status. This artist owes you one.` },
          };

          const msg = milestoneMessages[totalPlays];
          if (msg) {
            await supabase.from('notifications').insert({
              user_id:  userId,
              type:     'top_supporter',
              title:    msg.title,
              message:  msg.message,
              metadata: { artist_id: track.artist_id, artist_name: name, play_count: totalPlays, fan_milestone: true },
            }).catch(() => {});
          }
        }
      } catch { /* fan milestone is non-critical, never let it break playback */ }

      // 6. Collab artists — also increment their total_streams (skip if they're the listener)
      const { data: collabs } = await supabase
        .from('collaborations')
        .select('artist_id, artists!collaborations_artist_id_fkey(user_id)')
        .eq('track_id', trackId)
        .eq('status', 'accepted');

      if (collabs?.length) {
        for (const collab of collabs) {
          if (collab.artist_id === track.artist_id) continue;
          // Also skip if this collab artist is the current listener
          if (collab.artists?.user_id === userId) continue;
          await supabase.rpc('increment_artist_streams', { artist_id: collab.artist_id });
        }
      }
    } catch (err) {
      console.error('Failed to log stream:', err);
    }
  };

  const playTrack = useCallback((track, trackList = []) => {
    if (!track?.file_url) return;
    const audio = audioRef.current;
    if (currentTrack?.id === track.id) {
      if (isPlaying) { audio.pause(); } else { audio.play().catch(console.error); }
      setIsMinimized(false);
      return;
    }
    streamLoggedRef.current = false;
    audio.src = track.file_url;
    audio.volume = volumeRef.current;
    audio.play().catch(console.error);
    setCurrentTrack(track);
    preloadCover(track);
    setCurrentTime(0);
    setIsMinimized(false);
    if (trackList.length > 0) {
      setQueue(trackList);
      const idx = trackList.findIndex(t => t.id === track.id);
      const resolvedIdx = idx >= 0 ? idx : 0;
      setQueueIndex(resolvedIdx);
      queueRef.current = trackList;
      queueIndexRef.current = resolvedIdx;
      // Preload next track's cover too
      const nextIdx = resolvedIdx + 1;
      if (nextIdx < trackList.length) preloadCover(trackList[nextIdx]);
    }
  }, [currentTrack, isPlaying]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (isPlaying) { audio.pause(); } else { audio.play().catch(console.error); }
  }, [isPlaying]);

  const seek = useCallback((time) => {
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setVolumeLevel = useCallback((v) => {
    audioRef.current.volume = v;
    setVolume(v);
    volumeRef.current = v;
  }, []);

  const playNext = useCallback(() => { playNextFromRef(); }, [playNextFromRef]);

  const playPrev = useCallback(() => {
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const q   = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;
    let prevIndex = idx - 1;
    if (prevIndex < 0) {
      if (repeatRef.current === 'all') { prevIndex = q.length - 1; }
      else { audioRef.current.currentTime = 0; return; }
    }
    const prevTrack = q[prevIndex];
    if (prevTrack?.file_url) {
      streamLoggedRef.current = false;
      audioRef.current.src = prevTrack.file_url;
      audioRef.current.volume = volumeRef.current;
      audioRef.current.play().catch(console.error);
      setCurrentTrack(prevTrack);
      setQueueIndex(prevIndex);
      setCurrentTime(0);
    }
  }, []);

  const addToQueue      = useCallback((track) => { setQueue(prev => [...prev, track]); }, []);
  const removeFromQueue = useCallback((index) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
    setQueueIndex(prev => index < prev ? prev - 1 : prev);
  }, []);
  const moveInQueue = useCallback((from, to) => {
    setQueue(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);
  const playNextInQueue = useCallback((track) => {
    setQueue(prev => {
      const next = [...prev];
      next.splice(queueIndexRef.current + 1, 0, track);
      return next;
    });
  }, []);
  const clearQueue    = useCallback(() => { setQueue([]); setQueueIndex(-1); }, []);
  const toggleShuffle = useCallback(() => setShuffle(prev => !prev), []);
  const toggleRepeat  = useCallback(() => {
    setRepeat(prev => {
      if (prev === 'none') return 'all';
      if (prev === 'all')  return 'one';
      return 'none';
    });
  }, []);

  // Replaces the queue and index without re-triggering playback.
  // Used by pages that start playback immediately then resolve the full queue async.
  const replaceQueue = useCallback((list, idx) => {
    setQueue(list);
    queueRef.current = list;
    setQueueIndex(idx);
    queueIndexRef.current = idx;
  }, []);

  const value = {
    currentTrack, isPlaying, duration, currentTime, volume, queue, queueIndex,
    shuffle, repeat, isMinimized, setIsMinimized, playTrack, togglePlay, seek,
    setVolume: setVolumeLevel, setVolumeLevel, playNext, playPrev, addToQueue,
    removeFromQueue, moveInQueue, playNextInQueue, clearQueue, toggleShuffle, toggleRepeat,
    replaceQueue,
  };

  return (
    <PlayerProviderInner
      value={value}
      currentTrack={currentTrack}
      isPlaying={isPlaying}
      togglePlay={togglePlay}
      playNext={playNext}
      playPrev={playPrev}
    >
      {children}
    </PlayerProviderInner>
  );
}

export const usePlayer = () => useContext(PlayerContext);