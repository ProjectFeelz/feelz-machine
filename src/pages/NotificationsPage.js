import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import {
  Bell, Users, Heart, MessageCircle, TrendingUp,
  UserPlus, Check, X, ChevronLeft, Loader,
  CheckCheck, Trash2, Music, Download, Megaphone,
  Radio, FileText, Play, DollarSign, Send, ChevronDown,
  Star, Zap, Award, Gift,
  ExternalLink,
} from 'lucide-react';
import useNotifications from '../contexts/useNotifications';
import WrappedCard from '../components/WrappedCard';

// ─── Type config ──────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  collab_request:     { icon: Users,         color: 'text-blue-400',   bg: 'bg-blue-500/10',    label: 'Collab Request' },
  collab_accepted:    { icon: Check,         color: 'text-green-400',  bg: 'bg-green-500/10',   label: 'Collab Accepted' },
  collab_declined:    { icon: X,             color: 'text-white/30',   bg: 'bg-white/[0.06]',   label: 'Collab Declined' },
  new_follower:       { icon: UserPlus,      color: 'text-pink-400',   bg: 'bg-pink-500/10',    label: 'New Follower' },
  track_liked:        { icon: Heart,         color: 'text-red-400',    bg: 'bg-red-500/10',     label: 'Track Liked' },
  track_commented:    { icon: MessageCircle, color: 'text-purple-400', bg: 'bg-purple-500/10',  label: 'Comment' },
  new_comment:        { icon: MessageCircle, color: 'text-purple-400', bg: 'bg-purple-500/10',  label: 'Comment' },
  milestone_100:      { icon: TrendingUp,    color: 'text-yellow-400', bg: 'bg-yellow-500/10',  label: 'Milestone' },
  milestone_500:      { icon: TrendingUp,    color: 'text-yellow-400', bg: 'bg-yellow-500/10',  label: 'Milestone' },
  milestone_1k:       { icon: TrendingUp,    color: 'text-orange-400', bg: 'bg-orange-500/10',  label: 'Milestone' },
  milestone_10k:      { icon: TrendingUp,    color: 'text-orange-400', bg: 'bg-orange-500/10',  label: 'Milestone' },
  milestone_stream:   { icon: TrendingUp,    color: 'text-orange-400', bg: 'bg-orange-500/10',  label: 'Milestone' },
  download:           { icon: Download,      color: 'text-green-400',  bg: 'bg-green-500/10',   label: 'Download' },
  announcement:       { icon: Megaphone,     color: 'text-yellow-400', bg: 'bg-yellow-500/10',  label: 'Announcement' },
  new_stream:         { icon: Radio,         color: 'text-cyan-400',   bg: 'bg-cyan-500/10',    label: 'New Stream' },
  new_post:           { icon: FileText,      color: 'text-indigo-400', bg: 'bg-indigo-500/10',  label: 'New Post' },
  mention:            { icon: MessageCircle, color: 'text-purple-400', bg: 'bg-purple-500/10',  label: 'Mention' },
  tier_granted:       { icon: Star,          color: 'text-yellow-400', bg: 'bg-yellow-500/10',  label: 'Tier Update' },
  new_track:          { icon: Music,         color: 'text-purple-400', bg: 'bg-purple-500/10',  label: 'New Track' },
  playlist_add:       { icon: Music,         color: 'text-blue-400',   bg: 'bg-blue-500/10',    label: 'Playlist Add' },
  competition_winner: { icon: Award,         color: 'text-yellow-400', bg: 'bg-yellow-500/10',  label: 'Winner!' },
  engagement:         { icon: Zap,           color: 'text-purple-400', bg: 'bg-purple-500/10',  label: 'For You' },
  monthly_wrapped:    { icon: Gift,          color: 'text-pink-400',   bg: 'bg-pink-500/10',    label: 'Monthly Wrapped' },
  top_supporter:      { icon: Heart,         color: 'text-orange-400', bg: 'bg-orange-500/10',  label: 'Top Supporter' },
  streak:             { icon: Zap,           color: 'text-yellow-400', bg: 'bg-yellow-500/10',  label: 'Streak' },
  session_live:       { icon: Radio,         color: 'text-red-400',    bg: 'bg-red-500/10',     label: 'Live Now' },
  weekly_report:      { icon: TrendingUp,    color: 'text-cyan-400',   bg: 'bg-cyan-500/10',    label: 'Weekly Report' },
  first_listener:     { icon: Heart,         color: 'text-yellow-400', bg: 'bg-yellow-500/10',  label: 'First! 🎯' },
  tip:                { icon: DollarSign,    color: 'text-green-400',  bg: 'bg-green-500/10',   label: 'Tip Received' },
  payout_pending:     { icon: DollarSign,    color: 'text-green-400',  bg: 'bg-green-500/10',   label: 'Payout' },
  admin_message:      { icon: Megaphone,     color: 'text-yellow-400', bg: 'bg-yellow-500/10',  label: 'From Admin' },
  bug_report:         { icon: MessageCircle, color: 'text-red-400',    bg: 'bg-red-500/10',     label: 'Bug Report' },
  artist_thought:     { icon: MessageCircle, color: 'text-pink-400',   bg: 'bg-pink-500/10',    label: 'Thought' },
  wheel_challenge:    { icon: TrendingUp,    color: 'text-yellow-400', bg: 'bg-yellow-500/10',  label: 'Challenge' },
};

