import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3, Download, Music, Loader,
  Upload, ChevronLeft, Headphones, Heart, TrendingUp, Users, Trophy, Zap
} from 'lucide-react';
import TrackUploadPanel from './TrackUploadPanel';
import CollabRequests, { CollabBadge } from '../components/CollabRequests';
import TierGate, { UploadGate, TierBadge } from '../components/TierGate';
import { VoiceMemoCard, VoiceMemoUpload } from '../components/VoiceMemo';

function ContactExportButton({ artist }) {
  const [exporting, setExporting] = React.useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/export-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: artist.id, user_id: session?.user?.id }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); setExporting(false); return; }
      if (data.count === 0) { alert('No follower emails found yet'); setExporting(false); return; }
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${artist.artist_name}_contacts.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
    setExporting(false);
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="flex items-center space-x-2 px-4 py-2.5 bg-white/[0.04] rounded-xl text-sm text-white/60 hover:bg-white/[0.08] transition border border-white/[0.06] disabled:opacity-40"
    >
      <Download className="w-3.5 h-3.5" />
      <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
    </button>
  );
}

function MemoTabPanel({ artist, memos, fetchMemos, deleteMemo }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white mb-1">Voice Memos</h2>
        <p className="text-sm text-white/40 mb-4">
          Record short audio updates for your followers — thoughts, teasers, behind-the-scenes.
          They'll appear on your artist profile.
        </p>
        <VoiceMemoUpload artistId={artist?.id} onUploaded={fetchMemos} />
      </div>

      {memos.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold mb-3">Your Memos</p>
          <div className="space-y-2">
            {memos.map(memo => (
              <VoiceMemoCard
                key={memo.id}
                memo={memo}
                canDelete
                onDelete={deleteMemo}
              />
            ))}
          </div>
        </div>
      )}

      {memos.length === 0 && (
        <div className="text-center py-10 text-white/20">
          <p className="text-sm">No memos yet. Record your first one above.</p>
        </div>
      )}
    </div>
  );
}

