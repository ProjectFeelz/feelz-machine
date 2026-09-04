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

function PlayerProviderInner({ children, value, isPlaying, togglePlay, playNext, playPrev, currentTrack, seek, currentTime, duration }) {
  useMediaSession({ currentTrack, isPlaying, togglePlay, playNext, playPrev, seek, currentTime, duration });
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
  // Which tab the desktop docked player panel opens on when triggered,
  // shared so DesktopPlayer's Queue button and FullPlayer's own tabs
  // drive the same single panel instead of two competing ones.
  const [desktopPanelView, setDesktopPanelView] = useState('player');

  const audioRef        = useRef(new Audio());
  const audioRefB       = useRef(new Audio());  // second element for crossfade
  const crossfadingRef  = useRef(false);
  const CROSSFADE_SECS  = 1.5; // seconds of overlap — short enough to not echo
  const streamLoggedRef = useRef(false);

  // ── Listening events ────────────────────────────────────────────────────
  // Taste signal capture for the For You model. Deliberately separate from
  // log_stream: that writes one row at 30 seconds with completed hardcoded
  // true and drives artist payouts, so it carries no completion signal and
  // must not be changed for scoring reasons.
  //
  // This lives in PlayerContext rather than in any single page so every
  // surface that plays through playTrack is covered by one write point.
  //
  // currentTrackRef mirrors currentTrack because the flush runs inside
  // callbacks and event listeners where the state value would be stale.
  const currentTrackRef  = useRef(null);
  const lastFlushedRef   = useRef(null);
  const geoRef           = useRef(null);

  // Approximate location for the play, from Netlify's edge geo header.
  // Resolved once and cached in sessionStorage: it does not change mid
  // listen, and a busy listener would otherwise hit this on every track
  // change. Any failure resolves to nulls rather than throwing, because a
  // play with unknown location must still be recorded.
  const resolveGeo = useCallback(async () => {
    if (geoRef.current) return geoRef.current;
    try {
      const cached = sessionStorage.getItem('feelz_geo');
      if (cached) {
        geoRef.current = JSON.parse(cached);
        return geoRef.current;
      }
    } catch {}
    try {
      const res = await fetch('/.netlify/functions/geo');
      const geo = await res.json();
      geoRef.current = geo;
      try { sessionStorage.setItem('feelz_geo', JSON.stringify(geo)); } catch {}
      return geo;
    } catch {
      geoRef.current = { country: null, country_name: null, city: null, region: null };
      return geoRef.current;
    }
  }, []);

  const flushListeningEvent = useCallback(async (endReason) => {
    const track = currentTrackRef.current;
    const audio = audioRef.current;
    if (!track || !audio) return;

    const listened = Math.floor(audio.currentTime || 0);
    // Under three seconds is a mis-tap or a queue skip-through, not a
    // listening decision. Recording it would be noise.
    if (listened < 3) return;

    // Guard against double flush when two paths fire for the same play,
    // for example ended followed by a track change.
    const flushKey = `${track.id}:${Math.floor(Date.now() / 1000)}`;
    if (lastFlushedRef.current === flushKey) return;
    lastFlushedRef.current = flushKey;

    const trackSeconds = Math.floor(audio.duration || track.duration || 0) || null;
    const pct = trackSeconds ? Math.min(100, Math.round((listened / trackSeconds) * 1000) / 10) : null;
    const geo = await resolveGeo();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      await supabase.from('listening_events').insert({
        user_id:          userId,
        track_id:         track.id,
        artist_id:        track.artist_id || null,
        genre:            track.genre || null,
        mood:             track.mood || null,
        bpm:              track.bpm || null,
        is_beat:          track.is_beat === true,
        listened_seconds: listened,
        track_seconds:    trackSeconds,
        completion_pct:   pct,
        end_reason:       endReason,
        event_source:     window.__feelz_play_source || 'unknown',
        country:          geo?.country || null,
        country_name:     geo?.country_name || null,
        city:             geo?.city || null,
        region:           geo?.region || null,
      });
    } catch {
      // Never let signal capture break playback. A lost event is a lost
      // data point, a thrown error here would be a broken player.
    }
  }, [resolveGeo]);
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
      // Exclude current track from shuffle pick
      if (q.length === 1) {
        nextIndex = 0;
      } else {
        do {
          nextIndex = Math.floor(Math.random() * q.length);
        } while (nextIndex === idx);
      }
    } else {
      nextIndex = idx + 1;
      if (nextIndex >= q.length) {
        if (rep === 'all') { nextIndex = 0; } else { return; }
      }
    }
    const nextTrack = q[nextIndex];
    if (nextTrack?.file_url) {
      // Before the crossfade overwrites the playhead, capture how far the
      // outgoing track actually got.
      flushListeningEvent('track_change');
      streamLoggedRef.current = false;

      // ── Crossfade: use a temporary second element to fade out the current
      // track, then switch audioRef (the primary, event-listened element) to
      // the new track once the overlap completes.
      // We never swap refs — audioRef stays as the primary element throughout
      // so all event listeners (timeupdate, ended, play, pause) remain valid.
      const primaryAudio = audioRef.current;
      const targetVol    = volumeRef.current;
      crossfadingRef.current = true;

      // Clone current position into fadeOut BEFORE pausing primary
      const fadeOutAudio    = audioRefB.current;
      const currentSrc      = primaryAudio.src;
      const currentPosition = primaryAudio.currentTime;

      // Pause primary immediately — prevents echo from two elements on same src
      primaryAudio.pause();

      // Set fadeOut to the OLD track at the exact playback position
      fadeOutAudio.src    = currentSrc;
      fadeOutAudio.volume = targetVol;
      try {
        fadeOutAudio.currentTime = currentPosition;
        fadeOutAudio.play().catch(() => {});
      } catch {}

      // Now switch primary to the NEW track (silent, fades in)
      primaryAudio.src    = nextTrack.file_url;
      primaryAudio.volume = 0;
      primaryAudio.load();
      const startFadeIn = () => {
        primaryAudio.play().catch(() => {});
        primaryAudio.removeEventListener('canplay', startFadeIn);
      };
      primaryAudio.addEventListener('canplay', startFadeIn);

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
  }, [extendQueueWithSuggestions, flushListeningEvent]);

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // Catches the listener closing the tab or backgrounding the app, which
  // is otherwise the most common way a play goes unrecorded.
  useEffect(() => {
    const onHide = () => { flushListeningEvent('page_hide'); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
    return () => {
      window.removeEventListener('pagehide', onHide);
    };
  }, [flushListeningEvent]);

  useEffect(() => {
    const audio = audioRef.current;
    const onTimeUpdate      = () => setCurrentTime(audio.currentTime);
    const onDurationChange  = () => setDuration(audio.duration || 0);
    const onEnded           = () => {
      flushListeningEvent('ended');
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
  }, [playNextFromRef, flushListeningEvent]);

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

      // 1. Fetch track title up front (still needed for notification copy below)
      const { data: track } = await supabase
        .from('tracks')
        .select('artist_id, title')
        .eq('id', trackId)
        .single();

      if (!track) return;

      // 2-4. Atomic RPC: inserts the stream row, increments tracks.stream_count,
      // increments artists.total_streams (+ collab artists), and self-stream
      // guard, all in a single Postgres transaction.
      const { data: logResult, error: logError } = await supabase.rpc('log_stream', {
        p_track_id: trackId,
        p_user_id: userId,
        p_duration_played: Math.floor(audioRef.current.currentTime),
        p_completed: true,
        p_platform: 'web',
        p_device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        p_source: window.__feelz_play_source || 'unknown',
      });

      if (logError || !logResult?.logged) return; // self-stream or track not found — bail like before

      const art = { user_id: logResult.owner_user_id };

      // 4b. first_listener — fire once when stream_count goes from 0 to 1
      // prior_stream_count is the BEFORE value, computed server-side inside the same transaction
      if (logResult.prior_stream_count === 0) {
        try {
          const { data: fullFirst } = await supabase
            .from('tracks')
            .select('title, slug, cover_artwork_url, file_url')
            .eq('id', trackId)
            .maybeSingle();
          // Fetch the listener's display name
          const { data: listenerArtist } = await supabase
            .from('artists')
            .select('id, artist_name, profile_image_url, slug')
            .eq('user_id', userId)
            .maybeSingle();
          const listenerName = listenerArtist?.artist_name || 'Someone';
          await supabase.from('notifications').insert({
            user_id:        art.user_id,
            artist_id:      track.artist_id,
            type:           'first_listener',
            title:          `🎯 First ever stream on ${fullFirst?.title || track.title}`,
            message:        `${listenerName} was your very first listener.`,
            from_artist_id: listenerArtist?.id || null,
            metadata: {
              track_id:          trackId,
              track_title:       fullFirst?.title || track.title,
              track_slug:        fullFirst?.slug || null,
              track_artwork:     fullFirst?.cover_artwork_url || null,
              file_url:          fullFirst?.file_url || null,
              from_artist_name:  listenerName,
              from_artist_image: listenerArtist?.profile_image_url || null,
              from_artist_slug:  listenerArtist?.slug || null,
            },
          });
        } catch { /* non-critical */ }
      }

      // 5. Notify artist of new stream (rich notification with track info)
      // DB trigger was dropped — we create it here so we control the metadata
      try {
        const { data: fullTrack } = await supabase
          .from('tracks')
          .select('title, cover_artwork_url, file_url, album_id, albums(title, cover_artwork_url)')
          .eq('id', trackId)
          .maybeSingle();

        // Group album tracks — only notify once per album session
        // Use track's album_id to determine title/artwork to show
        const isAlbumTrack = !!fullTrack?.album_id;
        const notifTitle   = isAlbumTrack
          ? `New stream on ${fullTrack.albums?.title || fullTrack.title}`
          : `New stream on ${fullTrack?.title}`;
        const notifArtwork = fullTrack?.cover_artwork_url
          || fullTrack?.albums?.cover_artwork_url;

        // Daily digest: one stream summary per artist per day
        // Count today's streams for this artist and upsert a single notification
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartISO = todayStart.toISOString();

        // Count today's total streams for this artist
        const { count: todayStreams } = await supabase
          .from('streams')
          .select('*', { count: 'exact', head: true })
          .eq('artist_id', track.artist_id)
          .gte('created_at', todayStartISO);

        // Find today's top track by stream count
        const { data: topTrackData } = await supabase
          .from('streams')
          .select('track_id, tracks(title, slug, cover_artwork_url, file_url)')
          .eq('artist_id', track.artist_id)
          .gte('created_at', todayStartISO);

        // Count per track
        const trackCounts = {};
        (topTrackData || []).forEach(s => {
          trackCounts[s.track_id] = (trackCounts[s.track_id] || 0) + 1;
        });
        const topTrackId = Object.entries(trackCounts).sort((a,b) => b[1]-a[1])[0]?.[0];
        const topTrack   = topTrackData?.find(s => s.track_id === topTrackId)?.tracks;

        const streamCount = todayStreams || 1;
        const topTitle    = topTrack?.title || fullTrack?.title;
        const digestTitle = streamCount === 1
          ? `First stream today on ${topTitle}`
          : `${streamCount} stream${streamCount > 1 ? 's' : ''} today — ${topTitle} leading`;

        // Check if we already have a today digest for this artist
        const { data: existingDigest } = await supabase
          .from('notifications')
          .select('id')
          .eq('type', 'new_stream')
          .eq('artist_id', track.artist_id)
          .gte('created_at', todayStartISO)
          .limit(1)
          .maybeSingle();

        if (existingDigest) {
          // Update the existing digest with fresh count and top track
          await supabase.from('notifications').update({
            title:   digestTitle,
            message: `${streamCount} stream${streamCount !== 1 ? 's' : ''} across your catalogue today`,
            metadata: {
              track_id:      topTrackId || trackId,
              track_slug:    topTrack?.slug || fullTrack?.slug || null,
              track_title:   topTitle,
              track_artwork: topTrack?.cover_artwork_url || notifArtwork,
              file_url:      topTrack?.file_url || fullTrack?.file_url,
              artist_id:     track.artist_id,
              stream_count:  streamCount,
              is_digest:     true,
            },
          }).eq('id', existingDigest.id);
        } else {
          // Insert first digest of the day
          await supabase.from('notifications').insert({
            user_id:   art.user_id,
            artist_id: track.artist_id,
            type:      'new_stream',
            title:     digestTitle,
            message:   `${streamCount} stream${streamCount !== 1 ? 's' : ''} across your catalogue today`,
            metadata: {
              track_id:      topTrackId || trackId,
              track_slug:    topTrack?.slug || fullTrack?.slug || null,
              track_title:   topTitle,
              track_artwork: topTrack?.cover_artwork_url || notifArtwork,
              file_url:      topTrack?.file_url || fullTrack?.file_url,
              artist_id:     track.artist_id,
              stream_count:  streamCount,
              is_digest:     true,
            },
          });
        }
      } catch { /* non-critical — never break playback */ }

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
            });
          }
        }
      } catch { /* fan milestone is non-critical, never let it break playback */ }

      // 6. Collab artist increments now handled atomically inside log_stream() above.
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
    flushListeningEvent('track_change');
    streamLoggedRef.current = false;
    audio.pause();
    audio.src = track.file_url;
    audio.volume = 0;
    audio.load();
    const playWhenReady = () => {
      audio.play().catch(() => {});
      // Fade in from silence to half the person's set volume. Never
      // straight to full. They can turn it up further themselves if they
      // want it louder; this just stops a track ever "starting shouting."
      const targetVol = volumeRef.current * 0.5;
      const steps      = 24;
      const durationMs = 1400;
      const interval   = durationMs / steps;
      let step = 0;
      const fadeIn = setInterval(() => {
        step++;
        audio.volume = Math.min(targetVol, targetVol * (step / steps));
        if (step >= steps) clearInterval(fadeIn);
      }, interval);
      audio.removeEventListener('canplay', playWhenReady);
    };
    audio.addEventListener('canplay', playWhenReady);
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
  }, [currentTrack, isPlaying, flushListeningEvent]);

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
      audioRef.current.pause();
      audioRef.current.src = prevTrack.file_url;
      audioRef.current.volume = volumeRef.current;
      audioRef.current.load();
      const playPrevWhenReady = () => {
        audioRef.current.play().catch(() => {});
        audioRef.current.removeEventListener('canplay', playPrevWhenReady);
      };
      audioRef.current.addEventListener('canplay', playPrevWhenReady);
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
      if (prev === 'none') return 'one'; // none → one (repeat current track)
      if (prev === 'one')  return 'all'; // one  → all (repeat queue)
      return 'none';                     // all  → none
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

  // Jump to a specific index in the current queue and start playing
  const jumpToIndex = useCallback((idx) => {
    const q = queueRef.current;
    if (!q || idx < 0 || idx >= q.length) return;
    const track = q[idx];
    if (!track) return;
    const audio = audioRef.current;
    audio.pause();
    audio.src = track.file_url;
    audio.volume = volumeRef.current;
    audio.play().catch(() => {
      audio.load();
      const onReady = () => { audio.play().catch(() => {}); audio.removeEventListener('canplay', onReady); };
      audio.addEventListener('canplay', onReady);
    });
    setCurrentTrack(track);
    setQueueIndex(idx);
    queueIndexRef.current = idx;
    setCurrentTime(0);
    streamLoggedRef.current = false;
    setIsMinimized(false);
  }, []); // eslint-disable-line

  // Expose replaceQueue globally so async callbacks (e.g. notification taps)
  // can patch the queue after playback has already started
  React.useEffect(() => {
    window.__feelz_replaceQueue = (list, idx) => {
      setQueue(list);
      queueRef.current = list;
      if (idx !== undefined) { setQueueIndex(idx); queueIndexRef.current = idx; }
    };
    return () => { window.__feelz_replaceQueue = null; };
  }, []); // eslint-disable-line

  const value = {
    currentTrack, isPlaying, duration, currentTime, volume, queue, queueIndex,
    shuffle, repeat, isMinimized, setIsMinimized, desktopPanelView, setDesktopPanelView, playTrack, togglePlay, seek,
    setVolume: setVolumeLevel, setVolumeLevel, playNext, playPrev, addToQueue,
    removeFromQueue, moveInQueue, playNextInQueue, clearQueue, toggleShuffle, toggleRepeat,
    replaceQueue, jumpToIndex,
  };

  return (
    <PlayerProviderInner
      value={value}
      currentTrack={currentTrack}
      isPlaying={isPlaying}
      togglePlay={togglePlay}
      playNext={playNext}
      playPrev={playPrev}
      seek={seek}
      currentTime={currentTime}
      duration={duration}
    >
      {children}
    </PlayerProviderInner>
  );
}

export const usePlayer = () => useContext(PlayerContext);