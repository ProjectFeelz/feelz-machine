import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import {
  ArrowLeft, Play, Pause, Music, Loader, Trash2,
  Plus, Search, X, Globe, Lock, MoreVertical
} from 'lucide-react';

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlaylistDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddTracks, setShowAddTracks] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) fetchPlaylist();
  }, [id]);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      searchTracks(searchQuery.trim());
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const fetchPlaylist = async () => {
    setLoading(true);
    const { data: pl } = await supabase
      .from('playlists')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!pl) { navigate('/library/playlists'); return; }
    setPlaylist(pl);
    setNewName(pl.name);

    const { data: ptData } = await supabase
      .from('playlist_tracks')
      .select('*, track:tracks(id, title, file_url, cover_artwork_url, duration, stream_count, artist:artists(id, artist_name, slug))')
      .eq('playlist_id', id)
      .order('position', { ascending: true });

    setTracks((ptData || []).filter(pt => pt.track));
    setLoading(false);
  };

  const searchTracks = async (q) => {
    setSearching(true);
    const { data } = await supabase
      .from('tracks')
      .select('id, title, cover_artwork_url, duration, artist:artists(id, artist_name, slug)')
      .eq('is_published', true)
      .ilike('title', `%${q}%`)
      .limit(10);

    // Filter out already-added tracks
    const addedIds = tracks.map(pt => pt.track.id);
    setSearchResults((data || []).filter(t => !addedIds.includes(t.id)));
    setSearching(false);
  };

  const addTrack = async (track) => {
    if (adding) return;
    setAdding(track.id);
    const position = tracks.length;
    const { error } = await supabase.from('playlist_tracks').insert({
      playlist_id: id,
      track_id: track.id,
      position,
    });
    if (!error) {
      setTracks(prev => [...prev, { track, position }]);
      setSearchResults(prev => prev.filter(t => t.id !== track.id));
    }
    setAdding(null);
  };

  const removeTrack = async (trackId, e) => {
    e.stopPropagation();
    setRemoving(trackId);
    await supabase.from('playlist_tracks')
      .delete()
      .eq('playlist_id', id)
      .eq('track_id', trackId);
    setTracks(prev => prev.filter(pt => pt.track.id !== trackId));
    setRemoving(null);
  };

  const saveName = async () => {
    if (!newName.trim() || newName === playlist.name) { setEditingName(false); return; }
    setSaving(true);
    await supabase.from('playlists').update({ name: newName.trim() }).eq('id', id);
    setPlaylist(prev => ({ ...prev, name: newName.trim() }));
    setEditingName(false);
    setSaving(false);
  };

  const togglePublic = async () => {
    const newVal = !playlist.is_public;
    await supabase.from('playlists').update({ is_public: newVal }).eq('id', id);
    setPlaylist(prev => ({ ...prev, is_public: newVal }));
  };

  const handlePlay = (track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(track, tracks.map(pt => pt.track));
  };

  const playAll = () => {
    if (tracks.length === 0) return;
    playTrack(tracks[0].track, tracks.map(pt => pt.track));
  };

  const isOwner = playlist?.user_id === user?.id;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="pt-14 pb-32 px-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/library/playlists')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                autoFocus
                className="flex-1 px-3 py-1.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none"
              />
              <button onClick={saveName} disabled={saving}
                className="px-3 py-1.5 bg-white text-black rounded-lg text-xs font-medium">
                {saving ? '...' : 'Save'}
              </button>
              <button onClick={() => setEditingName(false)}
                className="p-1.5 bg-white/[0.06] rounded-lg">
                <X className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>
          ) : (
            <div>
              <button onClick={() => isOwner && setEditingName(true)}
                className="text-xl font-bold text-white hover:text-white/80 transition text-left">
                {playlist?.name}
              </button>
              <p className="text-xs text-white/30">{tracks.length} tracks</p>
            </div>
          )}
        </div>

        {/* Controls */}
        {isOwner && (
          <div className="flex items-center space-x-2">
            <button onClick={togglePublic}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] text-xs text-white/50 hover:bg-white/[0.1] transition">
              {playlist?.is_public ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{playlist?.is_public ? 'Public' : 'Private'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Play all + Add tracks */}
      <div className="flex items-center space-x-3 mb-6">
        {tracks.length > 0 && (
          <button onClick={playAll}
            className="flex items-center space-x-2 px-5 py-2.5 bg-white text-black rounded-full text-sm font-semibold hover:bg-white/90 transition">
            <Play className="w-4 h-4" fill="black" />
            <span>Play All</span>
          </button>
        )}
        {isOwner && (
          <button onClick={() => setShowAddTracks(!showAddTracks)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-white/[0.06] text-white rounded-full text-sm font-medium hover:bg-white/[0.1] transition">
            <Plus className="w-4 h-4" />
            <span>Add Tracks</span>
          </button>
        )}
      </div>

      {/* Add Tracks Panel */}
      {showAddTracks && (
        <div className="mb-6 bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Add Tracks</h3>
            <button onClick={() => { setShowAddTracks(false); setSearchQuery(''); setSearchResults([]); }}>
              <X className="w-4 h-4 text-white/30" />
            </button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tracks..."
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] rounded-lg text-sm text-white placeholder-white/20 outline-none focus:bg-white/[0.1] transition"
            />
            {searching && (
              <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-white/30" />
            )}
          </div>
          {searchResults.length > 0 ? (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {searchResults.map(track => (
                <div key={track.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white/[0.04] transition">
                  <div className="w-9 h-9 rounded-md overflow-hidden bg-white/[0.06] flex-shrink-0">
                    {track.cover_artwork_url
                      ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-3.5 h-3.5 text-white/20" /></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{track.title}</p>
                    <p className="text-xs text-white/30 truncate">{track.artist?.artist_name}</p>
                  </div>
                  <button onClick={() => addTrack(track)} disabled={adding === track.id}
                    className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
                    {adding === track.id
                      ? <Loader className="w-3.5 h-3.5 animate-spin text-white/40" />
                      : <Plus className="w-3.5 h-3.5 text-white/60" />
                    }
                  </button>
                </div>
              ))}
            </div>
          ) : searchQuery.length >= 2 && !searching ? (
            <p className="text-center text-white/20 text-xs py-4">No tracks found</p>
          ) : searchQuery.length < 2 ? (
            <p className="text-center text-white/20 text-xs py-4">Type at least 2 characters to search</p>
          ) : null}
        </div>
      )}

      {/* Track List */}
      {tracks.length === 0 ? (
        <div className="text-center py-20">
          <Music className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">No tracks yet</p>
          {isOwner && (
            <button onClick={() => setShowAddTracks(true)}
              className="mt-4 px-4 py-2 bg-white/[0.06] rounded-lg text-sm text-white/50 hover:bg-white/[0.1] transition">
              Add your first track
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {tracks.map(({ track }, i) => (
            <div key={track.id}
              className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/[0.04] transition group cursor-pointer"
              onClick={() => handlePlay(track)}>
              <span className="text-xs text-white/20 w-5 text-right flex-shrink-0">{i + 1}</span>
              <div className="relative w-10 h-10 flex-shrink-0">
                {track.cover_artwork_url
                  ? <img src={track.cover_artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  : <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>
                }
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition">
                  {currentTrack?.id === track.id && isPlaying
                    ? <Pause className="w-4 h-4 text-white" />
                    : <Play className="w-4 h-4 text-white" />
                  }
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${currentTrack?.id === track.id ? 'text-green-400' : 'text-white'}`}>
                  {track.title}
                </p>
                <p className="text-xs text-white/30 truncate">{track.artist?.artist_name}</p>
              </div>
              {track.duration && (
                <span className="text-xs text-white/20 flex-shrink-0">{formatDuration(track.duration)}</span>
              )}
              {isOwner && (
                <button onClick={(e) => removeTrack(track.id, e)} disabled={removing === track.id}
                  className="flex-shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition">
                  {removing === track.id
                    ? <Loader className="w-3.5 h-3.5 animate-spin text-white/30" />
                    : <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  }
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
