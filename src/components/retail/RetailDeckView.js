// src/components/retail/RetailDeckView.js
//
// The jukebox screen, rearranged.
//
// What was wrong: the page opened with a full-width stats banner, then a row
// of saved vibes, then a row of recommendations, and only then the thing you
// came to use. Three blocks of chrome above the one interactive element, so
// the card you are meant to swipe started below the fold on a laptop and the
// eye had nowhere obvious to land.
//
// Now the deck owns the first screen and nothing competes with it. Everything
// else — what this room has played, what it has kept, what it might like —
// moves to a quiet rail on the right, at a size that says "look at this after
// you have decided", because that is when a venue actually reads it.
//
// The rail sits below the deck on a phone rather than beside it, for the same
// reason: the decision first, the context second.

import React from 'react';
import { Music, Loader, TrendingUp, ChevronDown } from 'lucide-react';
import RetailVibeDeck from './RetailVibeDeck';
import { R } from './retailTheme';

const HEADER = 76;   // matches the page's sticky header

function Stat({ value, label }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-sm" style={{ color: R.textFaint }}>{label}</span>
      <span className="text-xl font-black tabular-nums" style={{ color: R.text }}>{value}</span>
    </div>
  );
}

export default function RetailDeckView({
  playlists,          // the UNDECIDED ones — the page filters out saved and passed
  allPlaylists = [],  // everything, for the counts in the rail
  savedIds,
  savedPlaylists = [],
  recommended = [],
  impact,
  loadingPlaylists,
  onSave,
  onPass,
  onReset,
  onOpen,
  onPreview,
  onStopPreview,
  isPreviewing,
  previewLabel,
}) {
  // Folded away on a phone, always open on a desktop rail (CSS decides which).
  const [statsOpen, setStatsOpen] = React.useState(false);

  return (
    <div className="fm-retail-deckpage flex flex-col lg:flex-row">

      <style>{`
        /* The page does not scroll. dvh rather than vh so a phone's address
           bar is subtracted and nothing is cut off at the bottom. The only
           thing that scrolls on this screen is the saved-vibes list in the
           rail, once the collection outgrows it — and its bar is hidden by
           the global rule in index.css. */
        .fm-retail-deckpage {
          height: calc(100vh - ${HEADER}px);
          height: calc(100dvh - ${HEADER}px);
          overflow: hidden;
        }
        @media (min-width: 1024px) {
          .fm-retail-rail { height: 100%; }
        }
      `}</style>

      {/* ── The deck, centred, and nothing else ───────────────────────────
          On a phone it takes a FIXED share of the frame rather than flex-1.
          Sharing the frame with a rail that could grow meant the rail won and
          the deck was squeezed — the cut-off card at the top of the phone
          screenshots. 64% here — the deck measures this box and fits itself
          to it, so this number decides how the screen is split and nothing
          else has to agree with it. The rail scrolls in what is left. */}
      <div className="h-[64%] lg:h-auto flex-shrink-0 lg:flex-1 min-w-0 min-h-0 flex flex-col items-center justify-center px-5 py-4">
        {loadingPlaylists ? (
          <div className="flex justify-center py-20">
            <Loader className="w-5 h-5 animate-spin" style={{ color: R.textFaint }} />
          </div>
        ) : (
          <RetailVibeDeck
            playlists={playlists}
            savedIds={savedIds}
            onSave={onSave}
            onPass={onPass}
            onReset={onReset}
            onOpen={onOpen}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPreviewing={isPreviewing}
            previewLabel={previewLabel}
          />
        )}
      </div>

      {/* ── The rail ─────────────────────────────────────────────────────
          Same width, surface and edge as the record page's left panel, so
          moving between the two screens does not feel like moving between two
          products. Pinned and scrollable in its own right. */}
      <aside
        className="fm-retail-rail w-full lg:w-[360px] flex-1 lg:flex-none lg:flex-shrink-0
                   flex flex-col min-h-0 px-5 py-5 overflow-y-auto lg:overflow-visible"
        style={{
          background: R.bgPanel,
          borderLeft: `1px solid ${R.border}`,
          boxShadow: '-18px 0 40px -28px rgba(0,0,0,0.9)',
        }}
      >

        {/* What the room has actually done. Kept, because it is the only place
            a venue sees what their subscription bought — but no longer the
            first thing on the page, because it is not a decision.
            ON A PHONE IT IS FOLDED AWAY. Four stat rows, two "most played"
            lines and a paragraph about the artist pool is most of a phone
            screen spent on something nobody taps, and in the screenshots it
            was the block colliding with the card. One line, tap to open. */}
        {impact && impact.total_plays > 0 && (
          <div className="flex-shrink-0">
            <button
              onClick={() => setStatsOpen(o => !o)}
              className="lg:hidden w-full flex items-center justify-between gap-3 py-1.5 text-left"
              aria-expanded={statsOpen}
            >
              <span className="text-[11px] uppercase tracking-[0.24em] font-bold" style={{ color: R.violetLift }}>
                This room
              </span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: R.textFaint }}>
                {impact.tracks_played} played · {impact.artists_supported} artists
                <ChevronDown
                  className="w-3.5 h-3.5 transition-transform"
                  style={{ transform: statsOpen ? 'rotate(180deg)' : 'none' }}
                />
              </span>
            </button>

            <p className="hidden lg:block text-[11px] uppercase tracking-[0.24em] font-bold mb-2.5" style={{ color: R.violetLift }}>
              This room
            </p>

            <div className={statsOpen ? 'block' : 'hidden lg:block'}>
            <div style={{ borderTop: `1px solid ${R.border}` }}>
              <Stat value={impact.artists_supported} label={impact.artists_supported === 1 ? 'artist supported' : 'artists supported'} />
              <Stat value={impact.tracks_played} label="tracks played here" />
              <Stat value={impact.hours_played} label="hours of music" />
              <Stat value={impact.plays_this_month} label="plays this month" />
            </div>

            {(impact.top_artist || impact.top_playlist) && (
              <div className="mt-3 pt-3 space-y-1" style={{ borderTop: `1px solid ${R.border}` }}>
                {impact.top_artist && (
                  <p className="text-xs" style={{ color: R.textFaint }}>
                    Most played · <span style={{ color: R.textDim }}>{impact.top_artist}</span>
                  </p>
                )}
                {impact.top_playlist && (
                  <p className="text-xs" style={{ color: R.textFaint }}>
                    Favourite vibe · <span style={{ color: R.textDim }}>{impact.top_playlist}</span>
                  </p>
                )}
              </div>
            )}

            <p className="text-[11px] mt-3 leading-relaxed" style={{ color: R.textGhost }}>
              Half of what you pay is pooled to the artists whose music plays in your space.
            </p>
            </div>
          </div>
        )}

        {/* Saved vibes, as a list rather than a row of big cards. A venue with
            nine saved vibes had a horizontal scroller above the fold; here
            they are nine lines you can read at once. */}
        {savedPlaylists.length > 0 && (
          <div className="flex flex-col min-h-0 lg:flex-1 mt-6 lg:mt-7">
            <p className="text-[11px] uppercase tracking-[0.24em] font-bold mb-2.5 flex-shrink-0" style={{ color: R.textFaint }}>
              Your vibes
            </p>
            {/* The saved collection is the only scrolling element on this
                screen. It grows as a venue keeps vibes, and rather than
                pushing the page taller it scrolls inside the rail. */}
            <div className="space-y-1 lg:overflow-y-auto min-h-0 lg:flex-1 -mr-2 pr-2">
              {savedPlaylists.map(pl => (
                <button
                  key={pl.id}
                  onClick={() => onOpen(pl)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg text-left transition"
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.045)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: R.surface2, border: `1px solid ${R.border}` }}>
                    {pl.cover_image_url
                      ? <img src={pl.cover_image_url} alt="" className="w-full h-full object-cover" />
                      : <Music className="w-4 h-4" style={{ color: R.textGhost }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] truncate" style={{ color: R.text }}>{pl.title}</p>
                    {pl.mood && <p className="text-xs truncate" style={{ color: R.textFaint }}>{pl.mood}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {recommended.length > 0 && (
          <div className="flex-shrink-0 mt-7">
            <p className="text-[11px] uppercase tracking-[0.24em] font-bold mb-2.5 flex items-center gap-1.5" style={{ color: R.textFaint }}>
              <TrendingUp className="w-3 h-3" />
              Might suit this room
            </p>
            <div className="space-y-1">
              {recommended.map(r => (
                <button
                  key={r.playlist_id}
                  onClick={() => onOpen((allPlaylists.length ? allPlaylists : playlists).find(p => p.id === r.playlist_id) || { id: r.playlist_id, title: r.title, mood: r.mood })}
                  className="w-full px-3 py-2.5 rounded-lg text-left transition"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${R.border}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = R.violetEdge; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = R.border; }}
                >
                  <p className="text-[15px] font-semibold truncate" style={{ color: R.text }}>{r.title}</p>
                  {r.mood && <p className="text-xs truncate" style={{ color: R.textFaint }}>{r.mood}</p>}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}