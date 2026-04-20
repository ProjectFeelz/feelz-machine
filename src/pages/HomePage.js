import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useStreakContext } from '../contexts/StreakContext';
import { usePlayer } from '../contexts/PlayerContext';
import { Flame, Play, Pause, Music, Verified, MoreHorizontal, Disc, Sparkles, Users, Trophy, Compass, Headphones, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TrackActionSheet from '../components/TrackActionSheet';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import { HomeSkeleton } from '../components/SkeletonLoader';
import WrappedCard from '../components/WrappedCard';
import OnThisDay from '../components/OnThisDay';

function getArtistLimit(totalArtists) {
  if (totalArtists < 10) return 3;
  if (totalArtists < 50) return 2;
  return 1;
}

function limitPerArtist(items, totalArtists) {
  const max = getArtistLimit(totalArtists);
  const counts = {};
  return items.filter(item => {
    const key = item.artist_slug || item.artist_name || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts[key] <= max;
  });
}

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
          {Icon && <Icon className="w-3.5 h-3.5 text-white/30" />}
          <span className="section-label">{title}</span>
        </div>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-[10px] text-white/25 hover:text-white/50 transition uppercase tracking-wider font-semibold">
            See All →
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function NewReleaseBadge() {
  return (
    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase bg-purple-600/90 text-white backdrop-blur z-10">
      NEW
    </span>
  );
}

function ReleaseDateBadge({ dateStr }) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays > 30) return null;
  const label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays}d ago`;
  return (
    <span className="text-[9px] text-white/30 mt-0.5 block">{label}</span>
  );
}

function SquareCard({ item, itemList = [], isAlbum = false, showNew = false, onPlay, onMore, currentTrack, isPlaying }) {
  const navigate = useNavigate();
  const [imgLoaded, setImgLoaded] = useState(false);
  const isActive         = !isAlbum && currentTrack?.id === item.id;
  const isCurrentPlaying = isActive && isPlaying;

  return (
    <div className="flex-shrink-0 w-40 md:w-52 cursor-pointer group relative">
      <div
        className="aspect-square rounded-xl overflow-hidden bg-white/[0.06] mb-2 relative"
        onClick={() => isAlbum ? navigate(`/album/${item.slug || item.id}`) : onPlay(item, itemList)}
      >
        {item.cover_artwork_url ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 bg-white/[0.06]">
                <div className="absolute inset-0" style={{
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
                  animation: 'skeleton-shimmer 1.4s infinite',
                }} />
              </div>
            )}
            <img
              src={item.cover_artwork_url}
              alt={item.title ? item.title.trim() : ''}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
            {isAlbum ? <Disc className="w-8 h-8 text-white/20" /> : <Music className="w-8 h-8 text-white/20" />}
          </div>
        )}

        <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition rounded-xl ${
          isCurrentPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            {isCurrentPlaying
              ? <Pause className="w-5 h-5 text-white" />
              : <Play className="w-5 h-5 text-white ml-0.5" />}
          </div>
        </div>

        {isAlbum && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-white/60 backdrop-blur">
            {item.release_type?.toUpperCase() || 'ALBUM'}
          </div>
        )}
        {showNew && !isAlbum && <NewReleaseBadge />}

        <button
          onClick={(e) => { e.stopPropagation(); onMore(item); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
          aria-label={`More options for ${item.title}`}
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
      {showNew && <ReleaseDateBadge dateStr={item._date || item.created_at} />}
    </div>
  );
}

export default function HomePage() {
  const { user, artist } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay, replaceQueue } = usePlayer();
  const { discoveryStreak, recordDiscovery } = useStreakContext();
  const navigate = useNavigate();

  const [featuredTracks, setFeaturedTracks]         = useState([]);
  const [newReleases, setNewReleases]               = useState([]);
  const [newAlbums, setNewAlbums]                   = useState([]);
  const [trending, setTrending]                     = useState([]);
  const [topArtists, setTopArtists]                 = useState([]);
  const [recommended, setRecommended]               = useState([]);
  const [followedReleases, setFollowedReleases]     = useState([]);
  const [loading, setLoading]                       = useState(true);
  const [actionSheetTrack, setActionSheetTrack]     = useState(null);
  const [activeCompetitions, setActiveCompetitions] = useState([]);
  const [wrappedNotif, setWrappedNotif]             = useState(null);
  const [spotlightArtist, setSpotlightArtist]       = useState(null);
  const [unheardTracks, setUnheardTracks]           = useState([]);
  const [weeklyDiscoveries, setWeeklyDiscoveries]   = useState(0);
  const [liveSessions, setLiveSessions]             = useState([]);

  const fetchData = async () => {
    setLoading(true);
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
          .eq('is_published', true).order('created_at', { ascending: false }).limit(8),
        supabase.from('albums')
          .select('*, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true).order('created_at', { ascending: false }).limit(10),
        supabase.from('tracks')
          .select('*, albums(title, cover_artwork_url, price), artists(artist_name, slug, profile_image_url, is_verified, tier)')
          .eq('is_published', true).order('engagement_score', { ascending: false }).limit(20),
        supabase.from('artists')
          .select('id, artist_name, slug, profile_image_url, is_verified, follower_count, total_streams, tier')
          .not('profile_image_url', 'is', null)
          .neq('profile_image_url', '')
          .order('follower_count', { ascending: false }).limit(10),
      ]);

      const normTrack = (list) => (list || []).map(t => ({
        ...t, artist_name: t.artists?.artist_name || 'Unknown Artist',
        artist_slug: t.artists?.slug || t.artist_slug || null,
      }));
      const normAlbum = (list) => (list || []).map(a => ({
        ...a, artist_name: a.artists?.artist_name || 'Unknown Artist',
        artist_slug: a.artists?.slug || null, _isAlbum: true,
      }));

      // Albums get their own dedicated row — no longer merged with singles
      const albumList = normAlbum(recentAlbums);

      // New Releases = tracks only, sorted by date
      const trackList = normTrack(recentTracks)
        .map(t => ({ ...t, _isAlbum: false, _date: t.created_at }))
        .sort((a, b) => new Date(b._date) - new Date(a._date))
        .slice(0, 10);

      const trendingBoosted = (trendingRaw || [])
        .map(t => ({
          ...t, artist_name: t.artists?.artist_name || 'Unknown Artist',
          artist_slug: t.artists?.slug || t.artist_slug || null,
          _boosted: (t.engagement_score || 0) * (
            t.artists?.tier === 'premium' ? 1.5 : t.artists?.tier === 'pro' ? 1.2 : 1
          ),
        }))
        .sort((a, b) => b._boosted - a._boosted).slice(0, 8);

      const artistCount = (artists || []).length;
      setFeaturedTracks(limitPerArtist(normTrack(featured), artistCount));
      setNewReleases(limitPerArtist(trackList, artistCount));
      setNewAlbums(limitPerArtist(albumList, artistCount));
      setTrending(limitPerArtist(trendingBoosted, artistCount));
      setTopArtists(artists || []);

      if (user) {
        await Promise.all([fetchRecommendations(), fetchFollowedReleases(), fetchCompetitions(), fetchWrapped(), fetchLiveSessions()]);
      } else {
        await Promise.all([fetchCompetitions(), fetchLiveSessions()]);
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLiveSessions = async () => {
    try {
      const { data: sessions, error: sessErr } = await supabase
        .from('listening_sessions')
        .select('id, title, artist_id')
        .eq('status', 'live')
        .limit(8);

      // RLS policy may block the query — fail silently so the rest of the page loads
      if (sessErr) {
        console.warn('Live sessions unavailable:', sessErr.message);
        setLiveSessions([]);
        return;
      }

      if (!sessions || sessions.length === 0) { setLiveSessions([]); return; }

      // Enrich with artist data via separate query (avoids FK join 400 error)
      const artistIds = [...new Set(sessions.map(s => s.artist_id).filter(Boolean))];
      const { data: artists } = await supabase
        .from('artists')
        .select('id, artist_name, slug, profile_image_url')
        .in('id', artistIds);

      const artistMap = Object.fromEntries((artists || []).map(a => [a.id, a]));
      setLiveSessions(sessions.map(s => ({
        ...s,
        artist_name:  artistMap[s.artist_id]?.artist_name  || 'Unknown Artist',
        artist_slug:  artistMap[s.artist_id]?.slug         || null,
        artist_image: artistMap[s.artist_id]?.profile_image_url || null,
      })));
    } catch (err) { console.error('Live sessions fetch error:', err); }
  };

  const fetchCompetitions = async () => {
    try {
      const { data } = await supabase
        .from('competitions')
        .select('id, title, status, brief, prize_description, entries_close_at, voting_close_at')
        .in('status', ['open', 'voting'])
        .order('created_at', { ascending: false })
        .limit(2);
      setActiveCompetitions(data || []);
    } catch (err) { console.error('Competitions fetch error:', err); }
  };

  const fetchWrapped = async () => {
    if (!user) return;
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data } = await supabase
        .from('notifications')
        .select('id, title, message, created_at')
        .eq('user_id', user.id)
        .eq('type', 'monthly_wrapped')
        .gte('created_at', startOfMonth)
        .order('created_at', { ascending: false })
        .limit(1);
      if (data?.length > 0) setWrappedNotif(data[0]);
    } catch (err) { console.error('Wrapped fetch error:', err); }
  };

  const fetchFollowedReleases = async () => {
    try {
      // Get artist IDs the user follows
      const { data: follows } = await supabase
        .from('follows').select('artist_id').eq('follower_id', user.id);
      if (!follows?.length) return;

      const artistIds = follows.map(f => f.artist_id);

      // Get recent tracks from those artists
      const { data: tracks } = await supabase
        .from('tracks')
        .select('*, artists(artist_name, slug, profile_image_url)')
        .eq('is_published', true)
        .in('artist_id', artistIds)
        .order('created_at', { ascending: false })
        .limit(12);

      setFollowedReleases(limitPerArtist((tracks || []).map(t => ({
        ...t,
        artist_name: t.artists?.artist_name || 'Unknown Artist',
        artist_slug: t.artists?.slug || null,
      })), topArtists.length));
    } catch (err) { console.error('Followed releases error:', err); }
  };

  const fetchRecommendations = async () => {
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
          .from('user_profiles').select('genre_preferences').eq('user_id', user.id).maybeSingle();
        genreTags = prefData?.genre_preferences || [];
      }
      if (genreTags.length === 0) return;
      const orFilter = genreTags.map(t => `genre.eq.${t},mood.eq.${t}`).join(',');
      let query = supabase.from('tracks')
        .select('*, artists(artist_name, slug, profile_image_url)')
        .eq('is_published', true).or(orFilter)
        .order('engagement_score', { ascending: false }).limit(10);
      if (listenedIds.length > 0) query = query.not('id', 'in', `(${listenedIds.join(',')})`);
      const { data: recData } = await query;
      setRecommended(limitPerArtist((recData || []).map(t => ({
        ...t, artist_name: t.artists?.artist_name || 'Unknown Artist',
        artist_slug: t.artists?.slug || null,
      })), topArtists.length));
    } catch (err) { console.error('Recommendations error:', err); }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  // ── Fetch daily spotlight artist ──────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const fetchSpotlight = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('daily_artist_spotlight')
        .select('artist_id, artists(id, artist_name, slug, profile_image_url, total_streams, follower_count, is_verified)')
        .eq('user_id', user.id)
        .eq('spotlight_date', today)
        .maybeSingle();
      if (data?.artists) setSpotlightArtist(data.artists);
    };
    fetchSpotlight();
  }, [user]);

  // ── Fetch "You haven't heard this yet" tracks ────────────────────────────
  useEffect(() => {
    if (!user) return;
    const fetchUnheard = async () => {
      try {
        const { data: streamData } = await supabase
          .from('streams').select('track_id').eq('user_id', user.id).limit(500);
        const heardIds = (streamData || []).map(s => s.track_id).filter(Boolean);

        let query = supabase
          .from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .order('engagement_score', { ascending: false })
          .limit(heardIds.length > 0 ? 20 : 10);

        if (heardIds.length > 0) {
          query = query.not('id', 'in', `(${heardIds.join(',')})`);
        }

        const { data } = await query;
        setUnheardTracks((data || []).slice(0, 10).map(t => ({
          ...t,
          artist_name: t.artists?.artist_name || 'Unknown Artist',
          artist_slug: t.artists?.slug || null,
        })));
      } catch (err) { console.error('Unheard fetch error:', err); }
    };
    fetchUnheard();
  }, [user]);

  // ── Smart radio queue ─────────────────────────────────────────────────────
  // When a track is tapped on the Home page we build a "radio" queue of similar
  // tracks (matching genre or mood) instead of using the raw section list.
  // This lets listeners press play once and keep listening without interaction.
  const buildRadioQueue = async (track) => {
    try {
      const filters = [];
      if (track.genre) filters.push(`genre.eq.${track.genre}`);
      if (track.mood)  filters.push(`mood.eq.${track.mood}`);

      // Fall back to engagement-sorted tracks if no genre/mood metadata
      if (filters.length === 0) {
        const { data } = await supabase
          .from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .neq('id', track.id)
          .order('engagement_score', { ascending: false })
          .limit(20);
        return normaliseTracks(data, track);
      }

      const { data } = await supabase
        .from('tracks')
        .select('*, artists(artist_name, slug, profile_image_url)')
        .eq('is_published', true)
        .neq('id', track.id)
        .or(filters.join(','))
        .order('engagement_score', { ascending: false })
        .limit(20);

      // If fewer than 3 similar tracks, pad with top engagement tracks
      if (!data || data.length < 3) {
        const existingIds = (data || []).map(t => t.id).concat(track.id);
        const { data: padData } = await supabase
          .from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .not('id', 'in', `(${existingIds.join(',')})`)
          .order('engagement_score', { ascending: false })
          .limit(20 - (data?.length || 0));
        return normaliseTracks([...(data || []), ...(padData || [])], track);
      }

      return normaliseTracks(data, track);
    } catch (err) {
      console.error('Radio queue error:', err);
      return [track];
    }
  };

  const normaliseTracks = (list, seedTrack) => {
    const normalised = (list || []).map(t => ({
      ...t,
      artist_name: t.artists?.artist_name || t.artist_name || 'Unknown Artist',
      artist_slug: t.artists?.slug || t.artist_slug || null,
    }));
    // Seed track always plays first
    return [seedTrack, ...normalised.filter(t => t.id !== seedTrack.id)];
  };

  const handlePlay = async (track, _list) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    // Start playback immediately with a single-track queue as a placeholder,
    // then patch the queue once the async radio fetch resolves — without
    // calling playTrack a second time (which would hit the same-track guard
    // and toggle pause instead of updating the queue).
    playTrack(track, [track]);
    const radioQueue = await buildRadioQueue(track);
    const idx = radioQueue.findIndex(t => t.id === track.id);
    replaceQueue(radioQueue, idx >= 0 ? idx : 0);

    // Check if this is a new artist for the user — if so, record discovery
    if (user && track.artist_id) {
      try {
        const { data: prior } = await supabase
          .from('streams')
          .select('id')
          .eq('user_id', user.id)
          .eq('track_id', track.id)
          .limit(1);
        // No prior streams of ANY track by this artist = new discovery
        const { data: artistPrior } = await supabase
          .from('streams')
          .select('tracks!inner(artist_id)')
          .eq('user_id', user.id)
          .eq('tracks.artist_id', track.artist_id)
          .limit(1);
        if (!artistPrior?.length) recordDiscovery(track.artist_id);
      } catch {}
    }
  };

  const handleMore = (item) => {
    if (item._isAlbum) return;
    setActionSheetTrack(item);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const { pullProps, pullProgress, isRefreshing } = usePullToRefresh(fetchData);

  if (loading) return <HomeSkeleton />;

  return (
    <div className="pb-4 scroll-page" {...pullProps}>
      <Helmet>
        <title>Home · Feelz Machine</title>
        <meta name="description" content="Discover independent music, trending tracks and artists on Feelz Machine." />
        <link rel="canonical" href="https://www.feelzmachine.com/" />
        <meta property="og:title" content="Home · Feelz Machine" />
        <meta property="og:url" content="https://www.feelzmachine.com/" />
      </Helmet>

      <PullToRefreshIndicator pullProgress={pullProgress} isRefreshing={isRefreshing} />

      <div className="greeting-hero px-6 pt-14 md:pt-6 pb-6 border-b border-white/[0.05] mb-6">
        <div className="flex items-center justify-between mb-1">
          <p className="section-label">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          {user && discoveryStreak > 1 && (
            <div className="flex items-center space-x-1 px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
              <Compass className="w-3 h-3 text-blue-400" />
              <span className="text-xs font-bold text-blue-400">{discoveryStreak}</span>
            </div>
          )}
        </div>
        <h1 className="text-2xl font-bold text-white">
          {user ? greeting() : 'Feelz Machine'}
        </h1>
        <p className="text-sm text-white/40 mt-1">
          {user ? `Welcome back${artist ? ', ' + artist.artist_name : ''}` : 'Discover music from independent artists'}
        </p>
      </div>

      {/* Monthly Wrapped card */}
      {wrappedNotif && (
        <div className="mx-6 mb-6">
          <WrappedCard notification={wrappedNotif} compact />
        </div>
      )}

      {/* On This Day — resurface a track from exactly 1 year ago */}
      <OnThisDay user={user} />

      {/* Active Competitions banner */}
      {activeCompetitions.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3 px-6">
            <div className="flex items-center space-x-2">
              <Trophy className="w-3.5 h-3.5 text-yellow-400/60" />
              <span className="section-label">Competitions</span>
            </div>
            <button onClick={() => navigate('/chat')} className="text-[10px] text-white/25 hover:text-white/50 transition uppercase tracking-wider font-semibold">See All →</button>
          </div>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {activeCompetitions.map(comp => (
              <button
                key={comp.id}
                onClick={() => navigate(`/competition/${comp.id}`)}
                className="flex-shrink-0 w-56 p-4 rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/10 to-transparent text-left hover:border-yellow-500/35 transition"
              >
                <div className="w-9 h-9 rounded-xl bg-yellow-500/15 flex items-center justify-center mb-3">
                  <Trophy className="w-4.5 h-4.5 text-yellow-400" />
                </div>
                <p className="text-sm font-semibold text-white truncate mb-1">{comp.title}</p>
                {comp.brief && <p className="text-xs text-white/35 truncate mb-2">{comp.brief}</p>}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${comp.status === 'voting' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                  {comp.status === 'voting' ? 'Vote Now' : 'Enter Now'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Artist of the Day — one undiscovered artist picked for this user */}
      {user && spotlightArtist && (
        <div className="mx-6 mb-6">
          <div className="flex items-center space-x-2 mb-3">
            <Compass className="w-3.5 h-3.5 text-blue-400/60" />
            <span className="section-label">Artist of the Day</span>
          </div>
          <button
            onClick={() => navigate(`/artist/${spotlightArtist.slug}`)}
            className="w-full flex items-center space-x-4 p-4 rounded-2xl border border-blue-500/15 bg-gradient-to-r from-blue-500/8 to-transparent hover:border-blue-500/25 transition group"
          >
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/[0.06] flex-shrink-0">
              {spotlightArtist.profile_image_url
                ? <img src={spotlightArtist.profile_image_url} alt={spotlightArtist.artist_name || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                : <div className="w-full h-full flex items-center justify-center"><Music className="w-6 h-6 text-white/20" /></div>
              }
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center space-x-1.5 mb-0.5">
                <p className="text-base font-semibold text-white truncate">{spotlightArtist.artist_name}</p>
                {spotlightArtist.is_verified && <Verified className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
              </div>
              <p className="text-xs text-white/35">
                {spotlightArtist.total_streams > 0
                  ? `${formatNumber(spotlightArtist.total_streams)} streams · You haven't heard them yet`
                  : 'An artist worth discovering'}
              </p>
              <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                Discover →
              </span>
            </div>
          </button>
        </div>
      )}

      {/* You haven't heard this yet */}
      {user && unheardTracks.length > 0 && (
        <Section title="You Haven't Heard This Yet" icon={Headphones}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {unheardTracks.map(track => (
              <SquareCard key={track.id} item={track} itemList={unheardTracks}
                onPlay={handlePlay} onMore={handleMore}
                currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* 🔴 Live Now — artists currently streaming */}
      {liveSessions.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3 px-6">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="section-label text-red-400">Live Now</span>
            </div>
          </div>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {liveSessions.map(session => (
              <button
                key={session.id}
                onClick={() => navigate(`/session/${session.id}`)}
                className="flex-shrink-0 w-40 md:w-52 text-left group"
              >
                <div className="relative aspect-square rounded-xl overflow-hidden bg-white/[0.06] mb-2">
                  {session.artist_image
                    ? <img src={session.artist_image} alt={session.artist_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center"><Radio className="w-8 h-8 text-white/20" /></div>
                  }
                  {/* Red live badge overlay */}
                  <div className="absolute inset-0 bg-red-500/10 rounded-xl" />
                  <div className="absolute top-2 left-2 flex items-center space-x-1 px-2 py-0.5 rounded-full bg-red-500/90 backdrop-blur">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                    </span>
                    <span className="text-[9px] font-bold text-white uppercase tracking-widest">Live</span>
                  </div>
                </div>
                <p className="text-sm font-medium text-white truncate">{session.artist_name}</p>
                {session.title && (
                  <p className="text-xs text-white/40 truncate mt-0.5">{session.title}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trending — highest social proof, works for every visitor */}
      {trending.length > 0 && (
        <Section title="Trending" icon={Flame} onSeeAll={() => navigate('/browse?tab=trending')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {trending.map(track => (
              <SquareCard key={track.id} item={track} itemList={trending}
                onPlay={handlePlay} onMore={handleMore}
                currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* New Releases — tracks only, with NEW badge + date */}
      {newReleases.length > 0 && (
        <Section title="New Singles" onSeeAll={() => navigate('/browse?tab=new')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {newReleases.map(item => (
              <SquareCard
                key={`track-${item.id}`}
                item={item} itemList={newReleases}
                isAlbum={false} showNew onPlay={handlePlay} onMore={handleMore}
                currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* Albums — dedicated row so they don't drown in singles */}
      {newAlbums.length > 0 && (
        <Section title="Albums & EPs" onSeeAll={() => navigate('/browse?tab=new')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {newAlbums.map(album => (
              <SquareCard
                key={`album-${album.id}`}
                item={album} itemList={[]}
                isAlbum showNew={false} onPlay={handlePlay} onMore={handleMore}
                currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* From artists you follow — personal pull, logged-in users only */}
      {followedReleases.length > 0 && (
        <Section title="From Artists You Follow" icon={Users} onSeeAll={() => navigate('/browse?tab=new')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {followedReleases.map(track => (
              <SquareCard key={track.id} item={track} itemList={followedReleases}
                onPlay={handlePlay} onMore={handleMore}
                currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* Recommended */}
      {recommended.length > 0 && (
        <Section title="Recommended For You" icon={Sparkles} onSeeAll={() => navigate('/browse?tab=tracks')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {recommended.map(track => (
              <SquareCard key={track.id} item={track} itemList={recommended}
                onPlay={handlePlay} onMore={handleMore}
                currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* Featured */}
      {featuredTracks.length > 0 && (
        <Section title="Featured">
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {featuredTracks.map(track => (
              <SquareCard key={track.id} item={track} itemList={featuredTracks}
                onPlay={handlePlay} onMore={handleMore}
                currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* Artists to Follow */}
      {topArtists.length > 0 && (
        <Section title="Artists to Follow" onSeeAll={() => navigate('/browse?tab=artists')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {topArtists.map(a => (
              <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
                className="flex-shrink-0 w-40 md:w-52 text-center group">
                <div className="w-40 h-40 md:w-52 md:h-52 rounded-full overflow-hidden bg-white/[0.06] mb-2 mx-auto">
                  <img src={a.profile_image_url} alt={a.artist_name || ''}
                    loading="lazy" decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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

      {actionSheetTrack && (
        <TrackActionSheet
          track={actionSheetTrack}
          artist={{ artist_name: actionSheetTrack.artist_name, slug: actionSheetTrack.artist_slug }}
          onClose={() => setActionSheetTrack(null)}
        />
      )}

      <style>{`
        @keyframes skeleton-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}