import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import TrackCard from '../components/tracks/TrackCard';
import { ChevronRight, Flame, Play, Pause, Music, Verified } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function Section({ title, icon: Icon, onSeeAll, children }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3 px-6">
        <div className="flex items-center space-x-2">
          {Icon && <Icon className="w-4 h-4 text-white/40" />}
          <h2 className="text-base font-bold text-white">{title}</h2>
        </div>
        {onSeeAll && (
          <button onClick={onSeeAll} className="flex items-center text-xs text-white/30 hover:text-white/50 transition">
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
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const navigate = useNavigate();
  const [featuredTracks, setFeaturedTracks] = useState([]);
  const [newReleases, setNewReleases] = useState([]);
  const [trending, setTrending] = useState([]);
  const [topArtists, setTopArtists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [
        { data: featured },
        { data: albums },
        { data: trendingRaw },
        { data: artists },
      ] = await Promise.all([
        supabase.from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url, tier)')
          .eq('is_published', true).eq('featured', true)
          .order('created_at', { ascending: false }).limit(10),
        supabase.from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .order('created_at', { ascending: false }).limit(8),
        supabase.from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url, is_verified, tier)')
          .eq('is_published', true)
          .order('engagement_score', { ascending: false }).limit(20),
        supabase.from('artists')
          .select('id, artist_name, slug, profile_image_url, is_verified, follower_count, total_streams, tier')
          .order('follower_count', { ascending: false }).limit(10),
      ]);

      const norm = (list) => (list || []).map(t => ({
        ...t, artist_name: t.artists?.artist_name || 'Unknown Artist',
      }));

      const trendingBoosted = (trendingRaw || [])
        .map(t => ({
          ...t,
          artist_name: t.artists?.artist_name || 'Unknown Artist',
          _boosted: (t.engagement_score || 0) * (
            t.artists?.tier === 'premium' ? 1.5 : t.artists?.tier === 'pro' ? 1.2 : 1
          ),
        }))
        .sort((a, b) => b._boosted - a._boosted)
        .slice(0, 5);

      setFeaturedTracks(norm(featured));
      setNewReleases(norm(albums));
      setTrending(trendingBoosted);
      setTopArtists(artists || []);
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = (track, list) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(track, list || [track]);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pt-12 md:pt-0 pb-4 px-6 md:px-0">
      {/* Greeting */}
      <div className="px-6 mb-8">
        <h1 className="text-2xl font-bold text-white">
          {user ? greeting() : 'Feelz Machine'}
        </h1>
        <p className="text-sm text-white/40 mt-1">
          {user
            ? `Welcome back${artist ? ', ' + artist.artist_name : ''}`
            : 'Discover music from independent artists'}
        </p>
      </div>

      {/* Featured — first */}
      {featuredTracks.length > 0 && (
        <Section title="Featured">
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {featuredTracks.map((track) => (
              <div key={track.id}
                onClick={() => handlePlay(track, featuredTracks)}
                className="flex-shrink-0 w-40 md:w-52 cursor-pointer group">
                <div className="aspect-square rounded-xl overflow-hidden bg-white/[0.06] mb-2 relative">
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
                        <Music className="w-8 h-8 text-white/20" />
                      </div>
                  }
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                      {currentTrack?.id === track.id && isPlaying
                        ? <Pause className="w-5 h-5 text-white" />
                        : <Play className="w-5 h-5 text-white" />
                      }
                    </div>
                  </div>
                </div>
                <p className="text-sm font-medium text-white truncate">{track.title}</p>
                <p className="text-sm text-white/40 truncate">{track.artist_name}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* New Releases — second */}
      {newReleases.length > 0 && (
        <Section title="New Releases" onSeeAll={() => navigate('/browse')}>
          <div className="px-1">
            {newReleases.slice(0, 6).map((track, i) => (
              <TrackCard key={track.id} track={track} trackList={newReleases} index={i} />
            ))}
          </div>
        </Section>
      )}

      {/* Trending — third */}
      {trending.length > 0 && (
        <Section title="Trending" icon={Flame} onSeeAll={() => navigate('/browse')}>
          <div className="px-1">
            {trending.map((track, i) => (
              <TrackCard key={track.id} track={track} trackList={trending} index={i} />
            ))}
          </div>
        </Section>
      )}

      {/* Artists to Follow */}
      {topArtists.length > 0 && (
        <Section title="Artists to Follow" onSeeAll={() => navigate('/browse?tab=artists')}>
          <div className="flex space-x-4 overflow-x-auto px-6 scrollbar-hide">
            {topArtists.map(a => (
              <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
                className="flex-shrink-0 text-center group">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-white/[0.06] mb-2 mx-auto">
                  {a.profile_image_url
                    ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-blue-600/20">
                        <span className="text-lg font-bold text-white/40">{a.artist_name?.[0]}</span>
                      </div>
                  }
                </div>
                <div className="flex items-center justify-center space-x-1">
                  <p className="text-xs font-medium text-white truncate max-w-[64px]">{a.artist_name}</p>
                  {a.is_verified && <Verified className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                </div>
                <p className="text-[10px] text-white/30 mt-0.5">{formatNumber(a.follower_count)} followers</p>
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}