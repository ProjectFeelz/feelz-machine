import { downloadTrack } from '../utils/downloadTrack';
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import {
  ArrowLeft, Play, Pause, Share2, UserPlus, UserCheck,
  Instagram, Twitter, Youtube, MessageCircle, Globe, Music,
  Loader, Verified, Download, Heart, ListMusic, Check
} from 'lucide-react';

const PAYPAL_CLIENT_ID = 'AXhUqyXxTmBJ8Q6bqt0yiOEuLxqbbhnP93YONXL5Oiy3btUntKK8M7F2WfOeUzoVPxjHEalbRRRU52yY';

const SOCIAL_ICONS = {
  instagram: Instagram,
  twitter: Twitter,
  youtube: Youtube,
  tiktok: MessageCircle,
  facebook: Globe,
  discord: MessageCircle,
  website: Globe,
};

const SOCIAL_URLS = {
  instagram: 'https://instagram.com/',
  twitter: 'https://x.com/',
  youtube: 'https://youtube.com/',
  tiktok: 'https://tiktok.com/@',
  facebook: 'https://facebook.com/',
};

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

export default function ArtistProfilePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [artist, setArtist] = useState(null);
  const [theme, setTheme] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [collabs, setCollabs] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [purchaseTrack, setPurchaseTrack] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [likedTracks, setLikedTracks] = useState({});
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [addingTo, setAddingTo] = useState(null);
  const [addedTo, setAddedTo] = useState({});

  useEffect(() => {
    if (slug) fetchArtist();
  }, [slug]);

  const fetchArtist = async () => {
    setLoading(true);
    try {
      const { data: artistData, error } = await supabase
        .from('artists')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error || !artistData) { setLoading(false); return; }
      setArtist(artistData);
      setFollowerCount(artistData.follower_count || 0);

      const { data: themeData } = await supabase
        .from('artist_themes')
        .select('*')
        .eq('artist_id', artistData.id)
        .maybeSingle();
      if (themeData) setTheme(themeData);

      const { data: trackData } = await supabase
        .from('tracks')
        .select('*, albums(title, cover_artwork_url)')
        .eq('artist_id', artistData.id)
        .eq('is_published', true)
        .order('engagement_score', { ascending: false });
      setTracks(trackData || []);
      if (user) {
        const { data: likes } = await supabase.from('track_likes')
          .select('track_id').eq('user_id', user.id);
        const likeMap = {};
        (likes || []).forEach(l => { likeMap[l.track_id] = true; });
        setLikedTracks(likeMap);
      }
      const { data: albumData } = await supabase
        .from('albums')
        .select('*')
        .eq('artist_id', artistData.id)
        .eq('is_published', true)
        .order('release_date', { ascending: false });
      setAlbums(albumData || []);
      const { data: collabData } = await supabase
        .from('collaborations')
        .select('*, tracks(id, title, cover_artwork_url)')
        .eq('artist_id', artistData.id)
        .eq('status', 'accepted');
      setCollabs(collabData || []);

      if (user) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('artist_id', artistData.id)
          .eq('follower_id', user.id)
          .single();
        setIsFollowing(!!followData);
      }
    } catch (err) {
      console.error('Error fetching artist:', err);
    }
    setLoading(false);
  };

  // Load PayPal SDK when purchase modal opens
  useEffect(() => {
    if (!purchaseTrack) return;
    setPaypalReady(false);
    setPurchaseError('');

    const existing = document.getElementById('paypal-sdk-track');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = 'paypal-sdk-track';
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;
    script.onload = () => setPaypalReady(true);
    script.onerror = () => setPurchaseError('Failed to load PayPal. Please try again.');
    document.head.appendChild(script);
  }, [purchaseTrack?.id]);

  // Render PayPal buttons once SDK is ready
  useEffect(() => {
    if (!paypalReady || !purchaseTrack || !window.paypal) return;

    const container = document.getElementById('paypal-checkout-container');
    if (!container) return;
    container.innerHTML = '';

    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
      createOrder: async () => {
        setPurchasing(true);
        setPurchaseError('');
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create',
              trackId: purchaseTrack.id,
              amount: purchaseTrack.download_price,
              trackTitle: purchaseTrack.title,
              artistName: artist.artist_name,
            }),
          });
          const { orderId, error } = await res.json();
          if (error || !orderId) throw new Error(error || 'Failed to create order');
          return orderId;
        } catch (err) {
          setPurchaseError(err.message);
          setPurchasing(false);
          throw err;
        }
      },
      onApprove: async (data) => {
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'capture', orderId: data.orderID }),
          });
          const captureData = await res.json();
          if (!captureData.success) throw new Error('Payment capture failed');

          await supabase.from('downloads').insert({
            user_id: user.id,
            track_id: purchaseTrack.id,
            amount_paid: purchaseTrack.download_price,
          });

          await fetch('/.netlify/functions/process-split-payout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              track_id: purchaseTrack.id,
              transaction_id: captureData.captureId,
              total_amount: purchaseTrack.download_price,
              buyer_user_id: user.id,
            }),
          });

          setPurchaseSuccess(true);
          setPurchasing(false);
          setTimeout(async () => {
            await triggerDownload(purchaseTrack);
            setPurchaseTrack(null);
            setPurchaseSuccess(false);
          }, 1500);
        } catch (err) {
          setPurchaseError(err.message);
          setPurchasing(false);
        }
      },
      onError: (err) => {
        console.error('PayPal error:', err);
        setPurchaseError('Payment failed. Please try again.');
        setPurchasing(false);
      },
      onCancel: () => {
        setPurchasing(false);
      },
    }).render('#paypal-checkout-container');
  }, [paypalReady, purchaseTrack?.id]);

  const handleFollow = async () => {
    if (!user) { navigate('/login'); return; }
    if (!artist) return;
    try {
      if (isFollowing) {
        await supabase.from('follows').delete()
          .eq('artist_id', artist.id).eq('follower_id', user.id);
        setIsFollowing(false);
        setFollowerCount(prev => Math.max(prev - 1, 0));
      } else {
        await supabase.from('follows').insert({ artist_id: artist.id, follower_id: user.id });
        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
        // Notify artist
        const { data: myProfile } = await supabase
          .from('artists').select('id, artist_name').eq('user_id', user.id).maybeSingle();
        await supabase.from('notifications').insert({
          artist_id: artist.id,
          type: 'new_follower',
          title: `${myProfile?.artist_name || 'Someone'} followed you`,
          from_artist_id: myProfile?.id || null,
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Follow error:', err);
    }
  };

  const triggerDownload = async (track) => {
    setDownloading(track.id);
    try {
      await supabase.from('downloads').insert({
        user_id: user.id,
        track_id: track.id,
      });
      // Notify artist
      const { data: myProfile } = await supabase
        .from('artists').select('id, artist_name').eq('user_id', user.id).maybeSingle();
      await supabase.from('notifications').insert({
        artist_id: artist.id,
        type: 'download',
        title: `${myProfile?.artist_name || 'Someone'} downloaded ${track.title}`,
        track_id: track.id,
        from_artist_id: myProfile?.id || null,
        metadata: { download: true, purchase_price: track.download_price || 0 },
      }).then(() => {}).catch?.(() => {});
      const a = document.createElement('a');
      a.href = track.file_url;
      await downloadTrack(track.file_url, track.title);
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
    }
    setDownloading(null);
  };

  const handleDownload = (track, e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    if (downloading === track.id) return;
    if (track.download_price > 0) {
      setPurchaseTrack(track);
    } else {
      triggerDownload(track);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: artist.artist_name, text: `Check out ${artist.artist_name} on Feelz Machine`, url });
      } catch (e) {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLike = async (track, e) => {
  e.stopPropagation();
  if (!user) { navigate('/login'); return; }
  const isLiked = likedTracks[track.id];
  setLikedTracks(prev => ({ ...prev, [track.id]: !isLiked }));
  if (isLiked) {
    await supabase.from('track_likes').delete()
      .eq('track_id', track.id).eq('user_id', user.id);
  } else {
    await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });
    const { data: myProfile } = await supabase.from('artists').select('id, artist_name').eq('user_id', user.id).maybeSingle();
    await supabase.from('notifications').insert({
      artist_id: artist.id, type: 'track_liked',
      title: `${myProfile?.artist_name || 'Someone'} liked ${track.title}`,
      track_id: track.id, from_artist_id: myProfile?.id || null,
    }).catch(() => {});
  }
};



  useEffect(() => {
    if (user && showAddToPlaylist) fetchPlaylists();
  }, [showAddToPlaylist, user]);

  const fetchPlaylists = async () => {
    if (!user) return;
    const { data } = await supabase.from('playlists').select('id, name').eq('user_id', user.id).order('name');
    setPlaylists(data || []);
  };

  const handleAddToPlaylist = async (playlistId, trackId) => {
    setAddingTo(playlistId);
    const { data: existing } = await supabase
      .from('playlist_tracks').select('id').eq('playlist_id', playlistId).eq('track_id', trackId).maybeSingle();
    if (!existing) {
      const { data: last } = await supabase
        .from('playlist_tracks').select('position').eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle();
      await supabase.from('playlist_tracks').insert({ playlist_id: playlistId, track_id: trackId, position: (last?.position ?? -1) + 1 });
    }
    setAddedTo(prev => ({ ...prev, [`${playlistId}-${trackId}`]: true }));
    setAddingTo(null);
    setTimeout(() => setAddedTo(prev => { const n = { ...prev }; delete n[`${playlistId}-${trackId}`]; return n; }), 2000);
  };

  const handlePlayTrack = (track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(
        { ...track, artist_name: artist.artist_name, artist_slug: artist.slug },
        tracks.map(t => ({ ...t, artist_name: artist.artist_name, artist_slug: artist.slug }))
      );
    }
  };

  const themeStyles = useMemo(() => {
    if (!theme) return {};
    return {
      '--artist-primary': theme.primary_color || '#FFFFFF',
      '--artist-secondary': theme.secondary_color || '#8B5CF6',
      '--artist-accent': theme.accent_color || '#3B82F6',
      '--artist-bg': theme.background_color || '#000000',
      '--artist-text': theme.text_color || '#FFFFFF',
    };
  }, [theme]);

  const primaryColor = theme?.primary_color || '#FFFFFF';
  const secondaryColor = theme?.secondary_color || '#8B5CF6';
  const accentColor = theme?.accent_color || '#3B82F6';
  const bgColor = theme?.background_color || '#000000';
  const textColor = theme?.text_color || '#FFFFFF';

  useEffect(() => {
    if (theme?.heading_font && theme.heading_font !== 'Inter') {
      const link = document.createElement('link');
      link.href = `https://fonts.googleapis.com/css2?family=${theme.heading_font.replace(/ /g, '+')}:wght@400;600;700;900&display=swap`;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      return () => document.head.removeChild(link);
    }
  }, [theme?.heading_font]);

  useEffect(() => {
    if (theme?.body_font && theme.body_font !== 'Inter' && theme.body_font !== theme?.heading_font) {
      const link = document.createElement('link');
      link.href = `https://fonts.googleapis.com/css2?family=${theme.body_font.replace(/ /g, '+')}:wght@400;500;600&display=swap`;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      return () => document.head.removeChild(link);
    }
  }, [theme?.body_font, theme?.heading_font]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <Music className="w-16 h-16 text-white/10 mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Artist not found</h2>
        <button onClick={() => navigate('/')} className="text-sm text-white/40 hover:text-white/60">Go home</button>
      </div>
    );
  }

  const socials = artist.social_links || {};
  const socialEntries = Object.entries(socials).filter(([_, v]) => v);
  const headingFont = theme?.heading_font || 'Inter';
  const bodyFont = theme?.body_font || 'Inter';
  const visibleTracks = showAllTracks ? tracks : tracks.slice(0, 5);

  return (
    <div className="min-h-screen pb-32" style={{
      backgroundColor: bgColor,
      color: textColor,
      fontFamily: `"${bodyFont}", sans-serif`,
      ...themeStyles,
    }}>
      {/* BANNER */}
      <div className="relative w-full" style={{ height: '280px' }}>
        {artist.banner_image_url || theme?.banner_image_url ? (
          <img src={artist.banner_image_url || theme?.banner_image_url} alt=""
            className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{
            background: `linear-gradient(135deg, ${secondaryColor}40, ${accentColor}30, ${bgColor})`,
          }} />
        )}
        {theme?.background_image_url && !artist.banner_image_url && !theme?.banner_image_url && (
          <img src={theme.background_image_url} alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30" />
        )}
        <div className="absolute inset-0" style={{
          background: `linear-gradient(to bottom, transparent 30%, ${bgColor} 100%)`,
        }} />
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-5 z-10">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md"
            style={{ backgroundColor: `${bgColor}80` }}>
            <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
          </button>
          <button onClick={handleShare}
            className="w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md"
            style={{ backgroundColor: `${bgColor}80` }}>
            {copied
              ? <span className="text-xs" style={{ color: primaryColor }}>Copied!</span>
              : <Share2 className="w-4 h-4" style={{ color: textColor }} />
            }
          </button>
        </div>
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 z-10">
          <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 shadow-2xl"
            style={{ borderColor: bgColor, backgroundColor: `${secondaryColor}30` }}>
            {artist.profile_image_url ? (
              <img src={artist.profile_image_url} alt={artist.artist_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})` }}>
                <span className="text-3xl font-bold" style={{ color: textColor }}>
                  {artist.artist_name?.[0]?.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ARTIST INFO */}
      <div className="px-6 pt-16 flex flex-col items-center text-center">
        <div className="flex items-center space-x-2 mb-1">
          <h1 className="text-2xl font-bold"
            style={{ fontFamily: `"${headingFont}", sans-serif`, color: textColor }}>
            {artist.artist_name}
          </h1>
          {artist.is_verified && (
            <div className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: accentColor }}>
              <Verified className="w-3 h-3" style={{ color: bgColor }} />
            </div>
          )}
        </div>
        <div className="flex items-center space-x-4 mb-4">
          <span className="text-sm" style={{ color: `${textColor}80` }}>{formatNumber(followerCount)} followers</span>
          <span className="text-sm" style={{ color: `${textColor}80` }}>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
          <span className="text-sm" style={{ color: `${textColor}80` }}>{formatNumber(artist.total_streams)} streams</span>
        </div>
        <div className="flex items-center justify-center space-x-3 mb-6">
          <button onClick={handleFollow}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
            style={{
              backgroundColor: isFollowing ? 'transparent' : primaryColor,
              color: isFollowing ? textColor : bgColor,
              border: `2px solid ${isFollowing ? `${textColor}30` : primaryColor}`,
            }}>
            {isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            <span>{isFollowing ? 'Following' : 'Follow'}</span>
          </button>
          {tracks.length > 0 && (
            <button onClick={() => handlePlayTrack(tracks[0])}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
              style={{ backgroundColor: secondaryColor, color: textColor }}>
              <Play className="w-4 h-4" fill={textColor} />
              <span>Play</span>
            </button>
          )}
        </div>
        {artist.bio && (
          <p className="text-sm leading-relaxed mb-6 max-w-sm"
            style={{ color: `${textColor}90`, fontFamily: `"${bodyFont}", sans-serif` }}>
            {artist.bio}
          </p>
        )}
        {socialEntries.length > 0 && (
          <div className="flex items-center space-x-3 mb-8">
            {socialEntries.map(([platform, value]) => {
              const Icon = SOCIAL_ICONS[platform] || Globe;
              const prefix = SOCIAL_URLS[platform] || '';
              const href = value.startsWith('http') ? value : (prefix ? `${prefix}${value}` : value);
              return href.startsWith('http') ? (
                <a key={platform} href={href} target="_blank" rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                  style={{ backgroundColor: `${textColor}10` }}>
                  <Icon className="w-4 h-4" style={{ color: `${textColor}70` }} />
                </a>
              ) : (
                <div key={platform} className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${textColor}10` }} title={value}>
                  <Icon className="w-4 h-4" style={{ color: `${textColor}70` }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SINGLES (tracks without album) */}
      {tracks.filter(t => !t.album_id).length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold px-6 mb-3"
            style={{ fontFamily: `"${headingFont}", sans-serif` }}>Singles</h2>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {tracks.filter(t => !t.album_id).map(track => (
              <div key={track.id} className="flex-shrink-0 w-36 cursor-pointer group"
                onClick={() => handlePlayTrack(track)}>
                <div className="aspect-square rounded-xl overflow-hidden mb-2"
                  style={{ backgroundColor: `${textColor}08` }}>
                  {track.cover_artwork_url ? (
                    <img src={track.cover_artwork_url} alt={track.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${secondaryColor}40, ${accentColor}20)` }}>
                      <Music className="w-8 h-8" style={{ color: `${textColor}20` }} />
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium truncate" style={{ color: textColor }}>{track.title}</p>
                <p className="text-xs truncate" style={{ color: `${textColor}50` }}>Single</p>
              </div>
            ))}
          </div>
        </div>
      )}

{/* ALBUMS */}
      {albums.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold px-6 mb-3"
            style={{ fontFamily: `"${headingFont}", sans-serif` }}>Albums</h2>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {albums.map(album => (
              <div key={album.id} className="flex-shrink-0 w-36 cursor-pointer group" onClick={() => navigate(`/browse`)}>
                <div className="aspect-square rounded-xl overflow-hidden mb-2"
                  style={{ backgroundColor: `${textColor}08` }}>
                  {album.cover_artwork_url ? (
                    <img src={album.cover_artwork_url} alt={album.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${secondaryColor}40, ${accentColor}20)` }}>
                      <Music className="w-8 h-8" style={{ color: `${textColor}20` }} />
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium truncate" style={{ color: textColor }}>{album.title}</p>
                <p className="text-xs truncate" style={{ color: `${textColor}50` }}>
                  {album.release_type?.toUpperCase()} {album.release_date ? new Date(album.release_date).getFullYear() : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* TRACKS */}
      {tracks.length > 0 && (
        <div className="px-6 mb-8">
          <h2 className="text-lg font-bold mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Popular</h2>
          <div className="space-y-1">
            {visibleTracks.map((track, i) => {
              const isActive = currentTrack?.id === track.id;
              const isTrackPlaying = isActive && isPlaying;
              return (
                <button key={track.id} onClick={() => handlePlayTrack(track)}
                  className="w-full flex items-center space-x-3 p-2.5 rounded-lg transition-all active:scale-[0.98]"
                  style={{ backgroundColor: isActive ? `${secondaryColor}15` : 'transparent' }}>
                  <div className="w-7 flex items-center justify-center flex-shrink-0">
                    {isActive ? (
                      isTrackPlaying ? (
                        <div className="flex items-end space-x-0.5 h-4">
                          <div className="w-0.5 rounded-full animate-pulse" style={{ height: '100%', backgroundColor: secondaryColor }} />
                          <div className="w-0.5 rounded-full animate-pulse" style={{ height: '60%', backgroundColor: secondaryColor, animationDelay: '0.15s' }} />
                          <div className="w-0.5 rounded-full animate-pulse" style={{ height: '80%', backgroundColor: secondaryColor, animationDelay: '0.3s' }} />
                        </div>
                      ) : (
                        <Pause className="w-4 h-4" style={{ color: secondaryColor }} />
                      )
                    ) : (
                      <span className="text-sm" style={{ color: `${textColor}30` }}>{i + 1}</span>
                    )}
                  </div>
                  <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0"
                    style={{ backgroundColor: `${textColor}08` }}>
                    {(track.cover_artwork_url || track.albums?.cover_artwork_url) ? (
                      <img src={track.cover_artwork_url || track.albums?.cover_artwork_url} alt=""
                        className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${secondaryColor}30, ${accentColor}15)` }}>
                        <Music className="w-4 h-4" style={{ color: `${textColor}20` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate"
                      style={{ color: isActive ? secondaryColor : textColor }}>{track.title}</p>
                    <div className="flex items-center space-x-2">
                      {track.is_explicit && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                          style={{ backgroundColor: `${textColor}15`, color: `${textColor}50` }}>E</span>
                      )}
                      <span className="text-xs truncate" style={{ color: `${textColor}40` }}>
                        {formatNumber(track.stream_count || 0)} plays
                      </span>
                    </div>
                  </div>
                  {track.duration && (
                    <span className="text-xs flex-shrink-0" style={{ color: `${textColor}30` }}>
                      {formatDuration(track.duration)}
                    </span>
                  )}
                  <button onClick={(e) => handleLike(track, e)}
                    className="flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-95"
                    style={{ color: likedTracks[track.id] ? '#ef4444' : `${textColor}30` }}>
                    <Heart className="w-4 h-4" fill={likedTracks[track.id] ? '#ef4444' : 'none'} />
                  </button>
                  <div className="relative flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setShowAddToPlaylist(showAddToPlaylist === track.id ? null : track.id); }}
                      className="p-1.5 rounded-lg transition-all active:scale-95"
                      style={{ color: `${textColor}30` }}>
                      <ListMusic className="w-4 h-4" />
                    </button>
                    {showAddToPlaylist === track.id && (
                      <div className="absolute right-0 bottom-8 z-50 w-52 rounded-xl shadow-2xl overflow-hidden"
                        style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                          <p className="text-xs font-semibold text-white/50">Add to Playlist</p>
                          <button onClick={(e) => { e.stopPropagation(); setShowAddToPlaylist(null); }} className="text-white/30 text-lg leading-none">×</button>
                        </div>
                        {playlists.length === 0 ? (
                          <div className="px-4 py-3">
                            <p className="text-xs text-white/30">No playlists yet</p>
                          </div>
                        ) : playlists.map(pl => {
                          const key = `${pl.id}-${track.id}`;
                          const done = addedTo[key];
                          return (
                            <button key={pl.id} onClick={(e) => { e.stopPropagation(); handleAddToPlaylist(pl.id, track.id); }}
                              disabled={addingTo === pl.id}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.04] transition text-left">
                              <span className="text-sm text-white/70 truncate">{pl.name}</span>
                              {done ? <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {track.is_downloadable && (
                    <button onClick={(e) => handleDownload(track, e)} disabled={downloading === track.id}
                      className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                      style={{ backgroundColor: `${secondaryColor}20`, color: secondaryColor }}>
                      {downloading === track.id
                        ? <Loader className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />
                      }
                      {track.download_price > 0 && (
                        <span className="text-[11px] font-semibold">${track.download_price}</span>
                      )}
                    </button>
                  )}
                </button>
              );
            })}
          </div>
          {tracks.length > 5 && (
            <button onClick={() => setShowAllTracks(!showAllTracks)}
              className="mt-3 text-sm font-medium transition-colors"
              style={{ color: `${textColor}50` }}>
              {showAllTracks ? 'Show less' : `See all ${tracks.length} tracks`}
            </button>
          )}
        </div>
      )}

      {collabs.length > 0 && (
        <div className="px-6 mb-8">
          <h2 className="text-lg font-bold mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Collaborations</h2>
          <div className="space-y-2">
            {collabs.map(collab => (
              <div key={collab.id} className="flex items-center space-x-3 p-3 rounded-xl"
                style={{ backgroundColor: `${textColor}05`, border: `1px solid ${textColor}08` }}>
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: `${secondaryColor}20` }}>
                  {collab.tracks?.cover_artwork_url
                    ? <img src={collab.tracks.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4" style={{ color: `${textColor}20` }} /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: textColor }}>{collab.tracks?.title || 'Untitled'}</p>
                  <p className="text-xs" style={{ color: `${textColor}40` }}>{collab.role} · {collab.split_percent}% split</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${secondaryColor}20`, color: secondaryColor }}>Collab</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* EMPTY STATE */}
      {tracks.length === 0 && albums.length === 0 && (
        <div className="px-6 py-12 text-center">
          <Music className="w-12 h-12 mx-auto mb-3" style={{ color: `${textColor}15` }} />
          <p className="text-sm" style={{ color: `${textColor}40` }}>No music published yet. Stay tuned!</p>
        </div>
      )}

      {/* PURCHASE MODAL */}
      {purchaseTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={() => !purchasing && setPurchaseTrack(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 overflow-y-auto"
            style={{ backgroundColor: bgColor, border: `1px solid ${primaryColor}20`, maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}>

            {purchaseSuccess ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ backgroundColor: `${secondaryColor}20` }}>
                  <span className="text-2xl">✓</span>
                </div>
                <p className="font-semibold" style={{ color: textColor }}>Purchase Complete!</p>
                <p className="text-sm mt-1" style={{ color: `${textColor}50` }}>Starting download...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0"
                    style={{ backgroundColor: `${secondaryColor}20` }}>
                    {purchaseTrack.cover_artwork_url
                      ? <img src={purchaseTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-5 h-5" style={{ color: `${textColor}30` }} />
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: textColor }}>{purchaseTrack.title}</p>
                    <p className="text-sm" style={{ color: `${textColor}50` }}>{artist.artist_name}</p>
                  </div>
                  <p className="text-xl font-bold flex-shrink-0" style={{ color: secondaryColor }}>
                    ${purchaseTrack.download_price}
                  </p>
                </div>

                <div className="rounded-xl p-3 text-center"
                  style={{ backgroundColor: `${textColor}05`, border: `1px solid ${textColor}10` }}>
                  <p className="text-xs" style={{ color: `${textColor}40` }}>
                    High-quality MP3 download delivered instantly after payment
                  </p>
                </div>

                {purchaseError && (
                  <p className="text-xs text-red-400 text-center">{purchaseError}</p>
                )}

                {!paypalReady && !purchaseError && (
                  <div className="flex justify-center py-3">
                    <Loader className="w-5 h-5 animate-spin text-white/30" />
                  </div>
                )}

                <div id="paypal-checkout-container" 
                  style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '4px' }} />

                <button onClick={() => setPurchaseTrack(null)} disabled={purchasing}
                  className="w-full py-2.5 rounded-xl text-sm transition"
                  style={{ color: `${textColor}40` }}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="px-6 pt-8 pb-4 text-center">
        <p className="text-[11px]" style={{ color: `${textColor}20` }}>
          Powered by <span className="font-medium" style={{ color: `${textColor}30` }}>Feelz Machine</span>
        </p>
      </div>
    </div>
  );
}


