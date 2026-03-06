import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { usePlayer } from '../contexts/PlayerContext';
import {
  Search, Flame, TrendingUp, Play, Pause, Music, Crown,
  Loader, ChevronRight, Verified, Heart, Disc3
} from 'lucide-react';

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const GENRE_TAGS = [
  'All', 'Hip Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Afrobeats',
  'Latin', 'Soul', 'Jazz', 'Indie', 'Lo-Fi', 'Drill', 'Trap', 'House',
];

export default function BrowsePage() {
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('trending');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [trending, setTrending] = useState([]);
  const [allTracks, setAllTracks] = useState([]);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (query.trim().length >= 2) {
      searchAll(query.trim());
    } else {
      setSearchResults(null);
    }
  }, [query]);

  const fetchAll = async () => {
    try {
      // Trending — fetch top 20, then boost Premium/Pro artists client-side
      const { data: trendingRaw } = await supabase
        .from('tracks')
        .select('*, artists(id, artist_name, slug, profile_image_url, is_verified, tier)')
        .eq('is_published', true)
        .order('engagement_score', { ascending: false })
        .limit(20);

      const trendingData = (trendingRaw || [])
        .map(t => ({
          ...t,
          _boosted: (t.engagement_score || 0) * (
            t.artists?.tier === 'premium' ? 1.5 :
            t.artists?.tier === 'pro' ? 1.2 : 1
          ),
        }))
        .sort((a, b) => b._boosted - a._boosted)
        .slice(0, 10);

      // All tracks for browse
      const { data: tracksData } = await supabase
        .from('tracks')
        .select('*, artists(id, artist_name, slug, profile_image_url, is_verified)')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(100);

      // Top artists by follower count / streams
      const { data: artistsData } = await supabase
        .from('artists')
        .select('*')
        .order('total_streams', { ascending: false })
        .limit(20);

      // Albums
      const { data: albumsData } = await supabase
        .from('albums')
        .select('*, artists(artist_name, slug)')
        .eq('is_published', true)
        .order('release_date', { ascending: false })
        .limit(20);

      const norm = (list) => (list || []).map(t => ({
        ...t,
        artist_name: t.artists?.artist_name || 'Unknown',
      }));

      setTrending(norm(trendingData));
      setAllTracks(norm(tracksData));
      setArtists(artistsData || []);
      setAlbums((albumsData || []).map(a => ({ ...a, artist_name: a.artists?.artist_name || 'Unknown' })));
    } catch (err) {
      console.error('Browse fetch error:', err);
    }
    setLoading(false);
  };

  const searchAll = async (q) => {
    const lower = q.toLowerCase();
    const matchTracks = allTracks.filter(t =>
      t.title?.toLowerCase().includes(lower) ||
      t.artist_name?.toLowerCase().includes(lower) ||
      t.genre?.toLowerCase().includes(lower)
    );
    const matchArtists = artists.filter(a =>
      a.artist_name?.toLowerCase().includes(lower)
    );
    const matchAlbums = albums.filter(a =>
      a.title?.toLowerCase().includes(lower) ||
      a.artist_name?.toLowerCase().includes(lower)
    );
    setSearchResults({ tracks: matchTracks, artists: matchArtists, albums: matchAlbums });
  };

  const filteredTracks = selectedGenre === 'All'
    ? allTracks
    : allTracks.filter(t => t.genre?.toLowerCase() === selectedGenre.toLowerCase());

  const handlePlayTrack = (track, list) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, list);
    }
  };

  const tabs = [
    { key: 'trending', label: 'Trending', icon: Flame },
    { key: 'tracks', label: 'Tracks', icon: Music },
    { key: 'artists', label: 'Artists', icon: Crown },
    { key: 'albums', label: 'Albums', icon: Disc3 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/20" />
      </div>
    );
  }

  return (
    <div className="pt-12 md:pt-0 pb-4 px-6 md:px-0 max-w-2xl">
      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tracks, artists, albums..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/30 outline-none focus:bg-white/[0.1] transition"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-xs">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Search results overlay */}
      {searchResults && (
        <div className="mb-6">
          <p className="text-xs text-white/30 mb-3">Results for "{query}"</p>

          {/* Artists */}
          {searchResults.artists.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-white/50 mb-2">Artists</p>
              <div className="flex space-x-3 overflow-x-auto scrollbar-hide">
                {searchResults.artists.map(a => (
                  <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
                    className="flex-shrink-0 w-20 text-center group">
                    <div className="w-16 h-16 rounded-full mx-auto mb-1.5 overflow-hidden bg-white/[0.06]">
                      {a.profile_image_url
                        ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/40 to-blue-600/30">
                            <span className="text-lg font-bold text-white/60">{a.artist_name?.[0]}</span>
                          </div>}
                    </div>
                    <p className="text-[11px] text-white truncate">{a.artist_name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tracks */}
          {searchResults.tracks.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-white/50 mb-2">Tracks</p>
              {searchResults.tracks.slice(0, 5).map((track, i) => (
                <TrackRow key={track.id} track={track} index={i}
                  currentTrack={currentTrack} isPlaying={isPlaying}
                  onPlay={() => handlePlayTrack(track, searchResults.tracks)}
                  onArtist={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)} />
              ))}
            </div>
          )}

          {/* Albums */}
          {searchResults.albums.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-white/50 mb-2">Albums</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {searchResults.albums.slice(0, 4).map(album => (
                  <AlbumTile key={album.id} album={album} navigate={navigate} />
                ))}
              </div>
            </div>
          )}

          {searchResults.tracks.length === 0 && searchResults.artists.length === 0 && searchResults.albums.length === 0 && (
            <p className="text-center text-white/20 text-sm py-8">No results found</p>
          )}

          <div className="border-b border-white/[0.06] mb-4" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 bg-white/[0.03] rounded-xl p-1 mb-5">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-medium transition ${
              activeTab === key ? 'bg-white text-black' : 'text-white/40'
            }`}>
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ========== TRENDING TAB ========== */}
      {activeTab === 'trending' && (
        <div>
          {/* Header */}
          <div className="flex items-center space-x-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
              <Flame className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Trending Now</h2>
              <p className="text-[10px] text-white/30">Based on streams, likes, saves & playlist adds</p>
            </div>
          </div>

          {trending.length > 0 ? (
            <div className="space-y-1">
              {trending.map((track, i) => (
                <TrendingRow
                  key={track.id}
                  track={track}
                  rank={i + 1}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  onPlay={() => handlePlayTrack(track, trending)}
                  onArtist={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <TrendingUp className="w-12 h-12 mx-auto text-white/10 mb-3" />
              <p className="text-sm text-white/30 mb-1">No trending tracks yet</p>
              <p className="text-xs text-white/15">Upload music and start building engagement!</p>
            </div>
          )}

          {/* Scoring explanation */}
          <div className="mt-6 rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
            <h4 className="text-xs font-semibold text-white/50 mb-2">How Trending Works</h4>
            <p className="text-[11px] text-white/25 leading-relaxed">
              Trending rank is calculated from a weighted engagement score: streams count as 1 point,
              likes as 3, saves as 4, favorites as 5, playlist adds as 6, and downloads as 2.
              Scores update regularly. Fraud detection filters out suspicious activity.
            </p>
          </div>
        </div>
      )}

      {/* ========== TRACKS TAB ========== */}
      {activeTab === 'tracks' && (
        <div>
          {/* Genre filter */}
          <div className="flex space-x-2 overflow-x-auto scrollbar-hide mb-4 -mx-1 px-1">
            {GENRE_TAGS.map(genre => (
              <button key={genre} onClick={() => setSelectedGenre(genre)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  selectedGenre === genre
                    ? 'bg-white text-black'
                    : 'bg-white/[0.06] text-white/50'
                }`}>
                {genre}
              </button>
            ))}
          </div>

          {filteredTracks.length > 0 ? (
            <div className="space-y-1">
              {filteredTracks.map((track, i) => (
                <TrackRow key={track.id} track={track} index={i}
                  currentTrack={currentTrack} isPlaying={isPlaying}
                  onPlay={() => handlePlayTrack(track, filteredTracks)}
                  onArtist={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)} />
              ))}
            </div>
          ) : (
            <p className="text-center text-white/20 text-sm py-12">
              {selectedGenre === 'All' ? 'No tracks yet' : `No ${selectedGenre} tracks yet`}
            </p>
          )}
        </div>
      )}

      {/* ========== ARTISTS TAB ========== */}
      {activeTab === 'artists' && (
        <div>
          {artists.length > 0 ? (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
              {artists.map(a => (
                <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
                  className="text-center group">
                  <div className="w-full aspect-square rounded-2xl overflow-hidden bg-white/[0.06] mb-2">
                    {a.profile_image_url
                      ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-blue-600/20">
                          <span className="text-2xl font-bold text-white/40">{a.artist_name?.[0]}</span>
                        </div>}
                  </div>
                  <div className="flex items-center justify-center space-x-1 mb-0.5">
                    <p className="text-sm font-medium text-white truncate">{a.artist_name}</p>
                    {a.is_verified && <Verified className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                  </div>
                  <p className="text-[10px] text-white/30">
                    {formatNumber(a.follower_count)} followers · {formatNumber(a.total_streams)} plays
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-white/20 text-sm py-12">No artists yet</p>
          )}
        </div>
      )}

      {/* ========== ALBUMS TAB ========== */}
      {activeTab === 'albums' && (
        <div>
          {albums.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {albums.map(album => (
                <AlbumTile key={album.id} album={album} navigate={navigate} />
              ))}
            </div>
          ) : (
            <p className="text-center text-white/20 text-sm py-12">No albums yet</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ========== SUB COMPONENTS ========== */

function TrendingRow({ track, rank, currentTrack, isPlaying, onPlay, onArtist }) {
  const isActive = currentTrack?.id === track.id;
  const isTrackPlaying = isActive && isPlaying;

  const rankColors = {
    1: 'from-yellow-400 to-orange-500',
    2: 'from-gray-300 to-gray-400',
    3: 'from-amber-600 to-amber-700',
  };

  return (
    <div className={`flex items-center space-x-3 p-2.5 rounded-xl transition ${isActive ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}>
      {/* Rank */}
      <div className="w-8 flex items-center justify-center flex-shrink-0">
        {rank <= 3 ? (
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${rankColors[rank]} flex items-center justify-center`}>
            <span className="text-xs font-bold text-black">{rank}</span>
          </div>
        ) : (
          <span className="text-sm font-bold text-white/20">{rank}</span>
        )}
      </div>

      {/* Artwork + play */}
      <button onClick={onPlay} className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 group">
        {track.cover_artwork_url ? (
          <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/40 to-blue-900/30">
            <Music className="w-4 h-4 text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
          {isTrackPlaying
            ? <Pause className="w-4 h-4 text-white" fill="white" />
            : <Play className="w-4 h-4 text-white" fill="white" />}
        </div>
        {isTrackPlaying && (
          <div className="absolute bottom-0.5 right-0.5 flex items-end space-x-px">
            <div className="w-[3px] h-2 bg-purple-400 rounded-sm animate-pulse" />
            <div className="w-[3px] h-3 bg-purple-400 rounded-sm animate-pulse" style={{ animationDelay: '0.15s' }} />
            <div className="w-[3px] h-1.5 bg-purple-400 rounded-sm animate-pulse" style={{ animationDelay: '0.3s' }} />
          </div>
        )}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-purple-400' : 'text-white'}`}>
          {track.title}
        </p>
        <button onClick={onArtist} className="flex items-center space-x-1">
          <span className="text-xs text-white/40 truncate hover:text-white/60 transition">
            {track.artist_name}
          </span>
          {track.artists?.is_verified && <Verified className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />}
        </button>
      </div>

      {/* Engagement score badge */}
      <div className="flex flex-col items-end flex-shrink-0">
        {track.engagement_score > 0 && (
          <div className="flex items-center space-x-1 mb-0.5">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <span className="text-[10px] font-semibold text-green-400">{formatNumber(track.engagement_score)}</span>
          </div>
        )}
        <span className="text-[10px] text-white/20">{formatNumber(track.stream_count)} plays</span>
      </div>
    </div>
  );
}

function TrackRow({ track, index, currentTrack, isPlaying, onPlay, onArtist }) {
  const isActive = currentTrack?.id === track.id;
  const isTrackPlaying = isActive && isPlaying;

  return (
    <button onClick={onPlay}
      className={`w-full flex items-center space-x-3 p-2.5 rounded-xl transition text-left ${isActive ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}>
      {/* Number */}
      <div className="w-6 flex items-center justify-center flex-shrink-0">
        {isTrackPlaying ? (
          <div className="flex items-end space-x-px h-3.5">
            <div className="w-[3px] bg-purple-400 rounded-sm animate-pulse" style={{ height: '100%' }} />
            <div className="w-[3px] bg-purple-400 rounded-sm animate-pulse" style={{ height: '60%', animationDelay: '0.15s' }} />
            <div className="w-[3px] bg-purple-400 rounded-sm animate-pulse" style={{ height: '80%', animationDelay: '0.3s' }} />
          </div>
        ) : isActive ? (
          <Pause className="w-3.5 h-3.5 text-purple-400" />
        ) : (
          <span className="text-xs text-white/20">{index + 1}</span>
        )}
      </div>

      {/* Artwork */}
      <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-white/[0.06]">
        {track.cover_artwork_url ? (
          <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-blue-900/20">
            <Music className="w-4 h-4 text-white/15" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-purple-400' : 'text-white'}`}>
          {track.title}
        </p>
        <div className="flex items-center space-x-1.5">
          {track.is_explicit && (
            <span className="text-[8px] font-bold px-1 py-0.5 bg-white/[0.1] text-white/40 rounded">E</span>
          )}
          <span className="text-xs text-white/30 truncate">{track.artist_name}</span>
          {track.genre && <span className="text-[10px] text-white/15">· {track.genre}</span>}
        </div>
      </div>

      {/* Duration + plays */}
      <div className="flex flex-col items-end flex-shrink-0">
        {track.duration && <span className="text-[11px] text-white/25">{formatDuration(track.duration)}</span>}
        <span className="text-[10px] text-white/15">{formatNumber(track.stream_count)} plays</span>
      </div>
    </button>
  );
}

function AlbumTile({ album, navigate }) {
  return (
    <button onClick={() => navigate(`/album/${album.slug || album.id}`)}
      className="text-left group">
      <div className="aspect-square rounded-xl overflow-hidden bg-white/[0.06] mb-2">
        {album.cover_artwork_url ? (
          <img src={album.cover_artwork_url} alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/[0.06] to-white/[0.02]">
            <Disc3 className="w-8 h-8 text-white/10" />
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-white truncate">{album.title}</p>
      <p className="text-xs text-white/30 truncate">
        {album.artist_name}
        {album.release_type && album.release_type !== 'album' && (
          <span className="ml-1">· {album.release_type.toUpperCase()}</span>
        )}
      </p>
    </button>
  );
}





