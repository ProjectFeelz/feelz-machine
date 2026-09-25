import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import TrackActionSheet from '../components/TrackActionSheet';
import PreorderTag from '../components/PreorderTag';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, Flame, TrendingUp, Play, Pause, Music, Crown,
  Loader, Disc3, Star, Sparkles, Clock, Users, Newspaper,
} from 'lucide-react';
import VerifiedBadge from '../components/VerifiedBadge';
// Ask Supabase for the size we actually draw. See utils/coverUrl.
import { coverUrl, COVER } from '../utils/coverUrl';
// The same two things the home card shows on a computer, so Browse and Home
// cannot disagree about who today's creators are or what the latest post is.
import {
  useHomeCardData, CreatorCard, NoCreators, NewsOverlay,
} from '../components/HomeAsideCard';
import { CollabGrid } from '../components/CollaborationsSpotlight';
import { StoriesRail } from '../components/ArtistStories';

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

// These values MUST match the mood vocabulary in TrackUploadPanel, otherwise
// a filter can never match anything. The previous list used labels like
// "Hype", "Late Night" and "Workout" that no track could ever be tagged
// with, so five of the six filters always returned zero results.
const MOOD_TAGS = [
  { label: 'All Moods',  value: null,          emoji: '🎵' },
  { label: 'Chill',      value: 'Chill',       emoji: '😌' },
  { label: 'Energetic',  value: 'Energetic',   emoji: '🔥' },
  { label: 'Happy',      value: 'Happy',       emoji: '☀️' },
  { label: 'Sad',        value: 'Sad',         emoji: '💔' },
  { label: 'Dark',       value: 'Dark',        emoji: '🌑' },
  { label: 'Smooth',     value: 'Smooth',      emoji: '🌊' },
  { label: 'Romantic',   value: 'Romantic',    emoji: '💜' },
  { label: 'Nostalgic',  value: 'Nostalgic',   emoji: '📼' },
  { label: 'Groovy',     value: 'Groovy',      emoji: '🕺' },
  { label: 'Dreamy',     value: 'Dreamy',      emoji: '✨' },
  { label: 'Aggressive', value: 'Aggressive',  emoji: '⚡' },
  { label: 'Peaceful',   value: 'Peaceful',    emoji: '🕊️' },
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
        {subtitle && <p className="text-xs text-white/45 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function BrowsePage() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
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
    // Default is Tracks, not Trending. Trending is a small, slow-moving list
    // dominated by whoever has the longest catalogue, so opening on it makes
    // the platform look like one artist's shop window. ?tab= still overrides.
    // "whatsnew" is a panel, not a tab, so it must never become the landing
    // state even if somebody bookmarks ?tab=whatsnew.
    const t = params.get('tab');
    return (!t || t === 'whatsnew') ? 'tracks' : t;
  });
  const [newsOpen, setNewsOpen] = useState(false);
  // Today's creators, and the posts behind the What's New panel. Six here
  // rather than the home card's three, because this is a page and not a
  // 380px column.
  const { news, trending: cardTrending, creators, loaded: cardLoaded } =
    useHomeCardData({ creatorCount: 6 });
  const [selectedGenre, setSelectedGenre]     = useState('All');
  const [selectedMood, setSelectedMood]       = useState(null);
  const [trending, setTrending]               = useState([]);
  const [featured, setFeatured]               = useState([]);
  const [newReleases, setNewReleases]         = useState([]);
  const [allTracks, setAllTracks]             = useState([]);
  const [artists, setArtists]                 = useState([]);
  const [albums, setAlbums]                   = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [searchResults, setSearchResults]     = useState(null);
  const [recommended, setRecommended]         = useState([]);

  useEffect(() => { fetchAll(); }, [user]);

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


  // Search effect, save history when searching
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
    // whatsnew is a panel, not a tab. A ?tab=whatsnew link opens the panel
    // and leaves the page on whatever tab it was showing.
    if (tab === 'whatsnew') { setNewsOpen(true); return; }
    if (tab) setActiveTab(tab);
  }, [window.location.search]);

  // The Featured board rotates daily (migration 128: a track earns a week on
  // it, and the order changes every day so the same three are not permanently
  // on top). This is the "changes every day" half — the same order for
  // everybody all day, a different one tomorrow, no server call and no random
  // that would reshuffle on every render.
  const dailyOrder = (list) => {
    const day = new Date().toISOString().slice(0, 10);
    const key = (id) => {
      const s = `${id}${day}`;
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };
    return [...list].sort((a, b) => key(a.id) - key(b.id));
  };

  const fetchAll = async () => {
    try {
      const [
        { data: trendingRaw, error: trendingErr },
        { data: featuredRaw, error: featuredErr },
        { data: tracksRaw,   error: tracksErr },
        { data: albumsRaw,   error: albumsErr },
        { data: artistsData, error: artistsErr },
      ] = await Promise.all([
        supabase.from('tracks')
          .select('*, albums(title, cover_artwork_url, price), artists!tracks_artist_id_fkey(id, artist_name, slug, profile_image_url, is_verified, tier)')
          .eq('is_published', true).order('engagement_score', { ascending: false }).limit(50),
        supabase.from('tracks')
          .select('*, albums(title, cover_artwork_url, price), artists!tracks_artist_id_fkey(id, artist_name, slug, profile_image_url, is_verified)')
          .eq('is_published', true).eq('featured', true).order('created_at', { ascending: false }).limit(200),
        supabase.from('tracks')
          .select('*, albums(title, cover_artwork_url, price), artists!tracks_artist_id_fkey(id, artist_name, slug, profile_image_url, is_verified)')
          .eq('is_published', true).order('created_at', { ascending: false }).limit(50),
        supabase.from('albums')
          .select('*, artists(artist_name, slug)')
          .eq('is_published', true).order('release_date', { ascending: false }).limit(50),
        supabase.from('artists')
          .select('id, artist_name, slug, profile_image_url, is_verified, follower_count, display_follower_count, total_streams, tier')
          .order('total_streams', { ascending: false }).limit(50),
      ]);

      // Surface query failures. Destructuring only `data` and dropping
      // `error` turned a hard HTTP 300 (PGRST201, ambiguous artists embed)
      // into a silent empty array: the page rendered "no tracks" with a
      // completely clean console. That cost a day of looking in the wrong
      // place. If these queries ever fail again, we will know immediately.
      [['trending', trendingErr], ['featured', featuredErr], ['tracks', tracksErr],
       ['albums', albumsErr], ['artists', artistsErr]]
        .forEach(([label, err]) => {
          if (err) console.error(`[Browse] ${label} query failed:`, err.code, err.message, err.hint || '');
        });

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
      setFeatured(dailyOrder(norm(featuredRaw)));
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
    finally { setLoading(false); }
  };

  const searchAll = (q) => {
    const lower = q.toLowerCase();
    setSearchResults({
      tracks:  allTracks.filter(t => t.title?.toLowerCase().includes(lower) || t.artist_name?.toLowerCase().includes(lower) || t.genre?.toLowerCase().includes(lower)),
      artists: artists.filter(a => a.artist_name?.toLowerCase().includes(lower)),
      albums:  albums.filter(a => a.title?.toLowerCase().includes(lower) || a.artist_name?.toLowerCase().includes(lower)),
    });
  };

  const filteredTracks = allTracks
    .filter(t => selectedGenre === 'All' || t.genre?.toLowerCase() === selectedGenre.toLowerCase())
    .filter(t => !selectedMood || t.mood?.toLowerCase() === selectedMood.toLowerCase());

  // New Releases, split by shape. Both keep the newest-first order they were
  // merged in; they are just no longer asked to share a grid row. The phone
  // list below still shows them interleaved, because there both are the same
  // shape: a row.
  const newAlbums  = newReleases.filter(i => i._isAlbum);
  const newSingles = newReleases.filter(i => !i._isAlbum);

  const handlePlayTrack = (track, list) => {
    if (currentTrack?.id === track.id) togglePlay();
    else playTrack(track, list);
  };

  // Creators and What's New sit in front, because they are the two things
  // worth seeing before you start digging. Tracks is still where you land
  // (see the activeTab default), and it is still the first thing your eye
  // reaches once you start reading the strip.
  //
  // What's New is not really a tab. Selecting it opens the same panel the
  // home card opens and leaves whatever tab you were on alone, which is why
  // it is flagged here rather than handled with a special case at the click.
  const tabs = [
    { key: 'creators', label: 'Artist Highlight', icon: Sparkles },
    { key: 'whatsnew', label: "What's New", icon: Newspaper, opens: true },
    { key: 'tracks',   label: 'Tracks',   icon: Music },
    { key: 'new',      label: 'New',      icon: Sparkles },
    { key: 'featured', label: 'Featured', icon: Star },
    { key: 'trending', label: 'Trending', icon: Flame },
    { key: 'artists',  label: 'Artists',  icon: Crown },
    { key: 'collabs',  label: 'Collabs',  icon: Users },
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
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <title>Browse · Feelz Machine</title>
        <meta name="description" content="Browse trending tracks, new releases, artists and albums on Feelz Machine." />
        <link rel="canonical" href="https://www.feelzmachine.com/browse" />
        <meta property="og:title" content="Browse · Feelz Machine" />
        <meta property="og:url" content="https://www.feelzmachine.com/browse" />
      </Helmet>

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl pt-14 md:pt-4 pb-3 px-6 md:px-0 border-b border-white/[0.04] md:bg-transparent md:backdrop-blur-none md:border-none">
        {/* Search, pr on mobile reserves space for fixed bell bar (streak+bell+avatar = ~152px incl padding) */}
        <div className="relative mb-3 md:pr-0 pr-[152px]">
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
          {tabs.map(({ key, label, icon: Icon, opens }) => (
            <button key={key} role="tab" aria-selected={!opens && activeTab === key}
              onClick={() => (opens ? setNewsOpen(true) : setActiveTab(key))}
              className={`flex-shrink-0 flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                !opens && activeTab === key ? 'bg-white text-black' : 'text-white/35 hover:text-white/60'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              {/* A quiet dot when there is something to read in there. */}
              {opens && news.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="px-6 md:px-0 pt-5">

        {/* Stories, on a page mobile can actually reach.
            The rail lived only on HomePage, and /home is in the desktop
            sidebar and NOT in the mobile tab bar, so on a phone there was no
            route to it at all. Stories were being uploaded into a screen that
            half the audience could not open. Hidden while searching, because
            a search result page should be search results. */}
        {!searchResults && <div className="-mx-6 md:mx-0 mb-6"><StoriesRail userId={user?.id} /></div>}

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
                          ? <img src={coverUrl(a.profile_image_url, COVER.row)} alt="" className="w-full h-full object-cover" loading="lazy" />
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
            {/* The subtitle used to say "hand-picked by our team", which stopped
                being true with migration 128 — the board earns itself now and
                rotates nightly. Saying so is the point: a board you can be
                picked for is worth working towards, a board somebody's mate
                picks is not. */}
            <SectionLabel icon={Star} title="Featured"
              subtitle="Earned this week by milestones, risers and new releases" />
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
                <p className="text-sm text-white/50">No featured tracks yet</p>
              </div>
            )}
          </div>
        )}

        {/* CREATORS — the same daily picks the home card shows, given room */}
        {activeTab === 'creators' && (
          <div>
            <SectionLabel icon={Sparkles} title="Artist Highlight"
              subtitle="Come back tomorrow for more. Get to know your creators." />
            {creators.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {creators.map(c => <CreatorCard key={c.id} creator={c} />)}
              </div>
            ) : cardLoaded ? (
              <NoCreators />
            ) : (
              <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
            )}
          </div>
        )}

        {/* NEW RELEASES */}
        {activeTab === 'new' && (
          <div>
            <SectionLabel icon={Sparkles} title="New Releases" subtitle="Latest tracks and albums" />
            {newReleases.length > 0 ? (
              <>
                {/* Albums and tracks are laid out SEPARATELY on a computer.
                    They used to share one grid, and they are not the same
                    shape: an album tile is a big square of artwork with a
                    caption under it, a track card is a single short row. CSS
                    grid makes every cell in a row as tall as the tallest one
                    in it, so each track card ended up marooned in the middle
                    of an album-sized box of empty black. Two grids, each with
                    one kind of card in it, and every cell is the height it
                    was meant to be. */}
                {newAlbums.length > 0 && (
                  <div className="hidden md:block mb-7">
                    <p className="mb-3 text-[11px] font-bold tracking-[0.14em] text-white/30 uppercase">
                      Albums and EPs
                    </p>
                    <div className="grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {newAlbums.map(item => (
                        <AlbumTile key={`album-${item.id}`} album={item} navigate={navigate} />
                      ))}
                    </div>
                  </div>
                )}

                {newSingles.length > 0 && (
                  <div className="hidden md:block mb-4">
                    <p className="mb-3 text-[11px] font-bold tracking-[0.14em] text-white/30 uppercase">
                      Singles
                    </p>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {newSingles.map(item => (
                        <TrackCard key={`track-${item.id}`} track={item}
                          currentTrack={currentTrack} isPlaying={isPlaying}
                          onPlay={() => handlePlayTrack(item, newSingles)}
                          onMore={() => setActionSheetTrack(item)}
                          onArtist={() => item.artists?.slug && navigate(`/artist/${item.artists.slug}`)} />
                      ))}
                    </div>
                  </div>
                )}
                <div className="md:hidden space-y-0.5">
                  {newReleases.map((item, i) => item._isAlbum ? (
                    <button key={`album-${item.id}`} onClick={() => navigate(`/album/${item.id}`)}
                      className="w-full flex items-center space-x-3 p-2.5 rounded-xl hover:bg-white/[0.02] transition text-left">
                      <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-white/[0.06]">
                        {item.cover_artwork_url
                          ? <img src={coverUrl(item.cover_artwork_url, COVER.row)} alt="" className="w-full h-full object-cover" loading="lazy" />
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
                <p className="text-sm text-white/50">No releases yet</p>
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
                <p className="text-sm text-white/50">No trending tracks yet</p>
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
                      <div className="relative aspect-square rounded-xl overflow-hidden mb-1.5 bg-white/[0.06]">
                        <PreorderTag track={track} />
                        {track.cover_artwork_url
                          ? <img src={coverUrl(track.cover_artwork_url, COVER.rail)} alt="" loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          : <div className="w-full h-full flex items-center justify-center"><Music className="w-6 h-6 text-white/15" /></div>}
                      </div>
                      <p className="text-sm font-medium text-white truncate">{track.title}</p>
                      <p className="text-xs text-white/55 truncate">{track.artist_name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}



            {/* Genre and mood as the entry point, not a filter strip buried
                under content. Browse is the "help me find X" surface, so the
                way in is picking a genre or a mood. */}
            {/* Pills, not tiles. These were `aspect-[4/3]` cards in a
                six-column grid, so on a wide screen fourteen genres and
                thirteen moods took two full screens of empty boxes and pushed
                the actual music off the bottom of the page. A filter is a
                control, not content: it should cost one line, not a grid. */}
            {/* ONE LINE ON A PHONE, THE LOT ON A DESKTOP.
                Wrapping fourteen genres and thirteen moods is one line on a
                wide screen and most of the screen on a phone: you scroll past
                a wall of filters before you see a single song. So on mobile
                they scroll sideways on one row, and from `sm` up they wrap as
                before. `scrollbar-hide` and no-wrap do the work; nothing is
                hidden and every pill is still reachable. */}
            <p className="section-label mb-2">Genres</p>
            <div className="flex sm:flex-wrap gap-2 mb-5 overflow-x-auto sm:overflow-visible scrollbar-hide -mx-1 px-1">
              {GENRE_TAGS.map(genre => {
                const active = selectedGenre === genre;
                return (
                  <button key={genre} onClick={() => setSelectedGenre(genre)}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition border active:scale-95 ${
                      active
                        ? 'bg-white text-black border-white'
                        : 'bg-white/[0.04] text-white/60 border-white/[0.07] hover:bg-white/[0.08] hover:text-white'
                    }`}>
                    {genre}
                  </button>
                );
              })}
            </div>

            <p className="section-label mb-2">Moods</p>
            <div className="flex sm:flex-wrap gap-2 mb-5 overflow-x-auto sm:overflow-visible scrollbar-hide -mx-1 px-1">
              {MOOD_TAGS.map(({ label, value, emoji }) => {
                const active = selectedMood === value;
                return (
                  <button key={label} onClick={() => setSelectedMood(active ? null : value)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition border active:scale-95 ${
                      active
                        ? 'bg-white text-black border-white'
                        : 'bg-white/[0.04] text-white/60 border-white/[0.07] hover:bg-white/[0.08] hover:text-white'
                    }`}>
                    <span className="text-sm leading-none">{emoji}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {(selectedGenre !== 'All' || selectedMood) && (
              <div className="flex items-center space-x-2 mb-4">
                <p className="text-xs text-white/40">
                  Showing {filteredTracks.length} {filteredTracks.length === 1 ? 'track' : 'tracks'}
                  {selectedGenre !== 'All' && <span className="text-white/70"> in {selectedGenre}</span>}
                  {selectedMood && <span className="text-white/70"> feeling {selectedMood}</span>}
                </p>
                <button onClick={() => { setSelectedGenre('All'); setSelectedMood(null); }}
                  className="text-xs text-white/30 hover:text-white/60 transition underline">Clear</button>
              </div>
            )}
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
                {selectedGenre === 'All' && !selectedMood ? 'No tracks yet' : `No ${selectedMood || selectedGenre} tracks yet`}
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
                    <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-white/[0.06] mb-2">
                      {a.profile_image_url
                        ? <img src={coverUrl(a.profile_image_url, COVER.tile)} alt="" loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-blue-600/20">
                            <span className="text-2xl font-bold text-white/40">{a.artist_name?.[0]}</span>
                          </div>}
                    </div>
                    <div className="flex items-center justify-center space-x-1 mb-0.5">
                      <p className="text-sm font-medium text-white truncate">{a.artist_name}</p>
                      {a.is_verified && <VerifiedBadge size="sm" />}
                    </div>
                    <p className="text-[10px] text-white/25">{formatNumber(a.display_follower_count ?? a.follower_count)} followers</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-white/20 text-sm py-12">No artists yet</p>
            )}
          </div>
        )}

        {/* ALBUMS */}
        {activeTab === 'collabs' && (
          <div>
            <SectionLabel icon={Users} title="Collaborations" subtitle="Tracks made by more than one artist" />
            <CollabGrid limit={48} />
          </div>
        )}

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

      {/* The same panel the home card opens. Selecting What's New in the tab
          strip opens this and leaves the tab you were reading alone. */}
      {newsOpen && (
        <NewsOverlay
          news={news}
          trending={cardTrending}
          loaded={cardLoaded}
          isAdmin={isAdmin}
          onClose={() => setNewsOpen(false)}
          onPlay={(t) => handlePlayTrack(t, cardTrending.filter(x => x?.file_url))}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
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
          ? <img src={coverUrl(track.cover_artwork_url, COVER.row)} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5 text-white/15" /></div>}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          {isTrackPlaying ? <Pause className="w-4 h-4 text-white" fill="white" /> : <Play className="w-4 h-4 text-white" fill="white" />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-1">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-purple-400' : 'text-white'}`}>{track.title}</p>
          <PreorderTag track={track} variant="inline" />
          {(() => {
            const aiEffective = track.ai_content_admin_override || track.ai_content;
            if (!aiEffective || aiEffective === 'human') return null;
            return <span className="text-[8px] font-bold px-1 py-0.5 bg-purple-500/20 text-purple-300 rounded flex-shrink-0">AI</span>;
          })()}
        </div>
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
          ? <img src={coverUrl(track.cover_artwork_url, COVER.row)} alt="" className="w-full h-full object-cover" loading="lazy" />
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
        <div className="flex items-center gap-1.5 min-w-0">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-purple-400' : 'text-white'}`}>{track.title}</p>
          <PreorderTag track={track} variant="inline" />
        </div>
        <button onClick={(e) => { e.stopPropagation(); onArtist(); }} className="flex items-center space-x-1">
          <span className="text-xs text-white/40 truncate hover:text-white/60 transition">{track.artist_name}</span>
          {track.artists?.is_verified && <VerifiedBadge size="xs" />}
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
          ? <img src={coverUrl(track.cover_artwork_url, COVER.row)} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-blue-900/20"><Music className="w-4 h-4 text-white/15" /></div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-purple-400' : 'text-white'}`}>{track.title}</p>
        <div className="flex items-center space-x-1.5">
          <PreorderTag track={track} variant="inline" />
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
      <div className="relative aspect-square rounded-xl overflow-hidden bg-white/[0.06] mb-2">
        {album.cover_artwork_url
          ? <img src={coverUrl(album.cover_artwork_url, COVER.tile)} alt="" loading="lazy"
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