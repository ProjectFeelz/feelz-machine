import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useMediaSession } from '../hooks/useMediaSession';

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
    if (nextTrack) {
      streamLoggedRef.current = false;
      audioRef.current.src = nextTrack.file_url;
      audioRef.current.volume = volumeRef.current;
      audioRef.current.play().catch(console.error);
      setCurrentTrack(nextTrack);
      setQueueIndex(nextIndex);
      setCurrentTime(0);
    }
  }, []);

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
      if (!userId) return;

      // 1. Insert stream record
      await supabase.from('streams').insert({
        track_id: trackId,
        user_id: userId,
        duration_played: Math.floor(audioRef.current.currentTime),
        completed: true,
        platform: 'web',
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      });

      // 2. Increment stream_count on the track
      const { data: track } = await supabase
        .from('tracks')
        .select('stream_count, artist_id, title')
        .eq('id', trackId)
        .single();

      if (!track) return;

      await supabase
        .from('tracks')
        .update({ stream_count: (track.stream_count || 0) + 1 })
        .eq('id', trackId);

      // 3. Increment total_streams on the primary artist
      const { data: art } = await supabase
        .from('artists')
        .select('total_streams, user_id')
        .eq('id', track.artist_id)
        .single();

      if (art) {
        await supabase
          .from('artists')
          .update({ total_streams: (art.total_streams || 0) + 1 })
          .eq('id', track.artist_id);
      }

      // 4. Stream milestone notifications are handled by the check_stream_milestones
      //    DB trigger — no manual insert needed here.

      // 5. Collab artists — also increment their total_streams
      const { data: collabs } = await supabase
        .from('collaborations')
        .select('artist_id')
        .eq('track_id', trackId)
        .eq('status', 'accepted');

      if (collabs?.length) {
        for (const collab of collabs) {
          if (collab.artist_id === track.artist_id) continue;
          const { data: collabArt } = await supabase
            .from('artists')
            .select('total_streams')
            .eq('id', collab.artist_id)
            .single();
          if (collabArt) {
            await supabase
              .from('artists')
              .update({ total_streams: (collabArt.total_streams || 0) + 1 })
              .eq('id', collab.artist_id);
          }
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
    setCurrentTime(0);
    setIsMinimized(false);
    if (trackList.length > 0) {
      setQueue(trackList);
      const idx = trackList.findIndex(t => t.id === track.id);
      const resolvedIdx = idx >= 0 ? idx : 0;
      setQueueIndex(resolvedIdx);
      queueRef.current = trackList;
      queueIndexRef.current = resolvedIdx;
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
    if (prevTrack) {
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

  const value = {
    currentTrack, isPlaying, duration, currentTime, volume, queue, queueIndex,
    shuffle, repeat, isMinimized, setIsMinimized, playTrack, togglePlay, seek,
    setVolume: setVolumeLevel, setVolumeLevel, playNext, playPrev, addToQueue,
    removeFromQueue, moveInQueue, playNextInQueue, clearQueue, toggleShuffle, toggleRepeat,
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