const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'collabs',    label: 'Collabs' },
  { key: 'social',     label: 'Social' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'money',      label: 'Money' },
];

function filterMatch(type, filter) {
  if (filter === 'all')        return true;
  if (filter === 'collabs')    return type?.startsWith('collab_');
  if (filter === 'social')     return ['new_follower','track_liked','playlist_add','track_commented','new_comment','new_post','new_stream','mention','artist_thought'].includes(type);
  if (filter === 'milestones') return type?.startsWith('milestone_') || ['top_supporter','streak','first_listener','competition_winner','weekly_report','monthly_wrapped'].includes(type);
  if (filter === 'money')      return ['tip','download','payout_pending','beat_purchase'].includes(type);
  return true;
}

// Types to completely hide from the list (not useful to users)
const HIDDEN_TYPES = new Set(['wheel_challenge', 'bug_report']);

function formatDate(date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs  = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1)  return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24)  return `${diffHrs}h ago`;
  if (diffDays < 7)  return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Quick reply box ──────────────────────────────────────────────────────────
// replyType: 'post' → artist_post_comments, 'track' → track_comments
function QuickReply({ postId, trackId, replyType = 'post', onSent }) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = async () => {
    if (!text.trim() || sending || !user) return;
    setSending(true);
    try {
      if (replyType === 'track' && trackId) {
        await supabase.from('track_comments').insert({
          track_id:   trackId,
          user_id:    user.id,
          content:    text.trim(),
          created_at: new Date().toISOString(),
        });
      } else if (postId) {
        await supabase.from('artist_post_comments').insert({
          post_id:    postId,
          user_id:    user.id,
          content:    text.trim(),
          created_at: new Date().toISOString(),
        });
      }
      setText('');
      onSent?.();
    } catch (err) {
      console.warn('Reply failed:', err);
    }
    setSending(false);
  };

  return (
    <div
      className="flex items-center space-x-2 mt-2"
      onClick={e => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder="Write a reply…"
        className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/40"
      />
      <button
        onClick={send}
        disabled={!text.trim() || sending}
        className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0 transition active:scale-95 disabled:opacity-30"
      >
        {sending
          ? <Loader className="w-3.5 h-3.5 animate-spin text-purple-400" />
          : <Send className="w-3.5 h-3.5 text-purple-400" />}
      </button>
    </div>
  );
}

