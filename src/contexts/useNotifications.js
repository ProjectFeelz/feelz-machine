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

// Milestone thresholds — NOTE: stream milestones are now handled by SQL triggers.
// checkStreamMilestone is kept for backwards compatibility but is a no-op.
export async function checkStreamMilestone(trackId, trackTitle, artistId, currentCount) {
  // No-op: milestone notifications are now inserted by the check_stream_milestones
  // database trigger to prevent double-firing.
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
    if (!user) return;
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

  // Initial fetch + realtime subscription for instant badge updates
  useEffect(() => {
    if (!artist && !user) return;
    fetchNotifications();

    // Realtime: listen on both artist_id AND user_id channels for artists,
    // since different notification sources use different columns.
    const handleInsert = (payload) => {
      setNotifications(prev =>
        prev.some(n => n.id === payload.new.id) ? prev : [payload.new, ...prev]
      );
      setUnreadCount(prev => prev + 1);
    };

    // Remove any stale notification channels from previous sessions
    supabase.getChannels()
      .filter(ch => ch.topic.includes('notifications-realtime'))
      .forEach(ch => supabase.removeChannel(ch));

    let channelBuilder = supabase
      .channel(`notifications-realtime-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, handleInsert)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchUnreadCount();
      });

    // Also listen on artist_id — engagement drip inserts with artist_id
    // for artist-targeted notifications, which would otherwise be missed
    if (artist?.id) {
      channelBuilder = channelBuilder.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `artist_id=eq.${artist.id}`,
      }, handleInsert);
    }

    const channel = channelBuilder.subscribe();

    // Fallback poll every 2 minutes in case realtime misses something
    pollRef.current = setInterval(fetchUnreadCount, 120000);

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [artist?.id, user?.id]);

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