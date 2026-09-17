// src/pages/ArtistCollectionPage.js
//
// The full list behind "See all albums" and "See all singles" on an artist
// profile.
//
// The profile shows six of each in a side-by-side grid. Without this page
// those links would 404, and a dead link is worse than no link.
//
// One component for both, chosen by the `kind` prop, because the two lists
// differ only in what they query and where a card goes. Two near-identical
// files is how ProfilePage and ProfileSetup ended up 395 lines apart.

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Music, Loader } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { usePlayer } from '../contexts/PlayerContext';

export default function ArtistCollectionPage({ kind = 'albums' }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { playTrack } = usePlayer();

  const [artist, setArtist] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  const isAlbums = kind === 'albums';

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: a } = await supabase
        .from('artists')
        .select('id, artist_name, slug, profile_image_url')
        .eq('slug', slug)
        .maybeSingle();

      if (cancelled) return;
      if (!a) { setNotFound(true); setLoading(false); return; }
      setArtist(a);

      if (isAlbums) {
        const { data } = await supabase
          .from('albums')
          .select('id, title, slug, cover_artwork_url, release_type, release_date')
          .eq('artist_id', a.id)
          .eq('is_published', true)
          .order('release_date', { ascending: false, nullsFirst: false });
        if (!cancelled) setItems(data || []);
      } else {
        // Singles are published tracks with no album. Same definition the
        // profile uses, so the count on the profile and the count here agree.
        const { data } = await supabase
          .from('tracks')
          .select('id, title, slug, cover_artwork_url, file_url, duration, stream_count, artist_id')
          .eq('artist_id', a.id)
          .eq('is_published', true)
          .is('album_id', null)
          .order('created_at', { ascending: false });
        if (!cancelled) setItems(data || []);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [slug, isAlbums]);

  if (loading) {
    return <div className="flex justify-center py-24"><Loader className="w-6 h-6 text-white/30 animate-spin" /></div>;
  }

  if (notFound) {
    return (
      <div className="px-6 py-24 text-center">
        <p className="text-white/50">That artist does not exist.</p>
      </div>
    );
  }

  const heading = isAlbums ? 'Albums' : 'Singles';

  return (
    <div className="pt-4 pb-32 px-4 md:px-8">
      <Helmet>
        <title>{`${heading} by ${artist.artist_name}`}</title>
        <meta name="description" content={`Every ${isAlbums ? 'album' : 'single'} released by ${artist.artist_name} on Feelz Machine.`} />
      </Helmet>

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(`/artist/${slug}`))}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{heading}</h1>
          <button onClick={() => navigate(`/artist/${slug}`)}
            className="text-xs text-white/40 hover:text-white/70 transition truncate">
            {artist.artist_name}
          </button>
        </div>
        <span className="ml-auto text-xs text-white/30 flex-shrink-0">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-white/30 py-16 text-center">
          No {isAlbums ? 'albums' : 'singles'} yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map(item => (
            <div key={item.id} className="cursor-pointer group"
              /* Same two-segment bug as the profile's album grid: /album/:id
                 takes one segment, so this landed on the catch-all and bounced
                 the visitor to For You. */
              onClick={() => isAlbums
                ? navigate(`/album/${item.slug || item.id}`)
                : playTrack({ ...item, artist_name: artist.artist_name, artist_slug: artist.slug }, items)}>
              <div className="aspect-square rounded-xl overflow-hidden mb-2 bg-white/[0.05]">
                {item.cover_artwork_url
                  ? <img src={item.cover_artwork_url} alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-8 h-8 text-white/15" />
                    </div>}
              </div>
              <p className="text-sm font-medium text-white truncate">{item.title}</p>
              <p className="text-xs text-white/40 truncate">
                {isAlbums
                  ? `${item.release_type?.toUpperCase() || 'ALBUM'}${item.release_date ? ` · ${new Date(item.release_date).getFullYear()}` : ''}`
                  : `${item.stream_count || 0} plays`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}