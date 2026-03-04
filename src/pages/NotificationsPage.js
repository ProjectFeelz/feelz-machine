import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Bell, Users, Heart, MessageCircle, TrendingUp, UserPlus,
  Check, X, ChevronLeft, Loader, CheckCheck, Trash2, Music, Download
} from 'lucide-react';
import useNotifications from '../contexts/useNotifications';

const TYPE_CONFIG = {
  collab_request:   { icon: Users,          color: 'text-blue-400',   bg: 'bg-blue-500/10',   label: 'Collab Request' },
  collab_accepted:  { icon: Check,          color: 'text-green-400',  bg: 'bg-green-500/10',  label: 'Collab Accepted' },
  collab_declined:  { icon: X,              color: 'text-white/30',   bg: 'bg-white/[0.06]',  label: 'Collab Declined' },
  new_follower:     { icon: UserPlus,       color: 'text-pink-400',   bg: 'bg-pink-500/10',   label: 'New Follower' },
  track_liked:      { icon: Heart,          color: 'text-red-400',    bg: 'bg-red-500/10',    label: 'Track Liked' },
  track_commented:  { icon: MessageCircle,  color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Comment' },
  milestone_100:    { icon: TrendingUp,     color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Milestone' },
  milestone_500:    { icon: TrendingUp,     color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Milestone' },
  milestone_1k:     { icon: TrendingUp,     color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Milestone' },
  milestone_10k:    { icon: TrendingUp,     color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Milestone' },
  download:         { icon: Download,        color: 'text-green-400',  bg: 'bg-green-500/10',  label: 'Download' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'collabs', label: 'Collabs' },
  { key: 'social', label: 'Social' },
  { key: 'milestones', label: 'Milestones' },
];

function filterMatch(type, filter) {
  if (filter === 'all') return true;
  if (filter === 'collabs') return type.startsWith('collab_');
  if (filter === 'social') return ['new_follower', 'track_liked', 'track_commented'].includes(type);
  if (filter === 'milestones') return type.startsWith('milestone_');
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
  const { artist } = useAuth();
  const { notifications, unreadCount, loading, markAsRead, markAllRead, clearAll, refetch } = useNotifications();
  const [filter, setFilter] = useState('all');
  const [allNotifs, setAllNotifs] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);

  // Fetch full history (more than the 20 the hook grabs)
  const fetchAll = useCallback(async () => {
    if (!artist) return;
    setPageLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select(`
        *,
        from_artist:artists!notifications_from_artist_id_fkey(id, artist_name, avatar_url, slug),
        track:tracks!notifications_track_id_fkey(id, title, cover_artwork_url)
      `)
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setAllNotifs(data || []);
    setPageLoading(false);
  }, [artist]);

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
    if (notif.type.startsWith('collab_')) navigate('/dashboard');
    else if (notif.track?.id) navigate(`/track/${notif.track.id}`);
    else if (notif.from_artist?.slug) navigate(`/artist/${notif.from_artist.slug}`);
  };

  if (!artist) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white/40 text-sm">Sign in to view notifications</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-xs text-white/40">{unreadCount} unread</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="flex items-center space-x-1 px-3 py-1.5 bg-white/[0.06] rounded-lg text-xs text-white/50 hover:bg-white/[0.1] transition">
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Read all</span>
              </button>
            )}
            {allNotifs.length > 0 && (
              <button onClick={async () => { await clearAll(); fetchAll(); }}
                className="flex items-center space-x-1 px-3 py-1.5 bg-red-500/[0.06] rounded-lg text-xs text-red-400/60 hover:bg-red-500/[0.12] transition">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex space-x-1 bg-white/[0.03] rounded-lg p-1 mb-6">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex-1 py-2 rounded-md text-xs font-medium transition ${
                filter === f.key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
              }`}>
              {f.label}
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

                    return (
                      <button
                        key={notif.id}
                        onClick={() => handleClick(notif)}
                        className={`w-full flex items-start space-x-3 px-4 py-3.5 rounded-xl hover:bg-white/[0.04] transition text-left ${
                          !notif.read ? 'bg-white/[0.02] border border-white/[0.06]' : ''
                        }`}
                      >
                        {/* Avatar or Icon */}
                        {notif.from_artist?.avatar_url ? (
                          <div className="relative flex-shrink-0">
                            <img src={notif.from_artist.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                            <div className={`absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full ${config.bg} flex items-center justify-center border border-black`}>
                              <Icon className={`w-2.5 h-2.5 ${config.color}`} />
                            </div>
                          </div>
                        ) : (
                          <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
                            <Icon className={`w-5 h-5 ${config.color}`} />
                          </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-relaxed ${!notif.read ? 'text-white' : 'text-white/50'}`}>
                            {notif.title}
                          </p>
                          {notif.message && (
                            <p className="text-xs text-white/30 mt-0.5 line-clamp-2">{notif.message}</p>
                          )}

                          {/* Track reference */}
                          {notif.track && (
                            <div className="flex items-center space-x-2 mt-2 p-2 bg-white/[0.03] rounded-lg">
                              {notif.track.cover_artwork_url ? (
                                <img src={notif.track.cover_artwork_url} alt="" className="w-7 h-7 rounded object-cover" />
                              ) : (
                                <div className="w-7 h-7 rounded bg-white/[0.06] flex items-center justify-center">
                                  <Music className="w-3 h-3 text-white/20" />
                                </div>
                              )}
                              <p className="text-[11px] text-white/40 truncate">{notif.track.title}</p>
                            </div>
                          )}

                          <div className="flex items-center space-x-2 mt-1.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
                              {config.label}
                            </span>
                            <span className="text-[10px] text-white/20">{formatDate(notif.created_at)}</span>
                          </div>
                        </div>

                        {/* Unread dot */}
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
