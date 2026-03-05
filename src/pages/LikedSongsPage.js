import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { Heart, Play, Pause, Music, ArrowLeft, Loader, Shuffle, Search, X, MoreHorizontal, ListMusic, Check } from 'lucide-react';

function formatDuration(s) {
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export default function LikedSongsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay, addToQueue, playNextInQueue } = usePlayer();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [menuTrack, setMenuTrack] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [addingTo, setAddingTo] = useState(null);
  const [addedTo, setAddedTo] = useState({});

  useEffect(() => { if (user) fetchLiked(); }, [user]);

  const fetchLiked = async () => {
    const { data } = await supabase
      .from('track_likes')
      .select('*, track:tracks(id, title, file_url, cover_artwork_url, duration, artist_id, artist:artists(id, artist_name, slug))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setTracks((data || []).filter(l => l.track));
    setLoading(false);
  };

  const filtered = tracks.filter(({ track }) =>
    !search || track.title.toLowerCase().includes(search.toLowerCase()) ||
    track.artist?.artist_name?.toLowerCase().includes(search.toLowerCase())
  );

  const allTracks = filtered.map(l => ({ ...l.track, artist_name: l.track.artist?.artist_name }));

  const handlePlay = (track) => {
    const enriched = { ...track, artist_name: track.artist?.artist_name };
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(enriched, allTracks);
  };

  const handlePlayAll = () => {
    if (allTracks.length === 0) return;
    playTrack(allTracks[0], allTracks);
  };

  const handleShuffle = () => {
    if (allTracks.length === 0) return;
    const shuffled = [...allTracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  const fetchPlaylists = async () => {
    const { data } = await supabase.from('playlists').select('id, name').eq('user_id', user.id).order('name');
    setPlaylists(data || []);
  };

  const handleAddToPlaylist = async (playlistId, trackId) => {
    setAddingTo(playlistId);
    const { data: existing } = await supabase.from('playlist_tracks').select('id')
      .eq('playlist_id', playlistId).eq('track_id', trackId).maybeSingle();
    if (!existing) {
      const { data: last } = await supabase.from('playlist_tracks').select('position')
        .eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle();
      await supabase.from('playlist_tracks').insert({ playlist_id: playlistId, track_id: trackId, position: (last?.position ?? -1) + 1 });
    }
    setAddedTo(prev => ({ ...prev, [`${playlistId}-${trackId}`]: true }));
    setAddingTo(null);
    setTimeout(() => { setAddedTo({}); setMenuTrack(null); setShowPlaylists(false); }, 1500);
  };

  return (
    <div className="pt-14 md:pt-0 pb-32 px-4 max-w-2xl md:max-w-4xl mx-auto">
      <div className="flex items-center space-x-3 mb-4">
        <button onClick={() => navigate('/library')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Liked Songs</h1>
          <p className="text-xs text-white/30">{tracks.length} tracks</p>
        </div>
        <button onClick={() => { setShowSearch(p => !p); setSearch(''); }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          {showSearch ? <X className="w-4 h-4 text-white/60" /> : <Search className="w-4 h-4 text-white/60" />}
        </button>
      </div>

      {showSearch && (
        <div className="mb-4">
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search liked songs..."
            className="w-full px-4 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/30 outline-none" />
        </div>
      )}

      {tracks.length > 0 && (
        <div className="flex items-center space-x-3 mb-5">
          <button onClick={handlePlayAll}
            className="flex items-center space-x-2 px-5 py-2.5 bg-white text-black rounded-full font-semibold text-sm active:scale-95 transition">
            <Play className="w-4 h-4" fill="black" /><span>Play All</span>
          </button>
          <button onClick={handleShuffle}
            className="flex items-center space-x-2 px-5 py-2.5 bg-white/[0.08] text-white rounded-full font-semibold text-sm active:scale-95 transition hover:bg-white/[0.12]">
            <Shuffle className="w-4 h-4" /><span>Shuffle</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">{search ? 'No results found' : 'No liked songs yet'}</p>
          {!search && <p className="text-white/15 text-xs mt-1">Tap the heart on any track to save it here</p>}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(({ track }, i) => {
            const isActive = currentTrack?.id === track.id;
            const isTrackPlaying = isActive && isPlaying;
            return (
              <div key={track.id}
                className={`relative flex items-center space-x-3 p-3 rounded-xl transition group ${isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}>
                <div className="w-5 flex items-center justify-center flex-shrink-0">
                  {isActive && isTrackPlaying ? (
                    <div className="flex items-end space-x-0.5 h-3">
                      <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '100%' }} />
                      <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0.15s' }} />
                      <div className="w-0.5 bg-white rounded-full animate-pulse" style={{ height: '80%', animationDelay: '0.3s' }} />
                    </div>
                  ) : (
                    <span className="text-xs text-white/20">{i + 1}</span>
                  )}
                </div>
                <div className="relative w-10 h-10 flex-shrink-0 cursor-pointer" onClick={() => handlePlay(track)}>
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    : <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>
                  }
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition">
                    {isTrackPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white" />}
                  </div>
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handlePlay(track)}>
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-white/90'}`}>{track.title}</p>
                  <button onClick={(e) => { e.stopPropagation(); track.artist?.slug && navigate(`/artist/${track.artist.slug}`); }}
                    className="text-xs text-white/30 hover:text-white/50 transition truncate text-left">
                    {track.artist?.artist_name}
                  </button>
                </div>
                {track.duration && <span className="text-xs text-white/20 flex-shrink-0">{formatDuration(track.duration)}</span>}
                <button onClick={(e) => { e.stopPropagation(); setMenuTrack(menuTrack?.id === track.id ? null : track); setShowPlaylists(false); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition flex-shrink-0">
                  <MoreHorizontal className="w-4 h-4 text-white/30" />
                </button>

                {menuTrack?.id === track.id && (
                  <div className="absolute right-2 top-14 z-50 w-52 rounded-xl shadow-2xl overflow-hidden"
                    style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }}
                    onClick={e => e.stopPropagation()}>
                    {showPlaylists ? (
                      <>
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                          <button onClick={() => setShowPlaylists(false)} className="text-white/30 hover:text-white/60 text-sm">← Back</button>
                          <p className="text-xs font-semibold text-white/50">Add to Playlist</p>
                          <button onClick={() => setMenuTrack(null)}><X className="w-3.5 h-3.5 text-white/30" /></button>
                        </div>
                        {playlists.length === 0 ? (
                          <div className="px-4 py-3">
                            <p className="text-xs text-white/30">No playlists yet</p>
                            <button onClick={() => navigate('/library/playlists')} className="text-xs text-white/50 hover:text-white mt-1 transition">Create one →</button>
                          </div>
                        ) : playlists.map(pl => (
                          <button key={pl.id} onClick={() => handleAddToPlaylist(pl.id, track.id)}
                            disabled={addingTo === pl.id}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.04] transition text-left">
                            <span className="text-sm text-white/70 truncate">{pl.name}</span>
                            {addedTo[`${pl.id}-${track.id}`] && <Check className="w-3.5 h-3.5 text-green-400" />}
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        <button onClick={() => { playNextInQueue({ ...track, artist_name: track.artist?.artist_name }); setMenuTrack(null); }}
                          className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                          <Play className="w-4 h-4 text-white/50" /><span className="text-sm text-white/70">Play Next</span>
                        </button>
                        <button onClick={() => { addToQueue({ ...track, artist_name: track.artist?.artist_name }); setMenuTrack(null); }}
                          className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                          <ListMusic className="w-4 h-4 text-white/50" /><span className="text-sm text-white/70">Add to Queue</span>
                        </button>
                        <button onClick={() => { fetchPlaylists(); setShowPlaylists(true); }}
                          className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left">
                          <ListMusic className="w-4 h-4 text-white/50" /><span className="text-sm text-white/70">Add to Playlist</span>
                        </button>
                        {track.artist?.slug && (
                          <button onClick={() => { navigate(`/artist/${track.artist.slug}`); setMenuTrack(null); }}
                            className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left border-t border-white/[0.05]">
                            <span className="text-sm text-white/40">View Artist</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

