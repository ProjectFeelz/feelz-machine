import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { sendNotification } from '../utils/notify';
import { useAuth } from './AuthContext';

// Helper to create a notification from anywhere in the app.
//
// Routed through send_notification (migration 106) rather than inserting
// directly. The INSERT policy on notifications permits only self-addressed
// rows, and every caller of this helper is telling somebody ELSE about
// something — so the direct insert it used to do returned 403 every time,
// logged the error, and moved on.
//
// collaboration_id and from_artist_id are not columns the RPC writes, so they
// travel in metadata, which is where the notification renderers already look
// for from_artist_id.
// Past this, the badge says 99+. See fetchUnreadCount for why it is capped.
const UNREAD_CAP = 99;

export async function createNotification({ artistId, userId, type, title, message, fromArtistId, trackId, collaborationId, metadata }) {
  const { error } = await sendNotification(supabase, `${type} (createNotification)`, {
    type,
    artistId:        artistId || null,
    recipientUserId: userId || null,
    title:           title || null,
    message:         message || null,
    trackId:         trackId || null,
    metadata: {
      ...(metadata || {}),
      ...(fromArtistId    ? { from_artist_id: fromArtistId }       : {}),
      ...(collaborationId ? { collaboration_id: collaborationId }  : {}),
    },
  });
  if (error) console.error('Create notification error:', error);
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

  // TWO QUERIES, NOT ONE OR. THIS IS THE 503.
  //
  // The old shape was "artist_id = me OR user_id = me, newest first, 20".
  // There is an index on (artist_id, created_at DESC) and another on user_id,
  // and Postgres cannot walk two different indexes in created_at order. So it
  // read EVERY row matching either side, sorted the lot, and handed back
  // twenty. I ran it: a seq scan over the whole table into a top-N sort, to
  // return 20 rows. That cost grows with the table forever, and the request
  // comes back 503 the moment it crosses the statement timeout.
  //
  // Adding the missing index does not fix it on its own. I tried that first
  // and the plan did not change, because the problem is not a missing index,
  // it is that an OR across two columns cannot preserve one ordering.
  //
  // Asking twice does fix it. Each side is its own index scan with its own
  // LIMIT, so the database reads at most 20 rows per side and stops. Measured
  // on a seeded copy: 4,000 rows scanned became 21, estimated cost 220 became
  // 2.19, and unlike the old shape it stays flat as the table grows.
  //
  // Merging in JS is correct, not a shortcut. Each side arrives already sorted
  // newest first, so the newest `limit` of the union is in the first `limit`
  // of the two lists combined. Dedupe is needed because a notification with
  // both artist_id and user_id set comes back on both sides.
  //
  // Needs migration 218_notifications_indexes.sql for the (user_id,
  // created_at DESC) index. Without it the user side falls back to a scan and
  // half the win is gone.
  const fetchNotifications = useCallback(async (limit = 20) => {
    if (!artist && !user) return;

    const select = `
      *,
      from_artist:artists!notifications_from_artist_id_fkey(id, artist_name, profile_image_url, slug),
      track:tracks!notifications_track_id_fkey(id, title, cover_artwork_url)
    `;
    const side = (column, value) => supabase
      .from('notifications')
      .select(select)
      .eq(column, value)
      .order('created_at', { ascending: false })
      .limit(limit);

    const queries = [side('user_id', user.id)];
    if (artist) queries.push(side('artist_id', artist.id));

    const results = await Promise.all(queries);

    // One side failing must not blank the list. If the artist side 503s and
    // the user side is fine, showing the user's half beats showing nothing.
    const failed = results.filter(r => r.error);
    if (failed.length === results.length) {
      console.error('[notifications] fetch failed:', failed[0].error.code, failed[0].error.message);
      setLoading(false);
      return;
    }
    if (failed.length) {
      console.warn('[notifications] one side failed:', failed[0].error.code, failed[0].error.message);
    }

    const byId = new Map();
    for (const r of results) {
      for (const n of (r.data || [])) byId.set(n.id, n);
    }
    // Tie broken on id. Two notifications written in the same instant sort
    // either way otherwise, and the order would change between refreshes for
    // no reason the reader can see. The old single query had the same
    // ambiguity, it just hid inside the database.
    const merged = [...byId.values()]
      .sort((a, b) =>
        (new Date(b.created_at) - new Date(a.created_at))
        || String(a.id).localeCompare(String(b.id)))
      .slice(0, limit);

    setNotifications(merged);
    setUnreadCount(merged.filter(n => !n.read).length);
    setLoading(false);
  }, [artist, user]);

  // ── THE 503 ON /rest/v1/notifications ────────────────────────────────────
  //
  // This asked for `count: 'exact'` with `head: true`, every two minutes, for
  // every signed-in person. An exact count is not a cheap lookup: Postgres has
  // to walk every row matching the filter, under RLS, and produce a real
  // total. On a notifications table that only ever grows, that gets slower
  // every week until it passes the statement timeout, and a timed-out HEAD
  // request comes back as a 503.
  //
  // Same shape as the 503 on track_likes from the For You page, same cause,
  // second place it was written.
  //
  // WHY A CAPPED COUNT IS THE RIGHT ANSWER, NOT A FASTER ONE
  //
  // Nobody needs to know they have 1,483 unread notifications. The badge is a
  // nudge, and every badge in every app stops counting somewhere. So it asks
  // for ids up to a cap and counts what comes back: a bounded index scan
  // instead of an unbounded aggregate, and the same number on screen for
  // anybody with fewer than the cap, which is almost everybody.
  //
  // Past the cap the badge shows 99+, which is what it should have said all
  // along rather than a precise number nobody reads.
  //
  // Split the same way as fetchNotifications above, and for the same reason.
  // Capping the count fixed the exact-count problem but left the OR in place,
  // so this still asked the database to evaluate two columns and could not use
  // either index cleanly. Migration 218 adds partial indexes on the unread
  // rows only, which is a small index because unread is the minority, and each
  // side here is a bounded scan of it.
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;

    const side = (column, value) => supabase
      .from('notifications')
      .select('id')
      .eq('read', false)
      .eq(column, value)
      .limit(UNREAD_CAP + 1);

    const queries = [side('user_id', user.id)];
    if (artist) queries.push(side('artist_id', artist.id));

    const results = await Promise.all(queries);

    if (results.every(r => r.error)) {
      // Leave the last known number alone rather than dropping the badge to
      // zero on a blip. A badge that flickers to nothing and back reads as
      // notifications being lost.
      const e = results[0].error;
      console.warn('[notifications] unread count failed:', e.code, e.message);
      return;
    }

    // Deduped, because a row carrying both ids is returned by both sides and
    // would otherwise be counted twice.
    const ids = new Set();
    for (const r of results) {
      for (const n of (r.data || [])) ids.add(n.id);
    }
    setUnreadCount(ids.size);
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

    // Dedup set — prevents double-fire when both user_id and artist_id
    // channels receive the same notification INSERT simultaneously
    const seenIds = new Set();

    const handleInsert = (payload) => {
      const id = payload.new?.id;
      if (!id || seenIds.has(id)) return;
      seenIds.add(id);
      // Clean up old ids to prevent memory growth
      if (seenIds.size > 200) {
        const arr = [...seenIds];
        arr.slice(0, 100).forEach(old => seenIds.delete(old));
      }
      setNotifications(prev =>
        prev.some(n => n.id === id) ? prev : [payload.new, ...prev]
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