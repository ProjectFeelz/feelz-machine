import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { downloadTrack } from '../utils/downloadTrack';
import { Download, Play, Pause, Music, ArrowLeft, Loader, Check } from 'lucide-react';

export default function DownloadsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [downloadError, setDownloadError] = useState('');
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const [downloads, setDownloads]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [downloading, setDownloading] = useState(null); // track id being downloaded
  const [justDownloaded, setJustDownloaded] = useState(null); // for tick feedback

  useEffect(() => {
    if (user) fetchDownloads();
  }, [user]);

  const fetchDownloads = async () => {
    const { data } = await supabase
      .from('downloads')
      .select('*, track:tracks(id, title, slug, file_url, cover_artwork_url, duration, artist:artists(id, artist_name, slug))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setDownloads((data || []).filter(d => d.track));
    setLoading(false);
  };

  const handlePlay = (track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(track);
  };

  const handleDownload = async (track) => {
    if (downloading === track.id) return;
    setDownloading(track.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await downloadTrack(track.id, track.title, session?.access_token);
      // Show tick feedback briefly
      setJustDownloaded(track.id);
      setTimeout(() => setJustDownloaded(null), 2000);
    } catch (err) {
      if (err.message === 'fan_pro_required') {
        setDownloadError('Upgrade to Fan Pro to download tracks.');
      } else if (err.message === 'monthly_quota_exceeded') {
        setDownloadError('Monthly download quota reached. Resets on the 1st.');
      } else {
        console.error('Download error:', err);
      }
    }
    setDownloading(null);
  };

  return (
    <div className="pb-32 px-4 max-w-4xl">
      <div className="flex items-center space-x-3 mb-6 sticky top-0 z-20 bg-black/95 backdrop-blur-xl md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04] md:border-none">
        <button onClick={() => navigate('/library')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Downloads</h1>
          <p className="text-xs text-white/30">{downloads.length} tracks</p>
        </div>
      </div>

      {downloadError && (
        <div className="mb-4 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-between">
          <p className="text-xs text-purple-300">{downloadError}</p>
          <button
            onClick={() => navigate('/listener/upgrade')}
            className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded-lg ml-3 flex-shrink-0 hover:bg-purple-500/20 transition"
          >
            Upgrade
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader className="w-6 h-6 animate-spin text-white/30" />
        </div>
      ) : downloads.length === 0 ? (
        <div className="text-center py-20">
          <Download className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">No downloads yet</p>
          <p className="text-white/15 text-xs mt-1">Download tracks from any artist page</p>
        </div>
      ) : (
        <div className="space-y-1">
          {downloads.map(({ track, created_at }) => {
            const isActive   = currentTrack?.id === track.id;
            const isPlaying_ = isActive && isPlaying;
            const isDling    = downloading === track.id;
            const isDone     = justDownloaded === track.id;

            return (
              <div key={track.id}
                className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/[0.04] transition group">

                {/* Cover + play overlay */}
                <div className="relative w-12 h-12 flex-shrink-0">
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt=""
                        className="w-12 h-12 rounded-lg object-cover" />
                    : <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center">
                        <Music className="w-4 h-4 text-white/20" />
                      </div>}
                  <button onClick={() => handlePlay(track)}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition">
                    {isPlaying_
                      ? <Pause className="w-4 h-4 text-white" />
                      : <Play className="w-4 h-4 text-white" />}
                  </button>
                </div>

                {/* Track info */}
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => track.slug && navigate(`/track/${track.slug}`)}
                    className="text-sm font-medium truncate text-left block w-full hover:text-white/80 transition"
                    style={{ color: isActive ? '#4ade80' : 'white' }}
                  >
                    {track.title}
                  </button>
                  <button
                    onClick={() => track.artist?.slug && navigate(`/artist/${track.artist.slug}`)}
                    className="text-xs text-white/30 hover:text-white/50 transition text-left">
                    {track.artist?.artist_name}
                  </button>
                </div>

                {/* Downloaded badge + re-download button */}
                <div className="flex items-center space-x-2 flex-shrink-0">
                  {/* Small green downloaded pill */}
                  <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                    <Check className="w-2.5 h-2.5 text-green-400" />
                    <span className="text-[10px] text-green-400 font-medium">Owned</span>
                  </span>

                  {/* Re-download button */}
                  <button
                    onClick={() => handleDownload(track)}
                    disabled={isDling}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition disabled:opacity-40"
                    title="Download MP3"
                  >
                    {isDling
                      ? <Loader className="w-3.5 h-3.5 animate-spin text-white/30" />
                      : isDone
                        ? <Check className="w-3.5 h-3.5 text-green-400" />
                        : <Download className="w-3.5 h-3.5 text-white/30" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}