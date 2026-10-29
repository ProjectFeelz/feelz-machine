// src/pages/ArtistsIndexPage.js
//
// Every artist on the platform, A to Z, at /artists.
//
//
// WHY THIS PAGE EXISTS
//
// Search Console: 20 pages indexed, 241 not, and 233 of those were
// "Discovered, currently not indexed", meaning Google had the URL and had
// never fetched it. /artist/stevecsa showed a last-crawl date of N/A. In
// ninety days not one artist page had a single impression.
//
// The cause was that nothing linked to them. The home page serves the React
// shell, which has no anchors in it, so a crawler that does not run JavaScript
// saw a site with one page and a sitemap full of claims. netlify/edge-
// functions/seo-html.js now injects a real link list into the home page, and
// those links have to lead somewhere a person would also want to go.
//
// This is that somewhere. It is a directory, which is a page type that existed
// long before anybody optimised anything: 119 names, grouped by letter,
// findable. The crawler benefit is a side effect of it being genuinely useful.
//
//
// WHY THE FILTERS MATCH THE SITEMAP'S
//
// An artist with no published music has a profile page with nothing on it.
// netlify/functions/sitemap.js leaves those out, and so does this, because
// linking to a page the sitemap omits is two contradictory signals about the
// same URL. The same goes for the auto-generated "jane-y9h0qq" names the old
// signup race created.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Loader, Users } from 'lucide-react';
import { supabase } from '../supabaseClient';

// The same shape netlify/lib/seoCatalogue.js rejects, for the same reason: a
// slug with a space or a slash in it is not a route that exists.
const usableSlug = (s) => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(s.trim());
const PLACEHOLDER_NAME = /^[a-z0-9]+-[a-z0-9]{6}$/;

export default function ArtistsIndexPage() {
  const [artists, setArtists] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: rows }, { data: trackRows }] = await Promise.all([
        supabase.from('artists')
          .select('id, slug, artist_name, genre')
          .not('slug', 'is', null)
          .limit(5000),
        // Only to learn who has something published. The count is small enough
        // that asking for the ids is cheaper than a join or an aggregate.
        supabase.from('tracks')
          .select('artist_id')
          .eq('is_published', true)
          .not('slug', 'is', null)
          .limit(20000),
      ]);
      if (!alive) return;

      const hasMusic = new Set((trackRows || []).map(t => t.artist_id).filter(Boolean));
      const live = (rows || [])
        .filter(a => usableSlug(a.slug))
        .filter(a => hasMusic.has(a.id))
        .filter(a => !(a.artist_name && PLACEHOLDER_NAME.test(a.artist_name)))
        .sort((a, b) => String(a.artist_name || '').localeCompare(String(b.artist_name || '')));

      setArtists(live);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const groups = React.useMemo(() => {
    const m = new Map();
    artists.forEach(a => {
      const first = String(a.artist_name || a.slug).trim().charAt(0).toUpperCase();
      const key = /[A-Z]/.test(first) ? first : '#';
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(a);
    });
    return [...m.entries()]
      .sort(([x], [y]) => (x === '#' ? 1 : y === '#' ? -1 : x.localeCompare(y)));
  }, [artists]);

  const description = artists.length
    ? `Every artist releasing music on Feelz Machine, ${artists.length} of them, listed A to Z.`
    : 'Every artist releasing music on Feelz Machine, listed A to Z.';

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <Helmet>
        <title>Artists on Feelz Machine</title>
        <meta name="description" content={description} />
        <link rel="canonical" href="https://www.feelzmachine.com/artists" />
      </Helmet>

      <div className="flex items-center gap-2.5 mb-1">
        <Users className="w-5 h-5 text-purple-300/70" />
        <h1 className="text-2xl font-bold text-white">Artists</h1>
      </div>
      <p className="text-sm text-white/40 mb-8">{description}</p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>
      ) : artists.length === 0 ? (
        <p className="text-sm text-white/40">No artists have published music yet.</p>
      ) : (
        <>
          {/* The letter jump bar. 119 names is past the point where scrolling
              to find a name is reasonable. */}
          <div className="flex flex-wrap gap-1.5 mb-8">
            {groups.map(([letter]) => (
              <a key={letter} href={`#letter-${letter}`}
                className="px-2.5 py-1 rounded-lg bg-white/[0.05] text-xs font-semibold text-white/50 hover:bg-white/[0.1] hover:text-white transition">
                {letter}
              </a>
            ))}
          </div>

          <div className="space-y-8">
            {groups.map(([letter, list]) => (
              <section key={letter} id={`letter-${letter}`}>
                <h2 className="text-xs font-semibold tracking-[0.12em] uppercase text-white/35 mb-3">{letter}</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
                  {list.map(a => (
                    <li key={a.id}>
                      <Link to={`/artist/${a.slug}`}
                        className="block py-1 text-sm text-white/80 hover:text-purple-300 transition truncate">
                        {a.artist_name || a.slug}
                        {a.genre && <span className="text-white/25"> · {a.genre}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
