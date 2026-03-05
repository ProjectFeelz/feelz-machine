import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Users, Search, ChevronLeft, Loader, UserCheck,
  UserX, Crown, MoreVertical, X, Music, Mail, Calendar
} from 'lucide-react';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('artists');
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch artists with their admin status
      const { data: artistData } = await supabase
        .from('artists')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch admins
      const { data: adminData } = await supabase
        .from('admins')
        .select('*');

      const adminMap = {};
      (adminData || []).forEach(a => { adminMap[a.user_id] = a; });

      const enrichedArtists = (artistData || []).map(a => ({
        ...a,
        isAdmin: !!adminMap[a.user_id],
        adminLevel: adminMap[a.user_id]?.level || 0,
      }));

      setArtists(enrichedArtists);

      // Fetch user profiles
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      setUsers(profileData || []);
    } catch (err) {
      console.error('Admin fetch error:', err);
    }
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
        await supabase.from('admins').insert([{
          user_id: artist.user_id,
          level: 1,
        }]);
      }
      await fetchData();
    } catch (err) {
      console.error('Toggle admin error:', err);
    }
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
          artist_id: artist.id, tier_id: tier.id, status: 'active'
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
      await supabase
        .from('artists')
        .update({ is_master: !artist.is_master })
        .eq('id', artist.id);
      await fetchData();
    } catch (err) {
      console.error('Toggle master error:', err);
    }
    setActionLoading(false);
    setSelectedUser(null);
  };

  const filteredArtists = artists.filter(a =>
    (a.artist_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter(u =>
    (u.display_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    totalArtists: artists.length,
    totalUsers: users.length,
    totalAdmins: artists.filter(a => a.isAdmin).length,
    masterArtists: artists.filter(a => a.is_master).length,
  };

  if (!isAdmin) return null;

  return (
    <div className="pt-14 md:pt-0 pb-32 px-4 max-w-3xl md:max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/hub')} className="p-2 -ml-2 hover:bg-white/[0.05] rounded-lg transition">
          <ChevronLeft className="w-5 h-5 text-white/40" />
        </button>
        <Shield className="w-6 h-6 text-yellow-400/70" />
        <h1 className="text-xl font-bold text-white">User Management</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {[
          { label: 'Artists', value: stats.totalArtists, color: 'text-green-400' },
          { label: 'Users', value: stats.totalUsers, color: 'text-blue-400' },
          { label: 'Admins', value: stats.totalAdmins, color: 'text-yellow-400' },
          { label: 'Masters', value: stats.masterArtists, color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06] text-center">
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users..."
          className="w-full pl-10 pr-4 py-3 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/[0.15] focus:outline-none transition"
        />
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-4 bg-white/[0.03] rounded-lg p-1">
        {['artists', 'users'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${
              activeTab === tab ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
            }`}
          >
            {tab === 'artists' ? `Artists (${filteredArtists.length})` : `Users (${filteredUsers.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader className="w-5 h-5 animate-spin text-white/20" />
        </div>
      ) : activeTab === 'artists' ? (
        <div className="space-y-2">
          {filteredArtists.length === 0 ? (
            <p className="text-center text-white/20 text-sm py-12">No artists found</p>
          ) : filteredArtists.map(artist => (
            <div key={artist.id} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] transition hover:bg-white/[0.05]">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white/40">
                      {artist.artist_name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-white truncate">{artist.artist_name || 'Unnamed'}</p>
                      {artist.is_master && (
                        <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-[9px] font-bold rounded">MASTER</span>
                      )}
                      {artist.isAdmin && (
                        <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 text-[9px] font-bold rounded">ADMIN</span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/25 mt-0.5">
                      Joined {new Date(artist.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUser(selectedUser?.id === artist.id ? null : artist)}
                  className="p-2 hover:bg-white/[0.05] rounded-lg transition"
                >
                  <MoreVertical className="w-4 h-4 text-white/30" />
                </button>
              </div>

              {/* Action panel */}
              {selectedUser?.id === artist.id && (
                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                  <button
                    onClick={() => handleToggleAdmin(artist)}
                    disabled={actionLoading}
                    className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition text-left"
                  >
                    {artist.isAdmin ? <UserX className="w-4 h-4 text-red-400" /> : <UserCheck className="w-4 h-4 text-yellow-400" />}
                    <span className="text-xs text-white/60">{artist.isAdmin ? 'Remove Admin' : 'Make Admin'}</span>
                  </button>
                  <button
                    onClick={() => handleToggleMaster(artist)}
                    disabled={actionLoading}
                    className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition text-left"
                  >
                    <Crown className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-white/60">{artist.is_master ? 'Remove Master' : 'Make Master'}</span>
                  </button>
                  <div className="flex items-center space-x-2 px-3 py-2">
                    <span className="text-xs text-white/30 mr-1">Tier:</span>
                    {['free', 'pro', 'premium'].map(t => (
                      <button key={t} onClick={() => handleSetTier(artist, t)}
                        disabled={actionLoading}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                          t === 'free' ? 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1]'
                          : t === 'pro' ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'
                          : 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                        }`}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => navigate(`/profile/${artist.slug || artist.id}`)}
                    className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.05] transition text-left"
                  >
                    <Music className="w-4 h-4 text-white/40" />
                    <span className="text-xs text-white/60">View Profile</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredUsers.length === 0 ? (
            <p className="text-center text-white/20 text-sm py-12">No users found</p>
          ) : filteredUsers.map(user => (
            <div key={user.id} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white/40">
                    {(user.display_name || user.email || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.display_name || 'Anonymous'}</p>
                  <div className="flex items-center space-x-2 mt-0.5">
                    {user.email && (
                      <span className="flex items-center space-x-1 text-[11px] text-white/25">
                        <Mail className="w-3 h-3" />
                        <span className="truncate max-w-[180px]">{user.email}</span>
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
  );
}

