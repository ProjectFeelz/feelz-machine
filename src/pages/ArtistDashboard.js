import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3, Download, Music, Loader, DollarSign,
  Upload, ChevronLeft, ChevronRight, Headphones, Heart, TrendingUp,
  Users, Trophy, Zap, MessageCircle, ArrowUp, ArrowDown, Minus
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



// ─── ExportButton ─────────────────────────────────────────────────────────────
function ExportButton({ artist, trackId, exportType, days = 30, label, small = false }) {
  const [state, setState] = React.useState('idle'); // idle | loading | done | error
  const [info,  setInfo]  = React.useState(null);   // { count, truncated, total }

  const run = async (e) => {
    e.stopPropagation();
    if (state === 'loading') return;
    setState('loading'); setInfo(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/export-streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id:   artist.id,
          user_id:     session?.user?.id,
          track_id:    trackId || undefined,
          days,
          export_type: exportType,
        }),
      });
      const data = await res.json();
      if (data.error) { setState('error'); return; }
      if (!data.csv || data.count === 0) { setState('done'); setInfo({ count: 0 }); return; }

      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = data.filename || `${exportType}_export.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setState('done');
      setInfo({ count: data.count, truncated: data.truncated, total: data.total });
    } catch (err) {
      console.error('Export error:', err);
      setState('error');
    }
    setTimeout(() => setState('idle'), 3000);
  };

  const pad = small ? 'px-3 py-1.5' : 'px-4 py-2.5';
  const txt = small ? 'text-xs' : 'text-sm';

  return (
    <div className="flex flex-col items-end space-y-1">
      <button
        onClick={run}
        disabled={state === 'loading'}
        className={`flex items-center space-x-2 ${pad} bg-white/[0.04] rounded-xl ${txt} text-white/60 hover:bg-white/[0.08] transition border border-white/[0.06] disabled:opacity-40 active:scale-95`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>
          {state === 'loading' ? 'Exporting…'
            : state === 'error' ? 'Error — retry'
            : state === 'done' && info?.count === 0 ? 'No data'
            : label}
        </span>
      </button>
      {info?.count > 0 && (
        <p className="text-[10px] text-white/25">
          {info.count.toLocaleString()} rows{info.total ? ` · $${info.total}` : ''}{info.truncated ? ' (truncated at 10k)' : ''}
        </p>
      )}
    </div>
  );
}

// ─── GrowthSnapshot ───────────────────────────────────────────────────────────
function GrowthSnapshot({ artist }) {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    if (!artist?.id) return;
    const load = async () => {
      const now     = new Date();
      const week1from = new Date(now - 7  * 86400000).toISOString();
      const week2from = new Date(now - 14 * 86400000).toISOString();

      const { data: tracks } = await supabase.from('tracks').select('id').eq('artist_id', artist.id);
      const ids = (tracks || []).map(t => t.id);
      if (!ids.length) return;

      const [
        { count: streamsThis },
        { count: streamsLast },
        { count: followsThis },
        { count: followsLast },
        { count: likesThis },
        { count: likesLast },
      ] = await Promise.all([
        supabase.from('streams').select('*',{count:'exact',head:true}).in('track_id',ids).gte('created_at',week1from),
        supabase.from('streams').select('*',{count:'exact',head:true}).in('track_id',ids).gte('created_at',week2from).lt('created_at',week1from),
        supabase.from('follows').select('*',{count:'exact',head:true}).eq('artist_id',artist.id).gte('created_at',week1from),
        supabase.from('follows').select('*',{count:'exact',head:true}).eq('artist_id',artist.id).gte('created_at',week2from).lt('created_at',week1from),
        supabase.from('track_likes').select('*',{count:'exact',head:true}).in('track_id',ids).gte('created_at',week1from),
        supabase.from('track_likes').select('*',{count:'exact',head:true}).in('track_id',ids).gte('created_at',week2from).lt('created_at',week1from),
      ]);

      setData({
        streams: { this: streamsThis||0, last: streamsLast||0 },
        follows: { this: followsThis||0, last: followsLast||0 },
        likes:   { this: likesThis||0,   last: likesLast||0   },
      });
    };
    load();
  }, [artist?.id]);

  if (!data) return null;

  const Metric = ({ label, curr, prev }) => {
    const diff = curr - prev;
    const pct  = prev > 0 ? Math.round((diff / prev) * 100) : (curr > 0 ? 100 : 0);
    const up   = diff > 0;
    const flat = diff === 0;
    return (
      <div className="flex-1 text-center">
        <p className="text-lg font-black text-white">{curr.toLocaleString()}</p>
        <p className="text-[10px] text-white/30 mb-1">{label}</p>
        <div className={`inline-flex items-center space-x-0.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${
          flat ? 'text-white/25 bg-white/[0.04]'
               : up ? 'text-green-400 bg-green-500/10'
                    : 'text-red-400 bg-red-500/10'
        }`}>
          {flat ? <Minus className="w-2.5 h-2.5" /> : up ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
          <span>{flat ? '—' : `${Math.abs(pct)}%`}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.05]">
      <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3">This week vs last week</p>
      <div className="flex divide-x divide-white/[0.04]">
        <Metric label="Streams"   curr={data.streams.this} prev={data.streams.last} />
        <Metric label="New Fans"  curr={data.follows.this} prev={data.follows.last} />
        <Metric label="Likes"     curr={data.likes.this}   prev={data.likes.last}   />
      </div>
    </div>
  );
}

// ─── Earnings Section ─────────────────────────────────────────────────────────
function EarningsSection({ artist, sectionRef, downloadsRef, highlight }) {
  const [tips,      setTips]      = React.useState([]);
  const [downloads, setDownloads] = React.useState([]);
  const [loading,   setLoading]   = React.useState(true);

  React.useEffect(() => {
    if (!artist?.id) return;
    const load = async () => {
      const [{ data: tipsData }, { data: dlData }] = await Promise.all([
        supabase.from('tips')
          .select('id, amount, currency, message, created_at, from_user_id')
          .eq('artist_id', artist.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('downloads')
          .select('id, amount_paid, created_at, track_id, tracks(title)')
          .eq('tracks.artist_id', artist.id)
          .gt('amount_paid', 0)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      setTips(tipsData || []);
      setDownloads(dlData || []);
      setLoading(false);
    };
    load();
  }, [artist?.id]);

  const tipTotal     = tips.reduce((s, t) => s + (t.amount || 0), 0);
  const downloadTotal = downloads.reduce((s, d) => s + (d.amount_paid || 0), 0);

  return (
    <div
      ref={sectionRef}
      className={`bg-white/[0.03] rounded-xl p-5 border space-y-4 ${
        highlight === 'earnings' || highlight === 'tips' || highlight === 'download'
          ? 'border-green-500/40 ring-1 ring-green-500/20'
          : 'border-white/[0.06]'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-2">
          <DollarSign className="w-5 h-5 text-green-400/70" />
          <h3 className="text-base font-semibold text-white">Earnings</h3>
        </div>
        <ExportButton artist={artist} exportType="earnings" days={30} label="Export" small />
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader className="w-4 h-4 animate-spin text-white/20" /></div>
      ) : (
        <>
          {/* Totals row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.03] rounded-xl p-3.5 border border-white/[0.05] text-center">
              <p className="text-xl font-black text-green-400">${tipTotal.toFixed(2)}</p>
              <p className="text-[11px] text-white/30 mt-0.5">Tips received</p>
            </div>
            <div
              ref={downloadsRef}
              className={`bg-white/[0.03] rounded-xl p-3.5 border text-center ${
                highlight === 'downloads' || highlight === 'download'
                  ? 'border-blue-500/40 ring-1 ring-blue-500/20'
                  : 'border-white/[0.05]'
              }`}
            >
              <p className="text-xl font-black text-blue-400">${downloadTotal.toFixed(2)}</p>
              <p className="text-[11px] text-white/30 mt-0.5">Paid downloads</p>
            </div>
          </div>

          {/* Recent tips */}
          {tips.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-2">Recent Tips</p>
              <div className="space-y-2">
                {tips.map(tip => (
                  <div key={tip.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <div className="flex-1 min-w-0">
                      {tip.message
                        ? <p className="text-sm text-white/70 truncate">"{tip.message}"</p>
                        : <p className="text-sm text-white/30 italic">No message</p>}
                      <p className="text-[11px] text-white/25 mt-0.5">
                        {new Date(tip.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-green-400 ml-3 flex-shrink-0">
                      +${Number(tip.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent paid downloads */}
          {downloads.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-2">Recent Paid Downloads</p>
              <div className="space-y-2">
                {downloads.map(dl => (
                  <div key={dl.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <p className="text-sm text-white/60 truncate flex-1">{dl.tracks?.title || 'Track'}</p>
                    <span className="text-sm font-bold text-blue-400 ml-3 flex-shrink-0">
                      +${Number(dl.amount_paid).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tips.length === 0 && downloads.length === 0 && (
            <p className="text-center text-white/20 text-sm py-4">No earnings yet — share your music to start earning</p>
          )}
        </>
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
  const [highlightSection, setHighlightSection] = useState(
    new URLSearchParams(window.location.search).get('section') || null
  );

  // Section refs for deep-link scroll targeting
  const sectionRefs = {
    stats:     useRef(null),
    downloads: useRef(null),
    followers: useRef(null),
    tracks:    useRef(null),
    earnings:  useRef(null),
  };

  // Scroll to and highlight section when arriving from a notification
  useEffect(() => {
    if (!highlightSection || activeTab !== 'analytics') return;
    const ref = sectionRefs[highlightSection];
    if (!ref?.current) return;
    const timer = setTimeout(() => {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300); // wait for tab render
    const clearTimer = setTimeout(() => setHighlightSection(null), 3000); // stop highlight after 3s
    return () => { clearTimeout(timer); clearTimeout(clearTimer); };
  }, [highlightSection, activeTab]); // eslint-disable-line
  const [wheelChallenge, setWheelChallenge] = useState(null);
  const [stats, setStats] = useState({
    streams: 0, downloads: 0, followers: 0, tracks: 0, likes: 0,
    comments: 0, presaves: 0, collabs: 0, beatSales: 0, totalTipsUSD: 0, posts: 0,
  });
  const [topTracks, setTopTracks] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [trackRange, setTrackRange]       = useState(30);
  const [trackStreams, setTrackStreams]    = useState([]);
  const [trackLikes, setTrackLikes]       = useState([]);
  const [trackAnalyticsLoading, setTrackAnalyticsLoading] = useState(false);
  const [demographics, setDemographics]   = useState({ totalStreams: 0, uniqueListeners: 0, repeatRate: 0, completionRate: 0, avgDuration: 0, devices: [], sources: [] });
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

      // Run all counts in parallel for speed
      const [
        { count: followCount },
        { count: likeCount },
        { count: commentCount },
        { count: presaveCount },
        { count: collabCount },
        { count: beatPurchaseCount },
        { data: tipData },
        { data: postData },
      ] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('artist_id', artist.id),
        trackIds.length ? supabase.from('track_likes').select('*', { count: 'exact', head: true }).in('track_id', trackIds) : Promise.resolve({ count: 0 }),
        trackIds.length ? supabase.from('track_comments').select('*', { count: 'exact', head: true }).in('track_id', trackIds) : Promise.resolve({ count: 0 }),
        trackIds.length ? supabase.from('track_presaves').select('*', { count: 'exact', head: true }).in('track_id', trackIds) : Promise.resolve({ count: 0 }),
        supabase.from('collaborations').select('*', { count: 'exact', head: true }).eq('artist_id', artist.id).eq('status', 'accepted'),
        trackIds.length ? supabase.from('beat_purchases').select('*', { count: 'exact', head: true }).in('track_id', trackIds).eq('status', 'completed') : Promise.resolve({ count: 0 }),
        supabase.from('tips').select('amount').eq('artist_id', artist.id),
        supabase.from('artist_posts').select('id', { count: 'exact', head: true }).eq('artist_id', artist.id),
      ]);

      const totalTips = (tipData || []).reduce((s, t) => s + (t.amount || 0), 0);

      setStats({
        streams:      streamCount,
        downloads:    dlCount,
        followers:    followCount  || 0,
        tracks:       trackIds.length,
        likes:        likeCount    || 0,
        comments:     commentCount || 0,
        presaves:     presaveCount || 0,
        collabs:      collabCount  || 0,
        beatSales:    beatPurchaseCount || 0,
        totalTipsUSD: totalTips,
        posts:        postData     || 0,
      });

      const { data: tracks } = await supabase
        .from('tracks')
        .select('id, title, cover_artwork_url, stream_count, download_count')
        .eq('artist_id', artist.id)
        .order('stream_count', { ascending: false })
        .limit(20);

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

  // Fetch track analytics when selection or range changes
  useEffect(() => {
    if (selectedTrack) fetchTrackAnalytics(selectedTrack, trackRange);
  }, [selectedTrack, trackRange]); // eslint-disable-line

  useEffect(() => {
    if (!artist) return;
    supabase.from('wheel_challenges')
      .select('id, prompt, mode, competition_id, competitions(id, status, entries_close_at, voting_close_at, max_votes_per_user)')
      .eq('is_current', true).maybeSingle()
      .then(({ data }) => setWheelChallenge(data || null));
  }, [artist?.id]); // eslint-disable-line

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

      // Full analytics
      const { data: demoData } = await supabase
        .from('streams').select('user_id, device_type, completed, duration_played, source')
        .eq('track_id', trackId).gte('created_at', since).limit(5000);
      if (demoData?.length) {
        const total = demoData.length;
        const unique = new Set(demoData.map(s => s.user_id).filter(Boolean)).size;
        const repeatRate = total > 0 ? Math.round(((total - unique) / total) * 100) : 0;
        const completionRate = total > 0 ? Math.round((demoData.filter(s => s.completed).length / total) * 100) : 0;
        const durations = demoData.map(s => s.duration_played || 0).filter(d => d > 0);
        const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a,b) => a+b,0) / durations.length) : 0;
        const dc = {}, sc = {};
        demoData.forEach(s => {
          const d = s.device_type || 'unknown'; dc[d] = (dc[d]||0)+1;
          const src = s.source || 'unknown'; sc[src] = (sc[src]||0)+1;
        });
        const devices = Object.entries(dc).map(([name,count]) => ({ name: name.charAt(0).toUpperCase()+name.slice(1), count, pct: Math.round((count/total)*100) })).sort((a,b)=>b.count-a.count);
        const sources = Object.entries(sc).map(([name,count]) => ({ name: name.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()), count, pct: Math.round((count/total)*100) })).sort((a,b)=>b.count-a.count);
        setDemographics({ totalStreams: total, uniqueListeners: unique, repeatRate, completionRate, avgDuration, devices, sources });
      } else {
        setDemographics({ totalStreams: 0, uniqueListeners: 0, repeatRate: 0, completionRate: 0, avgDuration: 0, devices: [], sources: [] });
      }
    } catch {}
    setTrackAnalyticsLoading(false);
  };

  const statCards = [
    { icon: Headphones,   label: 'Total Streams',  value: stats.streams,    color: 'text-purple-400',  section: 'streams'   },
    { icon: Users,        label: 'Followers',      value: stats.followers,  color: 'text-pink-400',    section: 'followers' },
    { icon: Heart,        label: 'Likes',          value: stats.likes,      color: 'text-red-400',     section: null        },
    { icon: Download,     label: 'Downloads',      value: stats.downloads,  color: 'text-blue-400',    section: 'downloads' },
    { icon: MessageCircle,label: 'Comments',       value: stats.comments,   color: 'text-indigo-400',  section: null        },
    { icon: Music,        label: 'Tracks',         value: stats.tracks,     color: 'text-green-400',   section: 'tracks'    },
    { icon: Zap,          label: 'Presaves',       value: stats.presaves,   color: 'text-yellow-400',  section: null        },
    { icon: Users,        label: 'Collabs',        value: stats.collabs,    color: 'text-cyan-400',    section: 'collabs'   },
    ...(isBeatmaker ? [{ icon: DollarSign, label: 'Beat Sales', value: stats.beatSales, color: 'text-green-400', section: 'earnings' }] : []),
    { icon: DollarSign,   label: 'Tips Received',  value: `$${(stats.totalTipsUSD||0).toFixed(2)}`, color: 'text-green-400', isText: true, section: 'earnings' },
  ];

  const tabs = [
    { key: 'upload',     label: 'Upload',     icon: Upload },
    { key: 'collabs',    label: 'Collabs',    icon: Users, hasBadge: true },
    { key: 'analytics',  label: isBeatmaker ? 'Beat Analytics' : 'Analytics',  icon: BarChart3 },
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
          {tabs.map(({ key, label, icon: Icon, hasBadge }) => (
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
            <div className="space-y-6">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader className="w-6 h-6 animate-spin text-white/30" />
                </div>
              ) : (
                <>
                  {/* Stat cards */}
                  <div
                    ref={sectionRefs.stats}
                    className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${highlightSection === 'stats' ? 'transition-all duration-700 rounded-xl ring-2 ring-purple-500/40 ring-offset-2 ring-offset-black' : ''}`}
                  >
                    {statCards.map(({ icon: Icon, label, value, color, section, isText }) => (
                      <div
                        key={label}
                        onClick={() => section && setHighlightSection(section)}
                        className={`bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] ${section ? 'cursor-pointer hover:bg-white/[0.05] hover:border-white/[0.1] transition-all active:scale-[0.98]' : ''}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className={`w-5 h-5 ${color}`} />
                          {section && <ChevronRight className="w-3.5 h-3.5 text-white/15" />}
                        </div>
                        <p className="text-2xl font-black text-white leading-none mb-1">
                          {isText ? value : (typeof value === 'number' ? value.toLocaleString() : value)}
                        </p>
                        <p className="text-xs text-white/35">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Growth snapshot — streams this week vs last week */}
                  <GrowthSnapshot artist={artist} />

                  {/* Contact Export — Premium only */}
                  <TierGate feature="advanced_analytics" inline>
                    <div
                      ref={sectionRefs.followers}
                      className={`bg-white/[0.03] rounded-xl p-4 border ${
                        highlightSection === 'followers'
                          ? 'border-purple-500/40 ring-1 ring-purple-500/20'
                          : 'border-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">Follower Contacts</p>
                          <p className="text-xs text-white/30 mt-0.5">Name, email, follow date, genre, stream count of your music</p>
                        </div>
                        <ExportButton artist={artist} exportType="followers" label="Export CSV" />
                      </div>
                    </div>
                  </TierGate>

                  {/* Per-track analytics */}
                  <div
                    ref={sectionRefs.tracks}
                    className={`bg-white/[0.03] rounded-xl p-5 border space-y-4 overflow-hidden ${
                      highlightSection === 'tracks' || highlightSection === 'streams'
                        ? 'border-purple-500/40 ring-1 ring-purple-500/20'
                        : 'border-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-5 h-5 text-white/40" />
                        <h3 className="text-base font-semibold text-white">Track Analytics</h3>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex space-x-1 bg-white/[0.04] rounded-lg p-0.5">
                          {[7, 14, 30].map(d => (
                            <button key={d} onClick={() => setTrackRange(d)}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition ${trackRange === d ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'}`}>
                              {d}d
                            </button>
                          ))}
                        </div>
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

                    {selectedTrack ? (
                      trackAnalyticsLoading ? (
                        <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
                      ) : (
                        <div className="space-y-4">
                          {/* Streams chart */}
                          <div className="overflow-hidden">
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
                          <div className="overflow-hidden">
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

                          {/* Rich listener analytics */}
                          {demographics.totalStreams > 0 && (
                            <div className="space-y-3">
                              {/* Top stats row */}
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {[
                                  { label: 'Streams', value: demographics.totalStreams, color: 'text-white' },
                                  { label: 'Unique Listeners', value: demographics.uniqueListeners, color: 'text-purple-400' },
                                  { label: 'Completion Rate', value: `${demographics.completionRate}%`, color: 'text-green-400' },
                                  { label: 'Avg Listen', value: demographics.avgDuration > 0 ? `${Math.floor(demographics.avgDuration/60)}:${String(demographics.avgDuration%60).padStart(2,'0')}` : '—', color: 'text-blue-400' },
                                ].map(s => (
                                  <div key={s.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] text-center">
                                    <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
                                    <p className="text-[10px] text-white/30 mt-0.5">{s.label}</p>
                                  </div>
                                ))}
                              </div>

                              {/* Repeat rate bar */}
                              <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                                <div className="flex justify-between text-xs mb-1.5">
                                  <span className="text-white/40">Repeat listener rate</span>
                                  <span className="text-pink-400 font-bold">{demographics.repeatRate}%</span>
                                </div>
                                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-pink-400 transition-all" style={{ width: `${demographics.repeatRate}%` }} />
                                </div>
                              </div>

                              {/* Device breakdown */}
                              {demographics.devices?.length > 0 && (
                                <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                                  <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-2">Devices</p>
                                  <div className="space-y-2">
                                    {demographics.devices.map(d => (
                                      <div key={d.name}>
                                        <div className="flex justify-between text-xs mb-1">
                                          <span className="text-white/60">{d.name}</span>
                                          <span className="text-white/40">{d.pct}%</span>
                                        </div>
                                        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                          <div className="h-full rounded-full bg-purple-400" style={{ width: `${d.pct}%` }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Source breakdown */}
                              {demographics.sources?.length > 0 && (
                                <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                                  <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold mb-2">Where people find your music</p>
                                  <div className="space-y-2">
                                    {demographics.sources.map(s => (
                                      <div key={s.name}>
                                        <div className="flex justify-between text-xs mb-1">
                                          <span className="text-white/60">{s.name}</span>
                                          <span className="text-white/40">{s.pct}%</span>
                                        </div>
                                        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                          <div className="h-full rounded-full bg-blue-400" style={{ width: `${s.pct}%` }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Export buttons */}
                          <ExportButton
                            artist={artist}
                            trackId={selectedTrack}
                            exportType="streams"
                            days={trackRange}
                            label="Export streams CSV"
                          />
                        </div>
                      )
                    ) : (
                      <p className="text-center text-white/20 text-sm py-4">Select a track above to see detailed analytics</p>
                    )}

                    {/* All tracks list */}
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
                  {/* ── Earnings ── */}
                  <EarningsSection
                    artist={artist}
                    sectionRef={sectionRefs.earnings}
                    downloadsRef={sectionRefs.downloads}
                    highlight={highlightSection}
                  />

                </>
              )}
            </div>
          </TierGate>
        )}

      </div>
    </div>
  );
}