import { useEffect, useRef } from 'react';
import { coverUrl } from '../utils/coverUrl';

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

// Every action this file ever registers. Named once so that letting go of the
// session cannot miss one that setting up registered, which is the kind of
// mismatch that leaves a dead "next track" button on a dashboard.
const ALL_ACTIONS = [
  'play', 'pause', 'stop', 'nexttrack', 'previoustrack',
  'seekto', 'seekforward', 'seekbackward',
];

// ── LETTING GO ───────────────────────────────────────────────────────────────
//
// THE BUG THIS FIXES
//
// A phone holds one active media session and the OS binds the lock screen, the
// notification shade and the car head unit to it. This file was very careful
// about TAKING that session and never once gave it back.
//
// playbackState only ever went to 'playing' or 'paused'. There is a third
// value, 'none', and it is the only one that means "I am not a media app right
// now". Without it Feelz Machine stays registered as the phone's media session
// forever: after the last track ends, after the player is closed, after the app
// is backgrounded. Metadata was cleared when the track went away, which is
// worse rather than better, because a live session with no metadata shows up on
// a dashboard as a blank Feelz Machine entry that owns the steering wheel.
//
// From the driver's seat that is exactly what Steve described. Start the radio,
// or anything else, and the car still answers to Feelz Machine. Lock the screen
// and the phone surfaces the session it still has, which is this one.
//
// So: when there is no track, the session is handed back. State to 'none',
// metadata to null, and every handler unregistered, because a registered
// handler on a session with no state is what some versions of Android keep the
// notification alive for.
function releaseSession() {
  if (!('mediaSession' in navigator)) return;
  try { navigator.mediaSession.playbackState = 'none'; } catch {}
  try { navigator.mediaSession.metadata = null; } catch {}
  ALL_ACTIONS.forEach(action => {
    try { navigator.mediaSession.setActionHandler(action, null); } catch {}
  });
  try { navigator.mediaSession.setPositionState?.(); } catch {}
}

// WHY THIS DOES NOT HAND OVER cover_artwork_url
//
// Artwork on this platform is whatever size the artist exported, and measured
// on the live catalogue that is routinely 2.8 to 3.2 MB. A phone draws that
// without complaining. A car stereo often will not: head units have their own
// ceiling on an album art image received over Bluetooth, and the ones that hit
// it do not scale the picture down, they drop it and show their own generic
// music glyph. Which looks, from the driver's seat, like the app failed.
//
// The same is true of the lock screen on a weak signal, where a 3 MB cover is
// still downloading while the track is already playing.
//
// So it asks Supabase for the sizes it declares, through the same transform
// the rest of the app uses. A 512 square comes back around 335 KB as PNG and
// far less as WebP. Three sizes are offered because the spec lets the consumer
// pick, and a head unit that wants a small one should not be handed the big
// one and left to cope.
const ART_SIZES = [96, 256, 512];

function artworkFor(track) {
  const url = track?.cover_artwork_url;
  if (!url) {
    // Better our icon than the head unit's generic glyph, which reads as a
    // failure rather than as a track without a cover.
    return [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ];
  }
  // coverUrl hands back anything that is not a Supabase public object
  // untouched, so an external cover still works, it just does not shrink.
  return ART_SIZES.map(px => ({
    src:   coverUrl(url, px),
    sizes: `${px}x${px}`,
    // The transform negotiates on the Accept header, so what actually comes
    // back is usually WebP. The type here is a hint and browsers do not
    // enforce it; declaring the wrong exact codec is harmless, declaring the
    // wrong SIZE is not, which is the half this used to get wrong.
    type:  'image/jpeg',
  }));
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
      // Was: metadata = null, and nothing else. See releaseSession above for
      // why that left the car still answering to this app.
      releaseSession();
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
  //
  // Three values, not two. 'paused' means "still the media app, just stopped",
  // which is right while a track is loaded and the driver may hit play on the
  // wheel. 'none' means "not the media app", which is right the moment there is
  // no track, and is what hands the dashboard back to the radio.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState =
      !currentTrack ? 'none' : (isPlaying ? 'playing' : 'paused');
  }, [isPlaying, currentTrack]);

  // ── Let go on the way out ──
  //
  // Closing the tab, or the OS killing a backgrounded PWA, does not always run
  // React cleanup. pagehide does fire, and leaving a session behind is the one
  // thing worth being sure about: a stale session outlives the app and keeps
  // the car pointed at something that is not running any more.
  useEffect(() => {
    const go = () => releaseSession();
    window.addEventListener('pagehide', go);
    return () => window.removeEventListener('pagehide', go);
  }, []);

  // ── Taking the head unit's display back ──
  //
  // A phone holds one active media session at a time, and the last thing to
  // declare itself playing owns it. Watch something in another tab or another
  // app and that becomes the session: the car shows its title, and the
  // steering wheel buttons control it, and they keep doing so after the other
  // thing has stopped. The music is playing and the dashboard is showing
  // somebody else's video.
  //
  // Re-declaring the metadata and the play state is what takes it back.
  // Visibility is the moment worth doing it: coming back to this app is
  // exactly when the other thing has been left, and a driver who has just
  // switched back should find the wheel controlling the music again.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const reassert = () => {
      if (document.visibilityState !== 'visible') return;
      if (!currentTrack || !isPlaying) return;
      try {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title:   currentTrack.title || 'Unknown Track',
          artist:  currentTrack.artist_name || 'Unknown Artist',
          album:   currentTrack.albums?.title || currentTrack.album_title || '',
          artwork: artworkFor(currentTrack),
        });
        navigator.mediaSession.playbackState = 'playing';
      } catch {}
    };

    document.addEventListener('visibilitychange', reassert);
    return () => document.removeEventListener('visibilitychange', reassert);
  }, [currentTrack, isPlaying]);

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
    // Without this guard the hook fought itself. Effects run in the order they
    // are declared, so on the track going away the metadata effect above let
    // the session go and then this one immediately registered eight handlers
    // back onto it, which is a live session again. No track, no handlers.
    if (!currentTrack) return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, !!currentTrack]);
}