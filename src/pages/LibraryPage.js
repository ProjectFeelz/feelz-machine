import { Helmet } from 'react-helmet-async';
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Heart, Download, ListMusic, Users, Clock, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LibraryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const items = [
    { icon: Heart,     label: 'Liked Songs',      path: '/library/likes',     iconColor: 'text-white/60' },
    { icon: Clock,     label: 'Recently Played',   path: '/library/recent',    iconColor: 'text-white/60' },
    { icon: Download,  label: 'Downloads',          path: '/library/downloads', iconColor: 'text-white/60' },
    { icon: ListMusic, label: 'Playlists',           path: '/library/playlists', iconColor: 'text-white/60' },
    { icon: Users,     label: 'Following',           path: '/library/following', iconColor: 'text-white/60' },
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
        {items.map(({ icon: Icon, label, path, iconColor }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="w-full flex items-center space-x-4 p-3.5 rounded-xl hover:bg-white/[0.04] active:bg-white/[0.06] transition group"
          >
            <div className="w-11 h-11 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            <span className="flex-1 text-sm font-medium text-white text-left">{label}</span>
            <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/30 transition flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
