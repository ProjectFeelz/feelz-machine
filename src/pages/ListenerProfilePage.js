/**
 * ListenerProfilePage.js
 * src/pages/ListenerProfilePage.js
 * Route: /listener/:userId
 * Public listener profile — shows their top artists, recent activity, fan badge
 */

import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ChevronLeft, Music, Loader, Zap, Users } from 'lucide-react';

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

export default function ListenerProfilePage() {
  const { userId } = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const [profile,     setProfile]     = useState(null);
  const [topArtists,  setTopArtists]  = useState([]);
  const [mutualArtists, setMutualArtists] = useState([]);
  const [stats,       setStats]       = useState({ streams: 0, following: 0 });
  const [loading,     setLoading]     = useState(true);
  const isSelf = user?.id === userId;

  useEffect(() => { load(); }, [userId]); // eslint-disable-line

  const load = async () => {
    setLoading(true);
    try {
      // Get listener profile
      const { data: listener } = await supabase
        .from('listeners')
        .select('user_id, display_name, avatar_url, tier, preferences, created_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (!listener) { navigate('/browse'); return; }

      // Also check artists table
      const { data: artist } = await supabase
        .from('artists')
        .select('artist_name, profile_image_url, slug, is_verified')
        .eq('user_id', userId)
        .maybeSingle();

      setProfile({
        name:   artist?.artist_name || listener.display_name || 'Listener',
        avatar: artist?.profile_image_url || listener.avatar_url || null,
        slug:   artist?.slug || null,
        isFanPro: ['fan_pro','pro','premium'].includes(listener.tier) && listener.preferences?.fanBadge !== false,
        joinedAt: listener.created_at,
      });

      // Stream count + following count
      const [{ count: streamCount }, { count: followCount }] = await Promise.all([
        supabase.from('streams').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
      ]);
      setStats({ streams: streamCount || 0, following: followCount || 0 });

      // Top artists by stream count
      const { data: streams } = await supabase
        .from('streams')
        .select('tracks(artist_id, artists(id, artist_name, slug, profile_image_url))')
        .eq('user_id', userId)
        .limit(2000);

      if (streams?.length) {
        const counts = {};
        const meta   = {};
        streams.forEach(s => {
          const id = s.tracks?.artist_id;
          const a  = s.tracks?.artists;
          if (!id || !a) return;
          counts[id] = (counts[id] || 0) + 1;
          meta[id]   = a;
        });
        const top = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([id, count]) => ({ ...meta[id], count }));
        setTopArtists(top);

        // Mutual artists — artists both this user and logged-in user listen to
        if (user && user.id !== userId) {
          const { data: myStreams } = await supabase
            .from('streams')
            .select('tracks(artist_id)')
            .eq('user_id', user.id)
            .limit(2000);
          const myArtistIds = new Set((myStreams || []).map(s => s.tracks?.artist_id).filter(Boolean));
          const mutual = top.filter(a => myArtistIds.has(a.id));
          setMutualArtists(mutual);
        }
      }
    } catch (err) { console.error('Listener profile error:', err); }
    setLoading(false);
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader className="w-6 h-6 animate-spin text-white/20" />
    </div>
  );

  if (!profile) return null;

  return (
    <div className="pb-32 max-w-4xl mx-auto">
      <Helmet>
        <title>{profile.name} · Feelz Machine</title>
        <link rel="icon" href="/favicon.ico" />
      </Helmet>

      <div className="flex items-center justify-between px-4 sticky top-0 z-20 bg-black/95 backdrop-blur-xl pt-14 md:pt-4 pb-3 border-b border-white/[0.04]">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Profile header */}
      <div className="flex flex-col items-center pt-8 pb-6 px-4 text-center">
        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/[0.06] mb-3">
          {profile.avatar
            ? <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center">
                <span className="text-3xl font-bold text-white/30">{profile.name[0]?.toUpperCase()}</span>
              </div>}
        </div>
        <div className="flex items-center space-x-2 mb-1">
          <h1 className="text-2xl font-bold text-white">{profile.name}</h1>
          {profile.isFanPro && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
              ⚡ Fan Pro
            </span>
          )}
        </div>
        {profile.slug && (
          <button onClick={() => navigate(`/artist/${profile.slug}`)}
            className="text-xs text-purple-400/60 hover:text-purple-400 transition mb-3">
            View artist profile →
          </button>
        )}
        <div className="flex items-center space-x-6">
          <div className="text-center">
            <p className="text-lg font-black text-white">{formatNumber(stats.streams)}</p>
            <p className="text-[10px] text-white/30">Streams</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-black text-white">{formatNumber(stats.following)}</p>
            <p className="text-[10px] text-white/30">Following</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-black text-white">{topArtists.length}</p>
            <p className="text-[10px] text-white/30">Top Artists</p>
          </div>
        </div>
      </div>

      {/* Mutual artists */}
      {mutualArtists.length > 0 && (
        <div className="px-4 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3 flex items-center space-x-1.5">
            <Users className="w-3 h-3" />
            <span>You both listen to</span>
          </p>
          <div className="flex space-x-3 overflow-x-auto scrollbar-hide">
            {mutualArtists.map(a => (
              <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
                className="flex-shrink-0 flex flex-col items-center w-16">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-white/[0.06] mb-1.5">
                  {a.profile_image_url
                    ? <img src={a.profile_image_url} alt={a.artist_name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-5 h-5 text-white/20" />
                      </div>}
                </div>
                <p className="text-[10px] text-white/50 truncate w-full text-center">{a.artist_name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top artists */}
      {topArtists.length > 0 && (
        <div className="px-4 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3">Top Artists</p>
          <div className="space-y-1">
            {topArtists.map((a, i) => (
              <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
                className="w-full flex items-center space-x-3 p-3 rounded-xl hover:bg-white/[0.04] transition text-left">
                <span className="text-xs font-bold text-white/20 w-4 flex-shrink-0">{i + 1}</span>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-white/[0.06] flex-shrink-0">
                  {a.profile_image_url
                    ? <img src={a.profile_image_url} alt={a.artist_name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-4 h-4 text-white/20" />
                      </div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{a.artist_name}</p>
                  <p className="text-xs text-white/30">{formatNumber(a.count)} plays</p>
                </div>
                <div className="w-16 h-1 bg-white/[0.06] rounded-full overflow-hidden flex-shrink-0">
                  <div className="h-full bg-purple-400 rounded-full"
                    style={{ width: `${Math.round((a.count / topArtists[0].count) * 100)}%` }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}