export default function ArtistDashboard() {
  const navigate = useNavigate();
  const { artist, isMaster, isBeatmaker } = useAuth();

  const [activeTab, setActiveTab] = useState(
    new URLSearchParams(window.location.search).get('tab') || 'analytics'
  );
  const [wheelChallenge, setWheelChallenge] = useState(null);
  const [stats, setStats] = useState({
    streams: 0, downloads: 0, followers: 0, tracks: 0, likes: 0,
  });
  const [topTracks, setTopTracks] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [trackRange, setTrackRange]       = useState(30);
  const [trackStreams, setTrackStreams]    = useState([]);
  const [trackLikes, setTrackLikes]       = useState([]);
  const [trackAnalyticsLoading, setTrackAnalyticsLoading] = useState(false);
  const [demographics, setDemographics]   = useState({ devices: [], countries: [], completionRate: 0 });
  const [memos, setMemos] = useState([]);

  const fetchMemos = useCallback(async () => {
    if (!artist?.id) return;
    const { data } = await supabase
      .from('artist_voice_memos')
      .select('*')
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setMemos(data || []);
  }, [artist?.id]);

  const deleteMemo = async (memoId) => {
    await supabase.from('artist_voice_memos').delete().eq('id', memoId);
    setMemos(prev => prev.filter(m => m.id !== memoId));
  };

  // ── Analytics ────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!artist) return;
    setLoading(true);
    try {
      const { data: artistTracks } = await supabase
        .from('tracks').select('id').eq('artist_id', artist.id);
      const trackIds = (artistTracks || []).map(t => t.id);

      let streamCount = 0, dlCount = 0;
      if (trackIds.length > 0) {
        const { data: streamData } = await supabase
          .from('tracks').select('stream_count, download_count').eq('artist_id', artist.id);
        streamCount = (streamData || []).reduce((s, t) => s + (t.stream_count || 0), 0);
        dlCount     = (streamData || []).reduce((s, t) => s + (t.download_count || 0), 0);
      }

      const { count: followCount } = await supabase
        .from('follows').select('*', { count: 'exact', head: true }).eq('artist_id', artist.id);

      let likeCount = 0;
      if (trackIds.length > 0) {
        const { count: lc } = await supabase
          .from('track_likes').select('*', { count: 'exact', head: true }).in('track_id', trackIds);
        likeCount = lc || 0;
      }

      setStats({
        streams: streamCount, downloads: dlCount,
        followers: followCount || 0, tracks: trackIds.length, likes: likeCount,
      });

      const { data: tracks } = await supabase
        .from('tracks')
        .select('id, title, cover_artwork_url, stream_count, download_count')
        .eq('artist_id', artist.id)
        .order('stream_count', { ascending: false })
        .limit(20);

      // Enrich with like counts
      if (tracks?.length) {
        const likeCounts = await Promise.all(tracks.map(t =>
          supabase.from('track_likes').select('*', { count: 'exact', head: true }).eq('track_id', t.id)
        ));
        setTopTracks(tracks.map((t, i) => ({ ...t, like_count: likeCounts[i]?.count || 0 })));
      } else {
        setTopTracks([]);
      }
    } catch (err) {
      console.error('Stats error:', err);
    }
    setLoading(false);
  }, [artist]);

  useEffect(() => {
    if (activeTab === 'analytics' && artist) fetchStats();
    if (activeTab === 'memos' && artist) fetchMemos();
  }, [activeTab, artist, fetchStats, fetchMemos]);

  useEffect(() => {
    if (!artist) return;
    supabase.from('wheel_challenges')
      .select('id, prompt, mode, competition_id, competitions(id, status, entries_close_at, voting_close_at, max_votes_per_user)')
      .eq('is_current', true).maybeSingle()
      .then(({ data }) => setWheelChallenge(data || null));
  }, [artist?.id]); // eslint-disable-line

  // ── No artist guard ───────────────────────────────────────────────────────────
  if (!artist) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center">
          <Music className="w-12 h-12 mx-auto text-white/20 mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Artist Dashboard</h2>
          <p className="text-sm text-white/40 mb-6">This area is for artists. Browse music or check your library instead.</p>
          <div className="flex flex-col space-y-3 items-center">
            <button onClick={() => navigate('/')}
              className="px-6 py-2.5 bg-white text-black rounded-xl text-sm font-semibold transition hover:bg-white/90">
              Go Home
            </button>
            <button onClick={() => navigate('/library')}
              className="px-6 py-2.5 bg-white/[0.06] text-white/60 rounded-xl text-sm transition hover:bg-white/[0.1]">
              Your Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  const fetchTrackAnalytics = async (trackId, days) => {
    if (!trackId) return;
    setTrackAnalyticsLoading(true);
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data: streamData } = await supabase
        .from('streams').select('created_at')
        .eq('track_id', trackId).gte('created_at', since).order('created_at');
      const { data: likeData } = await supabase
        .from('track_likes').select('created_at')
        .eq('track_id', trackId).gte('created_at', since).order('created_at');

      // Build daily buckets
      const streamMap = {}, likeMap = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        streamMap[key] = 0; likeMap[key] = 0;
      }
      (streamData || []).forEach(s => {
        const key = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (streamMap[key] !== undefined) streamMap[key]++;
      });
      (likeData || []).forEach(l => {
        const key = new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (likeMap[key] !== undefined) likeMap[key]++;
      });
      setTrackStreams(Object.entries(streamMap).map(([date, streams]) => ({ date, streams })));
      setTrackLikes(Object.entries(likeMap).map(([date, likes]) => ({ date, likes })));

      // Listener demographics
      const { data: demoData } = await supabase
        .from('streams').select('device_type, completed, duration_played')
        .eq('track_id', trackId).gte('created_at', since).limit(1000);
      if (demoData?.length) {
        const dc = {};
        let completed = 0;
        (demoData || []).forEach(s => {
          dc[s.device_type || 'unknown'] = (dc[s.device_type || 'unknown'] || 0) + 1;
          if (s.completed) completed++;
        });
        const total = demoData.length;
        setDemographics({
          devices: Object.entries(dc).map(([name, count]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            count, pct: Math.round((count / total) * 100),
          })).sort((a, b) => b.count - a.count),
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
          totalStreams: total,
        });
      } else {
        setDemographics({ devices: [], completionRate: 0, totalStreams: 0 });
      }
    } catch {}
    setTrackAnalyticsLoading(false);
  };


  const statCards = [
    { icon: Headphones, label: 'Total Streams', value: stats.streams,   color: 'text-purple-400' },
    { icon: Download,   label: 'Downloads',     value: stats.downloads, color: 'text-blue-400' },
    { icon: Users,      label: 'Followers',     value: stats.followers, color: 'text-pink-400' },
    { icon: Music,      label: 'Tracks',        value: stats.tracks,    color: 'text-green-400' },
    { icon: Heart,      label: 'Likes',         value: stats.likes,     color: 'text-red-400' },
  ];

  const tabs = [
    { key: 'upload',     label: 'Upload',     icon: Upload },
    { key: 'collabs',    label: 'Collabs',    icon: Users, hasBadge: true },
    { key: 'analytics',  label: isBeatmaker ? 'Beat Analytics' : 'Analytics',  icon: BarChart3 },
    // Memos tab hidden from nav bar — accessible via Profile page Voice Memo button (?tab=memos)
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-8 pb-32">

        {/* ── Header ── */}
        <div className="flex items-center space-x-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-white">Dashboard</h1>
              <TierBadge size="xs" />
            </div>
            <p className="text-xs text-white/40">
              {artist.artist_name} {isMaster ? '(Master)' : ''}
            </p>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div className="flex space-x-1 bg-white/[0.03] rounded-lg p-1 mb-6">
          {tabs.map(({ key, label, icon: Icon, hasBadge, hasDot }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-md text-sm font-medium transition relative ${
                activeTab === key ? 'bg-white text-black' : 'text-white/50 hover:text-white/70'
              }`}
            >
              <div className="relative">
                <Icon className="w-4 h-4" />
                {hasBadge && activeTab !== key && <CollabBadge />}
                {hasDot && activeTab !== key && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-pink-500" />
                )}
              </div>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* ── Upload Tab ── */}
        {activeTab === 'upload' && (
          <UploadGate>
            <TrackUploadPanel />
          </UploadGate>
        )}

        {/* ── Collabs Tab ── */}
        {activeTab === 'collabs' && <CollabRequests />}

        {/* ── Voice Memos Tab ── */}
        {activeTab === 'memos' && (
          <MemoTabPanel
            artist={artist}
            memos={memos}
            fetchMemos={fetchMemos}
            deleteMemo={deleteMemo}
          />
        )}


        {/* ── Analytics Tab ── */}
        {activeTab === 'analytics' && (
          <TierGate feature="analytics">
            <style>{`.recharts-wrapper { overflow: visible !important; } .recharts-surface { overflow: visible !important; }`}</style>
            <div className="space-y-6">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader className="w-6 h-6 animate-spin text-white/30" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {statCards.map(({ icon: Icon, label, value, color }) => (
                      <div key={label} className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
                        <div className="flex items-center justify-between mb-3">
                          <Icon className={`w-6 h-6 ${color}`} />
                          <span className="text-3xl font-bold text-white">{value.toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-white/40">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Contact Export — Premium only */}
                  <TierGate feature="advanced_analytics" inline>
                    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">Follower Contacts</p>
                          <p className="text-xs text-white/30 mt-0.5">Export your followers' names and emails</p>
                        </div>
                        <ContactExportButton artist={artist} />
                      </div>
                    </div>
                  </TierGate>

                  {/* Per-song analytics */}
                  <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-5 h-5 text-white/40" />
                        <h3 className="text-base font-semibold text-white">Track Analytics</h3>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Date range selector */}
                        <div className="flex space-x-1 bg-white/[0.04] rounded-lg p-0.5">
                          {[7, 14, 30].map(d => (
                            <button key={d} onClick={() => setTrackRange(d)}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition ${trackRange === d ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'}`}>
                              {d}d
                            </button>
                          ))}
                        </div>
                        {/* Track selector */}
                        <select
                          value={selectedTrack || ''}
                          onChange={e => setSelectedTrack(e.target.value || null)}
                          className="bg-white/[0.06] text-white text-xs rounded-lg px-2.5 py-1.5 outline-none border border-white/[0.08] max-w-[160px] truncate">
                          <option value="">Pick a track…</option>
                          {topTracks.map(t => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Charts */}
                    {selectedTrack ? (
                      trackAnalyticsLoading ? (
                        <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
                      ) : (
                        <div className="space-y-4">
                          {/* Streams chart */}
                          <div>
                            <p className="text-xs text-white/40 mb-2 font-medium">Streams — {trackRange}d</p>
                            <ResponsiveContainer width="100%" height={120}>
                              <AreaChart data={trackStreams}>
                                <defs>
                                  <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                <YAxis tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }} axisLine={false} tickLine={false} width={24} />
                                <Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                                <Area type="monotone" dataKey="streams" stroke="#a78bfa" strokeWidth={2} fill="url(#sg)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          {/* Likes chart */}
                          <div>
                            <p className="text-xs text-white/40 mb-2 font-medium">Likes — {trackRange}d</p>
                            <ResponsiveContainer width="100%" height={100}>
                              <BarChart data={trackLikes}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                                <YAxis tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }} axisLine={false} tickLine={false} width={24} />
                                <Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                                <Bar dataKey="likes" fill="#f472b6" radius={[3,3,0,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          {/* Listener demographics */}
                          {demographics.devices.length > 0 && (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Devices</p>
                                {demographics.devices.map(d => (
                                  <div key={d.name} className="mb-1.5">
                                    <div className="flex justify-between text-xs mb-0.5">
                                      <span className="text-white/60">{d.name}</span>
                                      <span className="text-white/40">{d.pct}%</span>
                                    </div>
                                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                      <div className="h-full rounded-full bg-purple-400"
                                        style={{ width: `${d.pct}%` }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Engagement</p>
                                <div className="flex flex-col items-center justify-center h-full space-y-2 pt-2">
                                  <div className="text-3xl font-black text-white">{demographics.completionRate}%</div>
                                  <p className="text-[10px] text-white/30 text-center">completion rate</p>
                                  <p className="text-[10px] text-white/20">{demographics.totalStreams} streams sampled</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* CSV export for this track */}
                          <button onClick={async () => {
                            const { data } = await supabase.from('streams').select('created_at, duration_played, completed, device_type').eq('track_id', selectedTrack).order('created_at', { ascending: false }).limit(5000);
                            if (!data) return;
                            const csv = ['date,duration,completed,device', ...data.map(s => `${s.created_at},${s.duration_played},${s.completed},${s.device_type}`)].join('\n');
                            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                            a.download = 'track-streams.csv'; a.click();
                          }} className="flex items-center space-x-2 px-3 py-2 bg-white/[0.04] rounded-xl text-xs text-white/50 hover:bg-white/[0.08] transition border border-white/[0.06]">
                            <TrendingUp className="w-3.5 h-3.5" /><span>Export streams CSV</span>
                          </button>
                        </div>
                      )
                    ) : (
                      <p className="text-center text-white/20 text-sm py-4">Select a track to see detailed analytics</p>
                    )}

                    {/* Top tracks list */}
                    <div className="border-t border-white/[0.04] pt-3 space-y-2">
                      <p className="text-xs text-white/30 font-medium mb-2">All tracks</p>
                      {topTracks.map((track, i) => (
                        <div key={track.id} onClick={() => setSelectedTrack(track.id)}
                          className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition ${selectedTrack === track.id ? 'bg-white/[0.08] ring-1 ring-white/10' : 'hover:bg-white/[0.04]'}`}>
                          <span className="text-xs font-bold text-white/30 w-5 text-right">{i + 1}</span>
                          {track.cover_artwork_url
                            ? <img src={track.cover_artwork_url} alt="" className="w-9 h-9 rounded-md object-cover" />
                            : <div className="w-9 h-9 rounded-md bg-white/[0.06] flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{track.title}</p>
                            <p className="text-xs text-white/30">{(track.stream_count || 0).toLocaleString()} streams · {(track.like_count || 0).toLocaleString()} likes</p>
                          </div>
                          {selectedTrack === track.id && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />}
                        </div>
                      ))}
                      {topTracks.length === 0 && <p className="text-center text-white/20 text-sm py-4">No tracks yet</p>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </TierGate>
        )}

      </div>
    </div>
  );
}