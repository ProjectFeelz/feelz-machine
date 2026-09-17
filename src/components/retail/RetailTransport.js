// src/components/retail/RetailTransport.js
//
// The transport, as a card under the song details, instead of a bar welded to
// the bottom of the window.
//
// The bar had to go: on a venue tablet it sat across the whole width for the
// sake of six buttons, and on the record page it cut the bottom off the very
// thing the page is about. Here it is one more block in the left column, the
// same width as everything else in it, which is where a venue is already
// looking when they decide to skip something.
//
// The progress bar subscribes to the audio element directly rather than
// lifting currentTime into the page's state. Time updates fire four times a
// second; re-rendering a page with a spinning record and a tracklist at that
// rate for the sake of a moving line is the kind of thing that makes a cheap
// tablet stutter. Re-renders stay inside this card.

import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart } from 'lucide-react';
import { R } from './retailTheme';

const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export default function RetailTransport({
  audioRef,
  title,
  artistName,
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
  shuffle,
  onToggleShuffle,
  repeat,          // 'none' | 'one' | 'all'
  onCycleRepeat,
  liked,
  onToggleLike,
}) {
  const [time, setTime] = React.useState(0);
  const [dur, setDur]   = React.useState(0);

  React.useEffect(() => {
    const a = audioRef?.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime || 0);
    const onMeta = () => setDur(Number.isFinite(a.duration) ? a.duration : 0);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    onTime(); onMeta();
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
    };
  }, [audioRef, title]);

  const pct = dur > 0 ? Math.min(100, (time / dur) * 100) : 0;

  const seek = (e) => {
    const a = audioRef?.current;
    if (!a || !dur) return;
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
    a.currentTime = ratio * dur;
    setTime(a.currentTime);
  };

  const ghostBtn = {
    background: 'transparent',
    border: '1px solid transparent',
  };

  return (
    <div
      className="rounded-2xl p-4 mt-5"
      style={{
        background: 'linear-gradient(160deg, rgba(255,244,232,0.055) 0%, rgba(255,244,232,0.02) 100%)',
        border: `1px solid ${R.border}`,
      }}
    >
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2.5" style={{ color: R.textFaint }}>
        Playing in the room
      </p>

      <p className="text-sm font-semibold truncate" style={{ color: R.text }}>{title || '—'}</p>
      <p className="text-xs truncate mb-3" style={{ color: R.textDim }}>{artistName || ''}</p>

      {/* Scrub. A venue skipping past an intro should not have to wait it out. */}
      <div
        onClick={seek}
        className="relative h-6 flex items-center cursor-pointer group"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(time)}
        tabIndex={0}
      >
        <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,233,209,0.10)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${R.rust}, ${R.brass})` }}
          />
        </div>
        <span
          className="absolute w-2.5 h-2.5 rounded-full opacity-0 group-hover:opacity-100 transition"
          style={{ left: `calc(${pct}% - 5px)`, background: R.brass, boxShadow: '0 0 0 3px rgba(12,10,9,0.9)' }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono mb-3" style={{ color: R.textGhost }}>
        <span>{fmt(time)}</span>
        <span>{dur ? fmt(dur) : '--:--'}</span>
      </div>

      <div className="flex items-center justify-between gap-1">
        <button
          onClick={onToggleShuffle}
          title="Shuffle"
          aria-pressed={!!shuffle}
          className="w-9 h-9 rounded-lg flex items-center justify-center transition hover:bg-white/[0.06]"
          style={ghostBtn}
        >
          <Shuffle className="w-4 h-4" style={{ color: shuffle ? R.brass : R.textFaint }} />
        </button>

        <button
          onClick={onPrev}
          title="Previous"
          className="w-9 h-9 rounded-lg flex items-center justify-center transition hover:bg-white/[0.06]"
          style={ghostBtn}
        >
          <SkipBack className="w-4 h-4" style={{ color: R.textDim }} />
        </button>

        <button
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          className="w-12 h-12 rounded-full flex items-center justify-center transition active:scale-95 flex-shrink-0"
          style={{
            background: `linear-gradient(145deg, ${R.rustBright}, ${R.rust})`,
            boxShadow: '0 6px 18px rgba(181,97,58,0.35)',
          }}
        >
          {isPlaying
            ? <Pause className="w-5 h-5" style={{ color: '#1A1310' }} fill="#1A1310" />
            : <Play className="w-5 h-5 ml-0.5" style={{ color: '#1A1310' }} fill="#1A1310" />}
        </button>

        <button
          onClick={onNext}
          title="Next"
          className="w-9 h-9 rounded-lg flex items-center justify-center transition hover:bg-white/[0.06]"
          style={ghostBtn}
        >
          <SkipForward className="w-4 h-4" style={{ color: R.textDim }} />
        </button>

        <button
          onClick={onCycleRepeat}
          title={repeat === 'one' ? 'Repeating this track' : repeat === 'all' ? 'Repeating the vibe' : 'Repeat off'}
          className="w-9 h-9 rounded-lg flex items-center justify-center transition hover:bg-white/[0.06]"
          style={ghostBtn}
        >
          {repeat === 'one'
            ? <Repeat1 className="w-4 h-4" style={{ color: R.brass }} />
            : <Repeat className="w-4 h-4" style={{ color: repeat === 'all' ? R.brass : R.textFaint }} />}
        </button>
      </div>

      {onToggleLike && (
        <button
          onClick={onToggleLike}
          className="w-full mt-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          style={{
            background: liked ? R.rustSoft : 'rgba(255,244,232,0.04)',
            border: `1px solid ${liked ? R.rustEdge : R.border}`,
            color: liked ? R.rustBright : R.textDim,
          }}
        >
          <Heart className="w-3.5 h-3.5" fill={liked ? 'currentColor' : 'none'} />
          {liked ? 'In your favourites' : 'Add to favourites'}
        </button>
      )}
    </div>
  );
}