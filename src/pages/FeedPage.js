import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  TrendingUp, Loader, Music, RefreshCw, Flame, ChevronRight, Verified, MessageCircle
} from 'lucide-react';
import PostComposer from '../components/PostComposer';
import PostCard from '../components/PostCard';

export default function FeedPage() {
  const navigate = useNavigate();
  const { user, artist } = useAuth();
  const [posts, setPosts] = useState([]);
  const [feedFilter, setFeedFilter] = useState('all');
  const [followedArtistIds, setFollowedArtistIds] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;

  const fetchPosts = useCallback(async (pageNum = 0, append = false) => {
    if (pageNum === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('artist_posts')
        .select('*, track_id, tagged_artist_ids, artists(id, artist_name, slug, profile_image_url, is_verified)')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      if (append) {
        setPosts(prev => [...prev, ...(data || [])]);
      } else {
        setPosts(data || []);
      }

      setHasMore((data || []).length === PAGE_SIZE);
    } catch (err) {
      console.error('Feed error:', err);
    }

    setLoading(false);
    setLoadingMore(false);
  }, []);

  const fetchTrending = async () => {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('id, title, cover_artwork_url, engagement_score, stream_count, artists(artist_name, slug, profile_image_url)')
        .eq('is_published', true)
        .gt('engagement_score', 0)
        .order('engagement_score', { ascending: false })
        .limit(10);

      // FIX 3: Silently swallow error hides RLS/config issues — log them
      if (error) {
        console.error('Trending fetch error:', error);
        return;
      }
      setTrending(data || []);
    } catch (err) {
      console.error('Trending error:', err);
    }
  };

  useEffect(() => {
    fetchPosts(0);
    fetchTrending();
  }, [fetchPosts]);

  // Fetch followed artist IDs for the Following filter
  useEffect(() => {
    if (!user) return;
    // NOTE: This fetches all follows client-side. If the follows table grows large,
    // consider filtering posts server-side by passing followedArtistIds to fetchPosts.
    supabase
      .from('follows')
      .select('artist_id')
      .eq('follower_id', user.id)
      .then(({ data, error }) => {
        if (error) {
          console.error('Follows fetch error:', error);
          return;
        }
        setFollowedArtistIds((data || []).map(f => f.artist_id));
      });
  }, [user]);

  // Scroll to shared post if ?post= param present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post');
    if (!postId) return;
    const interval = setInterval(() => {
      const el = document.getElementById(`post-${postId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '1px solid rgba(255,255,255,0.15)';
        setTimeout(() => { el.style.outline = ''; }, 2000);
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // Real-time subscription for new posts
  useEffect(() => {
    const channel = supabase
      .channel('feed-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'artist_posts',
      }, async (payload) => {
        // FIX 1: Use .maybeSingle() — .single() throws 406 if RLS blocks the row
        const { data, error } = await supabase
          .from('artist_posts')
          .select('*, artists(id, artist_name, slug, profile_image_url, is_verified)')
          .eq('id', payload.new.id)
          .maybeSingle();

        if (error) {
          console.error('Realtime post fetch error:', error);
          return;
        }
        if (data) {
          setPosts(prev => [data, ...prev]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handlePostCreated = (newPost) => {
    // Handled by realtime subscription
  };

  const handlePostDeleted = (postId) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  // FIX 4: Use functional state update to avoid stale `page` closure in loadMore
  const loadMore = () => {
    setPage(prev => {
      const nextPage = prev + 1;
      fetchPosts(nextPage, true);
      return nextPage;
    });
  };

  const refresh = () => {
    setPage(0);
    fetchPosts(0);
    fetchTrending();
  };

  return (
    <div className="pt-10 md:pt-0 pb-4 px-6 md:px-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Feed</h1>
        <div className="flex items-center space-x-2">
          <button onClick={() => navigate('/chat')} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
            <MessageCircle className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-white/60 font-medium">Chat Rooms</span>
          </button>
          <button onClick={refresh} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/[0.05] transition active:scale-90">
            <RefreshCw className="w-4 h-4 text-white/30" />
          </button>
        </div>
      </div>

      {/* Trending bar (horizontal scroll) */}
      {trending.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center space-x-2 mb-3">
            <Flame className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-white">Trending Now</h2>
          </div>
          <div className="flex space-x-3 overflow-x-auto scrollbar-hide pb-1">
            {trending.map((track, i) => (
              <button key={track.id} onClick={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)}
                className="flex-shrink-0 w-28 group">
                <div className="relative aspect-square rounded-lg overflow-hidden mb-1.5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                  {track.cover_artwork_url ? (
                    <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-blue-900/20">
                      <Music className="w-6 h-6 text-white/15" />
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white">{i + 1}</span>
                  </div>
                </div>
                <p className="text-sm font-medium text-white truncate">{track.title}</p>
                <p className="text-xs text-white/40 truncate">{track.artists?.artist_name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feed filter */}
      <div className="flex space-x-2 mb-4">
        <button onClick={() => setFeedFilter('all')} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${feedFilter === 'all' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'}`}>All</button>
        <button onClick={() => setFeedFilter('following')} className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${feedFilter === 'following' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'}`}>Following</button>
      </div>

      {/* Post composer */}
      {user && artist && <PostComposer onPostCreated={handlePostCreated} />}
      {user && !artist && (
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 mb-4 text-center">
          <p className="text-sm text-white/40">Sign up as an artist to post in the community</p>
        </div>
      )}

      {/* Posts */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader className="w-6 h-6 animate-spin text-white/20" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <Music className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-sm text-white/30 mb-1">No posts yet</p>
          <p className="text-xs text-white/15">Be the first to post something!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts
            .filter(post => feedFilter === 'all' || followedArtistIds.includes(post.artist_id))
            .map(post => (
              <div key={post.id} id={`post-${post.id}`}>
                <PostCard post={post} onDelete={handlePostDeleted} />
              </div>
            ))}

          {hasMore && (
            <button onClick={loadMore} disabled={loadingMore}
              className="w-full py-3 text-center text-sm text-white/30 hover:text-white/50 transition">
              {loadingMore ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}