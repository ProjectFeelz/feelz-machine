import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { 
  TrendingUp, 
  Download, 
  Play, 
  Users, 
  Music,
  BarChart3,
  Loader,
  FileDown,
  Upload,
  ChevronLeft
} from 'lucide-react';
import AdminUploadPanel from './AdminUploadPanel';

function AdminPanel({ user, profile }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalPlays: 0,
    totalDownloads: 0,
    totalUsers: 0,
    totalSamples: 0
  });
  const [topPacks, setTopPacks] = useState([]);
  const [topGenres, setTopGenres] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('upload');
  const [adminLevel, setAdminLevel] = useState(3);
  const hasInitializedTab = useRef(false); // ✅ Prevent tab reset on refresh

  // ✅ FIX: Wrap fetchAnalytics in useCallback to prevent recreation
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);

    try {
      const { count: playsCount } = await supabase
        .from('sample_interactions')
        .select('*', { count: 'exact', head: true })
        .eq('interaction_type', 'play');

      const { count: downloadsCount } = await supabase
        .from('user_downloads')
        .select('*', { count: 'exact', head: true });

      const { data: profilesData, count: usersCount, error: usersError } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true });
      
      if (usersError) {
        console.error('❌ User count error:', usersError);
      } else {
        console.log('✅ User count loaded:', usersCount);
      }

      const { count: samplesCount } = await supabase
        .from('samples')
        .select('*', { count: 'exact', head: true });

      setStats({
        totalPlays: playsCount || 0,
        totalDownloads: downloadsCount || 0,
        totalUsers: usersCount || 0,
        totalSamples: samplesCount || 0
      });

      console.log('📊 Stats updated:', {
        plays: playsCount || 0,
        downloads: downloadsCount || 0,
        users: usersCount || 0,
        samples: samplesCount || 0
      });

      const { data: plays } = await supabase
        .from('sample_interactions')
        .select('sample_id, samples(name, artist, thumbnail_url)')
        .eq('interaction_type', 'play');

      const packCounts = {};
      plays?.forEach(play => {
        const id = play.sample_id;
        if (!packCounts[id]) {
          packCounts[id] = {
            sample_id: id,
            count: 0,
            name: play.samples?.name,
            artist: play.samples?.artist,
            thumbnail_url: play.samples?.thumbnail_url
          };
        }
        packCounts[id].count++;
      });

      const sortedPacks = Object.values(packCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setTopPacks(sortedPacks);

      const { data: genreData } = await supabase
        .from('sample_interactions')
        .select('genre');

      const genreCounts = {};
      genreData?.forEach(item => {
        if (item.genre) {
          genreCounts[item.genre] = (genreCounts[item.genre] || 0) + 1;
        }
      });

      const sortedGenres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setTopGenres(sortedGenres);

      const { data: activity } = await supabase
        .from('sample_interactions')
        .select('*, samples(name)')
        .order('created_at', { ascending: false })
        .limit(10);

      if (activity && activity.length > 0) {
        const userIds = [...new Set(activity.map(a => a.user_id))];
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, name')
          .in('user_id', userIds);

        const profileMap = {};
        profiles?.forEach(p => {
          profileMap[p.user_id] = p;
        });

        const enrichedActivity = activity.map(a => ({
          ...a,
          user_profiles: profileMap[a.user_id] || { name: 'Unknown User' }
        }));

        setRecentActivity(enrichedActivity);
      } else {
        setRecentActivity([]);
      }

    } catch (error) {
      console.error('Error fetching analytics:', error);
    }

    setLoading(false);
  }, []); // Empty deps - never recreated

  // ✅ FIX: Only set activeTab on initial load, not on every profile change
  useEffect(() => {
    const checkAdminLevel = async () => {
      try {
        const { data, error } = await supabase
          .from('admins')
          .select('level')
          .eq('user_id', user.id)
          .single();

        if (!error && data) {
          setAdminLevel(data.level || 3);
          
          // ✅ Only set tab on first load
          if (!hasInitializedTab.current) {
            if (data.level === 3) {
              setActiveTab('analytics');
            } else {
              setActiveTab('upload');
            }
            hasInitializedTab.current = true;
          }
          
          setLoading(false);
        } else {
          if (!hasInitializedTab.current) {
            setActiveTab('analytics');
            hasInitializedTab.current = true;
          }
        }
      } catch (error) {
        console.error('Error checking admin level:', error);
        if (!hasInitializedTab.current) {
          setActiveTab('analytics');
          hasInitializedTab.current = true;
        }
      }
    };

    if (profile?.is_admin) {
      checkAdminLevel();
    }
  }, [profile, user.id]);

  // ✅ FIX: Fetch analytics only when tab changes to analytics
  useEffect(() => {
    if (activeTab === 'analytics' && adminLevel === 3) {
      fetchAnalytics();
    }
  }, [activeTab, adminLevel, fetchAnalytics]);

  const exportSubscribersCSV = async () => {
    setExporting(true);

    try {
      const { data: subscribers } = await supabase
        .from('user_profiles')
        .select('user_id, name, email, created_at')
        .order('created_at', { ascending: false });

      if (!subscribers || subscribers.length === 0) {
        alert('No subscribers to export');
        setExporting(false);
        return;
      }

      const headers = ['Name', 'Email', 'User ID', 'Joined Date'];
      const rows = subscribers.map(sub => [
        sub.name || 'N/A',
        sub.email || 'N/A',
        sub.user_id,
        new Date(sub.created_at).toLocaleDateString()
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `feelz-machine-subscribers-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error exporting subscribers:', error);
      alert('Failed to export subscribers: ' + error.message);
    }

    setExporting(false);
  };

  const exportUsageDataCSV = async () => {
    setExporting(true);

    try {
      const { data: interactions } = await supabase
        .from('sample_interactions')
        .select('*, samples(name, artist, genre)')
        .order('created_at', { ascending: false });

      const { data: downloads } = await supabase
        .from('user_downloads')
        .select('*')
        .order('created_at', { ascending: false });

      if ((!interactions || interactions.length === 0) && (!downloads || downloads.length === 0)) {
        alert('No usage data to export');
        setExporting(false);
        return;
      }

      let downloadSampleMap = {};
      if (downloads && downloads.length > 0) {
        const sampleIds = [...new Set(downloads.map(d => d.sample_id))];
        const { data: samples } = await supabase
          .from('samples')
          .select('id, name, artist')
          .in('id', sampleIds);
        
        samples?.forEach(s => {
          downloadSampleMap[s.id] = s;
        });
      }

      const allUserIds = [
        ...(interactions?.map(i => i.user_id) || []),
        ...(downloads?.map(d => d.user_id) || [])
      ];
      const uniqueUserIds = [...new Set(allUserIds)];

      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, name')
        .in('user_id', uniqueUserIds);

      const nameMap = {};
      profiles?.forEach(p => {
        nameMap[p.user_id] = p.name;
      });

      const usageData = [];

      interactions?.forEach(item => {
        usageData.push({
          user_name: nameMap[item.user_id] || 'Unknown',
          user_id: item.user_id,
          action: 'Play',
          sample_name: item.samples?.name || 'N/A',
          artist: item.samples?.artist || 'N/A',
          genre: item.genre || 'N/A',
          bpm: item.bpm || 'N/A',
          key: item.key || 'N/A',
          mood: item.mood || 'N/A',
          date: new Date(item.created_at).toLocaleString()
        });
      });

      downloads?.forEach(item => {
        const sample = downloadSampleMap[item.sample_id];
        usageData.push({
          user_name: nameMap[item.user_id] || 'Unknown',
          user_id: item.user_id,
          action: `Download (${item.download_type})`,
          sample_name: sample?.name || 'N/A',
          artist: sample?.artist || 'N/A',
          genre: 'N/A',
          bpm: 'N/A',
          key: 'N/A',
          mood: 'N/A',
          date: new Date(item.created_at).toLocaleString()
        });
      });

      usageData.sort((a, b) => new Date(b.date) - new Date(a.date));

      const headers = ['User Name', 'User ID', 'Action', 'Sample Pack', 'Artist', 'Genre', 'BPM', 'Key', 'Mood', 'Date'];
      const rows = usageData.map(item => [
        item.user_name,
        item.user_id,
        item.action,
        item.sample_name,
        item.artist,
        item.genre,
        item.bpm,
        item.key,
        item.mood,
        item.date
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `feelz-machine-usage-data-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error exporting usage data:', error);
      alert('Failed to export usage data: ' + error.message);
    }

    setExporting(false);
  };

  if (!profile?.is_admin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Access Denied</h1>
          <p className="text-cyan-300">You don't have admin privileges.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-cyan-300 hover:text-cyan-200 mb-6 transition"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back to Home</span>
        </button>

        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-2">
            {adminLevel === 3 ? 'Admin Panel' : 'Editor Dashboard'}
          </h1>
          <p className="text-cyan-300 text-sm mb-6">
            {adminLevel === 3 ? 'Full Admin Access' : 'Upload & Edit Access'}
          </p>

          <div className="flex space-x-2 mb-6">
            {adminLevel === 3 && (
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-6 py-3 rounded-lg transition font-semibold flex items-center space-x-2 ${
                  activeTab === 'analytics'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : 'bg-white/5 text-cyan-300 hover:bg-white/10'
                }`}
              >
                <BarChart3 className="w-5 h-5" />
                <span>Analytics</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-6 py-3 rounded-lg transition font-semibold flex items-center space-x-2 ${
                activeTab === 'upload'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                  : 'bg-white/5 text-cyan-300 hover:bg-white/10'
              }`}
            >
              <Upload className="w-5 h-5" />
              <span>Upload & Manage</span>
            </button>
          </div>

          {activeTab === 'analytics' && adminLevel === 3 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={exportSubscribersCSV}
                disabled={exporting}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-semibold transition flex items-center justify-center space-x-2"
              >
                {exporting ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                <span>Export Subscribers</span>
              </button>

              <button
                onClick={exportUsageDataCSV}
                disabled={exporting}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 rounded-lg font-semibold transition flex items-center justify-center space-x-2"
              >
                {exporting ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                <span>Export Usage Data</span>
              </button>
            </div>
          )}
        </div>

        {activeTab === 'analytics' && adminLevel === 3 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
                <div className="flex items-center justify-between mb-4">
                  <Play className="w-8 h-8 text-cyan-400" />
                  <span className="text-3xl font-bold">{stats.totalPlays}</span>
                </div>
                <p className="text-cyan-300 text-sm">Total Plays</p>
              </div>

              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
                <div className="flex items-center justify-between mb-4">
                  <Download className="w-8 h-8 text-blue-400" />
                  <span className="text-3xl font-bold">{stats.totalDownloads}</span>
                </div>
                <p className="text-cyan-300 text-sm">Total Downloads</p>
              </div>

              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
                <div className="flex items-center justify-between mb-4">
                  <Users className="w-8 h-8 text-green-400" />
                  <span className="text-3xl font-bold">{stats.totalUsers}</span>
                </div>
                <p className="text-cyan-300 text-sm">Total Users</p>
              </div>

              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
                <div className="flex items-center justify-between mb-4">
                  <Music className="w-8 h-8 text-purple-400" />
                  <span className="text-3xl font-bold">{stats.totalSamples}</span>
                </div>
                <p className="text-cyan-300 text-sm">Sample Packs</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
                <div className="flex items-center space-x-2 mb-4">
                  <TrendingUp className="w-6 h-6 text-cyan-400" />
                  <h2 className="text-xl font-bold">Top 5 Sample Packs</h2>
                </div>
                <div className="space-y-3">
                  {topPacks.map((pack, index) => (
                    <div key={pack.sample_id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl font-bold text-cyan-400">#{index + 1}</span>
                        {pack.thumbnail_url && (
                          <img src={pack.thumbnail_url} alt={pack.name} className="w-10 h-10 rounded object-cover" />
                        )}
                        <div>
                          <p className="font-semibold text-white">{pack.name}</p>
                          <p className="text-xs text-cyan-400">{pack.artist}</p>
                        </div>
                      </div>
                      <span className="text-cyan-300 font-semibold">{pack.count} plays</span>
                    </div>
                  ))}
                  {topPacks.length === 0 && (
                    <p className="text-center text-cyan-400 py-4">No data yet</p>
                  )}
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
                <div className="flex items-center space-x-2 mb-4">
                  <BarChart3 className="w-6 h-6 text-cyan-400" />
                  <h2 className="text-xl font-bold">Top Genres</h2>
                </div>
                <div className="space-y-4">
                  {topGenres.map((genre) => (
                    <div key={genre.genre}>
                      <div className="flex justify-between mb-2">
                        <span className="text-white font-semibold">{genre.genre}</span>
                        <span className="text-cyan-400">{genre.count} plays</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full"
                          style={{ width: `${(genre.count / topGenres[0]?.count) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {topGenres.length === 0 && (
                    <p className="text-center text-cyan-400 py-4">No data yet</p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-cyan-400/20">
              <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
              <div className="space-y-2">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg text-sm">
                    <div className="flex items-center space-x-3">
                      {activity.interaction_type === 'play' ? (
                        <Play className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Download className="w-4 h-4 text-blue-400" />
                      )}
                      <span className="text-white">
                        <span className="font-semibold">{activity.user_profiles?.name || 'User'}</span>
                        {' '}{activity.interaction_type === 'play' ? 'played' : 'downloaded'}
                        {' '}<span className="text-cyan-400">{activity.samples?.name}</span>
                      </span>
                    </div>
                    <span className="text-cyan-500 text-xs">
                      {new Date(activity.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
                {recentActivity.length === 0 && (
                  <p className="text-center text-cyan-400 py-4">No activity yet</p>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'upload' && (
          <AdminUploadPanel user={user} adminLevel={adminLevel} />
        )}
      </div>
    </div>
  );
}

export default AdminPanel;