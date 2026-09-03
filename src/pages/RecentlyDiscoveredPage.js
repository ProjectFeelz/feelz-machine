/**
 * RecentlyDiscoveredPage.js
 * src/pages/RecentlyDiscoveredPage.js
 * Route: /library/discovered
 * Shows artists the listener streamed for the first time, grouped by week
 */

import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ChevronLeft, Music, Loader, Compass } from 'lucide-react';

function timeAgo(date) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function weekLabel(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 7)  return 'This Week';
  if (days < 14) return 'Last Week';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export default function RecentlyDiscoveredPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [discovered, setDiscovered] = useState([]); // [{ artist, firstStreamDate, trackTitle }]

  useEffect(() => {
    if (!user) return;
    load();
  }, [user?.id]); // eslint-disable-line

  const load = async () => {
    setLoading(true);
    try {
      // Get all streams with artist info, ordered oldest first so we can find first stream per artist
      const { data: streams } = await supabase
        .from('streams')
        .select('created_at, track_id, tracks(title, artist_id, artists(id, artist_name, slug, profile_image_url, genre))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(5000);

      if (!streams?.length) { setLoading(false); return; }

      // Find first stream per artist
      const seen = {};
      streams.forEach(s => {
        const artist = s.tracks?.artists;
        const artistId = s.tracks?.artist_id;
        if (!artistId || !artist || seen[artistId]) return;
        seen[artistId] = {
          artist,
          firstStreamDate: s.created_at,
          trackTitle: s.tracks?.title || '',
        };
      });

      // Sort by most recently discovered first
      const sorted = Object.values(seen)
        .sort((a, b) => new Date(b.firstStreamDate) - new Date(a.firstStreamDate));

      setDiscovered(sorted);
    } catch (err) {
      console.error('Recently discovered error:', err);
    }
    setLoading(false);
  };

  // Group by week
  const grouped = {};
  discovered.forEach(item => {
    const label = weekLabel(item.firstStreamDate);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(item);
  });

  return (
    <div className="pb-32 px-4">
      <Helmet>
        <title>Recently Discovered · Feelz Machine</title>
        <link rel="icon" href="/favicon.ico" />
      </Helmet>

      <div className="flex items-center space-x-3 mb-6 sticky top-0 z-20 bg-black/95 backdrop-blur-xl pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04]">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Recently Discovered</h1>
          <p className="text-xs text-white/30">{discovered.length} artists found so far</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader className="w-6 h-6 animate-spin text-white/20" />
        </div>
      ) : discovered.length === 0 ? (
        <div className="text-center py-20">
          <Compass className="w-12 h-12 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No discoveries yet</p>
          <p className="text-white/15 text-xs mt-1">Start listening to track your journey</p>
          <button onClick={() => navigate('/browse')}
            className="mt-4 px-4 py-2 bg-white/[0.06] rounded-lg text-sm text-white/50 hover:bg-white/[0.1] transition">
            Browse Music
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([week, items]) => (
            <div key={week}>
              <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-3">{week}</p>
              <div className="space-y-1">
                {items.map(({ artist, firstStreamDate, trackTitle }) => (
                  <button key={artist.id}
                    onClick={() => navigate(`/artist/${artist.slug}`)}
                    className="w-full flex items-center space-x-3 p-3 rounded-xl hover:bg-white/[0.04] active:bg-white/[0.06] transition text-left active:scale-[0.98]">
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.06]">
                      {artist.profile_image_url
                        ? <img src={artist.profile_image_url} alt={artist.artist_name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-5 h-5 text-white/20" />
                          </div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{artist.artist_name}</p>
                      <p className="text-xs text-white/30 truncate">via "{trackTitle}"</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-white/20">{timeAgo(firstStreamDate)}</p>
                      {artist.genre && (
                        <p className="text-[10px] text-white/15 mt-0.5">{artist.genre}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}