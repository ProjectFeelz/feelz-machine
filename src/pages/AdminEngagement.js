import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Zap, Users, TrendingUp, Play, Pause, RefreshCw, Brain,
  ArrowLeft, Loader, Check, AlertCircle, ChevronDown, ChevronUp,
  MessageSquare, Clock, BarChart2, Sparkles, Megaphone
} from 'lucide-react';

const SEGMENT_LABELS = {
  new_artist:       { label: 'New Artists',       color: 'text-green-400',  bg: 'bg-green-500/10'  },
  active_artist:    { label: 'Active Artists',     color: 'text-purple-400', bg: 'bg-purple-500/10' },
  dormant_artist:   { label: 'Dormant Artists',    color: 'text-orange-400', bg: 'bg-orange-500/10' },
  new_listener:     { label: 'New Listeners',      color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
  active_listener:  { label: 'Active Listeners',   color: 'text-cyan-400',   bg: 'bg-cyan-500/10'   },
  dormant_listener: { label: 'Dormant Listeners',  color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
};

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
      <p className="text-[10px] uppercase tracking-widest text-white/30 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-white/30 mt-0.5">{sub}</p>}
    </div>
  );
}

function SegmentRow({ segmentKey, count, recentSent, lastMessage }) {
  const info = SEGMENT_LABELS[segmentKey] || { label: segmentKey, color: 'text-white/50', bg: 'bg-white/[0.06]' };
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-3.5 text-left">
        <div className="flex items-center space-x-3">
          <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${info.bg} ${info.color}`}>
            {info.label}
          </div>
          <span className="text-sm font-semibold text-white">{count} users</span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-xs text-white/30">{recentSent} sent this week</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-white/30" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30" />}
        </div>
      </button>
      {expanded && lastMessage && (
        <div className="px-3.5 pb-3.5 pt-0 border-t border-white/[0.04]">
          <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1.5 mt-2">Last message sent</p>
          <p className="text-xs font-semibold text-white">{lastMessage.title}</p>
          <p className="text-xs text-white/50 mt-0.5">{lastMessage.body}</p>
          <p className="text-[10px] text-white/20 mt-1.5">
            {new Date(lastMessage.sent_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminEngagement() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [config, setConfig]           = useState({ drip_enabled: 'true', max_per_week: '2' });
  const [stats, setStats]             = useState(null);
  const [segmentCounts, setSegmentCounts] = useState({});
  const [recentMessages, setRecentMessages] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [triggering, setTriggering]       = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);
  const [blasting, setBlasting]           = useState(false);
  const [blastResult, setBlastResult]     = useState(null);
  const [eduTriggering, setEduTriggering] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Config
      const { data: configData } = await supabase
        .from('engagement_config').select('key, value');
      if (configData?.length) {
        const map = Object.fromEntries(configData.map(r => [r.key, r.value]));
        setConfig(prev => ({ ...prev, ...map }));
      }

      // Stats — messages sent in last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: weekTotal } = await supabase
        .from('engagement_messages')
        .select('*', { count: 'exact', head: true })
        .gte('sent_at', weekAgo);

      const { count: totalEver } = await supabase
        .from('engagement_messages')
        .select('*', { count: 'exact', head: true });

      // Segment breakdown from recent messages
      const { data: segmentData } = await supabase
        .from('engagement_messages')
        .select('segment')
        .gte('sent_at', weekAgo);

      const segBreakdown = {};
      (segmentData || []).forEach(r => {
        segBreakdown[r.segment] = (segBreakdown[r.segment] || 0) + 1;
      });

      // Artist + listener counts per segment
      const now = new Date();
      const dormantCutoff = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
      const churnedCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      const newUserCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

      const [
        { count: totalArtists },
        { count: activeArtists },
        { count: newArtists },
        { count: totalListeners },
        { count: activeListeners },
        { count: newListeners },
        { count: totalProfiles },
      ] = await Promise.all([
        supabase.from('artists').select('*', { count: 'exact', head: true }),
        supabase.from('artists').select('*', { count: 'exact', head: true }).gte('last_seen_at', dormantCutoff),
        supabase.from('artists').select('*', { count: 'exact', head: true }).gte('created_at', newUserCutoff),
        supabase.from('listeners').select('*', { count: 'exact', head: true }),
        supabase.from('listeners').select('*', { count: 'exact', head: true }).gte('last_seen_at', dormantCutoff),
        supabase.from('listeners').select('*', { count: 'exact', head: true }).gte('created_at', newUserCutoff),
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
      ]);

      // If listeners table is empty (records never inserted), fall back to
      // total user_profiles minus artist accounts as a best-effort listener count
      const effectiveListeners = (totalListeners || 0) > 0
        ? (totalListeners || 0)
        : Math.max(0, (totalProfiles || 0) - (totalArtists || 0));

      setSegmentCounts({
        new_artist:       newArtists || 0,
        active_artist:    Math.max(0, (activeArtists || 0) - (newArtists || 0)),
        dormant_artist:   Math.max(0, (totalArtists || 0) - (activeArtists || 0)),
        new_listener:     newListeners || 0,
        active_listener:  Math.max(0, (activeListeners || 0) - (newListeners || 0)),
        dormant_listener: Math.max(0, effectiveListeners - (activeListeners || 0)),
        total_artists:    totalArtists || 0,
        total_listeners:  effectiveListeners,
      });

      setStats({ weekTotal: weekTotal || 0, totalEver: totalEver || 0, segBreakdown });

      // Recent messages sample
      const { data: recent } = await supabase
        .from('engagement_messages')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(20);
      setRecentMessages(recent || []);

    } catch (err) {
      console.error('Load engagement stats error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) { navigate('/hub'); return; }
    load();
  }, [isAdmin]);

  const handleToggleDrip = async () => {
    const newVal = config.drip_enabled === 'true' ? 'false' : 'true';
    setSaving(true);
    await supabase.from('engagement_config').upsert({ key: 'drip_enabled', value: newVal, updated_at: new Date().toISOString() });
    setConfig(prev => ({ ...prev, drip_enabled: newVal }));
    setSaving(false);
    showToast(newVal === 'true' ? 'Drip enabled ✓' : 'Drip paused');
  };

  const handleSaveMaxPerWeek = async (val) => {
    await supabase.from('engagement_config').upsert({ key: 'max_per_week', value: String(val), updated_at: new Date().toISOString() });
    setConfig(prev => ({ ...prev, max_per_week: String(val) }));
    showToast('Saved ✓');
  };

  const handleManualTrigger = async () => {
    if (!window.confirm('Run the AI engagement drip now? This will send notifications to eligible users.')) return;
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch('/.netlify/functions/engagement-drip-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      // Background functions return 202 with no body — handle both cases
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      if (res.status === 202 || res.status === 200) {
        if (data.skipped) {
          showToast('Drip is disabled — enable it first');
        } else if (data.totalSent !== undefined) {
          setTriggerResult(data);
          showToast(`Done — ${data.totalSent} notifications sent`);
        } else {
          // Background function accepted — processing async
          showToast('Drip triggered — running in background. Check Netlify logs for results.');
          setTriggerResult({ totalSent: '?', segments: {}, async: true });
        }
        load();
      } else {
        showToast(`Trigger failed: HTTP ${res.status} — ${data.error || text || 'unknown error'}`);
      }
    } catch (err) {
      showToast('Trigger failed: ' + err.message);
    }
    setTriggering(false);
  };

  const handleBlast = async () => {
    if (!window.confirm('Send platform update blast to ALL users? This will notify everyone on the platform.')) return;
    setBlasting(true); setBlastResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/platform-update-blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.REACT_APP_INTERNAL_FUNCTION_SECRET || '' },
        body: JSON.stringify({ token: session?.access_token }),
      });
      const data = await res.json();
      setBlastResult(data);
      if (data.success) showToast(`Blast sent to ${data.sent} users`);
      else showToast('Blast failed: ' + (data.error || 'unknown error'));
    } catch (err) { showToast('Blast failed: ' + err.message); }
    setBlasting(false);
  };

  const handleEduDrip = async () => {
    setEduTriggering(true);
    try {
      const siteUrl = window.location.origin;
      const res = await fetch('/.netlify/functions/feature-education-drip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      showToast(data.sent ? `Education tips sent to ${data.sent} users` : 'Done — all users already up to date');
    } catch (err) { showToast('Failed: ' + err.message); }
    setEduTriggering(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/20" />
      </div>
    );
  }

  const isEnabled = config.drip_enabled === 'true';

  return (
    <div className="min-h-screen pb-24">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/90 backdrop-blur-sm px-5 pt-14 md:pt-4 pb-4 border-b border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button onClick={() => navigate('/admin')} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div className="flex items-center space-x-2">
              <Brain className="w-5 h-5 text-purple-400" />
              <h1 className="text-base font-bold text-white">AI Engagement</h1>
            </div>
          </div>

          {/* Master toggle */}
          <button
            onClick={handleToggleDrip}
            disabled={saving}
            className={`flex items-center space-x-2 px-3 py-2 rounded-xl border transition text-xs font-bold ${
              isEnabled
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                : 'bg-white/[0.04] border-white/[0.1] text-white/40'
            }`}>
            {isEnabled
              ? <><Zap className="w-3.5 h-3.5" /><span>Live</span></>
              : <><Pause className="w-3.5 h-3.5" /><span>Paused</span></>}
          </button>
        </div>
      </div>

      <div className="px-5 pt-5 space-y-5">
        {/* How it works banner */}
        <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <p className="text-xs font-bold text-purple-300">How it works</p>
          </div>
          <p className="text-xs text-purple-400/70 leading-relaxed">
            Every Monday and Thursday at 10am UTC, Claude segments your users by behaviour
            (new, active, dormant) and writes personalised in-app notifications for each group.
            No two segments get the same message. Max {config.max_per_week} per user per week.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Sent this week"
            value={stats?.weekTotal || 0}
            color="text-purple-400"
          />
          <StatCard
            label="All time"
            value={stats?.totalEver || 0}
            color="text-white"
          />
          <StatCard
            label="Total artists"
            value={segmentCounts.total_artists || 0}
            sub={`${segmentCounts.active_artist || 0} active`}
          />
          <StatCard
            label="Total listeners"
            value={segmentCounts.total_listeners || 0}
          />
        </div>

        {/* Next scheduled run */}
        <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <Clock className="w-4 h-4 text-white/30 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-white/60">Next scheduled run</p>
            <p className="text-[10px] text-white/30 mt-0.5">
              {isEnabled ? 'Monday & Thursday at 10:00 AM UTC' : 'Paused — enable to resume'}
            </p>
          </div>
          <button
            onClick={handleManualTrigger}
            disabled={triggering}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition text-xs text-white/60 font-medium">
            {triggering
              ? <Loader className="w-3.5 h-3.5 animate-spin" />
              : <Play className="w-3.5 h-3.5" />}
            <span>{triggering ? 'Running...' : 'Run now'}</span>
          </button>
        </div>

        {/* ── Update Blast ── */}
        <div className="pt-3 mt-3 border-t border-white/[0.05] space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold">One-time blasts</p>
          <div className="flex space-x-2">
            <button onClick={handleBlast} disabled={blasting}
              className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/15 transition text-xs text-purple-300 font-semibold disabled:opacity-40">
              {blasting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
              <span>{blasting ? 'Sending...' : '📣 Send Platform Update'}</span>
            </button>
            <button onClick={handleEduDrip} disabled={eduTriggering}
              className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/15 transition text-xs text-blue-300 font-semibold disabled:opacity-40">
              {eduTriggering ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              <span>{eduTriggering ? 'Sending...' : '💡 Send Feature Tips'}</span>
            </button>
          </div>
          {blastResult?.success && (
            <p className="text-[10px] text-green-400 text-center">
              Blast sent to {blastResult.sent} users ✓
            </p>
          )}
        </div>

        {/* Manual trigger result */}
        {triggerResult && (
          <div className={`rounded-xl p-4 border ${triggerResult.async ? 'bg-blue-500/10 border-blue-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
            <div className="flex items-center space-x-2 mb-2">
              <Check className={`w-4 h-4 ${triggerResult.async ? 'text-blue-400' : 'text-green-400'}`} />
              <p className={`text-xs font-bold ${triggerResult.async ? 'text-blue-300' : 'text-green-300'}`}>
                {triggerResult.async
                  ? 'Running in background — check Netlify logs'
                  : `Run complete — ${triggerResult.totalSent} notifications sent`}
              </p>
            </div>
            <div className="space-y-1">
              {Object.entries(triggerResult.segments || {}).map(([seg, result]) => (
                <div key={seg} className="flex items-center justify-between">
                  <span className="text-[10px] text-green-400/60 capitalize">{seg.replace('_', ' ')}</span>
                  <span className="text-[10px] text-green-400">
                    {result.sent}/{result.users} sent
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Max per week control */}
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
          <p className="text-xs font-semibold text-white mb-3">Messages per user per week</p>
          <div className="flex space-x-2">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => handleSaveMaxPerWeek(n)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${
                  parseInt(config.max_per_week) === n
                    ? 'bg-white text-black'
                    : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.1]'
                }`}>
                {n}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/20 mt-2">
            Recommended: 2. More than 3 risks feeling spammy.
          </p>
        </div>

        {/* Segment breakdown */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-3">
            User Segments
          </p>
          <div className="space-y-2">
            {Object.keys(SEGMENT_LABELS).map(segKey => {
              const weekCount = stats?.segBreakdown?.[segKey] || 0;
              const lastMsg = recentMessages.find(m => m.segment === segKey);
              const approxCount = segmentCounts[segKey] || 0;

              return (
                <SegmentRow
                  key={segKey}
                  segmentKey={segKey}
                  count={approxCount}
                  recentSent={weekCount}
                  lastMessage={lastMsg ? { title: lastMsg.title, body: lastMsg.body, sent_at: lastMsg.sent_at } : null}
                />
              );
            })}
          </div>
        </div>

        {/* Recent messages log */}
        {recentMessages.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-3 flex items-center space-x-1.5">
              <MessageSquare className="w-3 h-3" />
              <span>Recent Messages Sent</span>
            </p>
            <div className="space-y-2">
              {recentMessages.slice(0, 8).map(msg => {
                const segInfo = SEGMENT_LABELS[msg.segment] || {};
                return (
                  <div key={msg.id} className="flex items-start space-x-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <div className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${segInfo.bg || 'bg-white/[0.06]'} ${segInfo.color || 'text-white/40'}`}>
                      {(segInfo.label || msg.segment).split(' ')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{msg.title}</p>
                      <p className="text-[10px] text-white/40 truncate">{msg.body}</p>
                    </div>
                    <p className="text-[9px] text-white/20 flex-shrink-0">
                      {new Date(msg.sent_at).toLocaleDateString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}