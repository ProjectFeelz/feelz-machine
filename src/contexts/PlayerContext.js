import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const PlayerContext = createContext({});

export function PlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('none');
  const [isMinimized, setIsMinimized] = useState(true);

  const audioRef = useRef(new Audio());
  const streamLoggedRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => handleTrackEnd();
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.pause();
    };
  }, []);

  useEffect(() => {
    if (currentTime >= 30 && !streamLoggedRef.current && currentTrack) {
      streamLoggedRef.current = true;
      logStream(currentTrack.id);
    }
  }, [currentTime, currentTrack]);

  const logStream = async (trackId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.from('streams').insert({
        track_id: trackId,
        user_id: session?.user?.id || null,
        duration_played: Math.floor(currentTime),
        completed: true,
        platform: 'web',
        device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
      });
    } catch (err) {
      console.error('Failed to log stream:', err);
    }
  };

  const playTrack = useCallback((track, trackList = []) => {
    if (!track?.file_url) return;
    const audio = audioRef.current;
    if (currentTrack?.id === track.id) {
      if (isPlaying) { audio.pause(); } else { audio.play().catch(console.error); }
      return;
    }
    streamLoggedRef.current = false;
    audio.src = track.file_url;
    audio.volume = volume;
    audio.play().catch(console.error);
    setCurrentTrack(track);
    setCurrentTime(0);
    setIsMinimized(true);
    if (trackList.length > 0) {
      setQueue(trackList);
      const idx = trackList.findIndex(t => t.id === track.id);
      setQueueIndex(idx >= 0 ? idx : 0);
    }
  }, [currentTrack, isPlaying, volume]);

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
  }, []);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;
    let nextIndex;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeat === 'all') { nextIndex = 0; } else { return; }
      }
    }
    const nextTrack = queue[nextIndex];
    if (nextTrack) {
      streamLoggedRef.current = false;
      audioRef.current.src = nextTrack.file_url;
      audioRef.current.volume = volume;
      audioRef.current.play().catch(console.error);
      setCurrentTrack(nextTrack);
      setQueueIndex(nextIndex);
      setCurrentTime(0);
    }
  }, [queue, queueIndex, shuffle, repeat, volume]);

  const playPrev = useCallback(() => {
    if (currentTime > 3) { audioRef.current.currentTime = 0; setCurrentTime(0); return; }
    if (queue.length === 0) return;
    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      if (repeat === 'all') { prevIndex = queue.length - 1; } else { audioRef.current.currentTime = 0; return; }
    }
    const prevTrack = queue[prevIndex];
    if (prevTrack) {
      streamLoggedRef.current = false;
      audioRef.current.src = prevTrack.file_url;
      audioRef.current.volume = volume;
      audioRef.current.play().catch(console.error);
      setCurrentTrack(prevTrack);
      setQueueIndex(prevIndex);
      setCurrentTime(0);
    }
  }, [queue, queueIndex, currentTime, repeat, volume]);

  const handleTrackEnd = useCallback(() => {
    if (repeat === 'one') { audioRef.current.currentTime = 0; audioRef.current.play().catch(console.error); }
    else { playNext(); }
  }, [repeat, playNext]);

  const addToQueue = useCallback((track) => { setQueue(prev => [...prev, track]); }, []);
  const clearQueue = useCallback(() => { setQueue([]); setQueueIndex(-1); }, []);
  const toggleShuffle = useCallback(() => setShuffle(prev => !prev), []);
  const toggleRepeat = useCallback(() => {
    setRepeat(prev => { if (prev === 'none') return 'all'; if (prev === 'all') return 'one'; return 'none'; });
  }, []);

  const value = {
    currentTrack, isPlaying, duration, currentTime, volume, queue, queueIndex,
    shuffle, repeat, isMinimized, setIsMinimized, playTrack, togglePlay, seek,
    setVolume: setVolumeLevel, playNext, playPrev, addToQueue, clearQueue, toggleShuffle, toggleRepeat,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export const usePlayer = () => useContext(PlayerContext);
