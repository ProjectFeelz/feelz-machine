import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

// Helper to create a notification from anywhere in the app
export async function createNotification({ artistId, type, title, message, fromArtistId, trackId, collaborationId, metadata }) {
  try {
    const { error } = await supabase.from('notifications').insert([{
      artist_id: artistId,
      type,
      title,
      message: message || null,
      from_artist_id: fromArtistId || null,
      track_id: trackId || null,
      collaboration_id: collaborationId || null,
      metadata: metadata || {},
    }]);
    if (error) console.error('Create notification error:', error);
  } catch (err) {
    console.error('Notification error:', err);
  }
}

// Milestone thresholds
const MILESTONES = [
  { count: 100, type: 'milestone_100', label: '100 streams' },
  { count: 500, type: 'milestone_500', label: '500 streams' },
  { count: 1000, type: 'milestone_1k', label: '1K streams' },
  { count: 10000, type: 'milestone_10k', label: '10K streams' },
];

export async function checkStreamMilestone(trackId, trackTitle, artistId, currentCount) {
  for (const ms of MILESTONES) {
    if (currentCount >= ms.count) {
      // Check if this milestone notification already exists
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('track_id', trackId)
        .eq('type', ms.type);

      if (count === 0) {
        await createNotification({
          artistId,
          type: ms.type,
          title: `${trackTitle} hit ${ms.label}!`,
          message: `Your track just reached ${ms.label}. Keep it going!`,
          trackId,
        });
      }
    }
  }
}

export default function useNotifications() {
  const { artist, user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);

  const fetchNotifications = useCallback(async (limit = 20) => {
    if (!artist && !user) return;
    try {
      let query = supabase
        .from('notifications')
        .select(`
          *,
          from_artist:artists!notifications_from_artist_id_fkey(id, artist_name, profile_image_url, slug),
          track:tracks!notifications_track_id_fkey(id, title, cover_artwork_url)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (artist) {
        query = query.or(`artist_id.eq.${artist.id},user_id.eq.${user.id}`);
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.read).length);
    } catch (err) {
      console.error('Fetch notifications error:', err);
    }
    setLoading(false);
  }, [artist, user]);

  const fetchUnreadCount = useCallback(async () => {
    if (!artist && !user) return;
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('read', false);
    if (artist) {
      query = query.or(`artist_id.eq.${artist.id},user_id.eq.${user.id}`);
    } else {
      query = query.eq('user_id', user.id);
    }
    const { count } = await query;
    setUnreadCount(count || 0);
  }, [artist, user]);

  const markAsRead = useCallback(async (notificationId) => {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!artist && !user) return;
    let query = supabase.from('notifications').update({ read: true }).eq('read', false);
    if (artist) {
      query = query.or(`artist_id.eq.${artist.id},user_id.eq.${user.id}`);
    } else {
      query = query.eq('user_id', user.id);
    }
    await query;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, [artist]);

  const clearAll = useCallback(async () => {
    if (!artist && !user) return;
    let query = supabase.from('notifications').delete();
    if (artist) {
      query = query.or(`artist_id.eq.${artist.id},user_id.eq.${user.id}`);
    } else {
      query = query.eq('user_id', user.id);
    }
    await query;
    setNotifications([]);
    setUnreadCount(0);
  }, [artist]);

  // Initial fetch + poll every 20s for unread count
  useEffect(() => {
    if (!artist && !user) return;
    fetchNotifications();
    pollRef.current = setInterval(fetchUnreadCount, 20000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [artist, fetchNotifications, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead,
    markAllRead,
    clearAll,
    refetch: fetchNotifications,
  };
}
