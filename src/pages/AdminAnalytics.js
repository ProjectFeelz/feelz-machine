import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3, ChevronLeft, Loader, Music, Users, Mic2,
  TrendingUp, Play, Heart, MessageCircle, Upload, Calendar, Download
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, subtext, color }) {
  return (
    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[11px] text-white/30 mt-0.5">{label}</p>
      {subtext && <p className="text-[10px] text-white/20 mt-1">{subtext}</p>}
    </div>
  );
}

function TimelineItem({ label, count, maxCount }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center space-x-3">
      <span className="text-[11px] text-white/30 w-16 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-6 bg-white/[0.03] rounded-full overflow-hidden">
        <div
          className="h-full bg-white/[0.12] rounded-full transition-all duration-500"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="text-[11px] text-white/40 w-8 flex-shrink-0">{count}</span>
    </div>
  );
}

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [signupTimeline, setSignupTimeline] = useState([]);
  const [trackTimeline, setTrackTimeline] = useState([]);
  const [topArtists, setTopArtists] = useState([]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      // Counts
      const [
        { count: artistCount },
        { count: trackCount },
        { count: publishedCount },
        { count: collabCount },
        { count: downloadCount },
      ] = await Promise.all([
        supabase.from('artists').select('*', { count: 'exact', head: true }),
        supabase.from('tracks').select('*', { count: 'exact', head: true }),
        supabase.from('tracks').select('*', { count: 'exact', head: true }).eq('is_published', true),
        supabase.from('collaborations').select('*', { count: 'exact', head: true }),
        supabase.from('downloads').select('*', { count: 'exact', head: true }),
      ]);
      // Sum streams from tracks
      let totalStreams = 0;
      try {
        const { data: streamData } = await supabase.from('tracks').select('stream_count').eq('is_published', true);
        totalStreams = (streamData || []).reduce((sum, t) => sum + (t.stream_count || 0), 0);
      } catch {}

      // Optional counts (tables might not exist)
      let followCount = 0;
      let likeCount = 0;
      try {
        const { count: fc } = await supabase.from('follows').select('*', { count: 'exact', head: true });
        followCount = fc || 0;
      } catch {}
      try {
        const { count: lc } = await supabase.from('likes').select('*', { count: 'exact', head: true });
        likeCount = lc || 0;
      } catch {}

      setStats({
        artists: artistCount || 0,
        tracks: trackCount || 0,
        published: publishedCount || 0,
        collabs: collabCount || 0,
        follows: followCount,
        likes: likeCount,
        downloads: downloadCount || 0,
        streams: totalStreams,
      });

      // Signup timeline (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const { data: recentArtists } = await supabase
        .from('artists')
        .select('created_at')
        .gte('created_at', sevenDaysAgo.toISOString());

      const dayMap = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString('en-US', { weekday: 'short' });
        dayMap[key] = 0;
      }
      (recentArtists || []).forEach(a => {
        const key = new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'short' });
        if (dayMap[key] !== undefined) dayMap[key]++;
      });
      setSignupTimeline(Object.entries(dayMap).map(([label, count]) => ({ label, count })));

      // Track upload timeline (last 7 days)
      const { data: recentTracks } = await supabase
        .from('tracks')
        .select('created_at')
        .gte('created_at', sevenDaysAgo.toISOString());

      const trackDayMap = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString('en-US', { weekday: 'short' });
        trackDayMap[key] = 0;
      }
      (recentTracks || []).forEach(t => {
        const key = new Date(t.created_at).toLocaleDateString('en-US', { weekday: 'short' });
        if (trackDayMap[key] !== undefined) trackDayMap[key]++;
      });
      setTrackTimeline(Object.entries(trackDayMap).map(([label, count]) => ({ label, count })));

      // Top artists by track count
      const { data: allTracks } = await supabase.from('tracks').select('artist_id');
      const artistTrackMap = {};
      (allTracks || []).forEach(t => {
        artistTrackMap[t.artist_id] = (artistTrackMap[t.artist_id] || 0) + 1;
      });
      const topIds = Object.entries(artistTrackMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (topIds.length > 0) {
        const { data: topArtistData } = await supabase
          .from('artists')
          .select('id, artist_name')
          .in('id', topIds.map(t => t[0]));

        const nameMap = {};
        (topArtistData || []).forEach(a => { nameMap[a.id] = a.artist_name; });
        setTopArtists(topIds.map(([id, count]) => ({
          name: nameMap[id] || 'Unknown',
          tracks: count,
        })));
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) { navigate('/hub'); return; }
    fetchAnalytics();
  }, [isAdmin, navigate, fetchAnalytics]);

  if (!isAdmin) return null;

  const maxSignup = Math.max(...signupTimeline.map(s => s.count), 1);
  const maxTrack = Math.max(...trackTimeline.map(t => t.count), 1);

  return (
    <div className="pt-14 md:pt-0 pb-32 px-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/hub')} className="p-2 -ml-2 hover:bg-white/[0.05] rounded-lg transition">
          <ChevronLeft className="w-5 h-5 text-white/40" />
        </button>
        <BarChart3 className="w-6 h-6 text-blue-400/70" />
        <h1 className="text-xl font-bold text-white">Platform Analytics</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader className="w-5 h-5 animate-spin text-white/20" />
        </div>
      ) : (
        <>
          {/* Overview Stats */}
          <div className="grid grid-cols-2 gap-2 mb-8">
            <StatCard icon={Mic2} label="Total Artists" value={stats.artists} color="bg-purple-500/20" />
            <StatCard icon={Music} label="Total Tracks" value={stats.tracks} subtext={`${stats.published} published`} color="bg-green-500/20" />
            <StatCard icon={Users} label="Follows" value={stats.follows} color="bg-blue-500/20" />
            <StatCard icon={Heart} label="Likes" value={stats.likes} color="bg-red-500/20" />
            <StatCard icon={MessageCircle} label="Collaborations" value={stats.collabs} color="bg-cyan-500/20" />
            <StatCard icon={TrendingUp} label="Engagement" value={stats.follows + stats.likes} subtext="Total interactions" color="bg-orange-500/20" />
          </div>

          {/* Artist Signups - Last 7 Days */}
          <div className="mb-8">
            <div className="flex items-center space-x-2 mb-4">
              <Calendar className="w-4 h-4 text-white/30" />
              <h2 className="text-xs uppercase tracking-wider text-white/30 font-semibold">New Artists (7 Days)</h2>
            </div>
            <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04] space-y-2">
              {signupTimeline.map(s => (
                <TimelineItem key={s.label} label={s.label} count={s.count} maxCount={maxSignup} />
              ))}
            </div>
          </div>

          {/* Track Uploads - Last 7 Days */}
          <div className="mb-8">
            <div className="flex items-center space-x-2 mb-4">
              <Upload className="w-4 h-4 text-white/30" />
              <h2 className="text-xs uppercase tracking-wider text-white/30 font-semibold">Track Uploads (7 Days)</h2>
            </div>
            <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04] space-y-2">
              {trackTimeline.map(t => (
                <TimelineItem key={t.label} label={t.label} count={t.count} maxCount={maxTrack} />
              ))}
            </div>
          </div>

          {/* Top Artists */}
          {topArtists.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <TrendingUp className="w-4 h-4 text-white/30" />
                <h2 className="text-xs uppercase tracking-wider text-white/30 font-semibold">Top Artists by Tracks</h2>
              </div>
              <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
                {topArtists.map((a, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-white/[0.03] last:border-0">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-bold text-white/20 w-5">{i + 1}</span>
                      <span className="text-sm text-white">{a.name}</span>
                    </div>
                    <span className="text-xs text-white/30">{a.tracks} tracks</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}



