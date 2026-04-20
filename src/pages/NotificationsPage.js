import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Bell, Users, Heart, MessageCircle, TrendingUp, UserPlus,
  Check, X, ChevronLeft, Loader, CheckCheck, Trash2, Music, Download, Megaphone,
  Radio, FileText
} from 'lucide-react';
import useNotifications from '../contexts/useNotifications';
import WrappedCard from '../components/WrappedCard';

const TYPE_CONFIG = {
  collab_request:   { icon: Users,         color: 'text-blue-400',   bg: 'bg-blue-500/10',   label: 'Collab Request' },
  collab_accepted:  { icon: Check,         color: 'text-green-400',  bg: 'bg-green-500/10',  label: 'Collab Accepted' },
  collab_declined:  { icon: X,             color: 'text-white/30',   bg: 'bg-white/[0.06]',  label: 'Collab Declined' },
  new_follower:     { icon: UserPlus,      color: 'text-pink-400',   bg: 'bg-pink-500/10',   label: 'New Follower' },
  track_liked:      { icon: Heart,         color: 'text-red-400',    bg: 'bg-red-500/10',    label: 'Track Liked' },
  track_commented:  { icon: MessageCircle, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Comment' },
  milestone_100:    { icon: TrendingUp,    color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Milestone' },
  milestone_500:    { icon: TrendingUp,    color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Milestone' },
  milestone_1k:     { icon: TrendingUp,    color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Milestone' },
  milestone_10k:    { icon: TrendingUp,    color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Milestone' },
  milestone_stream: { icon: TrendingUp,    color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Milestone' },
  download:         { icon: Download,      color: 'text-green-400',  bg: 'bg-green-500/10',  label: 'Download' },
  announcement:     { icon: Megaphone,     color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Announcement' },
  new_stream:       { icon: Radio,         color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   label: 'New Stream' },
  new_post:         { icon: FileText,      color: 'text-indigo-400', bg: 'bg-indigo-500/10', label: 'New Post' },
  mention:          { icon: MessageCircle, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Mention' },
  tier_granted:     { icon: TrendingUp,    color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Tier Update' },
  new_track:        { icon: Music,         color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'New Track' },
  playlist_add:     { icon: Music,         color: 'text-blue-400',   bg: 'bg-blue-500/10',   label: 'Playlist Add' },
  competition_winner: { icon: TrendingUp,  color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Winner!' },
  engagement:       { icon: Bell,          color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'For You' },
  monthly_wrapped:  { icon: TrendingUp,    color: 'text-pink-400',   bg: 'bg-pink-500/10',   label: 'Monthly Wrapped' },
  top_supporter:    { icon: Heart,         color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Top Supporter' },
  streak:           { icon: Bell,          color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Streak' },
  session_live:     { icon: Radio,         color: 'text-red-400',    bg: 'bg-red-500/10',    label: 'Live Session' },
  weekly_report:    { icon: TrendingUp,    color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   label: 'Weekly Report' },
  first_listener:   { icon: Heart,         color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'First! 🎯' },
  tip:              { icon: Heart,         color: 'text-pink-400',   bg: 'bg-pink-500/10',   label: 'Tip Received' },
};

const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'collabs',    label: 'Collabs' },
  { key: 'social',     label: 'Social' },
  { key: 'milestones', label: 'Milestones' },
];

function filterMatch(type, filter) {
  if (filter === 'all') return true;
  if (filter === 'collabs') return type?.startsWith('collab_');
  if (filter === 'social') return ['new_follower', 'track_liked', 'playlist_add', 'track_commented', 'new_post', 'new_stream', 'mention', 'engagement'].includes(type);
  if (filter === 'milestones') return type?.startsWith('milestone_');
  return true;
}

function formatDate(date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { artist, user } = useAuth();
  const { unreadCount, markAsRead, markAllRead, clearAll } = useNotifications();
  const [filter, setFilter] = useState('all');
  const [allNotifs, setAllNotifs] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setPageLoading(true);
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (artist) {
        query = query.eq('artist_id', artist.id);
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (error) {
        if (error.code === '42P01') {
          console.warn('notifications table does not exist yet');
          setAllNotifs([]);
        } else {
          console.error('Notifications fetch error:', error);
          setAllNotifs([]);
        }
      } else {
        setAllNotifs(data || []);
      }
    } catch (err) {
      console.error('Notifications fetch error:', err);
      setAllNotifs([]);
    }
    setPageLoading(false);
  }, [artist, user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = allNotifs.filter(n => filterMatch(n.type, filter));

  // Group by date
  const grouped = {};
  filtered.forEach(n => {
    const d = new Date(n.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    let key;
    if (d.toDateString() === today.toDateString()) key = 'Today';
    else if (d.toDateString() === yesterday.toDateString()) key = 'Yesterday';
    else key = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(n);
  });

  const handleClick = (notif) => {
    if (!notif.read) markAsRead(notif.id);
    const type = notif.type;
    const meta = notif.metadata || {};

    if (type === 'session_live' && meta.session_id) {
      navigate(`/session/${meta.session_id}`);
      return;
    }

    if (type === 'new_stream') {
      if (artist) {
        navigate('/dashboard?tab=analytics');
      } else if (meta.artist_slug) {
        navigate('/artist/' + meta.artist_slug);
      } else {
        navigate('/browse');
      }
      return;
    }

    if (type === 'new_post' && meta.post_id) {
      navigate(`/feed?post=${meta.post_id}`);
      return;
    }

    if (type === 'new_post' && !meta.post_id) {
      if (notif.track_id) {
        navigate(notif.from_artist_id
          ? `/artist/${meta.artist_slug || ''}`
          : '/browse');
      } else {
        navigate('/browse');
      }
      return;
    }

    if (type === 'mention' && meta.post_id) {
      navigate(`/feed?post=${meta.post_id}`);
      return;
    }

    if (type === 'track_commented' && meta.post_id) {
      navigate(`/feed?post=${meta.post_id}`);
      return;
    }

    if (meta.post_like && meta.post_id) {
      navigate(`/feed?post=${meta.post_id}`);
      return;
    }

    if (type === 'playlist_add' || meta.playlist_add) {
      navigate('/library/playlists');
      return;
    }

    if (type === 'track_liked' && meta.artist_slug) {
      navigate('/artist/' + meta.artist_slug);
      return;
    }

    if (type === 'new_follower' && meta.from_artist_slug) {
      navigate('/artist/' + meta.from_artist_slug);
      return;
    }

    if (type === 'new_track') {
      const slug = meta.artist_slug;
      navigate(slug ? `/artist/${slug}` : '/browse');
      return;
    }

    if (type === 'tier_granted') {
      navigate('/profile');
      return;
    }

    if (type === 'download') {
      navigate(artist ? '/dashboard?tab=analytics' : '/library');
      return;
    }

    if (type === 'weekly_report') {
      navigate('/dashboard?tab=analytics');
      return;
    }

    if (type === 'tip') {
      navigate('/dashboard?tab=analytics');
      return;
    }

    if (type === 'first_listener') {
      if (meta.track_id) navigate(`/track/${meta.track_id}`);
      return;
    }

    if (type?.startsWith('collab_')) {
      navigate(artist ? '/dashboard?tab=collabs' : '/');
      return;
    }

    if (type?.startsWith('milestone_')) {
      if (artist) {
        navigate('/dashboard?tab=analytics');
      } else {
        return;
      }
      return;
    }

    if (type === 'competition_winner' && meta.competition_id) {
      navigate(`/competition/${meta.competition_id}`);
      return;
    }

    if (type === 'engagement') {
      navigate(artist ? '/community' : '/browse');
      return;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/40 text-sm">Sign in to view notifications</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
        <Helmet>
          <title>Notifications · Feelz Machine</title>
          <meta name="description" content="Your Feelz Machine notifications — followers, collabs, likes and milestones." />
          <link rel="canonical" href="https://www.feelzmachine.com/notifications" />
        </Helmet>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 sticky top-0 z-20 bg-black/90 backdrop-blur-sm md:relative md:top-auto md:bg-transparent md:backdrop-blur-none pt-14 pb-2 -mx-4 px-4 md:pt-2">
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

        </div>

        {/* Filters */}
        <div className="flex space-x-1 bg-white/[0.03] rounded-lg p-1 mb-6">
          {FILTERS.filter(f => artist || f.key !== 'collabs').map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex-1 py-2 rounded-md text-xs font-medium transition ${
                filter === f.key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Action buttons — below filters, away from bell */}
        {(unreadCount > 0 || allNotifs.length > 0) && (
          <div className="flex items-center space-x-2 mb-4">
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="flex items-center space-x-1.5 px-3 py-2 bg-white/[0.06] rounded-xl text-xs text-white/50 hover:bg-white/[0.1] transition">
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            {allNotifs.length > 0 && (
              <button onClick={async () => { await clearAll(); fetchAll(); }}
                className="flex items-center space-x-1.5 px-3 py-2 bg-red-500/[0.06] rounded-xl text-xs text-red-400/60 hover:bg-red-500/[0.12] transition">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear all</span>
              </button>
            )}
          </div>
        )}

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
              <p className="text-white/15 text-xs mt-2">Follow artists to get notified when they post new music</p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([date, notifs]) => (
              <div key={date}>
                <p className="text-[10px] uppercase tracking-wider text-white/20 font-semibold mb-2 px-1">{date}</p>
                <div className="space-y-1">
                  {notifs.map((notif) => {
                    const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.new_follower;
                    const Icon = config.icon;
                    const meta = notif.metadata || {};

                    // Monthly wrapped — render rich card instead of generic row
                    if (notif.type === 'monthly_wrapped') {
                      return (
                        <div key={notif.id} onClick={() => { if (!notif.read) markAsRead(notif.id); }}>
                          <WrappedCard notification={notif} compact />
                        </div>
                      );
                    }

                    return (
                      <button
                        key={notif.id}
                        onClick={() => handleClick(notif)}
                        className={`w-full flex items-start space-x-3 px-4 py-3.5 rounded-xl hover:bg-white/[0.04] transition text-left ${
                          !notif.read ? 'bg-white/[0.02] border border-white/[0.06]' : ''
                        }`}
                      >
                        {meta.from_artist_image ? (
                          <div className="relative flex-shrink-0">
                            <img src={meta.from_artist_image} alt="" className="w-10 h-10 rounded-full object-cover" />
                            <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${config.bg} flex items-center justify-center border border-black`}>
                              <Icon className={`w-2.5 h-2.5 ${config.color}`} />
                            </div>
                          </div>
                        ) : (
                          <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-5 h-5 ${config.color}`} />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-relaxed ${!notif.read ? 'text-white' : 'text-white/50'}`}>
                            {notif.title}
                          </p>
                          {notif.message && (
                            <p className="text-xs text-white/30 mt-0.5 line-clamp-2">{notif.message}</p>
                          )}

                          {/* Announcement YouTube embed */}
                          {notif.type === 'announcement' && meta.youtube_id && (
                            <div className="mt-3 rounded-xl overflow-hidden bg-black"
                              style={{ aspectRatio: meta.is_short ? '9/16' : '16/9', maxHeight: meta.is_short ? 360 : 220 }}>
                              <iframe
                                src={`https://www.youtube.com/embed/${meta.youtube_id}`}
                                className="w-full h-full"
                                allowFullScreen
                                title="Video"
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                          )}

                          {/* Track thumbnail from metadata */}
                          {meta.track_title && (
                            <div className="flex items-center space-x-2 mt-2 p-2 bg-white/[0.03] rounded-lg">
                              {meta.track_artwork && (
                                <img src={meta.track_artwork} alt="" className="w-7 h-7 rounded object-cover" />
                              )}
                              <p className="text-[11px] text-white/40 truncate">{meta.track_title}</p>
                            </div>
                          )}

                          <div className="flex items-center space-x-2 mt-1.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-[10px] text-white/20">{formatDate(notif.created_at)}</span>
                          </div>
                        </div>

                        {!notif.read && (
                          <div className="w-2.5 h-2.5 rounded-full bg-white mt-2 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}