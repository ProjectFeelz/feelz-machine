// src/pages/AdminColdStart.js
// The curated opening for a brand new listener's For You feed.
//
// compute-recommendations only scores listeners who already exist in
// `listeners` with a recent last_seen_at, and it runs twice a day, so a
// first session never has recommendation rows. Without this list it falls
// through to a live query over `tracks`, half newest and half top scoring,
// with no editorial input at all.
//
// Follows AdminHomeHero for layout and admin gating. Differs in shape
// deliberately: the hero is one live item at a time, this is an ordered
// list, because a cold start feed needs several tracks in a chosen order.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Loader, Trash2, Search, Music, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const inputCls = "w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition";

export default function AdminColdStart() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();

  const [picks, setPicks] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from('cold_start_picks')
      .select('id, position, note, is_active, track_id, tracks(id, title, cover_artwork_url, genre, mood, artists(artist_name))')
      .order('position');
    setPicks(data || []);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (!isAdmin) navigate('/hub');
  }, [isAdmin, navigate]);

  // The embed is aliased as artist:artists(...) to match the searches that
  // already work elsewhere (PlaylistDetailPage, RetailPlayerPage) rather
  // than relying on the bare relationship name.
  //
  // The error is checked and shown. The first version of this swallowed it
  // with `const { data } = await ...`, so a failing query and a query with
  // no matches looked identical: an empty page.
  // Live search, debounced. The first version only fired on a button press
  // and only matched the title, which meant you had to already know the exact
  // song you wanted. That is impossible in a catalogue of any size, which is
  // the whole situation this page exists for.
  //
  // Two queries rather than one: PostgREST cannot OR across a base column and
  // an embedded one in a single filter, so title matches and artist matches
  // are fetched separately and merged. Artist matching is what lets you type
  // a name and see everything they have.
  const runSearch = React.useCallback(async (raw) => {
    const q = raw.trim();
    if (q.length < 2) { setResults([]); setSearched(false); return; }
    setSearching(true);

    const cols = 'id, title, cover_artwork_url, genre, mood, artist:artists(id, artist_name)';

    const [byTitle, byArtist] = await Promise.all([
      supabase.from('tracks').select(cols)
        .eq('is_published', true).ilike('title', `%${q}%`).limit(25),
      supabase.from('tracks').select('id, title, cover_artwork_url, genre, mood, artist:artists!inner(id, artist_name)')
        .eq('is_published', true).ilike('artists.artist_name', `%${q}%`).limit(25),
    ]);

    setSearching(false);
    setSearched(true);

    if (byTitle.error && byArtist.error) {
      setResults([]);
      showToast('Search failed: ' + byTitle.error.message);
      return;
    }

    const merged = [];
    const seen = new Set();
    [...(byTitle.data || []), ...(byArtist.data || [])].forEach(t => {
      if (seen.has(t.id)) return;
      seen.add(t.id);
      merged.push(t);
    });
    setResults(merged);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => { runSearch(query); }, 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const add = async (track) => {
    const nextPos = picks.length > 0 ? Math.max(...picks.map(p => p.position)) + 1 : 0;
    const { error } = await supabase.from('cold_start_picks').insert({
      track_id: track.id,
      position: nextPos,
      created_by: user?.id || null,
    });
    if (error) {
      showToast(error.code === '23505' ? 'That track is already in the list' : 'Error: ' + error.message);
      return;
    }
    setQuery('');
    setResults([]);
    setSearched(false);
    showToast('Added to the cold start feed');
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this pick?')) return;
    await supabase.from('cold_start_picks').delete().eq('id', id);
    load();
  };

  const toggleActive = async (pick) => {
    await supabase.from('cold_start_picks').update({ is_active: !pick.is_active }).eq('id', pick.id);
    load();
  };

  // Swaps the position values of two neighbours rather than renumbering the
  // whole list, so a reorder is two writes regardless of list length.
  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= picks.length) return;
    const a = picks[index];
    const b = picks[target];
    await Promise.all([
      supabase.from('cold_start_picks').update({ position: b.position }).eq('id', a.id),
      supabase.from('cold_start_picks').update({ position: a.position }).eq('id', b.id),
    ]);
    load();
  };

  if (!isAdmin) return null;

  const activeCount = picks.filter(p => p.is_active).length;

  return (
    <div className="pt-4 pb-32 px-4 md:px-8">
      <Helmet><title>Cold Start Picks</title><meta name="robots" content="noindex, nofollow" /></Helmet>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/hub')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Cold Start Picks</h1>
          <p className="text-xs text-white/30">
            What a brand new listener sees first, before the algorithm knows anything about them.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mb-8">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-3">Add a track</p>
        <div className="relative">
          <Search className="w-4 h-4 text-white/25 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className={`${inputCls} pl-9`}
            placeholder="Start typing a song or artist name"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {searching && (
            <Loader className="w-4 h-4 text-white/30 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
          )}
        </div>

        {searched && !searching && results.length === 0 && (
          <p className="text-sm text-white/30 mt-4">
            Nothing published matches "{query.trim()}", by title or artist.
          </p>
        )}

        {results.length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {results.map(t => (
              <button key={t.id} onClick={() => add(t)}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] transition text-left">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                  {t.cover_artwork_url
                    ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{t.title}</p>
                  <p className="text-xs text-white/40 truncate">
                    {t.artist?.artist_name}
                    {t.genre ? ` · ${t.genre}` : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide">
          The list, in order
        </p>
        <p className="text-xs text-white/30">
          {activeCount} live{picks.length !== activeCount ? `, ${picks.length - activeCount} hidden` : ''}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
      ) : picks.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-white/40">No picks yet.</p>
          <p className="text-xs text-white/25 mt-1">
            Until you add some, a new listener's first feed is whatever is newest and most streamed.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {picks.map((p, i) => (
            <div key={p.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                p.is_active
                  ? 'bg-white/[0.03] border-white/[0.07]'
                  : 'bg-white/[0.01] border-white/[0.04] opacity-50'
              }`}>
              <span className="text-xs text-white/25 font-mono w-6 flex-shrink-0">{i + 1}</span>
              <div className="w-11 h-11 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                {p.tracks?.cover_artwork_url
                  ? <img src={p.tracks.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{p.tracks?.title || 'Track removed'}</p>
                <p className="text-xs text-white/40 truncate">
                  {p.tracks?.artists?.artist_name}
                  {p.tracks?.genre ? ` · ${p.tracks.genre}` : ''}
                  {p.tracks?.mood ? ` · ${p.tracks.mood}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => move(i, -1)} disabled={i === 0}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.12] transition disabled:opacity-20">
                  <ArrowUp className="w-3.5 h-3.5 text-white/60" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === picks.length - 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.12] transition disabled:opacity-20">
                  <ArrowDown className="w-3.5 h-3.5 text-white/60" />
                </button>
                <button onClick={() => toggleActive(p)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.12] transition">
                  {p.is_active
                    ? <Eye className="w-3.5 h-3.5 text-white/60" />
                    : <EyeOff className="w-3.5 h-3.5 text-white/30" />}
                </button>
                <button onClick={() => remove(p.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-red-500/20 transition">
                  <Trash2 className="w-3.5 h-3.5 text-white/40" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}