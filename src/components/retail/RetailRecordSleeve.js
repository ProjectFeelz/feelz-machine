// src/components/retail/RetailRecordSleeve.js
//
// The record, as the thing the room looks at.
//
// Three rounds of notes got it here, and each changed something structural:
//
//   1. The disc used to drift clear of the sleeve. That was a bug, not a
//      style: VinylRecord was drawn at a hard-coded px size inside a box
//      sized in vh, so on a short window the record was bigger than its own
//      frame and spilled out. Everything is one measured number now.
//
//   2. The record was a garnish on the right. It is now the largest object on
//      the page and bleeds off the edge — big enough to be what a wall-mounted
//      screen shows while the music runs.
//
//   3. It pulled OUTWARD, off the edge of the screen, which is the one
//      direction where a bigger record buys nothing. The sleeve is now
//      anchored right and the disc slides INWARD, across the page and under
//      the tracklist, so the movement travels into the layout rather than out
//      of it.
//
// The left column is a fixed panel, darker than the page so the seam between
// it and the tracklist is a real edge, with the transport pinned to its floor
// and everything else scrolling past behind it.

import React from 'react';
import { Music, Play, Pause, Bookmark, MessageCircle, ArrowLeft, Loader } from 'lucide-react';
import VinylRecord from '../VinylRecord';
import RetailTransport from './RetailTransport';
import { R } from './retailTheme';

// "Do You Wrong (feat. Xabrien)" → { name: 'Do You Wrong', feat: 'Xabrien' }
function splitCredits(title = '') {
  const m = title.match(/[([]\s*(?:feat|ft|featuring|with)\.?\s+([^)\]]+)[)\]]\s*$/i);
  if (!m) return { name: title, feat: null };
  return { name: title.slice(0, m.index).trim(), feat: m[1].trim() };
}

const HEADER = 76;       // the page's sticky header
const PANEL  = 360;      // the left panel, matched by the deck's rail

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

  // One number drives the jacket, the disc and the travel, so they cannot get
  // out of step the way they did when the box was sized in vh and the record
  // in px. Much larger than before — this is the focal point now.
  const [jacket, setJacket] = React.useState(520);
  React.useEffect(() => {
    const measure = () =>
      setJacket(Math.round(Math.max(320, Math.min(window.innerHeight * 0.74, 680))));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // A 12" record in a 12⅜" sleeve. Travel is half the disc's width, inward,
  // so half of it is always still inside the jacket.
  const disc    = Math.round(jacket * 0.88);
  const restX   = -Math.round(jacket * 0.03);
  const pulledX = -Math.round(jacket - disc * 0.5);

  const hero = (isCurrentPlaylist && currentTrack) || tracks[0]?.track || tracks[0] || null;

  const heroTitle  = hero?.title || playlist?.title || '';
  const heroArt    = hero?.cover_artwork_url || playlist?.cover_image_url || null;
  const heroArtist = hero?.artist?.artist_name || null;
  const credits    = splitCredits(heroTitle);

  return (
    <div className="lg:flex fm-retail-record">

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────
          Darker than the page on purpose. The seam between this and the
          tracklist used to be nothing at all; the change in surface plus one
          hairline is the border now, which is calmer than drawing a box
          around either side. */}
      <aside
        className="w-full lg:flex-shrink-0 lg:flex lg:flex-col lg:sticky"
        style={{
          background: R.bgPanel,
          borderRight: `1px solid ${R.border}`,
          boxShadow: '18px 0 40px -28px rgba(0,0,0,0.9)',
          top: HEADER,
          maxWidth: '100%',
          minWidth: 0,
        }}
      >
        <style>{`
          /* Desktop only. 100vh on a phone is taller than the visible area
             because the address bar is not subtracted, which would push the
             transport below the fold — the exact thing pinning it is for. */
          @media (min-width: 1024px) {
            .fm-retail-record { min-height: calc(100vh - ${HEADER}px); }
            .fm-retail-panel  { height: calc(100vh - ${HEADER}px); width: ${PANEL}px; }
          }
        `}</style>

        <div className="fm-retail-panel lg:flex lg:flex-col lg:h-full w-full">
          {/* Everything above the transport scrolls; the transport does not. */}
          <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto px-5 pt-5 pb-3">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs transition mb-4 opacity-70 hover:opacity-100"
              style={{ color: R.textDim }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All vibes
            </button>

            <div
              className="relative w-full aspect-square rounded-xl overflow-hidden"
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
            className="lg:flex-shrink-0 px-4 pt-3 pb-4 sticky bottom-0 z-20"
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
      <main className="relative flex-1 min-w-0">

        {/* Scenery. Sleeve pinned to the right edge and allowed to bleed off
            it; the disc travels left, into the page, behind the tracklist. */}
        <div className="hidden lg:block absolute inset-0 pointer-events-none select-none z-0 overflow-hidden">
          <div
            className="absolute"
            style={{
              width: jacket,
              height: jacket,
              right: -Math.round(jacket * 0.10),
              top: '50%',
              marginTop: -(jacket / 2),
            }}
          >
            {/* The disc, behind the jacket, centred on it, emerging LEFT. */}
            <div
              className="absolute"
              style={{
                width: disc,
                height: disc,
                top: (jacket - disc) / 2,
                left: 0,
                zIndex: 1,
                transform: `translateX(${pulled ? pulledX : restX}px)`,
                transition: 'transform 1.3s cubic-bezier(0.22,0.9,0.24,1)',
                filter: 'drop-shadow(10px 20px 44px rgba(0,0,0,0.8))',
              }}
            >
              <VinylRecord
                coverUrl={heroArt}
                isPlaying={isCurrentPlaylist && isPlaying}
                size={disc}
                shadow={false}
              />
            </div>

            {/* The jacket, on top. Its LEFT edge is now the mouth the record
                comes out of, so that edge carries the depth. */}
            <div
              className="absolute inset-0 rounded-sm overflow-hidden"
              style={{
                zIndex: 2,
                background: 'linear-gradient(145deg, #191426 0%, #0A0A12 100%)',
                border: `1px solid ${R.borderUp}`,
                boxShadow: '-18px 0 40px -14px rgba(0,0,0,0.92), 0 30px 70px rgba(0,0,0,0.65)',
              }}
            >
              {playlist?.cover_image_url && (
                <img src={playlist.cover_image_url} alt="" className="w-full h-full object-cover" draggable={false} />
              )}
              <div
                className="absolute inset-0"
                style={{ boxShadow: 'inset 24px 0 44px -24px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(255,255,255,0.05)' }}
              />
              <div
                className="absolute top-0 left-0 h-full"
                style={{ width: 6, background: 'linear-gradient(270deg, rgba(0,0,0,0.55), rgba(0,0,0,0.05))' }}
              />
            </div>
          </div>
        </div>

        {/* Tracklist. Fades out to the right so it dissolves into the disc
            arriving underneath rather than stopping at a hard edge. */}
        <div className="relative z-10 px-5 lg:px-8 py-6 lg:[mask-image:linear-gradient(to_right,black_52%,rgba(0,0,0,0.28)_80%,transparent_100%)] lg:[-webkit-mask-image:linear-gradient(to_right,black_52%,rgba(0,0,0,0.28)_80%,transparent_100%)]">
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