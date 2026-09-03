import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import TrackActionSheet from '../components/TrackActionSheet';
import { usePlayer } from '../contexts/PlayerContext';
import {
  ArrowLeft, Play, Pause, Music, Loader, Trash2,
  Plus, Search, X, Globe, Lock, MoreVertical, Users, Camera
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
  const [actionSheetTrack, setActionSheetTrack] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = React.useRef(null);

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

    if (pl.is_shared && user && pl.user_id !== user.id) {
      const { data: collabRow } = await supabase
        .from('playlist_collaborators')
        .select('can_edit')
        .eq('playlist_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      setIsCollaborator(!!collabRow?.can_edit);
    }

    if (pl.is_shared) {
      const { data: collabs } = await supabase
        .from('playlist_collaborators')
        .select('user_id')
        .eq('playlist_id', id);
      setCollaborators(collabs || []);
    }

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
    const updated = tracks
      .filter(pt => pt.track.id !== trackId)
      .map((pt, i) => ({ ...pt, position: i }));
    setTracks(updated);
    updated.forEach(pt => {
      supabase.from('playlist_tracks')
        .update({ position: pt.position })
        .eq('playlist_id', id)
        .eq('track_id', pt.track.id)
        .catch(() => {});
    });
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

  const copyShareLink = async () => {
    const url = `${window.location.origin}/library/playlists/join/${playlist.share_token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const uploadCover = async (file) => {
    if (!file || !isOwner) return;
    setCoverUploading(true);
    try {
      const ext  = file.name.split('.').pop();
      const path = `playlist-covers/${user?.id}/${id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('artist-images').upload(path, file, { upsert: true });
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('artist-images').getPublicUrl(path);
        await supabase.from('playlists').update({ cover_url: publicUrl }).eq('id', id);
        setPlaylist(prev => ({ ...prev, cover_url: publicUrl }));
      }
    } catch {}
    setCoverUploading(false);
  };

  const handlePlay = (track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    const queue = tracks.map(pt => pt.track).filter(Boolean);
    const idx   = queue.findIndex(t => t.id === track.id);
    playTrack(track, queue, idx >= 0 ? idx : 0);
  };

  const playAll = () => {
    if (tracks.length === 0) return;
    const queue = tracks.map(pt => pt.track).filter(Boolean);
    if (!queue.length) return;
    playTrack(queue[0], queue, 0);
  };

  const isOwner  = playlist?.user_id === user?.id;
  const canEdit  = isOwner || isCollaborator;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  const collageSrcs = tracks
    .map(pt => pt.track?.cover_artwork_url)
    .filter(Boolean)
    .slice(0, 4);
  const heroCover = playlist?.cover_url || (collageSrcs.length === 1 ? collageSrcs[0] : null);

  return (
    <div className="pb-32 max-w-4xl mx-auto">

      {/* ── Hero cover ── */}
      <div className="relative w-full overflow-hidden mb-0" style={{ height: 220 }}>
        {heroCover ? (
          <img src={heroCover} alt={playlist?.name} className="w-full h-full object-cover" />
        ) : collageSrcs.length >= 2 ? (
          <div className="w-full h-full grid grid-cols-2 grid-rows-2">
            {[0,1,2,3].map(i => (
              <div key={i} className="overflow-hidden">
                {collageSrcs[i]
                  ? <img src={collageSrcs[i]} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full" style={{ background: 'rgba(255,255,255,0.04)' }} />}
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.1))' }}>
            <Music className="w-16 h-16 text-white/10" />
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.75) 100%)' }} />
        {/* Back button */}
        <button onClick={() => navigate('/library/playlists')}
          className="absolute top-12 left-4 md:top-4 w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md"
          style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        {/* Upload cover — owners only */}
        {isOwner && (
          <label className="absolute top-12 right-4 md:top-4 w-9 h-9 flex items-center justify-center rounded-full cursor-pointer backdrop-blur-md"
            style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)' }}>
            {coverUploading
              ? <Loader className="w-4 h-4 animate-spin text-white" />
              : <Camera className="w-4 h-4 text-white" />}
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f); }} />
          </label>
        )}
        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
          {editingName ? (
            <div className="flex items-center space-x-2">
              <input type="text" value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                autoFocus
                className="flex-1 px-3 py-1.5 rounded-lg text-white text-lg font-bold outline-none"
                style={{ background: 'rgba(255,255,255,0.15)' }} />
              <button onClick={saveName} disabled={saving}
                className="px-3 py-1.5 bg-white text-black rounded-lg text-xs font-medium">
                {saving ? '...' : 'Save'}
              </button>
              <button onClick={() => setEditingName(false)}
                className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.15)' }}>
                <X className="w-3.5 h-3.5 text-white/70" />
              </button>
            </div>
          ) : (
            <button onClick={() => canEdit && setEditingName(true)} className="text-left">
              <p className="text-xl font-bold text-white drop-shadow-lg">{playlist?.name}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {tracks.length} tracks{canEdit ? ' · tap to rename' : ''}
              </p>
            </button>
          )}
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="px-4">
        <div className="flex items-center justify-between py-3 mb-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Play all + Add */}
          <div className="flex items-center space-x-2">
            {tracks.length > 0 && (
              <button onClick={playAll}
                className="flex items-center space-x-2 px-4 py-2 bg-white text-black rounded-full text-sm font-semibold hover:bg-white/90 transition">
                <Play className="w-3.5 h-3.5" fill="black" />
                <span>Play All</span>
              </button>
            )}
            {canEdit && (
              <button onClick={() => setShowAddTracks(!showAddTracks)}
                className="flex items-center space-x-1.5 px-3 py-2 text-white rounded-full text-sm font-medium transition"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            )}
          </div>
          {/* Right controls */}
          <div className="flex items-center space-x-2">
            {isOwner && (
              <button onClick={togglePublic}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 transition"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                {playlist?.is_public ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{playlist?.is_public ? 'Public' : 'Private'}</span>
              </button>
            )}
            {playlist?.is_shared && isOwner && (
              <button onClick={copyShareLink}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs text-blue-400 transition"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}>
                {copiedLink ? <span>✓ Copied!</span> : (
                  <><Users className="w-3.5 h-3.5" /><span>Share</span></>
                )}
              </button>
            )}
            {isCollaborator && (
              <span className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[10px] text-blue-400"
                style={{ background: 'rgba(59,130,246,0.1)' }}>
                <Users className="w-3 h-3" /><span>Collaborator</span>
              </span>
            )}
          </div>
        </div>

        {/* ── Add Tracks Panel ── */}
        {showAddTracks && (
          <div className="mb-4 rounded-xl border p-4" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Add Tracks</h3>
              <button onClick={() => { setShowAddTracks(false); setSearchQuery(''); setSearchResults([]); }}>
                <X className="w-4 h-4 text-white/30" />
              </button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input type="text" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tracks..."
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-white placeholder-white/20 outline-none transition"
                style={{ background: 'rgba(255,255,255,0.06)' }} />
              {searching && <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-white/30" />}
            </div>
            {searchResults.length > 0 ? (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {searchResults.map(track => (
                  <div key={track.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white/[0.04] transition">
                    <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      {track.cover_artwork_url
                        ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-3.5 h-3.5 text-white/20" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{track.title}</p>
                      <p className="text-xs text-white/30 truncate">{track.artist?.artist_name}</p>
                    </div>
                    <button onClick={() => addTrack(track)} disabled={adding === track.id}
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition"
                      style={{ background: 'rgba(255,255,255,0.08)' }}>
                      {adding === track.id
                        ? <Loader className="w-3.5 h-3.5 animate-spin text-white/40" />
                        : <Plus className="w-3.5 h-3.5 text-white/60" />}
                    </button>
                  </div>
                ))}
              </div>
            ) : searchQuery.length >= 2 && !searching ? (
              <p className="text-center text-white/20 text-xs py-4">No tracks found</p>
            ) : (
              <p className="text-center text-white/20 text-xs py-4">Type at least 2 characters to search</p>
            )}
          </div>
        )}

        {/* ── Track List ── */}
        {tracks.length === 0 ? (
          <div className="text-center py-20">
            <Music className="w-12 h-12 mx-auto text-white/10 mb-3" />
            <p className="text-white/30 text-sm">No tracks yet</p>
            {canEdit && (
              <button onClick={() => setShowAddTracks(true)}
                className="mt-4 px-4 py-2 rounded-lg text-sm text-white/50 transition"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
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
                    : <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}><Music className="w-4 h-4 text-white/20" /></div>}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition">
                    {currentTrack?.id === track.id && isPlaying
                      ? <Pause className="w-4 h-4 text-white" />
                      : <Play className="w-4 h-4 text-white" />}
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
                {canEdit && (
                  <button onClick={e => removeTrack(track.id, e)} disabled={removing === track.id}
                    className="flex-shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition">
                    {removing === track.id
                      ? <Loader className="w-3.5 h-3.5 animate-spin text-white/30" />
                      : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <TrackActionSheet
          track={actionSheetTrack}
          artist={actionSheetTrack ? { artist_name: actionSheetTrack.artist_name } : null}
          onClose={() => setActionSheetTrack(null)} />
      </div>
    </div>
  );
}