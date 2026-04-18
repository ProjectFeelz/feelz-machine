import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { Heart, Download, ListMusic, Users, Clock, ChevronRight, Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LibraryPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ likes: 0, recentTrack: null, playlists: 0, following: 0, downloads: 0 });

  useEffect(() => {
    if (!user) return;
    const fetchStats = async () => {
      try {
        const [
          { count: likesCount },
          { data: recentData },
          { count: playlistCount },
          { count: followCount },
          { count: dlCount },
        ] = await Promise.all([
          supabase.from('track_likes').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('streams')
            .select('tracks(id, title, cover_artwork_url, artist_name)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1),
          supabase.from('playlists').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
          supabase.from('track_downloads').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        ]);
        setStats({
          likes:       likesCount || 0,
          recentTrack: recentData?.[0]?.tracks || null,
          playlists:   playlistCount || 0,
          following:   followCount || 0,
          downloads:   dlCount || 0,
        });
      } catch (err) { console.error('Library stats error:', err); }
    };
    fetchStats();
  }, [user]);
  const navigate = useNavigate();

  const items = [
    { icon: Heart,     label: 'Liked Songs',    path: '/library/likes',     iconColor: 'text-red-400/70',    count: stats.likes,     accent: 'bg-red-500/10' },
    { icon: Clock,     label: 'Recently Played',path: '/library/recent',    iconColor: 'text-cyan-400/70',   count: null,            accent: 'bg-cyan-500/10', sub: stats.recentTrack?.title },
    { icon: Download,  label: 'Downloads',      path: '/library/downloads', iconColor: 'text-green-400/70',  count: stats.downloads, accent: 'bg-green-500/10' },
    { icon: ListMusic, label: 'Playlists',      path: '/library/playlists', iconColor: 'text-purple-400/70', count: stats.playlists, accent: 'bg-purple-500/10' },
    { icon: Users,     label: 'Following',      path: '/library/following', iconColor: 'text-blue-400/70',   count: stats.following, accent: 'bg-blue-500/10' },
  ];

  return (
    <div className="pt-12 md:pt-0 pb-4 px-6 md:px-0">
      <Helmet>
        <title>Library · Feelz Machine</title>
        <meta name="description" content="Your music library — liked songs, downloads, playlists and artists you follow." />
        <link rel="canonical" href="https://www.feelzmachine.com/library" />
        <meta property="og:title" content="Library · Feelz Machine" />
        <meta property="og:url" content="https://www.feelzmachine.com/library" />
      </Helmet>

      <h1 className="text-2xl font-bold text-white mb-6 sticky top-0 z-20 bg-black/90 backdrop-blur-sm md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-2 pb-2 -mx-6 px-6">
        Your Library
      </h1>

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
      </div>
    </div>
  );
}