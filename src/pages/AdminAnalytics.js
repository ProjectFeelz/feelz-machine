import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3, ChevronLeft, Loader, Music, Users, Mic2,
  TrendingUp, Heart, Download, Headphones, FileDown,
  Smartphone, Monitor, Zap, Crown, Star, Activity,
  Radio, Globe, RefreshCw, Eye, Flame, DollarSign, Mail, MapPin,
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

// dayRange() used to live here. It built an empty bucket map in the browser
// and the fetchers then counted raw rows into it. Two things were wrong with
// that and both showed up as "the numbers do not change when I toggle".
//
//   * The rows never all arrived. PostgREST caps a response at 1000 and the
//     stream read was ordered ASCENDING, so a busy 30 day window handed the
//     browser the OLDEST thousand events and the recent days came back empty.
//   * The bucketing differed by range. At 7 days the key was a weekday name,
//     so anything between 7 and 6 days ago landed on TODAY's name and inflated
//     today. At 30 days the key was "Sep 18", so the same rows produced a key
//     that was not in the map and were dropped. The two views were not the
//     same measurement over different windows.
//
// Counting now happens in the database (migration 137) and comes back one row
// per day, already bucketed. This only puts a label on it.
function dayLabel(isoDate, days) {
  // 'YYYY-MM-DD' parsed as UTC midnight shifts a day backwards west of
  // Greenwich, so build it as local midnight instead.
  const d = new Date(`${isoDate}T00:00:00`);
  return days <= 7
    ? d.toLocaleDateString('en-US', { weekday: 'short' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
// A labelled breakdown with a share bar. Percentages are of the rows shown,
// not of all plays: groups under the suppression floor are absent, so a
// total taken from these rows is the only honest denominator.
function DemoList({ title, icon: Icon, rows, sub }) {
  const list = rows || [];
  const total = list.reduce((s, r) => s + (r.plays || r.listeners || 0), 0);
  return (
    <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
      <SectionTitle icon={Icon} title={title} color="text-purple-400" />
      {sub && <p className="text-[10px] text-white/25 -mt-1 mb-2">{sub}</p>}
      {list.length === 0 ? (
        <p className="text-sm text-white/20 py-4 text-center">No data yet.</p>
      ) : (
        <div className="space-y-2.5">
          {list.slice(0, 10).map((r, i) => {
            const v = r.plays || r.listeners || 0;
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            return (
              <div key={i}>
                <div className="flex items-baseline justify-between mb-1">
                  <p className="text-sm text-white truncate">
                    {r.name || 'Unknown'}
                    {r.country && <span className="text-white/30 text-xs ml-1.5">{r.country}</span>}
                  </p>
                  <p className="text-xs text-white/40 flex-shrink-0 ml-3">{v} · {pct}%</p>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-purple-500/70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminAnalytics({ embedded = false }) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting]   = useState(null);
  const [exportError, setExportError] = useState('');
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
  const [pluginGalleryPlays, setPluginGalleryPlays] = useState([]);
  const [topArtists, setTopArtists] = useState([]);
  const [topGenres, setTopGenres] = useState([]);
  const [retentionStats, setRetentionStats] = useState({});
  const [recentStreams, setRecentStreams] = useState([]);
  const [sourceSplit, setSourceSplit]     = useState([]);
  const [completionStats, setCompletionStats] = useState({});
  const [beatStats, setBeatStats]         = useState({});
  const [demo, setDemo]                   = useState(null);
  const [revenueStats, setRevenueStats]   = useState({});
  const [listenerTierSplit, setListenerTierSplit] = useState([]);
  const [platformSignals, setPlatformSignals]     = useState([]);
  const [trendingGenres, setTrendingGenres]       = useState([]);
  const [contactStats, setContactStats]           = useState({});
  // Admin functions the page called that the database does not have yet.
  const [missingFns, setMissingFns]               = useState([]);
  const [topContactedArtists, setTopContactedArtists] = useState([]);

  // Last click wins, not last response.
  //
  // fetchAll is ~30 awaited round trips. Toggling 30d then 7d starts a second
  // run while the first is still going, and both write every piece of state
  // unconditionally — so the slower 30 day run can land after the 7 day run
  // and repaint the page with 30 day numbers while the 7d button sits
  // highlighted. That is indistinguishable, from the outside, from "analytics
  // are not updating". A generation counter fixes it: a run that is no longer
  // the newest writes nothing.
  const runIdRef = useRef(0);

  const fetchAll = useCallback(async (isRefresh = false) => {
    const runId   = ++runIdRef.current;
    const current = () => runId === runIdRef.current;

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
        supabase.from('listeners').select('*', { count: 'exact', head: true }),
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

      // Total streams.
      //
      // This was tracks.select('stream_count') summed in the browser, which the
      // 1000 row cap turned into "the sum of the first thousand published
      // tracks" — a figure that quietly stops moving once the catalogue passes
      // a thousand and never says so. Summed in the database now.
      let totalStreams = 0;
      let totalsErr = null;
      try {
        const { data: totals, error } = await supabase.rpc('admin_platform_totals');
        if (error) {
          totalsErr = error;
          console.error('[analytics] admin_platform_totals:', error.message);
        }
        totalStreams = Number(totals?.catalogue_stream_count || 0);
      } catch (err) {
        totalsErr = err;
        console.error('[analytics] admin_platform_totals failed:', err?.message || err);
      }

      if (!current()) return;   // a newer range was picked while these were in flight

      const streamDelta = prevStreamCount > 0
        ? Math.round(((streamCount - prevStreamCount) / prevStreamCount) * 100) : null;
      const artistDelta = (prevNewArtists > 0 && newArtists > 0)
        ? Math.round(((newArtists - prevNewArtists) / prevNewArtists) * 100) : null;

      setKpis({
        artists: artistCount || 0,
        listeners: listenerCount || 0,
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

      // ── Timelines, counted server side ────────────────────────────────────
      // One row per day each, so there is nothing left to truncate and the 7
      // day and 30 day views are the same measurement over different windows.
      const [
        { data: streamDays,  error: streamDaysErr },
        { data: signupDays,  error: signupDaysErr },
        { data: uploadDays,  error: uploadDaysErr },
      ] = await Promise.all([
        supabase.rpc('admin_stream_timeline', { p_days: range }),
        supabase.rpc('admin_signup_timeline', { p_days: range }),
        supabase.rpc('admin_upload_timeline', { p_days: range }),
      ]);

      if (!current()) return;
      if (streamDaysErr) console.error('[analytics] admin_stream_timeline:', streamDaysErr.message);
      if (signupDaysErr) console.error('[analytics] admin_signup_timeline:', signupDaysErr.message);
      if (uploadDaysErr) console.error('[analytics] admin_upload_timeline:', uploadDaysErr.message);

      setStreamTimeline((streamDays || []).map(r => ({
        date: dayLabel(r.day, range), streams: Number(r.streams) || 0,
      })));
      setSignupTimeline((signupDays || []).map(r => ({
        date: dayLabel(r.day, range), artists: Number(r.artists) || 0,
      })));
      setUploadTimeline((uploadDays || []).map(r => ({
        date: dayLabel(r.day, range), uploads: Number(r.uploads) || 0,
      })));

      // ── Behaviour: device, source, completion ─────────────────────────────
      //
      // Two separate faults lived in this block and both made it lie.
      //
      //   1. RLS. `streams` had no admin policy — only "Streams are viewable by
      //      owner" and "Artists can read streams of their tracks" — so an
      //      admin reading it with their own JWT got the streams of their OWN
      //      tracks. Completion rate, average listen time, sample size and both
      //      splits were one artist's numbers under a platform heading.
      //      Migration 137 adds "Admins can read all streams".
      //
      //   2. The 1000 row cap, again. .limit(10000) does not raise it; the
      //      server clamps it and says nothing.
      //
      // Both are gone: the aggregate is computed in the database over the whole
      // window, by a function that checks the caller is an admin.
      //
      // `placeholders` stays, and still matters. Until migration 107 log_stream
      // wrote every row with duration_played = 30 and completed = true, and
      // finalise_stream never ran on a skip. Those rows are still here and they
      // are what pins the average at exactly 0:30 — so the tab reports how many
      // of its sample are placeholders rather than averaging them in silently.
      const { data: behavior, error: behaviorErr } = await supabase
        .rpc('admin_behavior_summary', { p_days: range });
      if (!current()) return;
      if (behaviorErr) console.error('[analytics] admin_behavior_summary:', behaviorErr.message);

      // A missing function reads as a zero on every card, which looks like
      // "nobody listened" rather than "the database is missing a migration".
      // Name them on the page instead.
      const isMissing = (err) => !!err && (err.code === 'PGRST202'
        || /could not find the function/i.test(err.message || ''));
      setMissingFns([
        ['admin_platform_totals',  totalsErr],
        ['admin_stream_timeline',  streamDaysErr],
        ['admin_signup_timeline',  signupDaysErr],
        ['admin_upload_timeline',  uploadDaysErr],
        ['admin_behavior_summary', behaviorErr],
      ].filter(([, err]) => isMissing(err)).map(([name]) => name));

      const sample = Number(behavior?.sample || 0);
      const pctOf  = (n) => (sample ? Math.round((Number(n) / sample) * 100) : 0);

      // 'venue' is a real third value, not a stray: retail plays record it.
      // Anything outside the known set lands in Unknown rather than creating a
      // key the total never reads.
      const dc = { mobile: 0, desktop: 0, venue: 0, unknown: 0 };
      Object.entries(behavior?.devices || {}).forEach(([k, v]) => {
        const bucket = Object.prototype.hasOwnProperty.call(dc, k) ? k : 'unknown';
        dc[bucket] += Number(v) || 0;
      });

      setSourceSplit(Object.entries(behavior?.sources || {}).map(([name, count]) => ({
        name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        value: Number(count) || 0,
        pct: pctOf(count),
      })).sort((a, b) => b.value - a.value));

      setCompletionStats({
        rate: pctOf(behavior?.completed),
        avgDuration: Math.round(Number(behavior?.avg_seconds || 0)),
        total: sample,
        placeholders: Number(behavior?.placeholders || 0),
        scope: behaviorErr ? 'error' : 'platform',
      });

      // Sitewide listener demographics. Location and completion come from
      // listening_events, which no client query can read across accounts,
      // so this goes through an admin-gated SECURITY DEFINER function.
      supabase.rpc('get_platform_listener_stats', { p_days: range })
        .then(({ data }) => setDemo(data));

      // Beat stats.
      //
      // This tab used to measure purchases only, so with no sales it showed
      // two numbers and an empty state. Beats have plenty of other signal
      // already recorded: plays, downloads, BPM, key, and how many people
      // make them. That is what a beatmaker platform actually wants to see.
      try {
        const [{ count: beatCount }, { data: beatPurchases }, { data: beats }] = await Promise.all([
          supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('is_beat', true).eq('is_published', true),
          supabase.from('beat_purchases').select('amount_paid, licence_type, status').eq('status', 'completed').gte('created_at', cutoff),
          supabase.from('tracks')
            .select('id, title, bpm, beat_key, stream_count, download_count, artist_id, artists(artist_name)')
            .eq('is_beat', true).eq('is_published', true)
            .order('stream_count', { ascending: false }).limit(500),
        ]);
        const revenue = (beatPurchases || []).reduce((s, p) => s + (parseFloat(p.amount_paid) || 0), 0);
        const licenceCounts = {};
        (beatPurchases || []).forEach(p => { licenceCounts[p.licence_type] = (licenceCounts[p.licence_type] || 0) + 1; });

        const rows = beats || [];
        const bpms = rows.map(b => b.bpm).filter(Boolean);
        const keyCounts = {};
        rows.forEach(b => { if (b.beat_key) keyCounts[b.beat_key] = (keyCounts[b.beat_key] || 0) + 1; });

        setBeatStats({
          count: beatCount || 0,
          purchases: (beatPurchases || []).length,
          revenue: revenue.toFixed(2),
          licenceCounts,
          plays:      rows.reduce((s, b) => s + (b.stream_count || 0), 0),
          downloads:  rows.reduce((s, b) => s + (b.download_count || 0), 0),
          beatmakers: new Set(rows.map(b => b.artist_id).filter(Boolean)).size,
          avgBpm:     bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null,
          topBeats:   rows.slice(0, 8),
          keyCounts,
        });
      } catch { setBeatStats({ count: 0, purchases: 0, revenue: '0.00', licenceCounts: {} }); }
      // Summed from the bucket object rather than by naming three keys, so
      // adding a bucket above cannot silently drop it out of the denominator.
      const total = Object.values(dc).reduce((a, b) => a + b, 0);
      setDeviceSplit([
        { name: 'Mobile',  value: dc.mobile,  pct: pct(dc.mobile, total),  color: PURPLE },
        { name: 'Desktop', value: dc.desktop, pct: pct(dc.desktop, total), color: CYAN },
        { name: 'Venue',   value: dc.venue,   pct: pct(dc.venue, total),   color: GREEN  },
        { name: 'Unknown', value: dc.unknown, pct: pct(dc.unknown, total), color: '#4b5563' },
      ].filter(d => d.value > 0 || d.name === 'Mobile' || d.name === 'Desktop'));

      if (!current()) return;

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

      // ── Plugin Gallery plays — external advertising traffic, kept separate
      //    from real logged-in-fan streams above ──────────────────────────
      const { data: externalPlayData } = await supabase
        .from('tracks')
        .select('title, external_play_count, artists(artist_name)')
        .eq('is_published', true)
        .gt('external_play_count', 0)
        .order('external_play_count', { ascending: false })
        .limit(10);
      setPluginGalleryPlays((externalPlayData || []).map(t => ({
        title: t.title,
        artist: t.artists?.artist_name || '?',
        plays: t.external_play_count || 0,
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
      //
      // Three things were wrong here and all three pointed the same way: the
      // tab under-reported and then filled the gap with a made-up number.
      //
      // 1. RLS. tips, downloads, beat_purchases and listener_tier_subscriptions
      //    have no admin SELECT policy. Their policies are owner-scoped —
      //    "artists see tips they received", "auth.uid() = user_id" — and this
      //    page queries with the admin's own authenticated JWT, not the service
      //    role. So these four read one artist's data, not the platform's, and
      //    a blocked read returns rows: [] with an error, which the old code
      //    discarded by destructuring only `data`. $0.00 was therefore
      //    indistinguishable from "you are not allowed to see this".
      //    Errors are read now and surfaced as `scope`, so the UI can say which
      //    it is. The real fix is an admin-gated SECURITY DEFINER function, the
      //    same shape as get_platform_listener_stats above.
      //
      // 2. Hardcoded tier UUIDs. Pro and Premium were matched on two literal
      //    ids, and the SAME id used for artist Pro was also used below as the
      //    listener Fan Pro id — a tier cannot be both, so at least one of
      //    those two counts was matching nothing. Matched on platform_tiers.slug
      //    now, which is what the unique constraint is on.
      //
      // 3. Invented MRR. The estimate multiplied each count by a hardcoded
      //    4.99 / 9.99 / 2.99 and counted every active row as paying. A tier
      //    an admin grants by hand is an active row with amount_paid 0, so
      //    comps were being billed into MRR. MRR is now summed from what the
      //    subscriptions actually record, normalised to a month, with
      //    admin_grant rows counted and reported separately as comps.
      try {
        const { data: tierRefRows, error: tierRefErr } = await supabase
          .from('platform_tiers').select('id, slug, price_monthly, price_yearly');
        if (tierRefErr) console.error('[analytics] platform_tiers failed:', tierRefErr.code, tierRefErr.message);
        const tierBySlug = {};
        (tierRefRows || []).forEach(t => { if (t.slug) tierBySlug[t.slug] = t; });

        const [
          { data: tipRevenue,  error: tipErr },
          { data: dlRevenue,   error: dlErr },
          { data: beatRevenue, error: beatErr },
          { data: artistSubs,  error: artistSubErr },
          { data: listenerSubs, error: listenerSubErr },
        ] = await Promise.all([
          supabase.from('tips').select('amount, currency').gte('created_at', cutoff),
          supabase.from('downloads').select('amount_paid').gt('amount_paid', 0).gte('created_at', cutoff),
          supabase.from('beat_purchases').select('amount_paid').eq('status', 'completed').gte('created_at', cutoff),
          // Rows, not counts: the tier, what was actually paid, how often, and
          // whether it was a grant are all needed to state MRR honestly.
          supabase.from('artist_tier_subscriptions')
            .select('tier_id, amount_paid, currency, billing_cycle, payment_provider')
            .eq('status', 'active'),
          supabase.from('listener_tier_subscriptions')
            .select('tier_id, billing_cycle').eq('status', 'active'),
        ]);

        [['tips', tipErr], ['downloads', dlErr], ['beat_purchases', beatErr],
         ['artist_tier_subscriptions', artistSubErr],
         ['listener_tier_subscriptions', listenerSubErr],
         ['platform_tiers', tierRefErr]]
          .filter(([, e]) => e)
          .forEach(([name, e]) => console.error(`[analytics] revenue: ${name} blocked or failed:`, e.code, e.message));

        // Any of these failing means the figures below are not the platform's.
        const blocked = [tipErr, dlErr, beatErr, listenerSubErr].some(Boolean);

        const tipTotal  = (tipRevenue  || []).reduce((s, t) => s + (parseFloat(t.amount)      || 0), 0);
        const dlTotal   = (dlRevenue   || []).reduce((s, d) => s + (parseFloat(d.amount_paid) || 0), 0);
        const beatTotal = (beatRevenue || []).reduce((s, b) => s + (parseFloat(b.amount_paid) || 0), 0);

        // Tips carry a currency column and are summed here regardless of it.
        // Flagged rather than converted: a made-up FX rate would be the same
        // mistake as the made-up MRR this replaces.
        const tipCurrencies = [...new Set((tipRevenue || []).map(t => t.currency).filter(Boolean))];

        const proId  = tierBySlug.pro?.id;
        const premId = tierBySlug.premium?.id;
        const subs   = artistSubs || [];
        const countFor = id => (id ? subs.filter(s => s.tier_id === id).length : 0);

        // What a subscription contributes per month. Prefer what was actually
        // paid; fall back to the tier's list price only when amount_paid is 0
        // on a row that is not a grant (older rows predate the column).
        // The live tier table has price_yearly set (pro 20, premium 50) and
        // price_monthly at 0.00 for BOTH paid tiers. So a monthly-billed row
        // has no monthly price to read, and returning price_monthly verbatim
        // would score it as free. Where monthly is unset but yearly is not,
        // monthly is derived from yearly — stated here rather than silently,
        // because a derived twelfth is an approximation and the fix is to set
        // price_monthly in platform_tiers.
        const monthlyOf = (s) => {
          if (s.payment_provider === 'admin_grant') return 0;
          const tier = (tierRefRows || []).find(t => t.id === s.tier_id);
          const annual = s.billing_cycle === 'annual';
          const paid = parseFloat(s.amount_paid) || 0;
          if (paid > 0) return annual ? paid / 12 : paid;
          if (!tier) return 0;
          const yearly  = parseFloat(tier.price_yearly)  || 0;
          const monthly = parseFloat(tier.price_monthly) || 0;
          if (annual) return yearly / 12;
          return monthly > 0 ? monthly : yearly / 12;
        };

        // Tier table problems worth naming on the page, because each one makes
        // a number below quietly wrong rather than visibly broken.
        const tierWarnings = [];
        ['pro', 'premium'].forEach(slug => {
          const t = tierBySlug[slug];
          if (!t) { tierWarnings.push(`No platform_tiers row with slug "${slug}".`); return; }
          if (!(parseFloat(t.price_monthly) > 0) && parseFloat(t.price_yearly) > 0) {
            tierWarnings.push(`${slug}: price_monthly is unset, so monthly subscriptions are valued at price_yearly ÷ 12.`);
          }
        });
        if (!tierBySlug.fan_pro && !tierBySlug['fan-pro']) {
          tierWarnings.push('No platform_tiers row with slug "fan_pro" — every active listener subscription is being counted as Fan Pro.');
        }

        const mrr   = subs.reduce((s, r) => s + monthlyOf(r), 0);
        const comps = subs.filter(s => s.payment_provider === 'admin_grant').length;

        setRevenueStats({
          tips:        tipTotal.toFixed(2),
          downloads:   dlTotal.toFixed(2),
          beats:       beatTotal.toFixed(2),
          total:       (tipTotal + dlTotal + beatTotal).toFixed(2),
          artistPro:   countFor(proId),
          artistPrem:  countFor(premId),
          fanPro:      (listenerSubs || []).length,
          mrr:         mrr.toFixed(2),
          comps,
          tierIdsResolved: !!(proId && premId),
          tierWarnings,
          tipCurrencies,
          scope: blocked ? 'own' : 'platform',
        });

        // ── Listener tier split ───────────────────────────────────────────
        // Matched on the Fan Pro tier's real id. This used to compare against
        // the artist Pro uuid, which no listener subscription can hold, so
        // Fan Pro was pinned at 0 and Free at 100% by construction.
        const fanProId = tierBySlug.fan_pro?.id || tierBySlug['fan-pro']?.id;
        const lProCount = fanProId
          ? (listenerSubs || []).filter(r => r.tier_id === fanProId).length
          : (listenerSubs || []).length;
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

      // ── Contacts / email pipeline (collected automatically, no UI yet) ──
      try {
        const [
          { count: subscribedCount },
          { count: totalSubsCount },
          { count: globalContactsCount },
          { data: artistContactRows },
        ] = await Promise.all([
          supabase.from('email_subscribers').select('id', { count: 'exact', head: true }).eq('subscribed', true),
          supabase.from('email_subscribers').select('id', { count: 'exact', head: true }),
          supabase.from('global_contacts').select('id', { count: 'exact', head: true }),
          supabase.from('artist_contacts').select('artist_id').limit(5000),
        ]);

        const contactCounts = {};
        (artistContactRows || []).forEach(r => {
          contactCounts[r.artist_id] = (contactCounts[r.artist_id] || 0) + 1;
        });
        const artistIds = Object.keys(contactCounts);
        let topContacted = [];
        if (artistIds.length) {
          const { data: names } = await supabase.from('artists').select('id, artist_name, slug').in('id', artistIds);
          const nameMap = {};
          (names || []).forEach(a => { nameMap[a.id] = a; });
          topContacted = Object.entries(contactCounts)
            .sort((a, b) => b[1] - a[1]).slice(0, 10)
            .map(([id, count]) => ({ name: nameMap[id]?.artist_name || id, slug: nameMap[id]?.slug, contacts: count }));
        }

        setContactStats({
          subscribed: subscribedCount || 0,
          totalSubscribers: totalSubsCount || 0,
          globalContacts: globalContactsCount || 0,
          totalArtistContacts: (artistContactRows || []).length,
        });
        setTopContactedArtists(topContacted);
      } catch (err) { console.warn('Contacts fetch error:', err); }

    } catch (err) {
      console.error('Analytics error:', err);
    }

    // A superseded run must not clear the spinner either, or the newer run
    // renders as finished while it is still fetching.
    if (!current()) return;
    setLoading(false);
    setRefreshing(false);
  }, [range]);

  // Quote anything containing a comma, quote or newline, and double up inner
  // quotes. The previous version only handled commas, so a track title with
  // an apostrophe-free quote or a bio with a line break produced a corrupt
  // file that looked fine until you opened it in a spreadsheet.
  const csvCell = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const exportCSV = (data, headers, filename) => {
    const csv = [headers.join(','), ...data.map(row => headers.map(h => csvCell(row[h])).join(','))].join('\n');
    // BOM so Excel opens UTF-8 correctly. Artist names carry accents.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  // Shared runner so every export reports failure instead of silently doing
  // nothing, which is what `if (data)` did when a query errored.
  const runExport = async (label, query, headers, filename) => {
    setExporting(label);
    const { data, error } = await query;
    setExporting(null);
    if (error) { setExportError(`${label} failed: ${error.message}`); return; }
    if (!data || data.length === 0) { setExportError(`${label}: nothing to export`); return; }
    setExportError('');
    exportCSV(data, headers, filename);
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

  const exportListeners = () => runExport('Listeners',
    supabase.from('listeners').select('display_name, tier, engagement_segment, last_seen_at, created_at').order('created_at', { ascending: false }),
    ['display_name','tier','engagement_segment','last_seen_at','created_at'], 'listeners.csv');

  const exportFollows = () => runExport('Follows',
    supabase.from('follows').select('follower_id, artist_id, created_at').order('created_at', { ascending: false }).limit(10000),
    ['follower_id','artist_id','created_at'], 'follows.csv');

  const exportContacts = () => runExport('Contacts',
    supabase.from('global_contacts').select('user_id, email, name, total_follows, total_streams, opted_in, last_active').order('last_active', { ascending: false }),
    ['user_id','email','name','total_follows','total_streams','opted_in','last_active'], 'contacts.csv');

  const exportSubscribers = () => runExport('Subscribers',
    supabase.from('email_subscribers').select('email, name, source, subscribed, subscribed_at, unsubscribed_at').order('subscribed_at', { ascending: false }),
    ['email','name','source','subscribed','subscribed_at','unsubscribed_at'], 'email_subscribers.csv');

  // Real completion and location, which streams cannot give you: that table
  // stores a constant ~30s duration and completed = true on every row.
  const exportListeningEvents = () => runExport('Listening events',
    supabase.from('listening_events').select('track_id, artist_id, genre, mood, bpm, listened_seconds, track_seconds, completion_pct, end_reason, event_source, country, city, created_at').order('created_at', { ascending: false }).limit(10000),
    ['track_id','artist_id','genre','mood','bpm','listened_seconds','track_seconds','completion_pct','end_reason','event_source','country','city','created_at'], 'listening_events.csv');

  const exportDownloads = () => runExport('Downloads',
    supabase.from('downloads').select('track_id, user_id, download_type, amount_paid, created_at').order('created_at', { ascending: false }).limit(10000),
    ['track_id','user_id','download_type','amount_paid','created_at'], 'downloads.csv');

  const exportRetailPlays = () => runExport('Retail plays',
    supabase.from('retail_play_logs').select('venue_id, location_id, track_id, playlist_id, duration_played, played_at').order('played_at', { ascending: false }).limit(10000),
    ['venue_id','location_id','track_id','playlist_id','duration_played','played_at'], 'retail_play_logs.csv');

  const exportVenues = () => runExport('Venues',
    supabase.from('retail_venues').select('business_name, contact_name, contact_email, status, ads_enabled, last_seen_at, created_at').order('created_at', { ascending: false }),
    ['business_name','contact_name','contact_email','status','ads_enabled','last_seen_at','created_at'], 'retail_venues.csv');

  // One file, every dataset, as separate labelled blocks. A single CSV cannot
  // hold different shapes, so each section gets its own header row with a
  // blank line between. Spreadsheets handle that fine and it beats
  // downloading nine files and matching them up by hand.
  const exportEverything = async () => {
    setExporting('Everything');
    setExportError('');
    const sets = [
      ['ARTISTS',   supabase.from('artists').select('artist_name, slug, tier, follower_count, total_streams, created_at')],
      ['TRACKS',    supabase.from('tracks').select('title, genre, mood, stream_count, download_count, is_published, created_at')],
      ['LISTENERS', supabase.from('listeners').select('display_name, tier, engagement_segment, last_seen_at, created_at')],
      ['CONTACTS',  supabase.from('global_contacts').select('user_id, email, name, total_follows, total_streams, opted_in, last_active')],
      ['SUBSCRIBERS', supabase.from('email_subscribers').select('email, name, source, subscribed, subscribed_at')],
      ['STREAMS',   supabase.from('streams').select('track_id, user_id, duration_played, completed, device_type, platform, source, created_at').order('created_at', { ascending: false }).limit(10000)],
      ['LISTENING_EVENTS', supabase.from('listening_events').select('track_id, artist_id, genre, mood, completion_pct, listened_seconds, country, city, created_at').order('created_at', { ascending: false }).limit(10000)],
      ['DOWNLOADS', supabase.from('downloads').select('track_id, user_id, download_type, amount_paid, created_at').limit(10000)],
      ['RETAIL_PLAYS', supabase.from('retail_play_logs').select('venue_id, track_id, playlist_id, duration_played, played_at').limit(10000)],
    ];

    const blocks = [];
    const failed = [];
    for (const [name, q] of sets) {
      const { data, error } = await q;
      if (error) { failed.push(name); continue; }
      if (!data || data.length === 0) { blocks.push(`## ${name}\n(no rows)`); continue; }
      const headers = Object.keys(data[0]);
      blocks.push(`## ${name}\n` + [headers.join(','), ...data.map(r => headers.map(h => csvCell(r[h])).join(','))].join('\n'));
    }
    setExporting(null);

    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob(['\uFEFF' + blocks.join('\n\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `feelz-machine-export-${stamp}.csv`; a.click();
    URL.revokeObjectURL(url);

    // Say which parts failed rather than handing over a file with silent holes.
    if (failed.length) setExportError(`Exported, but these sections failed: ${failed.join(', ')}`);
  };

  useEffect(() => {
    if (isAdmin === false) { navigate('/hub'); return; }
    fetchAll();
  }, [isAdmin, navigate, fetchAll]);

  if (!isAdmin) return null;

  return (
    <div className="pt-0 pb-32 px-4">
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
          { key: 'contacts',   label: 'Contacts'  },
          { key: 'export',     label: 'Export'    },
        ].map(t => <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</TabButton>)}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
      ) : (
        <div className="px-4 pt-5">

          {missingFns.length > 0 && (
            <div className="mb-4 rounded-2xl p-4 border border-red-500/25 bg-red-500/[0.07]">
              <p className="text-xs font-bold text-red-300 mb-1">
                Some figures read 0 because the database is missing {missingFns.length === 1 ? 'a function' : `${missingFns.length} functions`}.
              </p>
              <p className="text-[11px] text-red-200/60 leading-relaxed">
                Run supabase/migrations/137_admin_analytics_reads.sql in the SQL editor.
                Missing: <code>{missingFns.join(', ')}</code>
              </p>
            </div>
          )}

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
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
              {/* A number that is $0.00 because there were no sales and a number
                  that is $0.00 because the query was refused look identical, and
                  this page showed the second as if it were the first. Said out
                  loud now, because "no revenue" is a business decision and "I
                  cannot see the revenue" is a bug. */}
              {revenueStats.scope === 'own' && (
                <div className="rounded-2xl p-4 mb-4 border border-amber-500/25 bg-amber-500/[0.07]">
                  <p className="text-xs font-bold text-amber-300 mb-1">These are not platform figures.</p>
                  <p className="text-[11px] text-amber-200/60 leading-relaxed">
                    tips, downloads, beat_purchases and listener_tier_subscriptions have no
                    admin read policy, so this page — which queries as your own signed-in
                    user, not the service role — can only see rows you own. Everything below
                    is your own activity. The console names each refused table.
                  </p>
                </div>
              )}
              {revenueStats.tierWarnings?.length > 0 && (
                <div className="rounded-2xl p-4 mb-4 border border-red-500/25 bg-red-500/[0.07]">
                  <p className="text-xs font-bold text-red-300 mb-1">
                    Tier table needs attention — MRR below is affected.
                  </p>
                  <ul className="text-[11px] text-red-200/60 leading-relaxed space-y-1 mt-1.5">
                    {revenueStats.tierWarnings.map((w, i) => <li key={i}>· {w}</li>)}
                  </ul>
                </div>
              )}

              {/* Total revenue KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <KPI icon={DollarSign}  label="Total Revenue"    value={`$${revenueStats.total || '0.00'}`}     color="bg-green-500/20"  sub={`Last ${range} days`} />
                <KPI icon={Heart}       label="Tips"             value={`$${revenueStats.tips || '0.00'}`}      color="bg-pink-500/20"   sub={revenueStats.tipCurrencies?.length > 1 ? `mixed: ${revenueStats.tipCurrencies.join(', ')}` : undefined} />
                <KPI icon={Download}    label="Download Sales"   value={`$${revenueStats.downloads || '0.00'}`} color="bg-blue-500/20"   />
                <KPI icon={Music}       label="Beat Sales"       value={`$${revenueStats.beats || '0.00'}`}     color="bg-yellow-500/20" />
              </div>

              {/* Subscription breakdown */}
              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                <SectionTitle icon={Crown} title="Active Subscriptions" color="text-yellow-400" />
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
                  {[
                    { label: 'Artist Pro',     value: revenueStats.artistPro  || 0, color: 'text-purple-400' },
                    { label: 'Artist Premium', value: revenueStats.artistPrem || 0, color: 'text-yellow-400' },
                    { label: 'Fan Pro',        value: revenueStats.fanPro     || 0, color: 'text-cyan-400'   },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] text-center">
                      <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                {/* Summed from what the subscription rows actually record, not
                    from a hardcoded price list, and grants are excluded rather
                    than billed. The per-tier "~$X/mo" captions are gone: they
                    multiplied a count by a literal, so they asserted revenue
                    from tiers nobody has paid for. */}
                <p className="text-[10px] text-white/25 mt-3 text-center">
                  MRR from recorded subscription payments: <span className="text-green-400/70 font-semibold">${revenueStats.mrr || '0.00'}/mo</span>
                  {revenueStats.comps > 0 && (
                    <span className="text-white/20"> · {revenueStats.comps} admin-granted {revenueStats.comps === 1 ? 'comp' : 'comps'} excluded</span>
                  )}
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

              {/* Plugin Gallery plays — cross-property advertising traffic, separate from real streams */}
              {pluginGalleryPlays.length > 0 && (
                <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
                  <SectionTitle icon={Globe} title="Plugin Gallery Plays" color="text-cyan-400" />
                  <p className="text-[10px] text-white/25 -mt-2 mb-3">
                    Plays from projectfeelz.com previews — not counted in stream_count above
                  </p>
                  <div className="space-y-2">
                    {pluginGalleryPlays.map((t, i) => (
                      <div key={i} className="flex items-center space-x-3">
                        <span className="text-xs text-white/20 w-4 flex-shrink-0 font-bold">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate font-medium">{t.title}</p>
                          <p className="text-[10px] text-white/30 truncate">{t.artist}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-white">{fmt(t.plays)}</p>
                          <p className="text-[10px] text-white/30">plays</p>
                        </div>
                        <div className="w-20 h-1.5 rounded-full bg-white/[0.06] overflow-hidden flex-shrink-0">
                          <div className="h-full rounded-full" style={{ width: `${pluginGalleryPlays[0]?.plays ? (t.plays / pluginGalleryPlays[0].plays) * 100 : 0}%`, background: CYAN }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
              {/* The old "Scope: your own tracks" notice is gone: migration 137
                  gives admins a read on streams and computes this tab in the
                  database, so the figures are platform-wide. If 137 has not run,
                  the missing-functions notice at the top of the page says so. */}

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
                    {/* d.pct is a STRING that already ends in '%' — pct() appends
                        it. So the old `{d.pct}%` printed "10.7%%", and the style
                        below built width:"10.7%%", which is not a valid CSS
                        length: the browser discarded the declaration and every
                        bar rendered at zero width. Same value, used correctly in
                        both places now, via one variable so they cannot drift. */}
                    {deviceSplit.map(d => {
                      const share = d.pct || `${Math.round((d.value / (completionStats.total || 1)) * 100)}%`;
                      return (
                        <div key={d.name}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-white/60">{d.name}</span>
                            <span className="text-white/40">{share} · {fmt(d.value)}</span>
                          </div>
                          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-purple-400" style={{ width: share }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BEATS ────────────────────────────────────────────────────── */}
          {tab === 'beats' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                <KPI icon={Music}       label="Published Beats"  value={beatStats.count || 0}      color="bg-yellow-500/20" />
                <KPI icon={TrendingUp}  label="Beat Plays"       value={fmt(beatStats.plays || 0)} color="bg-cyan-500/20" />
                <KPI icon={FileDown}    label="Beat Downloads"   value={fmt(beatStats.downloads || 0)} color="bg-blue-500/20" />
                <KPI icon={Users}       label="Beatmakers"       value={beatStats.beatmakers || 0} color="bg-purple-500/20" sub="with a published beat" />
                <KPI icon={TrendingUp}  label="Average BPM"      value={beatStats.avgBpm || '--'}  color="bg-pink-500/20" />
                <KPI icon={TrendingUp}  label="Purchases"        value={beatStats.purchases || 0}  color="bg-green-500/20"  sub={`$${beatStats.revenue || '0.00'} revenue`} />
              </div>

              {(beatStats.topBeats || []).length > 0 && (
                <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                  <SectionTitle icon={Music} title="Most played beats" color="text-yellow-400" />
                  <div className="space-y-2">
                    {beatStats.topBeats.map((b, i) => (
                      <div key={b.id} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                        <span className="text-xs text-white/25 font-mono w-5">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white truncate">{b.title}</p>
                          <p className="text-xs text-white/35 truncate">
                            {b.artists?.artist_name}
                            {b.bpm ? ` · ${b.bpm} BPM` : ''}
                            {b.beat_key ? ` · ${b.beat_key}` : ''}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-white flex-shrink-0">{fmt(b.stream_count || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(beatStats.keyCounts || {}).length > 0 && (
                <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                  <SectionTitle icon={Music} title="Keys beatmakers work in" color="text-yellow-400" />
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(beatStats.keyCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => (
                      <span key={k} className="text-xs px-2.5 py-1 rounded-full bg-white/[0.06] text-white/60">
                        {k} <span className="text-white/30">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
                <p className="text-xs text-white/25 text-center py-4">
                  No beat sales in this period. The figures above cover all published beats,
                  not just this window.
                </p>
              )}
            </div>
          )}

          {/* ── LISTENERS ────────────────────────────────────────────────── */}
          {tab === 'listeners' && (
            <>
              {/* Retention KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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

              {/* Sitewide demographics. Location and completion only exist
                  from when listening_events was deployed and are capped at
                  90 days retention, while the play counts above cover full
                  history. Said plainly rather than blended into one number. */}
              {demo && (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    <KPI icon={Users}      label="Listeners"        value={fmt(demo.plays?.unique_listeners || 0)} color="bg-purple-500/20" sub={`last ${demo.window_days} days`} />
                    <KPI icon={Activity}   label="Plays"            value={fmt(demo.plays?.total || 0)}            color="bg-cyan-500/20" />
                    <KPI icon={TrendingUp} label="Avg completion"   value={demo.completion ? `${demo.completion.avg_pct}%` : '--'} color="bg-green-500/20" />
                    <KPI icon={TrendingUp} label="Played to end"    value={demo.completion ? `${demo.completion.finished_pct}%` : '--'} color="bg-orange-500/20" />
                  </div>

                  {!demo.completion && (
                    <p className="text-xs text-white/30 mt-3">
                      Completion and location need a few plays recorded since listening
                      events started tracking. Play counts above cover full history.
                    </p>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                    <DemoList title="Countries" icon={MapPin} rows={demo.by_country} />
                    <DemoList title="Cities" icon={MapPin} rows={demo.by_city} sub="Small groups hidden to protect listeners" />
                    <DemoList title="Genres played" icon={Music} rows={demo.by_genre} />
                    <DemoList title="Moods played" icon={Music} rows={demo.by_mood} />
                    <DemoList title="Platform" icon={Monitor} rows={demo.by_platform} />
                    <DemoList title="Where plays came from" icon={Radio} rows={demo.by_source} sub="Includes Retail, venues playing in their space" />
                  </div>
                </>
              )}
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

          {/* ── CONTACTS ─────────────────────────────────────────────────── */}
          {tab === 'contacts' && (
            <>
              <p className="text-xs text-white/30 mb-4">
                Collected automatically from follows and profile creation.
                These four count different things and are not meant to match:
                Global is unique people across the whole platform, Artist is one
                row per person per artist, and Subscribers is the mailing list.
                A person who unfollows stays a contact until they opt out in
                Contact Preferences, which is deliberate.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-6">
                <KPI icon={Mail}  label="Email Subscribers" value={contactStats.subscribed} sub={`of ${fmt(contactStats.totalSubscribers)} total`} color="bg-cyan-500/20" />
                <KPI icon={Users} label="Global Contacts"   value={contactStats.globalContacts} sub="unique people, platform-wide" color="bg-purple-500/20" />
                <KPI icon={Star}  label="Artist Contacts"   value={contactStats.totalArtistContacts} sub="one row per person per artist" color="bg-pink-500/20" />
                <KPI icon={Mail}  label="Unsubscribed"      value={contactStats.totalSubscribers - contactStats.subscribed} sub="opted out, they stay listed" color="bg-white/[0.06]" />
              </div>

              <div className="rounded-2xl p-4 bg-white/[0.02] border border-white/[0.05]">
                <SectionTitle icon={Mic2} title="Most-Contacted Artists" color="text-pink-400" />
                {topContactedArtists.length === 0 ? (
                  <p className="text-xs text-white/25 py-4 text-center">No contact data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topContactedArtists.map((a, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-white/70">{a.name}</span>
                        <span className="text-sm font-bold text-white">{fmt(a.contacts)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── EXPORT ───────────────────────────────────────────────────── */}
          {tab === 'export' && (
            <div className="space-y-3">
              <p className="text-sm text-white/40 mb-4">Export raw data as CSV for external analysis.</p>

              {exportError && (
                <p className="text-xs text-amber-300 mb-3">{exportError}</p>
              )}

              <button onClick={exportEverything} disabled={!!exporting}
                className="w-full flex items-center space-x-4 p-4 rounded-2xl border border-purple-400/25 bg-purple-500/[0.08] hover:bg-purple-500/[0.14] transition text-left mb-4 disabled:opacity-50">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <FileDown className="w-4 h-4 text-purple-300" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">
                    {exporting === 'Everything' ? 'Building export...' : 'Everything CSV'}
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    All datasets in one file, as labelled sections
                  </p>
                </div>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {[
                { label: 'Artists',          sub: 'Name, tier, streams, followers, joined',          fn: exportArtists },
                { label: 'Tracks',           sub: 'Title, genre, mood, streams, downloads',          fn: exportTracks  },
                { label: 'Streams (10k)',    sub: 'Track, user, duration, device, platform, date',   fn: exportAll     },
                { label: 'Listening events (10k)', sub: 'Real completion and location, not in streams', fn: exportListeningEvents },
                { label: 'Listeners',        sub: 'Name, tier, segment, last seen',                  fn: exportListeners },
                { label: 'Follows (10k)',    sub: 'Follower, artist, date',                          fn: exportFollows },
                { label: 'Contacts',         sub: 'Platform-wide people, follows, opt-in',           fn: exportContacts },
                { label: 'Subscribers',      sub: 'Email, source, subscribed state',                 fn: exportSubscribers },
                { label: 'Downloads (10k)',  sub: 'Track, user, type, amount, date',                 fn: exportDownloads },
                { label: 'Retail plays (10k)', sub: 'Venue, track, playlist, duration, played at',   fn: exportRetailPlays },
                { label: 'Venues',           sub: 'Business, contact, status, ads, last seen',       fn: exportVenues },
              ].map((e, i) => (
                <button key={i} onClick={e.fn} disabled={!!exporting}
                  className="w-full flex items-center space-x-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition text-left disabled:opacity-50">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <FileDown className="w-4 h-4 text-white/40" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {exporting === e.label ? 'Exporting...' : `${e.label} CSV`}
                    </p>
                    <p className="text-[10px] text-white/30 mt-0.5">{e.sub}</p>
                  </div>
                </button>
              ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}