import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3, Download, Music, Loader,
  Upload, ChevronLeft, Headphones, Heart, TrendingUp, Users
} from 'lucide-react';
import TrackUploadPanel from './TrackUploadPanel';
import CollabRequests, { CollabBadge } from '../components/CollabRequests';
import TierGate, { UploadGate, TierBadge } from '../components/TierGate';

export default function ArtistDashboard() {
  const navigate = useNavigate();
  const { artist, isMaster } = useAuth();
  const [activeTab, setActiveTab] = useState(new URLSearchParams(window.location.search).get('tab') || 'analytics');
  const [stats, setStats] = useState({ streams: 0, downloads: 0, followers: 0, tracks: 0, likes: 0 });
  const [topTracks, setTopTracks] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!artist) return;
    setLoading(true);
    try {
      const { data: artistTracks } = await supabase.from('tracks').select('id').eq('artist_id', artist.id);
      const trackIds = (artistTracks || []).map(t => t.id);

      let streamCount = 0, dlCount = 0;
      if (trackIds.length > 0) {
        const { count: sc } = await supabase.from('streams').select('*', { count: 'exact', head: true }).in('track_id', trackIds);
        const { count: dc } = await supabase.from('downloads').select('*', { count: 'exact', head: true }).in('track_id', trackIds);
        streamCount = sc || 0;
        dlCount = dc || 0;
      }

      const { count: followCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('artist_id', artist.id);
      let likeCount = 0;
      if (trackIds.length > 0) {
        const { count: lc } = await supabase.from('track_likes').select('*', { count: 'exact', head: true }).in('track_id', trackIds);
        likeCount = lc || 0;
      }
      setStats({ streams: streamCount, downloads: dlCount, followers: followCount || 0, tracks: trackIds.length, likes: likeCount });

      const { data: tracks } = await supabase.from('tracks')
        .select('id, title, cover_artwork_url, stream_count, download_count')
        .eq('artist_id', artist.id).order('stream_count', { ascending: false }).limit(5);
      setTopTracks(tracks || []);
    } catch (err) { console.error('Stats error:', err); }
    setLoading(false);
  }, [artist]);

  useEffect(() => {
    if (activeTab === 'analytics' && artist) fetchStats();
  }, [activeTab, artist, fetchStats]);

  if (!artist) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center">
          <Music className="w-12 h-12 mx-auto text-white/20 mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No Artist Profile</h2>
          <p className="text-sm text-white/40">You need an artist profile to access the dashboard.</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { icon: Headphones, label: 'Total Streams', value: stats.streams, color: 'text-purple-400' },
    { icon: Download, label: 'Downloads', value: stats.downloads, color: 'text-blue-400' },
    { icon: Users, label: 'Followers', value: stats.followers, color: 'text-pink-400' },
    { icon: Music, label: 'Tracks', value: stats.tracks, color: 'text-green-400' },
    { icon: Heart, label: 'Likes', value: stats.likes, color: 'text-red-400' },
  ];

  const tabs = [
    { key: 'upload', label: 'Upload', icon: Upload },
    { key: 'collabs', label: 'Collabs', icon: Users, hasBadge: true },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-6 pb-32">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-6">
          <button onClick={() => navigate('/')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-white">Dashboard</h1>
              <TierBadge size="xs" />
            </div>
            <p className="text-xs text-white/40">{artist.artist_name} {isMaster ? '(Master)' : ''}</p>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex space-x-1 bg-white/[0.03] rounded-lg p-1 mb-6">
          {tabs.map(({ key, label, icon: Icon, hasBadge }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-md text-sm font-medium transition relative ${
                activeTab === key ? 'bg-white text-black' : 'text-white/50 hover:text-white/70'
              }`}>
              <div className="relative">
                <Icon className="w-4 h-4" />
                {hasBadge && activeTab !== key && <CollabBadge />}
              </div>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Upload Tab — wrapped with UploadGate for free tier limit */}
        {activeTab === 'upload' && (
          <UploadGate>
            <TrackUploadPanel />
          </UploadGate>
        )}

        {/* Collabs Tab — request inbox */}
        {activeTab === 'collabs' && <CollabRequests />}

        {/* Analytics Tab â€" locked behind Pro tier */}
        {activeTab === 'analytics' && (
          <TierGate feature="analytics">
            <style>{`.recharts-wrapper { overflow: visible !important; } .recharts-surface { overflow: visible !important; }`}</style>
            <div className="space-y-6">
              {loading ? (
                <div className="flex justify-center py-16"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {statCards.map(({ icon: Icon, label, value, color }) => (
                      <div key={label} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                        <div className="flex items-center justify-between mb-2">
                          <Icon className={`w-5 h-5 ${color}`} />
                          <span className="text-2xl font-bold text-white">{value.toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-white/40">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
                    <div className="flex items-center space-x-2 mb-4">
                      <TrendingUp className="w-5 h-5 text-white/40" />
                      <h3 className="text-base font-semibold text-white">Top Tracks</h3>
                    </div>
                    <div className="space-y-2">
                      {topTracks.map((track, i) => (
                        <div key={track.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white/[0.03] transition">
                          <span className="text-sm font-bold text-white/30 w-5 text-right">{i + 1}</span>
                          {track.cover_artwork_url ? (
                            <img src={track.cover_artwork_url} alt="" className="w-10 h-10 rounded-md object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-white/[0.06] flex items-center justify-center">
                              <Music className="w-4 h-4 text-white/20" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{track.title}</p>
                            <p className="text-xs text-white/30">{track.stream_count || 0} streams</p>
                          </div>
                        </div>
                      ))}
                      {topTracks.length === 0 && <p className="text-center text-white/20 text-sm py-6">No tracks yet</p>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </TierGate>
        )}
      </div>
    </div>
  );
}

