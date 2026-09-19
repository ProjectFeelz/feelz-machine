import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useStreakContext } from '../contexts/StreakContext';
import { usePlayer } from '../contexts/PlayerContext';
import PreorderTag from '../components/PreorderTag';
import { Flame, Play, Pause, Music, MoreHorizontal, Disc, Sparkles, Users, Trophy, Compass, Headphones, Radio, Zap, ListMusic } from 'lucide-react';
import VerifiedBadge from '../components/VerifiedBadge';
import { useNavigate } from 'react-router-dom';
import TrackActionSheet from '../components/TrackActionSheet';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import { HomeSkeleton } from '../components/SkeletonLoader';
import { StoriesRail } from '../components/ArtistStories';
import { CollabRail } from '../components/CollaborationsSpotlight';
import WrappedCard from '../components/WrappedCard';
import OnThisDay from '../components/OnThisDay';

function getArtistLimit(totalArtists) {
  if (totalArtists < 10) return 3;
  if (totalArtists < 50) return 2;
  return 1;
}

// How many cards a horizontal row tries to show before it stops looking thin.
const ROW_TARGET = 12;

// Artists of the Day. Must match SPOTLIGHT_PER_DAY in
// netlify/functions/daily-spotlight.js.
const SPOTLIGHT_PER_DAY = 3;

/**
 * Spread a row across artists WITHOUT letting it go half empty.
 *
 * The old limitPerArtist() was a plain filter, and every caller sliced the
 * list to its display length BEFORE filtering. So a row that fetched 8 tracks
 * and capped 2 per artist showed 4 cards when 3 artists had uploaded that
 * week. That is the empty-looking home page: the catalogue was there, the
 * filter threw it away and nothing backfilled.
 *
 * Now: first pass takes up to `max` per artist in the order given, which is
 * the diversity rule unchanged. If that leaves the row short of `target`, a
 * second pass adds the overflow back round robin, one per artist per lap, so
 * the row fills from the widest spread available instead of stopping.
 */
