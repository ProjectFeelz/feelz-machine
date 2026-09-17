// src/components/retail/RetailRecordSleeve.js
//
// The playlist as a record half out of its sleeve.
//
// Two things were wrong with the first version, both visible in a screenshot:
//
//   1. The disc had drifted clear of the sleeve. It was the same size as the
//      jacket and translated far enough right to sit beside it, so it read as
//      two objects on a page rather than one object coming out of another.
//      Fixed by seating it properly: the disc is slightly SMALLER than the
//      jacket, as a 12" record is inside a 12⅜" sleeve; it is vertically
//      centred on the jacket, not aligned to its top; and it travels exactly
//      half its own width, so half the disc is always behind the jacket.
//      The jacket sits above it, so the overlap is the disc disappearing
//      behind the card rather than the card floating on top of a circle.
//
//   2. The palette was the app's violet, which on a wall-mounted venue tablet
//      read as a toy. It is now warm black and brass with rust as the accent
//      (see retailTheme.js), and violet appears once, on nothing structural.
//
// The transport moved in here too, as a card under the song details, so the
// player bar could come off the bottom of the window entirely.

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
  // transport
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
    const t = setTimeout(() => setPulled(true), 120);
    return () => clearTimeout(t);
  }, [playlist?.id]);

  // One number drives the jacket, the disc and the travel, so they cannot get
  // out of step with each other the way they did when the box was sized in vh
  // and the record in px.
  const [jacket, setJacket] = React.useState(380);
  React.useEffect(() => {
    const measure = () => setJacket(Math.round(Math.max(260, Math.min(window.innerHeight * 0.46, 420))));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // A 12" record inside a 12⅜" sleeve: the disc is slightly smaller, so the
  // jacket can cover it completely when it is pushed home.
  const disc   = Math.round(jacket * 0.88);
  const restX  = Math.round(jacket * 0.03);          // tucked in, a sliver showing
  const pulledX = Math.round(jacket - disc * 0.5);   // half out, half still inside

  const hero = (isCurrentPlaylist && currentTrack) || tracks[0]?.track || tracks[0] || null;

  const heroTitle  = hero?.title || playlist?.title || '';
  const heroArt    = hero?.cover_artwork_url || playlist?.cover_image_url || null;
  const heroArtist = hero?.artist?.artist_name || null;
  const credits    = splitCredits(heroTitle);

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs transition mb-5 hover:opacity-100 opacity-70"
        style={{ color: R.textDim }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All vibes
      </button>

      <div className="relative">
        {/* ── RECORD AND SLEEVE ─────────────────────────────────────────────
            Both objects share one square footprint. The jacket is that square;
            the disc is 88% of it, centred vertically, and slides right out of
            it by exactly half its own width. Because the disc never leaves the
            jacket's vertical band and never travels further than that, half of
            it is always behind the jacket — which is the difference between
            "coming out of" and "next to". */}
        <div className="hidden lg:block absolute top-0 right-0 h-full w-[50%] pointer-events-none select-none z-0 overflow-hidden">
          <div className="relative" style={{ width: jacket, height: jacket, marginLeft: '4%', marginTop: 8 }}>

            {/* The disc, behind the jacket, centred on it, emerging right.
                Everything here is in PIXELS and the box is the same number
                the SVG is drawn at. That was the original fault: the wrapper
                was min(46vh, 430px) while VinylRecord was hard-coded to 430,
                so on any window shorter than about 935px the record was drawn
                larger than the box holding it and spilled out to the right —
                which is exactly the "drifting away from the package" look. */}
            <div
              className="absolute"
              style={{
                width: disc,
                height: disc,
                top: (jacket - disc) / 2,
                left: 0,
                zIndex: 1,
                transform: `translateX(${pulled ? pulledX : restX}px)`,
                transition: 'transform 1.2s cubic-bezier(0.22,0.9,0.24,1)',
                filter: 'drop-shadow(-6px 18px 34px rgba(0,0,0,0.78))',
              }}
            >
              <VinylRecord
                coverUrl={heroArt}
                isPlaying={isCurrentPlaylist && isPlaying}
                size={disc}
                shadow={false}
              />
            </div>

            {/* The jacket, on top. Its right edge is the line the record comes
                out of, so it carries the shadow that sells the depth. */}
            <div
              className="absolute inset-0 rounded-sm overflow-hidden"
              style={{
                zIndex: 2,
                background: 'linear-gradient(145deg, #2A201A 0%, #120E0C 100%)',
                border: `1px solid ${R.borderUp}`,
                boxShadow: '16px 0 36px -12px rgba(0,0,0,0.9), 0 26px 60px rgba(0,0,0,0.6)',
              }}
            >
              {playlist?.cover_image_url && (
                <img
                  src={playlist.cover_image_url}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ filter: 'saturate(0.92) contrast(1.02)' }}
                  draggable={false}
                />
              )}
              <div
                className="absolute inset-0"
                style={{ boxShadow: 'inset -22px 0 40px -22px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(255,233,209,0.05)' }}
              />
              <div
                className="absolute top-0 right-0 h-full"
                style={{ width: 6, background: 'linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0.05))' }}
              />
            </div>
          </div>
        </div>

        {/* ── CONTENT ──────────────────────────────────────────────────────── */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] gap-8 lg:gap-10 lg:pr-[44%]">

          {/* Left: the song, its details, and the transport */}
          <div className="min-w-0">
            <div
              className="relative w-full max-w-[330px] aspect-square rounded-xl overflow-hidden mx-auto lg:mx-0"
              style={{
                background: 'linear-gradient(145deg, #241B16 0%, #100C0A 100%)',
                border: `1px solid ${R.borderUp}`,
                boxShadow: '0 22px 56px rgba(0,0,0,0.6)',
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
                  style={{
                    background: 'rgba(12,10,9,0.62)',
                    border: `1px solid ${R.borderUp}`,
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  {isCurrentPlaylist && isPlaying
                    ? <Pause className="w-7 h-7" style={{ color: R.text }} fill="currentColor" />
                    : <Play className="w-7 h-7 ml-0.5" style={{ color: R.text }} fill="currentColor" />}
                </span>
              </button>
            </div>

            <div className="mt-5 max-w-[330px] mx-auto lg:mx-0">
              <p className="text-[10px] uppercase tracking-[0.24em] font-bold mb-1.5" style={{ color: R.rustBright }}>
                {isCurrentPlaylist && isPlaying ? 'Now playing' : 'Up first'}
              </p>
              <h2 className="text-2xl font-black leading-tight" style={{ color: R.text }}>{credits.name}</h2>
              {heroArtist && <p className="text-sm mt-1" style={{ color: R.textDim }}>{heroArtist}</p>}
              {credits.feat && <p className="text-xs mt-1.5" style={{ color: R.brass }}>with {credits.feat}</p>}

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

              <div className="h-px my-5" style={{ background: R.border }} />

              <p className="text-[10px] uppercase tracking-[0.24em] font-bold mb-1.5" style={{ color: R.textFaint }}>
                The vibe
              </p>
              <p className="text-lg font-bold leading-tight" style={{ color: R.text }}>{playlist?.title}</p>

              <div className="flex items-center flex-wrap gap-2 mt-2">
                {playlist?.mood && (
                  <span
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: R.brassSoft, color: R.brass, border: `1px solid rgba(201,151,63,0.28)` }}
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
                    background: isSaved ? R.rustSoft : 'rgba(255,244,232,0.045)',
                    border: `1px solid ${isSaved ? R.rustEdge : R.border}`,
                    color: isSaved ? R.rustBright : R.textDim,
                  }}
                >
                  <Bookmark className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} />
                  {isSaved ? 'Saved' : 'Save this vibe'}
                </button>
                <button
                  onClick={onComments}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-full transition"
                  style={{ background: 'rgba(255,244,232,0.045)', border: `1px solid ${R.border}`, color: R.textDim }}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Comments
                </button>
              </div>
            </div>
          </div>

          {/* Right: the tracklist, running under the record */}
          <div className="min-w-0 lg:[mask-image:linear-gradient(to_right,black_58%,rgba(0,0,0,0.3)_84%,transparent_100%)] lg:[-webkit-mask-image:linear-gradient(to_right,black_58%,rgba(0,0,0,0.3)_84%,transparent_100%)]">
            <p className="text-[10px] uppercase tracking-[0.24em] font-bold mb-3" style={{ color: R.textFaint }}>
              Tracklist
            </p>

            {loadingTracks ? (
              <div className="flex justify-center py-12"><Loader className="w-5 h-5 animate-spin" style={{ color: R.textFaint }} /></div>
            ) : tracks.length === 0 ? (
              <p className="text-sm py-12" style={{ color: R.textFaint }}>No tracks in this vibe yet.</p>
            ) : (
              <div className="space-y-0.5">
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
                        ? { background: R.rustSoft, boxShadow: `inset 2px 0 0 ${R.rust}` }
                        : { background: 'transparent' }}
                      onMouseEnter={(e) => { if (!live) e.currentTarget.style.background = 'rgba(255,244,232,0.045)'; }}
                      onMouseLeave={(e) => { if (!live) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span className="w-5 text-xs font-mono flex-shrink-0" style={{ color: live ? R.rustBright : R.textGhost }}>
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
                        <p className="text-[15px] truncate" style={{ color: live ? R.rustBright : R.text, fontWeight: live ? 600 : 400 }}>
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
        </div>
      </div>
    </div>
  );
}