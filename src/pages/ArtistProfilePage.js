import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import {
  ArrowLeft, Play, Pause, Share2, UserPlus, UserCheck,
  Instagram, Twitter, Youtube, MessageCircle, Globe, Music,
  Loader, ChevronRight, ExternalLink, Verified, Heart
} from 'lucide-react';

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
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (slug) fetchArtist();
  }, [slug]);

  const fetchArtist = async () => {
    setLoading(true);
    try {
      // Fetch artist
      const { data: artistData, error } = await supabase
        .from('artists')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error || !artistData) { setLoading(false); return; }
      setArtist(artistData);
      setFollowerCount(artistData.follower_count || 0);

      // Fetch theme
      const { data: themeData } = await supabase
        .from('artist_themes')
        .select('*')
        .eq('artist_id', artistData.id)
        .single();
      if (themeData) setTheme(themeData);

      // Fetch published tracks
      const { data: trackData } = await supabase
        .from('tracks')
        .select('*, albums(title, cover_artwork_url)')
        .eq('artist_id', artistData.id)
        .eq('is_published', true)
        .order('engagement_score', { ascending: false });
      setTracks(trackData || []);

      // Fetch published albums
      const { data: albumData } = await supabase
        .from('albums')
        .select('*')
        .eq('artist_id', artistData.id)
        .eq('is_published', true)
        .order('release_date', { ascending: false });
      setAlbums(albumData || []);

      // Check follow status
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
        await supabase.from('follows').insert({
          artist_id: artist.id, follower_id: user.id
        });
        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Follow error:', err);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: artist.artist_name, text: `Check out ${artist.artist_name} on Feelz Machine`, url });
      } catch (e) { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePlayTrack = (track, index) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack({ ...track, artist_name: artist.artist_name }, tracks.map(t => ({ ...t, artist_name: artist.artist_name })));
    }
  };

  // Build CSS custom properties from theme
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

  // Google Fonts load
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
      {/* ========== BANNER ========== */}
      <div className="relative w-full" style={{ height: '280px' }}>
        {/* Background: banner image or gradient */}
        {artist.banner_image_url || theme?.banner_image_url ? (
          <img
            src={artist.banner_image_url || theme?.banner_image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0" style={{
            background: `linear-gradient(135deg, ${secondaryColor}40, ${accentColor}30, ${bgColor})`,
          }} />
        )}

        {/* Background image overlay */}
        {theme?.background_image_url && !artist.banner_image_url && !theme?.banner_image_url && (
          <img src={theme.background_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        )}

        {/* Gradient fade to background */}
        <div className="absolute inset-0" style={{
          background: `linear-gradient(to bottom, transparent 30%, ${bgColor} 100%)`,
        }} />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-5 z-10">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md"
            style={{ backgroundColor: `${bgColor}80` }}>
            <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
          </button>
          <button onClick={handleShare}
            className="w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md"
            style={{ backgroundColor: `${bgColor}80` }}>
            {copied ? <span className="text-xs" style={{ color: primaryColor }}>Copied!</span> : <Share2 className="w-4 h-4" style={{ color: textColor }} />}
          </button>
        </div>

        {/* Profile image */}
        <div className="absolute -bottom-12 left-6 z-10">
          <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 shadow-2xl"
            style={{ borderColor: bgColor, backgroundColor: `${secondaryColor}30` }}>
            {artist.profile_image_url ? (
              <img src={artist.profile_image_url} alt={artist.artist_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{
                background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})`,
              }}>
                <span className="text-3xl font-bold" style={{ color: textColor }}>
                  {artist.artist_name?.[0]?.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========== ARTIST INFO ========== */}
      <div className="px-6 pt-16">
        {/* Name + badges */}
        <div className="flex items-center space-x-2 mb-1">
          <h1 className="text-2xl font-bold" style={{ fontFamily: `"${headingFont}", sans-serif`, color: textColor }}>
            {artist.artist_name}
          </h1>
          {artist.is_verified && (
            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: accentColor }}>
              <Verified className="w-3 h-3" style={{ color: bgColor }} />
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center space-x-4 mb-4">
          <span className="text-sm" style={{ color: `${textColor}80` }}>
            {formatNumber(followerCount)} followers
          </span>
          <span className="text-sm" style={{ color: `${textColor}80` }}>
            {tracks.length} track{tracks.length !== 1 ? 's' : ''}
          </span>
          <span className="text-sm" style={{ color: `${textColor}80` }}>
            {formatNumber(artist.total_streams)} streams
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-3 mb-6">
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
            <button onClick={() => handlePlayTrack(tracks[0], 0)}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
              style={{ backgroundColor: `${secondaryColor}`, color: textColor }}>
              <Play className="w-4 h-4" fill={textColor} />
              <span>Play</span>
            </button>
          )}
        </div>

        {/* Bio */}
        {artist.bio && (
          <p className="text-sm leading-relaxed mb-6" style={{ color: `${textColor}90`, fontFamily: `"${bodyFont}", sans-serif` }}>
            {artist.bio}
          </p>
        )}

        {/* Social links */}
        {socialEntries.length > 0 && (
          <div className="flex items-center space-x-3 mb-8">
            {socialEntries.map(([platform, value]) => {
              const Icon = SOCIAL_ICONS[platform] || Globe;
              const prefix = SOCIAL_URLS[platform] || '';
              const href = value.startsWith('http') ? value : (prefix ? `${prefix}${value}` : value);
              const isLink = href.startsWith('http');

              return isLink ? (
                <a key={platform} href={href} target="_blank" rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                  style={{ backgroundColor: `${textColor}10` }}>
                  <Icon className="w-4.5 h-4.5" style={{ color: `${textColor}70` }} />
                </a>
              ) : (
                <div key={platform}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${textColor}10` }}
                  title={value}>
                  <Icon className="w-4.5 h-4.5" style={{ color: `${textColor}70` }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========== ALBUMS ========== */}
      {albums.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold px-6 mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>
            Releases
          </h2>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {albums.map(album => (
              <div key={album.id} className="flex-shrink-0 w-36 cursor-pointer group">
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

      {/* ========== TRACKS ========== */}
      {tracks.length > 0 && (
        <div className="px-6 mb-8">
          <h2 className="text-lg font-bold mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>
            Popular
          </h2>
          <div className="space-y-1">
            {visibleTracks.map((track, i) => {
              const isActive = currentTrack?.id === track.id;
              const isTrackPlaying = isActive && isPlaying;

              return (
                <button key={track.id} onClick={() => handlePlayTrack(track, i)}
                  className="w-full flex items-center space-x-3 p-2.5 rounded-lg transition-all active:scale-[0.98]"
                  style={{ backgroundColor: isActive ? `${secondaryColor}15` : 'transparent' }}>
                  {/* Number / play icon */}
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

                  {/* Artwork */}
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

                  {/* Info */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate" style={{
                      color: isActive ? secondaryColor : textColor
                    }}>{track.title}</p>
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

                  {/* Duration */}
                  {track.duration && (
                    <span className="text-xs flex-shrink-0" style={{ color: `${textColor}30` }}>
                      {formatDuration(track.duration)}
                    </span>
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

      {/* ========== EMPTY STATE ========== */}
      {tracks.length === 0 && albums.length === 0 && (
        <div className="px-6 py-12 text-center">
          <Music className="w-12 h-12 mx-auto mb-3" style={{ color: `${textColor}15` }} />
          <p className="text-sm" style={{ color: `${textColor}40` }}>
            No music published yet. Stay tuned!
          </p>
        </div>
      )}

      {/* ========== FOOTER ========== */}
      <div className="px-6 pt-8 pb-4 text-center">
        <p className="text-[11px]" style={{ color: `${textColor}20` }}>
          Powered by <span className="font-medium" style={{ color: `${textColor}30` }}>Feelz Machine</span>
        </p>
      </div>
    </div>
  );
}
