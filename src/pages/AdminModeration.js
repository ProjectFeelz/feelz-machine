import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  AlertTriangle, ChevronLeft, Loader, Search, Music, Eye,
  EyeOff, Trash2, CheckCircle, MoreVertical, User, ShieldOff, Shield
} from 'lucide-react';

export default function AdminModeration() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState('tracks');

  // Tracks state
  const [tracks, setTracks] = useState([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [trackSearch, setTrackSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionTrack, setActionTrack] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Artists state
  const [artists, setArtists] = useState([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [artistSearch, setArtistSearch] = useState('');
  const [actionArtist, setActionArtist] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [showSuspendInput, setShowSuspendInput] = useState(false);

  const fetchTracks = useCallback(async () => {
    setTracksLoading(true);
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select(`*, artist:artists!tracks_artist_id_fkey(id, artist_name, slug)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTracks(data || []);
    } catch (err) {
      console.error('Fetch tracks error:', err);
    }
    setTracksLoading(false);
  }, []);

  const fetchArtists = useCallback(async () => {
    setArtistsLoading(true);
    try {
      const { data, error } = await supabase
        .from('artists')
        .select('id, artist_name, slug, avatar_url, is_suspended, suspension_reason, suspended_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setArtists(data || []);
    } catch (err) {
      console.error('Fetch artists error:', err);
    }
    setArtistsLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) { navigate('/hub'); return; }
    fetchTracks();
    fetchArtists();
  }, [isAdmin, navigate, fetchTracks, fetchArtists]);

  // Track actions
  const handleTogglePublish = async (track) => {
    setActionLoading(true);
    try {
      await supabase.from('tracks').update({ is_published: !track.is_published }).eq('id', track.id);
      await fetchTracks();
    } catch (err) { console.error(err); }
    setActionLoading(false);
    setActionTrack(null);
  };

  const handleDeleteTrack = async (track) => {
    if (!window.confirm(`Delete "${track.title}"? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await supabase.from('tracks').delete().eq('id', track.id);
      await fetchTracks();
    } catch (err) { console.error(err); }
    setActionLoading(false);
    setActionTrack(null);
  };

  const handleToggleFeatured = async (track) => {
    setActionLoading(true);
    try {
      await supabase.from('tracks').update({ featured: !track.featured }).eq('id', track.id);
      await fetchTracks();
    } catch (err) { console.error(err); }
    setActionLoading(false);
    setActionTrack(null);
  };

  // Artist actions
  const handleSuspendArtist = async (artist) => {
    if (!suspendReason.trim()) return;
    setSuspendLoading(true);
    try {
      const { error } = await supabase.rpc('admin_suspend_artist', {
        p_artist_id: artist.id,
        p_reason: suspendReason.trim(),
      });
      if (error) throw error;
      await fetchArtists();
      setActionArtist(null);
      setShowSuspendInput(false);
      setSuspendReason('');
    } catch (err) {
      console.error('Suspend error:', err);
    }
    setSuspendLoading(false);
  };

  const handleUnsuspendArtist = async (artist) => {
    if (!window.confirm(`Unsuspend ${artist.artist_name}?`)) return;
    setSuspendLoading(true);
    try {
      const { error } = await supabase.rpc('admin_unsuspend_artist', {
        p_artist_id: artist.id,
      });
      if (error) throw error;
      await fetchArtists();
      setActionArtist(null);
    } catch (err) {
      console.error('Unsuspend error:', err);
    }
    setSuspendLoading(false);
  };

  const filteredTracks = tracks.filter(t => {
    const matchesSearch =
      (t.title || '').toLowerCase().includes(trackSearch.toLowerCase()) ||
      (t.artist?.artist_name || '').toLowerCase().includes(trackSearch.toLowerCase());
    if (filterStatus === 'published') return matchesSearch && t.is_published;
    if (filterStatus === 'unpublished') return matchesSearch && !t.is_published;
    if (filterStatus === 'featured') return matchesSearch && t.featured;
    return matchesSearch;
  });

  const filteredArtists = artists.filter(a =>
    (a.artist_name || '').toLowerCase().includes(artistSearch.toLowerCase())
  );

  const statusCounts = {
    all: tracks.length,
    published: tracks.filter(t => t.is_published).length,
    unpublished: tracks.filter(t => !t.is_published).length,
    featured: tracks.filter(t => t.featured).length,
  };

  const suspendedCount = artists.filter(a => a.is_suspended).length;

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

      {/* Tab Switcher */}
      <div className="flex space-x-2 mb-5">
        <button
          onClick={() => setActiveTab('tracks')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium transition border ${
            activeTab === 'tracks'
              ? 'bg-white/[0.08] border-white/[0.15] text-white'
              : 'bg-transparent border-white/[0.06] text-white/40 hover:text-white/60'
          }`}
        >
          <Music className="w-4 h-4" />
          <span>Tracks</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${activeTab === 'tracks' ? 'bg-white/10 text-white/60' : 'bg-white/[0.04] text-white/25'}`}>
            {tracks.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('artists')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium transition border ${
            activeTab === 'artists'
              ? 'bg-white/[0.08] border-white/[0.15] text-white'
              : 'bg-transparent border-white/[0.06] text-white/40 hover:text-white/60'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Artists</span>
          {suspendedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-red-500/20 text-red-400">
              {suspendedCount} suspended
            </span>
          )}
        </button>
      </div>

      {/* ── TRACKS TAB ── */}
      {activeTab === 'tracks' && (
        <>
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
              value={trackSearch}
              onChange={(e) => setTrackSearch(e.target.value)}
              placeholder="Search tracks or artists..."
              className="w-full pl-10 pr-4 py-3 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/[0.15] focus:outline-none transition"
            />
          </div>

          {/* Track List */}
          {tracksLoading ? (
            <div className="flex justify-center py-16">
              <Loader className="w-5 h-5 animate-spin text-white/20" />
            </div>
          ) : filteredTracks.length === 0 ? (
            <div className="text-center py-16">
              <Music className="w-10 h-10 mx-auto text-white/10 mb-3" />
              <p className="text-white/30 text-sm">No tracks found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTracks.map(track => (
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
        </>
      )}

      {/* ── ARTISTS TAB ── */}
      {activeTab === 'artists' && (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              type="text"
              value={artistSearch}
              onChange={(e) => setArtistSearch(e.target.value)}
              placeholder="Search artists..."
              className="w-full pl-10 pr-4 py-3 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/[0.15] focus:outline-none transition"
            />
          </div>

          {/* Artist List */}
          {artistsLoading ? (
            <div className="flex justify-center py-16">
              <Loader className="w-5 h-5 animate-spin text-white/20" />
            </div>
          ) : filteredArtists.length === 0 ? (
            <div className="text-center py-16">
              <User className="w-10 h-10 mx-auto text-white/10 mb-3" />
              <p className="text-white/30 text-sm">No artists found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredArtists.map(artist => (
                <div
                  key={artist.id}
                  className={`rounded-xl p-4 border transition ${
                    artist.is_suspended
                      ? 'bg-red-500/[0.04] border-red-500/20'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0">
                      {artist.avatar_url ? (
                        <img src={artist.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-white/15" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-white truncate">{artist.artist_name}</p>
                          {artist.is_suspended && (
                            <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[9px] font-bold rounded">SUSPENDED</span>
                          )}
                        </div>
                        {artist.is_suspended && artist.suspension_reason && (
                          <p className="text-[11px] text-red-400/60 mt-0.5 truncate">
                            Reason: {artist.suspension_reason}
                          </p>
                        )}
                        {!artist.is_suspended && (
                          <p className="text-[11px] text-white/20 mt-0.5">
                            Joined {new Date(artist.created_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActionArtist(actionArtist?.id === artist.id ? null : artist);
                        setShowSuspendInput(false);
                        setSuspendReason('');
                      }}
                      className="p-2 hover:bg-white/[0.05] rounded-lg transition flex-shrink-0"
                    >
                      <MoreVertical className="w-4 h-4 text-white/30" />
                    </button>
                  </div>

                  {/* Artist Actions */}
                  {actionArtist?.id === artist.id && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1">
                      {artist.is_suspended ? (
                        <button
                          onClick={() => handleUnsuspendArtist(artist)}
                          disabled={suspendLoading}
                          className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-green-500/10 transition text-left"
                        >
                          <Shield className="w-4 h-4 text-green-400" />
                          <span className="text-xs text-green-400/80">Unsuspend Artist</span>
                          {suspendLoading && <Loader className="w-3 h-3 animate-spin text-white/30 ml-auto" />}
                        </button>
                      ) : (
                        <>
                          {!showSuspendInput ? (
                            <button
                              onClick={() => setShowSuspendInput(true)}
                              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition text-left"
                            >
                              <ShieldOff className="w-4 h-4 text-red-400" />
                              <span className="text-xs text-red-400/70">Suspend Artist</span>
                            </button>
                          ) : (
                            <div className="space-y-2 px-1">
                              <p className="text-[11px] text-white/30 px-2">Reason for suspension</p>
                              <input
                                type="text"
                                value={suspendReason}
                                onChange={(e) => setSuspendReason(e.target.value)}
                                placeholder="e.g. Spam, harassment, copyright violation..."
                                className="w-full px-3 py-2.5 bg-white/[0.04] rounded-lg text-xs text-white placeholder:text-white/20 border border-white/[0.08] focus:border-red-500/30 focus:outline-none transition"
                                autoFocus
                              />
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleSuspendArtist(artist)}
                                  disabled={suspendLoading || !suspendReason.trim()}
                                  className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition disabled:opacity-40"
                                >
                                  {suspendLoading
                                    ? <Loader className="w-3 h-3 animate-spin text-red-400" />
                                    : <ShieldOff className="w-3 h-3 text-red-400" />
                                  }
                                  <span className="text-xs text-red-400 font-medium">Confirm Suspend</span>
                                </button>
                                <button
                                  onClick={() => { setShowSuspendInput(false); setSuspendReason(''); }}
                                  className="px-3 py-2 rounded-lg hover:bg-white/[0.05] transition"
                                >
                                  <span className="text-xs text-white/30">Cancel</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
