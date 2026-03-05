import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Heart, Download, ListMusic, Users, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function LibraryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const items = [
    { icon: Heart, label: 'Liked Songs', path: '/library/likes', color: 'bg-gradient-to-br from-purple-600 to-blue-600' },
    { icon: Clock, label: 'Recently Played', path: '/library/recent', color: 'bg-gradient-to-br from-zinc-600 to-zinc-800' },
    { icon: Download, label: 'Downloads', path: '/library/downloads', color: 'bg-gradient-to-br from-green-600 to-emerald-600' },
    { icon: ListMusic, label: 'Playlists', path: '/library/playlists', color: 'bg-gradient-to-br from-orange-600 to-red-600' },
    { icon: Users, label: 'Following', path: '/library/following', color: 'bg-gradient-to-br from-cyan-600 to-blue-600' },
  ];

  return (
    <div className="pt-12 md:pt-0 pb-4 px-6 md:px-0">
      <h1 className="text-2xl font-bold text-white mb-6">Your Library</h1>
      <div className="space-y-2">
        {items.map(({ icon: Icon, label, path, color }) => (
          <button key={path} onClick={() => navigate(path)}
            className="w-full flex items-center space-x-4 p-3 rounded-lg hover:bg-white/[0.04] active:bg-white/[0.06] transition">
            <div className={`w-12 h-12 rounded-md ${color} flex items-center justify-center`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <span className="text-base font-medium text-white">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


