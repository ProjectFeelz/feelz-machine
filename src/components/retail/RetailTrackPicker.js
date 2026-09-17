// src/components/retail/RetailTrackPicker.js
//
// The track picker for retail playlist building.
//
// What it replaces: a search box that showed nothing until you typed two
// characters, searched every published track on the platform, and gave you a
// row of text with no way to hear it. You had to already know the name of the
// song you wanted, and you had to trust that it belonged in a venue.
//
// What it does instead:
//   * opens showing the retail catalogue, so there is something to browse
//     before you type anything;
//   * every row is playable through the normal player, so a playlist can be
//     built by ear rather than by memory;
//   * the plus is a separate control from the play button, so hearing a track
//     and adding a track are two different decisions.
//
// It reads retail_catalog, NOT tracks. That is deliberate: the catalogue is
// the set of music cleared for venues, and a playlist that can reach outside
// it makes the clearing step decorative. Tracks get into the catalogue by
// being approved in the Pitches tab.

import React from 'react';
import { Search, Music, Plus, Check, Play, Pause, Loader } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { usePlayer } from '../../contexts/PlayerContext';

const inputCls =
  'w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition';

export default function RetailTrackPicker({ existingTrackIds = [], onAdd, showToast }) {
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');
  const [adding, setAdding] = React.useState(null);

  const already = React.useMemo(() => new Set(existingTrackIds), [existingTrackIds]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // file_url matters: playTrack refuses a track without one, so leaving it
      // out would give a picker whose play buttons silently did nothing.
      const { data, error } = await supabase
        .from('retail_catalog')
        .select(`
          id,
          added_at,
          track:tracks (
            id, title, file_url, cover_artwork_url, duration,
            is_published, is_explicit, release_date,
            artist:artists ( id, artist_name )
          )
        `)
        .eq('is_active', true)
        .order('added_at', { ascending: false });

      if (cancelled) return;
      setLoading(false);

      if (error) {
        console.error('[retail-picker] catalogue read failed:', error.code, error.message);
        showToast?.('Could not load the catalogue: ' + error.message);
        return;
      }
      // A catalogue row whose track was deleted comes back with track: null.
      setRows((data || []).filter(r => r.track));
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.track.title || '').toLowerCase().includes(q) ||
      (r.track.artist?.artist_name || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const playableList = React.useMemo(() => filtered.map(r => r.track), [filtered]);

  const handlePlay = (track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    // Passing the filtered list as the queue means pressing play on a row
    // keeps going through what you are currently looking at, which is how you
    // audition a run of tracks for a playlist.
    playTrack(track, playableList);
  };

  const handleAdd = async (track) => {
    if (already.has(track.id) || adding) return;
    setAdding(track.id);
    try {
      await onAdd(track);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mb-6">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Retail catalogue</p>
        <p className="text-[11px] text-white/25">
          {loading ? 'loading…' : `${filtered.length} of ${rows.length} cleared tracks`}
        </p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-white/25 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          className={`${inputCls} pl-9`}
          placeholder="Narrow it down by song or artist"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader className="w-5 h-5 text-white/30 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/30 py-8 text-center">
          Nothing is cleared for retail yet. Approve a submission in the Pitches tab
          and it will appear here.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-white/30 py-8 text-center">
          Nothing in the catalogue matches “{query.trim()}”.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[28rem] overflow-y-auto pr-1">
          {filtered.map(row => {
            const t = row.track;
            const isAdded   = already.has(t.id);
            const isCurrent = currentTrack?.id === t.id;
            const isBusy    = adding === t.id;

            return (
              <div
                key={row.id}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition ${
                  isCurrent
                    ? 'bg-purple-500/10 border-purple-500/30'
                    : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
                }`}
              >
                {/* Artwork doubles as the play control. Nested buttons are
                    invalid HTML, so this row is a div and each control is its
                    own button. */}
                <button
                  onClick={() => handlePlay(t)}
                  className="relative w-11 h-11 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0 group"
                  title={isCurrent && isPlaying ? 'Pause' : 'Play'}
                >
                  {t.cover_artwork_url ? (
                    <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-4 h-4 text-white/20" />
                    </div>
                  )}
                  <div
                    className={`absolute inset-0 flex items-center justify-center bg-black/55 transition ${
                      isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isCurrent && isPlaying
                      ? <Pause className="w-4 h-4 text-white" />
                      : <Play className="w-4 h-4 text-white" />}
                  </div>
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm truncate ${isCurrent ? 'text-purple-300' : 'text-white'}`}>
                    {t.title}
                  </p>
                  <p className="text-xs text-white/40 truncate">
                    {t.artist?.artist_name || 'Unknown artist'}
                  </p>
                </div>

                <button
                  onClick={() => handleAdd(t)}
                  disabled={isAdded || isBusy}
                  title={isAdded ? 'Already in this playlist' : 'Add to this playlist'}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition ${
                    isAdded
                      ? 'bg-emerald-500/15 cursor-default'
                      : 'bg-white/[0.06] hover:bg-purple-500 disabled:opacity-40'
                  }`}
                >
                  {isBusy
                    ? <Loader className="w-4 h-4 text-white/60 animate-spin" />
                    : isAdded
                      ? <Check className="w-4 h-4 text-emerald-400" />
                      : <Plus className="w-4 h-4 text-white/60" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}