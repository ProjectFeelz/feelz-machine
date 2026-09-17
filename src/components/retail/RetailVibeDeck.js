// src/components/retail/RetailVibeDeck.js
//
// The jukebox. A deck of vibes, one at a time, in the middle of the screen,
// previewing itself while you look at it.
//
//   swipe left   → not for this room, next
//   swipe right  → save it to Your Vibes
//   tap the card → open the record
//
// Why a deck and not the grid it replaces: a venue picking music is making a
// feel decision, not a filing one, and a grid of twenty covers asks you to
// choose before you have heard anything. One card at a time with the music
// already playing turns it into a reaction. That is what a jukebox does — the
// difference is you are not paying per go and you can throw one back.
//
// Built for a tablet on a counter: everything is touch-first, the targets are
// big, and the buttons underneath do the same three things for anyone using a
// mouse or who does not know the card can be swiped.

import React from 'react';
import { Music, X, Bookmark, Play, Pause, RotateCcw, ChevronLeft } from 'lucide-react';
import { R } from './retailTheme';

const SWIPE_COMMIT = 110;   // px past which a release counts as a decision
const SWIPE_HINT   = 40;    // px at which the accept/reject tint starts showing

export default function RetailVibeDeck({
  playlists,
  savedIds,
  onSave,          // (playlist) => void   — right swipe
  onOpen,          // (playlist) => void   — tap
  onPreview,       // (playlist) => void   — called when a card becomes the top card
  onStopPreview,
  isPreviewing,
  previewLabel,    // "Artist — Title" of whatever is previewing, or null
}) {
  const [idx, setIdx]         = React.useState(0);
  const [drag, setDrag]       = React.useState(0);
  const [leaving, setLeaving] = React.useState(null); // 'left' | 'right' | null
  const startX = React.useRef(null);
  const moved  = React.useRef(false);

  const top  = playlists[idx] || null;
  // Three behind, not one: a single ghost card reads as a rendering artefact,
  // a stack reads as a queue with more in it.
  const queue = [playlists[idx + 1], playlists[idx + 2], playlists[idx + 3]].filter(Boolean);
  const done = idx >= playlists.length;

  // The card is sized from the viewport rather than a fixed max-width, because
  // at 420px wide a 3:4 card is 560px tall and, once the preview line and the
  // three buttons are under it, ran off the bottom of a laptop screen. This
  // keeps the whole control — card, preview, buttons — inside one screen.
  // Constrained by BOTH axes. Height alone was not enough: on a 390px phone a
  // 520px-tall card wants to be 390 wide, the container clamps it to ~350, and
  // the height does not follow — so the card stops being 3:4 and the artwork
  // stretches. Whichever axis runs out first decides the size.
  const [box, setBox] = React.useState({ w: 360, h: 480 });
  React.useEffect(() => {
    const measure = () => {
      const chrome = window.innerWidth >= 1024 ? 300 : 250;  // header, preview line, buttons
      const railW  = window.innerWidth >= 1024 ? 360 : 0;    // the rail beside it
      const byHeight = Math.max(280, Math.min(window.innerHeight - chrome, 520));
      const byWidth  = Math.max(210, Math.min(window.innerWidth - railW - 40, 420));
      const h = Math.min(byHeight, byWidth / 0.75);
      setBox({ w: Math.round(h * 0.75), h: Math.round(h) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const cardW = box.w;
  const cardH = box.h;

  // Preview follows the top card. Keyed on the id rather than the object so a
  // re-render of the same card does not restart the track, and delayed so that
  // swiping quickly through five vibes fires one fetch at the end rather than
  // five, each of which would start a track nobody hears.
  const topId = top?.id;
  React.useEffect(() => {
    if (!topId) return;
    const t = setTimeout(() => {
      onPreview?.(playlists.find(p => p.id === topId));
    }, 450);
    return () => clearTimeout(t);
  }, [topId]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (dir) => {
    if (!top) return;
    setLeaving(dir);
    if (dir === 'right' && !savedIds.has(top.id)) onSave?.(top);
    // Let the card fly out before the next one takes its place.
    setTimeout(() => {
      setLeaving(null);
      setDrag(0);
      setIdx(i => i + 1);
    }, 220);
  };

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; moved.current = false; };
  const onTouchMove  = (e) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (Math.abs(dx) > 6) moved.current = true;
    setDrag(dx);
  };
  const onTouchEnd = () => {
    if (startX.current === null) return;
    const dx = drag;
    startX.current = null;
    if (dx >  SWIPE_COMMIT) return commit('right');
    if (dx < -SWIPE_COMMIT) return commit('left');
    setDrag(0);
  };

  const restart = () => { setIdx(0); setDrag(0); };

  // ── Empty and exhausted states ─────────────────────────────────────────
  if (playlists.length === 0) {
    return (
      <div className="py-20 text-center">
        <Music className="w-10 h-10 mx-auto mb-3" style={{ color: R.textGhost }} />
        <p className="text-sm" style={{ color: R.textFaint }}>No vibes available yet.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-bold mb-1.5" style={{ color: R.text }}>That's every vibe.</p>
        <p className="text-sm mb-6" style={{ color: R.textFaint }}>
          The ones you kept are in Your Vibes at the top of this page.
        </p>
        <button
          onClick={restart}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition"
          style={{ background: `linear-gradient(145deg, ${R.violetLift}, ${R.violet})`, color: '#F5F3FF' }}
        >
          <RotateCcw className="w-4 h-4" />
          Go through them again
        </button>
      </div>
    );
  }

  const offset   = leaving === 'left' ? -520 : leaving === 'right' ? 520 : drag;
  const rotation = offset / 22;
  const tint     = Math.min(Math.abs(offset) / 200, 0.55);
  const saved    = savedIds.has(top.id);

  const Card = ({ pl, style, faded, onClick }) => (
    <div
      className="absolute inset-0 rounded-[28px] overflow-hidden select-none"
      style={{
        background: 'linear-gradient(150deg, rgba(26,22,40,0.94) 0%, rgba(12,12,20,0.98) 60%, rgba(6,6,10,0.99) 100%)',
        border: `1px solid ${R.borderUp}`,
        boxShadow: faded ? '0 8px 30px rgba(0,0,0,0.4)' : '0 24px 70px rgba(0,0,0,0.65)',
        ...style,
      }}
      onClick={onClick}
    >
      {pl.cover_image_url ? (
        <img src={pl.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Music className="w-16 h-16" style={{ color: R.textGhost }} />
        </div>
      )}

      {/* The text has to stay readable over any artwork, so it sits on its own
          gradient rather than trusting the image to be dark at the bottom. */}
      <div
        className="absolute inset-x-0 bottom-0 p-6"
        style={{ background: 'linear-gradient(to top, rgba(5,5,9,0.97) 12%, rgba(5,5,9,0.82) 48%, transparent 100%)' }}
      >
        {pl.mood && (
          <span className="inline-block text-[10px] font-bold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full mb-2.5"
            style={{ background: R.blueSoft, color: R.blueLift, border: '1px solid rgba(37,81,196,0.40)' }}>
            {pl.mood}
          </span>
        )}
        <h3 className="text-2xl sm:text-3xl font-black leading-tight" style={{ color: R.text }}>{pl.title}</h3>
        {pl.description && (
          <p className="text-sm mt-1.5 line-clamp-2 leading-relaxed" style={{ color: R.textDim }}>{pl.description}</p>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-xs" style={{ color: R.textFaint }}>
          Swipe left to pass, right to keep. Tap the card to open the record.
        </p>
        <p className="text-[11px]" style={{ color: R.textGhost }}>{playlists.length - idx} left</p>
      </div>

      {/* The deck. A 3:4 window sized to fit the screen it is on, centred,
          with the rest of the queue stacked behind it. */}
      <div
        className="relative mx-auto"
        style={{ width: cardW, height: cardH }}
      >
        {/* The queue. Each one further back, smaller, dimmer and greyer, so
            the stack has depth without any of them competing to be read. */}
        {queue.map((pl, n) => {
          const depth = queue.length - n;   // the furthest card draws first
          const q = queue[queue.length - n - 1];
          return (
            <Card
              key={q.id}
              pl={q}
              faded
              style={{
                transform: `scale(${1 - depth * 0.045}) translateY(${depth * 12}px)`,
                opacity: 0.55 - (depth - 1) * 0.16,
                filter: `saturate(${0.7 - (depth - 1) * 0.2}) blur(${(depth - 1) * 1.2}px)`,
                zIndex: 0,
              }}
            />
          );
        })}

        <div
          className="absolute inset-0"
          style={{
            transform: `translateX(${offset}px) rotate(${rotation}deg)`,
            transition: startX.current === null ? 'transform 0.22s cubic-bezier(0.32,0.72,0,1)' : 'none',
            touchAction: 'pan-y',
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <Card
            pl={top}
            onClick={() => { if (!moved.current) onOpen?.(top); }}
          />

          {/* Decision tint. Green for keep, red for pass — it appears as you
              drag so the gesture confirms itself before you let go. */}
          {Math.abs(offset) > SWIPE_HINT && (
            <div
              className="absolute inset-0 rounded-[28px] pointer-events-none flex items-center justify-center"
              style={{ background: offset > 0 ? `rgba(47,125,79,${tint})` : `rgba(163,43,43,${tint})` }}
            >
              {offset > 0
                ? <Bookmark className="w-16 h-16 text-white drop-shadow-lg" fill="currentColor" />
                : <X className="w-16 h-16 text-white drop-shadow-lg" />}
            </div>
          )}
        </div>
      </div>

      {/* What is playing underneath the deck — the preview is the whole point,
          so it gets a line of its own rather than being invisible. */}
      <div className="mt-5 flex items-center justify-center gap-2.5 min-h-[24px]">
        {previewLabel ? (
          <>
            <button
              onClick={() => (isPreviewing ? onStopPreview?.() : onPreview?.(top))}
              className="w-7 h-7 rounded-full flex items-center justify-center transition flex-shrink-0"
              style={{ background: R.surface2, border: `1px solid ${R.border}` }}
            >
              {isPreviewing ? <Pause className="w-3.5 h-3.5" style={{ color: R.text }} /> : <Play className="w-3.5 h-3.5" style={{ color: R.text }} />}
            </button>
            <p className="text-xs truncate max-w-[280px]" style={{ color: R.textFaint }}>
              {isPreviewing ? 'Previewing' : 'Paused'} · <span style={{ color: R.textDim }}>{previewLabel}</span>
            </p>
          </>
        ) : (
          <p className="text-xs" style={{ color: R.textGhost }}>No preview for this vibe yet</p>
        )}
      </div>

      {/* Same three decisions, for a mouse or a tablet on a stand where a
          full swipe is awkward. */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          onClick={() => commit('left')}
          title="Not for this room"
          className="w-14 h-14 rounded-full flex items-center justify-center transition"
          style={{ background: R.surface, border: `1px solid ${R.border}` }}
        >
          <X className="w-6 h-6" style={{ color: R.textDim }} />
        </button>

        <button
          onClick={() => onOpen?.(top)}
          className="px-6 h-14 rounded-full text-sm font-bold flex items-center gap-2 transition active:scale-95"
          style={{ background: `linear-gradient(145deg, ${R.violetLift}, ${R.violet})`, color: '#F5F3FF', boxShadow: '0 8px 22px rgba(109,40,217,0.40)' }}
        >
          <ChevronLeft className="w-4 h-4 rotate-180" />
          Open the record
        </button>

        <button
          onClick={() => commit('right')}
          title={saved ? 'Already in Your Vibes' : 'Keep this vibe'}
          className="w-14 h-14 rounded-full flex items-center justify-center transition"
          style={saved
            ? { background: R.blueSoft, border: `1px solid rgba(37,81,196,0.55)`, color: R.blueLift }
            : { background: R.surface, border: `1px solid ${R.border}`, color: R.textDim }}
        >
          <Bookmark className="w-6 h-6" fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  );
}