import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ChevronLeft, Search, Flame, Star, TrendingUp, Shield,
  Loader, Music, Users, Zap, Crown, RefreshCw, BarChart2
} from 'lucide-react';

function Toast({ message, type }) {
  if (!message) return null;
  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl transition-all ${
      type === 'success' ? 'bg-green-500/20 text-green-300 border border-green-500/30'
      : 'bg-red-500/20 text-red-300 border border-red-500/30'
    }`}>
      {message}
    </div>
  );
}

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors ${value ? 'bg-white' : 'bg-white/10'} ${disabled ? 'opacity-40' : ''}`}>
      <div className={`w-4 h-4 rounded-full transition-transform ${value ? 'translate-x-4 bg-black' : 'translate-x-0 bg-white/40'}`} />
    </button>
  );
}

function ScoreSlider({ value, onChange, disabled }) {
  return (
    <div className="flex items-center space-x-2">
      <input
        type="range" min="0" max="9999" step="100"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        disabled={disabled}
        className="w-28 accent-white h-1"
      />
      <span className="text-xs text-white/40 w-10 text-right">{value >= 9999 ? 'MAX' : value}</span>
    </div>
  );
}

// Animated stream count display
function StreamCounter({ trackId, baseCount, boostProgress }) {
  const displayed = boostProgress[trackId]
    ? baseCount + boostProgress[trackId].added
    : baseCount;
  const isActive = boostProgress[trackId]?.active;
  return (
    <p className={`text-xs transition-colors ${isActive ? 'text-green-400 font-semibold' : 'text-white/20'}`}>
      {displayed.toLocaleString()} plays
      {isActive && <span className="ml-1 animate-pulse">↑</span>}
    </p>
  );
}

