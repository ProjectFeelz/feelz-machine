import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ListMusic, ArrowLeft, Loader, Plus, Music, Trash2 } from 'lucide-react';

export default function PlaylistsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) fetchPlaylists();
  }, [user]);

  const fetchPlaylists = async () => {
    const { data } = await supabase
      .from('playlists')
      .select('*, playlist_tracks(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setPlaylists(data || []);
    setLoading(false);
  };

  const createPlaylist = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('playlists').insert({
      user_id: user.id,
      name: newName.trim(),
      is_public: false,
    });
    if (!error) {
      setNewName('');
      setCreating(false);
      fetchPlaylists();
    }
    setSaving(false);
  };

  const deletePlaylist = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await supabase.from('playlists').delete().eq('id', id);
    fetchPlaylists();
  };

  return (
    <div className="pt-14 pb-32 px-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate('/library')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Playlists</h1>
            <p className="text-xs text-white/30">{playlists.length} playlists</p>
          </div>
        </div>
        <button onClick={() => setCreating(!creating)}
          className="flex items-center space-x-1.5 px-3 py-2 bg-white/[0.06] rounded-lg text-sm text-white/60 hover:bg-white/[0.1] transition">
          <Plus className="w-4 h-4" /><span>New</span>
        </button>
      </div>

      {creating && (
        <div className="flex space-x-2 mb-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
            placeholder="Playlist name..."
            autoFocus
            className="flex-1 px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none placeholder-white/20 focus:bg-white/[0.1] transition"
          />
          <button onClick={createPlaylist} disabled={saving || !newName.trim()}
            className="px-4 py-2.5 bg-white text-black rounded-lg text-sm font-medium disabled:opacity-40 transition">
            {saving ? '...' : 'Create'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
      ) : playlists.length === 0 ? (
        <div className="text-center py-20">
          <ListMusic className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">No playlists yet</p>
          <p className="text-white/15 text-xs mt-1">Tap "New" above to create one</p>
        </div>
      ) : (
        <div className="space-y-2">
          {playlists.map(playlist => (
            <div key={playlist.id}
              className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/[0.04] transition group">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-600/30 to-blue-600/20 flex items-center justify-center flex-shrink-0">
                <Music className="w-5 h-5 text-white/30" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{playlist.name}</p>
                <p className="text-xs text-white/30">
                  {playlist.playlist_tracks?.[0]?.count || 0} tracks
                  {playlist.is_public ? ' · Public' : ' · Private'}
                </p>
              </div>
              <button onClick={() => deletePlaylist(playlist.id, playlist.name)}
                className="p-2 rounded-lg bg-red-500/0 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
