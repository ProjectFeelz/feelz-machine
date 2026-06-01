import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Users, Search, Loader, UserCheck,
  UserX, Crown, MoreVertical, Music, Mail, Calendar,
  Megaphone, BarChart3, AlertTriangle, Zap, Trophy,
  Brain, Copy, ChevronRight, Ban, Trash2, Check, Layers,
  Headphones, DollarSign, TrendingUp, Radio, Heart, Star,
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
    { label: 'Users',         value: users.length,                            color: 'text-blue-400',   icon: Users      },
    { label: 'Published',     value: platformStats.publishedTracks || 0,      color: 'text-purple-400', icon: Music      },
    { label: 'Fan Pro',       value: platformStats.fanProSubs || 0,            color: 'text-yellow-400', icon: Star       },
    { label: 'Streams (7d)',  value: platformStats.streams7d || 0,            color: 'text-cyan-400',   icon: Headphones },
    { label: 'Active (7d)',   value: platformStats.activeListeners || 0,       color: 'text-pink-400',   icon: Radio      },
    { label: 'Follows',       value: platformStats.totalFollows || 0,          color: 'text-indigo-400', icon: Heart      },
    { label: 'Revenue (7d)',  value: `$${platformStats.revenue7d || '0.00'}`,  color: 'text-green-400',  icon: DollarSign },
  ];

  if (!isAdmin) return null;

  return (
    <div className="pt-14 md:pt-0 pb-32 px-4 max-w-3xl mx-auto">

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
      <div className="flex items-center space-x-3 mb-6 pt-2">
        <Shield className="w-5 h-5 text-yellow-400/70" />
        <h1 className="text-xl font-bold text-white">Admin Panel</h1>
      </div>

      {/* Platform stats grid */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
              <div className="flex items-center justify-between mb-1">
                <Icon className={`w-3.5 h-3.5 ${s.color} opacity-60`} />
              </div>
              <p className={`text-base font-black ${s.color} leading-none`}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
              <p className="text-[9px] text-white/25 mt-1 leading-tight">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* Grouped nav sections */}
      {ADMIN_SECTIONS.map(({ heading, items }) => (
        <div key={heading} className="mb-5">
          <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold px-1 mb-2">{heading}</p>
          <div className="grid grid-cols-2 gap-2">
            {items.map(({ label, icon: Icon, path, color, desc }) => (
              <button key={label} onClick={() => navigate(path)}
                className="flex items-center space-x-3 px-3 py-3 bg-white/[0.03] rounded-xl border border-white/[0.06] hover:bg-white/[0.06] active:scale-[0.98] transition text-left group">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color.split(' ')[0]}`}>
                  <Icon className={`w-4 h-4 ${color.split(' ')[1]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/80 truncate">{label}</p>
                  <p className="text-[10px] text-white/30 truncate mt-0.5">{desc}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-white/15 group-hover:text-white/30 transition flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}

    </div>
  ); 