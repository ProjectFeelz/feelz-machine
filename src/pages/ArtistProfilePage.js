import { Helmet } from 'react-helmet-async';
import { downloadTrack } from '../utils/downloadTrack';
import TrackActionSheet from '../components/TrackActionSheet';
import TrackVersions from '../components/TrackVersions';
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import {
  ArrowLeft, Play, Pause, Share2, UserPlus, UserCheck,
  Instagram, Twitter, Youtube, Globe, Music,
  Loader, Verified, Download, Heart, ListMusic, Check,
  MoreHorizontal, DollarSign, MessageCircle, ChevronDown,
  ChevronUp, Send, Trash2
} from 'lucide-react';

const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID;
const EMOJI_REACTIONS = ['🔥', '❤️', '👏', '😮', '😂', '🎵'];
const THOUGHT_TTL_MS = 24 * 60 * 60 * 1000;
const BASE_URL = 'https://www.feelzmachine.com';

const TikTokIcon = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
  </svg>
);

const DiscordIcon = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const SOCIAL_ICONS = {
  instagram: Instagram, twitter: Twitter, youtube: Youtube,
  tiktok: TikTokIcon, facebook: Globe, discord: DiscordIcon, website: Globe,
};

const SOCIAL_URLS = {
  instagram: 'https://instagram.com/', twitter: 'https://x.com/',
  youtube: 'https://youtube.com/', tiktok: 'https://tiktok.com/@', facebook: 'https://facebook.com/',
};

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ThoughtBlock({ thought, isOwner, secondaryColor, textColor, bgColor, user, navigate, onDeleted }) {
  const [reactions, setReactions] = useState({});
  const [myReactions, setMyReactions] = useState({});
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState([]);
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    fetchReactions();
    fetchLikes();
    fetchCommentCount();
  }, [thought.id]);

  const fetchReactions = async () => {
    const { data } = await supabase
      .from('thought_reactions').select('emoji, user_id').eq('thought_id', thought.id);
    const counts = {};
    const mine = {};
    (data || []).forEach(r => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      if (user && r.user_id === user.id) mine[r.emoji] = true;
    });
    setReactions(counts);
    setMyReactions(mine);
  };

  const fetchLikes = async () => {
    const { count } = await supabase
      .from('thought_reactions').select('*', { count: 'exact', head: true })
      .eq('thought_id', thought.id).eq('emoji', 'like');
    setLikeCount(count || 0);
    if (user) {
      const { data } = await supabase
        .from('thought_reactions').select('id')
        .eq('thought_id', thought.id).eq('user_id', user.id).eq('emoji', 'like').maybeSingle();
      setLiked(!!data);
    }
  };

  const fetchCommentCount = async () => {
    const { count } = await supabase
      .from('thought_comments').select('*', { count: 'exact', head: true })
      .eq('thought_id', thought.id);
    setCommentCount(count || 0);
  };

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('thought_comments').select('id, thought_id, user_id, content, created_at')
      .eq('thought_id', thought.id).order('created_at', { ascending: true }).limit(50);
    if (error || !data || data.length === 0) { setComments([]); return; }
    const userIds = [...new Set(data.map(c => c.user_id))];
    const { data: artistsData } = await supabase
      .from('artists').select('user_id, artist_name, slug, profile_image_url, is_verified')
      .in('user_id', userIds);
    const artistMap = {};
    (artistsData || []).forEach(a => { artistMap[a.user_id] = a; });
    const missingIds = userIds.filter(id => !artistMap[id]);
    const profileMap = {};
    if (missingIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('user_profiles').select('user_id, name, avatar_url').in('user_id', missingIds);
      (profilesData || []).forEach(p => { profileMap[p.user_id] = p; });
    }
    setComments(data.map(c => {
      if (artistMap[c.user_id]) return { ...c, commenter: artistMap[c.user_id] };
      const profile = profileMap[c.user_id];
      return {
        ...c,
        commenter: profile
          ? { artist_name: profile.name || 'Listener', profile_image_url: profile.avatar_url || null, slug: null }
          : null,
      };
    }));
  };

  const handleLike = async () => {
    if (!user) { navigate('/login'); return; }
    if (liked) {
      await supabase.from('thought_reactions').delete()
        .eq('thought_id', thought.id).eq('user_id', user.id).eq('emoji', 'like');
      setLiked(false);
      setLikeCount(prev => Math.max(prev - 1, 0));
    } else {
      await supabase.from('thought_reactions')
        .insert({ thought_id: thought.id, user_id: user.id, emoji: 'like' });
      setLiked(true);
      setLikeCount(prev => prev + 1);
    }
  };

  const handleEmojiReact = async (emoji) => {
    if (!user) { navigate('/login'); return; }
    setShowEmojiPicker(false);
    if (myReactions[emoji]) {
      await supabase.from('thought_reactions').delete()
        .eq('thought_id', thought.id).eq('user_id', user.id).eq('emoji', emoji);
      setReactions(prev => ({ ...prev, [emoji]: Math.max((prev[emoji] || 1) - 1, 0) }));
      setMyReactions(prev => { const n = { ...prev }; delete n[emoji]; return n; });
    } else {
      await supabase.from('thought_reactions')
        .insert({ thought_id: thought.id, user_id: user.id, emoji });
      setReactions(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
      setMyReactions(prev => ({ ...prev, [emoji]: true }));
    }
  };

  const toggleComments = () => {
    if (!showComments) fetchComments();
    setShowComments(p => !p);
  };

  const submitComment = async () => {
    if (!commentText.trim() || !user) return;
    setPosting(true);
    const { error } = await supabase.from('thought_comments').insert({
      thought_id: thought.id, user_id: user.id, content: commentText.trim(),
    });
    if (!error) {
      setCommentText('');
      setCommentCount(prev => prev + 1);
      fetchComments();
    }
    setPosting(false);
  };

  const handleDelete = async () => {
    if (!isOwner) return;
    setDeleting(true);
    await supabase.from('artist_thoughts').delete().eq('id', thought.id);
    if (onDeleted) onDeleted(thought.id);
    setDeleting(false);
  };

  const expiresAt = new Date(thought.created_at).getTime() + THOUGHT_TTL_MS;
  const pct = Math.min(100, ((Date.now() - new Date(thought.created_at).getTime()) / THOUGHT_TTL_MS) * 100);
  const minsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 60000));
  const hrsLeft = Math.floor(minsLeft / 60);
  const timeLabel = hrsLeft > 0 ? `${hrsLeft}h ${minsLeft % 60}m` : `${minsLeft}m`;
  const activeReactions = Object.entries(reactions).filter(([emoji, count]) => emoji !== 'like' && count > 0);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: `${secondaryColor}10`, border: `1px solid ${secondaryColor}20` }}>
      <div className="flex items-center justify-between px-4 pt-4 pb-0">
        <p className="text-xs font-semibold" style={{ color: `${secondaryColor}90` }}>💭 Thought of the Day</p>
        <div className="flex items-center space-x-2">
          <span className="text-[10px]" style={{ color: `${textColor}30` }}>{timeAgo(thought.created_at)}</span>
          {isOwner && (
            <button onClick={handleDelete} disabled={deleting} className="w-6 h-6 flex items-center justify-center rounded-full transition">
              {deleting
                ? <Loader className="w-3 h-3 animate-spin" style={{ color: `${textColor}30` }} />
                : <Trash2 className="w-3 h-3" style={{ color: `${textColor}20` }} />}
            </button>
          )}
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm leading-relaxed" style={{ color: `${textColor}90` }}>{thought.content}</p>
        {isOwner && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px]" style={{ color: `${textColor}25` }}>Expires in {timeLabel}</span>
              <span className="text-[10px]" style={{ color: `${textColor}25` }}>{Math.round(100 - pct)}%</span>
            </div>
            <div className="w-full h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: `${textColor}10` }}>
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${100 - pct}%`, background: `linear-gradient(to right, ${secondaryColor}80, ${secondaryColor}40)` }} />
            </div>
          </div>
        )}
      </div>
      {activeReactions.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {activeReactions.map(([emoji, count]) => (
            <button key={emoji} onClick={() => handleEmojiReact(emoji)}
              className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs transition active:scale-90"
              style={{
                backgroundColor: myReactions[emoji] ? `${secondaryColor}25` : `${textColor}08`,
                border: `1px solid ${myReactions[emoji] ? secondaryColor + '40' : textColor + '10'}`,
                color: myReactions[emoji] ? secondaryColor : `${textColor}60`,
              }}>
              <span>{emoji}</span><span>{count}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center px-4 py-2.5 relative" style={{ borderTop: `1px solid ${textColor}08` }}>
        <button onClick={handleLike} className="flex items-center space-x-1.5 mr-4 transition active:scale-90">
          <Heart className="w-4 h-4 transition" style={{ color: liked ? '#ef4444' : `${textColor}30` }} fill={liked ? '#ef4444' : 'none'} />
          {likeCount > 0 && <span className="text-xs" style={{ color: liked ? '#ef4444' : `${textColor}30` }}>{likeCount}</span>}
        </button>
        <div className="relative mr-4">
          <button onClick={() => { if (!user) { navigate('/login'); return; } setShowEmojiPicker(p => !p); }}
            className="text-base leading-none transition active:scale-90" style={{ opacity: 0.4 }}>😊</button>
          {showEmojiPicker && (
            <div className="absolute bottom-8 left-0 z-50 flex items-center space-x-1.5 p-2 rounded-xl shadow-2xl"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}>
              {EMOJI_REACTIONS.map(emoji => (
                <button key={emoji} onClick={() => handleEmojiReact(emoji)}
                  className="text-xl transition active:scale-90 hover:scale-125 w-8 h-8 flex items-center justify-center rounded-lg"
                  style={{ backgroundColor: myReactions[emoji] ? `${secondaryColor}25` : 'transparent' }}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={toggleComments} className="flex items-center space-x-1.5 transition active:scale-90">
          <MessageCircle className="w-4 h-4" style={{ color: `${textColor}30` }} />
          {commentCount > 0 && <span className="text-xs" style={{ color: `${textColor}30` }}>{commentCount}</span>}
          {showComments
            ? <ChevronUp className="w-3 h-3" style={{ color: `${textColor}20` }} />
            : <ChevronDown className="w-3 h-3" style={{ color: `${textColor}20` }} />}
        </button>
      </div>
      {showComments && (
        <div style={{ borderTop: `1px solid ${textColor}08` }}>
          <div className="max-h-56 overflow-y-auto">
            {comments.map(comment => (
              <div key={comment.id} className="flex space-x-3 px-4 py-3" style={{ borderBottom: `1px solid ${textColor}05` }}>
                <button onClick={() => comment.commenter?.slug && navigate(`/artist/${comment.commenter.slug}`)}
                  className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${secondaryColor}50, ${secondaryColor}20)` }}>
                  {comment.commenter?.profile_image_url
                    ? <img src={comment.commenter.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                    : <span className="text-[10px] font-bold" style={{ color: textColor }}>{(comment.commenter?.artist_name || '?')[0]?.toUpperCase()}</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-medium" style={{ color: textColor }}>{comment.commenter?.artist_name || 'User'}</span>
                    <span className="text-[10px]" style={{ color: `${textColor}20` }}>{timeAgo(comment.created_at)}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: `${textColor}60` }}>{comment.content}</p>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-center text-xs py-6" style={{ color: `${textColor}20` }}>No comments yet</p>
            )}
          </div>
          {user && (
            <div className="px-4 py-3">
              <div className="flex items-center space-x-2">
                <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitComment()}
                  placeholder="Add a comment..." maxLength={500}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: `${textColor}08`, color: textColor, border: `1px solid ${textColor}10` }} />
                <button onClick={submitComment} disabled={!commentText.trim() || posting}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition disabled:opacity-30"
                  style={{ backgroundColor: `${textColor}08` }}>
                  {posting
                    ? <Loader className="w-3.5 h-3.5 animate-spin" style={{ color: `${textColor}40` }} />
                    : <Send className="w-3.5 h-3.5" style={{ color: `${textColor}50` }} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ArtistProfilePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, artist: myArtist } = useAuth();
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const [artist, setArtist] = useState(null);
  const [theme, setTheme] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [collabs, setCollabs] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [actionSheetTrack, setActionSheetTrack] = useState(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [purchaseTrack, setPurchaseTrack] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [pwywTrack, setPwywTrack] = useState(null);
  const [pwywFanPrice, setPwywFanPrice] = useState('');
  const [pwywFanPriceError, setPwywFanPriceError] = useState('');
  const [pwywPaypalReady, setPwywPaypalReady] = useState(false);
  const [pwywPurchaseSuccess, setPwywPurchaseSuccess] = useState(false);
  const [pwywPurchaseError, setPwywPurchaseError] = useState('');
  const [likedTracks, setLikedTracks] = useState({});
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [addingTo, setAddingTo] = useState(null);
  const [addedTo, setAddedTo] = useState({});
  const [recommendedTracks, setRecommendedTracks] = useState([]);
  const [similarArtists, setSimilarArtists] = useState([]);
  const [thoughts, setThoughts] = useState([]);
  const [highlightedTrackId, setHighlightedTrackId] = useState(null);
  const [purchasedTracks, setPurchasedTracks] = useState({});

  const checkExistingPurchases = async () => {
    if (!user || !tracks.length) return;
    const trackIds = tracks.map(t => t.id);
    const { data } = await supabase.from('downloads').select('track_id')
      .eq('user_id', user.id).in('track_id', trackIds);
    const map = {};
    (data || []).forEach(d => { map[d.track_id] = true; });
    setPurchasedTracks(map);
  };

  useEffect(() => {
    if (tracks.length > 0 && user) checkExistingPurchases();
  }, [tracks, user]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && user && tracks.length > 0) {
        checkExistingPurchases();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user, tracks]);

  useEffect(() => { if (slug) fetchArtist(); }, [slug]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const trackSlug = params.get('track');
    if (trackSlug && tracks.length > 0) {
      const match = tracks.find(t => t.slug === trackSlug);
      if (match) {
        setHighlightedTrackId(match.id);
        setShowAllTracks(true);
        setTimeout(() => {
          const el = document.getElementById(`track-${match.id}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 400);
      }
    }
  }, [location.search, tracks]);

  const fetchArtist = async () => {
    setLoading(true);
    try {
      const { data: artistData, error } = await supabase
        .from('artists').select('*').eq('slug', slug).single();
      if (error || !artistData) { setLoading(false); return; }
      setArtist(artistData);
      setFollowerCount(artistData.follower_count || 0);
      const { data: themeData } = await supabase
        .from('artist_themes').select('*').eq('artist_id', artistData.id).maybeSingle();
      if (themeData) setTheme(themeData);
      const { data: trackData } = await supabase
        .from('tracks')
        .select('*, albums(title, cover_artwork_url, price), pay_what_you_want, minimum_price, is_preorder, release_date')
        .eq('artist_id', artistData.id).eq('is_published', true)
        .order('engagement_score', { ascending: false });
      setTracks(trackData || []);
      if (user) {
        const { data: likes } = await supabase.from('track_likes').select('track_id').eq('user_id', user.id);
        const likeMap = {};
        (likes || []).forEach(l => { likeMap[l.track_id] = true; });
        setLikedTracks(likeMap);
      }
      const { data: albumData } = await supabase
        .from('albums').select('*').eq('artist_id', artistData.id).eq('is_published', true)
        .order('release_date', { ascending: false });
      setAlbums(albumData || []);
      const { data: collabData } = await supabase
        .from('collaborations')
        .select('*, tracks(id, title, cover_artwork_url, file_url, duration, stream_count, artist_id, is_downloadable, download_price)')
        .eq('artist_id', artistData.id).eq('status', 'accepted');
      setCollabs(collabData || []);
      const cutoff = new Date(Date.now() - THOUGHT_TTL_MS).toISOString();
      const { data: thoughtsData } = await supabase
        .from('artist_thoughts').select('id, content, created_at')
        .eq('artist_id', artistData.id).gte('created_at', cutoff)
        .order('created_at', { ascending: false });
      setThoughts(thoughtsData || []);
      if (user) {
        const { data: streamData } = await supabase
          .from('streams').select('track_id, tracks(genre, mood)')
          .eq('tracks.artist_id', artistData.id).eq('user_id', user.id).limit(50);
        if (streamData && streamData.length > 0) {
          const tagCounts = {};
          streamData.forEach(s => {
            const g = s.tracks?.genre; const m = s.tracks?.mood;
            if (g) tagCounts[g] = (tagCounts[g] || 0) + 1;
            if (m) tagCounts[m] = (tagCounts[m] || 0) + 1;
          });
          const listenedIds = streamData.map(s => s.track_id).filter(Boolean);
          const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
          if (topTags.length > 0) {
            const { data: recData } = await supabase
              .from('tracks').select('*, albums(title, cover_artwork_url, price)')
              .eq('artist_id', artistData.id).eq('is_published', true)
              .or(topTags.map(t => `genre.eq.${t},mood.eq.${t}`).join(','))
              .not('id', 'in', `(${listenedIds.join(',')})`)
              .order('engagement_score', { ascending: false }).limit(5);
            setRecommendedTracks(recData || []);
          }
        } else {
          const { data: topData } = await supabase
            .from('tracks').select('*, albums(title, cover_artwork_url, price)')
            .eq('artist_id', artistData.id).eq('is_published', true)
            .order('engagement_score', { ascending: false }).limit(5);
          setRecommendedTracks(topData || []);
        }
      }
      const { data: artistGenres } = await supabase
        .from('tracks').select('genre, mood')
        .eq('artist_id', artistData.id).eq('is_published', true).limit(20);
      if (artistGenres && artistGenres.length > 0) {
        const genres = [...new Set(artistGenres.map(t => t.genre).filter(Boolean))];
        const moods = [...new Set(artistGenres.map(t => t.mood).filter(Boolean))];
        const allTags = [...genres, ...moods];
        if (allTags.length > 0) {
          const orFilter = allTags.map(t => `genre.eq.${t},mood.eq.${t}`).join(',');
          const { data: simTrackData } = await supabase
            .from('tracks')
            .select('artist_id, artists(id, artist_name, slug, profile_image_url, is_verified, total_streams)')
            .neq('artist_id', artistData.id).eq('is_published', true).or(orFilter).limit(50);
          if (simTrackData) {
            const artistMap = {};
            simTrackData.forEach(t => {
              const a = t.artists;
              if (a && !artistMap[a.id]) artistMap[a.id] = { ...a, matchCount: 0 };
              if (a) artistMap[a.id].matchCount++;
            });
            const sorted = Object.values(artistMap)
              .sort((a, b) => b.matchCount - a.matchCount || b.total_streams - a.total_streams)
              .slice(0, 6);
            setSimilarArtists(sorted);
          }
        }
      }
      if (user) {
        const { data: followData } = await supabase
          .from('follows').select('id')
          .eq('artist_id', artistData.id).eq('follower_id', user.id).maybeSingle();
        setIsFollowing(!!followData);
      }
    } catch (err) { console.error('Error fetching artist:', err); }
    setLoading(false);
  };

  useEffect(() => {
    if (!purchaseTrack) return;
    setPaypalReady(false); setPurchaseError('');
    const existing = document.getElementById('paypal-sdk-track');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'paypal-sdk-track';
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;
    script.onload = () => setPaypalReady(true);
    script.onerror = () => setPurchaseError('Failed to load PayPal. Please try again.');
    document.head.appendChild(script);
  }, [purchaseTrack?.id]);

  useEffect(() => {
    if (!pwywTrack) return;
    setPwywPaypalReady(false); setPwywPurchaseError('');
    const existing = document.getElementById('paypal-sdk-pwyw');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'paypal-sdk-pwyw';
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;
    script.onload = () => setPwywPaypalReady(true);
    script.onerror = () => setPwywPurchaseError('Failed to load PayPal. Please try again.');
    document.head.appendChild(script);
  }, [pwywTrack?.id]);

  useEffect(() => {
    if (!paypalReady || !purchaseTrack || !window.paypal) return;
    const container = document.getElementById('paypal-checkout-container');
    if (!container) return;
    container.innerHTML = '';
    window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
      createOrder: async () => {
        setPurchasing(true); setPurchaseError('');
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', trackId: purchaseTrack.id, amount: getEffectivePrice(purchaseTrack), trackTitle: purchaseTrack.title, artistName: artist.artist_name }),
          });
          const { orderId, error } = await res.json();
          if (error || !orderId) throw new Error(error || 'Failed to create order');
          return orderId;
        } catch (err) { setPurchaseError(err.message); setPurchasing(false); throw err; }
      },
      onApprove: async (data) => {
        try {
          const res = await fetch('/.netlify/functions/paypal-order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'capture', orderId: data.orderID }),
          });
          const captureData = await res.json();
          if (!captureData.success) throw new Error('Payment capture failed');
          await supabase.from('downloads').insert({ user_id: user.id, track_id: purchaseTrack.id, amount_paid: getEffectivePrice(purchaseTrack) });
          await fetch('/.netlify/functions/process-split-payout', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_id: purchaseTrack.id, transaction_id: captureData.captureId, total_amount: getEffectivePrice(purchaseTrack), buyer_user_id: user.id }),
          });
          setPurchaseSuccess(true); setPurchasing(false);
          setTimeout(async () => { await triggerDownload(purchaseTrack); setPurchaseTrack(null); setPurchaseSuccess(false); }, 1500);
        } catch (err) { setPurchaseError(err.message); setPurchasing(false); }
      },
      onError: (err) => { console.error('PayPal error:', err); setPurchaseError('Payment failed. Please try again.'); setPurchasing(false); },
      onCancel: () => { setPurchasing(false); },
    }).render('#paypal-checkout-container');
  }, [paypalReady, purchaseTrack?.id]);

  const handleFollow = async () => {
    if (!user) { navigate('/login'); return; }
    if (!artist) return;
    try {
      if (isFollowing) {
        await supabase.from('follows').delete().eq('artist_id', artist.id).eq('follower_id', user.id);
        setIsFollowing(false);
        setFollowerCount(prev => Math.max(prev - 1, 0));
      } else {
        await supabase.from('follows').insert({ artist_id: artist.id, follower_id: user.id });
        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
        const { data: myProfile } = await supabase.from('artists').select('id, artist_name').eq('user_id', user.id).maybeSingle();
        await supabase.from('notifications').insert({
          user_id: artist.user_id,
          artist_id: artist.id,
          type: 'new_follower',
          title: `${myProfile?.artist_name || 'Someone'} followed you`,
          message: `${myProfile?.artist_name || 'Someone'} started following you`,
          from_artist_id: myProfile?.id || null,
          metadata: {},
        }).catch(() => {});
      }
    } catch (err) { console.error('Follow error:', err); }
  };

  const triggerDownload = async (track) => {
    setDownloading(track.id);
    try {
      try { await supabase.from('downloads').upsert({ user_id: user.id, track_id: track.id }, { onConflict: 'user_id,track_id', ignoreDuplicates: true }); } catch {}
      const { data: myProfile } = await supabase.from('artists').select('id, artist_name').eq('user_id', user.id).maybeSingle();
      try {
        await supabase.from('notifications').insert({
          user_id: artist.user_id,
          artist_id: artist.id,
          type: 'download',
          title: `${myProfile?.artist_name || 'Someone'} downloaded ${track.title}`,
          message: `${myProfile?.artist_name || 'Someone'} downloaded your track ${track.title}`,
          track_id: track.id,
          from_artist_id: myProfile?.id || null,
          metadata: { download: true, purchase_price: track.download_price || 0 },
        });
      } catch {}
      const { data: { session } } = await supabase.auth.getSession();
      await downloadTrack(track.id, track.title, session?.access_token);
    } catch (err) { console.error('Download error:', err); }
    setDownloading(null);
  };

  const getEffectivePrice = (track) => {
    if (track.download_price > 0) return track.download_price;
    if (track.album_id && track.albums?.price > 0) return track.albums.price;
    return 0;
  };

  const handleDownload = (track, e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    if (downloading === track.id) return;
    if (track.pay_what_you_want) {
      const suggested = Math.max(getEffectivePrice(track), parseFloat(track.minimum_price) || 0);
      setPwywFanPrice(suggested > 0 ? suggested.toFixed(2) : '');
      setPwywFanPriceError(''); setPwywPurchaseError(''); setPwywPurchaseSuccess(false);
      setPwywTrack(track);
    } else if (getEffectivePrice(track) > 0) {
      setPurchaseTrack(track);
    } else {
      triggerDownload(track);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: artist.artist_name, text: `Check out ${artist.artist_name} on Feelz Machine`, url }); } catch (e) {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLike = async (track, e) => {
    e.stopPropagation();
    if (!user) { navigate('/login'); return; }
    const isLiked = likedTracks[track.id];
    setLikedTracks(prev => ({ ...prev, [track.id]: !isLiked }));
    if (isLiked) {
      await supabase.from('track_likes').delete().eq('track_id', track.id).eq('user_id', user.id);
    } else {
      await supabase.from('track_likes').insert({ track_id: track.id, user_id: user.id });
      const { data: myProfile } = await supabase.from('artists').select('id, artist_name').eq('user_id', user.id).maybeSingle();
      await supabase.from('notifications').insert({
        user_id: artist.user_id,
        artist_id: artist.id,
        type: 'track_liked',
        title: `${myProfile?.artist_name || 'Someone'} liked ${track.title}`,
        message: `${myProfile?.artist_name || 'Someone'} liked your track ${track.title}`,
        track_id: track.id,
        from_artist_id: myProfile?.id || null,
        metadata: {},
      }).catch(() => {});
    }
  };

  useEffect(() => { if (user && showAddToPlaylist) fetchPlaylists(); }, [showAddToPlaylist, user]);

  const fetchPlaylists = async () => {
    if (!user) return;
    const { data } = await supabase.from('playlists').select('id, name').eq('user_id', user.id).order('name');
    setPlaylists(data || []);
  };

  const handleAddToPlaylist = async (playlistId, trackId) => {
    setAddingTo(playlistId);
    const { data: existing } = await supabase.from('playlist_tracks').select('id')
      .eq('playlist_id', playlistId).eq('track_id', trackId).maybeSingle();
    if (!existing) {
      const { data: last } = await supabase.from('playlist_tracks').select('position')
        .eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle();
      await supabase.from('playlist_tracks').insert({
        playlist_id: playlistId, track_id: trackId, position: (last?.position ?? -1) + 1,
      });
      const { data: trackData } = await supabase.from('tracks').select('artist_id, title').eq('id', trackId).maybeSingle();
      const { data: plData } = await supabase.from('playlists').select('name').eq('id', playlistId).maybeSingle();
      if (trackData?.artist_id && trackData.artist_id !== artist?.id) {
        const myName = artist?.artist_name || 'Someone';
        await supabase.from('notifications').insert({
          user_id: artist.user_id,
          artist_id: trackData.artist_id,
          type: 'track_liked',
          title: `${myName} added ${trackData.title} to ${plData?.name || 'a playlist'}`,
          message: `${myName} added your track ${trackData.title} to ${plData?.name || 'a playlist'}`,
          track_id: trackId,
          from_artist_id: artist?.id,
          metadata: { playlist_add: true, playlist_id: playlistId },
        }).catch(() => {});
      }
    }
    setAddedTo(prev => ({ ...prev, [`${playlistId}-${trackId}`]: true }));
    setAddingTo(null);
    setTimeout(() => setAddedTo(prev => {
      const n = { ...prev }; delete n[`${playlistId}-${trackId}`]; return n;
    }), 2000);
  };

  const handlePlayTrack = (track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    playTrack(
      { ...track, artist_name: artist.artist_name, artist_slug: artist.slug },
      tracks.map(t => ({ ...t, artist_name: artist.artist_name, artist_slug: artist.slug }))
    );
  };

  const themeStyles = useMemo(() => {
    if (!theme) return {};
    return {
      '--artist-primary': theme.primary_color || '#FFFFFF',
      '--artist-secondary': theme.secondary_color || '#8B5CF6',
      '--artist-accent': theme.accent_color || '#3B82F6',
      '--artist-bg': theme.background_color || '#000000',
      '--artist-text': theme.text_color || '#FFFFFF',
    };
  }, [theme]);

  const primaryColor   = theme?.primary_color   || '#FFFFFF';
  const secondaryColor = theme?.secondary_color || '#8B5CF6';
  const accentColor    = theme?.accent_color    || '#3B82F6';
  const bgColor        = theme?.background_color || '#000000';
  const textColor      = theme?.text_color      || '#FFFFFF';

  useEffect(() => {
    if (theme?.heading_font && theme.heading_font !== 'Inter') {
      const link = document.createElement('link');
      link.href = `https://fonts.googleapis.com/css2?family=${theme.heading_font.replace(/ /g, '+')}:wght@400;600;700;900&display=swap`;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      return () => document.head.removeChild(link);
    }
  }, [theme?.heading_font]);

  useEffect(() => {
    if (theme?.body_font && theme.body_font !== 'Inter' && theme.body_font !== theme?.heading_font) {
      const link = document.createElement('link');
      link.href = `https://fonts.googleapis.com/css2?family=${theme.body_font.replace(/ /g, '+')}:wght@400;500;600&display=swap`;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      return () => document.head.removeChild(link);
    }
  }, [theme?.body_font, theme?.heading_font]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <Music className="w-16 h-16 text-white/10 mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Artist not found</h2>
        <button onClick={() => navigate('/')} className="text-sm text-white/40 hover:text-white/60">Go home</button>
      </div>
    );
  }

  const socials        = artist.social_links || {};
  const socialEntries  = Object.entries(socials).filter(([_, v]) => v);
  const headingFont    = theme?.heading_font || 'Inter';
  const bodyFont       = theme?.body_font || 'Inter';
  const visibleTracks  = showAllTracks ? tracks : tracks.slice(0, 5);
  const isProfileOwner = user && myArtist && myArtist.id === artist.id;
  const pageUrl        = `${BASE_URL}/artist/${slug}`;
  const ogImage        = artist.profile_image_url || `${BASE_URL}/og-default.png`;
  const pageTitle      = `${artist.artist_name} · Feelz Machine`;
  const pageDesc       = artist.bio
    ? `${artist.bio.slice(0, 120)}${artist.bio.length > 120 ? '...' : ''}`
    : `Stream music by ${artist.artist_name} on Feelz Machine — independent music platform.`;

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: bgColor, color: textColor, fontFamily: `"${bodyFont}", sans-serif`, ...themeStyles }}>

      {/* ── Dynamic head tags ── */}
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={pageUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="profile" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDesc} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>

      {/* BANNER */}
      <div className="relative w-full" style={{ height: '220px' }}>
        {artist.banner_image_url || theme?.banner_image_url ? (
          <img src={artist.banner_image_url || theme?.banner_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${secondaryColor}40, ${accentColor}30, ${bgColor})` }} />
        )}
        {theme?.background_image_url && !artist.banner_image_url && !theme?.banner_image_url && (
          <img src={theme.background_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        )}
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 20%, ${bgColor} 100%)` }} />
        <div className="fixed top-0 left-0 right-0 flex items-center justify-center p-5 z-50">
          <button onClick={() => navigate(-1)}
            className="absolute left-5 w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md"
            style={{ backgroundColor: `${bgColor}80` }}>
            <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
          </button>
          <button onClick={handleShare}
            className="w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-md"
            style={{ backgroundColor: `${bgColor}80` }}>
            {copied
              ? <span className="text-xs" style={{ color: primaryColor }}>Copied!</span>
              : <Share2 className="w-4 h-4" style={{ color: textColor }} />}
          </button>
        </div>
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 z-10">
          <div className="w-32 h-32 rounded-2xl overflow-hidden border-4 shadow-2xl"
            style={{ borderColor: bgColor, backgroundColor: `${secondaryColor}30` }}>
            {artist.profile_image_url ? (
              <img src={artist.profile_image_url} alt={artist.artist_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${secondaryColor}, ${accentColor})` }}>
                <span className="text-2xl font-bold" style={{ color: textColor }}>{artist.artist_name?.[0]?.toUpperCase()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ARTIST INFO */}
      <div className="px-6 pt-24 flex flex-col items-center text-center">
        <div className="flex items-center space-x-2 mb-1">
          <h1 className="text-3xl font-bold" style={{ fontFamily: `"${headingFont}", sans-serif`, color: textColor }}>{artist.artist_name}</h1>
          {artist.is_verified && (
            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: accentColor }}>
              <Verified className="w-3 h-3" style={{ color: bgColor }} />
            </div>
          )}
        </div>
        <div className="flex items-center space-x-4 mb-4">
          <span className="text-sm" style={{ color: `${textColor}80` }}>{formatNumber(followerCount)} followers</span>
          <span className="text-sm" style={{ color: `${textColor}80` }}>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
          <span className="text-sm" style={{ color: `${textColor}80` }}>{formatNumber(artist.total_streams)} streams</span>
        </div>
        <div className="flex items-center justify-center space-x-3 mb-6">
          <button onClick={handleFollow}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
            style={{
              backgroundColor: isFollowing ? 'transparent' : primaryColor,
              color: isFollowing ? textColor : bgColor,
              border: `2px solid ${isFollowing ? `${textColor}30` : primaryColor}`,
            }}>
            {isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            <span>{isFollowing ? 'Following' : 'Follow'}</span>
          </button>
          {tracks.length > 0 && (
            <button onClick={() => handlePlayTrack(tracks[0])}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
              style={{ backgroundColor: secondaryColor, color: textColor }}>
              <Play className="w-4 h-4" fill={textColor} />
              <span>Play</span>
            </button>
          )}
        </div>
        {artist.bio && (
          <p className="text-sm leading-relaxed mb-6 max-w-sm" style={{ color: `${textColor}90`, fontFamily: `"${bodyFont}", sans-serif` }}>
            {artist.bio}
          </p>
        )}
        {socialEntries.length > 0 && (
          <div className="flex items-center space-x-3 mb-8">
            {socialEntries.map(([platform, value]) => {
              const Icon = SOCIAL_ICONS[platform] || Globe;
              const prefix = SOCIAL_URLS[platform] || '';
              const href = value.startsWith('http') ? value : (prefix ? `${prefix}${value}` : value);
              return href.startsWith('http') ? (
                <a key={platform} href={href} target="_blank" rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                  style={{ backgroundColor: `${textColor}10` }}>
                  <Icon className="w-4 h-4" style={{ color: `${textColor}70` }} />
                </a>
              ) : (
                <div key={platform} className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${textColor}10` }} title={value}>
                  <Icon className="w-4 h-4" style={{ color: `${textColor}70` }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {thoughts.length > 0 && (
        <div className="px-6 mb-6 space-y-3">
          {thoughts.map(thought => (
            <ThoughtBlock key={thought.id} thought={thought} isOwner={isProfileOwner}
              secondaryColor={secondaryColor} textColor={textColor} bgColor={bgColor}
              user={user} navigate={navigate}
              onDeleted={(id) => setThoughts(prev => prev.filter(t => t.id !== id))} />
          ))}
        </div>
      )}

      {tracks.length > 0 && (
        <div className="px-6 mb-8">
          <h2 className="text-lg font-bold mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Popular</h2>
          <div className="space-y-1">
            {visibleTracks.map((track, i) => {
              const isActive = currentTrack?.id === track.id;
              const isTrackPlaying = isActive && isPlaying;
              return (
                <React.Fragment key={track.id}>
                  <div id={`track-${track.id}`} onClick={() => handlePlayTrack(track)}
                    className="w-full flex items-center space-x-3 p-2.5 rounded-lg transition-all cursor-pointer"
                    style={{
                      backgroundColor: isActive ? `${secondaryColor}15` : highlightedTrackId === track.id ? `${secondaryColor}25` : 'transparent',
                      outline: highlightedTrackId === track.id ? `1px solid ${secondaryColor}50` : 'none',
                    }}>
                    <div className="w-7 flex items-center justify-center flex-shrink-0">
                      {isActive ? (
                        isTrackPlaying ? (
                          <div className="flex items-end space-x-0.5 h-4">
                            <div className="w-0.5 rounded-full animate-pulse" style={{ height: '100%', backgroundColor: secondaryColor }} />
                            <div className="w-0.5 rounded-full animate-pulse" style={{ height: '60%', backgroundColor: secondaryColor, animationDelay: '0.15s' }} />
                            <div className="w-0.5 rounded-full animate-pulse" style={{ height: '80%', backgroundColor: secondaryColor, animationDelay: '0.3s' }} />
                          </div>
                        ) : <Pause className="w-4 h-4" style={{ color: secondaryColor }} />
                      ) : (
                        <span className="text-sm" style={{ color: `${textColor}30` }}>{i + 1}</span>
                      )}
                    </div>
                    <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0" style={{ backgroundColor: `${textColor}08` }}>
                      {(track.cover_artwork_url || track.albums?.cover_artwork_url) ? (
                        <img src={track.cover_artwork_url || track.albums?.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}30, ${accentColor}15)` }}>
                          <Music className="w-4 h-4" style={{ color: `${textColor}20` }} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium truncate" style={{ color: isActive ? secondaryColor : textColor }}>
                        {track.title}
                        {track.is_preorder && track.release_date && new Date(track.release_date) > new Date() && (
                          <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded-full bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 uppercase tracking-wide align-middle">Pre</span>
                        )}
                      </p>
                      <div className="flex items-center space-x-2">
                        {track.is_explicit && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ backgroundColor: `${textColor}15`, color: `${textColor}50` }}>E</span>
                        )}
                        <span className="text-xs truncate" style={{ color: `${textColor}40` }}>{formatNumber(track.stream_count || 0)} plays</span>
                      </div>
                    </div>
                    {track.duration && <span className="text-xs flex-shrink-0" style={{ color: `${textColor}30` }}>{formatDuration(track.duration)}</span>}
                    <button onClick={(e) => { e.stopPropagation(); setActionSheetTrack(track); }}
                      className="flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-95"
                      style={{ color: `${textColor}30` }} title="More">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => handleLike(track, e)}
                      className="flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-95"
                      style={{ color: likedTracks[track.id] ? '#ef4444' : `${textColor}30` }}>
                      <Heart className="w-4 h-4" fill={likedTracks[track.id] ? '#ef4444' : 'none'} />
                    </button>
                    <div className="relative flex-shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); setShowAddToPlaylist(showAddToPlaylist === track.id ? null : track.id); }}
                        className="p-1.5 rounded-lg transition-all active:scale-95" style={{ color: `${textColor}30` }}>
                        <ListMusic className="w-4 h-4" />
                      </button>
                      {showAddToPlaylist === track.id && (
                        <div className="absolute right-0 bottom-8 z-50 w-52 rounded-xl shadow-2xl overflow-hidden"
                          style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                            <p className="text-xs font-semibold text-white/50">Add to Playlist</p>
                            <button onClick={(e) => { e.stopPropagation(); setShowAddToPlaylist(null); }} className="text-white/30 text-lg leading-none">×</button>
                          </div>
                          {playlists.length === 0
                            ? <div className="px-4 py-3"><p className="text-xs text-white/30">No playlists yet</p></div>
                            : playlists.map(pl => {
                                const key = `${pl.id}-${track.id}`;
                                return (
                                  <button key={pl.id}
                                    onClick={(e) => { e.stopPropagation(); handleAddToPlaylist(pl.id, track.id); }}
                                    disabled={addingTo === pl.id}
                                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.04] transition text-left">
                                    <span className="text-sm text-white/70 truncate">{pl.name}</span>
                                    {addedTo[key] ? <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> : null}
                                  </button>
                                );
                              })
                          }
                        </div>
                      )}
                    </div>
                    {track.is_downloadable && (
                      purchasedTracks[track.id] ? (
                        <button onClick={(e) => { e.stopPropagation(); triggerDownload(track); }} disabled={downloading === track.id}
                          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                          style={{ backgroundColor: `${secondaryColor}20`, color: secondaryColor }}>
                          {downloading === track.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          <span className="text-[11px] font-semibold">Download</span>
                        </button>
                      ) : (
                        <button onClick={(e) => handleDownload(track, e)} disabled={downloading === track.id}
                          className="flex-shrink-0 flex items-center space-x-1 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                          style={{ backgroundColor: `${secondaryColor}20`, color: secondaryColor }}>
                          {downloading === track.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          {track.pay_what_you_want
                            ? <span className="text-[11px] font-semibold">PWYW</span>
                            : getEffectivePrice(track) > 0 && <span className="text-[11px] font-semibold">${getEffectivePrice(track)}</span>
                          }
                        </button>
                      )
                    )} 
                  </div>
                  <TrackVersions track={track} albumPrice={track.albums?.price || 0}
                    onPlayVersion={(version) => {
                      playTrack(
                        { ...version, artist_name: artist?.artist_name, artist_slug: artist?.slug },
                        tracks.map(t => ({ ...t, artist_name: artist?.artist_name, artist_slug: artist?.slug }))
                      );
                    }}
                    onPurchaseRequired={(t) => setPurchaseTrack(t)} />
                </React.Fragment>
              );
            })}
          </div>
          {tracks.length > 5 && (
            <button onClick={() => setShowAllTracks(!showAllTracks)}
              className="mt-3 text-sm font-medium transition-colors" style={{ color: `${textColor}50` }}>
              {showAllTracks ? 'Show less' : `See all ${tracks.length} tracks`}
            </button>
          )}
        </div>
      )}

      {recommendedTracks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold px-6 mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Recommended For You</h2>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {recommendedTracks.map(track => (
              <div key={track.id} className="flex-shrink-0 w-36 cursor-pointer group" onClick={() => handlePlayTrack(track)}>
                <div className="aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: `${textColor}08` }}>
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
                </div>
                <p className="text-sm font-medium truncate" style={{ color: textColor }}>{track.title}</p>
                <p className="text-xs truncate" style={{ color: `${textColor}50` }}>{track.albums?.title || 'Single'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {albums.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold px-6 mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Albums</h2>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {albums.map(album => (
              <div key={album.id} className="flex-shrink-0 w-36 cursor-pointer group" onClick={() => navigate(`/album/${album.slug || album.id}`)}>
                <div className="aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: `${textColor}08` }}>
                  {album.cover_artwork_url
                    ? <img src={album.cover_artwork_url} alt={album.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}40, ${accentColor}20)` }}><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
                </div>
                <p className="text-sm font-medium truncate" style={{ color: textColor }}>{album.title}</p>
                <p className="text-xs truncate" style={{ color: `${textColor}50` }}>{album.release_type?.toUpperCase()} {album.release_date ? new Date(album.release_date).getFullYear() : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tracks.filter(t => !t.album_id).length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold px-6 mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Singles</h2>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide">
            {tracks.filter(t => !t.album_id).map(track => (
              <div key={track.id} className="flex-shrink-0 w-36 cursor-pointer group" onClick={() => handlePlayTrack(track)}>
                <div className="aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: `${textColor}08` }}>
                  {track.cover_artwork_url
                    ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}40, ${accentColor}20)` }}><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
                </div>
                <p className="text-sm font-medium truncate" style={{ color: textColor }}>{track.title}</p>
                <p className="text-xs truncate" style={{ color: `${textColor}50` }}>Single</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {collabs.length > 0 && (
        <div className="px-6 mb-8">
          <h2 className="text-lg font-bold mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Collaborations</h2>
          <div className="space-y-2">
            {collabs.map(collab => (
              <div key={collab.id}
                className="flex items-center space-x-3 p-3 rounded-xl cursor-pointer transition-opacity hover:opacity-80 active:opacity-60"
                style={{ backgroundColor: `${textColor}05`, border: `1px solid ${textColor}08` }}
                onClick={() => collab.tracks && handlePlayTrack(collab.tracks)}>
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative group" style={{ backgroundColor: `${secondaryColor}20` }}>
                  {collab.tracks?.cover_artwork_url
                    ? <img src={collab.tracks.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4" style={{ color: `${textColor}20` }} /></div>}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                    <Play className="w-4 h-4 text-white" fill="white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: textColor }}>{collab.tracks?.title || 'Untitled'}</p>
                  <p className="text-xs" style={{ color: `${textColor}40` }}>{collab.role}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${secondaryColor}20`, color: secondaryColor }}>Collab</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tracks.length === 0 && albums.length === 0 && (
        <div className="px-6 py-12 text-center">
          <Music className="w-12 h-12 mx-auto mb-3" style={{ color: `${textColor}15` }} />
          <p className="text-sm" style={{ color: `${textColor}40` }}>No music published yet. Stay tuned!</p>
        </div>
      )}

      {pwywTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setPwywTrack(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ backgroundColor: bgColor, border: `1px solid ${primaryColor}20`, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            {pwywPurchaseSuccess ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${secondaryColor}20` }}>
                  <Check className="w-7 h-7" style={{ color: secondaryColor }} />
                </div>
                <p className="font-semibold" style={{ color: textColor }}>Purchase Complete!</p>
                <p className="text-sm mt-1" style={{ color: `${textColor}50` }}>Starting download...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: `${secondaryColor}20` }}>
                    {pwywTrack.cover_artwork_url
                      ? <img src={pwywTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5" style={{ color: `${textColor}30` }} /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: textColor }}>{pwywTrack.title}</p>
                    <p className="text-sm" style={{ color: `${textColor}50` }}>{artist.artist_name}</p>
                  </div>
                  <DollarSign className="w-5 h-5 flex-shrink-0" style={{ color: secondaryColor }} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium" style={{ color: textColor }}>Pay what you want</p>
                    {parseFloat(pwywTrack.minimum_price) > 0 && (
                      <p className="text-xs" style={{ color: `${textColor}40` }}>min ${parseFloat(pwywTrack.minimum_price).toFixed(2)}</p>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: `${textColor}50` }}>$</span>
                    <input type="number" min={parseFloat(pwywTrack.minimum_price) > 0 ? pwywTrack.minimum_price : 0}
                      step="0.01" value={pwywFanPrice}
                      onChange={e => { setPwywFanPrice(e.target.value); setPwywFanPriceError(''); }}
                      placeholder="0.00"
                      className="w-full pl-7 pr-4 py-3 rounded-xl text-lg font-semibold outline-none text-center"
                      style={{ backgroundColor: `${textColor}08`, color: textColor, border: `1px solid ${textColor}15` }} />
                  </div>
                  {pwywFanPriceError && <p className="text-xs text-red-400 text-center">{pwywFanPriceError}</p>}
                  {parseFloat(pwywTrack.minimum_price) === 0 && (
                    <p className="text-xs text-center" style={{ color: `${textColor}30` }}>Enter $0 to download free</p>
                  )}
                  <div className="flex space-x-2">
                    {[1, 2, 5, 10].filter(v => v >= (parseFloat(pwywTrack.minimum_price) || 0)).map(v => (
                      <button key={v} type="button"
                        onClick={() => { setPwywFanPrice(v.toFixed(2)); setPwywFanPriceError(''); }}
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium transition"
                        style={{
                          backgroundColor: parseFloat(pwywFanPrice) === v ? primaryColor : `${textColor}08`,
                          color: parseFloat(pwywFanPrice) === v ? bgColor : `${textColor}50`,
                          border: `1px solid ${textColor}10`,
                        }}>
                        ${v}
                      </button>
                    ))}
                  </div>
                </div>
                {parseFloat(pwywFanPrice) > 0 ? (
                  <>
                    {pwywPurchaseError && <p className="text-xs text-red-400 text-center">{pwywPurchaseError}</p>}
                    {!pwywPaypalReady && !pwywPurchaseError && (
                      <div className="flex justify-center py-2"><Loader className="w-5 h-5 animate-spin" style={{ color: `${textColor}30` }} /></div>
                    )}
                    {pwywPaypalReady && (() => {
                      const minPrice = parseFloat(pwywTrack.minimum_price) || 0;
                      const amount = parseFloat(pwywFanPrice);
                      if (minPrice > 0 && amount < minPrice) {
                        return <p className="text-xs text-red-400 text-center">Minimum is ${minPrice.toFixed(2)}</p>;
                      }
                      setTimeout(() => {
                        const container = document.getElementById('paypal-pwyw-container');
                        if (!container || !window.paypal) return;
                        container.innerHTML = '';
                        window.paypal.Buttons({
                          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
                          createOrder: async () => {
                            setPwywPurchaseError('');
                            const res = await fetch('/.netlify/functions/paypal-order', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'create', trackId: pwywTrack.id, amount, trackTitle: pwywTrack.title, artistName: artist?.artist_name }),
                            });
                            const { orderId, error } = await res.json();
                            if (error || !orderId) throw new Error(error || 'Failed to create order');
                            return orderId;
                          },
                          onApprove: async (data) => {
                            const res = await fetch('/.netlify/functions/paypal-order', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'capture', orderId: data.orderID }),
                            });
                            const captureData = await res.json();
                            if (!captureData.success) throw new Error('Payment capture failed');
                            await supabase.from('downloads').insert({ user_id: user.id, track_id: pwywTrack.id, amount_paid: amount }).catch(() => {});
                            await fetch('/.netlify/functions/process-split-payout', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ track_id: pwywTrack.id, transaction_id: captureData.captureId, total_amount: amount, buyer_user_id: user.id }),
                            }).catch(() => {});
                            setPwywPurchaseSuccess(true);
                            setTimeout(async () => {
                              await triggerDownload(pwywTrack);
                              setPwywTrack(null);
                              setPwywPurchaseSuccess(false);
                            }, 1500);
                          },
                          onError: () => setPwywPurchaseError('Payment failed. Please try again.'),
                          onCancel: () => {},
                        }).render('#paypal-pwyw-container');
                      }, 0);
                      return null;
                    })()}
                    <div id="paypal-pwyw-container" style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '4px' }} />
                  </>
                ) : (
                  <button onClick={async () => {
                    const minPrice = parseFloat(pwywTrack.minimum_price) || 0;
                    if (minPrice > 0) { setPwywFanPriceError(`Minimum is $${minPrice.toFixed(2)}`); return; }
                    await supabase.from('downloads').insert({ user_id: user.id, track_id: pwywTrack.id, amount_paid: 0 }).catch(() => {});
                    await triggerDownload(pwywTrack);
                    setPwywTrack(null);
                  }}
                    className="w-full py-3 rounded-xl text-sm font-semibold transition"
                    style={{ backgroundColor: primaryColor, color: bgColor }}>
                    Download Free
                  </button>
                )}
                <button onClick={() => setPwywTrack(null)} className="w-full py-2 text-sm transition" style={{ color: `${textColor}30` }}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <TrackActionSheet track={actionSheetTrack} artist={artist} onClose={() => setActionSheetTrack(null)} />
      {purchaseTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={() => { setPurchaseTrack(null); setPurchasing(false); setPurchaseError(''); }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 overflow-y-auto"
            style={{ backgroundColor: bgColor, border: `1px solid ${primaryColor}20`, maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}>
            {purchaseSuccess ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${secondaryColor}20` }}>
                  <Check className="w-7 h-7" style={{ color: secondaryColor }} />
                </div>
                <p className="font-semibold" style={{ color: textColor }}>Purchase Complete!</p>
                <p className="text-sm mt-1" style={{ color: `${textColor}50` }}>Starting download...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: `${secondaryColor}20` }}>
                    {purchaseTrack.cover_artwork_url
                      ? <img src={purchaseTrack.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-5 h-5" style={{ color: `${textColor}30` }} /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" style={{ color: textColor }}>{purchaseTrack.title}</p>
                    <p className="text-sm" style={{ color: `${textColor}50` }}>{artist.artist_name}</p>
                  </div>
                  <p className="text-xl font-bold flex-shrink-0" style={{ color: secondaryColor }}>${getEffectivePrice(purchaseTrack)}</p>
                </div>
                <div className="rounded-xl p-3 text-center" style={{ backgroundColor: `${textColor}05`, border: `1px solid ${textColor}10` }}>
                  <p className="text-xs" style={{ color: `${textColor}40` }}>High-quality MP3 download delivered instantly after payment</p>
                </div>
                {purchaseError && <p className="text-xs text-red-400 text-center">{purchaseError}</p>}
                {!paypalReady && !purchaseError && (
                  <div className="flex justify-center py-3"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>
                )}
                <div id="paypal-checkout-container" style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '4px' }} />
                <button onClick={() => { setPurchaseTrack(null); setPurchasing(false); setPurchaseError(''); }}
                  className="w-full py-2.5 rounded-xl text-sm transition" style={{ color: `${textColor}40` }}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {similarArtists.length > 0 && (
        <div className="mb-8 px-6">
          <h2 className="text-lg font-bold mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Artists Like This</h2>
          <div className="flex space-x-4 overflow-x-auto scrollbar-hide">
            {similarArtists.map(a => (
              <div key={a.id} className="flex-shrink-0 w-24 cursor-pointer group" onClick={() => navigate(`/artist/${a.slug}`)}>
                <div className="w-24 h-24 rounded-full overflow-hidden mb-2 mx-auto" style={{ backgroundColor: `${textColor}08` }}>
                  {a.profile_image_url
                    ? <img src={a.profile_image_url} alt={a.artist_name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
                </div>
                <p className="text-xs font-medium text-center truncate" style={{ color: textColor }}>{a.artist_name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 pt-8 pb-4 text-center">
        <p className="text-[11px]" style={{ color: `${textColor}20` }}>
          Powered by <span className="font-medium" style={{ color: `${textColor}30` }}>Feelz Machine</span>
        </p>
      </div>
    </div>
  );
}
