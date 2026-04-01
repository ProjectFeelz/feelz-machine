import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import TrackActionSheet from '../components/TrackActionSheet';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Flame, TrendingUp, Play, Pause, Music, Crown,
  Loader, Verified, Disc3, Star, Sparkles, Clock,
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

// ── Search history helpers ────────────────────────────────────────────────────
const SEARCH_HISTORY_KEY = 'fm_search_history';

function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function addToSearchHistory(term) {
  if (!term.trim()) return;
  const history = getSearchHistory().filter(h => h !== term);
  history.unshift(term);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 8)));
}

function clearSearchHistory() {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center space-x-2.5 mb-4">
      {Icon && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          <Icon className="w-3.5 h-3.5 text-white/40" />
        </div>
      )}
      <div>
        <p className="section-label">{title}</p>
        {subtitle && <p className="text-[10px] text-white/20 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function BrowsePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  useEffect(() => {
    if (user === null) navigate('/login');
  }, [user]);

  const [query, setQuery]                     = useState('');
  const [searchFocused, setSearchFocused]     = useState(false);
  const [searchHistory, setSearchHistory]     = useState(() => getSearchHistory());
  const [actionSheetTrack, setActionSheetTrack] = useState(null);
  const [activeTab, setActiveTab]             = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'trending';
  });
  const [selectedGenre, setSelectedGenre]     = useState('All');
  const [trending, setTrending]               = useState([]);
  const [featured, setFeatured]               = useState([]);
  const [newReleases, setNewReleases]         = useState([]);
  const [allTracks, setAllTracks]             = useState([]);
  const [artists, setArtists]                 = useState([]);
  const [albums, setAlbums]                   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [searchResults, setSearchResults]     = useState(null);
  const [recommended, setRecommended]         = useState([]);

  useEffect(() => { if (user) fetchAll(); }, [user]);

  useEffect(() => {
    if (user && allTracks.length > 0) fetchRecommended();
  }, [user, allTracks]);

  const fetchRecommended = async () => {
    try {
      const { data: streamData } = await supabase
        .from('streams').select('track_id, tracks(genre, mood)')
        .eq('user_id', user.id).limit(50);
      let genreTags = [], listenedIds = [];
      if (streamData?.length > 0) {
        const tagCounts = {};
        streamData.forEach(s => {
          const g = s.tracks?.genre; const m = s.tracks?.mood;
          if (g) tagCounts[g] = (tagCounts[g] || 0) + 1;
          if (m) tagCounts[m] = (tagCounts[m] || 0) + 1;
        });
        listenedIds = streamData.map(s => s.track_id).filter(Boolean);
        genreTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
      }
      if (genreTags.length === 0) {
        const { data: prefData } = await supabase
          .from('user_profiles').select('genre_preferences')
          .eq('user_id', user.id).maybeSingle();
        genreTags = prefData?.genre_preferences || [];
      }
      if (genreTags.length === 0) return;
      const recFromLocal = allTracks.filter(t =>
        !listenedIds.includes(t.id) &&
        (genreTags.includes(t.genre) || genreTags.includes(t.mood))
      ).slice(0, 8);
      setRecommended(recFromLocal);
    } catch (err) { console.error('Browse recs error:', err); }
  };

  // Search effect — save history when searching
  useEffect(() => {
    if (query.trim().length >= 2) {
      searchAll(query.trim());
      addToSearchHistory(query.trim());
      setSearchHistory(getSearchHistory());
    } else {
      setSearchResults(null);
    }
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) setActiveTab(tab);
  }, [window.location.search]);

  const fetchAll = async () => {
    try {
      const [
        { data: trendingRaw },
        { data: featuredRaw },
        { data: tracksRaw },
        { data: albumsRaw },
        { data: artistsData },
      ] = await Promise.all([
        supabase.from('tracks')
          .select('*, albums(title, cover_artwork_url, price), artists(id, artist_name, slug, profile_image_url, is_verified, tier)')
          .eq('is_published', true).order('engagement_score', { ascending: false }).limit(50),
        supabase.from('tracks')
          .select('*, albums(title, cover_artwork_url, price), artists(id, artist_name, slug, profile_image_url, is_verified)')
          .eq('is_published', true).eq('featured', true).order('created_at', { ascending: false }).limit(200),
        supabase.from('tracks')
          .select('*, albums(title, cover_artwork_url, price), artists(id, artist_name, slug, profile_image_url, is_verified)')
          .eq('is_published', true).order('created_at', { ascending: false }).limit(50),
        supabase.from('albums')
          .select('*, artists(artist_name, slug)')
          .eq('is_published', true).order('release_date', { ascending: false }).limit(50),
        supabase.from('artists')
          .select('id, artist_name, slug, profile_image_url, is_verified, follower_count, total_streams, tier')
          .order('total_streams', { ascending: false }).limit(50),
      ]);

      const norm = (list) => (list || []).map(t => ({
        ...t, artist_name: t.artists?.artist_name || 'Unknown',
      }));
      const normAlbums = (list) => (list || []).map(a => ({
        ...a, artist_name: a.artists?.artist_name || 'Unknown',
      }));

      const trendingBoosted = (trendingRaw || [])
        .map(t => ({
          ...t,
          artist_name: t.artists?.artist_name || 'Unknown',
          _boosted: (t.engagement_score || 0) * (
            t.artists?.tier === 'premium' ? 1.5 :
            t.artists?.tier === 'pro' ? 1.2 : 1
          ),
        }))
        .sort((a, b) => b._boosted - a._boosted);

      const allNorm    = norm(tracksRaw);
      const albumsNorm = normAlbums(albumsRaw);
      const merged = [
        ...allNorm.map(t => ({ ...t, _isAlbum: false, _date: t.created_at })),
        ...albumsNorm.map(a => ({ ...a, _isAlbum: true, _date: a.release_date || a.created_at })),
      ].sort((a, b) => new Date(b._date) - new Date(a._date));

      setTrending(trendingBoosted);
      setFeatured(norm(featuredRaw));
      setNewReleases(merged);
      setAllTracks(allNorm);
      setAlbums(albumsNorm);
      // Artists with images first, imageless ones pushed to the end
      const sortedArtists = (artistsData || []).sort((a, b) => {
        const aHasImg = !!(a.profile_image_url);
        const bHasImg = !!(b.profile_image_url);
        if (aHasImg && !bHasImg) return -1;
        if (!aHasImg && bHasImg) return 1;
        return 0;
      });
      setArtists(sortedArtists);
    } catch (err) { console.error('Browse fetch error:', err); }
    setLoading(false);
  };

  const searchAll = (q) => {
    const lower = q.toLowerCase();
    setSearchResults({
      tracks:  allTracks.filter(t => t.title?.toLowerCase().includes(lower) || t.artist_name?.toLowerCase().includes(lower) || t.genre?.toLowerCase().includes(lower)),
      artists: artists.filter(a => a.artist_name?.toLowerCase().includes(lower)),
      albums:  albums.filter(a => a.title?.toLowerCase().includes(lower) || a.artist_name?.toLowerCase().includes(lower)),
    });
  };

  const filteredTracks = selectedGenre === 'All'
    ? allTracks
    : allTracks.filter(t => t.genre?.toLowerCase() === selectedGenre.toLowerCase());

  const handlePlayTrack = (track, list) => {
    if (currentTrack?.id === track.id) togglePlay();
    else playTrack(track, list);
  };

  const tabs = [
    { key: 'featured', label: 'Featured', icon: Star },
    { key: 'new',      label: 'New',      icon: Sparkles },
    { key: 'trending', label: 'Trending', icon: Flame },
    { key: 'tracks',   label: 'Tracks',   icon: Music },
    { key: 'artists',  label: 'Artists',  icon: Crown },
    { key: 'albums',   label: 'Albums',   icon: Disc3 },
  ];

  if (!user || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/20" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <Helmet>
        <title>Browse · Feelz Machine</title>
        <meta name="description" content="Browse trending tracks, new releases, artists and albums on Feelz Machine." />
        <link rel="canonical" href="https://www.feelzmachine.com/browse" />
        <meta property="og:title" content="Browse · Feelz Machine" />
        <meta property="og:url" content="https://www.feelzmachine.com/browse" />
      </Helmet>

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl pt-12 md:pt-4 pb-3 px-6 md:px-0 border-b border-white/[0.04]">
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            placeholder="Search tracks, artists, albums…"
            aria-label="Search tracks, artists, albums"
            className="w-full pl-10 pr-10 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/30 outline-none focus:bg-white/[0.1] transition"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition text-xs">
              Clear
            </button>
          )}
        </div>

        {/* Search history dropdown */}
        {searchFocused && !query && searchHistory.length > 0 && (
          <div className="mb-3 bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
              <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold">Recent searches</p>
              <button
                onClick={() => { clearSearchHistory(); setSearchHistory([]); }}
                className="text-[10px] text-white/25 hover:text-white/50 transition">
                Clear
              </button>
            </div>
            {searchHistory.map((term) => (
              <button key={term}
                onClick={() => setQuery(term)}
                className="w-full flex items-center space-x-3 px-4 py-2.5 hover:bg-white/[0.04] transition text-left">
                <Clock className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                <span className="text-sm text-white/60 truncate">{term}</span>
              </button>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div role="tablist" className="flex space-x-1 overflow-x-auto scrollbar-hide bg-white/[0.03] rounded-xl p-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} role="tab" aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`flex-shrink-0 flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === key ? 'bg-white text-black' : 'text-white/35 hover:text-white/60'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="px-6 md:px-0 pt-5">

        {/* Search results */}
        {searchResults && (
          <div className="mb-6">
            <p className="section-label mb-4">Results for "{query}"</p>
            {searchResults.artists.length > 0 && (
              <div className="mb-5">
                <p className="section-label mb-3">Artists</p>
                <div className="flex space-x-3 overflow-x-auto scrollbar-hide">
                  {searchResults.artists.map(a => (
                    <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
                      className="flex-shrink-0 w-20 text-center">
                      <div className="w-16 h-16 rounded-full mx-auto mb-1.5 overflow-hidden bg-white/[0.06]">
                        {a.profile_image_url
                          ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/40 to-blue-600/30">
                              <span className="text-lg font-bold text-white/60">{a.artist_name?.[0]}</span>
                            </div>}
                      </div>
                      <p className="text-xs text-white truncate">{a.artist_name}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {searchResults.tracks.length > 0 && (
              <div className="mb-5">
                <p className="section-label mb-3">Tracks</p>
                {searchResults.tracks.slice(0, 5).map((track, i) => (
                  <TrackRow key={track.id} track={track} index={i}
                    currentTrack={currentTrack} isPlaying={isPlaying}
                    onPlay={() => handlePlayTrack(track, searchResults.tracks)}
                    onMore={() => setActionSheetTrack(track)}
                    onArtist={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)} />
                ))}
              </div>
            )}
            {searchResults.albums.length > 0 && (
              <div className="mb-5">
                <p className="section-label mb-3">Albums</p>
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
            <div className="border-b border-white/[0.06] mb-5" />
          </div>
        )}

        {/* FEATURED */}
        {activeTab === 'featured' && (
          <div>
            <SectionLabel icon={Star} title="Featured" subtitle="Hand-picked tracks from our team" />
            {featured.length > 0 ? (
              <>
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                  {featured.map(track => (
                    <TrackCard key={track.id} track={track}
                      currentTrack={currentTrack} isPlaying={isPlaying}
                      onPlay={() => handlePlayTrack(track, featured)}
                      onMore={() => setActionSheetTrack(track)}
                      onArtist={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)} />
                  ))}
                </div>
                <div className="md:hidden space-y-0.5">
                  {featured.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i}
                      currentTrack={currentTrack} isPlaying={isPlaying}
                      onPlay={() => handlePlayTrack(track, featured)}
                      onMore={() => setActionSheetTrack(track)}
                      onArtist={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)} />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <Star className="w-12 h-12 mx-auto text-white/10 mb-3" />
                <p className="text-sm text-white/30">No featured tracks yet</p>
              </div>
            )}
          </div>
        )}

        {/* NEW RELEASES */}
        {activeTab === 'new' && (
          <div>
            <SectionLabel icon={Sparkles} title="New Releases" subtitle="Latest tracks and albums" />
            {newReleases.length > 0 ? (
              <>
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                  {newReleases.map(item => item._isAlbum ? (
                    <AlbumTile key={`album-${item.id}`} album={item} navigate={navigate} />
                  ) : (
                    <TrackCard key={`track-${item.id}`} track={item}
                      currentTrack={currentTrack} isPlaying={isPlaying}
                      onPlay={() => handlePlayTrack(item, newReleases.filter(i => !i._isAlbum))}
                      onMore={() => setActionSheetTrack(item)}
                      onArtist={() => item.artists?.slug && navigate(`/artist/${item.artists.slug}`)} />
                  ))}
                </div>
                <div className="md:hidden space-y-0.5">
                  {newReleases.map((item, i) => item._isAlbum ? (
                    <button key={`album-${item.id}`} onClick={() => navigate(`/album/${item.id}`)}
                      className="w-full flex items-center space-x-3 p-2.5 rounded-xl hover:bg-white/[0.02] transition text-left">
                      <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-white/[0.06]">
                        {item.cover_artwork_url
                          ? <img src={item.cover_artwork_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          : <div className="w-full h-full flex items-center justify-center"><Disc3 className="w-4 h-4 text-white/15" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{item.title}</p>
                        <p className="text-xs text-white/30 truncate">{item.artist_name} · {item.release_type?.toUpperCase() || 'ALBUM'}</p>
                      </div>
                    </button>
                  ) : (
                    <TrackRow key={`track-${item.id}`} track={item} index={i}
                      currentTrack={currentTrack} isPlaying={isPlaying}
                      onPlay={() => handlePlayTrack(item, newReleases.filter(i => !i._isAlbum))}
                      onMore={() => setActionSheetTrack(item)}
                      onArtist={() => item.artists?.slug && navigate(`/artist/${item.artists.slug}`)} />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <Sparkles className="w-12 h-12 mx-auto text-white/10 mb-3" />
                <p className="text-sm text-white/30">No releases yet</p>
              </div>
            )}
          </div>
        )}

        {/* TRENDING */}
        {activeTab === 'trending' && (
          <div>
            <SectionLabel icon={Flame} title="Trending Now" subtitle="Based on streams, likes, saves & playlist adds" />
            {trending.length > 0 ? (
              <>
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                  {trending.map((track, i) => (
                    <TrackCard key={track.id} track={track} rank={i + 1}
                      currentTrack={currentTrack} isPlaying={isPlaying}
                      onPlay={() => handlePlayTrack(track, trending)}
                      onMore={() => setActionSheetTrack(track)}
                      onArtist={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)} />
                  ))}
                </div>
                <div className="md:hidden space-y-0.5">
                  {trending.map((track, i) => (
                    <TrendingRow key={track.id} track={track} rank={i + 1}
                      currentTrack={currentTrack} isPlaying={isPlaying}
                      onPlay={() => handlePlayTrack(track, trending)}
                      onMore={() => setActionSheetTrack(track)}
                      onArtist={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)} />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <TrendingUp className="w-12 h-12 mx-auto text-white/10 mb-3" />
                <p className="text-sm text-white/30">No trending tracks yet</p>
              </div>
            )}
            <div className="mt-6 rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
              <p className="section-label mb-2">How Trending Works</p>
              <p className="text-[11px] text-white/25 leading-relaxed">
                Trending rank is calculated from a weighted engagement score: streams count as 1 point,
                likes as 3, saves as 4, favorites as 5, playlist adds as 6, and downloads as 2.
                Scores update regularly. Fraud detection filters suspicious activity.
              </p>
            </div>
          </div>
        )}

        {/* TRACKS */}
        {activeTab === 'tracks' && (
          <div>
            {selectedGenre === 'All' && recommended.length > 0 && (
              <div className="mb-6">
                <SectionLabel icon={Sparkles} title="Recommended For You" />
                <div className="flex space-x-3 overflow-x-auto scrollbar-hide -mx-6 px-6">
                  {recommended.map(track => (
                    <div key={track.id} className="flex-shrink-0 w-32 cursor-pointer group"
                      onClick={() => handlePlayTrack(track, recommended)}>
                      <div className="aspect-square rounded-xl overflow-hidden mb-1.5 bg-white/[0.06]">
                        {track.cover_artwork_url
                          ? <img src={track.cover_artwork_url} alt="" loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          : <div className="w-full h-full flex items-center justify-center"><Music className="w-6 h-6 text-white/15" /></div>}
                      </div>
                      <p className="text-xs font-medium text-white truncate">{track.title}</p>
                      <p className="text-[10px] text-white/30 truncate">{track.artist_name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="section-label mb-3">Filter by Genre</p>
            <div className="flex space-x-2 overflow-x-auto scrollbar-hide mb-5 -mx-1 px-1">
              {GENRE_TAGS.map(genre => (
                <button key={genre} onClick={() => setSelectedGenre(genre)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    selectedGenre === genre ? 'bg-white text-black' : 'bg-white/[0.06] text-white/40 hover:text-white/70'
                  }`}>
                  {genre}
                </button>
              ))}
            </div>
            {filteredTracks.length > 0 ? (
              <>
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                  {filteredTracks.map(track => (
                    <TrackCard key={track.id} track={track}
                      currentTrack={currentTrack} isPlaying={isPlaying}
                      onPlay={() => handlePlayTrack(track, filteredTracks)}
                      onMore={() => setActionSheetTrack(track)}
                      onArtist={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)} />
                  ))}
                </div>
                <div className="md:hidden space-y-0.5">
                  {filteredTracks.map((track, i) => (
                    <TrackRow key={track.id} track={track} index={i}
                      currentTrack={currentTrack} isPlaying={isPlaying}
                      onPlay={() => handlePlayTrack(track, filteredTracks)}
                      onMore={() => setActionSheetTrack(track)}
                      onArtist={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)} />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center text-white/20 text-sm py-12">
                {selectedGenre === 'All' ? 'No tracks yet' : `No ${selectedGenre} tracks yet`}
              </p>
            )}
          </div>
        )}

        {/* ARTISTS */}
        {activeTab === 'artists' && (
          <div>
            <SectionLabel icon={Crown} title="Artists" subtitle="Sorted by total streams" />
            {artists.length > 0 ? (
              <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                {artists.map(a => (
                  <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
                    className="text-center group">
                    <div className="w-full aspect-square rounded-2xl overflow-hidden bg-white/[0.06] mb-2">
                      {a.profile_image_url
                        ? <img src={a.profile_image_url} alt="" loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-blue-600/20">
                            <span className="text-2xl font-bold text-white/40">{a.artist_name?.[0]}</span>
                          </div>}
                    </div>
                    <div className="flex items-center justify-center space-x-1 mb-0.5">
                      <p className="text-sm font-medium text-white truncate">{a.artist_name}</p>
                      {a.is_verified && <Verified className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] text-white/25">{formatNumber(a.follower_count)} followers</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-white/20 text-sm py-12">No artists yet</p>
            )}
          </div>
        )}

        {/* ALBUMS */}
        {activeTab === 'albums' && (
          <div>
            <SectionLabel icon={Disc3} title="Albums & EPs" subtitle="Latest releases" />
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

      {actionSheetTrack && (
        <TrackActionSheet
          track={actionSheetTrack}
          artist={{ artist_name: actionSheetTrack.artist_name, slug: actionSheetTrack.artists?.slug }}
          onClose={() => setActionSheetTrack(null)}
        />
      )}
    </div>
  );
}

/* ── Sub components ──────────────────────────────────────────────────────────*/

function TrackCard({ track, rank, currentTrack, isPlaying, onPlay, onMore, onArtist }) {
  const isActive       = currentTrack?.id === track.id;
  const isTrackPlaying = isActive && isPlaying;
  return (
    <div onClick={onPlay}
      className={`relative flex items-center space-x-3 p-3 rounded-xl transition cursor-pointer ${
        isActive ? 'bg-white/[0.06]' : 'bg-white/[0.03] hover:bg-white/[0.05]'
      }`}>
      {rank && <span className="absolute top-2 left-2 text-[9px] font-bold text-white/20">#{rank}</span>}
      <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.06]">
        {track.cover_artwork_url
          ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5 text-white/15" /></div>}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          {isTrackPlaying ? <Pause className="w-4 h-4 text-white" fill="white" /> : <Play className="w-4 h-4 text-white" fill="white" />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-purple-400' : 'text-white'}`}>{track.title}</p>
        <button onClick={(e) => { e.stopPropagation(); onArtist(); }}
          className="text-xs text-white/40 truncate hover:text-white/60 transition text-left block w-full">
          {track.artist_name}
        </button>
        {track.engagement_score > 0 && (
          <div className="flex items-center space-x-1 mt-0.5">
            <TrendingUp className="w-2.5 h-2.5 text-green-400" />
            <span className="text-[9px] text-green-400">{formatNumber(track.engagement_score)}</span>
          </div>
        )}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onMore(); }}
        className="p-1.5 rounded-full hover:bg-white/10 transition flex-shrink-0">
        <span className="text-white/30 text-lg leading-none">···</span>
      </button>
    </div>
  );
}

function TrendingRow({ track, rank, currentTrack, isPlaying, onPlay, onMore, onArtist }) {
  const isActive       = currentTrack?.id === track.id;
  const isTrackPlaying = isActive && isPlaying;
  const rankColors     = { 1: 'from-yellow-400 to-orange-500', 2: 'from-gray-300 to-gray-400', 3: 'from-amber-600 to-amber-700' };
  return (
    <div onClick={onPlay}
      className={`flex items-center space-x-3 p-2.5 rounded-xl transition cursor-pointer ${
        isActive ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
      }`}>
      <div className="w-8 flex items-center justify-center flex-shrink-0">
        {rank <= 3 ? (
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${rankColors[rank]} flex items-center justify-center`}>
            <span className="text-xs font-bold text-black">{rank}</span>
          </div>
        ) : (
          <span className="text-sm font-bold text-white/20">{rank}</span>
        )}
      </div>
      <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0">
        {track.cover_artwork_url
          ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/40 to-blue-900/30"><Music className="w-4 h-4 text-white/20" /></div>}
        {isTrackPlaying && (
          <div className="absolute bottom-0.5 right-0.5 flex items-end space-x-px">
            {[100, 60, 80].map((h, i) => (
              <div key={i} className="w-[3px] bg-purple-400 rounded-sm animate-pulse"
                style={{ height: `${h}%`, maxHeight: 12, animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-purple-400' : 'text-white'}`}>{track.title}</p>
        <button onClick={(e) => { e.stopPropagation(); onArtist(); }} className="flex items-center space-x-1">
          <span className="text-xs text-white/40 truncate hover:text-white/60 transition">{track.artist_name}</span>
          {track.artists?.is_verified && <Verified className="w-2.5 h-2.5 text-blue-400 flex-shrink-0" />}
        </button>
      </div>
      <div className="flex flex-col items-end flex-shrink-0 space-y-0.5">
        {track.engagement_score > 0 && (
          <div className="flex items-center space-x-1">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <span className="text-[10px] font-semibold text-green-400">{formatNumber(track.engagement_score)}</span>
          </div>
        )}
        <span className="text-[10px] text-white/20">{formatNumber(track.stream_count)} plays</span>
      </div>
    </div>
  );
}

function TrackRow({ track, index, currentTrack, isPlaying, onPlay, onMore, onArtist }) {
  const isActive       = currentTrack?.id === track.id;
  const isTrackPlaying = isActive && isPlaying;
  return (
    <button onClick={onPlay}
      className={`w-full flex items-center space-x-3 p-2.5 rounded-xl transition text-left ${
        isActive ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
      }`}>
      <div className="w-6 flex items-center justify-center flex-shrink-0">
        {isTrackPlaying ? (
          <div className="flex items-end space-x-px h-3.5">
            {[100, 60, 80].map((h, i) => (
              <div key={i} className="w-[3px] bg-purple-400 rounded-sm animate-pulse"
                style={{ height: `${h}%`, animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        ) : isActive ? (
          <Pause className="w-3.5 h-3.5 text-purple-400" />
        ) : (
          <span className="text-xs text-white/20">{index + 1}</span>
        )}
      </div>
      <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-white/[0.06]">
        {track.cover_artwork_url
          ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-blue-900/20"><Music className="w-4 h-4 text-white/15" /></div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-purple-400' : 'text-white'}`}>{track.title}</p>
        <div className="flex items-center space-x-1.5">
          {track.is_explicit && <span className="text-[8px] font-bold px-1 py-0.5 bg-white/[0.1] text-white/40 rounded">E</span>}
          <span className="text-xs text-white/30 truncate">{track.artist_name}</span>
          {track.genre && <span className="text-[10px] text-white/15">· {track.genre}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end flex-shrink-0">
        {track.duration && <span className="text-[11px] text-white/25">{formatDuration(track.duration)}</span>}
        <span className="text-[10px] text-white/15">{formatNumber(track.stream_count)} plays</span>
      </div>
    </button>
  );
}

function AlbumTile({ album, navigate }) {
  return (
    <button onClick={() => navigate(`/album/${album.slug || album.id}`)} className="text-left group">
      <div className="aspect-square rounded-xl overflow-hidden bg-white/[0.06] mb-2">
        {album.cover_artwork_url
          ? <img src={album.cover_artwork_url} alt="" loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/[0.06] to-white/[0.02]">
              <Disc3 className="w-8 h-8 text-white/10" />
            </div>}
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
