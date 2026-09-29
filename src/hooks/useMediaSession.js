import { useEffect, useRef } from 'react';

/**
 * useMediaSession
 *
 * Registers the current track with the browser's Media Session API. This is
 * what drives:
 *  - Lock screen controls on iOS and Android
 *  - The notification shade on Android
 *  - Media keys on a desktop keyboard
 *  - The head unit in a car, over Bluetooth
 *
 *
 * WHAT THE CAR ACTUALLY SEES
 *
 * The old comment here said "CarPlay / Android Auto (when supported via
 * browser)". Nothing supports that. CarPlay and Android Auto only ever show
 * native apps: CarPlay needs an audio entitlement from Apple, Android Auto
 * needs a MediaBrowserService in an Android package. A web app cannot appear
 * in either, on any browser, and no amount of manifest work changes it.
 *
 * What does happen in a car is Bluetooth. The phone sends the title, artist,
 * album, artwork and play state to the head unit over AVRCP, and the steering
 * wheel buttons send play, pause, next and previous back. Every one of those
 * is this file. So the car experience is real and worth getting right, it just
 * is not CarPlay.
 *
 *
 * THE BUG THIS FILE HAD
 *
 * currentTime was in the dependency array of the effect that registers the
 * action handlers, and currentTime changes on every timeupdate, which fires
 * about four times a second. So all eight handlers were being torn down and
 * re-registered four times a second for the whole length of every track.
 *
 * Two things go wrong with that. There is a window on each tick where the
 * handlers are null, and a steering wheel press that lands in it does nothing,
 * which is exactly what "the car controls are flaky" feels like. And on
 * Android, re-registering handlers can rebuild the notification, which is work
 * the phone is doing four times a second to display the same thing.
 *
 * The fix is refs. Handlers need to READ the current time, not be rebuilt when
 * it changes, so the live values sit in refs and the handlers close over those.
 * The effect now runs once per track rather than a few thousand times.
 *
 * setPositionState had the same shape of problem and the same fix. The OS
 * works out where the playhead is from the last reported position and the
 * playback rate, so it only needs telling when something actually moves it:
 * a new track, a pause, a seek. Reporting four times a second told it nothing
 * it had not already worked out.
 */

// A seek is a jump. Normal playback advances by about a quarter second per
// tick, so anything past two seconds was not the track playing forward.
const SEEK_JUMP_SECONDS = 2;

function artworkFor(track) {
  const url = track?.cover_artwork_url;
  if (!url) {
    // A car that gets no artwork shows its own generic music glyph, which
    // looks like the track failed to load. The app icon is at least ours.
    return [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ];
  }
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  const type = ext === 'png' ? 'image/png'
             : ext === 'webp' ? 'image/webp'
             : 'image/jpeg';
  // One entry, honestly described. The old version listed the same URL three
  // times as 512, 256 and 128, so whichever size the head unit asked for it
  // was told it was getting, and it was always getting the same file.
  return [{ src: url, sizes: '512x512', type }];
}

export function useMediaSession({ currentTrack, isPlaying, togglePlay, playNext, playPrev, seek, currentTime, duration }) {
  // Live values the handlers read. Writing to a ref does not re-render and does
  // not re-run an effect, which is the whole point.
  const timeRef    = useRef(0);
  const durRef     = useRef(0);
  const playingRef = useRef(false);
  const cbRef      = useRef({});
  const lastPosRef = useRef(0);

  timeRef.current    = currentTime || 0;
  durRef.current     = duration || 0;
  playingRef.current = !!isPlaying;
  cbRef.current      = { togglePlay, playNext, playPrev, seek };

  // ── Metadata, once per track ──
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title:   currentTrack.title || 'Unknown Track',
        artist:  currentTrack.artist_name || 'Unknown Artist',
        album:   currentTrack.albums?.title || currentTrack.album_title || '',
        artwork: artworkFor(currentTrack),
      });
    } catch {
      // MediaMetadata is missing on a few older WebViews. Controls still work
      // without it, they just show nothing, so this is not worth failing over.
    }
    // The four fields that appear on a lock screen or a head unit, rather than
    // currentTrack itself. The object is rebuilt on plenty of re-renders that
    // change none of them, and rebuilding MediaMetadata makes Android redraw
    // the notification, so depending on the whole object undoes half the point
    // of this file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist_name, currentTrack?.cover_artwork_url]);

  // ── Play state ──
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // ── Position, only when something moved it ──
  //
  // currentTime is still a dependency because a seek has to be reported, but
  // the body returns immediately unless the jump was bigger than playback
  // could account for. A cheap comparison a few times a second, instead of a
  // cross-process call a few times a second.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const dur = durRef.current;
    if (!dur || !Number.isFinite(dur)) return;

    const pos     = Math.min(Math.max(timeRef.current, 0), dur);
    const jumped  = Math.abs(pos - lastPosRef.current) > SEEK_JUMP_SECONDS;
    if (!jumped && lastPosRef.current !== 0) return;

    lastPosRef.current = pos;
    try {
      navigator.mediaSession.setPositionState({ duration: dur, playbackRate: 1, position: pos });
    } catch {
      // Chrome throws if position exceeds duration by a rounding error, and
      // there is nothing useful to do about it.
    }
  }, [currentTime, duration, isPlaying, currentTrack?.id]);

  // Reset the position tracker on a track change, so the first report of the
  // new track is not mistaken for a seek within the old one.
  useEffect(() => { lastPosRef.current = 0; }, [currentTrack?.id]);

  // ── Action handlers, once per track ──
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const handlers = [
      ['play',          () => { if (!playingRef.current) cbRef.current.togglePlay?.(); }],
      ['pause',         () => { if (playingRef.current)  cbRef.current.togglePlay?.(); }],
      ['nexttrack',     () => cbRef.current.playNext?.()],
      ['previoustrack', () => cbRef.current.playPrev?.()],
      ['stop',          () => { if (playingRef.current)  cbRef.current.togglePlay?.(); }],
      ['seekto',        (e) => {
        if (!cbRef.current.seek || e.seekTime == null) return;
        cbRef.current.seek(e.seekTime);
      }],
      ['seekforward',   (e) => {
        if (!cbRef.current.seek) return;
        const to = Math.min(timeRef.current + (e?.seekOffset || 10), durRef.current || Infinity);
        cbRef.current.seek(to);
      }],
      ['seekbackward',  (e) => {
        if (!cbRef.current.seek) return;
        cbRef.current.seek(Math.max(timeRef.current - (e?.seekOffset || 10), 0));
      }],
    ];

    handlers.forEach(([action, handler]) => {
      try { navigator.mediaSession.setActionHandler(action, handler); }
      catch {} // Not every browser implements every action.
    });

    return () => {
      handlers.forEach(([action]) => {
        try { navigator.mediaSession.setActionHandler(action, null); }
        catch {}
      });
    };
  }, [currentTrack?.id]);
}