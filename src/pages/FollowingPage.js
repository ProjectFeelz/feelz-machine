import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Users, ArrowLeft, Loader, Music } from 'lucide-react';

export default function FollowingPage() {
  const navigate = useNavigate();
  const { user, artist } = useAuth();
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
    <div className="pt-14 pb-32 px-4 max-w-2xl mx-auto">
      <div className="flex items-center space-x-3 mb-6">
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
        <div className="space-y-2">
          {following.map(({ artist: a }) => (
            <button key={a.id} onClick={() => navigate(`/artist/${a.slug}`)}
              className="w-full flex items-center space-x-3 p-3 rounded-xl hover:bg-white/[0.04] transition text-left">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-white/[0.06] flex-shrink-0">
                {a.profile_image_url
                  ? <img src={a.profile_image_url} alt="" className="w-12 h-12 object-cover" />
                  : <div className="w-12 h-12 flex items-center justify-center"><Music className="w-5 h-5 text-white/20" /></div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1">
                  <p className="text-sm font-medium text-white truncate">{a.artist_name}</p>
                  {a.is_verified && <span className="text-[10px] text-blue-400">✓</span>}
                </div>
                <p className="text-xs text-white/30">@{a.slug}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
