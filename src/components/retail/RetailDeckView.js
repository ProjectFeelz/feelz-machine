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
import { Music, Loader, TrendingUp } from 'lucide-react';
import RetailVibeDeck from './RetailVibeDeck';
import { R } from './retailTheme';

function Stat({ value, label }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-xs" style={{ color: R.textFaint }}>{label}</span>
      <span className="text-lg font-black tabular-nums" style={{ color: R.text }}>{value}</span>
    </div>
  );
}

export default function RetailDeckView({
  playlists,
  savedIds,
  savedPlaylists = [],
  recommended = [],
  impact,
  loadingPlaylists,
  onSave,
  onOpen,
  onPreview,
  onStopPreview,
  isPreviewing,
  previewLabel,
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_290px] gap-8 lg:gap-12">

      {/* ── The deck, and nothing else ──────────────────────────────────── */}
      <div className="flex flex-col justify-center min-h-[72vh] lg:min-h-[80vh]">
        {loadingPlaylists ? (
          <div className="flex justify-center py-20">
            <Loader className="w-5 h-5 animate-spin" style={{ color: R.textFaint }} />
          </div>
        ) : (
          <RetailVibeDeck
            playlists={playlists}
            savedIds={savedIds}
            onSave={onSave}
            onOpen={onOpen}
            onPreview={onPreview}
            onStopPreview={onStopPreview}
            isPreviewing={isPreviewing}
            previewLabel={previewLabel}
          />
        )}
      </div>

      {/* ── The rail ────────────────────────────────────────────────────── */}
      <aside className="lg:pt-10 space-y-8">

        {/* What the room has actually done. Kept, because it is the only place
            a venue sees what their subscription bought — but no longer the
            first thing on the page, because it is not a decision. */}
        {impact && impact.total_plays > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] font-bold mb-2" style={{ color: R.rustBright }}>
              This room
            </p>
            <div style={{ borderTop: `1px solid ${R.border}` }}>
              <Stat value={impact.artists_supported} label={impact.artists_supported === 1 ? 'artist supported' : 'artists supported'} />
              <Stat value={impact.tracks_played} label="tracks played here" />
              <Stat value={impact.hours_played} label="hours of music" />
              <Stat value={impact.plays_this_month} label="plays this month" />
            </div>

            {(impact.top_artist || impact.top_playlist) && (
              <div className="mt-3 pt-3 space-y-1" style={{ borderTop: `1px solid ${R.border}` }}>
                {impact.top_artist && (
                  <p className="text-[11px]" style={{ color: R.textFaint }}>
                    Most played · <span style={{ color: R.textDim }}>{impact.top_artist}</span>
                  </p>
                )}
                {impact.top_playlist && (
                  <p className="text-[11px]" style={{ color: R.textFaint }}>
                    Favourite vibe · <span style={{ color: R.textDim }}>{impact.top_playlist}</span>
                  </p>
                )}
              </div>
            )}

            <p className="text-[10px] mt-3 leading-relaxed" style={{ color: R.textGhost }}>
              Half of what you pay is pooled to the artists whose music plays in your space.
            </p>
          </div>
        )}

        {/* Saved vibes, as a list rather than a row of big cards. A venue with
            nine saved vibes had a horizontal scroller above the fold; here
            they are nine lines you can read at once. */}
        {savedPlaylists.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] font-bold mb-2" style={{ color: R.textFaint }}>
              Your vibes
            </p>
            <div className="space-y-1">
              {savedPlaylists.map(pl => (
                <button
                  key={pl.id}
                  onClick={() => onOpen(pl)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg text-left transition"
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,244,232,0.045)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 flex items-center justify-center"
                    style={{ background: R.surface2, border: `1px solid ${R.border}` }}>
                    {pl.cover_image_url
                      ? <img src={pl.cover_image_url} alt="" className="w-full h-full object-cover" />
                      : <Music className="w-4 h-4" style={{ color: R.textGhost }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate" style={{ color: R.text }}>{pl.title}</p>
                    {pl.mood && <p className="text-[11px] truncate" style={{ color: R.textFaint }}>{pl.mood}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {recommended.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] font-bold mb-2 flex items-center gap-1.5" style={{ color: R.textFaint }}>
              <TrendingUp className="w-3 h-3" />
              Might suit this room
            </p>
            <div className="space-y-1">
              {recommended.map(r => (
                <button
                  key={r.playlist_id}
                  onClick={() => onOpen(playlists.find(p => p.id === r.playlist_id) || { id: r.playlist_id, title: r.title, mood: r.mood })}
                  className="w-full px-3 py-2.5 rounded-lg text-left transition"
                  style={{ background: 'rgba(255,244,232,0.03)', border: `1px solid ${R.border}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = R.rustEdge; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = R.border; }}
                >
                  <p className="text-sm font-semibold truncate" style={{ color: R.text }}>{r.title}</p>
                  {r.mood && <p className="text-[11px] truncate" style={{ color: R.textFaint }}>{r.mood}</p>}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}