function diversify(items, totalArtists, target = ROW_TARGET) {
  const max   = getArtistLimit(totalArtists);
  const keyOf = (i) => i.artist_slug || i.artist_name || 'unknown';

  const counts = {};
  const picked = [];
  const overflowByArtist = {};

  for (const item of items || []) {
    const k = keyOf(item);
    counts[k] = (counts[k] || 0) + 1;
    if (counts[k] <= max) picked.push(item);
    else (overflowByArtist[k] = overflowByArtist[k] || []).push(item);
  }

  if (picked.length >= target) return picked.slice(0, target);

  const queues = Object.values(overflowByArtist);
  let addedThisLap = true;
  while (picked.length < target && addedThisLap) {
    addedThisLap = false;
    for (const q of queues) {
      if (!q.length) continue;
      picked.push(q.shift());
      addedThisLap = true;
      if (picked.length >= target) break;
    }
  }
  return picked.slice(0, target);
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function Section({ title, icon: Icon, onSeeAll, children, gradient }) {
  const gradients = {
    amber:  { bg: 'linear-gradient(135deg, rgba(120,53,15,0.18) 0%, rgba(30,20,10,0.4) 60%, transparent 100%)', border: '1px solid rgba(245,158,11,0.12)' },
    purple: { bg: 'linear-gradient(135deg, rgba(88,28,135,0.18) 0%, rgba(30,27,75,0.35) 60%, transparent 100%)', border: '1px solid rgba(139,92,246,0.15)' },
    teal:   { bg: 'linear-gradient(135deg, rgba(13,148,136,0.15) 0%, rgba(10,30,30,0.4) 60%, transparent 100%)', border: '1px solid rgba(20,184,166,0.15)' },
    rose:   { bg: 'linear-gradient(135deg, rgba(136,19,55,0.18) 0%, rgba(30,10,20,0.4) 60%, transparent 100%)', border: '1px solid rgba(244,63,94,0.15)' },
  };
  const g = gradients[gradient];
  return (
    <div className="mb-8" style={g ? { borderRadius: 0, padding: '20px 0', background: g.bg, borderTop: g.border, borderBottom: g.border } : {}}>
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
        {/* One placement covers every rail on this page — Featured, New,
            Trending and the rest all render through this card. */}
        {!isAlbum && <PreorderTag track={item} />}
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

const HERO_ACCENTS = {
  lime:   { text: '#C6FF3D', bg: 'linear-gradient(135deg, rgba(198,255,61,0.20) 0%, rgba(20,30,10,0.95) 100%)' },
  purple: { text: '#A78BFA', bg: 'linear-gradient(135deg, rgba(167,139,250,0.22) 0%, rgba(25,15,45,0.95) 100%)' },
  amber:  { text: '#FBBF24', bg: 'linear-gradient(135deg, rgba(251,191,36,0.20) 0%, rgba(40,25,5,0.95) 100%)' },
  rose:   { text: '#FB7185', bg: 'linear-gradient(135deg, rgba(251,113,133,0.20) 0%, rgba(45,12,20,0.95) 100%)' },
};

export default function HomePage() {
  const { user, artist } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay, replaceQueue } = usePlayer();
  const { discoveryStreak, recordDiscovery } = useStreakContext();
  const navigate = useNavigate();

  const [newReleases, setNewReleases]               = useState([]);
  const [newAlbums, setNewAlbums]                   = useState([]);
  const [trending, setTrending]                     = useState([]);
  const [topArtists, setTopArtists]                 = useState([]);
  const [recommended, setRecommended]               = useState([]);
  const [featuredPlaylists, setFeaturedPlaylists]   = useState([]);
  const [hero, setHero]                             = useState(null);
  const [libraryPeek, setLibraryPeek]               = useState([]);
  const [followedReleases, setFollowedReleases]     = useState([]);
  const [loading, setLoading]                       = useState(true);
  const [actionSheetTrack, setActionSheetTrack]     = useState(null);
  const [activeCompetitions, setActiveCompetitions] = useState([]);
  const [wrappedNotif, setWrappedNotif]             = useState(null);
  const [spotlightArtists, setSpotlightArtists]     = useState([]);
  const [unheardTracks, setUnheardTracks]           = useState([]);
  const [weeklyDiscoveries, setWeeklyDiscoveries]   = useState(0);
  const [liveSessions, setLiveSessions]             = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Pools are deliberately deeper than the rows that display them. The
      // per-artist spread is applied to the pool and THEN cut to length, so a
      // row only runs short when the catalogue genuinely is.
      const [
        { data: recentTracks },
        { data: recentAlbums },
        { data: trendingRaw },
        { data: artists },
        { count: publishedArtistCount },
      ] = await Promise.all([
        supabase.from('tracks')
          .select('*, albums(title, cover_artwork_url, price), artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
          .eq('is_published', true).order('created_at', { ascending: false }).limit(60),
        supabase.from('albums')
          .select('*, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true).order('created_at', { ascending: false }).limit(40),
        supabase.from('tracks')
          .select('*, albums(title, cover_artwork_url, price), artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url, is_verified, tier)')
          .eq('is_published', true).order('engagement_score', { ascending: false }).limit(60),
        supabase.from('artists')
          .select('id, artist_name, slug, profile_image_url, is_verified, follower_count, total_streams, tier')
          .not('profile_image_url', 'is', null)
          .neq('profile_image_url', '')
          .order('follower_count', { ascending: false }).limit(24),
        // The tuning number for the spread. It used to be the LENGTH of the
        // query above, which is capped at 24, so a 200 artist platform was
        // being tuned as if it had 24 artists.
        supabase.from('artists')
          .select('id', { count: 'exact', head: true })
          .not('profile_image_url', 'is', null)
          .neq('profile_image_url', ''),
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

      // New Releases = tracks only, sorted by date. No slice here: diversify()
      // does the cutting, after the spread, so the row reaches its length.
      const trackList = normTrack(recentTracks)
        .map(t => ({ ...t, _isAlbum: false, _date: t.created_at }))
        .sort((a, b) => new Date(b._date) - new Date(a._date));

      const trendingBoosted = (trendingRaw || [])
        .map(t => ({
          ...t, artist_name: t.artists?.artist_name || 'Unknown Artist',
          artist_slug: t.artists?.slug || t.artist_slug || null,
          _boosted: (t.engagement_score || 0) * (
            t.artists?.tier === 'premium' ? 1.5 : t.artists?.tier === 'pro' ? 1.2 : 1
          ),
        }))
        .sort((a, b) => b._boosted - a._boosted);

      const artistCount = publishedArtistCount || (artists || []).length;
      setNewReleases(diversify(trackList, artistCount));
      setNewAlbums(diversify(albumList, artistCount));
      setTrending(diversify(trendingBoosted, artistCount));
      setTopArtists(artists || []);

      // artistCount is passed down rather than read off topArtists state. The
      // setter above has not applied yet inside this function, so the old code
      // read [] here and tuned every personalised row as a zero artist site.
      if (user) {
        await Promise.all([
          fetchRecommendations(artistCount),
          fetchFollowedReleases(artistCount),
          fetchCompetitions(), fetchWrapped(), fetchLiveSessions(), fetchFeaturedPlaylists(),
        ]);
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
        .select('id, title, status, brief, prize_description, entries_close_at, voting_close_at, wheel_challenge, paid_collab')
        .in('status', ['open', 'voting'])
        .order('created_at', { ascending: false })
        .limit(4);
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

  const fetchFollowedReleases = async (artistCount = 0) => {
    try {
      // Get artist IDs the user follows
      const { data: follows } = await supabase
        .from('follows').select('artist_id').eq('follower_id', user.id);
      if (!follows?.length) return;

      const artistIds = follows.map(f => f.artist_id);

      // Get recent tracks from those artists
      const { data: tracks } = await supabase
        .from('tracks')
        .select('*, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
        .eq('is_published', true)
        .in('artist_id', artistIds)
        .order('created_at', { ascending: false })
        .limit(48);

      setFollowedReleases(diversify((tracks || []).map(t => ({
        ...t,
        artist_name: t.artists?.artist_name || 'Unknown Artist',
        artist_slug: t.artists?.slug || null,
      })), artistCount));
    } catch (err) { console.error('Followed releases error:', err); }
  };

  const fetchRecommendations = async (artistCount = 0) => {
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
        .select('*, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
        .eq('is_published', true).or(orFilter)
        .order('engagement_score', { ascending: false }).limit(40);
      if (listenedIds.length > 0) query = query.not('id', 'in', `(${listenedIds.join(',')})`);
      const { data: recData } = await query;
      setRecommended(diversify((recData || []).map(t => ({
        ...t, artist_name: t.artists?.artist_name || 'Unknown Artist',
        artist_slug: t.artists?.slug || null,
      })), artistCount));
    } catch (err) { console.error('Recommendations error:', err); }
  };

  const fetchFeaturedPlaylists = async () => {
    try {
      // Note: no join to a users table here. An earlier version tried
      // artists:users!playlists_user_id_fkey(...), which 400s because that
      // relationship doesn't resolve, so this section silently never
      // rendered. Owner names are looked up separately instead.
      const { data, error } = await supabase
        .from('playlists')
        .select('id, name, cover_url, user_id, created_at, is_public, playlist_tracks(id, tracks(cover_artwork_url))')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(12);
      if (error || !data) return;

      const withTracks = data.filter(p => p.playlist_tracks?.length > 0);
      if (withTracks.length === 0) { setFeaturedPlaylists([]); return; }

      const ownerIds = [...new Set(withTracks.map(p => p.user_id).filter(Boolean))];
      let ownerMap = {};
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('artists')
          .select('user_id, artist_name, slug, profile_image_url')
          .in('user_id', ownerIds);
        (owners || []).forEach(o => { ownerMap[o.user_id] = o; });
      }

      setFeaturedPlaylists(withTracks.map(p => ({ ...p, owner: ownerMap[p.user_id] || null })));
    } catch {}
  };

  // fetchSimilarArtists() lived here. It ran two queries on every signed in
  // load and wrote to similarArtists, which nothing on this page has
  // rendered since the row was removed. Same for the featured tracks query.
  // Both are gone: they were pure load time.

  useEffect(() => {
    fetchData();
  }, [user]);

  // ── Artists of the Day ────────────────────────────────────────────────────
  // Three now, not one. daily-spotlight.js writes up to SPOTLIGHT_PER_DAY rows
  // per user per day (migration 136 widened the unique key to include
  // artist_id, which is what previously made a second row impossible).
  //
  // The fallback matters as much as the picks. If the nightly function has not
  // run for this user yet — a brand new account, or a listener outside the 60
  // day active window — the row used to be simply absent. It now fills from the
  // same pool the function draws from, so the section is never a blank.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchSpotlight = async () => {
      const today = new Date().toISOString().split('T')[0];

      const { data } = await supabase
        .from('daily_artist_spotlight')
        .select('artist_id, artists(id, artist_name, slug, profile_image_url, total_streams, follower_count, is_verified)')
        .eq('user_id', user.id)
        .eq('spotlight_date', today)
        .limit(SPOTLIGHT_PER_DAY);

      const picked = (data || []).map(r => r.artists).filter(Boolean);
      if (picked.length >= SPOTLIGHT_PER_DAY) {
        if (!cancelled) setSpotlightArtists(picked.slice(0, SPOTLIGHT_PER_DAY));
        return;
      }

      // Top up from the same eligibility rule the scheduled function uses:
      // a real profile image, not suspended, at least one track. Rotated by
      // date so it is stable for the whole day and different tomorrow.
      const { data: pool } = await supabase
        .from('artists')
        .select('id, artist_name, slug, profile_image_url, total_streams, follower_count, is_verified')
        .not('profile_image_url', 'is', null)
        .neq('profile_image_url', '')
        .eq('is_suspended', false)
        .gt('track_count', 0)
        .order('total_streams', { ascending: false })
        .limit(60);

      const already = new Set(picked.map(a => a.id));
      const candidates = (pool || []).filter(a => !already.has(a.id));

      if (candidates.length) {
        const dayIndex = Math.floor(Date.parse(today) / 86400000);
        const offset   = ((dayIndex % candidates.length) + candidates.length) % candidates.length;
        for (let i = 0; picked.length < SPOTLIGHT_PER_DAY && i < candidates.length; i++) {
          picked.push(candidates[(offset + i) % candidates.length]);
        }
      }

      if (!cancelled) setSpotlightArtists(picked.slice(0, SPOTLIGHT_PER_DAY));
    };

    fetchSpotlight();
    return () => { cancelled = true; };
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
          .select('*, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .order('engagement_score', { ascending: false })
          .limit(heardIds.length > 0 ? 40 : 20);

        if (heardIds.length > 0) {
          query = query.not('id', 'in', `(${heardIds.join(',')})`);
        }

        const { data } = await query;
        setUnheardTracks((data || []).slice(0, ROW_TARGET).map(t => ({
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
          .select('*, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .neq('id', track.id)
          .order('engagement_score', { ascending: false })
          .limit(20);
        return normaliseTracks(data, track);
      }

      const { data } = await supabase
        .from('tracks')
        .select('*, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
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
          .select('*, artists!tracks_artist_id_fkey(artist_name, slug, profile_image_url)')
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

  // Small library shortcut on Home: your own playlists first, then artists
  // you follow. Own effect and state, so a failure here leaves Home intact.
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [{ data: pls }, { data: fols }] = await Promise.all([
        supabase.from('playlists')
          .select('id, name, cover_url, playlist_tracks(id, tracks(cover_artwork_url))')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(4),
        supabase.from('follows')
          .select('artist:artists(id, artist_name, slug, profile_image_url)')
          .eq('follower_id', user.id).limit(4),
      ]);
      const items = [
        ...(pls || []).map(p => ({
          key: `pl-${p.id}`, kind: 'playlist', label: p.name,
          image: p.cover_url || p.playlist_tracks?.find(t => t.tracks?.cover_artwork_url)?.tracks?.cover_artwork_url,
          path: `/library/playlists/${p.id}`,
        })),
        ...(fols || []).filter(f => f.artist).map(f => ({
          key: `ar-${f.artist.id}`, kind: 'artist', label: f.artist.artist_name,
          image: f.artist.profile_image_url,
          path: `/artist/${f.artist.slug || f.artist.id}`,
        })),
      ];
      setLibraryPeek(items.slice(0, 6));
    };
    load();
  }, [user]);

  // Manually-controlled hero. Its own effect and state so if this fails or
  // nothing is live, Home simply renders without a hero.
  useEffect(() => {
    supabase.from('home_hero').select('*').eq('is_active', true).maybeSingle()
      .then(({ data }) => setHero(data));
  }, []);

  if (loading) return <HomeSkeleton />;

  return (
    <div className="pb-4 scroll-page" {...pullProps}>
      <Helmet>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <title>Home · Feelz Machine</title>
        <meta name="description" content="Discover independent music, trending tracks and artists on Feelz Machine." />
        <link rel="canonical" href="https://www.feelzmachine.com/" />
        <meta property="og:title" content="Home · Feelz Machine" />
        <meta property="og:url" content="https://www.feelzmachine.com/" />
      </Helmet>

      <PullToRefreshIndicator pullProgress={pullProgress} isRefreshing={isRefreshing} />

      {hero && (
        <div className="px-6 pt-2 pb-6">
          <button
            onClick={() => hero.cta_path && navigate(hero.cta_path)}
            className="w-full text-left rounded-2xl overflow-hidden relative group"
            style={{ minHeight: '200px' }}
          >
            {hero.image_url && (
              <img src={hero.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0" style={{
              background: hero.image_url
                ? 'linear-gradient(90deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.25) 100%)'
                : HERO_ACCENTS[hero.accent]?.bg || HERO_ACCENTS.lime.bg,
            }} />
            <div className="relative p-7 sm:p-9 max-w-xl">
              {hero.eyebrow && (
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase mb-2"
                  style={{ color: HERO_ACCENTS[hero.accent]?.text || HERO_ACCENTS.lime.text }}>
                  {hero.eyebrow}
                </p>
              )}
              <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">{hero.title}</h2>
              {hero.subtitle && <p className="text-sm text-white/60 mt-2 leading-relaxed">{hero.subtitle}</p>}
              {hero.cta_label && (
                <span className="inline-block mt-5 px-5 py-2.5 rounded-xl text-sm font-bold text-black group-hover:scale-105 transition"
                  style={{ background: HERO_ACCENTS[hero.accent]?.text || HERO_ACCENTS.lime.text }}>
                  {hero.cta_label}
                </span>
              )}
            </div>
          </button>
        </div>
      )}

      {/* Library shortcut: jump back into your own playlists and the artists
          you follow, without leaving Home. */}
      {libraryPeek.length > 0 && (
        <div className="px-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold">Your library</p>
            <button onClick={() => navigate('/library')}
              className="text-[11px] text-white/30 hover:text-white/60 transition">Open library &rarr;</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {libraryPeek.map(item => (
              <button key={item.key} onClick={() => navigate(item.path)}
                className="flex items-center space-x-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.07] transition text-left group">
                <div className={`w-10 h-10 flex-shrink-0 overflow-hidden bg-white/[0.06] flex items-center justify-center ${item.kind === 'artist' ? 'rounded-full' : 'rounded-md'}`}>
                  {item.image
                    ? <img src={item.image} alt="" className="w-full h-full object-cover" />
                    : <ListMusic className="w-4 h-4 text-white/20" />}
                </div>
                <p className="text-xs font-medium text-white truncate">{item.label}</p>
              </button>
            ))}
          </div>
        </div>
      )}


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

      {/* Stories rail — followed artists' 24hr clips */}
      <StoriesRail userId={user?.id} />

      {/* Collaborations get their own row. They existed only at the bottom of
          an artist's own profile before this, which meant the platform's own
          argument — that artists here work together — was the thing hardest
          to see. */}
      <CollabRail limit={12} />




      {/* Active Competitions */}
      {activeCompetitions.filter(c => !c.wheel_challenge).length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3 px-6">
            <div className="flex items-center space-x-2">
              <Trophy className="w-3.5 h-3.5 text-yellow-400/60" />
              <span className="section-label">Competitions</span>
            </div>
          </div>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {activeCompetitions.filter(c => !c.wheel_challenge).map(comp => (
              <button
                key={comp.id}
                onClick={() => navigate(`/competition/${comp.id}`)}
                className="flex-shrink-0 w-52 p-3.5 rounded-2xl border text-left transition active:scale-[0.98]"
                style={{
                  borderColor: comp.paid_collab ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.08)',
                  background: comp.paid_collab
                    ? 'linear-gradient(135deg, rgba(245,158,11,0.08), transparent)'
                    : 'rgba(255,255,255,0.02)',
                }}
              >
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-base">{comp.paid_collab ? '💰' : '🏆'}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    comp.status === 'voting'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-green-500/20 text-green-400'
                  }`}>
                    {comp.status === 'voting' ? 'Vote Now' : 'Enter Now'}
                  </span>
                </div>
                <p className="text-sm font-semibold text-white truncate mb-1">{comp.title}</p>
                {comp.brief && <p className="text-[11px] text-white/35 truncate">{comp.brief}</p>}
                {comp.paid_collab && (
                  <p className="text-[10px] font-bold mt-1.5" style={{ color: '#F59E0B' }}>$50 USD Prize</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* From artists you follow — personal pull, logged-in users only */}
      {followedReleases.length > 0 && (
        <Section title="From Artists You Follow" icon={Users} gradient="rose" onSeeAll={() => navigate('/browse?tab=new')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {followedReleases.map(track => (
              <SquareCard key={track.id} item={track} itemList={followedReleases}
                onPlay={handlePlay} onMore={handleMore}
                currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* Artists of the Day — three undiscovered artists picked for this user */}
      {user && spotlightArtists.length > 0 && (
        <div className="mx-6 mb-6">
          <div className="flex items-center space-x-2 mb-3">
            <Compass className="w-3.5 h-3.5 text-blue-400/60" />
            <span className="section-label">
              {spotlightArtists.length > 1 ? 'Artists of the Day' : 'Artist of the Day'}
            </span>
          </div>
          <div className="space-y-2">
            {spotlightArtists.map(artist => (
              <button
                key={artist.id}
                onClick={() => navigate(`/artist/${artist.slug}`)}
                className="w-full flex items-center space-x-4 p-4 rounded-2xl border border-blue-500/15 bg-gradient-to-r from-blue-500/8 to-transparent hover:border-blue-500/25 transition group"
              >
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/[0.06] flex-shrink-0">
                  {artist.profile_image_url
                    ? <img src={artist.profile_image_url} alt={artist.artist_name || ''} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-6 h-6 text-white/20" /></div>
                  }
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center space-x-1.5 mb-0.5">
                    <p className="text-base font-semibold text-white truncate">{artist.artist_name}</p>
                    {artist.is_verified && <VerifiedBadge size="md" />}
                  </div>
                  <p className="text-xs text-white/35">
                    {artist.total_streams > 0
                      ? `${formatNumber(artist.total_streams)} streams · You haven't heard them yet`
                      : 'An artist worth discovering'}
                  </p>
                  <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">
                    Discover →
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* You haven't heard this yet */}
      {user && unheardTracks.length > 0 && (
        <Section title="You Haven't Heard This Yet" icon={Headphones} gradient="teal">
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
        <Section title="Trending" icon={Flame} gradient="teal" onSeeAll={() => navigate('/browse?tab=trending')}>
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
        <Section title="New Singles" gradient="purple" onSeeAll={() => navigate('/browse?tab=new')}>
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


      {/* Recommended */}
      {recommended.length > 0 && (
        <Section title="Recommended For You" icon={Sparkles} gradient="amber" onSeeAll={() => navigate('/browse?tab=tracks')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {recommended.map(track => (
              <SquareCard key={track.id} item={track} itemList={recommended}
                onPlay={handlePlay} onMore={handleMore}
                currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}


      {/* ── Artist Playlists (replaces Featured) ── */}
      {featuredPlaylists.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 px-6">
            <div className="flex items-center space-x-2">
              <ListMusic className="w-3.5 h-3.5" style={{ color: 'rgba(167,139,250,0.7)' }} />
              <span className="section-label">Artist Playlists</span>
            </div>
            <button onClick={() => navigate('/browse')}
              className="text-xs text-white/30 hover:text-white/50 transition">See all →</button>
          </div>
          <div className="mx-6 rounded-2xl py-6 px-5"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.28) 0%, rgba(88,28,135,0.35) 55%, rgba(20,15,45,0.95) 100%)',
              border: '1px solid rgba(167,139,250,0.35)',
              boxShadow: '0 8px 32px rgba(139,92,246,0.15)',
            }}>
            <div className="flex space-x-5 overflow-x-auto scrollbar-hide">
              {featuredPlaylists.map(pl => {
                const coverUrl = pl.cover_url || pl.playlist_tracks?.find(pt => pt.tracks?.cover_artwork_url)?.tracks?.cover_artwork_url;
                return (
                  <button key={pl.id}
                    onClick={() => navigate(`/library/playlists/${pl.id}`)}
                    className="flex-shrink-0 w-40 md:w-48 text-left group">
                    <div className="w-40 h-40 md:w-48 md:h-48 rounded-xl overflow-hidden mb-3 relative"
                      style={{
                        background: 'rgba(139,92,246,0.12)',
                        border: '1px solid rgba(167,139,250,0.25)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                      }}>
                      {coverUrl
                        ? <img src={coverUrl} alt={pl.name} loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <ListMusic className="w-12 h-12" style={{ color: 'rgba(167,139,250,0.4)' }} />
                          </div>}
                    </div>
                    <p className="text-sm font-bold text-white truncate">{pl.name}</p>
                    <p className="text-xs text-white/40 truncate mt-0.5">
                      {pl.playlist_tracks?.length || 0} tracks
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Monthly Wrapped card */}
      {wrappedNotif && (
        <div className="mx-6 mb-6">
          <WrappedCard notification={wrappedNotif} compact />
        </div>
      )}

      {/* On This Day — resurface a track from exactly 1 year ago */}
      <OnThisDay user={user} />

      {/* Artists to Follow */}
      {topArtists.length > 0 && (
        <Section title="Artists to Follow" gradient="rose" onSeeAll={() => navigate('/browse?tab=artists')}>
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
                  {a.is_verified && <VerifiedBadge size="sm" />}
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