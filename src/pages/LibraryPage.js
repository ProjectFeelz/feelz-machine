import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/useTier';
import { getListenerFeature } from '../contexts/useTier';
import { supabase } from '../supabaseClient';
import {
  Heart, Download, ListMusic, Users, Clock, ChevronRight,
  Music, BarChart3, Zap, TrendingUp, Crown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LibraryPage() {
  const { user, isArtist } = useAuth();
  const { listenerTierSlug } = useTier();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    likes: 0, recentTrack: null, playlists: 0, following: 0, downloads: 0,
    totalStreams: 0, topArtist: null, monthlyDownloads: 0,
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0,0,0,0);

        const [
          { count: likesCount },
          { data: recentData },
          { count: playlistCount },
          { count: followCount },
          { count: dlCount },
          { count: streamCount },
          { count: monthlyDlCount },
        ] = await Promise.all([
          supabase.from('track_likes').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('streams')
            .select('tracks(id, title, cover_artwork_url, artists(artist_name))')
            .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
          supabase.from('playlists').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
          supabase.from('downloads').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('streams').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('downloads').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('amount_paid', 0).gte('created_at', monthStart.toISOString()),
        ]);

        // Top artist by stream count
        let topArtist = null;
        try {
          const { data: topStreams } = await supabase
            .from('streams')
            .select('tracks(artist_id, artists(artist_name, profile_image_url))')
            .eq('user_id', user.id)
            .limit(200);
          if (topStreams?.length) {
            const counts = {};
            const meta   = {};
            topStreams.forEach(s => {
              const id = s.tracks?.artist_id;
              if (!id) return;
              counts[id] = (counts[id] || 0) + 1;
              meta[id]   = s.tracks?.artists;
            });
            const topId = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0];
            if (topId) topArtist = meta[topId];
          }
        } catch {}

        setStats({
          likes:           likesCount    || 0,
          recentTrack:     recentData?.[0]?.tracks
            ? { ...recentData[0].tracks, artist_name: recentData[0].tracks.artists?.artist_name }
            : null,
          playlists:       playlistCount || 0,
          following:       followCount   || 0,
          downloads:       dlCount       || 0,
          totalStreams:    streamCount   || 0,
          topArtist,
          monthlyDownloads: monthlyDlCount || 0,
        });
      } catch (err) { console.error('Library stats error:', err); }
    };
    load();
  }, [user]);

  const isPro          = listenerTierSlug === 'pro' || listenerTierSlug === 'premium';
  const freeQuota      = 3;
  const downloadsLeft  = Math.max(0, freeQuota - stats.monthlyDownloads);
  const quotaPct       = Math.min(100, Math.round((stats.monthlyDownloads / freeQuota) * 100));

  const items = [
    { icon: Heart,     label: 'Liked Songs',     path: '/library/likes',     iconColor: 'text-red-400/70',    count: stats.likes,     accent: 'bg-red-500/10' },
    { icon: Clock,     label: 'Recently Played', path: '/library/recent',    iconColor: 'text-cyan-400/70',   count: null,            accent: 'bg-cyan-500/10', sub: stats.recentTrack?.title },
    { icon: Download,  label: 'Downloads',       path: '/library/downloads', iconColor: 'text-green-400/70',  count: stats.downloads, accent: 'bg-green-500/10' },
    { icon: ListMusic, label: 'Playlists',        path: '/library/playlists', iconColor: 'text-purple-400/70', count: stats.playlists, accent: 'bg-purple-500/10' },
    { icon: Users,     label: 'Following',        path: '/library/following', iconColor: 'text-blue-400/70',   count: stats.following, accent: 'bg-blue-500/10' },
  ];

  return (
    <div className="pb-4 px-4 md:px-0 max-w-2xl mx-auto">
      <Helmet>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <title>Library · Feelz Machine</title>
        <meta name="description" content="Your music library — liked songs, downloads, playlists and artists you follow." />
        <link rel="canonical" href="https://www.feelzmachine.com/library" />
      </Helmet>

      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl md:relative md:top-auto md:bg-transparent pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04] md:border-none mb-5">
        <h1 className="text-2xl font-bold text-white">Your Library</h1>
      </div>

      {/* ── Listener stats snapshot ── */}
      {!isArtist && stats.totalStreams > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] text-center">
            <p className="text-lg font-black text-white">{stats.totalStreams.toLocaleString()}</p>
            <p className="text-[10px] text-white/30 mt-0.5">Streams</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] text-center">
            <p className="text-lg font-black text-white">{stats.following}</p>
            <p className="text-[10px] text-white/30 mt-0.5">Following</p>
          </div>
          <button
            onClick={() => navigate('/listener/stats')}
            className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] text-center hover:bg-white/[0.06] transition active:scale-95"
          >
            {stats.topArtist ? (
              <>
                <p className="text-[10px] font-bold text-white truncate">{stats.topArtist.artist_name}</p>
                <p className="text-[10px] text-white/30 mt-0.5">Top artist →</p>
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4 text-purple-400/70 mx-auto mb-0.5" />
                <p className="text-[10px] text-white/30">Stats →</p>
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Download quota bar (listener only) ── */}
      {!isArtist && (
        <div className={`rounded-xl p-3.5 mb-4 border ${
          isPro ? 'bg-white/[0.02] border-white/[0.05]' : 'bg-purple-500/5 border-purple-500/15'
        }`}>
          {isPro ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Download className="w-3.5 h-3.5 text-green-400" />
                  <p className="text-xs font-semibold text-white">Monthly Downloads</p>
                </div>
                <p className="text-xs text-white/40">{stats.monthlyDownloads} / {freeQuota} used</p>
              </div>
              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${quotaPct >= 100 ? 'bg-red-400' : quotaPct >= 66 ? 'bg-yellow-400' : 'bg-green-400'}`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
              <p className="text-[10px] text-white/20 mt-1.5">
                {downloadsLeft > 0 ? `${downloadsLeft} free download${downloadsLeft !== 1 ? 's' : ''} left this month` : 'Quota reached — resets 1st of next month'}
              </p>
            </div>
          ) : (
            <button
              onClick={() => navigate('/listener/upgrade')}
              className="w-full flex items-center space-x-3 text-left active:scale-[0.98] transition"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">Get Fan Pro</p>
                <p className="text-[10px] text-white/35 mt-0.5">Themes, deep stats, 3 free downloads/month & fan badge</p>
              </div>
              <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded-lg flex-shrink-0">$2.99/mo</span>
            </button>
          )}
        </div>
      )}

      {/* ── Navigation items ── */}
      <div className="space-y-1">
        {items.map(({ icon: Icon, label, path, iconColor, accent, count, sub }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="w-full flex items-center space-x-4 p-3.5 rounded-xl hover:bg-white/[0.04] active:bg-white/[0.06] transition group"
          >
            <div className={`w-11 h-11 rounded-xl ${accent || 'bg-white/[0.06]'} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <span className="text-sm font-medium text-white block">{label}</span>
              {sub && <span className="text-xs text-white/30 truncate block mt-0.5">{sub}</span>}
            </div>
            {count != null && count > 0 && (
              <span className="text-xs text-white/25 font-medium mr-1 flex-shrink-0">{count}</span>
            )}
            <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/30 transition flex-shrink-0" />
          </button>
        ))}

        {/* Stats link */}
        {!isArtist && (
          <button
            onClick={() => navigate('/listener/stats')}
            className="w-full flex items-center space-x-4 p-3.5 rounded-xl hover:bg-white/[0.04] active:bg-white/[0.06] transition group"
          >
            <div className="w-11 h-11 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-5 h-5 text-purple-400/70" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <span className="text-sm font-medium text-white block">Your Stats</span>
              <span className="text-xs text-white/30 block mt-0.5">Listening history & insights</span>
            </div>
            <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/30 transition flex-shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
}