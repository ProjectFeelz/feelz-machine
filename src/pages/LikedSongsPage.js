import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { Heart, Play, Pause, Music, ArrowLeft, Loader } from 'lucide-react';

export default function LikedSongsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchLiked();
  }, [user]);

  const fetchLiked = async () => {
    const { data } = await supabase
      .from('likes')
      .select('*, track:tracks(id, title, file_url, cover_artwork_url, duration, artist:artists(id, artist_name, slug))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setTracks((data || []).filter(l => l.track));
    setLoading(false);
  };

  const handlePlay = (track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(track);
  };

  return (
    <div className="pt-14 pb-32 px-4 max-w-2xl mx-auto">
      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/library')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Liked Songs</h1>
          <p className="text-xs text-white/30">{tracks.length} tracks</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-20">
          <Heart className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">No liked songs yet</p>
          <p className="text-white/15 text-xs mt-1">Tap the heart on any track to save it here</p>
        </div>
      ) : (
        <div className="space-y-1">
          {tracks.map(({ track }, i) => (
            <div key={track.id} className="flex items-center space-x-3 p-3 rounded-xl hover:bg-white/[0.04] transition group">
              <span className="text-xs text-white/20 w-5 text-right flex-shrink-0">{i + 1}</span>
              <div className="relative w-10 h-10 flex-shrink-0">
                {track.cover_artwork_url
                  ? <img src={track.cover_artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  : <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>
                }
                <button onClick={() => handlePlay(track)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition">
                  {currentTrack?.id === track.id && isPlaying
                    ? <Pause className="w-4 h-4 text-white" />
                    : <Play className="w-4 h-4 text-white" />}
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${currentTrack?.id === track.id ? 'text-green-400' : 'text-white'}`}>{track.title}</p>
                <button onClick={() => navigate(`/artist/${track.artist?.slug}`)} className="text-xs text-white/30 hover:text-white/50 transition truncate">{track.artist?.artist_name}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
