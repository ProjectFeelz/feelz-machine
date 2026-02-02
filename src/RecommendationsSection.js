import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Sparkles, TrendingUp } from 'lucide-react';

function RecommendationsSection({ user, onPackSelect }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchRecommendations();
    }
  }, [user]);

  const fetchRecommendations = async () => {
    try {
      // Get user's interaction history
      const { data: userInteractions } = await supabase
        .from('sample_interactions')
        .select('sample_id, genre, mood, bpm, key')
        .eq('user_id', user.id)
        .eq('interaction_type', 'play');

      if (!userInteractions || userInteractions.length === 0) {
        // New user - show trending packs
        await fetchTrendingPacks();
        return;
      }

      // Extract user preferences
      const userGenres = {};
      const userMoods = {};
      const userBpms = [];
      
      userInteractions.forEach(interaction => {
        if (interaction.genre) {
          userGenres[interaction.genre] = (userGenres[interaction.genre] || 0) + 1;
        }
        if (interaction.mood) {
          userMoods[interaction.mood] = (userMoods[interaction.mood] || 0) + 1;
        }
        if (interaction.bpm) {
          userBpms.push(interaction.bpm);
        }
      });

      // Get top preferences
      const topGenre = Object.keys(userGenres).sort((a, b) => userGenres[b] - userGenres[a])[0];
      const topMood = Object.keys(userMoods).sort((a, b) => userMoods[b] - userMoods[a])[0];
      const avgBpm = userBpms.length > 0 ? userBpms.reduce((a, b) => a + b, 0) / userBpms.length : null;

      // Get user's played sample IDs to exclude
      const playedIds = userInteractions.map(i => i.sample_id);

      // Find similar users (collaborative filtering)
      const { data: similarUserInteractions } = await supabase
        .from('sample_interactions')
        .select('user_id, sample_id')
        .in('sample_id', playedIds)
        .neq('user_id', user.id)
        .eq('interaction_type', 'play');

      // Count which users have the most overlap
      const userOverlap = {};
      similarUserInteractions?.forEach(interaction => {
        userOverlap[interaction.user_id] = (userOverlap[interaction.user_id] || 0) + 1;
      });

      // Get top 5 similar users
      const similarUsers = Object.entries(userOverlap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([userId]) => userId);

      if (similarUsers.length > 0) {
        // Get what similar users played that current user hasn't
        const { data: similarUsersPlays } = await supabase
          .from('sample_interactions')
          .select('sample_id, samples(*)')
          .in('user_id', similarUsers)
          .not('sample_id', 'in', `(${playedIds.join(',')})`)
          .eq('interaction_type', 'play');

        // Count recommendations
        const recCounts = {};
        similarUsersPlays?.forEach(play => {
          if (!recCounts[play.sample_id]) {
            recCounts[play.sample_id] = {
              count: 0,
              sample: play.samples
            };
          }
          recCounts[play.sample_id].count++;
        });

        // Sort by popularity among similar users
        const recs = Object.values(recCounts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 6)
          .map(r => r.sample);

        if (recs.length > 0) {
          setRecommendations(recs);
          setLoading(false);
          return;
        }
      }

      // Fallback: Content-based filtering (similar genre/mood/bpm)
      let query = supabase
        .from('samples')
        .select('*')
        .not('id', 'in', `(${playedIds.join(',')})`);

      if (topGenre) {
        query = query.eq('genre', topGenre);
      }

      if (topMood) {
        query = query.eq('mood', topMood);
      }

      if (avgBpm) {
        // Find packs within ±20 BPM
        query = query.gte('bpm', avgBpm - 20).lte('bpm', avgBpm + 20);
      }

      const { data: contentRecs } = await query.limit(6);

      setRecommendations(contentRecs || []);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      await fetchTrendingPacks();
    }

    setLoading(false);
  };

  const fetchTrendingPacks = async () => {
    // Fallback for new users: show trending
    const { data: plays } = await supabase
      .from('sample_interactions')
      .select('sample_id, samples(*)')
      .eq('interaction_type', 'play')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Last 7 days

    const packCounts = {};
    plays?.forEach(play => {
      if (play.samples) {
        packCounts[play.sample_id] = packCounts[play.sample_id] || { count: 0, sample: play.samples };
        packCounts[play.sample_id].count++;
      }
    });

    const trending = Object.values(packCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map(p => p.sample);

    setRecommendations(trending);
    setLoading(false);
  };

  if (!user || loading) return null;

  if (recommendations.length === 0) return null;

  return (
    <div className="mb-12">
      <div className="flex items-center space-x-2 mb-6">
        <Sparkles className="w-6 h-6 text-cyan-400" />
        <h2 className="text-2xl font-bold text-white">
          {user ? 'Recommended For You' : 'Trending Now'}
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6">
        {recommendations.map((pack) => (
          <div
            key={pack.id}
            onClick={() => onPackSelect(pack)}
            className="group cursor-pointer bg-white/5 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/10 hover:border-cyan-400/60 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/20"
          >
            <div className="relative aspect-square">
              {pack.cover_image_url ? (
                <img
                  src={pack.cover_image_url}
                  alt={pack.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <TrendingUp className="w-16 h-16 text-white/50" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div className="p-3">
              <h3 className="font-bold text-white text-sm truncate">{pack.name}</h3>
              <p className="text-xs text-cyan-400 truncate">{pack.artist}</p>
              <div className="flex items-center space-x-2 mt-2 text-xs">
                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded">
                  {pack.bpm} BPM
                </span>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                  {pack.genre}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RecommendationsSection;