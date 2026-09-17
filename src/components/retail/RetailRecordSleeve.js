// src/components/retail/RetailRecordSleeve.js
//
// The playlist, as a record coming out of its sleeve.
//
// Steve's brief, and the reasoning behind each part:
//
//   * The vinyl is the hero, not a garnish. It takes half the width and
//     slides out of a sleeve on mount, the way you pull a record out of the
//     pack. The pull happens once per playlist — it is an arrival, and an
//     animation that repeats stops meaning anything.
//   * The tracklist sits to the left of the disc and runs UNDER it, fading
//     into the grooves rather than stopping at a hard edge. That fade is a
//     mask, not a black overlay, so it works over any artwork.
//   * Left of the tracklist is the current song's art, big, with its credits
//     underneath — including features, which are read off the title ("(feat.
//     …)") rather than a separate query, because that is where they already
//     live and a venue tablet should not wait on a second round trip.
//
// Below lg this collapses to one column: art, credits, tracklist. A record
// spinning at half the width of a phone is a novelty that eats the screen,
// so it is not drawn there.

import React from 'react';
import { Music, Play, Pause, Bookmark, MessageCircle, ArrowLeft, Loader } from 'lucide-react';
import VinylRecord from '../VinylRecord';

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
  isCurrentPlaylist,   // is this playlist the one actually playing
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
}) {
  // The pull-out. Runs once when the playlist opens.
  const [pulled, setPulled] = React.useState(false);
  React.useEffect(() => {
    setPulled(false);
    const t = setTimeout(() => setPulled(true), 90);
    return () => clearTimeout(t);
  }, [playlist?.id]);

  const hero = (isCurrentPlaylist && currentTrack)
    || tracks[0]?.track
    || tracks[0]
    || null;

  const heroTitle  = hero?.title || playlist?.title || '';
  const heroArt    = hero?.cover_artwork_url || playlist?.cover_image_url || null;
  const heroArtist = hero?.artist?.artist_name || null;
  const credits    = splitCredits(heroTitle);

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition mb-5"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All vibes
      </button>

      <div className="relative">
        {/* ── THE RECORD AND ITS SLEEVE ────────────────────────────────────
            Anchored to the right edge and allowed to run past it, which is
            what makes it read as half a record rather than a circle in a box.
            pointer-events-none: it is scenery, the controls are elsewhere. */}
        <div className="hidden lg:block absolute top-0 right-0 h-full w-[52%] pointer-events-none select-none z-0 overflow-hidden">
          <div className="relative w-full h-full flex items-center">
            {/* The sleeve: a square card the disc emerges from. Sits slightly
                left of the disc's resting place so the two overlap. */}
            <div
              className="absolute rounded-2xl"
              style={{
                left: '2%',
                width: 'min(46vh, 430px)',
                height: 'min(46vh, 430px)',
                background: 'linear-gradient(145deg, rgba(40,28,72,0.96) 0%, rgba(10,8,16,0.99) 100%)',
                border: '1px solid rgba(167,139,250,0.20)',
                boxShadow: '0 30px 80px rgba(0,0,0,0.65)',
                zIndex: 2,
                overflow: 'hidden',
              }}
            >
              {playlist?.cover_image_url && (
                <img src={playlist.cover_image_url} alt="" className="w-full h-full object-cover opacity-90" draggable={false} />
              )}
              {/* Inner lip, so the card reads as a pocket with a depth to it */}
              <div
                className="absolute inset-0 rounded-2xl"
                style={{ boxShadow: 'inset -18px 0 36px -18px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(255,255,255,0.04)' }}
              />
            </div>

            {/* The disc. Starts tucked behind the sleeve and slides right. */}
            <div
              className="absolute"
              style={{
                left: '2%',
                zIndex: 1,
                transform: pulled ? 'translateX(46%)' : 'translateX(4%)',
                opacity: pulled ? 1 : 0.85,
                transition: 'transform 1.15s cubic-bezier(0.22,0.9,0.24,1), opacity 0.6s ease',
                filter: 'drop-shadow(0 26px 60px rgba(0,0,0,0.7))',
              }}
            >
              <div style={{ width: 'min(46vh, 430px)', height: 'min(46vh, 430px)' }}>
                <VinylRecord
                  coverUrl={heroArt}
                  isPlaying={isCurrentPlaylist && isPlaying}
                  size={430}
                  shadow={false}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── THE CONTENT ─────────────────────────────────────────────────── */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-8 lg:gap-10 lg:pr-[46%]">

          {/* Big song art, credits underneath */}
          <div className="min-w-0">
            <div
              className="relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden mx-auto lg:mx-0"
              style={{
                background: 'linear-gradient(140deg, rgba(167,139,250,0.16) 0%, rgba(24,16,46,0.95) 100%)',
                border: '1px solid rgba(167,139,250,0.22)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              }}
            >
              {heroArt
                ? <img src={heroArt} alt="" className="w-full h-full object-cover" draggable={false} />
                : <div className="w-full h-full flex items-center justify-center"><Music className="w-14 h-14 text-purple-300/25" /></div>}

              {/* One tap on the art is play/pause. On a tablet the art is the
                  biggest thing on screen, so it should be the easiest control
                  to hit — not a 32px button somewhere else. */}
              <button
                onClick={onTogglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/35 active:bg-black/45 transition group"
              >
                <span className="w-16 h-16 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition">
                  {isCurrentPlaylist && isPlaying
                    ? <Pause className="w-7 h-7 text-white" fill="currentColor" />
                    : <Play className="w-7 h-7 text-white ml-0.5" fill="currentColor" />}
                </span>
              </button>
            </div>

            <div className="mt-5 max-w-[320px] mx-auto lg:mx-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-purple-400 font-bold mb-1.5">
                {isCurrentPlaylist && isPlaying ? 'Now playing' : 'Up first'}
              </p>
              <h2 className="text-2xl font-black text-white leading-tight">{credits.name}</h2>
              {heroArtist && <p className="text-sm text-white/55 mt-1">{heroArtist}</p>}
              {credits.feat && (
                <p className="text-xs text-purple-200/70 mt-1.5">with {credits.feat}</p>
              )}

              <div className="h-px bg-white/[0.08] my-4" />

              <p className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-bold mb-1.5">The vibe</p>
              <p className="text-lg font-bold text-white leading-tight">{playlist?.title}</p>
              <div className="flex items-center flex-wrap gap-2 mt-2">
                {playlist?.mood && (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-200 border border-purple-400/20">
                    {playlist.mood}
                  </span>
                )}
                <span className="text-xs text-white/30">{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
              </div>
              {playlist?.description && (
                <p className="text-sm text-white/40 mt-2.5 leading-relaxed">{playlist.description}</p>
              )}
              {featuredArtists.length > 0 && (
                <p className="text-xs text-white/35 mt-2.5">
                  Featuring <span className="text-white/65">{featuredArtists.join(', ')}</span>
                  {distinctArtistCount > featuredArtists.length && (
                    <span className="text-white/30"> and {distinctArtistCount - featuredArtists.length} more</span>
                  )}
                </p>
              )}

              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <button
                  onClick={onToggleSave}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-full transition ${
                    isSaved
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/[0.1]'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} />
                  {isSaved ? 'Saved' : 'Save this vibe'}
                </button>
                <button
                  onClick={onComments}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-full bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/[0.1] transition"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Comments
                </button>
              </div>
            </div>
          </div>

          {/* Tracklist. The mask is what makes it run under the disc: the
              rows fade out towards the right instead of being cut off, so the
              list dissolves into the grooves. Only applied at lg, where the
              record is actually there to dissolve into. */}
          <div className="min-w-0 lg:[mask-image:linear-gradient(to_right,black_62%,rgba(0,0,0,0.35)_86%,transparent_100%)] lg:[-webkit-mask-image:linear-gradient(to_right,black_62%,rgba(0,0,0,0.35)_86%,transparent_100%)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-bold mb-3">Tracklist</p>

            {loadingTracks ? (
              <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
            ) : tracks.length === 0 ? (
              <p className="text-sm text-white/30 py-12">No tracks in this vibe yet.</p>
            ) : (
              <div className="space-y-1">
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
                      className={`flex items-center gap-3.5 px-3 py-3 rounded-xl cursor-pointer transition ${
                        live ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05] active:bg-white/[0.08]'
                      }`}
                    >
                      <span className={`w-5 text-xs font-mono flex-shrink-0 ${live ? 'text-purple-300' : 'text-white/20'}`}>
                        {live && isPlaying
                          ? <Play className="w-3.5 h-3.5" fill="currentColor" />
                          : String(i + 1).padStart(2, '0')}
                      </span>

                      <div className="w-11 h-11 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                        {t.cover_artwork_url
                          ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" draggable={false} />
                          : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className={`text-[15px] truncate ${live ? 'text-purple-300 font-semibold' : 'text-white'}`}>
                          {c.name}
                        </p>
                        <p className="text-xs text-white/40 truncate">
                          {t.artist?.artist_name}
                          {c.feat && <span className="text-white/25"> · with {c.feat}</span>}
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