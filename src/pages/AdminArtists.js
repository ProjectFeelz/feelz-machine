import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Mic2, ChevronLeft, Loader, Search, Music, Play,
  Users, BarChart3, ChevronRight, ExternalLink
} from 'lucide-react';

export default function AdminArtists() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const fetchArtists = useCallback(async () => {
    setLoading(true);
    try {
      const { data: artistData } = await supabase
        .from('artists')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch track counts per artist
      const { data: trackCounts } = await supabase
        .from('tracks')
        .select('artist_id');

      const countMap = {};
      (trackCounts || []).forEach(t => {
        countMap[t.artist_id] = (countMap[t.artist_id] || 0) + 1;
      });

      // Fetch follower counts
      const { data: followerCounts } = await supabase
        .from('follows')
        .select('artist_id');

      const followerMap = {};
      (followerCounts || []).forEach(f => {
        followerMap[f.artist_id] = (followerMap[f.artist_id] || 0) + 1;
      });

      const enriched = (artistData || []).map(a => ({
        ...a,
        trackCount: countMap[a.id] || 0,
        followerCount: followerMap[a.id] || 0,
      }));

      setArtists(enriched);
    } catch (err) {
      console.error('Fetch artists error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) { navigate('/hub'); return; }
    fetchArtists();
  }, [isAdmin, navigate, fetchArtists]);

  const grantTier = async (artistId, tierSlug) => {
    try {
      const { data: tier } = await supabase
        .from('platform_tiers')
        .select('id')
        .eq('slug', tierSlug)
        .single();
      if (!tier) return;

      await supabase
        .from('artist_tier_subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('artist_id', artistId)
        .eq('status', 'active');

      if (tierSlug !== 'free') {
        await supabase.from('artist_tier_subscriptions').insert({
          artist_id: artistId,
          tier_id: tier.id,
          status: 'active',
          paypal_subscription_id: `admin_grant_${Date.now()}`,
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      await supabase
        .from('artists')
        .update({ tier: tierSlug, current_tier_id: tierSlug !== 'free' ? tier.id : null })
        .eq('id', artistId);

      await supabase.from('notifications').insert({
        artist_id: artistId,
        type: 'tier_granted',
        title: tierSlug === 'free' ? 'Plan updated' : `${tierSlug.charAt(0).toUpperCase() + tierSlug.slice(1)} granted`,
        message: tierSlug === 'free'
          ? 'Your plan has been updated to Free.'
          : `An admin has granted you ${tierSlug.charAt(0).toUpperCase() + tierSlug.slice(1)} tier access. Enjoy your features!`,
        metadata: { tier_slug: tierSlug },
      });

      setArtists(prev => prev.map(a => a.id === artistId ? { ...a, tier: tierSlug } : a));
    } catch (err) {
      console.error('Grant tier error:', err);
    }
  };

  const filtered = artists
    .filter(a =>
      (a.artist_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'tracks') return b.trackCount - a.trackCount;
      if (sortBy === 'followers') return b.followerCount - a.followerCount;
      if (sortBy === 'name') return (a.artist_name || '').localeCompare(b.artist_name || '');
      return 0;
    });

  if (!isAdmin) return null;

  return (
    <div className="pt-14 md:pt-0 pb-32 px-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/hub')} className="p-2 -ml-2 hover:bg-white/[0.05] rounded-lg transition">
          <ChevronLeft className="w-5 h-5 text-white/40" />
        </button>
        <Mic2 className="w-6 h-6 text-purple-400/70" />
        <h1 className="text-xl font-bold text-white">All Artists</h1>
        <span className="text-sm text-white/30 ml-auto">{artists.length} total</span>
      </div>

      {/* Search + Sort */}
      <div className="flex space-x-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search artists..."
            className="w-full pl-10 pr-4 py-3 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/[0.15] focus:outline-none transition"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-3 bg-white/[0.04] rounded-xl text-xs text-white/60 border border-white/[0.06] focus:outline-none appearance-none"
        >
          <option value="newest">Newest</option>
          <option value="tracks">Most Tracks</option>
          <option value="followers">Most Followers</option>
          <option value="name">A–Z</option>
        </select>
      </div>

      {/* Artist List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader className="w-5 h-5 animate-spin text-white/20" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Mic2 className="w-10 h-10 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">No artists found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(artist => (
            <button
              key={artist.id}
              onClick={() => navigate(`/profile/${artist.slug || artist.id}`)}
              className="w-full bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] hover:bg-white/[0.06] transition text-left group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <span className="text-base font-bold text-white/30">
                      {artist.artist_name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-white truncate">{artist.artist_name || 'Unnamed'}</p>
                      {artist.is_master && (
                        <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-[9px] font-bold rounded">MASTER</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 mt-1">
                      <span className="flex items-center space-x-1 text-[11px] text-white/25">
                        <Music className="w-3 h-3" />
                        <span>{artist.trackCount} tracks</span>
                      </span>
                      <span className="flex items-center space-x-1 text-[11px] text-white/25">
                        <Users className="w-3 h-3" />
                        <span>{artist.followerCount} followers</span>
                      </span>
                      <span className="text-[11px] text-white/20">
                        Joined {new Date(artist.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    artist.tier === 'premium' ? 'bg-yellow-500/20 text-yellow-400' :
                    artist.tier === 'pro' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-white/10 text-white/30'
                  }`}>{artist.tier || 'free'}</span>
                  <select
                    value={artist.tier || 'free'}
                    onChange={(e) => grantTier(artist.id, e.target.value)}
                    className="text-[10px] bg-white/[0.06] text-white/50 rounded-lg px-2 py-1 border border-white/[0.08] focus:outline-none cursor-pointer"
                    title="Grant tier">
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


