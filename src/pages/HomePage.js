import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import TrackCard from '../components/tracks/TrackCard';
import AlbumCard from '../components/albums/AlbumCard';
import { ChevronRight, Flame, Play, Pause, Music, Verified, TrendingUp } from 'lucide-react';
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

function QuickPlayRow({ track, onPlay, currentTrack, isPlaying }) {
  const isActive = currentTrack?.id === track.id;
  return (
    <button
      onClick={() => onPlay(track)}
      className="flex items-center space-x-3 px-6 py-2.5 w-full hover:bg-white/[0.04] transition active:scale-[0.99] group">
      <div className="relative w-10 h-10 flex-shrink-0">
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/[0.06]">
          {track.cover_artwork_url
            ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>
          }
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition">
          {isActive && isPlaying
            ? <Pause className="w-4 h-4 text-white" />
            : <Play className="w-4 h-4 text-white" />
          }
        </div>
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-green-400' : 'text-white'}`}>{track.title}</p>
        <p className="text-sm text-white/30 truncate">{track.artist_name}</p>
      </div>
      <p className="text-sm text-white/20 flex-shrink-0">{formatNumber(track.stream_count || 0)}</p>
    </button>
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
  const [allTracks, setAllTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [
        { data: featured },
        { data: albums },
        { data: trendingRaw },
        { data: artists },
        { data: tracks },
      ] = await Promise.all([
        supabase.from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url, tier)')
          .eq('is_published', true).eq('featured', true)
          .order('created_at', { ascending: false }).limit(10),

        supabase.from('albums')
          .select('*, artists(artist_name, slug)')
          .eq('is_published', true)
          .order('release_date', { ascending: false }).limit(6),

        supabase.from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url, is_verified, tier)')
          .eq('is_published', true)
          .order('engagement_score', { ascending: false }).limit(20),

        supabase.from('artists')
          .select('id, artist_name, slug, profile_image_url, is_verified, follower_count, total_streams, tier')
          .order('follower_count', { ascending: false }).limit(10),

        supabase.from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .order('created_at', { ascending: false }).limit(20),
      ]);

      const norm = (list) => (list || []).map(t => ({
        ...t,
        artist_name: t.artists?.artist_name || 'Unknown Artist',
      }));

      // Apply tier boost to trending
      const trendingBoosted = (trendingRaw || [])
        .map(t => ({
          ...t,
          artist_name: t.artists?.artist_name || 'Unknown Artist',
          _boosted: (t.engagement_score || 0) * (
            t.artists?.tier === 'premium' ? 1.5 :
            t.artists?.tier === 'pro' ? 1.2 : 1
          ),
        }))
        .sort((a, b) => b._boosted - a._boosted)
        .slice(0, 5);

      setFeaturedTracks(norm(featured));
      setNewReleases(albums || []);
      setTrending(trendingBoosted);
      setTopArtists(artists || []);
      setAllTracks(norm(tracks));
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

  const isEmpty = allTracks.length === 0 && featuredTracks.length === 0;

  return (
    <div className="pt-12 md:pt-0 pb-4">

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

      {/* Featured */}
      {featuredTracks.length > 0 && (
        <Section title="Featured">
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {featuredTracks.map((track) => (
              <div key={track.id}
                onClick={() => handlePlay(track, featuredTracks)}
                className="flex-shrink-0 w-40 md:w-48 cursor-pointer group">
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

      {/* Trending */}
      {trending.length > 0 && (
        <Section title="Trending" icon={Flame} onSeeAll={() => navigate('/browse')}>
          <div>
            {trending.map((track) => (
              <QuickPlayRow
                key={track.id}
                track={track}
                onPlay={(t) => handlePlay(t, trending)}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Top Artists */}
      {topArtists.length > 0 && (
        <Section title="Artists to Follow" onSeeAll={() => navigate('/browse?tab=artists')}>
          <div className="flex space-x-4 overflow-x-auto px-6 scrollbar-hide">
            {topArtists.map(a => (
              <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
                className="flex-shrink-0 w-20 text-center group">
                <div className="w-16 h-16 rounded-full mx-auto mb-2 overflow-hidden bg-white/[0.06] relative">
                  {a.profile_image_url
                    ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-blue-600/20">
                        <span className="text-xl font-bold text-white/40">{a.artist_name?.[0]}</span>
                      </div>
                  }
                  {a.tier === 'premium' && (
                    <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center border border-black">
                      <span className="text-[8px]">★</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-center space-x-0.5 mb-0.5">
                  <p className="text-xs font-medium text-white truncate max-w-[72px]">{a.artist_name}</p>
                  {a.is_verified && <Verified className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />}
                </div>
                <p className="text-[10px] text-white/25">{formatNumber(a.follower_count)} followers</p>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* New Releases */}
      {newReleases.length > 0 && (
        <Section title="New Releases" onSeeAll={() => navigate('/browse')}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6">
            {newReleases.slice(0, 4).map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </Section>
      )}

      {/* Latest Tracks */}
      {allTracks.length > 0 && (
        <Section title="Latest Tracks" icon={TrendingUp} onSeeAll={() => navigate('/browse')}>
          <div className="px-1">
            {allTracks.slice(0, 10).map((track, i) => (
              <TrackCard key={track.id} track={track} trackList={allTracks} index={i} />
            ))}
          </div>
        </Section>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-white/[0.04] flex items-center justify-center mb-4">
            <Music className="w-8 h-8 text-white/10" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No music yet</h3>
          <p className="text-sm text-white/40 max-w-xs">
            Tracks and albums will appear here once published.
            {artist && ' Head to your dashboard to upload your first track.'}
          </p>
          {artist && (
            <button onClick={() => navigate('/dashboard')}
              className="mt-4 px-5 py-2.5 bg-white text-black rounded-full text-sm font-medium">
              Go to Dashboard
            </button>
          )}
        </div>
      )}
    </div>
  );
}


