// src/components/retail/RetailRecordSleeve.js
//
// The record, as the thing the room looks at.
//
// Four rounds of notes got it here, and the last one removed more than it
// added:
//
//   1. The disc used to drift clear of the sleeve. That was a bug, not a
//      style: VinylRecord was drawn at a hard-coded px size inside a box
//      sized in vh, so on a short window the record was bigger than its own
//      frame and spilled out. Everything is one measured number now.
//
//   2. The record was a garnish on the right. It is now the largest object on
//      the page — big enough to be what a wall-mounted screen shows while the
//      music runs.
//
//   3. It pulled outward, off the edge of the screen, which is the one
//      direction where a bigger record buys nothing.
//
//   4. THE SLEEVE IS GONE. A flat jacket carrying the playlist artwork sat
//      beside a disc that was mostly hidden behind it, and the two objects
//      competed for the same corner without either being the thing you look
//      at. One record, at the size the sleeve used to be, in the position
//      marked on the screenshot, with a real shadow under it. The file keeps
//      its name so the imports do not churn.
//
// The left column is a fixed panel, darker than the page so the seam between
// it and the tracklist is a real edge, with the transport pinned to its floor
// and everything else scrolling past behind it.

import React from 'react';
import { Music, Play, Pause, Bookmark, MessageCircle, ArrowLeft, Loader } from 'lucide-react';
import VinylRecord from '../VinylRecord';
import RetailTransport from './RetailTransport';
import RetailTonearm from './RetailTonearm';
import { R } from './retailTheme';

// "Do You Wrong (feat. Xabrien)" → { name: 'Do You Wrong', feat: 'Xabrien' }
function splitCredits(title = '') {
  const m = title.match(/[([]\s*(?:feat|ft|featuring|with)\.?\s+([^)\]]+)[)\]]\s*$/i);
  if (!m) return { name: title, feat: null };
  return { name: title.slice(0, m.index).trim(), feat: m[1].trim() };
}

const HEADER = 76;       // the page's sticky header

