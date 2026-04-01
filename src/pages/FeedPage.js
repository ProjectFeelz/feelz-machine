import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Loader, Music, Flame, MessageCircle
} from 'lucide-react';
import PostComposer from '../components/PostComposer';
import PostCard from '../components/PostCard';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';

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
    if (pageNum === 0 && !append) setLoading(true);
    else setLoadingMore(true);
    try {
      const from = pageNum * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('artist_posts')
        .select('*, track_id, tagged_artist_ids, artists(id, artist_name, slug, profile_image_url, is_verified)')
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      if (append) setPosts(prev => [...prev, ...(data || [])]);
      else setPosts(data || []);
      setHasMore((data || []).length === PAGE_SIZE);
    } catch (err) { console.error('Feed error:', err); }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  const fetchTrending = async () => {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('id, title, cover_artwork_url, engagement_score, stream_count, artists(artist_name, slug, profile_image_url)')
        .eq('is_published', true).gt('engagement_score', 0)
        .order('engagement_score', { ascending: false }).limit(10);
      if (error) return;
      setTrending(data || []);
    } catch {}
  };

  useEffect(() => { fetchPosts(0); fetchTrending(); }, [fetchPosts]);

  useEffect(() => {
    if (!user) return;
    supabase.from('follows').select('artist_id').eq('follower_id', user.id)
      .then(({ data }) => setFollowedArtistIds((data || []).map(f => f.artist_id)));
  }, [user]);

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

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('feed-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'artist_posts' },
        async (payload) => {
          const { data, error } = await supabase
            .from('artist_posts')
            .select('*, artists(id, artist_name, slug, profile_image_url, is_verified)')
            .eq('id', payload.new.id).maybeSingle();
          if (!error && data) setPosts(prev => [data, ...prev]);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handlePostDeleted = (postId) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  const loadMore = () => {
    setPage(prev => { const next = prev + 1; fetchPosts(next, true); return next; });
  };

  const refresh = useCallback(async () => {
    setPage(0);
    await Promise.all([fetchPosts(0), fetchTrending()]);
  }, [fetchPosts]);

  const { pullProps, pullProgress, isRefreshing } = usePullToRefresh(refresh);

  return (
    <div className="pt-10 md:pt-0 pb-4 px-6 md:px-0" {...pullProps}>
      <Helmet>
        <title>Community · Feelz Machine</title>
        <meta name="description" content="See the latest posts, updates and music from independent artists on Feelz Machine." />
        <link rel="canonical" href="https://www.feelzmachine.com/community" />
        <meta property="og:title" content="Community · Feelz Machine" />
        <meta property="og:url" content="https://www.feelzmachine.com/community" />
      </Helmet>

      <PullToRefreshIndicator pullProgress={pullProgress} isRefreshing={isRefreshing} />

      {/* Header — no refresh button */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Feed</h1>
        <button
          onClick={() => navigate('/chat')}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition"
        >
          <MessageCircle className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs text-white/60 font-medium">Chat Rooms</span>
        </button>
      </div>

      {/* Trending bar */}
      {trending.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center space-x-2 mb-3">
            <Flame className="w-4 h-4 text-orange-400" />
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">Trending Now</h2>
          </div>
          <div className="flex space-x-3 overflow-x-auto scrollbar-hide pb-1">
            {trending.map((track, i) => (
              <button key={track.id}
                onClick={() => track.artists?.slug && navigate(`/artist/${track.artists.slug}`)}
                className="flex-shrink-0 w-28 group">
                <div className="relative aspect-square rounded-lg overflow-hidden mb-1.5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-blue-900/20">
                        <Music className="w-6 h-6 text-white/15" />
                      </div>}
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
        {[
          { key: 'all',       label: 'All' },
          { key: 'following', label: 'Following' },
          { key: 'trending',  label: 'Trending', icon: Flame },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key}
            onClick={() => setFeedFilter(key)}
            className={`flex items-center space-x-1 px-4 py-1.5 rounded-lg text-xs font-medium transition ${
              feedFilter === key ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'
            }`}>
            {Icon && <Icon className="w-3 h-3" />}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Post composer */}
      {user && artist && <PostComposer onPostCreated={() => {}} />}
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
        <div className="relative space-y-4">
          {posts
            .filter(post => {
              if (feedFilter === 'following') return followedArtistIds.includes(post.artist_id);
              if (feedFilter === 'trending') return (post.like_count || 0) + (post.comment_count || 0) > 0;
              return true;
            })
            .sort((a, b) => {
              if (feedFilter === 'trending')
                return ((b.like_count || 0) + (b.comment_count || 0)) - ((a.like_count || 0) + (a.comment_count || 0));
              return 0;
            })
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
