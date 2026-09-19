import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { getTrackAvailability } from '../utils/trackAccess';
import { useMediaSession } from '../hooks/useMediaSession';
import { playbackSrc, isSavedOfflineSync, offlineSrcFor } from '../utils/offlineStore';
import { resolveStreamLater, warmStreamUrls } from '../utils/streamUrl';
import { buildOfflinePlayRow, queueOfflinePlay, flushOfflinePlays } from '../utils/offlinePlayQueue';
import { sendNotification, sendStreamDigest } from '../utils/notify';

// Preload a track's cover art into the browser cache so VinylRecord/Cassette show instantly
function preloadCover(track) {
  if (!track?.cover_artwork_url) return;
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.src = track.cover_artwork_url;
}

// ── Offline playback ─────────────────────────────────────────────────────────
//
// Every place that assigns audio.src now goes through playbackSrc, which
// returns the copy stored on this device when there is one and the streaming
// URL otherwise. It is deliberately synchronous — see the comment on it in
// utils/offlineStore.js — so an online listener never waits on a storage read
// to discover they have nothing saved.
//
// resolveLocalLater is the safety net for the one case playbackSrc cannot
// answer synchronously: a saved track on a page with no service worker
// controlling it, where the local copy has to be handed over as a blob URL.
// It matters when that coincides with actually being offline, which is exactly
// when getting it wrong is least forgivable.
function resolveLocalLater(audio, track, { onSwap } = {}) {
  if (!track?.id) return;
  if (!isSavedOfflineSync(track.id)) return;
  if (audio.src && audio.src.includes('/offline-audio/')) return;  // already local

  offlineSrcFor(track.id).then(localSrc => {
    if (!localSrc) return;
    // The listener may have moved on while we were reading. Only swap if this
    // element is still pointed at the track we resolved for.
    if (audio.dataset.feelzTrackId !== String(track.id)) return;
    if (audio.src === localSrc) return;
    const at = audio.currentTime;
    audio.src = localSrc;
    audio.load();
    if (at > 0) {
      const restore = () => {
        try { audio.currentTime = at; } catch {}
        audio.removeEventListener('loadedmetadata', restore);
      };
      audio.addEventListener('loadedmetadata', restore);
    }
    onSwap?.(localSrc);
  }).catch(() => { /* streaming URL stays; never break playback over this */ });
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
  // Why a blocked tap did nothing. Rendered by this provider itself (see the
  // bottom of the file) rather than wired into a page, so every one of the 39
  // playTrack call sites gets the explanation for free.
  const [playbackNotice, setPlaybackNotice] = useState(null);
  // Which tab the desktop docked player panel opens on when triggered,
  // shared so DesktopPlayer's Queue button and FullPlayer's own tabs
  // drive the same single panel instead of two competing ones.
  const [desktopPanelView, setDesktopPanelView] = useState('player');

  const audioRef        = useRef(new Audio());
  const audioRefB       = useRef(new Audio());  // second element for crossfade
  const crossfadingRef  = useRef(false);
  const CROSSFADE_SECS  = 1.5; // seconds of overlap, short enough to not echo
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

  // The id of the stream row logged for the current play, so the real
  // duration and completion can be written back to it when the play ends.
  // Cleared on every track change so one track's outcome can never be
  // written onto another's row.
  const currentStreamIdRef = useRef(null);

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

    // Take the stream id NOW, while we are still synchronous.
    //
    // This function is called without await, and everything below the first
    // `await` runs after control has returned to the caller. The track-change
    // path clears currentStreamIdRef on the line immediately after calling
    // us, so by the time the old code read the ref (after two awaits) it was
    // always null — and finalise_stream never ran on a track change.
    //
    // That is the most common way a play ends: a skip. So the stream row kept
    // the placeholder `completed = false` and the 30-second duration that
    // migration 79 exists to replace, for every listen except a track played
    // to the end or interrupted by a page hide.
    //
    // Reading and clearing it here closes the race and makes the caller's
    // defensive clear redundant rather than harmful.
    const streamId = currentStreamIdRef.current;
    currentStreamIdRef.current = null;

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

      // The stream row was written at the 30 second mark with completed
      // false, because at that point nothing had been completed. Now the
      // play has actually ended, so tell it what happened. Without this
      // streams.completed and duration_played stay constants, which is
      // what made the dashboard report 100% completion and 0:30 average
      // for every artist.
      //
      // 'ended' is the only end reason that means finished. A page hide or
      // a track change at 95% is still not a completed listen, and
      // completion_pct on listening_events already records how far they got.
      // streamId was captured at the top, before any await. Re-reading the
      // ref here is what the race defeated.
      if (streamId) {
        const { error: finaliseError } = await supabase.rpc('finalise_stream', {
          p_stream_id: streamId,
          p_duration_played: listened,
          p_completed: endReason === 'ended',
        });
        if (finaliseError) console.warn('[player] finalise_stream failed:', finaliseError.message);
      }
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

  // Sign ahead of the listener.
  //
  // A signed URL has to be fetched, and fetching it at the moment of a tap
  // would put a round trip in front of every skip. So whenever the queue or
  // the position in it changes, the current track and the next few are signed
  // in one batched request. By the time anyone presses next, playbackSrc()
  // already has the URL and the swap never happens.
  //
  // No-op unless REACT_APP_PRIVATE_AUDIO is set.
  useEffect(() => {
    if (!queue?.length) return;
    const start = Math.max(0, queueIndex);
    const ids = queue.slice(start, start + 4).map(t => t?.id).filter(Boolean);
    if (ids.length) warmStreamUrls(ids);
  }, [queue, queueIndex]);

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
        .select('*, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
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
      // flushListeningEvent now takes and clears this synchronously, so this
      // line is belt and braces for the case where the flush bailed before
      // reaching it (under three seconds, or the duplicate guard) and the id
      // would otherwise survive into the next track.
      currentStreamIdRef.current = null;
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
      primaryAudio.dataset.feelzTrackId = String(nextTrack.id);
      primaryAudio.src    = playbackSrc(nextTrack);
      primaryAudio.volume = 0;
      primaryAudio.load();
      // No resolveStreamLater here, for the same reason as resolveLocalLater
      // below: swapping src mid-crossfade restarts the incoming track under
      // the fade. The queue warmer above has normally signed this track
      // already, in which case playbackSrc returned the signed URL and there
      // is nothing to swap.
      // Not resolveLocalLater here on purpose: swapping src mid-crossfade
      // would restart the incoming track under the fade. A saved track is
      // served through the worker synchronously anyway; the blob fallback
      // just streams for this one transition.
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

  // Send up whatever was played offline. Once on mount, and every time the
  // connection comes back.
  //
  // The flush is safe to run as often as it likes: each queued play carries
  // the id the server keys its receipt on, so a play already counted is
  // recognised and dropped rather than counted again.
  useEffect(() => {
    let cancelled = false;
    const flush = () => {
      if (!navigator.onLine) return;
      flushOfflinePlays(supabase)
        .then(({ flushed, counted }) => {
          if (cancelled || !flushed) return;
          console.info(`[offline] sent ${flushed} queued play(s), ${counted} counted`);
        })
        .catch(() => { /* the next reconnect tries again */ });
    };
    // A moment after load, so it never competes with getting audio playing.
    const t = setTimeout(flush, 4000);
    window.addEventListener('online', flush);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener('online', flush);
    };
  }, []);

  const logStream = async (trackId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;
      if (!userId) return;

      // ── Offline plays ─────────────────────────────────────────────────────
      // With no connection every call below fails and this function returns
      // early, which is how offline listening would silently stop counting
      // plays: eight listens on a flight, zero streams, and an artist not
      // paid for music that was actually played.
      //
      // So the play is written to a durable queue with an id generated here,
      // and flushed when there is a network again. log_offline_stream
      // (migration 104) keys on that id, so a retry cannot count the same
      // play twice.
      //
      // Queued ONLY when the browser says it is offline, which is the one
      // case where we know for certain the request never left the device. A
      // "failed to fetch" while apparently online is ambiguous — it may have
      // landed and lost its response — and queueing that would risk
      // double-counting, which is worse than losing it. That case keeps
      // today's behaviour until log_stream itself takes a client id.
      if (!navigator.onLine) {
        queueOfflinePlay(buildOfflinePlayRow({
          trackId,
          durationPlayed: Math.floor(audioRef.current.currentTime),
          source: window.__feelz_play_source || 'offline',
        }));
        return;
      }

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
        // Ignored by log_stream now, which always inserts false and lets
        // finalise_stream write the real value. Passed only because the
        // function signature still takes it.
        p_completed: false,
        p_platform: 'web',
        p_device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
        p_source: window.__feelz_play_source || 'unknown',
      });

      if (logError || !logResult?.logged) return; // self-stream or track not found, bail like before

      // Remember which row this play wrote, so finalise_stream can correct
      // it with the real duration and completion when the play ends.
      currentStreamIdRef.current = logResult.stream_id || null;

      // The recipient used to be resolved here from logResult.owner_user_id and
      // passed as user_id on a direct insert. Both notifications below now go
      // through an RPC that resolves the artist's user itself, so there is
      // nothing left for the client to look up.

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
          // Through send_notification, not a direct insert. The INSERT policy on
          // notifications permits only self-addressed rows, and this one is
          // addressed to the ARTIST by a listener — which is why it has been
          // returning 403 on every first stream since it was written. See
          // migration 106.
          await sendNotification(supabase, 'first_listener (player)', {
            type:      'first_listener',
            artistId:  track.artist_id,
            title:     `🎯 First ever stream on ${fullFirst?.title || track.title}`,
            message:   `${listenerName} was your very first listener.`,
            trackId:   trackId,
            metadata: {
              from_artist_id:    listenerArtist?.id || null,
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
          : `${streamCount} stream${streamCount > 1 ? 's' : ''} today, ${topTitle} leading`;

        // One call, and the server decides create-or-update.
        //
        // This used to be a read, a decision and a write from the client, and
        // BOTH branches failed silently: the insert on the INSERT policy and
        // the update on the UPDATE policy, because the row belongs to the
        // artist while the person streaming is a listener. Every error sat
        // inside a catch that never read it, so an artist's stream
        // notifications simply never arrived.
        //
        // Doing it server-side also closes the race: two listeners streaming
        // in the same second could each find no digest and each create one.
        await sendStreamDigest(supabase, 'stream digest (player)', {
          artistId: track.artist_id,
          title:    digestTitle,
          message:  `${streamCount} stream${streamCount !== 1 ? 's' : ''} across your catalogue today`,
          trackId:  topTrackId || trackId,
          metadata: {
            track_id:      topTrackId || trackId,
            track_slug:    topTrack?.slug || fullTrack?.slug || null,
            track_title:   topTitle,
            track_artwork: topTrack?.cover_artwork_url || notifArtwork,
            file_url:      topTrack?.file_url || fullTrack?.file_url,
            artist_id:     track.artist_id,
            stream_count:  streamCount,
          },
        });
      } catch { /* non-critical, never break playback */ }

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
            100:  { title: `100 plays with ${name} 🎯`, message: `One hundred plays. You're not just a listener, you're a supporter.` },
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

    // THE GATE. Every path into playback comes through here — feeds, rails,
    // queues, action sheets, notifications, radio — so this is the only place
    // the rule has to be written, and no new call site can forget it.
    //
    // It blocks only on positive evidence (see trackAccess.js): an explicit
    // is_published === false, or a pre-order with a future release_date and no
    // entitlement. A missing field is unknown, and unknown plays.
    const availability = getTrackAvailability(track);
    if (!availability.playable) {
      console.warn(`[player] blocked playback of "${track.title}" (${track.id}):`, availability.reason);
      setPlaybackNotice({ id: `${track.id}:${Date.now()}`, message: availability.message });
      return;
    }

    const audio = audioRef.current;
    if (currentTrack?.id === track.id) {
      if (isPlaying) { audio.pause(); } else { audio.play().catch(console.error); }
      // Does NOT un-minimise. Tapping the playing track is play/pause, and
      // forcing the full player back open made it impossible to keep it
      // minimised.
      return;
    }
    flushListeningEvent('track_change');
    streamLoggedRef.current = false;
    audio.pause();
    audio.dataset.feelzTrackId = String(track.id);
    audio.src = playbackSrc(track);
    audio.volume = 0;
    audio.load();
    resolveLocalLater(audio, track);
    // Swaps in a short lived signed URL once one is available, so file_url
    // stops being a permanent public link to the master audio. No-op unless
    // REACT_APP_PRIVATE_AUDIO is set. See utils/streamUrl.js.
    resolveStreamLater(audio, track);
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
    // Deliberately not setIsMinimized(false). This fired on every track
    // change, so the panel reopened itself as soon as the next song began
    // and the minimise button looked broken. The mini player's own tap
    // handler is the explicit way back in.
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

  // A one-line notice anyone can raise.
  //
  // Built for blocked playback, but it is the only app-wide notice renderer
  // that exists, and `window.showToast` was referenced in
  // utils/downloadTrack.js while being defined absolutely nowhere — so the
  // iOS "Tap Share to save" hint has never appeared. Publishing showNotice
  // there makes that dead reference work and gives plain utils, which have no
  // access to React context, a way to say something.
  const showNotice = useCallback((message) => {
    if (!message) return;
    setPlaybackNotice({ id: `notice:${Date.now()}`, message });
  }, []);

  useEffect(() => {
    window.showToast = showNotice;
    return () => { if (window.showToast === showNotice) window.showToast = null; };
  }, [showNotice]);

  // The notice clears itself. Tying it to a dismiss button would mean every
  // page that can play a track also has to render one.
  useEffect(() => {
    if (!playbackNotice) return;
    const t = setTimeout(() => setPlaybackNotice(null), 4000);
    return () => clearTimeout(t);
  }, [playbackNotice]);

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
      audioRef.current.dataset.feelzTrackId = String(prevTrack.id);
      audioRef.current.src = playbackSrc(prevTrack);
      audioRef.current.volume = volumeRef.current;
      audioRef.current.load();
      resolveLocalLater(audioRef.current, prevTrack);
      resolveStreamLater(audioRef.current, prevTrack);
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

  // Dismiss the player entirely.
  //
  // Nothing in the app set currentTrack back to null, and MiniPlayer /
  // DesktopPlayer only return null when it is null — so once you played
  // anything, the bar was permanent for the rest of the session with no
  // control to get rid of it.
  //
  // Closing stops the music rather than just hiding the bar: a hidden player
  // still playing, with no way to reach the pause button, is worse than no
  // close button at all.
  //
  // The real listen is flushed first so the stream row is finalised honestly
  // (migration 79), and the stream id is cleared so this play can never be
  // written onto the next track's row.
  const closePlayer = useCallback(() => {
    // 'track_change' rather than a new 'closed' value: end_reason may carry a
    // CHECK constraint in the database, and a rejected insert would be
    // swallowed by the try/catch in flushListeningEvent AND skip
    // finalise_stream with it. Abandoning a play is what a close is, and
    // completed stays false either way. Worth a distinct reason later, once
    // the constraint on listening_events.end_reason has been checked.
    flushListeningEvent('track_change');

    [audioRef.current, audioRefB.current].forEach(a => {
      if (!a) return;
      try {
        a.pause();
        a.removeAttribute('src');   // stop the download, not just the sound
        a.load();
      } catch { /* an already-torn-down element is not worth failing over */ }
    });

    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setQueue([]);
    setQueueIndex(-1);
    queueRef.current = [];
    queueIndexRef.current = -1;
    setIsMinimized(true);
    setCurrentTrack(null);
    currentTrackRef.current = null;
  }, [flushListeningEvent]);
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
    audio.dataset.feelzTrackId = String(track.id);
    audio.src = playbackSrc(track);
    audio.volume = volumeRef.current;
    resolveLocalLater(audio, track);
    resolveStreamLater(audio, track);
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
    removeFromQueue, moveInQueue, playNextInQueue, clearQueue, closePlayer, toggleShuffle, toggleRepeat,
    replaceQueue, jumpToIndex,
    playbackNotice, showNotice, dismissPlaybackNotice: () => setPlaybackNotice(null),
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
      {/* The blocked-playback notice, rendered by the provider so it exists
          wherever the player does. Above the mini player and the mobile nav,
          below modals. */}
      {playbackNotice?.message && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[420] px-4 w-full max-w-sm pointer-events-none"
          style={{ bottom: 'calc(112px + var(--safe-area-bottom, 0px))' }}
        >
          <div
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-2xl pointer-events-auto"
            style={{
              backgroundColor: 'rgba(20,20,28,0.96)',
              border: '1px solid rgba(251,191,36,0.28)',
              backdropFilter: 'blur(12px)',
            }}
            onClick={() => setPlaybackNotice(null)}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#fbbf24' }} />
            <p className="text-xs text-white/80">{playbackNotice.message}</p>
          </div>
        </div>
      )}
    </PlayerProviderInner>
  );
}

export const usePlayer = () => useContext(PlayerContext);