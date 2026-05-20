import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3, Download, Music, Loader,
  Upload, ChevronLeft, Headphones, Heart, TrendingUp, Users, Trophy, Zap
} from 'lucide-react';
import TrackUploadPanel from './TrackUploadPanel';
import CollabRequests, { CollabBadge } from '../components/CollabRequests';
import TierGate, { UploadGate, TierBadge } from '../components/TierGate';
import { VoiceMemoCard, VoiceMemoUpload } from '../components/VoiceMemo';

function ContactExportButton({ artist }) {
  const [exporting, setExporting] = React.useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/export-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: artist.id, user_id: session?.user?.id }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); setExporting(false); return; }
      if (data.count === 0) { alert('No follower emails found yet'); setExporting(false); return; }
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${artist.artist_name}_contacts.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
    setExporting(false);
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="flex items-center space-x-2 px-4 py-2.5 bg-white/[0.04] rounded-xl text-sm text-white/60 hover:bg-white/[0.08] transition border border-white/[0.06] disabled:opacity-40"
    >
      <Download className="w-3.5 h-3.5" />
      <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
    </button>
  );
}

function MemoTabPanel({ artist, memos, fetchMemos, deleteMemo }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white mb-1">Voice Memos</h2>
        <p className="text-sm text-white/40 mb-4">
          Record short audio updates for your followers — thoughts, teasers, behind-the-scenes.
          They'll appear on your artist profile.
        </p>
        <VoiceMemoUpload artistId={artist?.id} onUploaded={fetchMemos} />
      </div>

      {memos.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold mb-3">Your Memos</p>
          <div className="space-y-2">
            {memos.map(memo => (
              <VoiceMemoCard
                key={memo.id}
                memo={memo}
                canDelete
                onDelete={deleteMemo}
              />
            ))}
          </div>
        </div>
      )}

      {memos.length === 0 && (
        <div className="text-center py-10 text-white/20">
          <p className="text-sm">No memos yet. Record your first one above.</p>
        </div>
      )}
    </div>
  );
}

