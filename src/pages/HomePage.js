import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { ChevronRight, Flame, Play, Pause, Music, Verified, MoreHorizontal, Disc } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TrackActionSheet from '../components/TrackActionSheet';

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

function SquareCard({ item, itemList = [], isAlbum = false, onPlay, currentTrack, isPlaying }) {
      const navigate = useNavigate();
      const menuRef = useRef(null);
      const [showActionSheet, setShowActionSheet] = useState(false);
      const isActive = !isAlbum && currentTrack?.id === item.id;
      const isCurrentPlaying = isActive && isPlaying;

  useEffect(() => {
          const handler = (e) => {
                    if (menuRef.current && !menuRef.current.contains(e.target)) {
                                setShowActionSheet(false);
                    }
          };
          if (showActionSheet) document.addEventListener('mousedown', handler);
          return () => document.removeEventListener('mousedown', handler);
  }, [showActionSheet]);

  return (
          <div className="flex-shrink-0 w-40 md:w-52 cursor-pointer group relative">
            <div
            className="aspect-square rounded-xl overflow-hidden bg-white/[0.06] mb-2 relative"
            onClick={() => isAlbum ? navigate(`/album/${item.slug || item.id}`) : onPlay(item, itemList)}
          >
            {item.cover_artwork_url
                       ? <img src={item.cover_artwork_url} alt={item.title ? item.title.trim() : ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
            {isAlbum ? <Disc className="w-8 h-8 text-white/20" /> : <Music className="w-8 h-8 text-white/20" />}
</div>
}
        <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition rounded-xl ${isCurrentPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
        {isCurrentPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
            </div>
            </div>
{isAlbum && (
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-white/60 backdrop-blur">
{item.release_type?.toUpperCase() || 'ALBUM'}
</div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowActionSheet(true); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
          aria-label={"More options for " + item.title}
                      >
                        <MoreHorizontal className="w-3.5 h-3.5 text-white" />
              </button>
              </div>
      <p className="text-sm font-medium text-white truncate">{item.title}</p>
      <button
        onClick={(e) => { e.stopPropagation(); if (item.artist_slug) navigate(`/artist/${item.artist_slug}`); }}
        className="text-xs text-white/40 truncate hover:text-white/70 transition text-left w-full block"
      >
        {item.artist_name}
            </button>
{showActionSheet && (
            <TrackActionSheet
           track={isAlbum ? null : item}
          artist={{ artist_name: item.artist_name, slug: item.artist_slug || item.artists?.slug }}
          onClose={() => setShowActionSheet(false)}
        />
      )}
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
                        { data: recentTracks },
                        { data: recentAlbums },
                        { data: trendingRaw },
                        { data: artists },
                              ] = await Promise.all([
                                supabase.from('tracks')
                                  .select('*, albums(title, cover_artwork_url, price), artists(artist_name, slug, profile_image_url, tier)')
                                  .eq('is_published', true).eq('featured', true)
                                  .order('created_at', { ascending: false }).limit(10),
                                supabase.from('tracks')
                                  .select('*, albums(title, cover_artwork_url, price), artists(artist_name, slug, profile_image_url)')
                                  .eq('is_published', true)
                                  .order('created_at', { ascending: false }).limit(8),
                                supabase.from('albums')
                                  .select('*, artists(artist_name, slug, profile_image_url)')
                                  .eq('is_published', true)
                                  .order('created_at', { ascending: false }).limit(8),
                                supabase.from('tracks')
                                  .select('*, albums(title, cover_artwork_url, price), artists(artist_name, slug, profile_image_url, is_verified, tier)')
                                  .eq('is_published', true)
                                  .order('engagement_score', { ascending: false }).limit(20),
                                supabase.from('artists')
                                  .select('id, artist_name, slug, profile_image_url, is_verified, follower_count, total_streams, tier')
                                  .order('follower_count', { ascending: false }).limit(10),
                              ]);

            const normTrack = (list) => (list || []).map(t => ({
                        ...t,
                        artist_name: t.artists?.artist_name || 'Unknown Artist',
                        artist_slug: t.artists?.slug || t.artist_slug || null,
            }));

            const normAlbum = (list) => (list || []).map(a => ({
                        ...a,
                        artist_name: a.artists?.artist_name || 'Unknown Artist',
                        artist_slug: a.artists?.slug || null,
                        _isAlbum: true,
            }));

            const merged = [
                        ...normTrack(recentTracks).map(t => ({ ...t, _isAlbum: false, _date: t.created_at })),
                        ...normAlbum(recentAlbums).map(a => ({ ...a, _date: a.release_date || a.created_at })),
                      ].sort((a, b) => new Date(b._date) - new Date(a._date)).slice(0, 10);

            const trendingBoosted = (trendingRaw || [])
                      .map(t => ({
                                    ...t,
                                    artist_name: t.artists?.artist_name || 'Unknown Artist',
                                    artist_slug: t.artists?.slug || t.artist_slug || null,
                                    _boosted: (t.engagement_score || 0) * (
                                                    t.artists?.tier === 'premium' ? 1.5 : t.artists?.tier === 'pro' ? 1.2 : 1
                                                  ),
                      }))
                      .sort((a, b) => b._boosted - a._boosted)
                      .slice(0, 8);

            setFeaturedTracks(normTrack(featured));
                    setNewReleases(merged);
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
          <div className="pt-12 md:pt-0 pb-4">
            <Helmet>
              <title>Home · Feelz Machine</title>
              <meta name="description" content="Discover independent music, trending tracks and artists on Feelz Machine." />
              <link rel="canonical" href="https://www.feelzmachine.com/" />
              <meta property="og:title" content="Home · Feelz Machine" />
              <meta property="og:url" content="https://www.feelzmachine.com/" />
            </Helmet>

            <div className="px-6 mb-4 sticky top-0 z-20 bg-black/90 backdrop-blur-sm md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-2">
              <h1 className="text-2xl font-bold text-white">
  {user ? greeting() : 'Feelz Machine'}
</h1>
        <p className="text-sm text-white/40 mt-1">
{user ? `Welcome back${artist ? ', ' + artist.artist_name : ''}` : 'Discover music from independent artists'}
</p>
    </div>

{featuredTracks.length > 0 && (
            <Section title="Featured">
              <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
{featuredTracks.map((track) => (
                  <SquareCard key={track.id} item={track} itemList={featuredTracks} onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} />
                ))}
    </div>
    </Section>
      )}

{newReleases.length > 0 && (
            <Section title="New Releases" onSeeAll={() => navigate('/browse?tab=new')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
{newReleases.map((item) => (
                  <SquareCard
                                 key={`${item._isAlbum ? 'album' : 'track'}-${item.id}`}
                item={item}
                itemList={newReleases.filter(i => !i._isAlbum)}
                isAlbum={item._isAlbum}
                onPlay={handlePlay}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
              />
                                ))}
                    </div>
                    </Section>
      )}

{trending.length > 0 && (
            <Section title="Trending" icon={Flame} onSeeAll={() => navigate('/browse?tab=trending')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
{trending.map((track) => (
                  <SquareCard key={track.id} item={track} itemList={trending} onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} />
                ))}
</div>
    </Section>
      )}

{topArtists.length > 0 && (
            <Section title="Artists to Follow" onSeeAll={() => navigate('/browse?tab=artists')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
{topArtists.map(a => (
                  <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)} className="flex-shrink-0 w-40 md:w-52 text-center group">
                    <div className="w-40 h-40 md:w-52 md:h-52 rounded-full overflow-hidden bg-white/[0.06] mb-2 mx-auto">
{a.profile_image_url
                    ? <img src={a.profile_image_url} alt={a.artist_name || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-blue-600/20">
                            <span className="text-3xl font-bold text-white/40">{a.artist_name?.[0]}</span>
    </div>
}
</div>
                <div className="flex items-center justify-center space-x-1">
                      <p className="text-sm font-medium text-white truncate max-w-[140px]">{a.artist_name}</p>
{a.is_verified && <Verified className="w-3 h-3 text-blue-400 flex-shrink-0" />}
</div>
                 <p className="text-xs text-white/30 mt-0.5">{formatNumber(a.follower_count)} followers</p>
    </button>
             ))}
</div>
    </Section>
      )}
</div>
  );
}