// Stream boost control row
function StreamBoostRow({ track, onBoost, isBoosting }) {
  const [amount, setAmount] = useState(500);
  const presets = [
    { label: '100', value: 100 },
    { label: '500', value: 500 },
    { label: '1K', value: 1000 },
    { label: '5K', value: 5000 },
  ];
  return (
    <div className="flex items-center justify-between px-3 py-2.5 bg-white/[0.03] rounded-lg">
      <div className="flex items-center space-x-2">
        <BarChart2 className="w-3.5 h-3.5 text-green-400" />
        <span className="text-xs text-white/60">Stream Boost</span>
      </div>
      <div className="flex items-center space-x-1.5">
        {/* Quick preset buttons */}
        {presets.map(p => (
          <button
            key={p.value}
            onClick={() => setAmount(p.value)}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
              amount === p.value
                ? 'bg-green-500/30 text-green-300'
                : 'bg-white/[0.04] text-white/30 hover:bg-white/[0.08]'
            }`}>
            {p.label}
          </button>
        ))}
        {/* Boost button */}
        <button
          onClick={() => onBoost(track, amount)}
          disabled={isBoosting}
          className="px-2.5 py-1 bg-green-500/20 text-green-400 text-xs rounded-lg hover:bg-green-500/30 transition disabled:opacity-40 flex items-center space-x-1">
          {isBoosting
            ? <><Loader className="w-3 h-3 animate-spin" /><span>Boosting</span></>
            : <><Flame className="w-3 h-3" /><span>Boost</span></>}
        </button>
      </div>
    </div>
  );
}

export default function AdminBoost({ embedded = false }) {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState('tracks');
  const [trackQuery, setTrackQuery] = useState('');
  const [artistQuery, setArtistQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [artists, setArtists] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [saving, setSaving] = useState({});
  const [toast, setToast] = useState({ message: '', type: '' });

  // Track incremental boost animation state per track
  // { [trackId]: { active: bool, added: number, total: number } }
  const [boostProgress, setBoostProgress] = useState({});
  const animationRefs = useRef({});

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/hub');
  }, [isAdmin, authLoading]);

  // Cleanup all animation intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(animationRefs.current).forEach(clearInterval);
    };
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: '' }), 2500);
  };

  // ── STREAM BOOST (works for all artists via SECURITY DEFINER RPC) ──
  const handleStreamBoost = async (track, amount) => {
    setSaving(p => ({ ...p, [`${track.id}-boost`]: true }));

    // Clear any existing animation for this track
    if (animationRefs.current[track.id]) {
      clearInterval(animationRefs.current[track.id]);
    }

    try {
      const { data, error } = await supabase.rpc('boost_track_streams', {
        p_track_id: track.id,
        p_count: amount,
      });

      if (error) throw error;

      const inserted = data?.inserted || amount;

      // Start incremental counter animation
      let added = 0;
      const step = Math.max(1, Math.floor(inserted / 80)); // ~80 ticks
      setBoostProgress(p => ({ ...p, [track.id]: { active: true, added: 0, total: inserted } }));

      animationRefs.current[track.id] = setInterval(() => {
        added = Math.min(added + step, inserted);
        setBoostProgress(p => ({
          ...p,
          [track.id]: { active: added < inserted, added, total: inserted },
        }));

        if (added >= inserted) {
          clearInterval(animationRefs.current[track.id]);
          // Commit the final count to the tracks state
          setTracks(prev => prev.map(t =>
            t.id === track.id
              ? { ...t, stream_count: (t.stream_count || 0) + inserted }
              : t
          ));
          // Clear progress after a short delay
          setTimeout(() => {
            setBoostProgress(p => {
              const next = { ...p };
              delete next[track.id];
              return next;
            });
          }, 2000);
        }
      }, 40); // tick every 40ms → ~3.2s total animation

      showToast(`+${inserted.toLocaleString()} streams boosted for ${track.title}`);
    } catch (err) {
      showToast(err.message || 'Boost failed', 'error');
    }

    setSaving(p => ({ ...p, [`${track.id}-boost`]: false }));
  };

  // ── TRACKS ──
  const searchTracks = useCallback(async () => {
    setIsLoading(true);
    const q = supabase
      .from('tracks')
      .select('id, title, cover_artwork_url, featured, engagement_score, stream_count, is_published, artists(artist_name, slug)')
      .order('engagement_score', { ascending: false })
      .limit(30);
    if (trackQuery.trim()) q.ilike('title', `%${trackQuery}%`);
    const { data } = await q;
    setTracks((data || []).map(t => ({ ...t, _score: t.engagement_score || 0 })));
    setIsLoading(false);
  }, [trackQuery]);

  useEffect(() => {
    if (activeTab === 'tracks') searchTracks();
  }, [activeTab]);

  const handleTrackField = async (track, field, value) => {
    setSaving(p => ({ ...p, [`${track.id}-${field}`]: true }));
    try {
      const { error } = await supabase.from('tracks').update({
        [field]: value, updated_at: new Date().toISOString()
      }).eq('id', track.id);
      if (error) throw error;
      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, [field]: value } : t));
      showToast(`${track.title} updated`);
    } catch (err) {
      showToast(err.message, 'error');
    }
    setSaving(p => ({ ...p, [`${track.id}-${field}`]: false }));
  };

  const handleScoreCommit = async (track, value) => {
    setSaving(p => ({ ...p, [`${track.id}-score`]: true }));
    try {
      await supabase.from('tracks').update({
        engagement_score: value,
        stream_count: Math.max(track.stream_count || 0, Math.floor(value / 10)),
        updated_at: new Date().toISOString(),
      }).eq('id', track.id);
      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, engagement_score: value, _score: value } : t));
      showToast(`Score set to ${value === 9999 ? 'MAX' : value}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
    setSaving(p => ({ ...p, [`${track.id}-score`]: false }));
  };

  // ── ARTISTS ──
  const searchArtists = useCallback(async () => {
    setIsLoading(true);
    const q = supabase
      .from('artists')
      .select('id, artist_name, slug, profile_image_url, is_verified, tier, follower_count, total_streams')
      .order('follower_count', { ascending: false })
      .limit(30);
    if (artistQuery.trim()) q.ilike('artist_name', `%${artistQuery}%`);
    const { data } = await q;
    setArtists(data || []);
    setIsLoading(false);
  }, [artistQuery]);

  useEffect(() => {
    if (activeTab === 'artists') searchArtists();
  }, [activeTab]);

  const handleArtistField = async (artist, field, value) => {
    setSaving(p => ({ ...p, [`${artist.id}-${field}`]: true }));
    try {
      const { error } = await supabase.from('artists').update({
        [field]: value, updated_at: new Date().toISOString()
      }).eq('id', artist.id);
      if (error) throw error;
      setArtists(prev => prev.map(a => a.id === artist.id ? { ...a, [field]: value } : a));
      showToast(`${artist.artist_name} updated`);
    } catch (err) {
      showToast(err.message, 'error');
    }
    setSaving(p => ({ ...p, [`${artist.id}-${field}`]: false }));
  };

  const handleFollowerBoost = async (artist, value) => {
    setSaving(p => ({ ...p, [`${artist.id}-followers`]: true }));
    try {
      await supabase.from('artists').update({
        follower_count: value,
        total_streams: Math.max(artist.total_streams || 0, value * 5),
        updated_at: new Date().toISOString(),
      }).eq('id', artist.id);
      setArtists(prev => prev.map(a => a.id === artist.id ? { ...a, follower_count: value } : a));
      showToast(`Followers set to ${value}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
    setSaving(p => ({ ...p, [`${artist.id}-followers`]: false }));
  };

  const setArtistTier = async (artist, tier) => {
    setSaving(p => ({ ...p, [`${artist.id}-tier`]: true }));
    try {
      await supabase.from('artists').update({ tier, updated_at: new Date().toISOString() }).eq('id', artist.id);
      setArtists(prev => prev.map(a => a.id === artist.id ? { ...a, tier } : a));
      showToast(`${artist.artist_name} → ${tier.toUpperCase()}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
    setSaving(p => ({ ...p, [`${artist.id}-tier`]: false }));
  };

  if (authLoading) return null;
  if (!isAdmin) return null;

  return (
    <div className="pt-4 pb-32 px-4">
      <Toast message={toast.message} type={toast.type} />

      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/admin')} className="p-2 -ml-2 hover:bg-white/[0.05] rounded-lg transition">
          <ChevronLeft className="w-5 h-5 text-white/40" />
        </button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
          <Flame className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Boost Controls</h1>
          <p className="text-xs text-white/30">Trending, featured & visibility overrides</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-white/[0.03] rounded-xl p-1 mb-5">
        {[
          { key: 'tracks', label: 'Tracks', icon: Music },
          { key: 'artists', label: 'Artists', icon: Users },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition ${
              activeTab === key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
            }`}>
            <Icon className="w-4 h-4" /><span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── TRACKS TAB ── */}
      {activeTab === 'tracks' && (
        <div className="space-y-4">
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input
                type="text" value={trackQuery}
                onChange={(e) => setTrackQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchTracks()}
                placeholder="Search track name..."
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.05] rounded-xl text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20 transition"
              />
            </div>
            <button onClick={searchTracks}
              className="px-4 py-2.5 bg-white/[0.06] rounded-xl hover:bg-white/[0.1] transition">
              <RefreshCw className="w-4 h-4 text-white/50" />
            </button>
          </div>

          {/* Legend */}
          <div className="flex items-center space-x-4 px-1">
            <div className="flex items-center space-x-1.5">
              <Star className="w-3 h-3 text-yellow-400" />
              <span className="text-[10px] text-white/30">Featured</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <TrendingUp className="w-3 h-3 text-green-400" />
              <span className="text-[10px] text-white/30">Trending Score</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Zap className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] text-white/30">Published</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <BarChart2 className="w-3 h-3 text-green-400" />
              <span className="text-[10px] text-white/30">Stream Boost</span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
          ) : tracks.length === 0 ? (
            <p className="text-center text-white/20 text-sm py-12">No tracks found</p>
          ) : tracks.map(track => (
            <div key={track.id}
              className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.05] space-y-3">
              {/* Track info */}
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-white/[0.06]">
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{track.title}</p>
                  <p className="text-xs text-white/30 truncate">{track.artists?.artist_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <StreamCounter
                    trackId={track.id}
                    baseCount={track.stream_count || 0}
                    boostProgress={boostProgress}
                  />
                </div>
              </div>

              {/* Controls */}
              <div className="grid grid-cols-1 gap-2.5">
                {/* Featured */}
                <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Star className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-xs text-white/60">Featured on Homepage</span>
                  </div>
                  <Toggle
                    value={track.featured}
                    onChange={(v) => handleTrackField(track, 'featured', v)}
                    disabled={saving[`${track.id}-featured`]}
                  />
                </div>

                {/* Published */}
                <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs text-white/60">Published</span>
                  </div>
                  <Toggle
                    value={track.is_published}
                    onChange={(v) => handleTrackField(track, 'is_published', v)}
                    disabled={saving[`${track.id}-is_published`]}
                  />
                </div>

                {/* Trending Score */}
                <div className="flex items-center justify-between px-3 py-2.5 bg-white/[0.03] rounded-lg">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-white/60">Trending Score</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <ScoreSlider
                      value={track._score}
                      onChange={(v) => setTracks(prev => prev.map(t => t.id === track.id ? { ...t, _score: v } : t))}
                      disabled={saving[`${track.id}-score`]}
                    />
                    <button
                      onClick={() => handleScoreCommit(track, track._score)}
                      disabled={saving[`${track.id}-score`]}
                      className="px-2.5 py-1 bg-green-500/20 text-green-400 text-xs rounded-lg hover:bg-green-500/30 transition disabled:opacity-40">
                      {saving[`${track.id}-score`] ? <Loader className="w-3 h-3 animate-spin" /> : 'Set'}
                    </button>
                  </div>
                </div>

                {/* Quick score presets */}
                <div className="flex items-center space-x-2 px-1">
                  <span className="text-[10px] text-white/20">Quick:</span>
                  {[
                    { label: 'Reset', value: 0, color: 'text-white/30 bg-white/[0.04]' },
                    { label: '🔥 Hot', value: 500, color: 'text-orange-400 bg-orange-500/10' },
                    { label: '⚡ Viral', value: 2000, color: 'text-yellow-400 bg-yellow-500/10' },
                    { label: '👑 MAX', value: 9999, color: 'text-purple-400 bg-purple-500/10' },
                  ].map(({ label, value, color }) => (
                    <button key={label}
                      onClick={() => {
                        setTracks(prev => prev.map(t => t.id === track.id ? { ...t, _score: value } : t));
                        handleScoreCommit({ ...track, _score: value }, value);
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition ${color} hover:opacity-80`}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── Stream Boost (RPC — works for ALL artists) ── */}
                <StreamBoostRow
                  track={track}
                  onBoost={handleStreamBoost}
                  isBoosting={!!saving[`${track.id}-boost`]}
                />

                {/* Boost progress bar */}
                {boostProgress[track.id] && (
                  <div className="px-1">
                    <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-400 rounded-full transition-all duration-75"
                        style={{
                          width: `${Math.round((boostProgress[track.id].added / boostProgress[track.id].total) * 100)}%`
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-green-400/60 mt-1">
                      +{boostProgress[track.id].added.toLocaleString()} / {boostProgress[track.id].total.toLocaleString()} streams
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ARTISTS TAB ── */}
      {activeTab === 'artists' && (
        <div className="space-y-4">
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input
                type="text" value={artistQuery}
                onChange={(e) => setArtistQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchArtists()}
                placeholder="Search artist name..."
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.05] rounded-xl text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] focus:border-white/20 transition"
              />
            </div>
            <button onClick={searchArtists}
              className="px-4 py-2.5 bg-white/[0.06] rounded-xl hover:bg-white/[0.1] transition">
              <RefreshCw className="w-4 h-4 text-white/50" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
          ) : artists.length === 0 ? (
            <p className="text-center text-white/20 text-sm py-12">No artists found</p>
          ) : artists.map(artist => (
            <div key={artist.id}
              className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.05] space-y-3">
              {/* Artist info */}
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-white/[0.06]">
                  {artist.profile_image_url
                    ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-600/40 to-blue-600/30">
                        <span className="text-sm font-bold text-white/60">{artist.artist_name?.[0]}</span>
                      </div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-semibold text-white truncate">{artist.artist_name}</p>
                    {artist.is_verified && <Shield className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-white/30">{(artist.follower_count || 0).toLocaleString()} followers</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${
                  artist.tier === 'premium' ? 'bg-yellow-500/20 text-yellow-400'
                  : artist.tier === 'pro' ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-white/[0.06] text-white/30'
                }`}>
                  {(artist.tier || 'free').toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {/* Verified */}
                <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs text-white/60">Verified Badge</span>
                  </div>
                  <Toggle
                    value={artist.is_verified}
                    onChange={(v) => handleArtistField(artist, 'is_verified', v)}
                    disabled={saving[`${artist.id}-is_verified`]}
                  />
                </div>

                {/* Tier override */}
                <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Crown className="w-3.5 h-3.5 text-yellow-400" />
                    <span className="text-xs text-white/60">Tier Override</span>
                  </div>
                  <div className="flex space-x-1">
                    {['free', 'pro', 'premium'].map(t => (
                      <button key={t}
                        onClick={() => setArtistTier(artist, t)}
                        disabled={saving[`${artist.id}-tier`]}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                          artist.tier === t
                            ? t === 'premium' ? 'bg-yellow-500 text-black'
                              : t === 'pro' ? 'bg-purple-500 text-white'
                              : 'bg-white text-black'
                            : 'bg-white/[0.06] text-white/30 hover:bg-white/[0.1]'
                        }`}>
                        {t === 'free' ? 'Free' : t === 'pro' ? 'Pro' : 'Premium'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Follower boost */}
                <div className="flex items-center justify-between px-3 py-2.5 bg-white/[0.03] rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Users className="w-3.5 h-3.5 text-pink-400" />
                    <span className="text-xs text-white/60">Follower Count</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number" min="0"
                      value={artist.follower_count || 0}
                      onChange={(e) => setArtists(prev => prev.map(a =>
                        a.id === artist.id ? { ...a, follower_count: parseInt(e.target.value) || 0 } : a
                      ))}
                      className="w-20 px-2 py-1 bg-white/[0.06] rounded-lg text-xs text-white text-right outline-none border border-white/[0.06] focus:border-white/20"
                    />
                    <button
                      onClick={() => handleFollowerBoost(artist, artist.follower_count)}
                      disabled={saving[`${artist.id}-followers`]}
                      className="px-2.5 py-1 bg-pink-500/20 text-pink-400 text-xs rounded-lg hover:bg-pink-500/30 transition disabled:opacity-40">
                      {saving[`${artist.id}-followers`] ? <Loader className="w-3 h-3 animate-spin" /> : 'Set'}
                    </button>
                  </div>
                </div>

                {/* Quick follower presets */}
                <div className="flex items-center space-x-2 px-1">
                  <span className="text-[10px] text-white/20">Quick:</span>
                  {[
                    { label: 'Reset', value: 0 },
                    { label: '1K', value: 1000 },
                    { label: '10K', value: 10000 },
                    { label: '100K', value: 100000 },
                  ].map(({ label, value }) => (
                    <button key={label}
                      onClick={() => {
                        setArtists(prev => prev.map(a => a.id === artist.id ? { ...a, follower_count: value } : a));
                        handleFollowerBoost({ ...artist, follower_count: value }, value);
                      }}
                      className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-white/[0.04] text-white/30 hover:bg-white/[0.08] hover:text-white/50 transition">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}