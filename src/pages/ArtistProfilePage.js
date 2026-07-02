import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { downloadTrack } from '../utils/downloadTrack';
import TrackActionSheet from '../components/TrackActionSheet';
import TrackVersions from '../components/TrackVersions';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/useTier';
import { usePlayer } from '../contexts/PlayerContext';
import {
  ArrowLeft, Calendar, Play, Pause, Share2,
  UserPlus, UserCheck, Instagram, Twitter, Youtube,
  Globe, Music, Loader, Verified, Download,
  Heart, Check, MoreHorizontal, DollarSign, MessageCircle,
  ChevronDown, ChevronUp, Send, Trash2, Shuffle, Users, Plus, ShoppingBag,
  Radio, X, Search, Info, Bell, BellOff
} from 'lucide-react';
import { ArtistProfileSkeleton } from '../components/SkeletonLoader';
import ShareCard from '../components/ShareCard';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import { VoiceMemoCard, VoiceMemoUpload } from '../components/VoiceMemo';
import TipButton from '../components/TipButton';
import TipGoal from '../components/TipGoal';
import { ArtistStoryView, StoryUpload } from '../components/ArtistStories';
import PreSaveButton from '../components/PreSaveButton';
import ArtistGuestbook from '../components/ArtistGuestbook';
import MerchConnectSheet from '../components/MerchConnectSheet';
import ChallengeXPModal from '../components/ChallengeXPModal';

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
    const userIds = [...new Set(data.map(c => c.user_id))].filter(Boolean);
    if (!userIds.length) { setComments(data.map(c => ({ ...c, commenter: null }))); return; }
    const { data: artistsData } = await supabase
      .from('artists').select('user_id, artist_name, slug, profile_image_url, is_verified')
      .in('user_id', userIds);
    const artistMap = {};
    (artistsData || []).forEach(a => { artistMap[a.user_id] = a; });
    const missingIds = userIds.filter(id => id && !artistMap[id]);
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
  const { isPremium, isListenerPro } = useTier();
  const { playTrack, addToQueue, currentTrack, isPlaying, togglePlay } = usePlayer();

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
  const [showShareCard, setShowShareCard] = useState(false);
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
  const [artistPlaylists, setArtistPlaylists] = useState([]);
  const [thoughts, setThoughts] = useState([]);
  const [highlightedTrackId, setHighlightedTrackId] = useState(null);
  const [voiceMemos, setVoiceMemos] = useState([]);
  const [stories, setStories]         = useState([]);
  const [viewingStory, setViewingStory]   = useState(false);
  const [showCommunity, setShowCommunity]     = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMerchConnect, setShowMerchConnect] = useState(false);
  const [createTab, setCreateTab]             = useState('menu'); // 'menu' | 'story' | 'thought' | 'dm'
  const [createThought, setCreateThought]     = useState('');
  const [createThoughtSaving, setCreateThoughtSaving] = useState(false);
  const [createThoughtMsg, setCreateThoughtMsg] = useState('');
  // Live session state (for create modal)
  const [liveTitle, setLiveTitle]               = useState('');
  const [liveMode, setLiveMode]                 = useState('audio');
  const [liveYoutubeUrl, setLiveYoutubeUrl]     = useState('');
  const [scheduleMode, setScheduleMode]         = useState(false);
  const [scheduledAt, setScheduledAt]           = useState('');
  const [queueTracks, setQueueTracks]           = useState([]);
  const [trackSearch, setTrackSearch]           = useState('');
  const [trackResults, setTrackResults]         = useState([]);
  const [searchingTracks, setSearchingTracks]   = useState(false);
  const [startingSession, setStartingSession]   = useState(false);
  const [deepCuts, setDeepCuts] = useState([]);
  const [weeklyDiscoveries, setWeeklyDiscoveries] = useState(0);
  const [purchasedTracks, setPurchasedTracks] = useState({});
  const [liveSession, setLiveSession] = useState(null);
  const [radioLoading, setRadioLoading] = useState(false);
  const [showAllCollabs, setShowAllCollabs] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [showDMModal, setShowDMModal] = useState(false);
  const [showXPModal, setShowXPModal]   = useState(false);
  const [xpData, setXpData]             = useState(null);
  const [dmMessage, setDmMessage]     = useState('');
  const [dmSending, setDmSending]     = useState(false);
  const [dmSent, setDmSent]           = useState(false);
  const liveCheckRef = useRef(null);
  const [scheduledSession, setScheduledSession] = useState(null);
  const [topListeners, setTopListeners]         = useState([]);

  const fetchTopListeners = async (artistId) => {
    // Top 5 listeners by stream count for this artist's tracks
    try {
      const { data: trackData } = await supabase
        .from('tracks').select('id').eq('artist_id', artistId).eq('is_published', true);
      const trackIds = (trackData || []).map(t => t.id);
      if (!trackIds.length) return;

      const { data: streamData } = await supabase
        .from('streams')
        .select('user_id')
        .in('track_id', trackIds);
      if (!streamData?.length) return;

      // Count streams per user
      const counts = {};
      streamData.forEach(s => { counts[s.user_id] = (counts[s.user_id] || 0) + 1; });
      const top5 = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([uid, count]) => ({ user_id: uid, count }));

      // Enrich with profile data
      const uids = top5.map(t => t.user_id).filter(Boolean);
      if (!uids.length) return;
      const [{ data: artistProfiles }, { data: listenerProfiles }] = await Promise.all([
        supabase.from('artists').select('user_id, artist_name, profile_image_url, slug').in('user_id', uids),
        supabase.from('user_profiles').select('user_id, name, avatar_url').in('user_id', uids),
      ]);
      const artistMap = {};
      (artistProfiles || []).forEach(a => { artistMap[a.user_id] = a; });
      const listenerMap = {};
      (listenerProfiles || []).forEach(l => { listenerMap[l.user_id] = l; });

      setTopListeners(top5.map(({ user_id, count }) => {
        const a = artistMap[user_id];
        const l = listenerMap[user_id];
        return {
          user_id,
          count,
          name:   a?.artist_name || l?.name || 'Listener',
          avatar: a?.profile_image_url || l?.avatar_url || null,
          slug:   a?.slug || null,
        };
      }));
    } catch (err) { console.error('Top listeners error:', err); }
  };

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
  useEffect(() => { if (artist?.id) fetchTopListeners(artist.id); }, [artist?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live session check ────────────────────────────────────────────────────
  useEffect(() => {
    if (!artist?.id) return;
    let cancelled = false;
    const check = async () => {
      const [liveRes, scheduledRes] = await Promise.all([
        supabase.from('listening_sessions').select('id, title')
          .eq('artist_id', artist.id).eq('status', 'live').limit(1).maybeSingle(),
        supabase.from('listening_sessions').select('id, title, scheduled_at')
          .eq('artist_id', artist.id).eq('status', 'scheduled')
          .gt('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (!cancelled) {
        setLiveSession(liveRes.error ? null : (liveRes.data || null));
        setScheduledSession(scheduledRes.error ? null : (scheduledRes.data || null));
      }
    };
    check();
    liveCheckRef.current = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(liveCheckRef.current); };
  }, [artist?.id]);
  useEffect(() => {
    if (!artist?.id) return;
    supabase.from('artist_stories')
      .select('*')
      .eq('artist_id', artist.id)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setStories(data || []));
    supabase.from('artist_voice_memos')
      .select('*').eq('artist_id', artist.id)
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setVoiceMemos(data || []));
  }, [artist?.id]);

  // ── Deep cuts (least-streamed published tracks) ───────────────────────────
  useEffect(() => {
    if (!artist?.id || tracks.length === 0) return;
    const sorted = [...tracks]
      .filter(t => t.is_published)
      .sort((a, b) => (a.stream_count || 0) - (b.stream_count || 0))
      .slice(0, 5);
    setDeepCuts(sorted);
  }, [artist?.id, tracks]);

  // ── Weekly discovery count (how many new listeners this week) ────────────
  useEffect(() => {
    if (!artist?.id) return;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from('streams')
      .select('user_id', { count: 'exact' })
      .in('track_id', tracks.map(t => t.id).filter(Boolean))
      .gte('created_at', weekAgo)
      .then(({ count }) => setWeeklyDiscoveries(count || 0));
  }, [artist?.id, tracks]);

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
        .from('artists').select('*').eq('slug', slug).maybeSingle();
      if (error || !artistData) {
        setLoading(false);
        navigate('/browse', { replace: true });
        return;
      }
      setArtist(artistData);
      // Live follower count — avoids stale cached column
supabase.from('follows').select('*', { count: 'exact', head: true })
  .eq('artist_id', artistData.id)
  .then(({ count }) => setFollowerCount(count || 0));
      const { data: themeData } = await supabase
        .from('artist_themes').select('*').eq('artist_id', artistData.id).maybeSingle();
      if (themeData) setTheme(themeData);
      let trackQuery = supabase
        .from('tracks')
        .select('*, albums(title, cover_artwork_url, price), pay_what_you_want, minimum_price, is_preorder, release_date')
        .eq('artist_id', artistData.id)
        .eq('is_published', true)
        .order('engagement_score', { ascending: false });
      // Fan Pro gets early access to pre-order tracks not yet released
      if (!isListenerPro) {
        trackQuery = trackQuery.or(
          `is_preorder.eq.false,release_date.lte.${new Date().toISOString()},release_date.is.null`
        );
      }
      const { data: trackData } = await trackQuery;
      setTracks(trackData || []);
      if (user) {
        const { data: likes } = await supabase.from('track_likes').select('track_id').eq('user_id', user.id);
        const likeMap = {};
        (likes || []).forEach(l => { likeMap[l.track_id] = true; });
        setLikedTracks(likeMap);
      }
      // Fetch artist's own playlists + collaborative playlists
      const [{ data: ownPlaylists }, { data: collabPlaylists }] = await Promise.all([
        supabase.from('playlists')
          .select('id, name, cover_url, user_id, created_at, is_shared, playlist_tracks(id, position, tracks(cover_artwork_url))')
          .eq('user_id', artistData.user_id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('playlist_collaborators')
          .select('playlists(id, name, cover_url, user_id, created_at, is_shared)')
          .eq('user_id', artistData.user_id),
      ]);
      const collabFlat = (collabPlaylists || []).map(c => c.playlists).filter(Boolean);
      // Merge, deduplicate by id
      const seen = new Set();
      const merged = [...(ownPlaylists || []), ...collabFlat].filter(p => {
        if (!p || seen.has(p.id)) return false;
        seen.add(p.id); return true;
      });
      setArtistPlaylists(merged);

      const { data: albumData } = await supabase
        .from('albums').select('*').eq('artist_id', artistData.id).eq('is_published', true)
        .order('release_date', { ascending: false });
      setAlbums(albumData || []);
      // Fetch both directions:
      // 1. Collabs where this artist IS the collaborator on someone else's track
      // 2. Collabs on tracks owned by this artist (beatmakers/featured artists credited)
      const { data: asCollaborator } = await supabase
        .from('collaborations')
        .select('*, tracks(id, title, cover_artwork_url, file_url, duration, stream_count, artist_id, is_downloadable, download_price)')
        .eq('artist_id', artistData.id).eq('status', 'accepted');

      // Get track IDs owned by this artist
      const ownTrackIds = (trackData || []).map(t => t.id).filter(Boolean);
      let onOwnTracks = [];
      if (ownTrackIds.length > 0) {
        const { data: ownTrackCollabs } = await supabase
          .from('collaborations')
          .select('*, tracks(id, title, cover_artwork_url, file_url, duration, stream_count, artist_id, is_downloadable, download_price)')
          .in('track_id', ownTrackIds)
          .eq('status', 'accepted')
          .neq('artist_id', artistData.id);
        onOwnTracks = ownTrackCollabs || [];
      }

      // Merge and deduplicate by id
      const allCollabs = [...(asCollaborator || []), ...onOwnTracks];
      const seenCollabs = new Set();
      const uniqueCollabs = allCollabs.filter(col => {
        if (seenCollabs.has(col.id)) return false;
        seenCollabs.add(col.id);
        return true;
      });
      setCollabs(uniqueCollabs);
      const cutoff = new Date(Date.now() - THOUGHT_TTL_MS).toISOString();
      const { data: thoughtsData } = await supabase
        .from('artist_thoughts').select('id, content, created_at')
        .eq('artist_id', artistData.id).gte('created_at', cutoff)
        .order('created_at', { ascending: false });
      setThoughts(thoughtsData || []);
      if (user) {
        const artistTrackIds = (trackData || []).map(t => t.id).filter(Boolean);
        const { data: streamData } = artistTrackIds.length > 0
          ? await supabase
              .from('streams').select('track_id, tracks(genre, mood)')
              .eq('user_id', user.id).in('track_id', artistTrackIds).limit(50)
          : { data: [] };
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
        const [{ data: followData }, { data: alertData }] = await Promise.all([
          supabase.from('follows').select('id').eq('artist_id', artistData.id).eq('follower_id', user.id).maybeSingle(),
          supabase.from('artist_alerts').select('id').eq('artist_id', artistData.id).eq('user_id', user.id).maybeSingle(),
        ]);
        setIsFollowing(!!followData);
        setNotifEnabled(!!alertData);
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
            body: JSON.stringify({ action: 'capture', orderId: data.orderID, userId: user?.id }),
          });
          const captureData = await res.json();
          if (!captureData.success) throw new Error('Payment capture failed');
          // purchases + downloads recorded server-side in paypal-order.js
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
    // Block new self-follows but allow unfollowing self (cleanup edge case)
    if (user.id === artist.user_id && !isFollowing) return;
    try {
      if (isFollowing) {
        await supabase.from('follows').delete().eq('artist_id', artist.id).eq('follower_id', user.id);
        await supabase.from('artist_alerts').delete().eq('artist_id', artist.id).eq('user_id', user.id);
        setIsFollowing(false);
        setFollowerCount(prev => Math.max(prev - 1, 0));
      } else {
        await supabase.from('follows').insert({ artist_id: artist.id, follower_id: user.id });
        await supabase.from('artist_alerts').upsert({ artist_id: artist.id, user_id: user.id }, { onConflict: 'user_id,artist_id' });
        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
        const { data: myProfile } = await supabase.from('artists').select('id, artist_name, profile_image_url, slug').eq('user_id', user.id).maybeSingle();
        let followerName  = myProfile?.artist_name || null;
        let followerImage = myProfile?.profile_image_url || null;
        let followerSlug  = myProfile?.slug || null;
        if (!followerName) {
          const { data: listenerProfile } = await supabase.from('listeners').select('display_name, avatar_url').eq('user_id', user.id).maybeSingle();
          followerName  = listenerProfile?.display_name || null;
          followerImage = listenerProfile?.avatar_url || null;
        }
        await supabase.from('notifications').insert({
          user_id: artist.user_id,
          artist_id: artist.id,
          type: 'new_follower',
          title: `${followerName || 'Someone'} followed you`,
          message: '',
          from_artist_id: myProfile?.id || null,
          metadata: {
            from_artist_name:  followerName,
            from_artist_image: followerImage,
            from_artist_slug:  followerSlug,
          },
        }).catch(() => {});
      }
    } catch (err) { console.error('Follow error:', err); }
  };
  const handleToggleNotif = async () => {
    if (!user) { navigate('/login'); return; }
    if (notifLoading) return;
    setNotifLoading(true);
    try {
      if (notifEnabled) {
        await supabase.from('artist_alerts').delete().eq('artist_id', artist.id).eq('user_id', user.id);
        setNotifEnabled(false);
      } else {
        await supabase.from('artist_alerts').upsert({ artist_id: artist.id, user_id: user.id }, { onConflict: 'user_id,artist_id' });
        setNotifEnabled(true);
      }
    } catch (err) { console.error('Notif toggle error:', err); }
    setNotifLoading(false);
  };

  // Live session track search
  React.useEffect(() => {
    if (!artist?.id || trackSearch.trim().length < 2) { setTrackResults([]); return; }
    setSearchingTracks(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('tracks').select('id,title,cover_artwork_url,duration')
        .eq('artist_id', artist.id).eq('is_published', true)
        .ilike('title', `%${trackSearch.trim()}%`).limit(8);
      setTrackResults((data || []).filter(t => !queueTracks.find(q => q.id === t.id)));
      setSearchingTracks(false);
    }, 300);
    return () => clearTimeout(t);
  }, [trackSearch, artist?.id, queueTracks]);

  const fmtLiveDuration = (s) => s ? `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` : '';
  const addToLiveQueue = (track) => { setQueueTracks(p => [...p, track]); setTrackSearch(''); setTrackResults([]); };
  const removeFromLiveQueue = (id) => setQueueTracks(p => p.filter(t => t.id !== id));

  const startLiveSession = async () => {
    if (!artist || startingSession) return;
    setStartingSession(true);
    try {
      const { data: existing } = await supabase.from('listening_sessions').select('id')
        .eq('artist_id', artist.id).eq('status', 'live').maybeSingle();
      if (existing) { setCreateTab('menu'); navigate(`/session/${existing.id}`); setStartingSession(false); return; }
      const title = liveTitle.trim() || `${artist.artist_name}'s Live Session`;
      const isScheduled = scheduleMode && scheduledAt;
      const { data: session, error } = await supabase.from('listening_sessions').insert({
        artist_id: artist.id, title, mode: liveMode,
        status: isScheduled ? 'scheduled' : 'live',
        ...(isScheduled ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
        ...(liveMode === 'youtube' && liveYoutubeUrl ? { youtube_url: liveYoutubeUrl } : {}),
      }).select().single();
      if (error) throw error;
      const { data: { session: authSession } } = await supabase.auth.getSession();
      fetch('/.netlify/functions/notify-session-live', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, artist_id: artist.id, token: authSession?.access_token }),
      }).catch(() => {});
      if (liveMode === 'audio' && queueTracks.length > 0) {
        await supabase.from('listening_session_queue').insert(
          queueTracks.map((track, i) => ({ session_id: session.id, track_id: track.id, position: i }))
        );
      }
      setShowCreateModal(false); setCreateTab('menu');
      if (!scheduleMode || !scheduledAt) navigate(`/session/${session.id}`);
    } catch (err) { console.error('Start session error:', err); }
    setStartingSession(false);
  };

  const handleArtistRadio = async () => {
    if (!artist || radioLoading) return;
    setRadioLoading(true);
    try {
      // Start with this artist's tracks
      const myTracks = tracks.map(t => ({ ...t, artist_name: artist.artist_name, artist_slug: artist.slug }));
      
      // Find artists with same genre
      if (artist.genre) {
        const { data: similar } = await supabase
          .from('artists')
          .select('id, artist_name, slug')
          .eq('genre', artist.genre)
          .neq('id', artist.id)
          .order('total_streams', { ascending: false })
          .limit(5);

        if (similar?.length) {
          const simIds = similar.map(a => a.id);
          const { data: simTracks } = await supabase
            .from('tracks')
            .select('*, artists(artist_name, slug)')
            .in('artist_id', simIds)
            .eq('is_published', true)
            .order('stream_count', { ascending: false })
            .limit(30);

          const normalised = (simTracks || []).map(t => ({
            ...t,
            artist_name: t.artists?.artist_name || 'Unknown',
            artist_slug: t.artists?.slug || null,
          }));

          // Interleave: play this artist first, then similar
          const combined = [...myTracks, ...normalised];
          if (combined.length > 0) {
            playTrack(combined[0], combined);
            setRadioLoading(false);
            return;
          }
        }
      }

      // Fallback: just play this artist's tracks on shuffle
      if (myTracks.length > 0) {
        const shuffled = [...myTracks].sort(() => Math.random() - 0.5);
        playTrack(shuffled[0], shuffled);
      }
    } catch (err) { console.error('Radio error:', err); }
    setRadioLoading(false);
  };

  const sendDMToFollowers = async () => {
    if (!artist || !dmMessage.trim() || dmSending) return;
    setDmSending(true);
    try {
      // Get all follower user_ids
      const { data: follows } = await supabase
        .from('follows').select('follower_id').eq('artist_id', artist.id);
      if (!follows?.length) { setDmSending(false); return; }

      // Exclude the artist themselves from the recipient list
      const followerIds = follows.map(f => f.follower_id).filter(id => id !== user.id);
      // Batch insert notifications (50 at a time)
      for (let i = 0; i < followerIds.length; i += 50) {
        const batch = followerIds.slice(i, i + 50);
        await supabase.from('notifications').insert(
          batch.map(uid => ({
            user_id:   uid,
            artist_id: null,  // null so artist doesn't see their own broadcast
            type:      'admin_message',
            title:     `Message from ${artist.artist_name}`,
            message:   dmMessage.trim(),
            metadata:  { from_artist_id: artist.id, artist_name: artist.artist_name },
          }))
        );
      }
      // Send push notification to all followers
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        fetch('/.netlify/functions/send-push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': '',  // send-push auth is user-token based
          },
          body: JSON.stringify({
            user_ids: followerIds,
            title:    `Message from ${artist.artist_name}`,
            body:     dmMessage.trim().slice(0, 100),
            url:      `/artist/${artist.slug}`,
            tag:      `dm-${artist.id}-${Date.now()}`,
          }),
        }).catch(() => {});
      } catch {}

      setDmSent(true);
      setTimeout(() => { setDmSent(false); setShowDMModal(false); setDmMessage(''); }, 2000);
    } catch (err) { console.error('DM error:', err); }
    setDmSending(false);
  };

  const triggerDownload = async (track) => {
    if (!track.is_downloadable) { alert('This track is not available for download.'); return; }
    if (track.download_price > 0 && !purchasedTracks[track.id]) { alert('Purchase required to download.'); return; }
    setDownloading(track.id);
    try {
      try { await supabase.from('downloads').upsert({ user_id: user.id, track_id: track.id }, { onConflict: 'user_id,track_id', ignoreDuplicates: true }); } catch {}
      const { data: myProfile } = await supabase.from('artists').select('id, artist_name, profile_image_url, slug').eq('user_id', user.id).maybeSingle();
      try {
        await supabase.from('notifications').insert({
          user_id: artist.user_id,
          artist_id: artist.id,
          type: 'download',
          title: `${myProfile?.artist_name || 'Someone'} downloaded ${track.title}`,
          message: '',
          track_id: track.id,
          from_artist_id: myProfile?.id || null,
          metadata: {
            download: true,
            purchase_price:    track.download_price || 0,
            track_id:          track.id,
            track_title:       track.title,
            track_slug:        track.slug || null,
            from_artist_name:  myProfile?.artist_name || null,
            from_artist_image: myProfile?.profile_image_url || null,
          },
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

  const handleShare = () => {
    setShowShareCard(true);
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
      const { data: myProfile } = await supabase.from('artists').select('id, artist_name, profile_image_url, slug').eq('user_id', user.id).maybeSingle();
      await supabase.from('notifications').insert({
        user_id: artist.user_id,
        artist_id: artist.id,
        type: 'track_liked',
        title: `${myProfile?.artist_name || 'Someone'} liked ${track.title}`,
        message: '',
        track_id: track.id,
        from_artist_id: myProfile?.id || null,
        metadata: {
          track_id:          track.id,
          track_title:       track.title,
          track_slug:        track.slug || null,
          from_artist_name:  myProfile?.artist_name || null,
          from_artist_image: myProfile?.profile_image_url || null,
          from_artist_slug:  myProfile?.slug || null,
        },
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
          type: 'playlist_add',
          title: `${myName} added ${trackData.title} to ${plData?.name || 'a playlist'}`,
          message: '',
          track_id: trackId,
          from_artist_id: artist?.id,
          metadata: {
            playlist_add:      true,
            playlist_id:       playlistId,
            track_id:          trackId,
            track_title:       trackData.title,
            from_artist_name:  myName,
            from_artist_image: artist?.profile_image_url || null,
            from_artist_slug:  artist?.slug || null,
          },
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
    window.__feelz_play_source = 'artist_profile';
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

  const { pullProps, pullProgress, isRefreshing } = usePullToRefresh(fetchArtist);

  if (loading) return <ArtistProfileSkeleton />;

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
  const visibleTracks  = showAllTracks ? tracks.slice(0, 10) : tracks.slice(0, 5);
  const totalVisible   = Math.min(tracks.length, 10);
  const isProfileOwner = user && myArtist && myArtist.id === artist.id;
  const isBeatmakerProfile = artist?.role === 'beatmaker';
  const pageUrl        = `${BASE_URL}/artist/${slug}`;
  const ogImage        = artist.profile_image_url || `${BASE_URL}/og-default.png`;
  const pageTitle      = `${artist.artist_name} · Feelz Machine`;
  const pageDesc       = artist.bio
    ? `${artist.bio.slice(0, 120)}${artist.bio.length > 120 ? '...' : ''}`
    : `Stream music by ${artist.artist_name} on Feelz Machine — independent music platform.`;

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: bgColor, color: textColor, fontFamily: `"${bodyFont}", sans-serif`, ...themeStyles }} {...pullProps}>
      <PullToRefreshIndicator pullProgress={pullProgress} isRefreshing={isRefreshing} />

      {/* ── Dynamic head tags ── */}
      <Helmet>
        <title>{pageTitle}</title>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
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
        <div className="fixed top-0 left-0 right-0 flex items-center justify-between px-4 z-50" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)', height: 'calc(max(env(safe-area-inset-top, 0px), 12px) + 44px)' }}>
          <button onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-md"
            style={{ backgroundColor: `${bgColor}80` }}>
            <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
          </button>
          <button onClick={handleShare}
            className="w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-md"
            style={{ backgroundColor: `${bgColor}80` }}>
            {copied
              ? <span className="text-xs" style={{ color: primaryColor }}>Copied!</span>
              : <Share2 className="w-4 h-4" style={{ color: textColor }} />}
          </button>
        </div>
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 z-10">
          {/* Story ring — clickable if artist has active stories */}
          <div
            className="relative"
            onClick={stories.length > 0 ? () => setViewingStory(true) : undefined}
            style={{ cursor: stories.length > 0 ? 'pointer' : 'default' }}
          >
            {stories.length > 0 && (
              <div className="absolute -inset-1.5 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)', padding: 2, borderRadius: 18 }}>
                <div className="w-full h-full rounded-2xl" style={{ backgroundColor: bgColor }} />
              </div>
            )}
            <div className="relative w-32 h-32 rounded-2xl overflow-hidden border-4 shadow-2xl"
              style={{ borderColor: stories.length > 0 ? 'transparent' : bgColor, backgroundColor: `${secondaryColor}30` }}>
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
            {/* Quick-create button — own profile only */}
            {isProfileOwner && (
              <div className="absolute -bottom-1 -right-1 flex flex-col space-y-1">
                <button
                  onClick={() => setShowCreateModal(true)}
                  title="Add Story or go Live"
                  className="w-9 h-9 rounded-full flex items-center justify-center shadow-xl border-2 transition hover:scale-110 active:scale-95"
                  style={{ backgroundColor: '#ffffff', borderColor: bgColor }}>
                  <Plus className="w-4 h-4 text-black" />
                </button>
              </div>
            )}
          </div>
        </div>

      {/* ARTIST INFO */}
      <div className="px-6 pt-24 flex flex-col items-center text-center">
        <div className="flex flex-col items-center mb-1">
          <div className="flex items-center space-x-2">
            <h1 className="text-3xl font-bold" style={{ fontFamily: `"${headingFont}", sans-serif`, color: textColor }}>{artist.artist_name}</h1>
            {artist.is_verified && (
              <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: accentColor }}>
                <Verified className="w-3 h-3" style={{ color: bgColor }} />
              </div>
            )}
          </div>
          {isBeatmakerProfile && (
            <span className="mt-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(234,179,8,0.15)', color: '#facc15', border: '1px solid rgba(234,179,8,0.25)' }}>
              Beat Maker
            </span>
          )}
        </div>
        <div className="flex items-center space-x-4 mb-4">
          <button
  onClick={() => isProfileOwner ? navigate(`/artist/${slug}/fans`) : undefined}
  className={isProfileOwner ? 'hover:opacity-70 transition' : ''}
  style={{ color: `${textColor}80`, fontSize: '0.875rem' }}>
  {formatNumber(followerCount)} followers{isProfileOwner ? ' ↗' : ''}
</button>
          <span className="text-sm" style={{ color: `${textColor}80` }}>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
          <span className="text-sm" style={{ color: `${textColor}80` }}>{formatNumber(artist.total_streams)} streams</span>
          {xpData?.total_xp > 0 && (
            <button onClick={() => setShowXPModal(true)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold transition hover:opacity-80"
              style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24' }}>
              <span>⚡</span>
              <span>{xpData.total_xp.toLocaleString()} XP</span>
            </button>
          )}
        </div>


        <div className="flex items-center justify-center flex-wrap gap-2 mb-4 px-4">
          <button onClick={handleFollow}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
            style={{
              backgroundColor: isFollowing ? 'transparent' : primaryColor,
              color: isFollowing ? textColor : bgColor,
              border: `2px solid ${isFollowing ? `${textColor}30` : primaryColor}`,
            }}>
            {isFollowing ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
            <span>{isFollowing ? 'Following' : 'Follow'}</span>
          </button>
          {isFollowing && user.id !== artist?.user_id && (
            <button onClick={handleToggleNotif} disabled={notifLoading}
              title={notifEnabled ? 'Turn off notifications' : 'Turn on notifications'}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
              style={{
                backgroundColor: notifEnabled ? `${secondaryColor}25` : 'transparent',
                color: notifEnabled ? secondaryColor : `${textColor}50`,
                border: `2px solid ${notifEnabled ? secondaryColor + '40' : textColor + '20'}`,
              }}>
              {notifLoading
                ? <Loader className="w-3.5 h-3.5 animate-spin" />
                : notifEnabled
                  ? <Bell className="w-3.5 h-3.5" />
                  : <BellOff className="w-3.5 h-3.5" />}
            </button>
          )}
          {tracks.length > 0 && (
            <>
              <button onClick={() => handlePlayTrack(tracks[0])}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                style={{ backgroundColor: secondaryColor, color: textColor }}>
                <Play className="w-3.5 h-3.5" fill={textColor} />
                <span>Play</span>
              </button>
              <button onClick={() => {
                const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                const queue = shuffled.map(t => ({ ...t, artist_name: artist.artist_name, artist_slug: artist.slug }));
                playTrack(queue[0], queue);
              }}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                style={{ backgroundColor: `${secondaryColor}30`, color: textColor, border: `1px solid ${secondaryColor}40` }}>
                <Shuffle className="w-3.5 h-3.5" />
                <span>Shuffle</span>
              </button>
              <button onClick={handleArtistRadio} disabled={radioLoading || tracks.length === 0}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
                style={{ backgroundColor: `${secondaryColor}30`, color: textColor, border: `1px solid ${secondaryColor}40` }}>
                {radioLoading
                  ? <Loader className="w-3.5 h-3.5 animate-spin" />
                  : <Radio className="w-3.5 h-3.5" />}
                <span>Radio</span>
              </button>
            </>
          )}
          <button onClick={handleShare}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
            style={{ backgroundColor: `${textColor}10`, color: `${textColor}70`, border: `1px solid ${textColor}20` }}>
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
          {artist.merch_enabled && (
            <button onClick={() => navigate(`/artist/${slug}/merch`)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
              style={{ backgroundColor: `${accentColor}25`, border: `1px solid ${accentColor}50`, color: accentColor }}>
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Merch</span>
            </button>
          )}
          {user && user.id !== artist?.user_id && (
            <TipButton artist={artist} />
          )}
        </div>


        {/* Tip Goal — full width below pills */}
        <TipGoal
          artistId={artist.id}
          primaryColor={primaryColor}
          textColor={textColor}
          isOwner={user?.id === artist.user_id}
        />



        {/* Challenge XP Modal */}
        {showXPModal && (
          <ChallengeXPModal
            userId={artist?.user_id}
            onClose={() => setShowXPModal(false)}
          />
        )}

        {/* Merch Connect Sheet */}
        {showMerchConnect && isProfileOwner && (
          <MerchConnectSheet
            artist={artist}
            onClose={() => setShowMerchConnect(false)}
            onConnected={() => { setShowMerchConnect(false); window.location.reload(); }}
          />
        )}

        {/* DM Modal */}
        {showDMModal && user?.id === artist.user_id && (
          <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowDMModal(false)}>
            <div className="w-full max-w-lg bg-neutral-900 rounded-t-2xl p-5 border-t border-white/[0.08]"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Message your followers</h3>
                  <p className="text-[11px] text-white/30 mt-0.5">Sends a notification to everyone following you</p>
                </div>
                <button onClick={() => setShowDMModal(false)}><X className="w-4 h-4 text-white/30" /></button>
              </div>
              <textarea value={dmMessage} onChange={e => setDmMessage(e.target.value)}
                placeholder="Share an update, a hint about new music, or let them know you're going live..."
                rows={4} maxLength={500}
                className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none resize-none mb-3" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-white/20">{dmMessage.length}/500</span>
              </div>
              <button onClick={sendDMToFollowers} disabled={!dmMessage.trim() || dmSending || dmSent}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition flex items-center justify-center space-x-2"
                style={{ background: primaryColor }}>
                {dmSent
                  ? <><Check className="w-4 h-4" /><span>Sent!</span></>
                  : dmSending
                  ? <><Loader className="w-4 h-4 animate-spin" /><span>Sending...</span></>
                  : <><Send className="w-4 h-4" /><span>Send to followers</span></>}
              </button>
            </div>
          </div>
        )}
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

      {/* 🔴 LIVE NOW BANNER — rendered here, below the profile image */}
      {liveSession && (
        <div className="mx-6 mb-4 w-[calc(100%-3rem)] flex items-center space-x-2">
          <button
            onClick={() => navigate(`/session/${liveSession.id}`)}
            className="flex-1 flex items-center justify-between px-4 py-3 rounded-2xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition active:scale-[0.98]"
          >
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="text-sm font-semibold text-red-400">Live Now</span>
              {liveSession.title && (
                <span className="text-sm text-red-300/70 truncate max-w-[120px]">— {liveSession.title}</span>
              )}
            </div>
            <Radio className="w-4 h-4 text-red-400 flex-shrink-0" />
          </button>
          {isProfileOwner && (
            <button
              onClick={async () => {
                if (!window.confirm('End this live session?')) return;
                // Stop the poll immediately so it can't resurrect the session
                clearInterval(liveCheckRef.current);
                const { error } = await supabase.from('listening_sessions')
                  .update({ status: 'ended', ended_at: new Date().toISOString() })
                  .eq('id', liveSession.id);
                if (error) {
                  console.error('Failed to end session:', error);
                  alert('Could not end the session. Please try again.');
                  // Restart poll if update failed
                  liveCheckRef.current = setInterval(async () => {
                    const { data: live } = await supabase.from('listening_sessions')
                      .select('id, title').eq('artist_id', artist.id)
                      .eq('status', 'live').limit(1).maybeSingle();
                    setLiveSession(live || null);
                  }, 30_000);
                } else {
                  setLiveSession(null);
                }
              }}
              title="End session"
              className="w-10 h-10 flex items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/25 transition flex-shrink-0"
            >
              <X className="w-4 h-4 text-red-400" />
            </button>
          )}
        </div>
      )}

      {/* 📅 SCHEDULED STREAM BANNER */}
      {!liveSession && scheduledSession?.scheduled_at && (
        <div className="mx-6 mb-4 w-[calc(100%-3rem)] flex items-center justify-between px-4 py-3 rounded-2xl border border-purple-500/25 bg-purple-500/8">
          <div className="flex items-center space-x-2.5">
            <Calendar className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <div>
              <span className="text-sm font-semibold text-purple-300">Next Live Stream</span>
              <p className="text-xs text-purple-300/50 mt-0.5">
                {new Date(scheduledSession.scheduled_at).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
                {scheduledSession.title && ` · ${scheduledSession.title}`}
              </p>
            </div>
          </div>
        </div>
      )}



      {tracks.length > 0 && (
        <div className="px-6 mb-8">
          <h2 className="text-lg font-bold mb-3 text-white" style={{ fontFamily: `"${headingFont}", sans-serif`, opacity: 1 }}>{isBeatmakerProfile ? "Beats" : "Popular"}</h2>
          <div className="space-y-1">
            {visibleTracks.map((track, i) => {
              const isActive = currentTrack?.id === track.id;
              const isTrackPlaying = isActive && isPlaying;
              return (
                <React.Fragment key={track.id}>
                  <div id={`track-${track.id}`} onClick={() => isBeatmakerProfile && track.is_beat ? navigate(`/beat/${track.slug}`) : handlePlayTrack(track)}
                    className="w-full flex items-center space-x-3 p-2.5 rounded-lg transition-all cursor-pointer"
                    style={{
                      backgroundColor: isActive ? `${secondaryColor}15` : highlightedTrackId === track.id ? `${secondaryColor}25` : 'transparent',
                      outline: highlightedTrackId === track.id ? `1px solid ${secondaryColor}50` : 'none',
                    }}>
                    {/* Track number — always left-aligned */}
                    <div className="w-6 flex items-center justify-start flex-shrink-0">
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
                    {/* Bigger artwork: w-12 h-12 */}
                    <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0" style={{ backgroundColor: `${textColor}08` }}>
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
                        {track.created_at && (Date.now() - new Date(track.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000 && (
                          <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded-full uppercase tracking-wide align-middle" style={{ background: `${accentColor}25`, color: accentColor, border: `1px solid ${accentColor}40` }}>New</span>
                        )}
                      </p>
                      <div className="flex items-center space-x-2">
                        {track.is_explicit && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ backgroundColor: `${textColor}15`, color: `${textColor}50` }}>E</span>
                        )}
                        {isBeatmakerProfile && track.is_beat ? (
                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                            {track.bpm && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${accentColor}20`, color: accentColor }}>{track.bpm} BPM</span>}
                            {track.beat_key && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/40">{track.beat_key} {track.beat_scale || ''}</span>}
                            {track.download_price > 0 && <span className="text-[10px] font-bold" style={{ color: accentColor }}>from ${track.download_price}</span>}
                          </div>
                        ) : (
                          <span className="text-xs truncate" style={{ color: `${textColor}40` }}>{formatNumber(track.stream_count || 0)} plays</span>
                        )}
                      </div>
                    </div>
                    {track.duration && <span className="text-xs flex-shrink-0" style={{ color: `${textColor}30` }}>{formatDuration(track.duration)}</span>}
                    {/* Pre-save button for upcoming releases */}
                    {track.is_preorder && track.release_date && new Date(track.release_date) > new Date() && user && (
                      <PreSaveButton
                        track={track}
                        textColor={textColor}
                        accentColor={primaryColor}
                      />
                    )}
                    {/* 3-dot menu — like and queue removed for cleaner mobile layout */}
                    <button onClick={(e) => { e.stopPropagation(); navigate(track.is_beat ? `/beat/${track.slug}` : `/track/${track.slug}`); }}
                      className="flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-95"
                      style={{ color: `${textColor}30` }} title={track.is_beat ? 'Buy Beat' : 'Track Info'}>
                      <Info className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setActionSheetTrack(track); }}
                      className="flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-95"
                      style={{ color: `${textColor}30` }} title="More">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {/* Icon-only download button */}
                    {track.is_downloadable && (
                      purchasedTracks[track.id] ? (
                        <button onClick={(e) => { e.stopPropagation(); triggerDownload(track); }} disabled={downloading === track.id}
                          className="flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                          style={{ color: secondaryColor }} title="Download">
                          {downloading === track.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <button onClick={(e) => handleDownload(track, e)} disabled={downloading === track.id}
                          className="flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                          style={{ color: secondaryColor }} title={getEffectivePrice(track) > 0 ? `$${getEffectivePrice(track)}` : 'Download'}>
                          {downloading === track.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
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
              {showAllTracks ? 'Show less' : `See all ${totalVisible} tracks`}
            </button>
          )}
        </div>
      )}

      {recommendedTracks.length > 0 && (
        <div className="mb-8 py-5" style={{ background: `linear-gradient(135deg, rgba(120,53,15,0.18) 0%, rgba(30,20,10,0.4) 60%, transparent 100%)`, borderTop: `1px solid rgba(245,158,11,0.12)`, borderBottom: `1px solid rgba(245,158,11,0.08)` }}>
          <h2 className="text-lg font-bold px-6 mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Recommended For You</h2>
          <div className="flex space-x-3 overflow-x-auto px-6 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
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

      {/* ── New Music row — artist's latest drops ── */}
      {tracks.length > 0 && (() => {
        const recent = [...tracks]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 8);
        return (
          <div className="mb-8 mx-6 rounded-2xl pt-4 pb-4"
            style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.18) 0%, rgba(6,182,212,0.08) 60%, rgba(10,30,35,0.95) 100%)', border: '1px solid rgba(6,182,212,0.25)', overflow: 'visible' }}>
            <div className="px-4 mb-4 flex items-center space-x-2">
              <p className="text-sm font-bold" style={{ color: textColor }}>New Music</p>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: `${secondaryColor}25`, color: secondaryColor, border: `1px solid ${secondaryColor}35` }}>
                Just dropped
              </span>
            </div>
            {/* Mobile: hero first card + scrollable rest */}
            <div className="md:hidden">
              {recent[0] && (() => {
                const track = recent[0];
                const withinWeek = (Date.now() - new Date(track.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
                return (
                  <div className="px-4 mb-3 cursor-pointer" onClick={() => handlePlayTrack(track)}>
                    <div className="w-full aspect-square rounded-2xl overflow-hidden relative"
                      style={{ boxShadow: withinWeek ? `0 0 0 2px ${secondaryColor}, 0 0 30px ${secondaryColor}60` : 'none' }}>
                      {track.cover_artwork_url
                        ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}30, ${accentColor}15)` }}><Music className="w-12 h-12" style={{ color: `${textColor}20` }} /></div>}
                      {withinWeek && (
                        <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-bold" style={{ background: secondaryColor, color: '#fff' }}>NEW</div>
                      )}
                    </div>
                    <p className="text-base font-bold mt-2 truncate" style={{ color: withinWeek ? secondaryColor : textColor }}>{track.title}</p>
                    <p className="text-xs truncate" style={{ color: `${textColor}50` }}>{track.albums?.title || 'Single'}</p>
                  </div>
                );
              })()}
              {recent.length > 1 && (
                <div className="flex space-x-3 overflow-x-auto scrollbar-hide px-4 pb-3" style={{ overflowY: 'visible' }}>
                  {recent.slice(1).map(track => {
                    const withinWeek = (Date.now() - new Date(track.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
                    return (
                      <div key={track.id} className="flex-shrink-0 w-32 cursor-pointer group" onClick={() => handlePlayTrack(track)}>
                        <div className="aspect-square rounded-xl overflow-hidden mb-1.5 relative" style={{ backgroundColor: `${textColor}08` }}>
                          {track.cover_artwork_url
                            ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}30, ${accentColor}15)` }}><Music className="w-6 h-6" style={{ color: `${textColor}20` }} /></div>}
                        </div>
                        <p className="text-sm font-medium truncate" style={{ color: textColor }}>{track.title}</p>
                        <p className="text-xs truncate" style={{ color: `${textColor}50` }}>{track.albums?.title || 'Single'}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Desktop: normal spread row */}
            <div className="hidden md:flex space-x-3 overflow-x-auto scrollbar-hide px-4 pt-3 pb-3" style={{ overflowY: 'visible' }}>
              {recent.map((track, i) => {
                const isNewest = i === 0;
                const withinWeek = (Date.now() - new Date(track.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000;
                const showGlow = isNewest && withinWeek;
                return (
                  <div key={track.id} className="flex-shrink-0 w-32 cursor-pointer group" onClick={() => handlePlayTrack(track)}>
                    <div className="aspect-square rounded-xl overflow-hidden mb-1.5 relative"
                      style={{ backgroundColor: `${textColor}08`, boxShadow: showGlow ? `0 0 0 2px ${secondaryColor}, 0 0 20px ${secondaryColor}60, 0 0 40px ${secondaryColor}30` : 'none' }}>
                      {track.cover_artwork_url
                        ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}30, ${accentColor}15)` }}><Music className="w-6 h-6" style={{ color: `${textColor}20` }} /></div>}
                      {showGlow && (
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: secondaryColor, color: '#fff' }}>NEW</div>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: showGlow ? secondaryColor : textColor }}>{track.title}</p>
                    <p className="text-xs truncate" style={{ color: `${textColor}50` }}>{track.albums?.title || 'Single'}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {albums.length > 0 && (
        <div className="mb-8 py-5" style={{ background: `linear-gradient(135deg, rgba(88,28,135,0.18) 0%, rgba(30,27,75,0.35) 60%, transparent 100%)`, borderTop: `1px solid rgba(139,92,246,0.15)`, borderBottom: `1px solid rgba(139,92,246,0.08)` }}>
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
        <div className="mb-8 py-5" style={{ background: `linear-gradient(135deg, rgba(13,148,136,0.15) 0%, rgba(10,30,30,0.4) 60%, transparent 100%)`, borderTop: `1px solid rgba(20,184,166,0.15)`, borderBottom: `1px solid rgba(20,184,166,0.08)` }}>
          <h2 className="text-lg font-bold px-6 mb-3" style={{ fontFamily: `"${headingFont}", sans-serif` }}>{isBeatmakerProfile ? "Beat Catalogue" : "Singles"}</h2>
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
            {collabs.slice(0, showAllCollabs ? collabs.length : 5).map(collab => (
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
            {collabs.length > 5 && (
              <button
                onClick={() => setShowAllCollabs(p => !p)}
                className="w-full py-2.5 text-xs font-medium rounded-xl transition-opacity hover:opacity-70 active:opacity-50 mt-1"
                style={{ color: secondaryColor, backgroundColor: `${secondaryColor}10`, border: `1px solid ${secondaryColor}20` }}>
                {showAllCollabs ? 'Show less' : `See ${collabs.length - 5} more`}
              </button>
            )}
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
                            // purchases + downloads recorded server-side in paypal-order.js
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
                    try { await supabase.from('downloads').insert({ user_id: user.id, track_id: pwywTrack.id, amount_paid: 0, download_type: 'free' }); } catch {}
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
      {showShareCard && (
        <ShareCard
          artist={artist}
          shareUrl={pageUrl}
          onClose={() => setShowShareCard(false)}
        />
      )}
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

      {/* Artist Playlists */}
      {artistPlaylists.length > 0 && (
        <div className="mb-8 py-5" style={{ background: `linear-gradient(135deg, rgba(49,46,129,0.18) 0%, rgba(20,20,50,0.4) 60%, transparent 100%)`, borderTop: `1px solid rgba(99,102,241,0.15)`, borderBottom: `1px solid rgba(99,102,241,0.08)` }}>
          <div className="flex items-center justify-between mb-3 px-6">
            <h2 className="text-lg font-bold" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Playlists</h2>
            {isProfileOwner && (
              <button onClick={() => navigate('/library/playlists')}
                className="w-7 h-7 rounded-full flex items-center justify-center transition hover:opacity-80"
                style={{ background: `${secondaryColor}20`, border: `1px solid ${secondaryColor}30` }}>
                <span className="text-sm" style={{ color: secondaryColor }}>+</span>
              </button>
            )}
          </div>
          <div className="flex space-x-3 overflow-x-auto scrollbar-hide px-6">
            {artistPlaylists.map(pl => (
              <div key={pl.id} className="flex-shrink-0 w-36 cursor-pointer group"
                onClick={() => navigate(`/library/playlists/${pl.id}`)}>
                <div className="aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: `${textColor}08` }}>
                  {(() => {
                      const auto = pl.playlist_tracks?.find(pt => pt.tracks?.cover_artwork_url)?.tracks?.cover_artwork_url;
                      const src = pl.cover_url || auto;
                      return src
                        ? <img src={src} alt={pl.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${secondaryColor}40, ${accentColor}20)` }}>
                            <Music className="w-8 h-8" style={{ color: `${textColor}20` }} />
                          </div>;
                    })()}
                </div>
                <p className="text-sm font-medium truncate" style={{ color: textColor }}>{pl.name}</p>
                <p className="text-xs truncate" style={{ color: `${textColor}50` }}>{pl.user_id !== artist?.user_id ? '👥 Collab' : 'Playlist'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deep Cuts — least-played tracks, frames obscurity as a feature */}
      {deepCuts.length > 1 && !isBeatmakerProfile && (
        <div className="mb-8 py-5" style={{ background: `linear-gradient(135deg, ${accentColor}08 0%, transparent 100%)`, borderTop: `1px solid ${accentColor}12`, borderBottom: `1px solid ${accentColor}08` }}>
        <div className="px-6">
          <div className="flex items-center space-x-2 mb-3">
            <h2 className="text-lg font-bold" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Deep Cuts</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider" style={{ background: `${accentColor}20`, color: accentColor }}>
              Hidden gems
            </span>
          </div>
          <div className="flex space-x-3 overflow-x-auto scrollbar-hide -mx-6 px-6">
            {deepCuts.map((track, i) => {
              const isActive = currentTrack?.id === track.id;
              return (
                <button
                  key={track.id}
                  onClick={() => handlePlayTrack(track)}
                  className="flex-shrink-0 w-28 flex flex-col items-center text-center transition active:scale-95 group"
                >
                  <div className="w-28 h-28 rounded-xl overflow-hidden mb-2 flex-shrink-0 relative" style={{ backgroundColor: `${textColor}08` }}>
                    {track.cover_artwork_url
                      ? <img src={track.cover_artwork_url} alt={track.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${accentColor}30, ${accentColor}10)` }}><Music className="w-8 h-8" style={{ color: `${textColor}20` }} /></div>}
                    {isActive && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ backgroundColor: `${accentColor}30` }}>
                        <div className="flex items-end space-x-0.5 h-4">
                          <div className="w-0.5 rounded-full animate-pulse" style={{ height: '100%', backgroundColor: accentColor }} />
                          <div className="w-0.5 rounded-full animate-pulse" style={{ height: '60%', backgroundColor: accentColor, animationDelay: '0.15s' }} />
                          <div className="w-0.5 rounded-full animate-pulse" style={{ height: '80%', backgroundColor: accentColor, animationDelay: '0.3s' }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium truncate w-full" style={{ color: isActive ? accentColor : textColor }}>{track.title}</p>
                  <p className="text-[10px] truncate w-full mt-0.5" style={{ color: `${textColor}40` }}>
                    {track.stream_count > 0 ? `${formatNumber(track.stream_count)} plays` : 'Unheard'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        </div>
      )}

      {similarArtists.length > 0 && (
        <div className="mb-8 py-5" style={{ background: `linear-gradient(135deg, rgba(136,19,55,0.18) 0%, rgba(30,10,20,0.4) 60%, transparent 100%)`, borderTop: `1px solid rgba(244,63,94,0.15)`, borderBottom: `1px solid rgba(244,63,94,0.08)` }}>
          <h2 className="text-lg font-bold mb-3 px-6" style={{ fontFamily: `"${headingFont}", sans-serif` }}>Artists Like This</h2>
          <div className="flex space-x-4 overflow-x-auto scrollbar-hide px-6">
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




      {viewingStory && stories.length > 0 && (
        <ArtistStoryView
          stories={stories}
          artist={artist}
          initialIndex={0}
          isOwner={user?.id === artist.user_id}
          onDelete={async (storyId) => {
            await supabase.from('artist_stories').delete().eq('id', storyId);
            setStories(prev => {
              const remaining = prev.filter(s => s.id !== storyId);
              if (remaining.length === 0) setViewingStory(false);
              return remaining;
            });
          }}
          onClose={() => setViewingStory(false)}
        />
      )}



      {/* Weekly discovery count */}
      {weeklyDiscoveries > 0 && (
        <div className="mx-6 mb-6 py-3 px-4 rounded-xl text-center" style={{ background: `${accentColor}10`, border: `1px solid ${accentColor}20` }}>
          <p className="text-xs" style={{ color: `${textColor}50` }}>
            <span className="font-bold" style={{ color: accentColor }}>{weeklyDiscoveries}</span>
            {' '}listener{weeklyDiscoveries !== 1 ? 's' : ''} discovered {artist?.artist_name} this week
          </p>
        </div>
      )}



      <div className="px-6 pt-8 pb-4 text-center">
        <p className="text-[11px]" style={{ color: `${textColor}20` }}>
          Powered by <span className="font-medium" style={{ color: `${textColor}30` }}>Feelz Machine</span>
        </p>
      </div>

      {/* ── Community Modal ─────────────────────────────────────────────── */}
      {/* ── Create Modal ─────────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm md:pl-64"
          onClick={() => { setShowCreateModal(false); setCreateTab('menu'); setCreateThought(''); setCreateThoughtMsg(''); }}>
          <div className="w-full overflow-y-auto overflow-x-hidden rounded-3xl"
            style={{ maxWidth: 360, maxHeight: '85vh', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center space-x-2">
                {createTab !== 'menu' && (
                  <button onClick={() => { setCreateTab('menu'); setCreateThought(''); setCreateThoughtMsg(''); }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
                    <ChevronDown className="w-3.5 h-3.5 text-white/60 rotate-90" />
                  </button>
                )}
                <p className="text-sm font-bold text-white">
                  {createTab === 'menu' ? 'Create' : createTab === 'story' ? 'Add Story' : createTab === 'thought' ? 'Thought of the Day' : 'Message Fans'}
                </p>
              </div>
              <button onClick={() => { setShowCreateModal(false); setCreateTab('menu'); setCreateThought(''); setCreateThoughtMsg(''); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            <div className="p-4 space-y-3">

              {/* ── Menu ── */}
              {createTab === 'menu' && (
                <>
                  {[
                    { id: 'upload',  icon: '🎵', label: 'Upload Track',        sub: 'Add new music to your profile',         color: 'yellow' },
                    { id: 'story',   icon: '📸', label: 'Add Story',           sub: 'Share a 24hr clip with fans',           color: 'purple' },
                    { id: 'thought', icon: '💭', label: 'Thought of the Day',  sub: "Share what's on your mind",            color: 'blue' },
                    { id: 'edit',    icon: '✏️', label: 'Edit Profile',        sub: 'Update your bio, photo and links',      color: 'gray' },
                    isPremium
                      ? { id: 'merch',        icon: '🛍️', label: 'Merch Store',    sub: 'Connect Printful · sell to your fans', color: 'purple' }
                      : { id: 'merch_locked', icon: '🛍️', label: 'Merch Store',    sub: 'Premium only — upgrade to unlock',     color: 'gray'   },
                    { id: 'dm',      icon: '📣', label: 'Message Fans',        sub: 'Send a notification to all followers',  color: 'green' },
                    { id: 'memo',    icon: '🎙️', label: 'Voice Memo',          sub: 'Record a message for your fans',        color: 'pink' },
                    { id: 'live',    icon: '🔴', label: 'Go Live',             sub: 'Start a live session',                  color: 'red' },
                  ].map(({ id, icon, label, sub, color }) => (
                    <button key={id}
                      onClick={() => {
                        if (id === 'live')    { setCreateTab('live'); setLiveTitle(`${artist?.artist_name}'s Live Session`); }
                        else if (id === 'memo')   { setCreateTab('memo'); }
                        else if (id === 'upload') { setShowCreateModal(false); setCreateTab('menu'); navigate('/dashboard?tab=upload'); }
                        else if (id === 'edit')   { setShowCreateModal(false); setCreateTab('menu'); navigate('/profile/edit'); }
                        else if (id === 'merch')        { setShowCreateModal(false); setCreateTab('menu'); setShowMerchConnect(true); }
                        else if (id === 'merch_locked') { setShowCreateModal(false); setCreateTab('menu'); navigate('/upgrade'); }
                        else setCreateTab(id);
                      }}
                      className={`w-full flex items-center space-x-3 p-4 rounded-2xl border transition active:scale-[0.98] text-left`}
                      style={{ borderColor: `rgba(255,255,255,0.06)`, background: 'rgba(255,255,255,0.02)' }}>
                      <span className="text-2xl flex-shrink-0">{icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{label}</p>
                        <p className="text-xs text-white/30 mt-0.5">{sub}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* ── Story ── */}
              {createTab === 'story' && (
                <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <StoryUpload artistId={artist.id} inline onUploaded={() => { setShowCreateModal(false); setCreateTab('menu'); }} />
                </div>
              )}

              {/* ── Thought of the Day ── */}
              {createTab === 'thought' && (
                <div className="space-y-3">
                  <textarea rows={4} maxLength={280} value={createThought}
                    onChange={e => setCreateThought(e.target.value)}
                    placeholder="What's on your mind today?"
                    className="w-full px-3 py-2.5 bg-white/[0.06] rounded-xl text-white text-sm outline-none resize-none border border-white/[0.06] focus:border-white/20 transition placeholder-white/20" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/20">{createThought.length}/280</span>
                    {createThoughtMsg && (
                      <span className={`text-xs ${createThoughtMsg.includes('limit') || createThoughtMsg.includes('Failed') ? 'text-red-400' : 'text-green-400'}`}>
                        {createThoughtMsg}
                      </span>
                    )}
                  </div>
                  <button
                    disabled={createThoughtSaving || !createThought.trim()}
                    onClick={async () => {
                      if (!createThought.trim()) return;
                      setCreateThoughtSaving(true);
                      try {
                        const { error } = await supabase.from('artist_thoughts').insert({
                          artist_id: artist.id, content: createThought.trim(),
                          created_at: new Date().toISOString(),
                        });
                        if (error) throw error;
                        setCreateThoughtMsg('Posted!');
                        setCreateThought('');
                        setTimeout(() => { setShowCreateModal(false); setCreateTab('menu'); setCreateThoughtMsg(''); }, 1200);
                      } catch { setCreateThoughtMsg('Failed to post'); }
                      setCreateThoughtSaving(false);
                    }}
                    className="w-full py-3 rounded-2xl text-sm font-semibold transition disabled:opacity-40 flex items-center justify-center space-x-2"
                    style={{ backgroundColor: primaryColor, color: bgColor }}>
                    {createThoughtSaving ? <Loader className="w-4 h-4 animate-spin" /> : <span>Post Thought</span>}
                  </button>
                </div>
              )}

              {/* ── Voice Memo ── */}
              {createTab === 'memo' && (
                <VoiceMemoUpload artistId={artist.id} onUploaded={() => { setShowCreateModal(false); setCreateTab('menu'); }} />
              )}

              {/* ── Message Fans ── */}
              {createTab === 'dm' && (
                <div className="space-y-3">
                  <p className="text-xs text-white/30">Sends a push notification to everyone following you.</p>
                  <textarea rows={4} maxLength={280} value={dmMessage}
                    onChange={e => setDmMessage(e.target.value)}
                    placeholder="Share an update, a hint about new music, or let them know you're going live..."
                    className="w-full px-3 py-2.5 bg-white/[0.06] rounded-xl text-white text-sm outline-none resize-none border border-white/[0.06] focus:border-white/20 transition placeholder-white/20" />
                  <button onClick={sendDMToFollowers} disabled={!dmMessage.trim() || dmSending || dmSent}
                    className="w-full py-3 rounded-2xl text-sm font-semibold transition disabled:opacity-40 flex items-center justify-center space-x-2"
                    style={{ backgroundColor: primaryColor, color: bgColor }}>
                    {dmSending ? <Loader className="w-4 h-4 animate-spin" /> : dmSent ? <><Check className="w-4 h-4" /><span>Sent!</span></> : <><Send className="w-4 h-4" /><span>Send to followers</span></>}
                  </button>
                </div>
              )}

              {/* ── Go Live ── */}
              {createTab === 'live' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/40 font-medium uppercase tracking-wider">Session Title</label>
                    <input value={liveTitle} onChange={e => setLiveTitle(e.target.value)}
                      placeholder="Give your session a name..." maxLength={80}
                      className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/40 font-medium uppercase tracking-wider">Stream Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setLiveMode('audio')}
                        className={`flex items-center justify-center space-x-2 py-3 rounded-xl border text-sm font-medium transition ${liveMode === 'audio' ? 'bg-white/15 border-white/20 text-white' : 'bg-white/[0.04] border-white/[0.06] text-white/40'}`}>
                        <Music className="w-4 h-4" /><span>Audio Queue</span>
                      </button>
                      <button onClick={() => setLiveMode('youtube')}
                        className={`flex items-center justify-center space-x-2 py-3 rounded-xl border text-sm font-medium transition ${liveMode === 'youtube' ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-white/[0.04] border-white/[0.06] text-white/40'}`}>
                        <Youtube className="w-4 h-4" /><span>YouTube Live</span>
                      </button>
                    </div>
                  </div>
                  {liveMode === 'audio' && (
                    <div className="space-y-2">
                      <label className="text-xs text-white/40 font-medium uppercase tracking-wider">Queue Tracks (optional)</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                        <input value={trackSearch} onChange={e => setTrackSearch(e.target.value)}
                          placeholder="Search your tracks..."
                          className="w-full pl-9 pr-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20" />
                        {searchingTracks && <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-white/30" />}
                      </div>
                      {trackResults.length > 0 && (
                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                          {trackResults.map(track => (
                            <button key={track.id} onClick={() => addToLiveQueue(track)}
                              className="w-full flex items-center space-x-3 px-3 py-2.5 hover:bg-white/[0.06] transition text-left border-b border-white/[0.04] last:border-0">
                              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex-shrink-0 overflow-hidden">
                                {track.cover_artwork_url ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-3.5 h-3.5 text-white/20 m-auto mt-2" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white truncate">{track.title}</p>
                                {track.duration && <p className="text-[10px] text-white/30">{fmtLiveDuration(track.duration)}</p>}
                              </div>
                              <Plus className="w-4 h-4 text-white/40 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                      {queueTracks.length > 0 && (
                        <div className="space-y-1">
                          {queueTracks.map((track, i) => (
                            <div key={track.id} className="flex items-center space-x-2.5 px-2 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                              <span className="text-[10px] text-white/20 w-4 text-center">{i + 1}</span>
                              <div className="w-7 h-7 rounded-md bg-white/[0.06] flex-shrink-0 overflow-hidden">
                                {track.cover_artwork_url ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-3 h-3 text-white/20 m-auto mt-2" />}
                              </div>
                              <p className="text-xs text-white flex-1 truncate">{track.title}</p>
                              {track.duration && <p className="text-[10px] text-white/30 flex-shrink-0">{fmtLiveDuration(track.duration)}</p>}
                              <button onClick={() => removeFromLiveQueue(track.id)} className="p-1 rounded-lg hover:bg-white/[0.08] transition">
                                <X className="w-3.5 h-3.5 text-white/30" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {liveMode === 'youtube' && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-white/40 font-medium uppercase tracking-wider">YouTube Live URL (optional)</label>
                      <input value={liveYoutubeUrl} onChange={e => setLiveYoutubeUrl(e.target.value)}
                        placeholder="https://youtube.com/live/..."
                        className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/40" />
                    </div>
                  )}
                  <button onClick={() => setScheduleMode(v => !v)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition ${scheduleMode ? 'bg-purple-500/15 border-purple-500/30 text-purple-300' : 'bg-white/[0.04] border-white/[0.06] text-white/40'}`}>
                    <span>📅 Schedule for later</span><span className="text-xs">{scheduleMode ? 'On' : 'Off'}</span>
                  </button>
                  {scheduleMode && (
                    <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full px-3 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:border-purple-500/40" />
                  )}
                  <button onClick={startLiveSession}
                    disabled={startingSession || !liveTitle.trim() || (scheduleMode && !scheduledAt)}
                    className={`w-full py-3 rounded-xl disabled:opacity-40 transition text-white font-semibold text-sm flex items-center justify-center space-x-2 ${scheduleMode ? 'bg-purple-500 hover:bg-purple-400' : 'bg-red-500 hover:bg-red-400'}`}>
                    {startingSession
                      ? <><Loader className="w-4 h-4 animate-spin" /><span>{scheduleMode ? 'Scheduling...' : 'Starting...'}</span></>
                      : scheduleMode ? <><span>📅</span><span>Schedule Stream</span></> : <><Radio className="w-4 h-4" /><span>Go Live</span></>}
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {showCommunity && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm md:pl-64"
          onClick={() => setShowCommunity(false)}>
          <div className="w-full overflow-y-auto overflow-x-hidden rounded-3xl"
            style={{ maxWidth: 400, maxHeight: '85vh', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <p className="text-sm font-bold text-white">Community</p>
                <p className="text-xs text-white/30 mt-0.5">{artist.artist_name}</p>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={() => { setShowCommunity(false); navigate('/community'); }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition"
                  style={{ backgroundColor: `${secondaryColor}20`, color: secondaryColor, border: `1px solid ${secondaryColor}30` }}>
                  <MessageCircle className="w-3 h-3" />
                  <span>Chat Rooms</span>
                </button>
                <button onClick={() => setShowCommunity(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-6">

              {/* Stories */}
              {stories.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Stories</p>
                  <button onClick={() => { setShowCommunity(false); setViewingStory(true); }}
                    className="flex items-center space-x-3 w-full p-3 rounded-2xl transition hover:bg-white/[0.04]"
                    style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-12 h-12 rounded-full p-0.5 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #8B5CF6, #06B6D4)' }}>
                      <div className="w-full h-full rounded-full overflow-hidden" style={{ backgroundColor: bgColor }}>
                        {artist.profile_image_url
                          ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ color: textColor }}>{artist.artist_name?.[0]}</div>}
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium" style={{ color: textColor }}>{artist.artist_name}</p>
                      <p className="text-xs" style={{ color: `${textColor}40` }}>{stories.length} active {stories.length === 1 ? 'story' : 'stories'}</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Top Listeners */}
              {topListeners.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Top Listeners</p>
                  <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                    {topListeners.map((listener, i) => (
                      <div key={listener.user_id} className="flex flex-col items-center" title={listener.name}>
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full overflow-hidden border-2" style={{ borderColor: i === 0 ? primaryColor : `${textColor}20` }}>
                            {listener.avatar
                              ? <img src={listener.avatar} alt={listener.name} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-xs font-bold" style={{ background: `${primaryColor}30`, color: textColor }}>{listener.name[0]}</div>}
                          </div>
                          {i === 0 && <span className="absolute -top-1 -right-1 text-[10px]">👑</span>}
                        </div>
                        <span className="text-[9px] mt-1 max-w-[40px] truncate text-center" style={{ color: `${textColor}50` }}>{listener.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Listener Guestbook */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Listener Comments</p>
                <ArtistGuestbook artistId={artist?.id} textColor={textColor} accentColor={accentColor} isOwner={isProfileOwner} />
              </div>

              {/* Thoughts of the Day */}
              {thoughts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Thoughts</p>
                  <div className="space-y-3">
                    {thoughts.map(thought => (
                      <ThoughtBlock key={thought.id} thought={thought} isOwner={isProfileOwner}
                        secondaryColor={secondaryColor} textColor={textColor} bgColor={bgColor}
                        user={user} navigate={navigate}
                        onDeleted={(id) => setThoughts(prev => prev.filter(t => t.id !== id))} />
                    ))}
                  </div>
                </div>
              )}

              {/* Voice Memos */}
              {voiceMemos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: `${textColor}40` }}>Voice Memos</p>
                  <div className="space-y-2">
                    {voiceMemos.map(memo => (
                      <VoiceMemoCard key={memo.id} memo={memo} canDelete={false} />
                    ))}
                  </div>
                </div>
              )}

              {thoughts.length === 0 && voiceMemos.length === 0 && (
                <p className="text-xs text-white/20 text-center py-4">Nothing here yet — check back soon</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}