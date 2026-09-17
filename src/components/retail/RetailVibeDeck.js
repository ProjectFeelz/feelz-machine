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
const DEPTH        = 3;     // cards flanking the front one
// How many card-widths the fan occupies in total: the card plus what the
// outermost flank reaches past each side.
// On a wide screen the flanks stand well clear of the front card; on a phone
// they tuck in to a peek, because a fan wide enough to look good on a desktop
// would otherwise force the card itself down to a thumbnail.
const FAN_WIDE     = 0.30;   // ≥ 640px: how far out the first flank sits
const FAN_TIGHT    = 0.15;   // < 640px
const fanRoom = (base) => 1 + 2 * (base + (Math.ceil(DEPTH / 2) - 1) * base * 0.53);

// Reduced motion is honoured: the stack still shows depth, it just does not
// animate between positions.
const REDUCED = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Where a card sits at a given depth. 0 is the front card.
//
// The queue FLANKS the front card rather than stacking behind it: depth 1 to
// the right, depth 2 to the left, depth 3 further right, alternating outwards.
// Each one is rotated slightly away and pushed back, like records fanned in a
// crate, so the stack has width and the front card has air around it instead
// of a pile of edges poking out of its top.
//
// `fan` is a fraction of the card's own width, so the spread scales with the
// card on a phone instead of flying off the sides.
function depthStyle(d, w, base) {
  if (d === 0) {
    return { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', opacity: 1, filter: 'none', zIndex: 40 };
  }
  const side  = d % 2 === 1 ? 1 : -1;          // right, left, right, …
  const rank  = Math.ceil(d / 2);              // how far out on that side
  const shift = side * w * (base + (rank - 1) * base * 0.53);
  const tilt  = side * (5 + (rank - 1) * 3);
  const scale = 1 - rank * 0.07;

  return {
    transform: `translate3d(${shift}px, ${rank * 10}px, 0) rotate(${tilt}deg) scale(${scale})`,
    opacity: Math.max(0.26, 0.72 - (rank - 1) * 0.26),
    filter: `saturate(${Math.max(0.35, 0.85 - rank * 0.22)}) blur(${(rank - 1) * 1.2}px)`,
    zIndex: 40 - d,
  };
}

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
  const done = idx >= playlists.length;

  // The visible stack: the front card plus DEPTH behind it. Rendered from one
  // array rather than three hard-coded classes, which is what makes the
  // cascade work — each card keeps its DOM node as idx advances, so when the
  // front one flies out the others animate FORWARD into its place instead of
  // snapping. A fixed slice also means a forty-vibe queue still renders four
  // nodes, not forty.
  const visible = playlists.slice(idx, idx + DEPTH + 1);

  // The card is sized from the viewport rather than a fixed max-width, because
  // at 420px wide a 3:4 card is 560px tall and, once the preview line and the
  // three buttons are under it, ran off the bottom of a laptop screen. This
  // keeps the whole control — card, preview, buttons — inside one screen.
  // ── HOW BIG THE CARD IS ───────────────────────────────────────────────
  //
  // Constrained by BOTH axes. Height alone was not enough: on a 390px phone a
  // 520px-tall card wants to be 390 wide, the container clamps it to ~350, and
  // the height does not follow — so the card stops being 3:4 and the artwork
  // stretches. Whichever axis runs out first decides the size.
  //
  // THE HEIGHT IS MEASURED, NOT ESTIMATED.
  //
  // The version before this subtracted a guessed 132px for "the chrome" — the
  // swipe hint, the preview line and the button row. On a phone the real
  // figure is closer to 190 once those rows wrap, so the card was sized about
  // fifty pixels too tall, the button row was pushed past the bottom of the
  // deck's share of the frame, and the rail underneath sat on top of it. That
  // is the cut-off "Open the record" button in the screenshot.
  //
  // So the rows measure themselves. The card gets whatever is left over,
  // which is right at any font size, any language, and whether or not the
  // preview line has anything in it.
  const rootRef    = React.useRef(null);
  const headRef    = React.useRef(null);
  const previewRef = React.useRef(null);
  const btnsRef    = React.useRef(null);

  const [box, setBox] = React.useState({ w: 360, h: 480, fan: FAN_WIDE });
  React.useEffect(() => {
    const measure = () => {
      const wide = window.innerWidth >= 1024;

      // The box the deck has been given. On a phone that is the 58% slice
      // RetailDeckView hands it; on a desktop it is the full column. Measured
      // from the parent rather than the window, because the window does not
      // know about the header, the rail or the page's padding.
      const parent  = rootRef.current?.parentElement;
      const given   = parent?.clientHeight || (window.innerHeight - 76);

      // The rows that are not the card, as they actually render — including
      // the margins between them (mb-4 = 16, mt-5 = 20, twice) and the
      // parent's own py-4.
      const rows = (headRef.current?.offsetHeight    || 0) + 16
                 + (previewRef.current?.offsetHeight || 0) + 20
                 + (btnsRef.current?.offsetHeight    || 0) + 20;
      const chrome = rows > 40 ? rows + 32 : (wide ? 216 : 190);   // fallback for the first paint

      const byHeight = Math.max(200, Math.min(given - chrome, 520));

      // The fan reaches about 0.62 of a card's width past each side, so the
      // card itself can only have what is left after both flanks.
      const railW    = wide ? 360 : 0;
      const base     = window.innerWidth >= 640 ? FAN_WIDE : FAN_TIGHT;
      const usable   = window.innerWidth - railW - 40;
      const byWidth  = Math.max(150, Math.min(usable / fanRoom(base), 400));

      const h = Math.min(byHeight, byWidth / 0.75);
      setBox({ w: Math.round(h * 0.75), h: Math.round(h), fan: base });
    };

    measure();
    // Twice more: once on the next frame, when the rows have laid out and can
    // be measured for real, and once when anything around the deck resizes.
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);

    let ro;
    const parent = rootRef.current?.parentElement;
    if (parent && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(parent);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
    // previewLabel is in here because that line wraps to two rows on a narrow
    // phone when a title is long, and that changes what is left for the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewLabel]);

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

  return (
    <div ref={rootRef}>
      <div ref={headRef} className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        {/* The instruction is for a mouse and a tablet on a stand. On a phone
            it wrapped to two lines and ate the card's height to explain a
            gesture that phone is already the natural home of — and the three
            buttons underneath say the same thing without any words. */}
        <p className="hidden sm:block text-xs" style={{ color: R.textFaint }}>
          Swipe left to pass, right to keep. Tap the card to open the record.
        </p>
        <p className="text-[11px]" style={{ color: R.textGhost }}>{playlists.length - idx} left</p>
      </div>

      {/* THE CASCADE
          One absolutely-positioned stack, rendered from `visible` deepest
          first so DOM order and z-index agree. The front card is the only one
          that takes the drag; the others are inert and lean back behind it.

          The thing that makes it cascade rather than cut: every card is keyed
          by its playlist id, so when idx advances React keeps each node and
          only changes its transform. Depth 2 animates into depth 1, depth 1
          into the front, all on the same easing as the card flying out. Keying
          by index instead would swap the contents underneath a static
          transform and the whole effect collapses. */}
      <div
        className="relative mx-auto"
        style={{ width: cardW, height: cardH }}
      >
        {visible.slice().reverse().map((pl) => {
          const d = visible.indexOf(pl);
          const isFront = d === 0;
          const ds = depthStyle(d, cardW, box.fan);

          return (
            <div
              key={pl.id}
              className="absolute inset-0"
              style={{
                ...ds,
                // The front card carries the drag on top of its own transform.
                transform: isFront
                  ? `translate3d(${offset}px,0,0) rotate(${rotation}deg)`
                  : ds.transform,
                transition: REDUCED
                  ? 'none'
                  : (isFront && startX.current !== null
                      ? 'none'                       // following the finger, no lag
                      : 'transform 0.34s cubic-bezier(0.32,0.72,0,1), opacity 0.34s ease, filter 0.34s ease'),
                willChange: 'transform, opacity',
                touchAction: isFront ? 'pan-y' : 'auto',
                pointerEvents: isFront ? 'auto' : 'none',
              }}
              onTouchStart={isFront ? onTouchStart : undefined}
              onTouchMove={isFront ? onTouchMove : undefined}
              onTouchEnd={isFront ? onTouchEnd : undefined}
            >
              <div
                className="absolute inset-0 rounded-[28px] overflow-hidden select-none"
                style={{
                  background: 'linear-gradient(150deg, rgba(26,22,40,0.94) 0%, rgba(12,12,20,0.98) 60%, rgba(6,6,10,0.99) 100%)',
                  border: `1px solid ${isFront ? R.chromeDim : R.border}`,
                  boxShadow: isFront
                    ? '0 26px 70px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.10)'
                    // A lit top edge on the ones behind. Without it a dark
                    // sleeve on a black page has no silhouette at all and the
                    // depth disappears on exactly the artwork that needs it.
                    : '0 -1px 0 rgba(198,202,212,0.22) inset, 0 12px 34px rgba(0,0,0,0.55)',
                }}
                onClick={isFront ? () => { if (!moved.current) onOpen?.(pl); } : undefined}
              >
                {pl.cover_image_url ? (
                  <img src={pl.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Music className="w-16 h-16" style={{ color: R.textGhost }} />
                  </div>
                )}

                {/* Only the front card carries type. The ones behind are
                    shapes — three stacked titles would read as a list. */}
                {isFront && (
                  <div
                    className="absolute inset-x-0 bottom-0 p-6"
                    style={{ background: 'linear-gradient(to top, rgba(5,5,9,0.97) 12%, rgba(5,5,9,0.82) 48%, transparent 100%)' }}
                  >
                    {pl.mood && (
                      <span className="inline-block text-[10px] font-bold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full mb-2.5"
                        style={{ background: R.violetSoft, color: R.violetLift, border: `1px solid ${R.violetEdge}` }}>
                        {pl.mood}
                      </span>
                    )}
                    <h3 className="text-2xl sm:text-3xl font-black leading-tight" style={{ color: R.text }}>{pl.title}</h3>
                    {pl.description && (
                      <p className="text-sm mt-1.5 line-clamp-2 leading-relaxed" style={{ color: R.textDim }}>{pl.description}</p>
                    )}
                  </div>
                )}

                {/* Decision tint, front card only. It appears as you drag, so
                    the gesture confirms itself before you let go. */}
                {isFront && Math.abs(offset) > SWIPE_HINT && (
                  <div
                    className="absolute inset-0 pointer-events-none flex items-center justify-center"
                    style={{ background: offset > 0 ? `rgba(47,125,79,${tint})` : `rgba(163,43,43,${tint})` }}
                  >
                    {offset > 0
                      ? <Bookmark className="w-16 h-16 drop-shadow-lg" style={{ color: '#fff' }} fill="currentColor" />
                      : <X className="w-16 h-16 drop-shadow-lg" style={{ color: '#fff' }} />}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* What is playing underneath the deck — the preview is the whole point,
          so it gets a line of its own rather than being invisible. */}
      <div ref={previewRef} className="mt-5 flex items-center justify-center gap-2.5 min-h-[24px]">
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
      <div ref={btnsRef} className="mt-5 flex items-center justify-center gap-4">
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