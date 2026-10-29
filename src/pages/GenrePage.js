// src/pages/GenrePage.js
//
// One genre, at /genres/:slug: its tracks, the artists making it, and a way
// across to the other genres.
//
//
// WHY THIS PAGE EXISTS
//
// Same reason as src/pages/ArtistsIndexPage.js. Google had found 233 of this
// site's URLs and crawled none of them, because nothing on the site linked to
// them: the React shell has no anchors, so the home page discovered nothing.
//
// Genre pages are the second rung. The home page links to fourteen of them,
// each one links to its tracks and its artists, and that is every piece of
// music on the platform reachable in two clicks of plain HTML. It is also the
// page a person actually wants, which is the test: a page built only for a
// crawler is worth nothing to either.
//
//
// WHY THE GENRE IS MATCHED BY SLUGGING, NOT BY LOOKUP
//
// There is no genres table. A genre is a string on a track, so the slug in the
// URL has to be turned back into "R&B" somehow. Rather than keep a mapping
// that would need maintaining every time somebody types a new genre, this
// slugs every genre it finds and compares. The only requirement is that this
// function and the one in netlify/lib/seoCatalogue.js agree with each other,
// and neither has to agree with anything stored.
//
// The ampersand matters: dropped rather than spelled out, "R&B" and "R B"
// would both become "r-b" and two genres would fight over one page.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import { Loader, Disc3 } from 'lucide-react';
import { supabase } from '../supabaseClient';

// Must stay identical to genreSlug in netlify/lib/seoCatalogue.js.
export function genreSlug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const usableSlug = (s) => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(s.trim());

export default function GenrePage() {
  const { slug } = useParams();
  const [state, setState] = React.useState({ loading: true, genre: null, tracks: [], artists: [], others: [] });

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setState(s => ({ ...s, loading: true }));

      const [{ data: trackRows }, { data: artistRows }] = await Promise.all([
        supabase.from('tracks')
          .select('id, slug, title, artist_id, genre, is_beat, created_at')
          .eq('is_published', true)
          .not('slug', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20000),
        supabase.from('artists')
          .select('id, slug, artist_name')
          .not('slug', 'is', null)
          .limit(5000),
      ]);
      if (!alive) return;

      const tracks = (trackRows || []).filter(t => usableSlug(t.slug));
      const artistById = new Map((artistRows || []).map(a => [a.id, a]));

      const names = [...new Set(tracks.map(t => (t.genre || '').trim()).filter(Boolean))];
      const genre = names.find(n => genreSlug(n) === slug) || null;

      const inGenre = genre ? tracks.filter(t => (t.genre || '').trim() === genre) : [];
      const artistIds = new Set(inGenre.map(t => t.artist_id));
      const artists = [...artistIds]
        .map(id => artistById.get(id))
        .filter(a => a && usableSlug(a.slug))
        .sort((a, b) => String(a.artist_name || '').localeCompare(String(b.artist_name || '')));

      const others = names
        .filter(n => n !== genre)
        .map(n => ({ name: n, slug: genreSlug(n), count: tracks.filter(t => (t.genre || '').trim() === n).length }))
        .sort((a, b) => b.count - a.count);

      setState({
        loading: false,
        genre,
        tracks: inGenre.map(t => ({ ...t, artist: artistById.get(t.artist_id) || null })),
        artists,
        others,
      });
    })();
    return () => { alive = false; };
  }, [slug]);

  const { loading, genre, tracks, artists, others } = state;

  if (loading) {
    return <div className="flex justify-center py-24"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>;
  }

  if (!genre) {
    return (
      <div className="min-h-screen px-4 sm:px-6 py-16 max-w-2xl mx-auto text-center">
        <Helmet><title>Genre not found | Feelz Machine</title><meta name="robots" content="noindex" /></Helmet>
        <p className="text-sm text-white/50 mb-5">There is no music filed under that genre.</p>
        <Link to="/browse" className="text-sm text-purple-300 hover:text-purple-200">Browse everything</Link>
      </div>
    );
  }

  const description = `${tracks.length} ${genre} ${tracks.length === 1 ? 'track' : 'tracks'} from `
    + `${artists.length} independent ${artists.length === 1 ? 'artist' : 'artists'} on Feelz Machine.`;

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <Helmet>
        <title>{genre} on Feelz Machine</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`https://www.feelzmachine.com/genres/${genreSlug(genre)}`} />
      </Helmet>

      <div className="flex items-center gap-2.5 mb-1">
        <Disc3 className="w-5 h-5 text-purple-300/70" />
        <h1 className="text-2xl font-bold text-white">{genre}</h1>
      </div>
      <p className="text-sm text-white/40 mb-8">{description}</p>

      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-[0.12em] uppercase text-white/35 mb-3">Tracks</h2>
        <ul className="space-y-1">
          {tracks.map(t => (
            <li key={t.id}>
              <Link to={t.is_beat ? `/beat/${t.slug}` : `/track/${t.slug}`}
                className="block py-1.5 text-sm text-white/80 hover:text-purple-300 transition">
                {t.title || t.slug}
                {t.artist && <span className="text-white/25"> · {t.artist.artist_name || t.artist.slug}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {artists.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-semibold tracking-[0.12em] uppercase text-white/35 mb-3">Artists making {genre}</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
            {artists.map(a => (
              <li key={a.id}>
                <Link to={`/artist/${a.slug}`}
                  className="block py-1 text-sm text-white/80 hover:text-purple-300 transition truncate">
                  {a.artist_name || a.slug}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold tracking-[0.12em] uppercase text-white/35 mb-3">Other genres</h2>
          <div className="flex flex-wrap gap-1.5">
            {others.map(g => (
              <Link key={g.slug} to={`/genres/${g.slug}`}
                className="px-3 py-1.5 rounded-lg bg-white/[0.05] text-xs text-white/60 hover:bg-white/[0.1] hover:text-white transition">
                {g.name} <span className="text-white/25">{g.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
