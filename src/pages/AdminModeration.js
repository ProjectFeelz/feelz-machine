import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  AlertTriangle, ChevronLeft, Loader, Search, Music, Eye,
  EyeOff, Trash2, CheckCircle, MoreVertical, User, ShieldOff,
  Shield, Flag, Clock, CheckCheck, XCircle
} from 'lucide-react';

const SEVERITY_STYLES = {
  low:    { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  border: 'border-yellow-500/20',  label: 'LOW'    },
  medium: { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/20',  label: 'MEDIUM' },
  high:   { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20',     label: 'HIGH'   },
};

const FLAG_TYPE_LABELS = {
  stream_abuse:        'Stream Abuse',
  fake_streams:        'Fake Streams',
  spam:                'Spam',
  harassment:          'Harassment',
  copyright:           'Copyright',
  inappropriate:       'Inappropriate',
  ban_evasion:         'Ban Evasion',
  suspicious_activity: 'Suspicious Activity',
};

export default function AdminModeration() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState('tracks');

  // ── Tracks ───────────────────────────────────────────────────────────
  const [tracks, setTracks] = useState([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [trackSearch, setTrackSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [actionTrack, setActionTrack] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Artists ──────────────────────────────────────────────────────────
  const [artists, setArtists] = useState([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [artistSearch, setArtistSearch] = useState('');
  const [actionArtist, setActionArtist] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [showSuspendInput, setShowSuspendInput] = useState(false);

  // ── Fraud flags ──────────────────────────────────────────────────────
  const [flags, setFlags] = useState([]);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [flagFilter, setFlagFilter] = useState('open');
  const [resolvingId, setResolvingId] = useState(null);

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchTracks = useCallback(async () => {
    setTracksLoading(true);
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select(`*, artist:artists!tracks_artist_id_fkey(id, artist_name, slug)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTracks(data || []);
    } catch (err) { console.error('Fetch tracks error:', err); }
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
    } catch (err) { console.error('Fetch artists error:', err); }
    setArtistsLoading(false);
  }, []);

  const fetchFlags = useCallback(async () => {
    setFlagsLoading(true);
    try {
      let query = supabase
        .from('fraud_flags')
        .select('*')
        .order('created_at', { ascending: false });

      if (flagFilter === 'open')     query = query.eq('resolved', false);
      if (flagFilter === 'resolved') query = query.eq('resolved', true);

      const { data, error } = await query;
      if (error) throw error;

      // Enrich with entity names
      const enriched = await Promise.all((data || []).map(async (flag) => {
        let entityName = flag.entity_id;
        try {
          if (flag.entity_type === 'track') {
            const { data: t } = await supabase.from('tracks').select('title').eq('id', flag.entity_id).maybeSingle();
            if (t) entityName = t.title;
          } else if (flag.entity_type === 'artist') {
            const { data: a } = await supabase.from('artists').select('artist_name').eq('id', flag.entity_id).maybeSingle();
            if (a) entityName = a.artist_name;
          }
        } catch {}
        return { ...flag, entityName };
      }));

      setFlags(enriched);
    } catch (err) { console.error('Fetch flags error:', err); }
    setFlagsLoading(false);
  }, [flagFilter]);

  useEffect(() => {
    if (!isAdmin) { navigate('/hub'); return; }
    fetchTracks();
    fetchArtists();
  }, [isAdmin, navigate, fetchTracks, fetchArtists]);

  useEffect(() => {
    if (activeTab === 'flags') fetchFlags();
  }, [activeTab, fetchFlags]);

  // ── Track actions ────────────────────────────────────────────────────
  const handleTogglePublish = async (track) => {
    setActionLoading(true);
    try {
      await supabase.from('tracks').update({ is_published: !track.is_published }).eq('id', track.id);
      await fetchTracks();
    } catch (err) { console.error(err); }
    setActionLoading(false); setActionTrack(null);
  };

  const handleDeleteTrack = async (track) => {
    if (!window.confirm(`Delete "${track.title}"? This cannot be undone.`)) return;
    setActionLoading(true);
    try {
      await supabase.from('tracks').delete().eq('id', track.id);
      await fetchTracks();
    } catch (err) { console.error(err); }
    setActionLoading(false); setActionTrack(null);
  };

  const handleToggleFeatured = async (track) => {
    setActionLoading(true);
    try {
      await supabase.from('tracks').update({ featured: !track.featured }).eq('id', track.id);
      await fetchTracks();
    } catch (err) { console.error(err); }
    setActionLoading(false); setActionTrack(null);
  };

  // ── Artist actions ───────────────────────────────────────────────────
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
      setActionArtist(null); setShowSuspendInput(false); setSuspendReason('');
    } catch (err) { console.error('Suspend error:', err); }
    setSuspendLoading(false);
  };

  const handleUnsuspendArtist = async (artist) => {
    if (!window.confirm(`Unsuspend ${artist.artist_name}?`)) return;
    setSuspendLoading(true);
    try {
      const { error } = await supabase.rpc('admin_unsuspend_artist', { p_artist_id: artist.id });
      if (error) throw error;
      await fetchArtists();
      setActionArtist(null);
    } catch (err) { console.error('Unsuspend error:', err); }
    setSuspendLoading(false);
  };

  // ── Flag actions ─────────────────────────────────────────────────────
  const handleResolveFlag = async (flagId, notes = 'Reviewed by admin') => {
    setResolvingId(flagId);
    try {
      const { error } = await supabase
        .from('fraud_flags')
        .update({ resolved: true, resolution_notes: notes, resolved_at: new Date().toISOString() })
        .eq('id', flagId);
      if (error) throw error;
      await fetchFlags();
    } catch (err) { console.error('Resolve flag error:', err); }
    setResolvingId(null);
  };

  // ── Computed ─────────────────────────────────────────────────────────
  const filteredTracks = tracks.filter(t => {
    const q = trackSearch.toLowerCase();
    const m = (t.title || '').toLowerCase().includes(q) || (t.artist?.artist_name || '').toLowerCase().includes(q);
    if (filterStatus === 'published')   return m && t.is_published;
    if (filterStatus === 'unpublished') return m && !t.is_published;
    if (filterStatus === 'featured')    return m && t.featured;
    return m;
  });

  const filteredArtists = artists.filter(a =>
    (a.artist_name || '').toLowerCase().includes(artistSearch.toLowerCase())
  );

  const statusCounts = {
    all:         tracks.length,
    published:   tracks.filter(t => t.is_published).length,
    unpublished: tracks.filter(t => !t.is_published).length,
    featured:    tracks.filter(t => t.featured).length,
  };

  const suspendedCount = artists.filter(a => a.is_suspended).length;
  const openFlagCount  = flags.filter(f => !f.resolved).length;

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

      {/* Tabs */}
      <div className="flex space-x-2 mb-5 overflow-x-auto pb-1">
        {[
          { key: 'tracks',  label: 'Tracks',      Icon: Music,  badge: String(tracks.length),                                    badgeClass: 'bg-white/10 text-white/60' },
          { key: 'artists', label: 'Artists',     Icon: User,   badge: suspendedCount > 0 ? `${suspendedCount} suspended` : null, badgeClass: 'bg-red-500/20 text-red-400' },
          { key: 'flags',   label: 'Fraud Flags', Icon: Flag,   badge: openFlagCount > 0 ? String(openFlagCount) : null,          badgeClass: 'bg-red-500/20 text-red-400' },
        ].map(({ key, label, Icon, badge, badgeClass }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium transition border flex-shrink-0 ${
              activeTab === key
                ? 'bg-white/[0.08] border-white/[0.15] text-white'
                : 'bg-transparent border-white/[0.06] text-white/40 hover:text-white/60'
            }`}>
            <Icon className="w-4 h-4" />
            <span>{label}</span>
            {badge && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${badgeClass}`}>{badge}</span>}
          </button>
        ))}
      </div>

      {/* ══ TRACKS ══ */}
      {activeTab === 'tracks' && (
        <>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { key: 'all',         label: 'All',         color: 'text-white/60'   },
              { key: 'published',   label: 'Published',   color: 'text-green-400'  },
              { key: 'unpublished', label: 'Unpublished', color: 'text-yellow-400' },
              { key: 'featured',    label: 'Featured',    color: 'text-blue-400'   },
            ].map(s => (
              <button key={s.key} onClick={() => setFilterStatus(s.key)}
                className={`bg-white/[0.03] rounded-xl p-2.5 border transition text-center ${filterStatus === s.key ? 'border-white/[0.15]' : 'border-white/[0.06]'}`}>
                <p className={`text-base font-bold ${s.color}`}>{statusCounts[s.key]}</p>
                <p className="text-[9px] text-white/25 mt-0.5">{s.label}</p>
              </button>
            ))}
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input type="text" value={trackSearch} onChange={e => setTrackSearch(e.target.value)}
              placeholder="Search tracks or artists..."
              className="w-full pl-10 pr-4 py-3 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/[0.15] focus:outline-none transition" />
          </div>

          {tracksLoading ? (
            <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
          ) : filteredTracks.length === 0 ? (
            <div className="text-center py-16">
              <Music className="w-10 h-10 mx-auto text-white/10 mb-3" />
              <p className="text-white/30 text-sm">No tracks found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTracks.map(track => (
                <div key={track.id} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] hover:bg-white/[0.05] transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0">
                      {track.cover_artwork_url
                        ? <img src={track.cover_artwork_url} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-11 h-11 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Music className="w-4 h-4 text-white/15" /></div>}
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-white truncate">{track.title || 'Untitled'}</p>
                          {track.featured && <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[9px] font-bold rounded">FEATURED</span>}
                        </div>
                        <div className="flex items-center space-x-2 mt-0.5">
                          <span className="text-[11px] text-white/30">{track.artist?.artist_name || 'Unknown'}</span>
                          <span className="text-[11px] text-white/15">•</span>
                          <span className={`text-[11px] font-medium ${track.is_published ? 'text-green-400/60' : 'text-yellow-400/60'}`}>
                            {track.is_published ? 'Published' : 'Draft'}
                          </span>
                          <span className="text-[11px] text-white/15">•</span>
                          <span className="text-[11px] text-white/20">{new Date(track.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setActionTrack(actionTrack?.id === track.id ? null : track)}
                      className="p-2 hover:bg-white/[0.05] rounded-lg transition flex-shrink-0">
                      <MoreVertical className="w-4 h-4 text-white/30" />
                    </button>
                  </div>
                  {actionTrack?.id === track.id && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1">
                      <button onClick={() => handleTogglePublish(track)} disabled={actionLoading}
                        className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition text-left">
                        {track.is_published ? <EyeOff className="w-4 h-4 text-yellow-400" /> : <Eye className="w-4 h-4 text-green-400" />}
                        <span className="text-xs text-white/60">{track.is_published ? 'Unpublish' : 'Publish'}</span>
                      </button>
                      <button onClick={() => handleToggleFeatured(track)} disabled={actionLoading}
                        className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition text-left">
                        <CheckCircle className="w-4 h-4 text-blue-400" />
                        <span className="text-xs text-white/60">{track.featured ? 'Remove Featured' : 'Set Featured'}</span>
                      </button>
                      <button onClick={() => handleDeleteTrack(track)} disabled={actionLoading}
                        className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition text-left">
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

      {/* ══ ARTISTS ══ */}
      {activeTab === 'artists' && (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input type="text" value={artistSearch} onChange={e => setArtistSearch(e.target.value)}
              placeholder="Search artists..."
              className="w-full pl-10 pr-4 py-3 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/[0.15] focus:outline-none transition" />
          </div>
          {artistsLoading ? (
            <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
          ) : filteredArtists.length === 0 ? (
            <div className="text-center py-16">
              <User className="w-10 h-10 mx-auto text-white/10 mb-3" />
              <p className="text-white/30 text-sm">No artists found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredArtists.map(artist => (
                <div key={artist.id}
                  className={`rounded-xl p-4 border transition ${artist.is_suspended ? 'bg-red-500/[0.04] border-red-500/20' : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.05]'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 min-w-0">
                      {artist.avatar_url
                        ? <img src={artist.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                        : <div className="w-11 h-11 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0"><User className="w-4 h-4 text-white/15" /></div>}
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-white truncate">{artist.artist_name}</p>
                          {artist.is_suspended && <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[9px] font-bold rounded">SUSPENDED</span>}
                        </div>
                        {artist.is_suspended && artist.suspension_reason
                          ? <p className="text-[11px] text-red-400/60 mt-0.5 truncate">Reason: {artist.suspension_reason}</p>
                          : <p className="text-[11px] text-white/20 mt-0.5">Joined {new Date(artist.created_at).toLocaleDateString()}</p>}
                      </div>
                    </div>
                    <button onClick={() => { setActionArtist(actionArtist?.id === artist.id ? null : artist); setShowSuspendInput(false); setSuspendReason(''); }}
                      className="p-2 hover:bg-white/[0.05] rounded-lg transition flex-shrink-0">
                      <MoreVertical className="w-4 h-4 text-white/30" />
                    </button>
                  </div>
                  {actionArtist?.id === artist.id && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1">
                      {artist.is_suspended ? (
                        <button onClick={() => handleUnsuspendArtist(artist)} disabled={suspendLoading}
                          className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-green-500/10 transition text-left">
                          <Shield className="w-4 h-4 text-green-400" />
                          <span className="text-xs text-green-400/80">Unsuspend Artist</span>
                          {suspendLoading && <Loader className="w-3 h-3 animate-spin text-white/30 ml-auto" />}
                        </button>
                      ) : !showSuspendInput ? (
                        <button onClick={() => setShowSuspendInput(true)}
                          className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition text-left">
                          <ShieldOff className="w-4 h-4 text-red-400" />
                          <span className="text-xs text-red-400/70">Suspend Artist</span>
                        </button>
                      ) : (
                        <div className="space-y-2 px-1">
                          <p className="text-[11px] text-white/30 px-2">Reason for suspension</p>
                          <input type="text" value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
                            placeholder="e.g. Spam, harassment, copyright violation..."
                            className="w-full px-3 py-2.5 bg-white/[0.04] rounded-lg text-xs text-white placeholder:text-white/20 border border-white/[0.08] focus:border-red-500/30 focus:outline-none transition"
                            autoFocus />
                          <div className="flex space-x-2">
                            <button onClick={() => handleSuspendArtist(artist)} disabled={suspendLoading || !suspendReason.trim()}
                              className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition disabled:opacity-40">
                              {suspendLoading ? <Loader className="w-3 h-3 animate-spin text-red-400" /> : <ShieldOff className="w-3 h-3 text-red-400" />}
                              <span className="text-xs text-red-400 font-medium">Confirm Suspend</span>
                            </button>
                            <button onClick={() => { setShowSuspendInput(false); setSuspendReason(''); }}
                              className="px-3 py-2 rounded-lg hover:bg-white/[0.05] transition">
                              <span className="text-xs text-white/30">Cancel</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══ FRAUD FLAGS ══ */}
      {activeTab === 'flags' && (
        <>
          {/* Filter pills */}
          <div className="flex space-x-2 mb-4">
            {[
              { key: 'open',     label: 'Open',     Icon: Clock      },
              { key: 'resolved', label: 'Resolved', Icon: CheckCheck },
              { key: 'all',      label: 'All',      Icon: Flag       },
            ].map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setFlagFilter(key)}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium transition border ${
                  flagFilter === key
                    ? 'bg-white/[0.08] border-white/[0.15] text-white'
                    : 'bg-transparent border-white/[0.06] text-white/30 hover:text-white/50'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Boost safety banner */}
          <div className="mb-4 p-3 rounded-xl bg-blue-500/[0.06] border border-blue-500/15">
            <p className="text-[11px] text-blue-400/70 leading-relaxed">
              <span className="font-semibold text-blue-400">Boost streams are safe:</span> All boost streams are inserted with no user ID and are never flagged by the abuse detector. Only real user streams that exceed 500 plays/hour on the same track trigger a flag.
            </p>
          </div>

          {flagsLoading ? (
            <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
          ) : flags.length === 0 ? (
            <div className="text-center py-16">
              <Flag className="w-10 h-10 mx-auto text-white/10 mb-3" />
              <p className="text-white/30 text-sm">
                {flagFilter === 'open' ? 'No open fraud flags — all clear 🎉' : 'No flags found'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {flags.map(flag => {
                const sev = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.low;
                return (
                  <div key={flag.id}
                    className={`rounded-xl p-4 border ${flag.resolved ? 'bg-white/[0.02] border-white/[0.04] opacity-60' : `${sev.bg} ${sev.border}`}`}>
                    <div className="flex items-start justify-between space-x-3">
                      <div className="flex-1 min-w-0">
                        {/* Severity + type */}
                        <div className="flex items-center space-x-2 mb-1.5 flex-wrap gap-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${sev.bg} ${sev.text}`}>{sev.label}</span>
                          <span className="text-xs font-medium text-white/70">
                            {FLAG_TYPE_LABELS[flag.flag_type] || flag.flag_type}
                          </span>
                          {flag.resolved && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-green-500/15 text-green-400 rounded font-bold">RESOLVED</span>
                          )}
                        </div>

                        {/* Entity */}
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-[10px] text-white/30 uppercase tracking-wide">{flag.entity_type}</span>
                          <span className="text-[10px] text-white/15">•</span>
                          <span className="text-xs text-white/60 truncate font-medium">{flag.entityName || flag.entity_id}</span>
                        </div>

                        {/* Details */}
                        {flag.details && (
                          <p className="text-[11px] text-white/30 mt-1 leading-relaxed">
                            {typeof flag.details === 'object' ? JSON.stringify(flag.details) : flag.details}
                          </p>
                        )}

                        {/* Resolution note */}
                        {flag.resolved && flag.resolution_notes && (
                          <p className="text-[11px] text-green-400/50 mt-1.5 italic">Resolution: {flag.resolution_notes}</p>
                        )}

                        <p className="text-[10px] text-white/15 mt-1.5">{new Date(flag.created_at).toLocaleString()}</p>
                      </div>

                      {/* Actions */}
                      {!flag.resolved && (
                        <div className="flex flex-col space-y-1.5 flex-shrink-0">
                          <button onClick={() => handleResolveFlag(flag.id, 'Reviewed — no action needed')}
                            disabled={resolvingId === flag.id}
                            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 transition disabled:opacity-40">
                            {resolvingId === flag.id
                              ? <Loader className="w-3 h-3 animate-spin text-green-400" />
                              : <CheckCircle className="w-3 h-3 text-green-400" />}
                            <span className="text-[11px] text-green-400 font-medium">Resolve</span>
                          </button>
                          <button onClick={() => handleResolveFlag(flag.id, 'False positive — boost stream')}
                            disabled={resolvingId === flag.id}
                            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition disabled:opacity-40">
                            <XCircle className="w-3 h-3 text-white/30" />
                            <span className="text-[11px] text-white/30 font-medium">False +</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}