export default function RetailRecordSleeve({
  playlist,
  tracks,
  loadingTracks,
  currentIndex,
  isCurrentPlaylist,
  isPlaying,
  currentTrack,
  onPlayTrackAt,
  onTogglePlay,
  onBack,
  onToggleSave,
  isSaved,
  onComments,
  featuredArtists = [],
  distinctArtistCount = 0,
  audioRef,
  onNext,
  onPrev,
  shuffle,
  onToggleShuffle,
  repeat,
  onCycleRepeat,
  liked,
  onToggleLike,
}) {
  const [pulled, setPulled] = React.useState(false);
  React.useEffect(() => {
    setPulled(false);
    const t = setTimeout(() => setPulled(true), 140);
    return () => clearTimeout(t);
  }, [playlist?.id]);

  // ── WHERE THE RECORD SITS ─────────────────────────────────────────────
  //
  // MEASURED FROM THE FRAME IT LIVES IN, not from the window.
  //
  // Every earlier version sized this off window.innerHeight and a fraction
  // somebody guessed at (0.62, then 620px, then 46% from the top), which is
  // why it kept moving instead of landing: the fraction was of the wrong box,
  // so the gap underneath changed with every window.
  //
  // THE RECORD COMES FROM THE BOTTOM RIGHT.
  //
  // It used to float: a tenth of the frame's height as a gap underneath, and a
  // margin on the right, so the disc sat in the middle of the right-hand side
  // with air all round it. Steve asked for it to come from the bottom right
  // corner instead, so it now runs OFF the bottom edge and sits much closer to
  // the right, and the part you can see is the top of a record that continues
  // past the page.
  //
  // Stated as a rule so it holds at every size:
  //
  //   the record bleeds a tenth of its own diameter below the bottom edge, its
  //   top clears the header by a sliver, and the margin on the right is
  //   whatever the tonearm needs and no more.
  //
  // THE RIGHT MARGIN IS NOT A TASTE DECISION. The tonearm's bearing sits just
  // outside the rim — that is where it is on the reference vector and where it
  // is on a real deck — and the housing, with the counterweight stub on the
  // back of it, reaches about 13 percent of the disc's diameter past the right
  // edge. A margin any smaller than that slices the pivot in half and the arm
  // appears to grow out of the edge of the screen; 15 percent leaves a hair of
  // clearance so a rounding difference cannot shave the stub.
  // So the margin is derived from the disc, not from the window, and the
  // window only gets to cap it so the tracklist is never squeezed.
  //
  // BLEED is 10 percent and not more for the same kind of reason: the stylus
  // lands at about 88 percent of the way down the disc, so anything past a
  // tenth starts cutting off the cartridge — the one part of this drawing that
  // has to be visible for the picture to mean "playing".
  const frameRef = React.useRef(null);
  const [geom, setGeom] = React.useState({ disc: 520, bleed: 52, right: 68 });
  React.useEffect(() => {
    const measure = () => {
      const el = frameRef.current;
      // Before the first paint there is nothing to measure; the window minus
      // the header is the same box, so it is a safe stand-in for one frame.
      const h = el?.clientHeight || (window.innerHeight - HEADER);
      const w = el?.clientWidth  || window.innerWidth;

      const gapAbove = Math.round(h * 0.04);   // just enough to clear the header
      const BLEED    = 0.10;                   // of the disc, below the fold

      // Solving top = gapAbove with bottom = -BLEED*d gives d = (h - gapAbove)
      // / (1 - BLEED). Worth spelling out rather than tuning a number until it
      // looked right, because it is what keeps the top edge steady while the
      // bottom runs off.
      let d = Math.round((h - gapAbove) / (1 - BLEED));
      // On a narrow desktop the height alone would hand the record the whole
      // column and leave the tracklist a sliver. The width gets a say.
      d = Math.min(d, Math.round(w * 0.66));
      d = Math.max(280, Math.min(d, 1100));

      const bleed = Math.round(d * BLEED);

      // Room for the pivot housing, capped so the tracklist keeps its column.
      const right = Math.max(16, Math.min(Math.round(d * 0.15), Math.round((w - d) * 0.45)));

      setGeom({ disc: d, bleed, right });
    };
    measure();
    window.addEventListener('resize', measure);
    // The frame is a flex child; its height settles after layout, not after
    // the first render, so one more measurement on the next frame.
    const raf = requestAnimationFrame(measure);
    return () => { window.removeEventListener('resize', measure); cancelAnimationFrame(raf); };
  }, []);
  const disc = geom.disc;

  // The phone's half-record needs a pixel diameter, because VinylRecord draws
  // an SVG and an SVG cannot be sized in percentages the way a div can.
  const halfRef = React.useRef(null);
  const [halfW, setHalfW] = React.useState(300);
  React.useEffect(() => {
    const measure = () => setHalfW(halfRef.current?.clientWidth || 300);
    measure();
    window.addEventListener('resize', measure);
    const raf = requestAnimationFrame(measure);
    return () => { window.removeEventListener('resize', measure); cancelAnimationFrame(raf); };
  }, []);

  const hero = (isCurrentPlaylist && currentTrack) || tracks[0]?.track || tracks[0] || null;

  const heroTitle  = hero?.title || playlist?.title || '';
  const heroArt    = hero?.cover_artwork_url || playlist?.cover_image_url || null;
  const heroArtist = hero?.artist?.artist_name || null;
  const credits    = splitCredits(heroTitle);

  return (
    <div className="fm-retail-record flex flex-col lg:flex-row">

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────
          Darker than the page on purpose. The seam between this and the
          tracklist used to be nothing at all; the change in surface plus one
          hairline is the border now, which is calmer than drawing a box
          around either side. */}
      <aside
        className="w-full lg:w-[360px] flex-shrink-0 flex flex-col"
        style={{
          background: R.bgPanel,
          borderRight: `1px solid ${R.border}`,
          borderBottom: `1px solid ${R.border}`,
          boxShadow: '18px 0 40px -28px rgba(0,0,0,0.9)',
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        <style>{`
          /* The page does not scroll. It is a fixed frame the height of the
             viewport, and the tracklist is the only thing inside it that
             moves — which is why the frame is sized in dvh rather than vh:
             on a phone, vh does not subtract the address bar, so a "fixed"
             page would still be taller than the screen and the bottom of it
             would be cut off. dvh is the visible height, address bar and all.

             Scrollbars stay hidden globally (index.css), so the scrolling
             tracklist shows no bar. */
          /* PHONE: one column that scrolls.
             The fixed frame is a DESKTOP rule and was never right on a phone —
             the panel, the record, the details and the transport cannot fit in
             one screen at that width, so a frame with overflow:hidden simply
             cut the bottom off, which is what the phone screenshots show. Here
             it is a normal page: at least a screen tall, scrolling if longer. */
          .fm-retail-record {
            min-height: calc(100vh - ${HEADER}px);
            min-height: calc(100dvh - ${HEADER}px);
          }
          @media (min-width: 1024px) {
            .fm-retail-record {
              height: calc(100vh - ${HEADER}px);
              height: calc(100dvh - ${HEADER}px);
              overflow: hidden;
            }
            /* Height only. The WIDTH lives on the <aside> via lg:w-[360px]. */
            .fm-retail-panel { height: 100%; }
          }
        `}</style>

        <div className="fm-retail-panel flex flex-col w-full min-h-0">
          {/* Everything above the transport scrolls; the transport does not. */}
          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto px-5 pt-4 lg:pt-5 pb-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs transition mb-4 opacity-70 hover:opacity-100"
              style={{ color: R.textDim }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All vibes
            </button>

            {/* ── PHONE: half a record, not a postage stamp ─────────────────
                The square cover art was 128px of the screen doing the job of
                an icon. On a phone there is no room for the big sleeve on the
                right, so the record comes here instead: the top half of it,
                full width, turning while the music plays, cut flat along the
                bottom edge. Tapping it plays and pauses.

                Clipped by the wrapper, which is why the record itself is drawn
                with shadow={false} — a soft drop shadow inside a clipping box
                reads as a grey rectangle rather than a shadow. */}
            <div className="lg:hidden">
              <div
                ref={halfRef}
                className="relative w-full max-w-[340px] mx-auto overflow-hidden"
                style={{ height: Math.round(halfW / 2) }}
              >
                <button
                  onClick={onTogglePlay}
                  aria-label={isCurrentPlaylist && isPlaying ? 'Pause' : 'Play'}
                  className="absolute inset-0 z-10"
                  style={{ background: 'transparent' }}
                />
                <div className="absolute left-1/2 top-0" style={{ transform: 'translateX(-50%)' }}>
                  <VinylRecord
                    coverUrl={heroArt}
                    isPlaying={isCurrentPlaylist && isPlaying}
                    size={halfW}
                    shadow={false}
                  />
                </div>
                {/* The cut edge. A hairline of light along the bottom so the
                    record reads as passing behind the panel rather than as an
                    image that happens to stop. */}
                <div
                  className="absolute bottom-0 left-0 right-0 pointer-events-none"
                  style={{
                    height: 1,
                    background: `linear-gradient(90deg, transparent, ${R.chromeDim}, transparent)`,
                  }}
                />
              </div>
            </div>

            <div
              className="relative hidden lg:block w-full aspect-square rounded-xl overflow-hidden lg:mx-0"
              style={{
                background: 'linear-gradient(145deg, #16121F 0%, #0A0A10 100%)',
                border: `1px solid ${R.borderUp}`,
                boxShadow: '0 22px 56px rgba(0,0,0,0.65)',
              }}
            >
              {heroArt
                ? <img src={heroArt} alt="" className="w-full h-full object-cover" draggable={false} />
                : <div className="w-full h-full flex items-center justify-center"><Music className="w-14 h-14" style={{ color: R.textGhost }} /></div>}

              <button
                onClick={onTogglePlay}
                className="absolute inset-0 flex items-center justify-center transition group"
                style={{ background: 'transparent' }}
              >
                <span
                  className="w-16 h-16 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition"
                  style={{ background: 'rgba(8,8,12,0.66)', border: `1px solid ${R.borderUp}`, backdropFilter: 'blur(8px)' }}
                >
                  {isCurrentPlaylist && isPlaying
                    ? <Pause className="w-7 h-7" style={{ color: R.text }} fill="currentColor" />
                    : <Play className="w-7 h-7 ml-0.5" style={{ color: R.text }} fill="currentColor" />}
                </span>
              </button>
            </div>

            <p className="text-[10px] uppercase tracking-[0.24em] font-bold mt-5 mb-1.5" style={{ color: R.violetLift }}>
              {isCurrentPlaylist && isPlaying ? 'Now playing' : 'Up first'}
            </p>
            <h2 className="text-2xl font-black leading-tight" style={{ color: R.text }}>{credits.name}</h2>
            {heroArtist && <p className="text-sm mt-1" style={{ color: R.textDim }}>{heroArtist}</p>}
            {credits.feat && <p className="text-xs mt-1.5" style={{ color: R.blueLift }}>with {credits.feat}</p>}

            <div className="h-px my-5" style={{ background: R.border }} />

            <p className="text-[10px] uppercase tracking-[0.24em] font-bold mb-1.5" style={{ color: R.textFaint }}>
              The vibe
            </p>
            <p className="text-lg font-bold leading-tight" style={{ color: R.text }}>{playlist?.title}</p>

            <div className="flex items-center flex-wrap gap-2 mt-2">
              {playlist?.mood && (
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: R.blueSoft, color: R.blueLift, border: '1px solid rgba(37,81,196,0.40)' }}
                >
                  {playlist.mood}
                </span>
              )}
              <span className="text-xs" style={{ color: R.textFaint }}>
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
              </span>
            </div>

            {playlist?.description && (
              <p className="text-sm mt-2.5 leading-relaxed" style={{ color: R.textDim }}>{playlist.description}</p>
            )}

            {featuredArtists.length > 0 && (
              <p className="text-xs mt-2.5" style={{ color: R.textFaint }}>
                Featuring <span style={{ color: R.textDim }}>{featuredArtists.join(', ')}</span>
                {distinctArtistCount > featuredArtists.length && (
                  <span> and {distinctArtistCount - featuredArtists.length} more</span>
                )}
              </p>
            )}

            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <button
                onClick={onToggleSave}
                className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-full transition"
                style={{
                  background: isSaved ? R.violetSoft : 'rgba(255,255,255,0.045)',
                  border: `1px solid ${isSaved ? R.violetEdge : R.border}`,
                  color: isSaved ? R.violetLift : R.textDim,
                }}
              >
                <Bookmark className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} />
                {isSaved ? 'Saved' : 'Save this vibe'}
              </button>
              <button
                onClick={onComments}
                className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-full transition"
                style={{ background: 'rgba(255,255,255,0.045)', border: `1px solid ${R.border}`, color: R.textDim }}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Comments
              </button>
            </div>
          </div>

          {/* Pinned to the floor of the panel on a desktop, and to the bottom
              of the viewport on a phone — the same promise on a screen that
              has no second column. */}
          <div
            className="flex-shrink-0 px-4 pt-3 pb-4 z-20"
            style={{ background: R.bgPanel, borderTop: `1px solid ${R.border}` }}
          >
            <RetailTransport
              audioRef={audioRef}
              title={credits.name}
              artistName={heroArtist}
              isPlaying={isCurrentPlaylist && isPlaying}
              onTogglePlay={onTogglePlay}
              onNext={onNext}
              onPrev={onPrev}
              shuffle={shuffle}
              onToggleShuffle={onToggleShuffle}
              repeat={repeat}
              onCycleRepeat={onCycleRepeat}
              liked={liked}
              onToggleLike={onToggleLike}
            />
          </div>
        </div>
      </aside>

      {/* ── RIGHT: the record, and the tracklist over it ───────────────────── */}
      <main ref={frameRef} className="relative flex-1 min-w-0 min-h-0 overflow-hidden">

        {/* ── THE RECORD ──────────────────────────────────────────────────
            The sleeve is gone.

            It was never working: a flat jacket with the playlist artwork on
            it sat beside a disc that was mostly hidden behind it, and the two
            objects fought each other for the same corner of the screen —
            neither one large enough to be the thing you look at. One record,
            at the size the sleeve used to be, in the position marked on the
            screenshot, is what the page was reaching for.

            Nothing animates sideways any more, because there is nothing to
            slide out of. It arrives instead: a breath of scale and opacity,
            then it turns while the music plays.

            Placed by the same rule as before, so it cannot drift: the gap
            underneath is a tenth of this area's height and the record is
            anchored to it, with a margin on the right rather than bleeding
            off the edge — the circle on the screenshot stops short of the
            edge, and that margin is what makes it read as an object on a
            surface rather than a shape leaving the screen. */}
        <div className="hidden lg:block absolute inset-0 pointer-events-none select-none z-0 overflow-hidden">
          <div
            className="absolute"
            style={{
              width: disc,
              height: disc,
              right: geom.right,
              bottom: -geom.bleed,
              zIndex: 1,
              // The shadow he asked for. Big, soft and offset down-right, so
              // the record sits ON the page rather than being printed into
              // it — with a tighter second one underneath for contact.
              filter: 'drop-shadow(26px 34px 60px rgba(0,0,0,0.85)) '
                    + 'drop-shadow(6px 10px 18px rgba(0,0,0,0.55))',
              transform: pulled ? 'scale(1)' : 'scale(0.965)',
              opacity: pulled ? 1 : 0,
              transition: 'transform 1.1s cubic-bezier(0.22,0.9,0.24,1), opacity 0.7s ease',
            }}
          >
            <VinylRecord
              coverUrl={heroArt}
              isPlaying={isCurrentPlaylist && isPlaying}
              size={disc}
              shadow={false}
            />
          </div>

          {/* The arm, in its own box on exactly the same geometry.
              NOT inside the record's div, because that div carries the record's
              drop-shadow filter and a filter applies to everything underneath
              it — the arm would have been given the record's shadow on top of
              its own. Same width, same anchors, one layer up. */}
          <div
            className="absolute"
            style={{
              width: disc,
              height: disc,
              right: geom.right,
              bottom: -geom.bleed,
              zIndex: 2,
              opacity: pulled ? 1 : 0,
              transition: 'opacity 0.8s ease 0.15s',
            }}
          >
            <RetailTonearm
              playing={isCurrentPlaylist && isPlaying}
              uid={playlist?.id || 'record'}
            />
          </div>
        </div>

        {/* Tracklist. Fades out to the right so it dissolves into the disc
            arriving underneath rather than stopping at a hard edge. */}
        {/* THE ONLY SCROLLING ELEMENT ON THE PAGE.
            Its bar is hidden by the global rule in index.css. */}
        <div className="relative z-10 lg:h-full lg:overflow-y-auto px-5 lg:px-8 py-6 lg:[mask-image:linear-gradient(to_right,black_52%,rgba(0,0,0,0.28)_80%,transparent_100%)] lg:[-webkit-mask-image:linear-gradient(to_right,black_52%,rgba(0,0,0,0.28)_80%,transparent_100%)]">
          <p className="text-[10px] uppercase tracking-[0.24em] font-bold mb-3" style={{ color: R.textFaint }}>
            Tracklist
          </p>

          {loadingTracks ? (
            <div className="flex justify-center py-12"><Loader className="w-5 h-5 animate-spin" style={{ color: R.textFaint }} /></div>
          ) : tracks.length === 0 ? (
            <p className="text-sm py-12" style={{ color: R.textFaint }}>No tracks in this vibe yet.</p>
          ) : (
            <div className="space-y-0.5 lg:max-w-[560px]">
              {tracks.map((row, i) => {
                const t = row.track || row;
                const live = isCurrentPlaylist && i === currentIndex;
                const c = splitCredits(t.title || '');
                return (
                  <div
                    key={row.id || t.id || i}
                    onClick={() => onPlayTrackAt(i)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlayTrackAt(i); } }}
                    className="flex items-center gap-3.5 px-3 py-2.5 rounded-lg cursor-pointer transition"
                    style={live
                      ? { background: R.violetSoft, boxShadow: `inset 2px 0 0 ${R.violetLift}` }
                      : { background: 'transparent' }}
                    onMouseEnter={(e) => { if (!live) e.currentTarget.style.background = 'rgba(255,255,255,0.045)'; }}
                    onMouseLeave={(e) => { if (!live) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span className="w-5 text-xs font-mono flex-shrink-0" style={{ color: live ? R.violetLift : R.textGhost }}>
                      {live && isPlaying
                        ? <Play className="w-3.5 h-3.5" fill="currentColor" />
                        : String(i + 1).padStart(2, '0')}
                    </span>

                    <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0" style={{ background: R.surface2 }}>
                      {t.cover_artwork_url
                        ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" draggable={false} />
                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4" style={{ color: R.textGhost }} /></div>}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] truncate" style={{ color: live ? R.violetLift : R.text, fontWeight: live ? 600 : 400 }}>
                        {c.name}
                      </p>
                      <p className="text-xs truncate" style={{ color: R.textFaint }}>
                        {t.artist?.artist_name}
                        {c.feat && <span style={{ color: R.textGhost }}> · with {c.feat}</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}