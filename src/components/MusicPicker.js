// src/components/MusicPicker.js
//
// Deliberately at src/components/, one level deep, importing
// '../supabaseClient' like every other component here. It started life in
// src/components/admin/ with '../../supabaseClient', and that extra level made
// the file placement-sensitive: dropped anywhere but that exact folder, the
// two-dot import resolves outside src/ and Create React App rejects the whole
// build with "Relative imports outside of src/ are not supported" — which is
// what happened. One level deep cannot escape src/ from anywhere under
// components/.
//
// Type-ahead search over the platform's tracks and albums, for admin screens
// that need to point at one — the Home Hero button being the first.
//
//
// WHY IT RETURNS A PATH RATHER THAN AN ID
//
// The hero stores cta_path, a plain string, and the Home page renders it as a
// link. Handing this component's caller a finished path means nothing else has
// to learn how to turn a track id into a URL, and a hero created today still
// works if the picker changes later.
//
// The two shapes it produces, both real routes in AppRouter:
//
//   /track/<slug>   TrackPage — which already autoplays on load, so a hero
//                   button pointing here starts the song. That is existing
//                   behaviour, not something added for this.
//   /album/<id>     AlbumDetailPage. Add ?play=1 (the "Play on open" switch
//                   below) to start the album rather than just showing it.
//
// Albums are addressed by id because /album/:id is the route; tracks by slug
// because /track/:slug is. Neither is a preference — it is what the router
// matches.
//
//
// ON SEARCHING AS YOU TYPE
//
// Debounced at 250ms and every request is sequence-numbered, because with a
// fast typist the response for "we" can arrive after the response for
// "weekend" and overwrite it. Dropping any response that is not the newest is
// the fix; without it the list flickers back to older results and feels
// broken.

import React from 'react';
import { Search, Music, Disc3, X, Loader, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';

const DEBOUNCE_MS = 250;
const LIMIT = 8;

export default function MusicPicker({ value, onPick, label = 'Find a track or album' }) {
  const [query, setQuery]     = React.useState('');
  const [tracks, setTracks]   = React.useState([]);
  const [albums, setAlbums]   = React.useState([]);
  const [busy, setBusy]       = React.useState(false);
  const [open, setOpen]       = React.useState(false);
  const [error, setError]     = React.useState('');
  const [playOnOpen, setPlayOnOpen] = React.useState(false);

  const seqRef = React.useRef(0);
  const boxRef = React.useRef(null);

  // Click-away. Without this the results sit over the rest of the form and
  // there is no obvious way to dismiss them.
  React.useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setTracks([]); setAlbums([]); setError(''); return; }

    const seq = ++seqRef.current;
    setBusy(true);
    const t = setTimeout(async () => {
      // ilike with both wildcards so "weekend" finds "The Weekend". PostgREST
      // needs commas escaped inside or() — a title containing one would
      // otherwise split the filter — hence the strip.
      const safe = q.replace(/[,()]/g, ' ');

      const [trackRes, albumRes] = await Promise.all([
        supabase
          .from('tracks')
          .select('id, title, slug, cover_artwork_url, artist_id, artists!tracks_artist_id_fkey(artist_name)')
          .ilike('title', `%${safe}%`)
          .eq('is_published', true)
          .limit(LIMIT),
        supabase
          .from('albums')
          .select('id, title, slug, release_type, cover_artwork_url, artist_id, artists!albums_artist_id_fkey(artist_name)')
          .ilike('title', `%${safe}%`)
          .eq('is_published', true)
          .limit(LIMIT),
      ]);

      // A stale response must not overwrite a newer one.
      if (seq !== seqRef.current) return;
      setBusy(false);

      // Errors are read rather than assumed away. An albums embed that fails
      // should not silently look like "no albums match".
      if (trackRes.error) {
        console.error('[MusicPicker] track search failed:', trackRes.error.code, trackRes.error.message, trackRes.error.hint || '');
      }
      if (albumRes.error) {
        console.error('[MusicPicker] album search failed:', albumRes.error.code, albumRes.error.message, albumRes.error.hint || '');
      }
      setError(
        trackRes.error && albumRes.error ? 'Search failed — see the console.'
        : trackRes.error ? 'Track search failed; albums only.'
        : albumRes.error ? 'Album search failed; tracks only.'
        : ''
      );

      setTracks(trackRes.data || []);
      setAlbums(albumRes.data || []);
      setOpen(true);
    }, DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [query]);

  const choose = (kind, row) => {
    const path = kind === 'track'
      ? `/track/${row.slug}`
      : `/album/${row.id}${playOnOpen ? '?play=1' : ''}`;
    onPick(path, {
      kind,
      title: row.title,
      artist: row.artists?.artist_name || null,
      image: row.cover_artwork_url || null,
    });
    setOpen(false);
    setQuery('');
  };

  const hasResults = tracks.length > 0 || albums.length > 0;

  return (
    <div className="space-y-2" ref={boxRef}>
      <div className="relative">
        <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (hasResults) setOpen(true); }}
          placeholder={label}
          className="w-full pl-9 pr-9 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition"
        />
        {busy && <Loader className="w-4 h-4 text-white/30 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
        {!busy && query && (
          <button onClick={() => { setQuery(''); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <label className="flex items-center space-x-2 text-[11px] text-white/40 cursor-pointer select-none">
        <input type="checkbox" checked={playOnOpen} onChange={e => setPlayOnOpen(e.target.checked)}
          className="accent-purple-500" />
        <span>Start playing when opened (albums — a track page already starts on its own)</span>
      </label>

      {error && <p className="text-[11px] text-amber-300">{error}</p>}

      {open && (
        <div className="rounded-lg bg-[#16161c] border border-white/[0.08] overflow-hidden max-h-72 overflow-y-auto">
          {!hasResults && query.trim().length >= 2 && !busy && (
            <p className="text-xs text-white/30 px-3 py-3">Nothing matching “{query.trim()}”.</p>
          )}

          {tracks.length > 0 && (
            <>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-wide px-3 pt-2.5 pb-1">Tracks</p>
              {tracks.map(t => (
                <button key={t.id} onClick={() => choose('track', t)}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-white/[0.06] transition text-left">
                  <div className="w-8 h-8 rounded bg-white/[0.06] overflow-hidden flex-shrink-0">
                    {t.cover_artwork_url
                      ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-3.5 h-3.5 text-white/20" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{t.title}</p>
                    <p className="text-[11px] text-white/35 truncate">{t.artists?.artist_name || 'Unknown artist'}</p>
                  </div>
                  <span className="text-[10px] text-white/25 flex-shrink-0">/track/{t.slug}</span>
                </button>
              ))}
            </>
          )}

          {albums.length > 0 && (
            <>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-wide px-3 pt-2.5 pb-1">Albums</p>
              {albums.map(a => (
                <button key={a.id} onClick={() => choose('album', a)}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 hover:bg-white/[0.06] transition text-left">
                  <div className="w-8 h-8 rounded bg-white/[0.06] overflow-hidden flex-shrink-0">
                    {a.cover_artwork_url
                      ? <img src={a.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Disc3 className="w-3.5 h-3.5 text-white/20" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{a.title}</p>
                    <p className="text-[11px] text-white/35 truncate">
                      {a.artists?.artist_name || 'Unknown artist'} · {(a.release_type || 'album').toUpperCase()}
                    </p>
                  </div>
                  {playOnOpen && <Check className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {value && (
        <p className="text-[11px] text-white/35 break-all">
          Button points at <span className="text-purple-300">{value}</span>
        </p>
      )}
    </div>
  );
}