import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Users, Search, Loader, UserCheck,
  UserX, Crown, MoreVertical, Music, Mail, Calendar,
  Megaphone, BarChart3, AlertTriangle, Zap, Trophy,
  Brain, Copy, ChevronRight, Ban, Trash2, Check,
} from 'lucide-react';

const ADMIN_SECTIONS = [
  {
    heading: 'Communications',
    items: [
      { label: 'Broadcast',        icon: Megaphone,     path: '/admin/broadcast',    color: 'bg-purple-500/15 text-purple-300',  desc: 'Send messages to all users' },
      { label: 'Engagement Drip',  icon: Brain,         path: '/admin/engagement',   color: 'bg-violet-500/15 text-violet-300',  desc: 'AI messaging · segment stats' },
    ],
  },
  {
    heading: 'Analytics',
    items: [
      { label: 'Platform Analytics', icon: BarChart3,   path: '/admin/analytics',    color: 'bg-blue-500/15 text-blue-300',      desc: 'Streams, signups, engagement' },
      { label: 'User Behavior',      icon: BarChart3,   path: '/admin/behavior',     color: 'bg-cyan-500/15 text-cyan-300',      desc: 'Activity, downloads, exports' },
    ],
  },
  {
    heading: 'Affiliate Programme',
    items: [
      { label: 'Affiliates & Payouts', icon: Zap,      path: '/admin/affiliates',   color: 'bg-green-500/15 text-green-300',    desc: 'Manage affiliates, approve payouts, run campaigns' },
    ],
  },
  {
    heading: 'Content & Community',
    items: [
      { label: 'Competitions',    icon: Trophy,         path: '/admin/competitions', color: 'bg-yellow-500/15 text-yellow-300',  desc: 'Create and manage competitions' },
      { label: 'Boost Manager',   icon: Zap,            path: '/admin/boost',        color: 'bg-amber-500/15 text-amber-300',    desc: 'Feature and boost content' },
      { label: 'Moderation',      icon: AlertTriangle,  path: '/admin/moderation',   color: 'bg-red-500/15 text-red-300',        desc: 'Flagged tracks and reports' },
    ],
  },
  {
    heading: 'Users & Artists',
    items: [
      { label: 'All Artists',       icon: Music,  path: '/admin/artists',    color: 'bg-green-500/15 text-green-300',    desc: 'Browse and manage artist profiles' },
      { label: 'Duplicate Artists', icon: Copy,   path: '/admin/duplicates', color: 'bg-rose-500/15 text-rose-300',      desc: 'Find and remove duplicates' },
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
      }, { onConflict: 'user_id' }).catch(() => {});

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
    { label: 'Artists', value: artists.length,                           color: 'text-green-400' },
    { label: 'Users',   value: users.length,                             color: 'text-blue-400'  },
    { label: 'Admins',  value: artists.filter(a => a.isAdmin).length,    color: 'text-yellow-400'},
    { label: 'Masters', value: artists.filter(a => a.is_master).length,  color: 'text-purple-400'},
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

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {stats.map(s => (
          <div key={s.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06] text-center">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{s.label}</p>
          </div>
        ))}
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

      {/* User Management */}
      <div className="mt-6">
        <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold px-1 mb-3">User Management</p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search artists or users…"
            className="w-full pl-10 pr-4 py-3 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/20 focus:outline-none transition" />
        </div>

        <div className="flex space-x-1 mb-3 bg-white/[0.03] rounded-lg p-1">
          {['artists', 'users'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${
                activeTab === tab ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
              }`}>
              {tab === 'artists' ? `Artists (${filteredArtists.length})` : `Users (${filteredUsers.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
        ) : activeTab === 'artists' ? (
          <div className="space-y-2">
            {filteredArtists.length === 0 ? (
              <p className="text-center text-white/20 text-sm py-10">No artists found</p>
            ) : filteredArtists.map(artist => (
              <div key={artist.id} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] hover:bg-white/[0.05] transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-white/40">
                        {artist.artist_name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-0.5">
                        <p className="text-sm font-medium text-white truncate">{artist.artist_name || 'Unnamed'}</p>
                        {artist.is_master && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-[9px] font-bold rounded">MASTER</span>}
                        {artist.isAdmin  && <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 text-[9px] font-bold rounded">ADMIN</span>}
                      </div>
                      <p className="text-[11px] text-white/25 mt-0.5">
                        Joined {new Date(artist.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedUser(selectedUser?.id === artist.id ? null : artist)}
                    className="p-2 hover:bg-white/[0.05] rounded-lg transition">
                    <MoreVertical className="w-4 h-4 text-white/30" />
                  </button>
                </div>

                {selectedUser?.id === artist.id && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5">
                    <button onClick={() => handleToggleAdmin(artist)} disabled={actionLoading}
                      className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition text-left">
                      {artist.isAdmin ? <UserX className="w-4 h-4 text-red-400" /> : <UserCheck className="w-4 h-4 text-yellow-400" />}
                      <span className="text-xs text-white/60">{artist.isAdmin ? 'Remove Admin' : 'Make Admin'}</span>
                    </button>
                    <button onClick={() => handleToggleMaster(artist)} disabled={actionLoading}
                      className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition text-left">
                      <Crown className="w-4 h-4 text-purple-400" />
                      <span className="text-xs text-white/60">{artist.is_master ? 'Remove Master' : 'Make Master'}</span>
                    </button>
                    <div className="flex items-center space-x-2 px-3 py-2">
                      <span className="text-xs text-white/30 mr-1">Tier:</span>
                      {['free', 'pro', 'premium'].map(t => (
                        <button key={t} onClick={() => handleSetTier(artist, t)} disabled={actionLoading}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                            t === 'free'   ? 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1]'
                            : t === 'pro'  ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'
                            : 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                          }`}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => navigate(`/artist/${artist.slug || artist.id}`)}
                      className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition text-left">
                      <Music className="w-4 h-4 text-white/40" />
                      <span className="text-xs text-white/60">View Profile</span>
                    </button>
                    {/* Ban + Delete */}
                    <button onClick={() => { setBanConfirm(artist); setSelectedUser(null); }}
                      className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition text-left border-t border-white/[0.04] mt-1 pt-3">
                      <Ban className="w-4 h-4 text-red-400" />
                      <span className="text-xs text-red-400">Ban & Delete Artist</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.length === 0 ? (
              <p className="text-center text-white/20 text-sm py-10">No users found</p>
            ) : filteredUsers.map(user => (
              <div key={user.id} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white/40">
                      {(user.display_name || user.email || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{user.display_name || 'Anonymous'}</p>
                    <div className="flex items-center space-x-3 mt-0.5">
                      {user.email && (
                        <span className="flex items-center space-x-1 text-[11px] text-white/25">
                          <Mail className="w-3 h-3" />
                          <span className="truncate max-w-[160px]">{user.email}</span>
                        </span>
                      )}
                      <span className="flex items-center space-x-1 text-[11px] text-white/25">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(user.created_at).toLocaleDateString()}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}