// src/components/ShortlistSongs.js
//
// The School Sessions shortlist, as something you can actually use:
//
//   tap a song   plays it in the app player with the whole shortlist queued,
//                so skip moves to the other shortlisted song
//   Lyrics       opens the words underneath, in place
//   Beat         saves the instrumental to the device (BeatDownloadButton)
//
// Nothing here navigates. An entrant half way through the entry form can
// listen, read and download without losing what they have typed, and "back"
// still means the browser's back, not a trip out of the competition.
//
// A song whose original was never uploaded as a track keeps its external
// link, which is the one case where a new tab is unavoidable.

import React, { useState } from 'react';
import { Music, Play, Pause, FileText, ExternalLink } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import BeatDownloadButton from './BeatDownloadButton';

// The player wants artist_name and artist_slug flattened onto the track, the
// way every other surface passes them.
function forPlayer(song) {
  const t = song.reference_track;
  if (!t?.file_url) return null;
  return {
    ...t,
    artist_name: t.artists?.artist_name || 'Feelz Machine',
    artist_slug: t.artists?.slug || null,
  };
}

export default function ShortlistSongs({ songs = [], compact = false }) {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const [openLyrics, setOpenLyrics] = useState(null);

  if (!songs.length) return null;

  // The queue is every shortlisted song that can actually play, in the order
  // they are shown.
  const queue = songs.map(forPlayer).filter(Boolean);

  const play = (song) => {
    const track = forPlayer(song);
    if (!track) return;
    window.__feelz_play_source = 'school_sessions';
    playTrack(track, queue);
  };

  return (
    <div className={compact ? 'space-y-1.5' : 'grid lg:grid-cols-2 gap-1.5 lg:gap-2.5'}>
      {songs.map(song => {
        const track    = forPlayer(song);
        const playable = !!track;
        const isThis   = playable && currentTrack?.id === track.id;
        const showing  = openLyrics === song.id;
        return (
          <div key={song.id} className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
            <div className="flex items-center space-x-3 px-3.5 py-2.5 lg:py-3">
              {playable ? (
                <button onClick={() => play(song)} aria-label={isThis && isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
                  className="w-8 h-8 rounded-full bg-lime-400 text-black flex items-center justify-center flex-shrink-0 hover:brightness-110 active:scale-95 transition">
                  {isThis && isPlaying
                    ? <Pause className="w-3.5 h-3.5" fill="currentColor" />
                    : <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />}
                </button>
              ) : (
                <Music className="w-3.5 h-3.5 text-lime-400 flex-shrink-0" />
              )}

              <button onClick={() => playable && play(song)} disabled={!playable}
                className="text-sm text-white flex-1 truncate text-left disabled:cursor-default">
                {song.title}
                {isThis && <span className="text-[10px] text-lime-400 ml-2">Playing</span>}
              </button>

              {song.lyrics && (
                <button onClick={() => setOpenLyrics(showing ? null : song.id)}
                  className={`text-[11px] flex items-center flex-shrink-0 transition ${showing ? 'text-white' : 'text-white/45 hover:text-white/80'}`}>
                  <FileText className="w-3 h-3 mr-1" />Lyrics
                </button>
              )}

              {song.beat_url && <BeatDownloadButton song={song} label="Beat" />}

              {!playable && song.reference_url && (
                <a href={song.reference_url} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-lime-400/70 flex items-center flex-shrink-0">
                  <ExternalLink className="w-3 h-3 mr-1" />Listen
                </a>
              )}
            </div>

            {showing && song.lyrics && (
              <div className="px-3.5 pb-3 pt-1 border-t border-white/[0.05]">
                <p className="text-[13px] leading-relaxed text-white/60 whitespace-pre-wrap max-h-72 overflow-y-auto">
                  {song.lyrics}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}