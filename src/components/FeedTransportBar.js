// src/components/FeedTransportBar.js
//
// The bar along the bottom of the For You feed, on a computer only.
//
// WHY IT EXISTS
//
// AppLayout renders DesktopPlayer on every route EXCEPT "/". So on the one
// page people land on, a person at a computer had no play button, no scrubber
// and no way to tell how far through a song they were. The only control was
// clicking the record, which is not discoverable and is not a scrubber.
//
// It also fills the gap. The card's text sits at bottom-24, which on a phone
// is exactly where the mini player and the nav bar cover. On a desktop nothing
// was there, so the page ended in a strip of empty black.
//
// Prev and next call the FEED's goTo, not the player's own playNext. Moving
// the audio without moving the card is the bug that was reported for the lock
// screen; there is no reason to build a second one here.
//
// Colour: neutral. Chrome hairlines, white for the thing you press, one
// violet accent for the two toggles when they are on. The artwork behind it
// supplies all the colour this page needs.

import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat } from 'lucide-react';

const ACCENT = '#A78BFA';

const clock = (s) => {
  const v = Math.max(0, Math.floor(Number(s) || 0));
  const m = Math.floor(v / 60);
  return `${m}:${String(v % 60).padStart(2, '0')}`;
};

export default function FeedTransportBar({
  track, isPlaying, togglePlay, seek, currentTime, duration,
  shuffle, toggleShuffle, repeat, toggleRepeat,
  onPrev, onNext, hasPrev, hasNext, nextTitle,
}) {
  if (!track) return null;

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const scrub = (e) => {
    if (!duration || !seek) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    seek(ratio * duration);
  };

  const Toggle = ({ on, onClick, title, children }) => (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="w-9 h-9 rounded-full flex items-center justify-center transition hover:bg-white/10"
      style={{ color: on ? ACCENT : 'rgba(255,255,255,0.35)' }}
    >
      {children}
    </button>
  );

  return (
    <div
      className="hidden md:block absolute bottom-0 inset-x-0 z-[60]"
      // Clicks here must not reach the card behind it, which treats a tap as
      // play/pause and would undo whatever button was just pressed.
      onClick={e => e.stopPropagation()}
      style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.75) 45%, #000 100%)',
      }}
    >
      {/* Scrubber. Full width, sitting on the hairline, so the bar reads as
          one object rather than a strip with a slider parked in it. */}
      <div
        className="group relative h-6 flex items-end cursor-pointer"
        onClick={scrub}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || 0)}
        aria-valuenow={Math.round(currentTime || 0)}
        tabIndex={0}
      >
        <div className="w-full h-[2px] group-hover:h-[4px] transition-all"
          style={{ background: 'rgba(255,255,255,0.10)' }}>
          <div className="h-full relative" style={{ width: `${pct}%`, background: 'rgba(255,255,255,0.85)' }}>
            <span
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition"
              style={{ boxShadow: '0 0 0 4px rgba(0,0,0,0.5)' }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center h-[72px] px-6">

        {/* Left: where you are. Fixed width so the middle group stays put
            as the numbers change rather than nudging left and right. */}
        <div className="w-[190px] flex-shrink-0">
          <span className="text-[12px] font-semibold tabular-nums text-white/45">
            {clock(currentTime)} <span className="text-white/20">/</span> {clock(duration)}
          </span>
        </div>

        {/* Middle: the controls */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <Toggle on={shuffle} onClick={toggleShuffle} title="Shuffle">
            <Shuffle className="w-4 h-4" />
          </Toggle>

          <button
            onClick={onPrev}
            disabled={!hasPrev}
            title="Previous"
            aria-label="Previous"
            className="w-10 h-10 rounded-full flex items-center justify-center transition hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent"
          >
            <SkipBack className="w-5 h-5 text-white/75" fill="currentColor" />
          </button>

          <button
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-12 h-12 rounded-full bg-white flex items-center justify-center transition hover:scale-105 active:scale-95"
            style={{ boxShadow: '0 6px 24px rgba(0,0,0,0.55)' }}
          >
            {isPlaying
              ? <Pause className="w-5 h-5 text-black" fill="black" />
              : <Play  className="w-5 h-5 text-black ml-0.5" fill="black" />}
          </button>

          <button
            onClick={onNext}
            disabled={!hasNext}
            title="Next"
            aria-label="Next"
            className="w-10 h-10 rounded-full flex items-center justify-center transition hover:bg-white/10 disabled:opacity-20 disabled:hover:bg-transparent"
          >
            <SkipForward className="w-5 h-5 text-white/75" fill="currentColor" />
          </button>

          <Toggle on={repeat !== 'none'} onClick={toggleRepeat}
            title={repeat === 'one' ? 'Repeat this track' : repeat === 'all' ? 'Repeat everything' : 'Repeat off'}>
            <span className="relative flex items-center justify-center">
              <Repeat className="w-4 h-4" />
              {repeat === 'one' && (
                <span className="absolute -top-1.5 -right-1.5 text-[9px] font-black">1</span>
              )}
            </span>
          </Toggle>
        </div>

        {/* Right: what is coming. Same fixed width as the left, so the
            controls sit dead centre of the column and not just of whatever
            space happened to be left over. */}
        <div className="w-[190px] flex-shrink-0 text-right min-w-0">
          {nextTitle && (
            <>
              <span className="block text-[10px] font-bold tracking-[0.14em] text-white/20 uppercase">Up next</span>
              <span className="block text-[12px] font-semibold text-white/45 truncate">{nextTitle}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}