// ─── Collab action buttons ─────────────────────────────────────────────────────
function CollabActions({ notif, onActioned }) {
  const { artist } = useAuth();
  const [loading, setLoading] = useState(null);
  const [done, setDone]       = useState(null);
  const meta = notif.metadata || {};

  const act = async (action) => {
    setLoading(action);
    try {
      let reqId = meta.collab_request_id || meta.request_id || null;

      // Fallback: find the request by artist IDs if no request_id in metadata
      if (!reqId && meta.from_artist_id && artist?.id) {
        const { data: found } = await supabase
          .from('collab_requests')
          .select('id')
          .eq('from_artist_id', meta.from_artist_id)
          .eq('to_artist_id', artist.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        reqId = found?.id || null;
      }

      if (!reqId) { console.warn('No request_id found'); setLoading(null); return; }
      const newStatus = action === 'accept' ? 'accepted' : 'declined';
      const { data: reqData, error: updateErr } = await supabase
        .from('collab_requests')
        .update({ status: newStatus, responded_at: new Date().toISOString() })
        .eq('id', reqId)
        .select('collaboration_id')
        .maybeSingle();
      // Also update the collaborations table
      if (reqData?.collaboration_id) {
        await supabase.from('collaborations')
          .update({ status: newStatus, ...(action === 'accept' ? { accepted_at: new Date().toISOString() } : {}) })
          .eq('id', reqData.collaboration_id);
      }

      // Notify the requester
      if (artist && meta.from_artist_id) {
        await supabase.from('notifications').insert({
          artist_id: meta.from_artist_id,
          type:      action === 'accept' ? 'collab_accepted' : 'collab_declined',
          title:     action === 'accept'
            ? `${artist.artist_name} accepted your collab`
            : `${artist.artist_name} declined your collab`,
          message:   meta.track_title ? `Track: "${meta.track_title}"` : '',
          metadata:  { from_artist_id: artist.id, from_artist_slug: artist.slug, track_title: meta.track_title },
        });
      }
      setDone(action);
      // Update the notification type so it no longer shows action buttons after refetch
      await supabase.from('notifications')
        .update({ type: action === 'accept' ? 'collab_accepted' : 'collab_declined', read: true })
        .eq('id', notif.id);
      setTimeout(() => onActioned?.(), 1200);
    } catch (err) {
      console.warn('Collab action failed:', err);
    }
    setLoading(null);
  };

  if (done) {
    return (
      <div className="mt-2 text-xs text-white/30 italic">
        {done === 'accept' ? '✓ Accepted' : '✗ Declined'}
      </div>
    );
  }

  return (
    <div
      className="flex items-center space-x-2 mt-2"
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={() => act('accept')}
        disabled={!!loading}
        className="flex-1 py-2 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-xs font-semibold transition active:scale-95 disabled:opacity-40 flex items-center justify-center space-x-1"
      >
        {loading === 'accept' ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        <span>Accept</span>
      </button>
      <button
        onClick={() => act('decline')}
        disabled={!!loading}
        className="flex-1 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400/70 text-xs font-semibold transition active:scale-95 disabled:opacity-40 flex items-center justify-center space-x-1"
      >
        {loading === 'decline' ? <Loader className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
        <span>Decline</span>
      </button>
    </div>
  );
}

// ─── Follow back button ────────────────────────────────────────────────────────
function FollowBackButton({ artistId }) {
  const { user } = useAuth();
  const [following, setFollowing]   = useState(false);
  const [checked,   setChecked]     = useState(false);
  const [loading,   setLoading]     = useState(false);

  useEffect(() => {
    if (!user || !artistId) return;
    supabase.from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('artist_id', artistId)
      .maybeSingle()
      .then(({ data }) => { setFollowing(!!data); setChecked(true); });
  }, [user, artistId]);

  if (!checked || !artistId) return null;

  const toggle = async (e) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    if (following) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('artist_id', artistId);
      setFollowing(false);
    } else {
      await supabase.from('follows').upsert(
        { follower_id: user.id, artist_id: artistId },
        { onConflict: 'follower_id,artist_id', ignoreDuplicates: true }
      );
      setFollowing(true);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={toggle}
      className={`mt-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
        following
          ? 'bg-white/[0.06] text-white/40 border border-white/[0.08]'
          : 'bg-pink-500/15 text-pink-400 border border-pink-500/25'
      }`}
    >
      {loading ? '…' : following ? 'Following' : 'Follow back'}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const navigate = useNavigate();
  const { artist, user } = useAuth();
  const { playTrack, replaceQueue } = usePlayer();
  const { unreadCount, markAsRead, markAllRead, clearAll } = useNotifications();
  const [filter,      setFilter]      = useState('all');
  const [expandedIds, setExpandedIds] = useState([]);
  const [replyingTo,  setReplyingTo]  = useState(null);   // notif.id with open reply box
  const [allNotifs,   setAllNotifs]   = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [page,        setPage]        = useState(0);
  const [hasMore,     setHasMore]     = useState(false);
  const PAGE_SIZE = 30;

  const toggleExpand = (id) => setExpandedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  const fetchAll = useCallback(async (pageNum = 0) => {
    if (!user) return;
    if (pageNum === 0) setPageLoading(true);
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (artist) {
        query = query.or(`artist_id.eq.${artist.id},user_id.eq.${user.id}`);
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (error) {
        if (error.code === '42P01') console.warn('notifications table does not exist yet');
        else console.error('Notifications fetch error:', error);
        setAllNotifs([]);
      } else {
        const incoming = data || [];
        setAllNotifs(prev => pageNum === 0 ? incoming : [...prev, ...incoming]);
        setHasMore(incoming.length === PAGE_SIZE);
      }
    } catch (err) {
      console.error('Notifications fetch error:', err);
    }
    setPageLoading(false);
  }, [artist, user]);

  useEffect(() => { setPage(0); fetchAll(0); }, [fetchAll, unreadCount]);

  // Realtime: re-fetch when notifications are inserted OR updated (digest updates)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications-page')
      .on('postgres_changes', {
        event: '*', // INSERT and UPDATE
        schema: 'public',
        table: 'notifications',
        filter: artist ? `artist_id=eq.${artist.id}` : `user_id=eq.${user.id}`,
      }, () => {
        fetchAll(0); // refresh the list
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, artist, fetchAll]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchAll(next);
  };

  const filtered = allNotifs.filter(n => filterMatch(n.type, filter) && !HIDDEN_TYPES.has(n.type));

  // Group by date
  const grouped = {};
  filtered.forEach(n => {
    const d = new Date(n.created_at);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    let key;
    if (d.toDateString() === today.toDateString()) key = 'Today';
    else if (d.toDateString() === yesterday.toDateString()) key = 'Yesterday';
    else key = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(n);
  });

  // Types that have inline actions (don't navigate on tap)
  const INLINE_ACTION_TYPES = new Set(['collab_request']);
  const READ_ONLY_TYPES = new Set([
    'streak','top_supporter','weekly_report','monthly_wrapped',
    'bug_report',
  ]);

  const handleClick = async (notif) => {
    markAsRead(notif.id);
    if (INLINE_ACTION_TYPES.has(notif.type)) return;
    if (READ_ONLY_TYPES.has(notif.type)) return;

    const type = notif.type;
    const meta = notif.metadata || {};

    if (type === 'session_live') {
      if (meta.url) { navigate(meta.url); return; }
      if (meta.session_id) { navigate(`/session/${meta.session_id}`); return; }
      if (meta.artist_slug) { navigate(`/artist/${meta.artist_slug}`); return; }
      navigate('/browse');
      return;
    }

    if (type === 'new_stream') {
      // new_stream is sent to the track's artist — take them to their own track
      const streamTrackId = meta.track_id || notif.track_id;
      if (meta.track_slug) { navigate(`/track/${meta.track_slug}`); return; }
      if (streamTrackId) { navigate(`/track/${streamTrackId}`); return; }
      if (artist?.slug) { navigate(`/artist/${artist.slug}`); return; }
      navigate('/browse');
      return;
    }

    if (type === 'track_commented' || type === 'new_comment') {
      const commentTrackId = meta.track_id || notif.track_id;
      if (meta.post_id) { navigate(`/feed?post=${meta.post_id}`); return; }
      if (commentTrackId) { navigate(`/?openComments=${commentTrackId}`); return; }
      if (meta.track_slug) { navigate(`/?openCommentsSlug=${meta.track_slug}`); return; }
      if (meta.artist_slug) { navigate(`/artist/${meta.artist_slug}`); return; }
      navigate('/browse');
      return;
    }

    if ((type === 'new_post' || type === 'mention') && meta.post_id) { navigate(`/feed?post=${meta.post_id}`); return; }
    if (type === 'new_post' && !meta.post_id) { navigate(meta.artist_slug ? `/artist/${meta.artist_slug}` : '/browse'); return; }
    if (meta.post_like && meta.post_id) { navigate(`/feed?post=${meta.post_id}`); return; }
    if (type === 'playlist_add' || meta.playlist_add) {
      if (meta.playlist_id) { navigate(`/library/playlists?playlist=${meta.playlist_id}`); return; }
      navigate('/library/playlists');
      return;
    }

    if (type === 'track_liked') {
      // For story likes — no track involved
      if (meta.story_id) { navigate(`/artist/${notif.from_artist?.slug || meta.from_artist_slug || ''}`); return; }
      // Use notification row track_id as fallback (most reliable)
      const likedTrackId = meta.track_id || notif.track_id;
      const likedTrackSlug = meta.track_slug || null;
      if (likedTrackSlug) { navigate(`/track/${likedTrackSlug}`); return; }
      if (likedTrackId) { navigate(`/track/${likedTrackId}`); return; }
      if (meta.artist_slug) { navigate('/artist/' + meta.artist_slug); return; }
      if (artist?.slug) { navigate(`/artist/${artist.slug}`); return; }
      navigate('/hub');
      return;
    }

    if (type === 'new_follower') {
      if (meta.from_artist_slug) { navigate('/artist/' + meta.from_artist_slug); return; }
      if (notif.from_artist?.slug) { navigate('/artist/' + notif.from_artist.slug); return; }
      navigate('/community');
      return;
    }

    if (type === 'new_track') {
      // Resolve track_id from metadata or notification row directly (handles old format)
      const trackId    = meta.track_id    || notif.track_id;
      const trackTitle = meta.track_title || notif.message;
      if (trackId && trackTitle) {
        // Verify track still exists and is published before playing
        const { data: liveTrack } = await supabase
          .from('tracks')
          .select('id, title, file_url, cover_artwork_url, slug, artist_id, is_published, artists(artist_name, slug)')
          .eq('id', trackId)
          .eq('is_published', true)
          .maybeSingle();

        if (!liveTrack?.file_url) return; // track deleted or unpublished — bail silently

        const seedTrack = {
          id:                liveTrack.id,
          title:             liveTrack.title,
          file_url:          liveTrack.file_url,
          cover_artwork_url: liveTrack.cover_artwork_url || meta.track_artwork || null,
          artist_name:       liveTrack.artists?.artist_name || meta.artist_name || '',
          artist_slug:       liveTrack.artists?.slug || meta.artist_slug || '',
          slug:              liveTrack.slug || meta.track_slug || null,
        };
        // Start playing immediately, then build artist queue in background
        playTrack(seedTrack, [seedTrack]);
        (async () => {
          try {
            const { data: trackRow } = await supabase
              .from('tracks').select('artist_id').eq('id', trackId).maybeSingle();
            if (!trackRow?.artist_id) return;
            const { data: artistTracks } = await supabase
              .from('tracks')
              .select('id, title, file_url, cover_artwork_url, slug, artist_id, artists(artist_name, slug)')
              .eq('artist_id', trackRow.artist_id)
              .eq('is_published', true)
              .order('engagement_score', { ascending: false })
              .limit(20);
            if (!artistTracks?.length) return;
            const queue = artistTracks.map(t => ({
              ...t,
              artist_name: t.artists?.artist_name || meta.artist_name || '',
              artist_slug: t.artists?.slug || meta.artist_slug || '',
            }));
            const idx = queue.findIndex(t => t.id === trackId);
            if (idx > 0) { queue.splice(idx, 1); queue.unshift(seedTrack); }
            else if (idx === -1) { queue.unshift(seedTrack); }
            if (window.__feelz_replaceQueue) window.__feelz_replaceQueue(queue, 0);
          } catch {}
        })();
        if (meta.track_slug) { navigate(`/track/${meta.track_slug}`); return; }
        if (meta.artist_slug) { navigate(`/artist/${meta.artist_slug}`); return; }
        return;
      }
      navigate(meta.artist_slug ? `/artist/${meta.artist_slug}` : '/browse');
      return;
    }

    if (type === 'tier_granted')                         { navigate('/profile'); return; }
    if (type === 'weekly_report')                         { navigate('/dashboard?tab=analytics&section=stats'); return; }
    if (type === 'download') {
      const dlTrackId = meta.track_id || notif.track_id;
      if (meta.track_slug) { navigate(`/track/${meta.track_slug}`); return; }
      if (dlTrackId) { navigate(`/track/${dlTrackId}`); return; }
      navigate(artist ? '/dashboard?tab=analytics&section=downloads' : '/library/downloads');
      return;
    }
    if (type === 'tip')                                  { navigate('/dashboard?tab=analytics&section=earnings'); return; }
    if (type === 'payout_pending')                       { navigate('/dashboard?tab=analytics&section=earnings'); return; }
    if (type === 'announcement' || type === 'admin_message') {
      if (meta.action_url) { window.open(meta.action_url, '_blank'); return; }
      if (meta.cta_url) { window.open(meta.cta_url, '_blank'); return; }
      return;
    }
    if (type === 'first_listener') {
      const flTrackId = meta.track_id || notif.track_id;
      if (meta.track_slug) { navigate(`/track/${meta.track_slug}`); return; }
      if (flTrackId) { navigate(`/track/${flTrackId}`); return; }
      if (artist) { navigate('/dashboard?tab=analytics&section=tracks'); return; }
      if (meta.artist_slug) { navigate(`/artist/${meta.artist_slug}`); return; }
      navigate('/browse');
      return;
    }
    if (type?.startsWith('collab_')) {
      const collabTrackId = meta.track_id || notif.track_id;
      if (meta.track_slug) { navigate(`/track/${meta.track_slug}`); return; }
      if (collabTrackId) { navigate(`/track/${collabTrackId}`); return; }
      navigate(artist ? '/dashboard?tab=collabs' : '/community');
      return;
    }
    if (type?.startsWith('milestone_')) {
      const msTrackId = meta.track_id || notif.track_id;
      if (meta.track_slug) { navigate(`/track/${meta.track_slug}`); return; }
      if (msTrackId) { navigate(`/track/${msTrackId}`); return; }
      navigate(artist ? '/dashboard?tab=analytics&section=stats' : '/browse');
      return;
    }
    if (type === 'competition_winner' || type === 'competition_result') {
      if (meta.competition_id) { navigate(`/competition/${meta.competition_id}`); return; }
      navigate('/competitions');
      return;
    }
    if (type === 'engagement') {
      if (meta.url) { navigate(meta.url); return; }
      navigate(artist ? '/hub' : '/browse');
      return;
    }
    if (type === 'top_supporter') {
      if (meta.artist_slug) { navigate(`/artist/${meta.artist_slug}`); return; }
      navigate(artist ? '/dashboard?tab=analytics&section=followers' : '/browse');
      return;
    }
    if (type === 'wheel_challenge') { navigate('/competitions'); return; }
    if (type === 'wheel_winner') {
      if (meta.competition_id) { navigate(`/competition/${meta.competition_id}`); return; }
      navigate('/competitions');
      return;
    }
    if (type === 'tier_upgrade' || type === 'tier_downgrade') { navigate('/listener/upgrade'); return; }
    if (type === 'artist_thought') { navigate(meta.artist_slug ? `/artist/${meta.artist_slug}` : '/browse'); return; }
  };

  // Unread count badge for filter tabs
  const unreadByFilter = {};
  allNotifs.filter(n => !n.read).forEach(n => {
    FILTERS.forEach(f => {
      if (filterMatch(n.type, f.key)) unreadByFilter[f.key] = (unreadByFilter[f.key] || 0) + 1;
    });
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/40 text-sm">Sign in to view notifications</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-32">
      <Helmet>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <title>Notifications · Feelz Machine</title>
        <meta name="description" content="Your Feelz Machine notifications, followers, collabs, likes and milestones." />
        <link rel="canonical" href="https://www.feelzmachine.com/notifications" />
      </Helmet>

      {/* Header */}
      <div className="flex items-center justify-between mb-5 sticky top-0 z-20 bg-black/95 backdrop-blur-xl pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04]">
        <div className="flex items-center space-x-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Notifications</h1>
            {unreadCount > 0 && <p className="text-xs text-white/40">{unreadCount} unread</p>}
          </div>
        </div>
        {/* Header actions */}
        <div className="flex items-center space-x-1">
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition"
              title="Mark all read">
              <CheckCheck className="w-4 h-4 text-white/40" />
            </button>
          )}
          {allNotifs.length > 0 && (
            <button onClick={async () => { await clearAll(); fetchAll(0); }}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-red-500/10 transition"
              title="Clear all">
              <Trash2 className="w-4 h-4 text-white/30 hover:text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs with unread badges */}
      <div className="flex space-x-1 bg-white/[0.03] rounded-xl p-1 mb-5 overflow-x-auto no-scrollbar">
        {FILTERS.filter(f => artist || f.key !== 'collabs').map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`relative flex-shrink-0 flex-1 py-2 px-3 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              filter === f.key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
            }`}>
            {f.label}
            {unreadByFilter[f.key] > 0 && filter !== f.key && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-purple-500 text-white text-[8px] flex items-center justify-center font-bold">
                {unreadByFilter[f.key] > 9 ? '9+' : unreadByFilter[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {pageLoading ? (
        <div className="flex justify-center py-16">
          <Loader className="w-5 h-5 animate-spin text-white/30" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-10 h-10 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">
            {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
          </p>
          {!artist && filter === 'all' && (
            <p className="text-white/15 text-xs mt-2">Follow artists to get notified when they drop new music</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, notifs]) => (
            <div key={date}>
              <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-2 px-1">{date}</p>
              <div className="space-y-1">
                {notifs.map((notif) => {
                  const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.new_stream;
                  const Icon   = config.icon;
                  const meta   = notif.metadata || {};
                  const isRead = notif.read;
                  const isReplyOpen   = replyingTo === notif.id;
                  const isExpandable  = (notif.message?.length > 80);
                  const isExpanded    = expandedIds.includes(notif.id);
                  const hasTrackPill  = !!meta.track_title && !!meta.track_id;
                  const hasActionUrl  = !!meta.action_url || !!meta.cta_url || !!meta.url || !!meta.link_url;
                  // Orphaned stream notification, has no track data
                  const isOrphanStream = notif.type === 'new_stream' && !meta.track_title;
                  const isCollabReq   = notif.type === 'collab_request';
                  const isEngagement  = notif.type === 'engagement' || notif.type === 'announcement' || notif.type === 'admin_message';
                  const isNewFollower = notif.type === 'new_follower';
                  const isComment     = notif.type === 'track_commented' || notif.type === 'new_comment';
                  const canReply      = isComment && (meta.post_id || meta.track_id);
                  const actionUrl     = meta.action_url || meta.cta_url || meta.url || meta.link_url || null;
                  const actionLabel   = meta.cta_label || meta.action_label || meta.link_label || (meta.feature_education ? 'Open Feature' : 'Learn more');

                  // Skip orphaned stream notifications (no track data - old DB trigger leftovers)
                  if (isOrphanStream) return null;

                  // Monthly wrapped gets its own card
                  if (notif.type === 'monthly_wrapped') {
                    return (
                      <div key={notif.id} onClick={() => { if (!notif.read) markAsRead(notif.id); }}>
                        <WrappedCard notification={notif} compact />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={notif.id}
                      onClick={() => handleClick(notif)}
                      className={`w-full flex items-start space-x-3 px-4 py-3.5 rounded-xl transition-all text-left cursor-pointer ${
                        !isRead
                          ? 'bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.05]'
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      {/* Avatar / Icon */}
                      {meta.from_artist_image ? (
                        <div className="relative flex-shrink-0">
                          <img src={meta.from_artist_image} alt=""
                            className="w-11 h-11 rounded-full object-cover" />
                          <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full ${config.bg} flex items-center justify-center border-2 border-black`}>
                            <Icon className={`w-2.5 h-2.5 ${config.color}`} />
                          </div>
                        </div>
                      ) : (
                        <div className={`w-11 h-11 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-5 h-5 ${config.color}`} />
                        </div>
                      )}

                      {/* Body */}
                      <div className="flex-1 min-w-0">

                        {/* Title */}
                        <p className={`text-[15px] leading-snug font-semibold ${!isRead ? 'text-white' : 'text-white/60'}`}>
                          {notif.title}
                        </p>

                        {/* Message */}
                        {notif.message && (
                          <div className="mt-0.5">
                            <p className={`text-sm text-white/45 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                              {notif.message}
                            </p>
                            {isExpandable && (
                              <button
                                onClick={e => { e.stopPropagation(); toggleExpand(notif.id); }}
                                className="flex items-center space-x-0.5 text-[10px] text-white/20 hover:text-white/40 mt-0.5 transition"
                              >
                                <span>{isExpanded ? 'Show less' : 'Read more'}</span>
                                <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </div>
                        )}

                        {/* YouTube embed for announcements */}
                        {notif.type === 'announcement' && meta.youtube_id && (
                          <div className="mt-3 rounded-xl overflow-hidden bg-black"
                            style={{ aspectRatio: meta.is_short ? '9/16' : '16/9', maxHeight: meta.is_short ? 360 : 220 }}>
                            <iframe
                              src={`https://www.youtube.com/embed/${meta.youtube_id}`}
                              className="w-full h-full"
                              allowFullScreen title="Video"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                        )}

                        {/* Playable track pill */}
                        {hasTrackPill && (
                          <div
                            className="flex items-center space-x-2 mt-2 p-2.5 bg-white/[0.04] rounded-xl border border-white/[0.06] cursor-pointer hover:bg-white/[0.07] transition active:scale-[0.98]"
                            onClick={e => {
                              e.stopPropagation();
                              if (meta.track_id) {
                                playTrack({
                                  id:                meta.track_id,
                                  title:             meta.track_title,
                                  file_url:          meta.file_url || null,
                                  cover_artwork_url: meta.track_artwork || null,
                                  artist_name:       meta.artist_name || '',
                                  artist_slug:       meta.artist_slug || '',
                                }, []);
                              }
                            }}
                          >
                            {meta.track_artwork
                              ? <img src={meta.track_artwork} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                              : <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                                  <Music className="w-4 h-4 text-white/30" />
                                </div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-white/80 font-semibold truncate">{meta.track_title}</p>
                              {meta.artist_name && <p className="text-[11px] text-white/30 truncate">{meta.artist_name}</p>}
                            </div>
                            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                              <Play className="w-3.5 h-3.5 text-white/60 ml-0.5" />
                            </div>
                          </div>
                        )}

                        {/* Follow back button */}
                        {isNewFollower && meta.from_artist_id && (
                          <FollowBackButton artistId={meta.from_artist_id} />
                        )}

                        {/* Collab accept/decline */}
                        {isCollabReq && (
                          <CollabActions notif={notif} onActioned={() => fetchAll(0)} />
                        )}
                        {actionUrl && !isCollabReq && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (actionUrl.startsWith('http')) window.open(actionUrl, '_blank');
                              else navigate(actionUrl);
                            }}
                            className="mt-2 flex items-center space-x-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                            style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)', color: '#c4b5fd' }}
                          >
                            <span>{actionLabel}</span>
                          </button>
                        )}

                        {/* Quick reply for comments */}
                        {canReply && (
                          <div className="mt-2">
                            {!isReplyOpen ? (
                              <button
                                onClick={e => { e.stopPropagation(); setReplyingTo(notif.id); }}
                                className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-400 font-medium transition hover:bg-purple-500/15 active:scale-95"
                              >
                                <MessageCircle className="w-3 h-3" />
                                <span>Reply</span>
                              </button>
                            ) : (
                              <QuickReply
                                postId={meta.post_id}
                                trackId={meta.track_id}
                                replyType={meta.track_id ? 'track' : 'post'}
                                onSent={() => setReplyingTo(null)}
                              />
                            )}
                          </div>
                        )}

                        {/* Meta row: type badge + timestamp */}
                        <div className="flex items-center space-x-2 mt-2">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${config.bg} ${config.color}`}>
                            {config.label}
                          </span>
                          <span className="text-[11px] text-white/25">{formatDate(notif.created_at)}</span>
                        </div>
                      </div>

                      {/* Unread dot */}
                      {!isRead && (
                        <div className="w-2 h-2 rounded-full bg-white mt-2.5 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={loadMore}
              className="w-full py-3 text-sm text-white/30 hover:text-white/50 transition flex items-center justify-center space-x-2"
            >
              <ChevronDown className="w-4 h-4" />
              <span>Load older notifications</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}