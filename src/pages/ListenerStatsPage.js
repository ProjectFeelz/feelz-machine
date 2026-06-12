import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/useTier';
import { useStreakContext } from '../contexts/StreakContext';
import { Lock } from 'lucide-react';
import {
  ChevronLeft, Headphones, Users, Heart, Clock,
  TrendingUp, Music, Zap, Award, BarChart3, Loader
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <p className="text-2xl font-black text-white leading-none mb-1">{value}</p>
      <p className="text-xs text-white/35">{label}</p>
      {sub && <p className="text-[10px] text-white/20 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ListenerStatsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { listenerTierSlug } = useTier();
  const isPro = listenerTierSlug === 'pro' || listenerTierSlug === 'premium' || listenerTierSlug === 'fan_pro';
  const { streak, longestStreak, discoveryStreak } = useStreakContext();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStreams: 0, totalMinutes: 0, uniqueArtists: 0, uniqueTracks: 0,
    thisWeekStreams: 0, lastWeekStreams: 0,
  });
  const [topArtists, setTopArtists]   = useState([]);
  const [topTracks,  setTopTracks]    = useState([]);
  const [topGenres,  setTopGenres]    = useState([]);
  const [recentMilestones, setRecentMilestones] = useState([]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user?.id]); // eslint-disable-line

  const load = async () => {
    setLoading(true);
    const now = new Date();
    const week1From = new Date(now - 7  * 86400000).toISOString();
    const week2From = new Date(now - 14 * 86400000).toISOString();
    const allTime   = '2020-01-01T00:00:00Z';

    try {
      // All-time streams for this user with track/artist info
      const { data: streams } = await supabase
        .from('streams')
        .select('duration_played, completed, created_at, track_id, tracks(title, cover_artwork_url, genre, artist_id, artists(artist_name, profile_image_url, slug))')
        .eq('user_id', user.id)
        .gte('created_at', allTime)
        .order('created_at', { ascending: false })
        .limit(5000);

      const rows = streams || [];

      // Core stats
      const totalMinutes  = Math.round(rows.reduce((s, r) => s + (r.duration_played || 0), 0) / 60);
      const uniqueArtists = new Set(rows.map(r => r.tracks?.artist_id).filter(Boolean)).size;
      const uniqueTracks  = new Set(rows.map(r => r.track_id).filter(Boolean)).size;
      const thisWeek      = rows.filter(r => r.created_at >= week1From).length;
      const lastWeek      = rows.filter(r => r.created_at >= week2From && r.created_at < week1From).length;

      setStats({
        totalStreams: rows.length, totalMinutes, uniqueArtists, uniqueTracks,
        thisWeekStreams: thisWeek, lastWeekStreams: lastWeek,
      });

      // Top artists by play count
      const artistCount = {};
      const artistMeta  = {};
      rows.forEach(r => {
        const a = r.tracks?.artists;
        const id = r.tracks?.artist_id;
        if (!id || !a) return;
        artistCount[id] = (artistCount[id] || 0) + 1;
        artistMeta[id]  = a;
      });
      const sortedArtists = Object.entries(artistCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ ...artistMeta[id], id, count }));
      setTopArtists(sortedArtists);

      // Top tracks by play count
      const trackCount = {};
      const trackMeta  = {};
      rows.forEach(r => {
        const id = r.track_id;
        if (!id) return;
        trackCount[id] = (trackCount[id] || 0) + 1;
        trackMeta[id]  = r.tracks;
      });
      const sortedTracks = Object.entries(trackCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ ...trackMeta[id], id, count }));
      setTopTracks(sortedTracks);

      // Genre breakdown
      const genreCount = {};
      rows.forEach(r => {
        const g = r.tracks?.genre;
        if (g) genreCount[g] = (genreCount[g] || 0) + 1;
      });
      const totalGenreStreams = Object.values(genreCount).reduce((s, v) => s + v, 0);
      const sortedGenres = Object.entries(genreCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([genre, count]) => ({ genre, count, pct: Math.round((count / totalGenreStreams) * 100) }));
      setTopGenres(sortedGenres);

      // Recent milestone notifications (top_supporter, streak etc)
      const { data: notifs } = await supabase
        .from('notifications')
        .select('type, title, created_at')
        .eq('user_id', user.id)
        .in('type', ['top_supporter', 'streak', 'first_listener'])
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentMilestones(notifs || []);

    } catch (err) {
      console.error('Listener stats error:', err);
    }
    setLoading(false);
  };

  const weekDiff    = stats.thisWeekStreams - stats.lastWeekStreams;
  const weekPct     = stats.lastWeekStreams > 0
    ? Math.round((weekDiff / stats.lastWeekStreams) * 100)
    : stats.thisWeekStreams > 0 ? 100 : 0;
  const totalHours  = Math.floor(stats.totalMinutes / 60);
  const remainMins  = stats.totalMinutes % 60;

  const GENRE_COLORS = [
    '#a855f7','#22d3ee','#f472b6','#fb923c','#34d399','#60a5fa',
  ];

  return (
    <div className="pb-32 px-4 max-w-2xl mx-auto">
      <Helmet>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <title>Your Stats · Feelz Machine</title>
      </Helmet>

      <div className="flex items-center space-x-3 mb-6 sticky top-0 z-20 bg-black/95 backdrop-blur-xl pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04]">
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Your Stats</h1>
          <p className="text-xs text-white/30">All-time listening data</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-6 h-6 animate-spin text-white/20" /></div>
      ) : (
        <div className="space-y-6">

          {/* ── Core stat grid ── */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Headphones} label="Total Streams"   value={stats.totalStreams.toLocaleString()} color="text-purple-400" />
            <StatCard icon={Clock}      label="Listening Time"
              value={totalHours > 0 ? `${totalHours}h ${remainMins}m` : `${stats.totalMinutes}m`}
              color="text-cyan-400" />
            <StatCard icon={Users}      label="Artists Heard"   value={stats.uniqueArtists.toLocaleString()} color="text-pink-400" />
            <StatCard icon={Music}      label="Unique Tracks"   value={stats.uniqueTracks.toLocaleString()}  color="text-green-400" />
          </div>

          {/* ── Week vs last week ── */}
          <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.05]">
            <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3">This week vs last week</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-black text-white">{stats.thisWeekStreams}</p>
                <p className="text-xs text-white/30 mt-0.5">streams this week</p>
              </div>
              <div className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-sm font-bold ${
                weekDiff > 0 ? 'bg-green-500/10 text-green-400'
                  : weekDiff < 0 ? 'bg-red-500/10 text-red-400'
                  : 'bg-white/[0.06] text-white/30'
              }`}>
                <span>{weekDiff > 0 ? '↑' : weekDiff < 0 ? '↓' : '—'}</span>
                <span>{weekDiff !== 0 ? `${Math.abs(weekPct)}%` : 'same'}</span>
              </div>
            </div>
          </div>

          {/* ── Streaks ── */}
          {(streak > 0 || discoveryStreak > 0) && (
            <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.05]">
              <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3">Streaks</p>
              <div className="flex space-x-3">
                {streak > 0 && (
                  <div className="flex-1 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-center">
                    <p className="text-2xl font-black text-orange-400">{streak}</p>
                    <p className="text-[10px] text-orange-400/60 mt-0.5">Day streak 🔥</p>
                    <p className="text-[10px] text-white/20 mt-1">Best: {longestStreak}</p>
                  </div>
                )}
                {discoveryStreak > 0 && (
                  <div className="flex-1 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                    <p className="text-2xl font-black text-blue-400">{discoveryStreak}</p>
                    <p className="text-[10px] text-blue-400/60 mt-0.5">Discovery 🧭</p>
                    <p className="text-[10px] text-white/20 mt-1">New artists</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Pro gate ── */}
          {!isPro && (
            <div className="rounded-xl p-4 text-center"
              style={{ background: 'rgba(88,28,135,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <Lock className="w-5 h-5 text-purple-400/60 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white mb-1">Fan Pro Feature</p>
              <p className="text-xs text-white/40 mb-3">Upgrade to see your top artists, tracks and genre breakdown</p>
              <button onClick={() => navigate('/listener/upgrade')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition active:scale-95"
                style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
                Upgrade to Fan Pro
              </button>
            </div>
          )}

          {/* ── Top Artists ── */}
          {isPro && topArtists.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3">Your Top Artists</p>
              <div className="space-y-2">
                {topArtists.map((a, i) => (
                  <button key={a.id}
                    onClick={() => a.slug && navigate(`/artist/${a.slug}`)}
                    className="w-full flex items-center space-x-3 p-3 rounded-xl hover:bg-white/[0.04] transition text-left active:scale-[0.98]"
                  >
                    <span className="text-xs font-bold text-white/20 w-4 flex-shrink-0">{i + 1}</span>
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-white/[0.06] flex-shrink-0">
                      {a.profile_image_url
                        ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <span className="text-xs font-bold text-white/30">{a.artist_name?.[0]?.toUpperCase()}</span>
                          </div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{a.artist_name}</p>
                      <p className="text-xs text-white/30">{a.count} plays</p>
                    </div>
                    <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex-shrink-0">
                      <div className="h-full bg-purple-400 rounded-full"
                        style={{ width: `${Math.round((a.count / topArtists[0].count) * 100)}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Top Tracks ── */}
          {isPro && topTracks.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3">Most Played Tracks</p>
              <div className="space-y-2">
                {topTracks.map((t, i) => (
                  <div key={t.id} className="flex items-center space-x-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <span className="text-xs font-bold text-white/20 w-4 flex-shrink-0">{i + 1}</span>
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                      {t.cover_artwork_url
                        ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-4 h-4 text-white/20" />
                          </div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                      <p className="text-xs text-white/30">{t.artists?.artist_name || ''}</p>
                    </div>
                    <span className="text-xs text-white/25 flex-shrink-0">{t.count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Genre breakdown ── */}
          {isPro && topGenres.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3">Genre Breakdown</p>
              <div className="space-y-2.5">
                {topGenres.map((g, i) => (
                  <div key={g.genre}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/60 font-medium">{g.genre}</span>
                      <span className="text-white/25">{g.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${g.pct}%`, backgroundColor: GENRE_COLORS[i % GENRE_COLORS.length] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recent milestones ── */}
          {recentMilestones.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3">Recent Milestones</p>
              <div className="space-y-2">
                {recentMilestones.map(m => (
                  <div key={m.created_at} className="flex items-center space-x-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <Award className="w-5 h-5 text-yellow-400/70 flex-shrink-0" />
                    <p className="text-sm text-white/70 flex-1">{m.title}</p>
                    <p className="text-[10px] text-white/20 flex-shrink-0">
                      {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.totalStreams === 0 && (
            <div className="text-center py-16">
              <Headphones className="w-12 h-12 mx-auto text-white/10 mb-3" />
              <p className="text-white/30 text-sm">No listening data yet</p>
              <p className="text-white/15 text-xs mt-1">Start playing music to see your stats here</p>
              <button onClick={() => navigate('/browse')}
                className="mt-4 px-4 py-2 bg-white/[0.06] rounded-lg text-sm text-white/50 hover:bg-white/[0.1] transition">
                Discover Music
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}