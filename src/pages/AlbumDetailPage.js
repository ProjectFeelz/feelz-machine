import React, { useState, useEffect } from 'react';
import { downloadTrack } from '../utils/downloadTrack';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import {
  ArrowLeft, Play, Pause, Music, Loader, Download,
  Heart, Share2, Check, ListMusic
} from 'lucide-react';

function formatDuration(s) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export default function AlbumDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [album, setAlbum] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [likedTracks, setLikedTracks] = useState({});
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(null); // track id
  const [playlists, setPlaylists] = useState([]);
  const [addingTo, setAddingTo] = useState(null);
  const [addedTo, setAddedTo] = useState({});

  useEffect(() => { fetchAlbum(); }, [id]);

  useEffect(() => {
    if (user && showAddToPlaylist) fetchPlaylists();
  }, [showAddToPlaylist, user]);

  const fetchAlbum = async () => {
    setLoading(true);
    try {
      const { data: albumData } = await supabase
        .from('albums')
        .select('*, artists(id, artist_name, slug, profile_image_url, is_verified)')
        .or(`id.eq.${id},slug.eq.${id}`)
        .maybeSingle();

      if (!albumData) { navigate('/browse'); return; }
      setAlbum(albumData);
      setArtist(albumData.artists);

      const { data: trackData } = await supabase
        .from('tracks')
        .select('*')
        .eq('album_id', id)
        .eq('is_published', true)
        .order('track_number', { ascending: true });
      setTracks(trackData || []);

      if (user) {
        const { data: likes } = await supabase
          .from('track_likes').select('track_id').eq('user_id', user.id);
        const likeMap = {};
        (likes || []).forEach(l => { likeMap[l.track_id] = true; });
        setLikedTracks(likeMap);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const fetchPlaylists = async () => {
    const { data } = await supabase
      .from('playlists').select('id, name').eq('user_id', user.id).order('name');
    setPlaylists(data || []);
  };

  const handlePlay = (track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(
      { ...track, artist_name: artist?.artist_name },
      tracks.map(t => ({ ...t, artist_name: artist?.artist_name }))
    );
  };

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    playTrack(
      { ...tracks[0], artist_name: artist?.artist_name },
      tracks.map(t => ({ ...t, artist_name: artist?.artist_name }))
    );
  };

  const handleLike = async (track, e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    const isLiked = likedTracks[track.id];
    setLikedTracks(prev => ({ ...prev, [track.id]: !isLiked }));
    if (isLiked) {
      await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id);
    } else {
      await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id, artist_id: artist?.id });
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: album.title, text: `${album.title} by ${artist?.artist_name} on Feelz Machine`, url }); }
      catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = async (track, e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    setDownloading(track.id);
    try {
      await supabase.from('downloads').insert({ user_id: user.id, track_id: track.id, artist_id: artist?.id });
      const a = document.createElement('a');
      a.href = track.file_url;
      await downloadTrack(track.file_url, track.title);
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
    setDownloading(null);
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
    setTimeout(() => {
      setAddedTo(prev => { const n = { ...prev }; delete n[`${playlistId}-${trackId}`]; return n; });
    }, 2000);
  };

  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const totalMins = Math.round(totalDuration / 60);

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader className="w-6 h-6 animate-spin text-white/30" />
    </div>
  );

  if (!album) return null;

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      {/* Header */}
      <div className="relative">
        {/* Banner / artwork background */}
        <div className="relative h-64 overflow-hidden">
          {album.cover_artwork_url ? (
            <img src={album.cover_artwork_url} alt="" className="w-full h-full object-cover blur-xl scale-110 opacity-40" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/[0.02]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/60 to-black" />
        </div>

        {/* Back + share */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-5">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <button onClick={handleShare}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-md">
            {copied
              ? <Check className="w-4 h-4 text-green-400" />
              : <Share2 className="w-4 h-4 text-white" />
            }
          </button>
        </div>

        {/* Album info */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-5 flex items-end space-x-4">
          <div className="w-28 h-28 rounded-xl overflow-hidden bg-white/[0.06] flex-shrink-0 shadow-2xl">
            {album.cover_artwork_url
              ? <img src={album.cover_artwork_url} alt={album.title} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><Music className="w-10 h-10 text-white/20" /></div>
            }
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1">
              {album.release_type?.toUpperCase() || 'ALBUM'}
            </p>
            <h1 className="text-2xl font-bold text-white leading-tight truncate">{album.title}</h1>
            <button onClick={() => artist?.slug && navigate(`/artist/${artist.slug}`)}
              className="text-sm text-white/60 hover:text-white transition mt-0.5">
              {artist?.artist_name}
            </button>
            <p className="text-xs text-white/25 mt-1">
              {tracks.length} track{tracks.length !== 1 ? 's' : ''}
              {totalMins > 0 && ` · ${totalMins} min`}
              {album.release_date && ` · ${new Date(album.release_date).getFullYear()}`}
            </p>
          </div>
        </div>
      </div>

      {/* Play button */}
      <div className="px-5 py-4 flex items-center space-x-3">
        <button onClick={handlePlayAll}
          className="flex items-center space-x-2 px-6 py-3 bg-white text-black rounded-full font-semibold text-sm hover:bg-white/90 active:scale-95 transition">
          <Play className="w-4 h-4" fill="black" />
          <span>Play All</span>
        </button>
        {album.description && (
          <p className="text-xs text-white/30 flex-1 line-clamp-2">{album.description}</p>
        )}
      </div>

      {/* Tracks */}
      <div className="px-4">
        {tracks.length === 0 ? (
          <div className="text-center py-16">
            <Music className="w-10 h-10 mx-auto text-white/10 mb-3" />
            <p className="text-white/30 text-sm">No tracks published yet</p>
          </div>
        ) : tracks.map((track, i) => {
          const isActive = currentTrack?.id === track.id;
          const isTrackPlaying = isActive && isPlaying;
          return (
            <div key={track.id}
              className={`flex items-center space-x-3 px-2 py-3 rounded-xl transition ${isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
              {/* Index / playing indicator */}
              <div className="w-6 flex items-center justify-center flex-shrink-0">
                {isActive ? (
                  isTrackPlaying ? (
                    <div className="flex items-end space-x-0.5 h-4">
                      <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '100%' }} />
                      <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0.15s' }} />
                      <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '80%', animationDelay: '0.3s' }} />
                    </div>
                  ) : <Pause className="w-3.5 h-3.5 text-white" />
                ) : (
                  <span className="text-xs text-white/25">{track.track_number || i + 1}</span>
                )}
              </div>

              {/* Title + info */}
              <button onClick={() => handlePlay(track)} className="flex-1 min-w-0 text-left">
                <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-white/80'}`}>{track.title}</p>
                <div className="flex items-center space-x-2 mt-0.5">
                  {track.is_explicit && (
                    <span className="text-[9px] font-bold px-1 py-0.5 bg-white/10 text-white/40 rounded">E</span>
                  )}
                  <span className="text-xs text-white/30">{formatNumber(track.stream_count || 0)} plays</span>
                  {track.duration && <span className="text-xs text-white/20">{formatDuration(track.duration)}</span>}
                </div>
              </button>

              {/* Actions */}
              <div className="flex items-center space-x-1 flex-shrink-0">
                <button onClick={(e) => handleLike(track, e)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition active:scale-90">
                  <Heart className="w-4 h-4" fill={likedTracks[track.id] ? '#ef4444' : 'none'} color={likedTracks[track.id] ? '#ef4444' : 'rgba(255,255,255,0.25)'} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowAddToPlaylist(showAddToPlaylist === track.id ? null : track.id); }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition active:scale-90">
                  <ListMusic className="w-4 h-4 text-white/25 hover:text-white/60 transition" />
                </button>
                {track.is_downloadable && (
                  <button onClick={(e) => handleDownload(track, e)} disabled={downloading === track.id}
                    className="w-8 h-8 flex items-center justify-center rounded-lg transition active:scale-90 disabled:opacity-30">
                    {downloading === track.id
                      ? <Loader className="w-4 h-4 animate-spin text-white/40" />
                      : <Download className="w-4 h-4 text-white/25 hover:text-white/60 transition" />
                    }
                  </button>
                )}
              </div>

              {/* Add to playlist dropdown */}
              {showAddToPlaylist === track.id && (
                <div className="absolute right-4 mt-32 z-50 w-56 bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <p className="text-xs font-semibold text-white/60">Add to Playlist</p>
                    <button onClick={() => setShowAddToPlaylist(null)}>
                      <span className="text-white/30 text-lg leading-none">×</span>
                    </button>
                  </div>
                  {playlists.length === 0 ? (
                    <div className="px-4 py-3">
                      <p className="text-xs text-white/30">No playlists yet</p>
                      <button onClick={() => navigate('/library/playlists')} className="text-xs text-white/50 hover:text-white mt-1 transition">
                        Create one →
                      </button>
                    </div>
                  ) : playlists.map(pl => {
                    const key = `${pl.id}-${track.id}`;
                    const done = addedTo[key];
                    return (
                      <button key={pl.id}
                        onClick={() => handleAddToPlaylist(pl.id, track.id)}
                        disabled={addingTo === pl.id}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.04] transition text-left">
                        <span className="text-sm text-white/70 truncate">{pl.name}</span>
                        {done
                          ? <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                          : addingTo === pl.id
                          ? <Loader className="w-3.5 h-3.5 animate-spin text-white/30 flex-shrink-0" />
                          : null
                        }
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


