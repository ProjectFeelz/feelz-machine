import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, MoreHorizontal, Heart, ListMusic, Share2, Download, Check, Loader, X } from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function TrackCard({ track, trackList = [], showArtwork = true, index }) {
  const { currentTrack, isPlaying, playTrack } = usePlayer();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCurrentTrack = currentTrack?.id === track.id;
  const isCurrentAndPlaying = isCurrentTrack && isPlaying;

  const [showMenu, setShowMenu] = useState(false);
  const [liked, setLiked] = useState(false);
  const [shared, setShared] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [addingTo, setAddingTo] = useState(null);
  const [addedTo, setAddedTo] = useState({});
  const menuRef = useRef(null);

  useEffect(() => {
    if (!user || !track.id) return;
    supabase.from('track_likes').select('id').eq('track_id', track.id).eq('user_id', user.id)
      .maybeSingle().then(({ data }) => setLiked(!!data));
  }, [track.id, user?.id]);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
        setShowPlaylists(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const handlePlay = (e) => {
    e.stopPropagation();
    playTrack(track, trackList);
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    setLiked(prev => !prev);
    if (liked) {
      await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id);
    } else {
      await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id, artist_id: track.artist_id || null });
    }
  };

  const handleShare = async (e) => {
    e.stopPropagation();
    const artistSlug = track.artist_slug || track.slug || '';
    const url = artistSlug
      ? `${window.location.origin}/player/artist/${artistSlug}`
      : window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: track.title, text: `${track.title} by ${track.artist_name}`, url }); }
      catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
    setShowMenu(false);
  };

  const handleDownload = async (e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    if (!track.file_url) return;
    setDownloading(true);
    try {
      await supabase.from('downloads').insert({ user_id: user.id, track_id: track.id, artist_id: track.artist_id || null });
      const a = document.createElement('a');
      a.href = track.file_url;
      a.download = `${track.title.replace(/[^a-z0-9\s-]/gi, '').trim() || 'track'}.mp3`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
    setDownloading(false);
    setShowMenu(false);
  };

  const loadPlaylists = async (e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    const { data } = await supabase.from('playlists').select('id, name').eq('user_id', user.id).order('name');
    setPlaylists(data || []);
    setShowPlaylists(true);
  };

  const handleAddToPlaylist = async (playlistId) => {
    setAddingTo(playlistId);
    const { data: existing } = await supabase.from('playlist_tracks').select('id')
      .eq('playlist_id', playlistId).eq('track_id', track.id).maybeSingle();
    if (!existing) {
      const { data: last } = await supabase.from('playlist_tracks').select('position')
        .eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle();
      await supabase.from('playlist_tracks').insert({ playlist_id: playlistId, track_id: track.id, position: (last?.position ?? -1) + 1 });
    }
    setAddedTo(prev => ({ ...prev, [playlistId]: true }));
    setAddingTo(null);
    setTimeout(() => {
      setAddedTo(prev => { const n = { ...prev }; delete n[playlistId]; return n; });
      setShowMenu(false);
      setShowPlaylists(false);
    }, 1500);
  };

  const formatDuration = (secs) => {
    if (!secs) return '';
    return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  };

  return (
    <div
      onClick={handlePlay}
      className={`relative flex items-center space-x-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isCurrentTrack ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04] active:bg-white/[0.06]'
      }`}
    >
      {/* Index or artwork */}
      {showArtwork ? (
        <div className="relative w-11 h-11 rounded-md overflow-hidden bg-white/[0.06] flex-shrink-0 group">
          {track.cover_artwork_url ? (
            <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              <span className="text-sm">&#9835;</span>
            </div>
          )}
          <div className={`absolute inset-0 flex items-center justify-center bg-black/40 ${
            isCurrentAndPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          } transition-opacity`}>
            {isCurrentAndPlaying
              ? <Pause className="w-4 h-4 text-white" fill="white" />
              : <Play className="w-4 h-4 text-white ml-0.5" fill="white" />
            }
          </div>
        </div>
      ) : (
        <div className="w-7 flex-shrink-0 text-center">
          {isCurrentAndPlaying ? (
            <div className="flex items-center justify-center space-x-[2px]">
              <div className="w-[3px] h-3 bg-white rounded-full animate-pulse" />
              <div className="w-[3px] h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.15s' }} />
              <div className="w-[3px] h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
            </div>
          ) : (
            <span className={`text-sm tabular-nums ${isCurrentTrack ? 'text-white' : 'text-white/30'}`}>
              {index != null ? index + 1 : ''}
            </span>
          )}
        </div>
      )}

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p className={`text-base font-medium truncate ${isCurrentTrack ? 'text-white' : 'text-white/90'}`}>
          {track.title}
        </p>
        <p className="text-sm text-white/40 truncate">
          {track.artist_name || 'Unknown Artist'}
          {track.is_explicit && (
            <span className="inline-block ml-1.5 px-1 py-0.5 text-[9px] bg-white/10 rounded text-white/50 font-medium leading-none">E</span>
          )}
        </p>
      </div>

      {/* Duration + like + more */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        <span className="text-xs text-white/30 tabular-nums mr-1">{formatDuration(track.duration)}</span>
        <button onClick={handleLike}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition active:scale-90"
          title="Like">
          <Heart className="w-4 h-4" fill={liked ? '#ef4444' : 'none'} color={liked ? '#ef4444' : 'rgba(255,255,255,0.3)'} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(prev => !prev); setShowPlaylists(false); }}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition"
        >
          <MoreHorizontal className="w-4 h-4 text-white/30" />
        </button>
      </div>

      {/* Options menu */}
      {showMenu && (
        <div ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 z-50 w-52 rounded-xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', bottom: '110%' }}>

          {showPlaylists ? (
            <>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                <button onClick={(e) => { e.stopPropagation(); setShowPlaylists(false); }}
                  className="text-white/30 hover:text-white/60 transition text-sm">← Back</button>
                <p className="text-xs font-semibold text-white/50">Add to Playlist</p>
                <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}>
                  <X className="w-3.5 h-3.5 text-white/30" />
                </button>
              </div>
              {playlists.length === 0 ? (
                <div className="px-4 py-3">
                  <p className="text-xs text-white/30">No playlists yet</p>
                  <button onClick={() => navigate('/library/playlists')} className="text-xs text-white/50 hover:text-white mt-1 transition">
                    Create one →
                  </button>
                </div>
              ) : playlists.map(pl => (
                <button key={pl.id}
                  onClick={(e) => { e.stopPropagation(); handleAddToPlaylist(pl.id); }}
                  disabled={addingTo === pl.id}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.04] transition text-left">
                  <span className="text-sm text-white/70 truncate">{pl.name}</span>
                  {addedTo[pl.id]
                    ? <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    : addingTo === pl.id
                    ? <Loader className="w-3.5 h-3.5 animate-spin text-white/30 flex-shrink-0" />
                    : null
                  }
                </button>
              ))}
            </>
          ) : (
            <>
              <button onClick={handleShare}
                className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                {shared ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4 text-white/50" />}
                <span className="text-sm text-white/70">{shared ? 'Copied!' : 'Share'}</span>
              </button>
              <button onClick={loadPlaylists}
                className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                <ListMusic className="w-4 h-4 text-white/50" />
                <span className="text-sm text-white/70">Add to Playlist</span>
              </button>
              {track.is_downloadable && (
                <button onClick={handleDownload} disabled={downloading}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left disabled:opacity-40">
                  {downloading ? <Loader className="w-4 h-4 animate-spin text-white/50" /> : <Download className="w-4 h-4 text-white/50" />}
                  <span className="text-sm text-white/70">{downloading ? 'Downloading...' : 'Download'}</span>
                </button>
              )}
              {track.artist_slug || track.slug ? (
                <button onClick={(e) => { e.stopPropagation(); navigate(`/artist/${track.artist_slug || track.slug}`); setShowMenu(false); }}
                  className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left border-t border-white/[0.05]">
                  <span className="text-sm text-white/40">View Artist</span>
                </button>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}


