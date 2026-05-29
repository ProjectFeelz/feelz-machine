import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3, ChevronLeft, Loader, Music, Users, Mic2,
  TrendingUp, Heart, Download, Headphones, FileDown,
  Smartphone, Monitor, Zap, Crown, Star, Activity,
  Radio, Globe, RefreshCw, Eye, Flame, DollarSign,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// ── Design tokens ─────────────────────────────────────────────────────────────
const PURPLE = '#a78bfa';
const CYAN   = '#22d3ee';
const GREEN  = '#34d399';
const ORANGE = '#fb923c';
const PINK   = '#f472b6';
const YELLOW = '#fbbf24';

const TIER_COLORS = { premium: YELLOW, pro: PURPLE, free: '#6b7280', master: YELLOW };

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function pct(a, b) {
  if (!b) return '0%';
  return ((a / b) * 100).toFixed(1) + '%';
}

function dayRange(days) {
  const map = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = days <= 7
      ? d.toLocaleDateString('en-US', { weekday: 'short' })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    map[key] = 0;
  }
  return map;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KPI({ icon: Icon, label, value, sub, color, delta }) {
  return (
    <div className="rounded-2xl p-4 border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05] transition">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        {delta != null && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${delta >= 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
            {delta >= 0 ? '+' : ''}{delta}%
          </span>
        )}
      </div>
      <p className="text-2xl font-black text-white tracking-tight">{fmt(value)}</p>
      <p className="text-xs text-white/40 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-white/25 mt-1">{sub}</p>}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, color = 'text-white/30' }) {
  return (
    <div className="flex items-center space-x-2 mb-4">
      <Icon className={`w-4 h-4 ${color}`} />
      <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">{title}</h2>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
        active ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'
      }`}>
      {children}
    </button>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-xs" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="text-white/50 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#fff' }} className="font-bold">{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminAnalytics() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState(7); // days for charts

  // Data state
  const [kpis, setKpis] = useState({});
  const [streamTimeline, setStreamTimeline] = useState([]);
  const [signupTimeline, setSignupTimeline] = useState([]);
  const [uploadTimeline, setUploadTimeline] = useState([]);
  const [deviceSplit, setDeviceSplit] = useState([]);
  const [tierSplit, setTierSplit] = useState([]);
  const [topTracks, setTopTracks] = useState([]);
  const [topArtists, setTopArtists] = useState([]);
  const [topGenres, setTopGenres] = useState([]);
  const [retentionStats, setRetentionStats] = useState({});
  const [recentStreams, setRecentStreams] = useState([]);
  const [sourceSplit, setSourceSplit]     = useState([]);
  const [completionStats, setCompletionStats] = useState({});
  const [beatStats, setBeatStats]         = useState({});
  const [revenueStats, setRevenueStats]   = useState({});
  const [listenerTierSplit, setListenerTierSplit] = useState([]);
  const [platformSignals, setPlatformSignals]     = useState([]);
  const [trendingGenres, setTrendingGenres]       = useState([]);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);

    try {
      const cutoff = new Date(Date.now() - range * 86400000).toISOString();
      const prev   = new Date(Date.now() - range * 2 * 86400000).toISOString();

      // ── KPI counts ────────────────────────────────────────────────────────
      const [
        { count: artistCount },
        { count: listenerCount },
        { count: trackCount },
        { count: publishedCount },
        { count: followCount },
        { count: likeCount },
        { count: collabCount },
        { count: streamCount },
        { count: prevStreamCount },
        { count: newArtists },
        { count: prevNewArtists },
        { count: activeListeners },
      ] = await Promise.all([
        supabase.from('artists').select('*', { count: 'exact', head: true }),
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('tracks').select('*', { count: 'exact', head: true }),
        supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('is_published', true),
        supabase.from('follows').select('*', { count: 'exact', head: true }),
        supabase.from('track_likes').select('*', { count: 'exact', head: true }),
        supabase.from('collaborations').select('*', { count: 'exact', head: true }),
        supabase.from('streams').select('*', { count: 'exact', head: true }).gte('created_at', cutoff),
        supabase.from('streams').select('*', { count: 'exact', head: true }).gte('created_at', prev).lt('created_at', cutoff),
        supabase.from('artists').select('*', { count: 'exact', head: true }).gte('created_at', cutoff),
        supabase.from('artists').select('*', { count: 'exact', head: true }).gte('created_at', prev).lt('created_at', cutoff),
        supabase.from('listeners').select('*', { count: 'exact', head: true }).gte('last_seen_at', cutoff),
      ]);

      // Total streams from tracks table
      let totalStreams = 0;
      try {
        const { data: ts } = await supabase.from('tracks').select('stream_count').eq('is_published', true);
        totalStreams = (ts || []).reduce((s, t) => s + (t.stream_count || 0), 0);
      } catch {}

      const streamDelta = prevStreamCount > 0
        ? Math.round(((streamCount - prevStreamCount) / prevStreamCount) * 100) : null;
      const artistDelta = prevNewArtists > 0
        ? Math.round(((newArtists - prevNewArtists) / prevNewArtists) * 100) : null;

      setKpis({
        artists: artistCount || 0,
        listeners: Math.max(0, (listenerCount || 0) - (artistCount || 0)),
        tracks: trackCount || 0,
        published: publishedCount || 0,
        follows: followCount || 0,
        likes: likeCount || 0,
        collabs: collabCount || 0,
        streamsInRange: streamCount || 0,
        totalStreams,
        newArtists: newArtists || 0,
        activeListeners: activeListeners || 0,
        streamDelta,
        artistDelta,
      });

      // ── Stream timeline ───────────────────────────────────────────────────
      const { data: streamRows } = await supabase
        .from('streams').select('created_at').gte('created_at', cutoff).order('created_at');
      const streamMap = dayRange(range);
      (streamRows || []).forEach(s => {
        const d = new Date(s.created_at);
        const key = range <= 7
          ? d.toLocaleDateString('en-US', { weekday: 'short' })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (streamMap[key] !== undefined) streamMap[key]++;
      });
      setStreamTimeline(Object.entries(streamMap).map(([date, streams]) => ({ date, streams })));

      // ── Signup timeline ───────────────────────────────────────────────────
      const { data: signupRows } = await supabase
        .from('artists').select('created_at').gte('created_at', cutoff);
      const signupMap = dayRange(range);
      (signupRows || []).forEach(a => {
        const key = range <= 7
          ? new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'short' })
          : new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (signupMap[key] !== undefined) signupMap[key]++;
      });
      setSignupTimeline(Object.entries(signupMap).map(([date, artists]) => ({ date, artists })));

      // ── Upload timeline ───────────────────────────────────────────────────
      const { data: uploadRows } = await supabase
        .from('tracks').select('created_at').gte('created_at', cutoff);
      const uploadMap = dayRange(range);
      (uploadRows || []).forEach(t => {
        const key = range <= 7
          ? new Date(t.created_at).toLocaleDateString('en-US', { weekday: 'short' })
          : new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (uploadMap[key] !== undefined) uploadMap[key]++;
      });
      setUploadTimeline(Object.entries(uploadMap).map(([date, uploads]) => ({ date, uploads })));

      // ── Device split ──────────────────────────────────────────────────────
      const { data: deviceRows } = await supabase
        .from('streams').select('device_type, source, completed, duration_played').gte('created_at', cutoff).limit(10000);
      const dc = { mobile: 0, desktop: 0, unknown: 0 };
      const sc = {}, completedCount = { yes: 0, no: 0 }, durAll = [];
      (deviceRows || []).forEach(s => {
        dc[s.device_type || 'unknown']++;
        sc[s.source || 'unknown'] = (sc[s.source || 'unknown'] || 0) + 1;
        if (s.completed) completedCount.yes++; else completedCount.no++;
        if (s.duration_played > 0) durAll.push(s.duration_played);
      });
      const totalStreamsForPct = (deviceRows || []).length || 1;
      setSourceSplit(Object.entries(sc).map(([name, count]) => ({
        name: name.replace(/_/g,' ').replace(/\w/g, c => c.toUpperCase()),
        value: count, pct: Math.round((count/totalStreamsForPct)*100),
      })).sort((a,b) => b.value - a.value));
      setCompletionStats({
        rate: Math.round((completedCount.yes / totalStreamsForPct) * 100),
        avgDuration: durAll.length ? Math.round(durAll.reduce((a,b)=>a+b,0)/durAll.length) : 0,
        total: totalStreamsForPct,
      });

      // Beat stats
      try {
        const [{ count: beatCount }, { data: beatPurchases }] = await Promise.all([
          supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('is_beat', true).eq('is_published', true),
          supabase.from('beat_purchases').select('amount_paid, licence_type, status').eq('status', 'completed').gte('created_at', cutoff),
        ]);
        const revenue = (beatPurchases || []).reduce((s, p) => s + (parseFloat(p.amount_paid) || 0), 0);
        const licenceCounts = {};
        (beatPurchases || []).forEach(p => { licenceCounts[p.licence_type] = (licenceCounts[p.licence_type] || 0) + 1; });
        setBeatStats({ count: beatCount || 0, purchases: (beatPurchases || []).length, revenue: revenue.toFixed(2), licenceCounts });
      } catch { setBeatStats({ count: 0, purchases: 0, revenue: '0.00', licenceCounts: {} }); }
      const total = dc.mobile + dc.desktop + dc.unknown;
      setDeviceSplit([
        { name: 'Mobile',  value: dc.mobile,  pct: pct(dc.mobile, total),  color: PURPLE },
        { name: 'Desktop', value: dc.desktop, pct: pct(dc.desktop, total), color: CYAN },
        { name: 'Unknown', value: dc.unknown, pct: pct(dc.unknown, total), color: '#4b5563' },
      ]);

      // ── Tier split ────────────────────────────────────────────────────────
      const { data: tierRows } = await supabase
        .from('artists').select('tier');
      const tc = { premium: 0, pro: 0, free: 0 };
      (tierRows || []).forEach(a => { tc[a.tier] = (tc[a.tier] || 0) + 1; });
      const tierTotal = tierRows?.length || 1;
      setTierSplit([
        { name: 'Premium', value: tc.premium || 0, pct: pct(tc.premium, tierTotal), color: YELLOW },
        { name: 'Pro',     value: tc.pro     || 0, pct: pct(tc.pro,     tierTotal), color: PURPLE },
        { name: 'Free',    value: tc.free    || 0, pct: pct(tc.free,    tierTotal), color: '#4b5563' },
      ]);

      // ── Top tracks ────────────────────────────────────────────────────────
      const { data: trackData } = await supabase
        .from('tracks')
        .select('title, stream_count, download_count, artists(artist_name)')
        .eq('is_published', true)
        .order('stream_count', { ascending: false })
        .limit(10);
      setTopTracks((trackData || []).map(t => ({
        title: t.title,
        artist: t.artists?.artist_name || '?',
        streams: t.stream_count || 0,
        downloads: t.download_count || 0,
      })));

      // ── Top artists ───────────────────────────────────────────────────────
      const { data: artistData } = await supabase
        .from('artists')
        .select('artist_name, slug, total_streams, follower_count, tier')
        .order('total_streams', { ascending: false })
        .limit(10);
      setTopArtists(artistData || []);

      // ── Top genres ────────────────────────────────────────────────────────
      const { data: genreData } = await supabase
        .from('tracks').select('genre, stream_count').eq('is_published', true).not('genre', 'is', null);
      const gc = {};
      (genreData || []).forEach(t => { gc[t.genre] = (gc[t.genre] || 0) + (t.stream_count || 0); });
      setTopGenres(Object.entries(gc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([genre, streams]) => ({ genre, streams })));

      // ── Retention / activity ──────────────────────────────────────────────
      const [
        { count: active7d },
        { count: active30d },
        { count: active90d },
      ] = await Promise.all([
        supabase.from('listeners').select('*', { count: 'exact', head: true }).gte('last_seen_at', new Date(Date.now() - 7  * 86400000).toISOString()),
        supabase.from('listeners').select('*', { count: 'exact', head: true }).gte('last_seen_at', new Date(Date.now() - 30 * 86400000).toISOString()),
        supabase.from('listeners').select('*', { count: 'exact', head: true }).gte('last_seen_at', new Date(Date.now() - 90 * 86400000).toISOString()),
      ]);

      const totalUsers = (listenerCount || 0);
      setRetentionStats({
        dau: active7d  || 0,
        mau: active30d || 0,
        qau: active90d || 0,
        dauMauRatio: active30d > 0 ? ((active7d / active30d) * 100).toFixed(1) : '0',
        activePct: totalUsers > 0 ? pct(active30d, totalUsers) : '0%',
      });

      // ── Recent stream activity ─────────────────────────────────────────────
      const { data: recentData } = await supabase
        .from('streams')
        .select('device_type, platform, duration_played, completed, created_at, tracks(title, artists(artist_name))')
        .order('created_at', { ascending: false })
        .limit(20);
      setRecentStreams((recentData || []).map(s => ({
        track: s.tracks?.title || 'Unknown',
        artist: s.tracks?.artists?.artist_name || '?',
        device: s.device_type || 'unknown',
        duration: s.duration_played || 0,
        completed: s.completed,
        time: new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })));

      // ── Revenue ────────────────────────────────────────────────────────────
      try {
        const [
          { data: tipRevenue },
          { data: dlRevenue },
          { data: beatRevenue },
          { count: artistProCount },
          { count: artistPremCount },
          { count: fanProCount },
        ] = await Promise.all([
          supabase.from('tips').select('amount').gte('created_at', cutoff),
          supabase.from('downloads').select('amount_paid').gt('amount_paid', 0).gte('created_at', cutoff),
          supabase.from('beat_purchases').select('amount_paid').eq('status', 'completed').gte('created_at', cutoff),
          supabase.from('artist_tier_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active')
            .in('tier_id', ['a421dac1-f492-461c-88a5-f01b6942a042']), // pro
          supabase.from('artist_tier_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active')
            .in('tier_id', ['f0b8b8f5-bfc2-496e-9fb4-8904d9dc6fe4']), // premium
          supabase.from('listener_tier_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        ]);
        const tipTotal  = (tipRevenue  || []).reduce((s, t) => s + (parseFloat(t.amount)      || 0), 0);
        const dlTotal   = (dlRevenue   || []).reduce((s, d) => s + (parseFloat(d.amount_paid) || 0), 0);
        const beatTotal = (beatRevenue || []).reduce((s, b) => s + (parseFloat(b.amount_paid) || 0), 0);
        setRevenueStats({
          tips:        tipTotal.toFixed(2),
          downloads:   dlTotal.toFixed(2),
          beats:       beatTotal.toFixed(2),
          total:       (tipTotal + dlTotal + beatTotal).toFixed(2),
          artistPro:   artistProCount  || 0,
          artistPrem:  artistPremCount || 0,
          fanPro:      fanProCount     || 0,
        });

        // ── Listener tier split ───────────────────────────────────────────
        const { data: lTierRows } = await supabase
          .from('listener_tier_subscriptions').select('tier_id').eq('status', 'active');
        const PRO_ID = 'a421dac1-f492-461c-88a5-f01b6942a042';
        const lProCount = (lTierRows || []).filter(r => r.tier_id === PRO_ID).length;
        const lFreeCount = Math.max(0, (listenerCount || 0) - lProCount);
        const lTotal = lFreeCount + lProCount || 1;
        setListenerTierSplit([
          { name: 'Fan Pro', value: lProCount,  pct: pct(lProCount,  lTotal), color: PURPLE },
          { name: 'Free',    value: lFreeCount, pct: pct(lFreeCount, lTotal), color: '#4b5563' },
        ]);
      } catch (err) { console.warn('Revenue fetch error:', err); }

      // ── Platform intelligence signals ──────────────────────────────────
      try {
        // Fastest-growing artists (most new followers in period)
        const { data: newFollows } = await supabase
          .from('follows').select('artist_id, artists(artist_name, slug)')
          .gte('created_at', cutoff).limit(5000);
        const followGrowth = {};
        const artistNameMap = {};
        (newFollows || []).forEach(f => {
          if (!f.artist_id) return;
          followGrowth[f.artist_id] = (followGrowth[f.artist_id] || 0) + 1;
          if (f.artists) artistNameMap[f.artist_id] = f.artists;
        });
        const growingArtists = Object.entries(followGrowth)
          .sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([id, count]) => ({ name: artistNameMap[id]?.artist_name || id, slug: artistNameMap[id]?.slug, newFollowers: count }));

        // Trending genres by recent streams
        const { data: recentGenreStreams } = await supabase
          .from('streams').select('tracks(genre)').gte('created_at', cutoff).limit(5000);
        const genreCounts = {};
        (recentGenreStreams || []).forEach(s => {
          const g = s.tracks?.genre;
          if (g) genreCounts[g] = (genreCounts[g] || 0) + 1;
        });
        setTrendingGenres(Object.entries(genreCounts)
          .sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([genre, streams]) => ({ genre, streams })));

        setPlatformSignals(growingArtists);
      } catch (err) { console.warn('Platform signals error:', err); }

    } catch (err) {
      console.error('Analytics error:', err);
    }

    setLoading(false);
    setRefreshing(false);
  }, [range]);

  const exportCSV = (data, headers, filename) => {
    const csv = [headers.join(','), ...data.map(row => headers.map(h => {
      const val = row[h] ?? '';
      return typeof val === 'string' && val.includes(',') ? '"' + val + '"' : val;
    }).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportAll = async () => {
    const { data } = await supabase.from('streams').select('track_id, user_id, duration_played, completed, device_type, platform, created_at').order('created_at', { ascending: false }).limit(10000);
    if (data) exportCSV(data, ['track_id','user_id','duration_played','completed','device_type','platform','created_at'], 'streams_full.csv');
  };

  const exportArtists = async () => {
    const { data } = await supabase.from('artists').select('artist_name, slug, tier, follower_count, total_streams, created_at').order('total_streams', { ascending: false });
    if (data) exportCSV(data, ['artist_name','slug','tier','follower_count','total_streams','created_at'], 'artists.csv');
  };

  const exportTracks = async () => {
    const { data } = await supabase.from('tracks').select('title, genre, mood, stream_count, download_count, is_published, created_at').order('stream_count', { ascending: false });
    if (data) exportCSV(data, ['title','genre','mood','stream_count','download_count','is_published','created_at'], 'tracks.csv');
  };

  useEffect(() => {
    if (isAdmin === false) { navigate('/hub'); return; }
    fetchAll();
  }, [isAdmin, navigate, fetchAll]);

  if (!isAdmin) return null;

  return (
    <div className="pt-14 md:pt-0 pb-32 min-h-screen bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 md:top-0 z-20 bg-black/95 backdrop-blur-xl border-b border-white/[0.05] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate('/hub')} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition">
            <ChevronLeft className="w-5 h-5 text-white/40" />
          </button>
          <BarChart3 className="w-5 h-5 text-purple-400" />
          <h1 className="text-base font-bold text-white">Analytics</h1>
        </div>
        <div className="flex items-center space-x-2">
          {/* Range selector */}
          <div className="flex items-center space-x-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setRange(d)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${range === d ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'}`}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={() => fetchAll(true)} disabled={refreshing}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 text-white/50 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-white/[0.04]">
        {[
          { key: 'overview',   label: 'Overview'  },
          { key: 'revenue',    label: 'Revenue'   },
          { key: 'content',    label: 'Content'   },
          { key: 'behaviour',  label: 'Behaviour' },
          { key: 'beats',      label: 'Beats'     },
          { key: 'listeners',  label: 'Listeners' },
          { key: 'health',     label: 'Health'    },
          { key: 'export',     label: 'Export'    },
        ].map(t => <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</TabButton>)}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
      ) : (
        <div className="px-4 pt-5 max-w-4xl mx-auto">

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-6">
                <KPI icon={Headphones} label={`Streams (${range}d)`}  value={kpis.streamsInRange} color="bg-purple-500/20" delta={kpis.streamDelta} />
                <KPI icon={Mic2}       label="Total Artists"          value={kpis.artists}        color="bg-pink-500/20"   delta={kpis.artistDelta} />
                <KPI icon={Users}      label="Listeners"              value={kpis.listeners}      color="bg-cyan-500/20"   />
                <KPI icon={Music}      label="Published Tracks"       value={kpis.published}      color="bg-green-500/20"  sub={`${kpis.tracks} total`} />
                <KPI icon={Heart}      label="Total Likes"            value={kpis.likes}          color="bg-red-500/20"    />
                <KPI icon={TrendingUp} label="Total Follows"          value={kpis.follows}        color="bg-orange-500/20" />
              </div>

              {/* Streams chart */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                <SectionTitle icon={Activity} title={`Stream Activity — ${range} days`} color="text-purple-400" />
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={streamTimeline}>
                    <defs>
                      <linearGradient id="streamGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={PURPLE} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={PURPLE} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="streams" name="Streams" stroke={PURPLE} strokeWidth={2} fill="url(#streamGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Signups + uploads combined */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                <SectionTitle icon={TrendingUp} title="Growth — Artists & Uploads" color="text-cyan-400" />
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={signupTimeline.map((s, i) => ({ ...s, uploads: uploadTimeline[i]?.uploads || 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} width={25} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="artists" name="New Artists" fill={CYAN}   radius={[4,4,0,0]} />
                    <Bar dataKey="uploads" name="Uploads"     fill={GREEN}  radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* ── CONTENT ──────────────────────────────────────────────────── */}
          {/* ── REVENUE ─────────────────────────────────────────────────── */}
          {tab === 'revenue' && (
            <>
              {/* Total revenue KPIs */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <KPI icon={DollarSign}  label="Total Revenue"    value={`$${revenueStats.total || '0.00'}`}     color="bg-green-500/20"  sub={`Last ${range} days`} />
                <KPI icon={Heart}       label="Tips"             value={`$${revenueStats.tips || '0.00'}`}      color="bg-pink-500/20"   />
                <KPI icon={Download}    label="Download Sales"   value={`$${revenueStats.downloads || '0.00'}`} color="bg-blue-500/20"   />
                <KPI icon={Music}       label="Beat Sales"       value={`$${revenueStats.beats || '0.00'}`}     color="bg-yellow-500/20" />
              </div>

              {/* Subscription breakdown */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                <SectionTitle icon={Crown} title="Active Subscriptions" color="text-yellow-400" />
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {[
                    { label: 'Artist Pro',     value: revenueStats.artistPro  || 0, color: 'text-purple-400', est: ((revenueStats.artistPro || 0) * 4.99).toFixed(0) },
                    { label: 'Artist Premium', value: revenueStats.artistPrem || 0, color: 'text-yellow-400', est: ((revenueStats.artistPrem || 0) * 9.99).toFixed(0) },
                    { label: 'Fan Pro',        value: revenueStats.fanPro     || 0, color: 'text-cyan-400',   est: ((revenueStats.fanPro || 0) * 2.99).toFixed(0) },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] text-center">
                      <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">{s.label}</p>
                      <p className="text-[10px] text-green-400/60 mt-0.5">~${s.est}/mo</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-white/20 mt-3 text-center">
                  Estimated MRR: ~${((revenueStats.artistPro || 0) * 4.99 + (revenueStats.artistPrem || 0) * 9.99 + (revenueStats.fanPro || 0) * 2.99).toFixed(2)}/mo
                </p>
              </div>

              {/* Listener tier split */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                <SectionTitle icon={Users} title="Listener Tier Split" color="text-cyan-400" />
                <div className="flex items-center space-x-6 mt-2">
                  <ResponsiveContainer width={120} height={120}>
                    <PieChart>
                      <Pie data={listenerTierSplit} cx="50%" cy="50%" innerRadius={32} outerRadius={55} dataKey="value" paddingAngle={3}>
                        {listenerTierSplit.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex-1">
                    {listenerTierSplit.map((d, i) => (
                      <div key={i} className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-xs text-white/60 flex-1">{d.name}</span>
                        <span className="text-xs font-bold text-white">{d.pct}</span>
                        <span className="text-[10px] text-white/30">({fmt(d.value)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Platform intelligence — fastest growing artists */}
              {platformSignals.length > 0 && (
                <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                  <SectionTitle icon={TrendingUp} title={`Fastest Growing Artists (${range}d)`} color="text-green-400" />
                  <div className="space-y-2 mt-2">
                    {platformSignals.map((a, i) => (
                      <div key={i} className="flex items-center space-x-3 py-1.5">
                        <span className="text-xs font-bold text-white/20 w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{a.name}</p>
                        </div>
                        <span className="text-xs font-bold text-green-400">+{a.newFollowers} followers</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending genres */}
              {trendingGenres.length > 0 && (
                <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                  <SectionTitle icon={Music} title={`Trending Genres (${range}d)`} color="text-purple-400" />
                  <div className="space-y-2 mt-2">
                    {trendingGenres.map((g, i) => {
                      const max = trendingGenres[0]?.streams || 1;
                      return (
                        <div key={g.genre}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-white/60">{g.genre}</span>
                            <span className="text-white/30">{fmt(g.streams)} streams</span>
                          </div>
                          <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.round((g.streams/max)*100)}%`, background: PURPLE }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'content' && (
            <>
              {/* Top Tracks */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                <SectionTitle icon={Flame} title="Top Tracks by Streams" color="text-orange-400" />
                <div className="space-y-2">
                  {topTracks.map((t, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <span className="text-xs text-white/20 w-4 flex-shrink-0 font-bold">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate font-medium">{t.title}</p>
                        <p className="text-[10px] text-white/30 truncate">{t.artist}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-white">{fmt(t.streams)}</p>
                        <p className="text-[10px] text-white/30">{fmt(t.downloads)} dl</p>
                      </div>
                      <div className="w-20 h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex-shrink-0">
                        <div className="h-full rounded-full" style={{ width: `${topTracks[0]?.streams ? (t.streams / topTracks[0].streams) * 100 : 0}%`, background: ORANGE }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Genres */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                <SectionTitle icon={Music} title="Top Genres by Streams" color="text-green-400" />
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topGenres} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="genre" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="streams" name="Streams" fill={GREEN} radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top Artists */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                <SectionTitle icon={Mic2} title="Top Artists by Streams" color="text-pink-400" />
                <div className="space-y-2">
                  {topArtists.map((a, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <span className="text-xs text-white/20 w-4 font-bold flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <p className="text-sm text-white truncate font-medium">{a.artist_name}</p>
                          {a.tier && a.tier !== 'free' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${TIER_COLORS[a.tier]}20`, color: TIER_COLORS[a.tier] }}>
                              {a.tier.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-white/30">{fmt(a.follower_count)} followers</p>
                      </div>
                      <p className="text-xs font-bold text-white flex-shrink-0">{fmt(a.total_streams)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── BEHAVIOUR ─────────────────────────────────────────────── */}
          {tab === 'behaviour' && (
            <div className="space-y-4">
              {/* Completion funnel */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                <SectionTitle icon={Activity} title="Stream Quality" color="text-green-400" />
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-2xl font-black text-green-400">{completionStats.rate || 0}%</p>
                    <p className="text-[10px] text-white/30 mt-0.5">Completion rate</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-2xl font-black text-blue-400">
                      {completionStats.avgDuration > 0 ? `${Math.floor(completionStats.avgDuration/60)}:${String(completionStats.avgDuration%60).padStart(2,'0')}` : '—'}
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">Avg listen time</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-2xl font-black text-white">{fmt(completionStats.total || 0)}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">Streams sampled</p>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/40">Completed streams</span>
                    <span className="text-green-400 font-bold">{completionStats.rate || 0}%</span>
                  </div>
                  <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-green-400 transition-all" style={{ width: `${completionStats.rate || 0}%` }} />
                  </div>
                </div>
              </div>

              {/* Where streams come from */}
              {sourceSplit.length > 0 && (
                <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                  <SectionTitle icon={TrendingUp} title="Where Listeners Discover Music" color="text-cyan-400" />
                  <div className="space-y-2">
                    {sourceSplit.map(s => (
                      <div key={s.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white/60">{s.name}</span>
                          <span className="text-white/40">{s.pct}% — {fmt(s.value)} streams</span>
                        </div>
                        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${s.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Device breakdown */}
              {deviceSplit.length > 0 && (
                <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                  <SectionTitle icon={Activity} title="Device Split" color="text-purple-400" />
                  <div className="space-y-2">
                    {deviceSplit.map(d => (
                      <div key={d.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white/60">{d.name}</span>
                          <span className="text-white/40">{d.pct || Math.round((d.value/(completionStats.total||1))*100)}%</span>
                        </div>
                        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-purple-400" style={{ width: `${d.pct || Math.round((d.value/(completionStats.total||1))*100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BEATS ────────────────────────────────────────────────────── */}
          {tab === 'beats' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <KPI icon={Music}       label="Published Beats"  value={beatStats.count || 0}     color="bg-yellow-500/20" />
                <KPI icon={TrendingUp}  label="Purchases"        value={beatStats.purchases || 0} color="bg-green-500/20"  sub={`$${beatStats.revenue || '0.00'} revenue`} />
              </div>
              {Object.keys(beatStats.licenceCounts || {}).length > 0 && (
                <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                  <SectionTitle icon={TrendingUp} title="Licence Type Breakdown" color="text-yellow-400" />
                  <div className="space-y-2">
                    {Object.entries(beatStats.licenceCounts).sort((a,b) => b[1]-a[1]).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                        <span className="text-sm text-white/60 capitalize">{type} Lease</span>
                        <span className="text-sm font-bold text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(beatStats.purchases || 0) === 0 && (
                <div className="text-center py-10 text-white/20">
                  <p className="text-sm">No beat purchases yet in this period</p>
                </div>
              )}
            </div>
          )}

          {/* ── LISTENERS ────────────────────────────────────────────────── */}
          {tab === 'listeners' && (
            <>
              {/* Retention KPIs */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <KPI icon={Activity} label="Active (7d)"   value={retentionStats.dau} color="bg-purple-500/20" sub="Unique sessions" />
                <KPI icon={Activity} label="Active (30d)"  value={retentionStats.mau} color="bg-cyan-500/20"   sub={`${retentionStats.activePct} of all users`} />
                <KPI icon={Zap}      label="DAU/MAU Ratio" value={retentionStats.dauMauRatio} color="bg-green-500/20" sub="Higher = more sticky" />
                <KPI icon={Users}    label="Active (90d)"  value={retentionStats.qau} color="bg-orange-500/20" />
              </div>

              {/* Device split */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                <SectionTitle icon={Smartphone} title="Device Split" color="text-purple-400" />
                <div className="flex items-center space-x-6">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={deviceSplit} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                        {deviceSplit.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex-1">
                    {deviceSplit.map((d, i) => (
                      <div key={i} className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-xs text-white/60 flex-1">{d.name}</span>
                        <span className="text-xs font-bold text-white">{d.pct}</span>
                        <span className="text-[10px] text-white/30">({fmt(d.value)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Listener tier split */}
              {listenerTierSplit.length > 0 && (
                <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                  <SectionTitle icon={Crown} title="Listener Tier (Fan Pro)" color="text-cyan-400" />
                  <div className="flex items-center space-x-6">
                    <ResponsiveContainer width={120} height={120}>
                      <PieChart>
                        <Pie data={listenerTierSplit} cx="50%" cy="50%" innerRadius={32} outerRadius={55} dataKey="value" paddingAngle={3}>
                          {listenerTierSplit.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 flex-1">
                      {listenerTierSplit.map((d, i) => (
                        <div key={i} className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                          <span className="text-xs text-white/60 flex-1">{d.name}</span>
                          <span className="text-xs font-bold text-white">{d.pct}</span>
                          <span className="text-[10px] text-white/30">({fmt(d.value)})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tier split */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                <SectionTitle icon={Crown} title="Artist Tier Breakdown" color="text-yellow-400" />
                <div className="flex items-center space-x-6">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={tierSplit} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                        {tierSplit.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 flex-1">
                    {tierSplit.map((d, i) => (
                      <div key={i} className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-xs text-white/60 flex-1">{d.name}</span>
                        <span className="text-xs font-bold text-white">{d.pct}</span>
                        <span className="text-[10px] text-white/30">({fmt(d.value)})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent stream activity */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                <SectionTitle icon={Radio} title="Recent Streams (Live)" color="text-green-400" />
                <div className="space-y-2">
                  {recentStreams.map((s, i) => (
                    <div key={i} className="flex items-center space-x-3 py-1">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.completed ? 'bg-green-400' : 'bg-white/20'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white truncate">{s.track} <span className="text-white/30">— {s.artist}</span></p>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {s.device === 'mobile' ? <Smartphone className="w-3 h-3 text-white/20" /> : <Monitor className="w-3 h-3 text-white/20" />}
                        <span className="text-[10px] text-white/30">{s.duration}s</span>
                        <span className="text-[10px] text-white/20">{s.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── HEALTH ───────────────────────────────────────────────────── */}
          {tab === 'health' && (
            <>
              <div className="grid grid-cols-2 gap-2 mb-6">
                <KPI icon={Globe}  label="Total Streams"    value={kpis.totalStreams}    color="bg-purple-500/20" />
                <KPI icon={Music}  label="Published Tracks" value={kpis.published}       color="bg-green-500/20"  />
                <KPI icon={Users}  label="Collabs"          value={kpis.collabs}         color="bg-cyan-500/20"   />
                <KPI icon={Star}   label="New Artists (period)" value={kpis.newArtists}  color="bg-pink-500/20"   />
              </div>

              {/* Platform health indicators */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] space-y-4">
                <SectionTitle icon={Activity} title="Platform Health Indicators" color="text-cyan-400" />

                {[
                  { label: 'Upload rate', value: kpis.published, max: kpis.tracks, desc: 'Published / total tracks', color: GREEN },
                  { label: 'Listener engagement', value: retentionStats.mau, max: kpis.listeners, desc: `Active 30d / total listeners`, color: CYAN },
                  { label: 'Collab activity', value: kpis.collabs, max: kpis.artists, desc: 'Collabs / total artists', color: PURPLE },
                  { label: 'Premium adoption', value: tierSplit.find(t => t.name === 'Premium')?.value || 0, max: kpis.artists, desc: 'Premium artists / total', color: YELLOW },
                ].map((row, i) => {
                  const pctVal = row.max > 0 ? Math.min((row.value / row.max) * 100, 100) : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-white/60">{row.label}</span>
                        <span className="text-xs font-bold text-white">{pctVal.toFixed(1)}%</span>
                      </div>
                      <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pctVal}%`, background: row.color }} />
                      </div>
                      <p className="text-[10px] text-white/25 mt-1">{row.desc} · {fmt(row.value)} / {fmt(row.max)}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── EXPORT ───────────────────────────────────────────────────── */}
          {tab === 'export' && (
            <div className="space-y-3">
              <p className="text-sm text-white/40 mb-4">Export raw data as CSV for external analysis.</p>
              {[
                { label: 'Artists',         sub: 'Name, tier, streams, followers, joined',         fn: exportArtists },
                { label: 'Tracks',          sub: 'Title, genre, mood, streams, downloads',          fn: exportTracks  },
                { label: 'Streams (10k)',   sub: 'Track, user, duration, device, platform, date',   fn: exportAll     },
              ].map((e, i) => (
                <button key={i} onClick={e.fn}
                  className="w-full flex items-center space-x-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition text-left">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <FileDown className="w-4 h-4 text-white/40" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{e.label} CSV</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{e.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}