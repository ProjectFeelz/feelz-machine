import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { downloadTrack } from '../utils/downloadTrack';
import TrackActionSheet from '../components/TrackActionSheet';
import {
  ArrowLeft, Play, Pause, Music, Loader, Download,
  Heart, Share2, Check, MoreHorizontal, Verified,
  Disc, ExternalLink
} from 'lucide-react';

const BASE_URL = 'https://www.feelzmachine.com';

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function formatDuration(s) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export default function TrackPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [track, setTrack]           = useState(null);
  const [artist, setArtist]         = useState(null);
  const [album, setAlbum]           = useState(null);
  const [discography, setDiscography] = useState([]);
  const [liked, setLiked]           = useState(false);
  const [loading, setLoading]       = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied]         = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [alreadyPurchased, setAlreadyPurchased] = useState(false);

  const checkExistingPurchase = async (trackId) => {
    if (!user) return;
    const { data } = await supabase.from('downloads').select('id')
      .eq('user_id', user.id).eq('track_id', trackId).maybeSingle();
    if (data) setAlreadyPurchased(true);
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && track && user) {
        checkExistingPurchase(track.id);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user, track]);

  const isActive  = currentTrack?.id === track?.id;
  const isCurrentPlaying = isActive && isPlaying;

  useEffect(() => { if (slug) fetchTrack(); }, [slug]);

  const fetchTrack = async () => {
    setLoading(true);
    try {
      // Fetch track by slug
      const { data: trackData, error } = await supabase
        .from('tracks')
        .select('*, artists(*), albums(id, title, slug, cover_artwork_url, price, release_type, release_date)')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();

      if (error || !trackData) { setLoading(false); return; }

      setTrack(trackData);
      setArtist(trackData.artists);
      setAlbum(trackData.albums || null);

      // Check if user liked this track
      if (user) {
        const { data: likeData } = await supabase
          .from('track_likes')
          .select('id')
          .eq('track_id', trackData.id)
          .eq('user_id', user.id)
          .maybeSingle();
        setLiked(!!likeData);
      await checkExistingPurchase(trackData.id);
      }

      // Fetch full artist discography for queue
      const { data: discData } = await supabase
        .from('tracks')
        .select('*')
        .eq('artist_id', trackData.artist_id)
        .eq('is_published', true)
        .order('engagement_score', { ascending: false })
        .limit(20);

      setDiscography(discData || []);
    } catch (err) {
      console.error('TrackPage fetch error:', err);
    }
    setLoading(false);
  };

  const handlePlay = () => {
    if (isActive) { togglePlay(); return; }
    // Build queue: this track first, then rest of discography
    const artistName = artist?.artist_name || '';
    const artistSlug = artist?.slug || '';
    const queue = [
      { ...track, artist_name: artistName, artist_slug: artistSlug },
      ...discography
        .filter(t => t.id !== track.id)
        .map(t => ({ ...t, artist_name: artistName, artist_slug: artistSlug })),
    ];
    playTrack(queue[0], queue);
  };

  const handleLike = async () => {
    if (!user) { navigate('/login'); return; }
    if (liked) {
      await supabase.from('track_likes').delete()
        .eq('track_id', track.id).eq('user_id', user.id);
      setLiked(false);
    } else {
      await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });
      setLiked(true);
    }
  };

  const handleShare = async () => {
    const url = `${BASE_URL}/track/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: track.title, text: `${track.title} by ${artist?.artist_name} on Feelz Machine`, url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async () => {
    if (!user) { navigate('/login'); return; }
    if (downloading) return;
    setDownloading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await downloadTrack(track.id, track.title, session?.access_token);
    } catch (err) {
      console.error('Download error:', err);
    }
    setDownloading(false);
  };

  const handleDiscographyPlay = (t) => {
    if (currentTrack?.id === t.id) { togglePlay(); return; }
    const artistName = artist?.artist_name || '';
    const artistSlug = artist?.slug || '';
    const queue = discography.map(d => ({ ...d, artist_name: artistName, artist_slug: artistSlug }));
    const idx = queue.findIndex(d => d.id === t.id);
    const reordered = [...queue.slice(idx), ...queue.slice(0, idx)];
    playTrack(reordered[0], reordered);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  if (!track) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <Music className="w-16 h-16 text-white/10 mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Track not found</h2>
        <button onClick={() => navigate('/')} className="text-sm text-white/40 hover:text-white/60 transition">
          Go home
        </button>
      </div>
    );
  }

  const coverArt  = track.cover_artwork_url || album?.cover_artwork_url;
  const pageUrl   = `${BASE_URL}/track/${slug}`;
  const pageTitle = `${track.title} by ${artist?.artist_name} · Feelz Machine`;
  const pageDesc  = `Stream ${track.title} by ${artist?.artist_name} on Feelz Machine — independent music platform.`;
  const ogImage   = coverArt || `${BASE_URL}/og-default.png`;

  return (
    <div className="min-h-screen bg-black text-white pb-32">

      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="music.song" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>

      {/* Blurred cover art header */}
      <div className="relative">
        <div className="relative h-64 overflow-hidden">
          {coverArt
            ? <img src={coverArt} alt="" className="w-full h-full object-cover blur-2xl scale-110 opacity-30" />
            : <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/[0.02]" />}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black" />
        </div>

        {/* Back + share buttons */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)', height: 'calc(max(env(safe-area-inset-top, 0px), 12px) + 44px)' }}>
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex items-center space-x-2">
            <button onClick={handleShare}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md">
              {copied
                ? <Check className="w-4 h-4 text-green-400" />
                : <Share2 className="w-4 h-4 text-white" />}
            </button>
            <button onClick={() => setShowActionSheet(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md">
              <MoreHorizontal className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Cover art + track info */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 flex items-end space-x-4">
          <div className="w-28 h-28 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0 shadow-2xl border border-white/10">
            {coverArt
              ? <img src={coverArt} alt={track.title} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-10 h-10 text-white/20" />
                </div>}
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center space-x-1.5 mb-1">
              {track.is_explicit && (
                <span className="text-[9px] font-bold px-1 py-0.5 bg-white/10 text-white/40 rounded">E</span>
              )}
              {album && (
                <span className="text-[10px] text-white/30 uppercase tracking-wider">
                  {album.release_type || 'Album'}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white leading-tight truncate">{track.title}</h1>
            <button
              onClick={() => artist?.slug && navigate(`/artist/${artist.slug}`)}
              className="flex items-center space-x-1.5 mt-1 group"
            >
              <span className="text-sm text-white/60 group-hover:text-white/90 transition truncate">
                {artist?.artist_name}
              </span>
              {artist?.is_verified && <Verified className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
            </button>
            {album && (
              <button
                onClick={() => navigate(`/album/${album.slug || album.id}`)}
                className="flex items-center space-x-1 mt-1 group"
              >
                <Disc className="w-3 h-3 text-white/25 group-hover:text-white/50 transition" />
                <span className="text-xs text-white/25 group-hover:text-white/50 transition truncate">
                  {album.title}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center space-x-4 px-5 py-3 border-b border-white/[0.06]">
        <span className="text-xs text-white/30">{formatNumber(track.stream_count || 0)} plays</span>
        {track.duration && <span className="text-xs text-white/30">{formatDuration(track.duration)}</span>}
        {track.genre && <span className="text-xs text-white/30">{track.genre}</span>}
      </div>

      {/* Action bar */}
      <div className="flex items-center space-x-3 px-5 py-4">
        {/* Play button */}
        <button
          onClick={handlePlay}
          className="flex items-center space-x-2 px-7 py-3 bg-white text-black rounded-full font-semibold text-sm hover:bg-white/90 active:scale-95 transition"
        >
          {isCurrentPlaying
            ? <><Pause className="w-4 h-4" fill="black" /><span>Pause</span></>
            : <><Play className="w-4 h-4" fill="black" /><span>Play</span></>}
        </button>

        {/* Like */}
        <button
          onClick={handleLike}
          className="w-11 h-11 flex items-center justify-center rounded-full transition active:scale-90"
          style={{ backgroundColor: liked ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)' }}
        >
          <Heart
            className="w-5 h-5 transition"
            fill={liked ? '#ef4444' : 'none'}
            color={liked ? '#ef4444' : 'rgba(255,255,255,0.4)'}
          />
        </button>

        {/* Download */}
        {track.is_downloadable && (
          alreadyPurchased ? (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center space-x-1.5 px-4 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition active:scale-90 disabled:opacity-40 text-sm text-white/60 font-medium"
            >
              {downloading
                ? <Loader className="w-4 h-4 animate-spin text-white/40" />
                : <Download className="w-4 h-4 text-white/40" />}
              <span>Download</span>
            </button>
          ) : (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition active:scale-90 disabled:opacity-40"
            >
              {downloading
                ? <Loader className="w-5 h-5 animate-spin text-white/40" />
                : <Download className="w-5 h-5 text-white/40" />}
            </button>
          )
        )}

        {/* View artist */}
        <button
          onClick={() => artist?.slug && navigate(`/artist/${artist.slug}`)}
          className="ml-auto flex items-center space-x-1.5 px-3 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition text-xs text-white/50"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Artist</span>
        </button>
      </div>

      {/* More from this artist */}
      {discography.filter(t => t.id !== track.id).length > 0 && (
        <div className="px-5 mt-2">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            More from {artist?.artist_name}
          </h2>
          <div className="space-y-1">
            {discography.filter(t => t.id !== track.id).slice(0, 8).map((t, i) => {
              const tActive = currentTrack?.id === t.id;
              const tPlaying = tActive && isPlaying;
              const tCover = t.cover_artwork_url;
              return (
                <button
                  key={t.id}
                  onClick={() => handleDiscographyPlay(t)}
                  className={`w-full flex items-center space-x-3 p-2.5 rounded-xl transition text-left ${
                    tActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="w-6 flex items-center justify-center flex-shrink-0">
                    {tPlaying ? (
                      <div className="flex items-end space-x-px h-3.5">
                        <div className="w-[3px] bg-white rounded-sm animate-pulse" style={{ height: '100%' }} />
                        <div className="w-[3px] bg-white rounded-sm animate-pulse" style={{ height: '60%', animationDelay: '0.15s' }} />
                        <div className="w-[3px] bg-white rounded-sm animate-pulse" style={{ height: '80%', animationDelay: '0.3s' }} />
                      </div>
                    ) : tActive ? (
                      <Pause className="w-3.5 h-3.5 text-white/60" />
                    ) : (
                      <span className="text-xs text-white/20">{i + 1}</span>
                    )}
                  </div>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.06]">
                    {tCover
                      ? <img src={tCover} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-4 h-4 text-white/15" />
                        </div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${tActive ? 'text-white' : 'text-white/80'}`}>
                      {t.title}
                    </p>
                    <p className="text-xs text-white/30 truncate">
                      {formatNumber(t.stream_count || 0)} plays
                      {t.duration && ` · ${formatDuration(t.duration)}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* See full profile link */}
          <button
            onClick={() => artist?.slug && navigate(`/artist/${artist.slug}`)}
            className="w-full mt-4 py-3 rounded-xl border border-white/[0.08] text-sm text-white/30 hover:text-white/50 hover:border-white/[0.15] transition"
          >
            See all tracks by {artist?.artist_name}
          </button>
        </div>
      )}

      {showActionSheet && (
        <TrackActionSheet
          track={track}
          artist={artist}
          onClose={() => setShowActionSheet(false)}
        />
      )}
    </div>
  );
}