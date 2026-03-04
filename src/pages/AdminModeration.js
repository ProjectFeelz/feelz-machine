import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  AlertTriangle, ChevronLeft, Loader, Search, Music, Eye,
  EyeOff, Trash2, CheckCircle, Flag, Filter, MoreVertical
} from 'lucide-react';

export default function AdminModeration() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionTrack, setActionTrack] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTracks = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('tracks')
        .select(`
          *,
          artist:artists!tracks_artist_id_fkey(id, artist_name, slug)
        `)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      setTracks(data || []);
    } catch (err) {
      console.error('Fetch tracks error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) { navigate('/hub'); return; }
    fetchTracks();
  }, [isAdmin, navigate, fetchTracks]);

  const handleTogglePublish = async (track) => {
    setActionLoading(true);
    try {
      await supabase
        .from('tracks')
        .update({ is_published: !track.is_published })
        .eq('id', track.id);
      await fetchTracks();
    } catch (err) {
      console.error('Toggle publish error:', err);
    }
    setActionLoading(false);
    setActionTrack(null);
  };

  const handleDeleteTrack = async (track) => {
    if (!window.confirm(`Delete "${track.title}"? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await supabase.from('tracks').delete().eq('id', track.id);
      await fetchTracks();
    } catch (err) {
      console.error('Delete track error:', err);
    }
    setActionLoading(false);
    setActionTrack(null);
  };

  const handleToggleFeatured = async (track) => {
    setActionLoading(true);
    try {
      await supabase
        .from('tracks')
        .update({ featured: !track.featured })
        .eq('id', track.id);
      await fetchTracks();
    } catch (err) {
      console.error('Toggle featured error:', err);
    }
    setActionLoading(false);
    setActionTrack(null);
  };

  const filtered = tracks.filter(t => {
    const matchesSearch =
      (t.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.artist?.artist_name || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (filterStatus === 'published') return matchesSearch && t.is_published;
    if (filterStatus === 'unpublished') return matchesSearch && !t.is_published;
    if (filterStatus === 'featured') return matchesSearch && t.featured;
    return matchesSearch;
  });

  const statusCounts = {
    all: tracks.length,
    published: tracks.filter(t => t.is_published).length,
    unpublished: tracks.filter(t => !t.is_published).length,
    featured: tracks.filter(t => t.featured).length,
  };

  if (!isAdmin) return null;

  return (
    <div className="pt-14 pb-32 px-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/hub')} className="p-2 -ml-2 hover:bg-white/[0.05] rounded-lg transition">
          <ChevronLeft className="w-5 h-5 text-white/40" />
        </button>
        <AlertTriangle className="w-6 h-6 text-red-400/70" />
        <h1 className="text-xl font-bold text-white">Content Moderation</h1>
      </div>

      {/* Status Counts */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { key: 'all', label: 'All', color: 'text-white/60' },
          { key: 'published', label: 'Published', color: 'text-green-400' },
          { key: 'unpublished', label: 'Unpublished', color: 'text-yellow-400' },
          { key: 'featured', label: 'Featured', color: 'text-blue-400' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setFilterStatus(s.key)}
            className={`bg-white/[0.03] rounded-xl p-2.5 border transition text-center ${
              filterStatus === s.key ? 'border-white/[0.15]' : 'border-white/[0.06]'
            }`}
          >
            <p className={`text-base font-bold ${s.color}`}>{statusCounts[s.key]}</p>
            <p className="text-[9px] text-white/25 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tracks or artists..."
          className="w-full pl-10 pr-4 py-3 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/[0.15] focus:outline-none transition"
        />
      </div>

      {/* Track List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader className="w-5 h-5 animate-spin text-white/20" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Music className="w-10 h-10 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">No tracks found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(track => (
            <div key={track.id} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] transition hover:bg-white/[0.05]">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  {track.cover_artwork_url ? (
                    <img src={track.cover_artwork_url} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <Music className="w-4 h-4 text-white/15" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-white truncate">{track.title || 'Untitled'}</p>
                      {track.featured && (
                        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[9px] font-bold rounded">FEATURED</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className="text-[11px] text-white/30">{track.artist?.artist_name || 'Unknown'}</span>
                      <span className="text-[11px] text-white/15">•</span>
                      <span className={`text-[11px] font-medium ${track.is_published ? 'text-green-400/60' : 'text-yellow-400/60'}`}>
                        {track.is_published ? 'Published' : 'Draft'}
                      </span>
                      <span className="text-[11px] text-white/15">•</span>
                      <span className="text-[11px] text-white/20">
                        {new Date(track.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setActionTrack(actionTrack?.id === track.id ? null : track)}
                  className="p-2 hover:bg-white/[0.05] rounded-lg transition flex-shrink-0"
                >
                  <MoreVertical className="w-4 h-4 text-white/30" />
                </button>
              </div>

              {/* Actions */}
              {actionTrack?.id === track.id && (
                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1">
                  <button
                    onClick={() => handleTogglePublish(track)}
                    disabled={actionLoading}
                    className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition text-left"
                  >
                    {track.is_published ? <EyeOff className="w-4 h-4 text-yellow-400" /> : <Eye className="w-4 h-4 text-green-400" />}
                    <span className="text-xs text-white/60">{track.is_published ? 'Unpublish' : 'Publish'}</span>
                  </button>
                  <button
                    onClick={() => handleToggleFeatured(track)}
                    disabled={actionLoading}
                    className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition text-left"
                  >
                    <CheckCircle className="w-4 h-4 text-blue-400" />
                    <span className="text-xs text-white/60">{track.featured ? 'Remove Featured' : 'Set Featured'}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteTrack(track)}
                    disabled={actionLoading}
                    className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition text-left"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-red-400/70">Delete Track</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
