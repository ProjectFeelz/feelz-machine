import { useEffect } from 'react';

/**
 * useMediaSession
 *
 * Registers the current track with the browser's Media Session API.
 * This powers:
 *  - Lock screen media controls (iOS/Android)
 *  - Notification shade controls (Android)
 *  - OS media key support (desktop)
 *  - CarPlay / Android Auto (when supported via browser)
 *
 * Call this inside PlayerProvider or a component that has access to
 * the player state. Pass null to clear the session.
 *
 * Usage:
 *   useMediaSession({ currentTrack, isPlaying, togglePlay, playNext, playPrev });
 */
export function useMediaSession({ currentTrack, isPlaying, togglePlay, playNext, playPrev }) {
  // Set metadata when track changes
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title:  currentTrack.title  || 'Unknown Track',
      artist: currentTrack.artist_name || 'Unknown Artist',
      album:  currentTrack.albums?.title || currentTrack.album_title || '',
      artwork: currentTrack.cover_artwork_url
        ? [
            { src: currentTrack.cover_artwork_url, sizes: '512x512', type: 'image/jpeg' },
            { src: currentTrack.cover_artwork_url, sizes: '256x256', type: 'image/jpeg' },
            { src: currentTrack.cover_artwork_url, sizes: '128x128', type: 'image/jpeg' },
          ]
        : [],
    });
  }, [currentTrack?.id]);

  // Update playback state when isPlaying changes
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Register action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const handlers = [
      ['play',          () => { if (!isPlaying) togglePlay(); }],
      ['pause',         () => { if (isPlaying)  togglePlay(); }],
      ['nexttrack',     () => playNext()],
      ['previoustrack', () => playPrev()],
      ['stop',          () => { if (isPlaying) togglePlay(); }],
    ];

    handlers.forEach(([action, handler]) => {
      try { navigator.mediaSession.setActionHandler(action, handler); }
      catch {} // Some browsers don't support all actions
    });

    return () => {
      handlers.forEach(([action]) => {
        try { navigator.mediaSession.setActionHandler(action, null); }
        catch {}
      });
    };
  }, [isPlaying, togglePlay, playNext, playPrev]);
}
