import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import {
  ChevronRight, Flame, Play, Pause, Music, Verified,
  MoreHorizontal, Share2, ListMusic, Download, Check, Loader, X, Disc
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { downloadTrack } from '../utils/downloadTrack';
import { usePaidPlayLimit } from '../hooks/usePaidPlayLimit';
import PaidPlayGate from '../components/PaidPlayGate';

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

// Square card used for Featured, New Releases, Trending
function SquareCard({ item, itemList = [], isAlbum = false, onPlay, currentTrack, isPlaying }) {
  const { addToQueue } = usePlayer();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [shared, setShared] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [addingTo, setAddingTo] = useState(null);
  const [addedTo, setAddedTo] = useState({});
  const menuRef = useRef(null);
  const { checkPlayLimit, recordPlay, resetPlayCount } = usePaidPlayLimit();
  const [limitedTrack, setLimitedTrack] = useState(null);

  const isActive = !isAlbum && currentTrack?.id === item.id;
  const isCurrentPlaying = isActive && isPlaying;

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false); setShowPlaylists(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleShare = async (e) => {
    e.stopPropagation();
    const url = isAlbum
      ? `${window.location.origin}/player/album/${item.id}`
      : item.artist_slug
        ? `${window.location.origin}/player/artist/${item.artist_slug}`
        : window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: item.title, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setShared(true); setTimeout(() => setShared(false), 2000);
    }
    setShowMenu(false);
  };

  const handleDownload = async (e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    if (isAlbum || !item.file_url || !item.is_downloadable) return;
    setDownloading(true);
    try {
      await supabase.from('downloads').insert({ user_id: user.id, track_id: item.id });
      await downloadTrack(item.file_url, item.title);
    } catch {}
    setDownloading(false); setShowMenu(false);
  };

  const loadPlaylists = async (e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    const { data } = await supabase.from('playlists').select('id, name').eq('user_id', user.id).order('name');
    setPlaylists(data || []); setShowPlaylists(true);
  };

  const handleAddToPlaylist = async (playlistId) => {
    setAddingTo(playlistId);
    const { data: existing } = await supabase.from('playlist_tracks').select('id')
      .eq('playlist_id', playlistId).eq('track_id', item.id).maybeSingle();
    if (!existing) {
      const { data: last } = await supabase.from('playlist_tracks').select('position')
        .eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle();
      await supabase.from('playlist_tracks').insert({ playlist_id: playlistId, track_id: item.id, position: (last?.position ?? -1) + 1 });
    }
    setAddedTo(prev => ({ ...prev, [playlistId]: true }));
    setAddingTo(null);
    setTimeout(() => { setAddedTo(prev => { const n = { ...prev }; delete n[playlistId]; return n; }); setShowMenu(false); setShowPlaylists(false); }, 1500);
  };

  return (
    <div className="flex-shrink-0 w-40 md:w-52 cursor-pointer group relative">
      {/* Artwork */}
      <div
        className="aspect-square rounded-xl overflow-hidden bg-white/[0.06] mb-2 relative"
        onClick={() => {
  if (isAlbum) { navigate(`/album/${item.id}`); return; }
  const { allowed } = checkPlayLimit(item);
  if (!allowed) { setLimitedTrack(item); return; }
  recordPlay(item.id);
  onPlay(item, itemList);
}}
      >
        {item.cover_artwork_url
          ? <img src={item.cover_artwork_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
              {isAlbum ? <Disc className="w-8 h-8 text-white/20" /> : <Music className="w-8 h-8 text-white/20" />}
            </div>
        }
        {/* Play overlay */}
        <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition rounded-xl ${isCurrentPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
            {isCurrentPlaying
              ? <Pause className="w-5 h-5 text-white" />
              : <Play className="w-5 h-5 text-white ml-0.5" />
            }
          </div>
        </div>
        {/* Album badge */}
        {isAlbum && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-white/60 backdrop-blur">
            {item.release_type?.toUpperCase() || 'ALBUM'}
          </div>
        )}
        {/* 3-dot button */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(p => !p); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
        >
          <MoreHorizontal className="w-3.5 h-3.5 text-white" />
        </button>
      </div>

      {/* Title + artist */}
      <p className="text-sm font-medium text-white truncate">{item.title}</p>
      <p className="text-xs text-white/40 truncate">{item.artist_name}</p>

      {/* 3-dot dropdown */}
      {showMenu && (
        <div ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 z-50 w-52 rounded-xl shadow-2xl overflow-hidden"
          style={{ top: '100%', marginTop: '4px', backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }}>
          {showPlaylists ? (
            <>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                <button onClick={(e) => { e.stopPropagation(); setShowPlaylists(false); }} className="text-white/30 hover:text-white/60 text-sm">← Back</button>
                <p className="text-xs font-semibold text-white/50">Add to Playlist</p>
                <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}><X className="w-3.5 h-3.5 text-white/30" /></button>
              </div>
              {playlists.length === 0
                ? <div className="px-4 py-3"><p className="text-xs text-white/30">No playlists yet</p></div>
                : playlists.map(pl => (
                    <button key={pl.id} onClick={(e) => { e.stopPropagation(); handleAddToPlaylist(pl.id); }} disabled={addingTo === pl.id}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.04] transition text-left">
                      <span className="text-sm text-white/70 truncate">{pl.name}</span>
                      {addedTo[pl.id] ? <Check className="w-3.5 h-3.5 text-green-400" /> : addingTo === pl.id ? <Loader className="w-3.5 h-3.5 animate-spin text-white/30" /> : null}
                    </button>
                  ))
              }
            </>
          ) : (
            <>
              <button onClick={handleShare} className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                {shared ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4 text-white/50" />}
                <span className="text-sm text-white/70">{shared ? 'Copied!' : 'Share'}</span>
              </button>
              {!isAlbum && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); addToQueue(item); setShowMenu(false); }}
                    className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                    <ListMusic className="w-4 h-4 text-white/50" />
                    <span className="text-sm text-white/70">Add to Queue</span>
                  </button>
                  <button onClick={loadPlaylists} className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                    <ListMusic className="w-4 h-4 text-white/50" />
                    <span className="text-sm text-white/70">Add to Playlist</span>
                  </button>
                  {item.is_downloadable && (
                    <button onClick={handleDownload} disabled={downloading}
                      className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left disabled:opacity-40">
                      {downloading ? <Loader className="w-4 h-4 animate-spin text-white/50" /> : <Download className="w-4 h-4 text-white/50" />}
                      <span className="text-sm text-white/70">{downloading ? 'Downloading...' : 'Download'}</span>
                    </button>
                  )}
                </>
              )}
              {isAlbum && (
                <button onClick={(e) => { e.stopPropagation(); navigate(`/album/${item.id}`); setShowMenu(false); }}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                  <Disc className="w-4 h-4 text-white/50" />
                  <span className="text-sm text-white/70">View Album</span>
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); const slug = isAlbum ? item.artists?.slug : (item.artist_slug || item.artists?.slug); if (slug) { navigate(`/artist/${slug}`); setShowMenu(false); } }}
                className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left border-t border-white/[0.05]">
                <span className="text-sm text-white/40">View Artist</span>
              </button>
            </>
          )}
        </div>
      )}
    <PaidPlayGate
        track={limitedTrack}
        artist={item.artists}
        onClose={() => setLimitedTrack(null)}
        onPurchaseComplete={(t) => { resetPlayCount(t.id); onPlay(t, itemList); setLimitedTrack(null); }}
      />
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
          .select('*, artists(artist_name, slug, profile_image_url, tier)')
          .eq('is_published', true).eq('featured', true)
          .order('created_at', { ascending: false }).limit(10),
        supabase.from('tracks')
          .select('*, artists(artist_name, slug, profile_image_url)')
          .eq('is_published', true)
          .order('created_at', { ascending: false }).limit(8),
        supabase.from('albums')
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

      const normTrack = (list) => (list || []).map(t => ({
        ...t, artist_name: t.artists?.artist_name || 'Unknown Artist',
      }));
      const normAlbum = (list) => (list || []).map(a => ({
        ...a, artist_name: a.artists?.artist_name || 'Unknown Artist', _isAlbum: true,
      }));

      // Merge tracks + albums for New Releases, sorted by created_at
      const merged = [
        ...normTrack(recentTracks).map(t => ({ ...t, _isAlbum: false, _date: t.created_at })),
        ...normAlbum(recentAlbums).map(a => ({ ...a, _date: a.release_date || a.created_at })),
      ].sort((a, b) => new Date(b._date) - new Date(a._date)).slice(0, 10);

      const trendingBoosted = (trendingRaw || [])
        .map(t => ({
          ...t,
          artist_name: t.artists?.artist_name || 'Unknown Artist',
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

      {/* Featured */}
      {featuredTracks.length > 0 && (
        <Section title="Featured">
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {featuredTracks.map((track) => (
              <SquareCard key={track.id} item={track} itemList={featuredTracks}
                onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* New Releases — tracks + albums mixed */}
      {newReleases.length > 0 && (
        <Section title="New Releases" onSeeAll={() => navigate('/browse')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {newReleases.map((item) => (
              <SquareCard key={`${item._isAlbum ? 'album' : 'track'}-${item.id}`}
                item={item} itemList={newReleases.filter(i => !i._isAlbum)}
                isAlbum={item._isAlbum}
                onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* Trending */}
      {trending.length > 0 && (
        <Section title="Trending" icon={Flame} onSeeAll={() => navigate('/browse')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {trending.map((track) => (
              <SquareCard key={track.id} item={track} itemList={trending}
                onPlay={handlePlay} currentTrack={currentTrack} isPlaying={isPlaying} />
            ))}
          </div>
        </Section>
      )}

      {/* Artists to Follow — large circles matching square width */}
      {topArtists.length > 0 && (
        <Section title="Artists to Follow" onSeeAll={() => navigate('/browse?tab=artists')}>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {topArtists.map(a => (
              <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
                className="flex-shrink-0 w-40 md:w-52 text-center group">
                <div className="w-40 h-40 md:w-52 md:h-52 rounded-full overflow-hidden bg-white/[0.06] mb-2 mx-auto">
                  {a.profile_image_url
                    ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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
