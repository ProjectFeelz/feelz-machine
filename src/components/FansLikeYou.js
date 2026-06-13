/**
 * FansLikeYou.js
 * src/components/FansLikeYou.js
 * "Fans like you also follow" — shows artists followed by listeners
 * who also follow the same artists as the current user
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function FansLikeYou({ userId, limit = 6 }) {
  const navigate = useNavigate();
  const [artists, setArtists] = useState([]);

  useEffect(() => {
    if (!userId) return;
    load();
  }, [userId]); // eslint-disable-line

  const load = async () => {
    try {
      // Get artists this user follows
      const { data: myFollows } = await supabase
        .from('follows')
        .select('artist_id')
        .eq('follower_id', userId);

      const myArtistIds = (myFollows || []).map(f => f.artist_id).filter(Boolean);
      if (!myArtistIds.length) return;

      // Find other users who follow the same artists
      const { data: similarUsers } = await supabase
        .from('follows')
        .select('follower_id')
        .in('artist_id', myArtistIds)
        .neq('follower_id', userId)
        .limit(200);

      const similarUserIds = [...new Set((similarUsers || []).map(f => f.follower_id))].slice(0, 50);
      if (!similarUserIds.length) return;

      // Find artists those users follow that this user doesn't
      const { data: theirFollows } = await supabase
        .from('follows')
        .select('artist_id, artists(id, artist_name, slug, profile_image_url, total_streams)')
        .in('follower_id', similarUserIds)
        .not('artist_id', 'in', `(${myArtistIds.join(',')})`)
        .limit(500);

      // Count how many similar users follow each artist
      const counts = {};
      const meta   = {};
      (theirFollows || []).forEach(f => {
        const id = f.artist_id;
        const a  = f.artists;
        if (!id || !a) return;
        counts[id] = (counts[id] || 0) + 1;
        meta[id]   = a;
      });

      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id, count]) => ({ ...meta[id], sharedFans: count }));

      setArtists(sorted);
    } catch (err) { console.error('FansLikeYou error:', err); }
  };

  if (!artists.length) return null;

  return (
    <div className="px-4 mb-6">
      <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3">
        Fans like you also follow
      </p>
      <div className="flex space-x-3 overflow-x-auto scrollbar-hide">
        {artists.map(a => (
          <button key={a.id}
            onClick={() => navigate(`/artist/${a.slug}`)}
            className="flex-shrink-0 flex flex-col items-center w-20 text-center">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-white/[0.06] mb-1.5">
              {a.profile_image_url
                ? <img src={a.profile_image_url} alt={a.artist_name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-6 h-6 text-white/20" />
                  </div>}
            </div>
            <p className="text-[11px] font-medium text-white/70 truncate w-full">{a.artist_name}</p>
            <p className="text-[9px] text-white/25">{a.sharedFans} fans</p>
          </button>
        ))}
      </div>
    </div>
  );
}