export default function ArtistDashboard() {
  const navigate = useNavigate();
  const { artist, isMaster } = useAuth();

  const [activeTab, setActiveTab] = useState(
    new URLSearchParams(window.location.search).get('tab') || 'analytics'
  );
  const [wheelChallenge, setWheelChallenge] = useState(null);
  const [stats, setStats] = useState({
    streams: 0, downloads: 0, followers: 0, tracks: 0, likes: 0,
  });
  const [topTracks, setTopTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [memos, setMemos] = useState([]);

  const fetchMemos = useCallback(async () => {
    if (!artist?.id) return;
    const { data } = await supabase
      .from('artist_voice_memos')
      .select('*')
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setMemos(data || []);
  }, [artist?.id]);

  const deleteMemo = async (memoId) => {
    await supabase.from('artist_voice_memos').delete().eq('id', memoId);
    setMemos(prev => prev.filter(m => m.id !== memoId));
  };

  // ── Analytics ────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    if (!artist) return;
    setLoading(true);
    try {
      const { data: artistTracks } = await supabase
        .from('tracks').select('id').eq('artist_id', artist.id);
      const trackIds = (artistTracks || []).map(t => t.id);

      let streamCount = 0, dlCount = 0;
      if (trackIds.length > 0) {
        const { data: streamData } = await supabase
          .from('tracks').select('stream_count, download_count').eq('artist_id', artist.id);
        streamCount = (streamData || []).reduce((s, t) => s + (t.stream_count || 0), 0);
        dlCount     = (streamData || []).reduce((s, t) => s + (t.download_count || 0), 0);
      }

      const { count: followCount } = await supabase
        .from('follows').select('*', { count: 'exact', head: true }).eq('artist_id', artist.id);

      let likeCount = 0;
      if (trackIds.length > 0) {
        const { count: lc } = await supabase
          .from('track_likes').select('*', { count: 'exact', head: true }).in('track_id', trackIds);
        likeCount = lc || 0;
      }

      setStats({
        streams: streamCount, downloads: dlCount,
        followers: followCount || 0, tracks: trackIds.length, likes: likeCount,
      });

      const { data: tracks } = await supabase
        .from('tracks')
        .select('id, title, cover_artwork_url, stream_count, download_count')
        .eq('artist_id', artist.id)
        .order('stream_count', { ascending: false })
        .limit(5);
      setTopTracks(tracks || []);
    } catch (err) {
      console.error('Stats error:', err);
    }
    setLoading(false);
  }, [artist]);

  useEffect(() => {
    if (activeTab === 'analytics' && artist) fetchStats();
    if (activeTab === 'memos' && artist) fetchMemos();
  }, [activeTab, artist, fetchStats, fetchMemos]);

  useEffect(() => {
    if (!artist) return;
    supabase.from('wheel_challenges')
      .select('id, prompt, mode, competition_id, competitions(id, status, entries_close_at, voting_close_at, max_votes_per_user)')
      .eq('is_current', true).maybeSingle()
      .then(({ data }) => setWheelChallenge(data || null));
  }, [artist?.id]); // eslint-disable-line

  // ── No artist guard ───────────────────────────────────────────────────────────
  if (!artist) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center">
          <Music className="w-12 h-12 mx-auto text-white/20 mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Artist Dashboard</h2>
          <p className="text-sm text-white/40 mb-6">This area is for artists. Browse music or check your library instead.</p>
          <div className="flex flex-col space-y-3 items-center">
            <button onClick={() => navigate('/')}
              className="px-6 py-2.5 bg-white text-black rounded-xl text-sm font-semibold transition hover:bg-white/90">
              Go Home
            </button>
            <button onClick={() => navigate('/library')}
              className="px-6 py-2.5 bg-white/[0.06] text-white/60 rounded-xl text-sm transition hover:bg-white/[0.1]">
              Your Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    { icon: Headphones, label: 'Total Streams', value: stats.streams,   color: 'text-purple-400' },
    { icon: Download,   label: 'Downloads',     value: stats.downloads, color: 'text-blue-400' },
    { icon: Users,      label: 'Followers',     value: stats.followers, color: 'text-pink-400' },
    { icon: Music,      label: 'Tracks',        value: stats.tracks,    color: 'text-green-400' },
    { icon: Heart,      label: 'Likes',         value: stats.likes,     color: 'text-red-400' },
  ];

  const tabs = [
    { key: 'upload',     label: 'Upload',     icon: Upload },
    { key: 'collabs',    label: 'Collabs',    icon: Users, hasBadge: true },
    { key: 'analytics',  label: 'Analytics',  icon: BarChart3 },
    // Memos tab hidden from nav bar — accessible via Profile page Voice Memo button (?tab=memos)
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-8 pb-32">

        {/* ── Analytics Tab ── */}
        {activeTab === 'analytics' && (
          <TierGate feature="analytics">
            <style>{`.recharts-wrapper { overflow: visible !important; } .recharts-surface { overflow: visible !important; }`}</style>
            <div className="space-y-6">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader className="w-6 h-6 animate-spin text-white/30" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {statCards.map(({ icon: Icon, label, value, color }) => (
                      <div key={label} className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06]">
                        <div className="flex items-center justify-between mb-3">
                          <Icon className={`w-6 h-6 ${color}`} />
                          <span className="text-3xl font-bold text-white">{value.toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-white/40">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Contact Export — Premium only */}
                  <TierGate feature="advanced_analytics" inline>
                    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">Follower Contacts</p>
                          <p className="text-xs text-white/30 mt-0.5">Export your followers' names and emails</p>
                        </div>
                        <ContactExportButton artist={artist} />
                      </div>
                    </div>
                  </TierGate>

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
                      {topTracks.length === 0 && (
                        <p className="text-center text-white/20 text-sm py-6">No tracks yet</p>
                      )}
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