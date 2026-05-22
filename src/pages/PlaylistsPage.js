import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ListMusic, ArrowLeft, Loader, Plus, Music, Trash2, Users, Link, Check } from 'lucide-react';

export default function PlaylistsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [playlists, setPlaylists]         = useState([]);
  const [sharedPlaylists, setSharedPlaylists] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [creating, setCreating]           = useState(false);
  const [newName, setNewName]             = useState('');
  const [newShared, setNewShared]         = useState(false);
  const [saving, setSaving]               = useState(false);
  const [joinToken, setJoinToken]         = useState('');
  const [joining, setJoining]             = useState(false);
  const [joinError, setJoinError]         = useState('');
  const [copiedId, setCopiedId]           = useState(null);
  const [coverFile, setCoverFile]         = useState(null);
  const [coverPreview, setCoverPreview]   = useState(null);
  const coverRef                          = React.useRef(null);

  useEffect(() => { if (user) fetchPlaylists(); }, [user]);

  const fetchPlaylists = async () => {
    const [{ data: mine }, { data: collab }] = await Promise.all([
      supabase.from('playlists')
        .select('id, name, cover_url, is_shared, is_public, user_id, created_at, playlist_tracks(id, position, tracks(cover_artwork_url))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('playlist_collaborators')
        .select('playlist_id, playlists(*, playlist_tracks(count))')
        .eq('user_id', user.id),
    ]);
    setPlaylists(mine || []);
    setSharedPlaylists((collab || []).map(c => c.playlists).filter(Boolean));
    setLoading(false);
  };

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      let cover_url = null;
      if (coverFile) {
        const ext  = coverFile.name.split('.').pop();
        const path = `playlist-covers/${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('artist-images').upload(path, coverFile, { upsert: true });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('artist-images').getPublicUrl(path);
          cover_url = publicUrl;
        }
      }
      const { error } = await supabase.from('playlists').insert({
        user_id:   user.id,
        name:      newName.trim(),
        is_public: false,
        is_shared: newShared,
        cover_url,
      });
      if (!error) {
        setNewName(''); setCreating(false); setNewShared(false);
        setCoverFile(null); setCoverPreview(null);
        fetchPlaylists();
      }
    } catch {}
    setSaving(false);
  };

  const deletePlaylist = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await supabase.from('playlists').delete().eq('id', id);
    fetchPlaylists();
  };

  const copyShareLink = async (playlist) => {
    const url = `${window.location.origin}/library/playlists/join/${playlist.share_token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(playlist.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const joinPlaylist = async () => {
    if (!joinToken.trim()) return;
    setJoining(true);
    setJoinError('');
    try {
      const token = joinToken.trim().split('/').pop(); // handle full URL or just token
      const { data: playlist } = await supabase
        .from('playlists')
        .select('id, name, user_id')
        .eq('share_token', token)
        .eq('is_shared', true)
        .maybeSingle();
      if (!playlist) { setJoinError('Playlist not found. Check the link and try again.'); setJoining(false); return; }
      if (playlist.user_id === user.id) { setJoinError("That's your own playlist."); setJoining(false); return; }
      await supabase.from('playlist_collaborators').upsert(
        { playlist_id: playlist.id, user_id: user.id, can_edit: true },
        { onConflict: 'playlist_id,user_id' }
      );
      setJoinToken('');
      fetchPlaylists();
    } catch { setJoinError('Something went wrong. Try again.'); }
    setJoining(false);
  };

  const PlaylistRow = ({ playlist, isCollab = false }) => (
    <div
      onClick={() => navigate(`/library/playlists/${playlist.id}`)}
      className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/[0.04] transition group cursor-pointer"
    >
      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-600/30 to-blue-600/20 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
        {(() => {
            const auto = playlist.playlist_tracks?.find(pt => pt.tracks?.cover_artwork_url)?.tracks?.cover_artwork_url;
            const src  = playlist.cover_url || auto;
            return src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <Music className="w-5 h-5 text-white/30" />;
          })()}
        {(playlist.is_shared || isCollab) && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-blue-500/80 flex items-center justify-center">
            <Users className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{playlist.name}</p>
        <p className="text-xs text-white/30">
          {playlist.playlist_tracks?.length || 0} tracks
          {isCollab ? ' · Collaborative' : playlist.is_shared ? ' · Shared' : playlist.is_public ? ' · Public' : ' · Private'}
        </p>
      </div>
      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition">
        {playlist.is_shared && !isCollab && (
          <button
            onClick={e => { e.stopPropagation(); copyShareLink(playlist); }}
            className="p-2 rounded-lg hover:bg-white/[0.08] transition"
            title="Copy share link"
          >
            {copiedId === playlist.id
              ? <Check className="w-3.5 h-3.5 text-green-400" />
              : <Link className="w-3.5 h-3.5 text-white/40" />}
          </button>
        )}
        {!isCollab && (
          <button
            onClick={e => { e.stopPropagation(); deletePlaylist(playlist.id, playlist.name); }}
            className="p-2 rounded-lg hover:bg-red-500/10 transition"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="pb-32 px-4 max-w-2xl">
      <div className="flex items-center mb-6 sticky top-0 z-20 bg-black/95 backdrop-blur-xl md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04] md:border-none">
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate('/library')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Playlists</h1>
            <p className="text-xs text-white/30">{playlists.length + sharedPlaylists.length} playlists</p>
          </div>
        </div>
      </div>

      {/* New playlist button — sits under the header */}
      <button onClick={() => setCreating(!creating)}
        className="w-full flex items-center space-x-2 px-4 py-3 mb-4 bg-white/[0.04] hover:bg-white/[0.07] rounded-xl border border-white/[0.06] text-sm text-white/60 hover:text-white/80 transition">
        <Plus className="w-4 h-4" /><span>New playlist</span>
      </button>

      {/* Create form */}
      {creating && (
        <div className="space-y-2 mb-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          {/* Cover image picker */}
          <div className="flex items-center space-x-3">
            <button type="button" onClick={() => coverRef.current?.click()}
              className="w-14 h-14 rounded-xl overflow-hidden bg-white/[0.06] border border-white/[0.08] flex items-center justify-center flex-shrink-0 hover:bg-white/[0.1] transition">
              {coverPreview
                ? <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                : <Music className="w-5 h-5 text-white/20" />}
            </button>
            <div className="flex-1">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createPlaylist()}
                placeholder="Playlist name..."
                autoFocus
                className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none placeholder-white/20 focus:bg-white/[0.1] transition"
              />
              <p className="text-[10px] text-white/20 mt-1">{coverPreview ? 'Tap image to change' : 'Tap square to add cover'}</p>
            </div>
          </div>
          <input ref={coverRef} type="file" accept="image/*" className="hidden"
            onChange={e => {
              const f = e.target.files[0];
              if (f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); }
            }} />
          <label className="flex items-center space-x-2 cursor-pointer py-1">
            <div
              onClick={() => setNewShared(s => !s)}
              className={`w-8 h-4 rounded-full transition-colors relative ${newShared ? 'bg-blue-500' : 'bg-white/10'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${newShared ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs text-white/50">Collaborative — share with friends</span>
          </label>
          <div className="flex space-x-2">
            <button onClick={() => { setCreating(false); setNewName(''); setNewShared(false); }}
              className="px-3 py-2 text-sm text-white/30 hover:text-white/60 transition">Cancel</button>
            <button onClick={createPlaylist} disabled={saving || !newName.trim()}
              className="flex-1 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium disabled:opacity-40 transition">
              {saving ? '...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Join collaborative playlist */}
      <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
        <div className="flex space-x-2">
          <input
            type="text"
            value={joinToken}
            onChange={e => setJoinToken(e.target.value)}
            placeholder="Paste invite link to join a playlist..."
            className="flex-1 px-3 py-2 bg-white/[0.04] rounded-lg text-white text-xs outline-none placeholder-white/20 focus:bg-white/[0.07] transition"
          />
          <button onClick={joinPlaylist} disabled={joining || !joinToken.trim()}
            className="flex items-center space-x-1.5 px-3 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs rounded-lg disabled:opacity-40 hover:bg-blue-500/30 transition">
            <Users className="w-3.5 h-3.5" />
            <span>{joining ? '...' : 'Join'}</span>
          </button>
        </div>
        {joinError && <p className="text-xs text-red-400 mt-1.5 px-1">{joinError}</p>}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
      ) : (playlists.length === 0 && sharedPlaylists.length === 0) ? (
        <div className="text-center py-20">
          <ListMusic className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">No playlists yet</p>
          <p className="text-white/15 text-xs mt-1">Tap "New" above to create one</p>
        </div>
      ) : (
        <div className="space-y-1">
          {playlists.map(p => <PlaylistRow key={p.id} playlist={p} />)}
          {sharedPlaylists.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-widest text-white/20 font-semibold pt-4 pb-2 px-1">Collaborative</p>
              {sharedPlaylists.map(p => <PlaylistRow key={p.id} playlist={p} isCollab />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}