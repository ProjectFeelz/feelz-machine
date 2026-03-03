import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import TrackCard from '../components/tracks/TrackCard';
import AlbumCard from '../components/albums/AlbumCard';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function Section({ title, onSeeAll, children }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3 px-6">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {onSeeAll && (
          <button onClick={onSeeAll} className="flex items-center text-xs text-white/40 hover:text-white/60 transition">
            See All <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export default function HomePage() {
  const { user, artist } = useAuth();
  const { playTrack } = usePlayer();
  const navigate = useNavigate();
  const [featuredTracks, setFeaturedTracks] = useState([]);
  const [newReleases, setNewReleases] = useState([]);
  const [allTracks, setAllTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const { data: featured } = await supabase
        .from('tracks')
        .select('*, artists(artist_name, slug, profile_image_url)')
        .eq('is_published', true).eq('featured', true)
        .order('created_at', { ascending: false }).limit(10);

      const { data: albums } = await supabase
        .from('albums')
        .select('*, artists(artist_name, slug)')
        .eq('is_published', true)
        .order('release_date', { ascending: false }).limit(10);

      const { data: tracks } = await supabase
        .from('tracks')
        .select('*, artists(artist_name, slug, profile_image_url)')
        .eq('is_published', true)
        .order('created_at', { ascending: false }).limit(20);

      const norm = (list) => (list || []).map(t => ({ ...t, artist_name: t.artists?.artist_name || 'Unknown Artist' }));

      setFeaturedTracks(norm(featured));
      setNewReleases(norm(albums));
      setAllTracks(norm(tracks));
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <div className="pt-12 pb-4">
      <div className="px-6 mb-8 text-center">
        <h1 className="text-2xl font-bold text-white">{user ? greeting() : 'Feelz Machine'}</h1>
        <p className="text-sm text-white/40 mt-1">
          {user ? 'What do you want to listen to?' : 'Discover music from independent artists'}
        </p>
      </div>

      {featuredTracks.length > 0 && (
        <Section title="Featured">
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {featuredTracks.map((track) => (
              <div key={track.id} onClick={() => playTrack(track, featuredTracks)} className="flex-shrink-0 w-40 cursor-pointer group">
                <div className="aspect-square rounded-lg overflow-hidden bg-white/[0.06] mb-2">
                  {track.cover_artwork_url ? (
                    <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
                      <span className="text-2xl text-white/20">&#9835;</span>
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-white truncate">{track.title}</p>
                <p className="text-xs text-white/40 truncate">{track.artist_name}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {newReleases.length > 0 && (
        <Section title="New Releases" onSeeAll={() => navigate('/browse')}>
          <div className="grid grid-cols-2 gap-3 px-6">
            {newReleases.slice(0, 4).map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </Section>
      )}

      {allTracks.length > 0 && (
        <Section title="Latest Tracks" onSeeAll={() => navigate('/browse')}>
          <div className="px-1">
            {allTracks.slice(0, 10).map((track, i) => (
              <TrackCard key={track.id} track={track} trackList={allTracks} index={i} />
            ))}
          </div>
        </Section>
      )}

      {allTracks.length === 0 && featuredTracks.length === 0 && (
        <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-white/[0.04] flex items-center justify-center mb-4">
            <span className="text-3xl">&#9835;</span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No music yet</h3>
          <p className="text-sm text-white/40 max-w-xs">
            Tracks and albums will appear here once published.
            {artist?.is_master && ' Head to your dashboard to upload your first track.'}
          </p>
        </div>
      )}
    </div>
  );
}
