import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Users, Heart, MessageCircle, TrendingUp, UserPlus,
  Check, CheckCheck, ChevronRight, Music, X, Download
} from 'lucide-react';
import useNotifications from '../contexts/useNotifications';

const TYPE_CONFIG = {
  collab_request:   { icon: Users,          color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  collab_accepted:  { icon: Check,          color: 'text-green-400',  bg: 'bg-green-500/10' },
  collab_declined:  { icon: X,              color: 'text-white/30',   bg: 'bg-white/[0.06]' },
  new_follower:     { icon: UserPlus,       color: 'text-pink-400',   bg: 'bg-pink-500/10' },
  track_liked:      { icon: Heart,          color: 'text-red-400',    bg: 'bg-red-500/10' },
  track_commented:  { icon: MessageCircle,  color: 'text-purple-400', bg: 'bg-purple-500/10' },
  milestone_100:    { icon: TrendingUp,     color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  milestone_500:    { icon: TrendingUp,     color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  milestone_1k:     { icon: TrendingUp,     color: 'text-orange-400', bg: 'bg-orange-500/10' },
  milestone_10k:    { icon: TrendingUp,     color: 'text-orange-400', bg: 'bg-orange-500/10' },
  download:         { icon: Download,        color: 'text-green-400',  bg: 'bg-green-500/10' },
};

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(date).toLocaleDateString();
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleNotificationClick = (notif) => {
    if (!notif.read) markAsRead(notif.id);

    // Navigate based on type
    if (notif.type === 'collab_request' || notif.type === 'collab_accepted' || notif.type === 'collab_declined') {
      navigate('/dashboard');
    } else if (notif.track_id && notif.track?.id) {
      navigate(`/track/${notif.track.id}`);
    } else if (notif.from_artist?.slug) {
      navigate(`/artist/${notif.from_artist.slug}`);
    }
    setOpen(false);
  };

  // Show max 8 in dropdown
  const preview = notifications.slice(0, 8);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition"
      >
        <Bell className="w-4.5 h-4.5 text-white/60" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-white text-black text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#111] border border-white/[0.1] rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-white/40 hover:text-white/60 flex items-center space-x-1 transition"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {preview.length === 0 ? (
              <div className="text-center py-10">
                <Bell className="w-8 h-8 mx-auto text-white/10 mb-2" />
                <p className="text-white/30 text-xs">No notifications yet</p>
              </div>
            ) : (
              preview.map((notif) => {
                const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.new_follower;
                const Icon = config.icon;

                return (
                  <button
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`w-full flex items-start space-x-3 px-4 py-3 hover:bg-white/[0.04] transition text-left ${
                      !notif.read ? 'bg-white/[0.02]' : ''
                    }`}
                  >
                    {/* Icon or Avatar */}
                    {notif.from_artist?.avatar_url ? (
                      <div className="relative flex-shrink-0">
                        <img src={notif.from_artist.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                        <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${config.bg} flex items-center justify-center`}>
                          <Icon className={`w-2.5 h-2.5 ${config.color}`} />
                        </div>
                      </div>
                    ) : (
                      <div className={`w-9 h-9 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-4 h-4 ${config.color}`} />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-relaxed ${!notif.read ? 'text-white' : 'text-white/50'}`}>
                        <span className="font-semibold">{notif.title}</span>
                      </p>
                      {notif.message && (
                        <p className="text-[11px] text-white/30 mt-0.5 truncate">{notif.message}</p>
                      )}
                      <p className="text-[10px] text-white/20 mt-1">{timeAgo(notif.created_at)}</p>
                    </div>

                    {/* Unread dot */}
                    {!notif.read && (
                      <div className="w-2 h-2 rounded-full bg-white mt-1.5 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <button
              onClick={() => { navigate('/notifications'); setOpen(false); }}
              className="w-full flex items-center justify-center space-x-1 px-4 py-3 border-t border-white/[0.06] hover:bg-white/[0.04] transition"
            >
              <span className="text-xs text-white/40">View all notifications</span>
              <ChevronRight className="w-3 h-3 text-white/30" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
