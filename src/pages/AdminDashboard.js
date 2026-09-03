import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Users, Search, Loader, UserCheck,
  UserX, Crown, MoreVertical, Music, Mail, Calendar,
  Megaphone, BarChart3, AlertTriangle, Zap, Trophy,
  Brain, Copy, ChevronRight, Ban, Trash2, Check, Layers,
  Headphones, DollarSign, TrendingUp, Radio, Heart, Star, Download,
} from 'lucide-react';

const ADMIN_SECTIONS = [
    {
    heading: 'Intelligence',
    items: [
      { label: 'Intelligence',  icon: Brain,         path: '/admin/intelligence', color: 'bg-purple-500/15 text-purple-300', desc: 'Platform stats · user behaviour · AI drip' },
    ],
  },
  {
    heading: 'Growth',
    items: [
      { label: 'Growth',        icon: TrendingUp,    path: '/admin/growth',       color: 'bg-green-500/15 text-green-300',  desc: 'Broadcasts · affiliates · payouts' },
    ],
  },
  {
    heading: 'Content',
    items: [
      { label: 'Content',       icon: Layers,        path: '/admin/content',      color: 'bg-amber-500/15 text-amber-300',  desc: 'Boost · competitions · moderation' },
    ],
  },
  {
    heading: 'People',
    items: [
      { label: 'People',        icon: Users,         path: '/admin/people',       color: 'bg-blue-500/15 text-blue-300',    desc: 'Artists · duplicates · bug reports' },
    ],
  },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [artists, setArtists]             = useState([]);
  const [users, setUsers]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [searchQuery, setSearchQuery]     = useState('');
  const [activeTab, setActiveTab]         = useState('artists');
  const [selectedUser, setSelectedUser]   = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [banConfirm, setBanConfirm]       = useState(null); // artist to confirm ban+delete
  const [platformStats, setPlatformStats] = useState({});
  const [userTab, setUserTab]             = useState('artists'); // artists | users | listeners
  const [exporting, setExporting]         = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: artistData } = await supabase
        .from('artists').select('*').order('created_at', { ascending: false });
      const { data: adminData }  = await supabase.from('admins').select('*');
      const adminMap = {};
      (adminData || []).forEach(a => { adminMap[a.user_id] = a; });
      setArtists((artistData || []).map(a => ({
        ...a, isAdmin: !!adminMap[a.user_id], adminLevel: adminMap[a.user_id]?.level || 0,
      })));
      const { data: profileData } = await supabase
        .from('user_profiles').select('*').order('created_at', { ascending: false });
      setUsers(profileData || []);

      // ── Platform stats ─────────────────────────────────────────────────
      const cutoff7d = new Date(Date.now() - 7 * 86400000).toISOString();
      const [
        { count: totalStreams7d },
        { data: tipData },
        { data: dlData },
        { data: beatData },
        { count: fanProCount },
        { count: activeListeners7d },
        { count: totalTracks },
        { count: totalFollows },
      ] = await Promise.all([
        supabase.from('streams').select('*', { count: 'exact', head: true }).gte('created_at', cutoff7d),
        supabase.from('tips').select('amount').gte('created_at', cutoff7d),
        supabase.from('downloads').select('amount_paid').gt('amount_paid', 0).gte('created_at', cutoff7d),
        supabase.from('beat_purchases').select('amount_paid').eq('status', 'completed').gte('created_at', cutoff7d),
        supabase.from('listener_tier_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('listeners').select('*', { count: 'exact', head: true }).gte('last_seen_at', cutoff7d),
        supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('is_published', true),
        supabase.from('follows').select('*', { count: 'exact', head: true }),
      ]);
      // Fetch total listener count separately to avoid RLS interference in Promise.all
      const { data: listenerRows } = await supabase.from('listeners').select('id');
      const totalListeners = (listenerRows || []).length;
      const { data: beatmakerRows } = await supabase.from('artists').select('id').eq('role', 'beatmaker');
      const totalBeatmakers = (beatmakerRows || []).length;
      const tipsTotal  = (tipData  || []).reduce((s, t) => s + (t.amount      || 0), 0);
      const dlTotal    = (dlData   || []).reduce((s, d) => s + (d.amount_paid || 0), 0);
      const beatTotal  = (beatData || []).reduce((s, b) => s + (b.amount_paid || 0), 0);
      setPlatformStats({
        streams7d:      totalStreams7d  || 0,
        revenue7d:      (tipsTotal + dlTotal + beatTotal).toFixed(2),
        fanProSubs:     fanProCount     || 0,
        activeListeners: activeListeners7d || 0,
        publishedTracks: totalTracks    || 0,
        totalFollows:    totalFollows   || 0,
        totalListeners:  totalListeners || 0,
        totalBeatmakers: totalBeatmakers || 0,
      });
    } catch (err) { console.error('Admin fetch error:', err); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) { navigate('/hub'); return; }
    fetchData();
  }, [isAdmin, navigate, fetchData]);

  const handleToggleAdmin = async (artist) => {
    setActionLoading(true);
    try {
      if (artist.isAdmin) {
        await supabase.from('admins').delete().eq('user_id', artist.user_id);
      } else {
        await supabase.from('admins').insert([{ user_id: artist.user_id, level: 1 }]);
      }
      await fetchData();
    } catch (err) { console.error('Toggle admin error:', err); }
    setActionLoading(false);
    setSelectedUser(null);
  };

  const handleSetTier = async (artist, tierSlug) => {
    setActionLoading(true);
    try {
      const { data: tier } = await supabase
        .from('platform_tiers').select('id').eq('slug', tierSlug).single();
      if (!tier) throw new Error('Tier not found');
      await supabase.from('artist_tier_subscriptions').delete().eq('artist_id', artist.id);
      if (tierSlug !== 'free') {
        await supabase.from('artist_tier_subscriptions').insert({
          artist_id: artist.id, tier_id: tier.id, status: 'active',
        });
      }
      await fetchData();
    } catch (err) { console.error('Set tier error:', err); }
    setActionLoading(false);
    setSelectedUser(null);
  };

  const handleToggleMaster = async (artist) => {
    setActionLoading(true);
    try {
      await supabase.from('artists').update({ is_master: !artist.is_master }).eq('id', artist.id);
      await fetchData();
    } catch (err) { console.error('Toggle master error:', err); }
    setActionLoading(false);
    setSelectedUser(null);
  };

  // Ban user permanently + delete all their content
  const handleBanAndDelete = async (artist) => {
    setActionLoading(true);
    try {
      // 1. Ban user in auth (2999 = effectively permanent)
      await supabase.from('user_bans').upsert({
        user_id: artist.user_id,
        banned_until: '2999-12-31T23:59:59Z',
        reason: 'Banned by admin',
      }, { onConflict: 'user_id' });

      // Also update auth.users directly via service role if available
      const { error: banErr } = await supabase.rpc('ban_user', {
        target_user_id: artist.user_id,
      }).catch(() => ({ error: null }));
      if (banErr) console.warn('RPC ban failed, falling back:', banErr);

      // 2. Delete all their tracks
      await supabase.from('tracks').delete().eq('artist_id', artist.id);

      // 3. Delete all their albums
      await supabase.from('albums').delete().eq('artist_id', artist.id);

      // 4. Delete artist profile
      await supabase.from('artists').delete().eq('id', artist.id);

      // 5. Remove from follows
      await supabase.from('follows').delete().eq('artist_id', artist.id);

      await fetchData();
      setBanConfirm(null);
      setSelectedUser(null);
    } catch (err) {
      console.error('Ban error:', err);
      alert('Ban failed: ' + err.message);
    }
    setActionLoading(false);
  };

  const filteredArtists = artists.filter(a =>
    (a.artist_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredUsers = users.filter(u =>
    (u.display_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = [
    { label: 'Artists',       value: artists.length,                          color: 'text-green-400',  icon: Users      },
    { label: 'Listeners',     value: platformStats.totalListeners || 0,            color: 'text-blue-400',   icon: Users      },
    { label: 'Beatmakers',    value: platformStats.totalBeatmakers || 0,           color: 'text-orange-400', icon: Music      },
    { label: 'Published',     value: platformStats.publishedTracks || 0,      color: 'text-purple-400', icon: Music      },
    { label: 'Fan Pro',       value: platformStats.fanProSubs || 0,            color: 'text-yellow-400', icon: Star       },
    { label: 'Streams (7d)',  value: platformStats.streams7d || 0,            color: 'text-cyan-400',   icon: Headphones },
    { label: 'Active (7d)',   value: platformStats.activeListeners || 0,       color: 'text-pink-400',   icon: Radio      },
    { label: 'Follows',       value: platformStats.totalFollows || 0,          color: 'text-indigo-400', icon: Heart      },
    { label: 'Revenue (7d)',  value: `$${platformStats.revenue7d || '0.00'}`,  color: 'text-green-400',  icon: DollarSign },
  ];

  const handleExportPlatform = async () => {
    setExporting(true);
    try {
      const now = new Date().toISOString().split('T')[0];
      const [
        { data: artistData },
        { data: listenerData },
        { data: streamData },
        { data: trackData },
        { data: tipData },
        { data: followData },
      ] = await Promise.all([
        supabase.from('artists').select('id, artist_name, email, tier, role, follower_count, total_streams, created_at, last_seen_at').order('created_at', { ascending: false }),
        supabase.from('listeners').select('id, user_id, display_name, tier, created_at, last_seen_at').order('created_at', { ascending: false }),
        supabase.from('streams').select('id, track_id, user_id, created_at, duration_played, completed, device_type, platform').order('created_at', { ascending: false }).limit(10000),
        supabase.from('tracks').select('id, title, artist_id, stream_count, download_count, download_price, is_published, created_at').order('created_at', { ascending: false }),
        supabase.from('tips').select('id, artist_id, from_user_id, amount, currency, created_at').order('created_at', { ascending: false }),
        supabase.from('follows').select('artist_id, follower_id, created_at').order('created_at', { ascending: false }).limit(5000),
      ]);

      const sheets = {
        artists: { headers: ['id','artist_name','email','tier','role','follower_count','total_streams','created_at','last_seen_at'], rows: artistData || [] },
        listeners: { headers: ['id','user_id','display_name','tier','created_at','last_seen_at'], rows: listenerData || [] },
        tracks: { headers: ['id','title','artist_id','stream_count','download_count','download_price','is_published','created_at'], rows: trackData || [] },
        streams: { headers: ['id','track_id','user_id','created_at','duration_played','completed','device_type','platform'], rows: streamData || [] },
        tips: { headers: ['id','artist_id','from_user_id','amount','currency','created_at'], rows: tipData || [] },
        follows: { headers: ['artist_id','follower_id','created_at'], rows: followData || [] },
      };

      const escape = v => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };

      for (const [name, { headers, rows }] of Object.entries(sheets)) {
        const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `feelzmachine_${name}_${now}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await new Promise(r => setTimeout(r, 200)); // slight delay between files
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed: ' + err.message);
    }
    setExporting(false);
  };

  if (!isAdmin) return null;

  return (
    <div className="pt-14 md:pt-0 pb-32 px-4 md:px-0">

      {/* Ban confirm modal */}
      {banConfirm && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-neutral-900 rounded-3xl p-6 border border-red-500/20">
            <div className="flex items-start space-x-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-white mb-1">Ban & Delete "{banConfirm.artist_name}"?</p>
                <p className="text-xs text-white/40 leading-relaxed">
                  This will permanently ban the user, delete all their tracks, albums and artist profile. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <button onClick={() => setBanConfirm(null)}
                className="flex-1 py-2.5 rounded-xl text-sm text-white/40 border border-white/[0.08] hover:bg-white/[0.04] transition">
                Cancel
              </button>
              <button onClick={() => handleBanAndDelete(banConfirm)} disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white disabled:opacity-50 transition flex items-center justify-center space-x-2">
                {actionLoading ? <Loader className="w-4 h-4 animate-spin" /> : <><Ban className="w-4 h-4" /><span>Ban & Delete</span></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-2">
        <div className="flex items-center space-x-3">
          <Shield className="w-5 h-5 text-yellow-400/70" />
          <h1 className="text-base font-bold text-white">Admin Panel</h1>
        </div>
        <button
          onClick={handleExportPlatform}
          disabled={exporting}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs font-semibold text-white/60 hover:text-white hover:bg-white/[0.08] transition disabled:opacity-40"
        >
          {exporting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
        </button>
      </div>

      {/* Platform stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white/[0.03] rounded-2xl p-5 border border-white/[0.07]">
              <div className="flex items-center justify-between mb-1">
                <Icon className={`w-5 h-5 ${s.color} opacity-60`} />
              </div>
              <p className={`text-3xl font-black ${s.color} leading-none`}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
              <p className="text-xs text-white/30 mt-2 leading-tight">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Main admin areas. These were previously four separate sections with
          one card each, so every card carried a heading that just repeated
          its own label and sat alone on a row. Flattened into a 2x2 grid of
          properly-sized cards instead. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ADMIN_SECTIONS.flatMap(s => s.items).map(({ label, icon: Icon, path, color, desc }) => (
          <button key={label} onClick={() => navigate(path)}
            className="flex items-center space-x-5 p-6 bg-white/[0.03] rounded-2xl border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/[0.12] active:scale-[0.99] transition text-left group">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 ${color.split(' ')[0]}`}>
              <Icon className={`w-8 h-8 ${color.split(' ')[1]}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-white truncate">{label}</p>
              <p className="text-xs text-white/35 truncate mt-1">{desc}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-white/15 group-hover:text-white/40 transition flex-shrink-0" />
          </button>
        ))}
      </div>

    </div>
  );
}