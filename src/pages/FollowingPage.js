import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Users, ArrowLeft, Loader, Music } from 'lucide-react';

export default function FollowingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [following, setFollowing] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchFollowing();
    else setLoading(false);
  }, [user]);

  const fetchFollowing = async () => {
    const { data } = await supabase
      .from('follows')
      .select('*, artist:artists(id, artist_name, slug, profile_image_url, is_verified)')
      .eq('follower_id', user.id)
      .order('created_at', { ascending: false });
    setFollowing((data || []).filter(f => f.artist));
    setLoading(false);
  };

  return (
    <div className="pb-32 px-4 max-w-6xl">
      <div className="flex items-center space-x-3 mb-6 sticky top-0 z-20 bg-black/95 backdrop-blur-xl md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04] md:border-none">
        <button onClick={() => navigate('/library')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Following</h1>
          <p className="text-xs text-white/30">{following.length} artists</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
      ) : following.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">Not following anyone yet</p>
          <button onClick={() => navigate('/browse')} className="mt-4 px-4 py-2 bg-white/[0.06] rounded-lg text-sm text-white/50 hover:bg-white/[0.1] transition">
            Discover Artists
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1">
          {following.map(({ artist: a }) => (
            <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
              className="flex flex-col items-center text-center p-3 rounded-xl hover:bg-white/[0.04] transition">
              <div className="w-full aspect-square max-w-[140px] rounded-full overflow-hidden bg-white/[0.06] mb-3">
                {a.profile_image_url
                  ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Music className="w-6 h-6 text-white/20" /></div>}
              </div>
              <div className="flex items-center space-x-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{a.artist_name}</p>
                {a.is_verified && <span className="text-[10px] text-blue-400 flex-shrink-0">✓</span>}
              </div>
              <p className="text-xs text-white/30 truncate">@{a.slug}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}