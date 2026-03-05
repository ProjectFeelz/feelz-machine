import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { Clock, Play, Pause, Music, ArrowLeft, Loader, Shuffle } from 'lucide-react';

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function RecentlyPlayedPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) fetchRecent(); }, [user]);

  const fetchRecent = async () => {
    const { data } = await supabase
      .from('streams')
      .select('*, track:tracks(id, title, file_url, cover_artwork_url, duration, artist_id, artist:artists(id, artist_name, slug))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Deduplicate by track id, keep most recent
    const seen = new Set();
    const unique = (data || []).filter(s => {
      if (!s.track || seen.has(s.track.id)) return false;
      seen.add(s.track.id);
      return true;
    }).slice(0, 20);

    setTracks(unique);
    setLoading(false);
  };

  const allTracks = tracks.map(s => ({ ...s.track, artist_name: s.track.artist?.artist_name }));

  const handlePlay = (track) => {
    const enriched = { ...track, artist_name: track.artist?.artist_name };
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(enriched, allTracks);
  };

  const handleShuffle = () => {
    if (allTracks.length === 0) return;
    const shuffled = [...allTracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  return (
    <div className="pt-14 pb-32 px-4 max-w-2xl mx-auto">
      <div className="flex items-center space-x-3 mb-4">
        <button onClick={() => navigate('/library')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Recently Played</h1>
          <p className="text-xs text-white/30">{tracks.length} tracks</p>
        </div>
      </div>

      {tracks.length > 0 && (
        <div className="flex items-center space-x-3 mb-5">
          <button onClick={() => playTrack(allTracks[0], allTracks)}
            className="flex items-center space-x-2 px-5 py-2.5 bg-white text-black rounded-full font-semibold text-sm active:scale-95 transition">
            <Play className="w-4 h-4" fill="black" /><span>Play All</span>
          </button>
          <button onClick={handleShuffle}
            className="flex items-center space-x-2 px-5 py-2.5 bg-white/[0.08] text-white rounded-full font-semibold text-sm active:scale-95 transition hover:bg-white/[0.12]">
            <Shuffle className="w-4 h-4" /><span>Shuffle</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-20">
          <Clock className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">Nothing played yet</p>
          <button onClick={() => navigate('/browse')} className="mt-4 text-sm text-white/40 hover:text-white/60 transition">Browse Music →</button>
        </div>
      ) : (
        <div className="space-y-1">
          {tracks.map(({ track, created_at }, i) => {
            const isActive = currentTrack?.id === track.id;
            const isTrackPlaying = isActive && isPlaying;
            return (
              <button key={`${track.id}-${i}`} onClick={() => handlePlay(track)}
                className={`w-full flex items-center space-x-3 p-3 rounded-xl transition group text-left ${isActive ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}>
                <div className="relative w-10 h-10 flex-shrink-0">
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    : <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>
                  }
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition">
                    {isTrackPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white" />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-white/90'}`}>{track.title}</p>
                  <p className="text-xs text-white/30 truncate">{track.artist?.artist_name}</p>
                </div>
                <span className="text-[11px] text-white/20 flex-shrink-0">{timeAgo(created_at)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
