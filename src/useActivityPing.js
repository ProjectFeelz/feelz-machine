import { useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

/**
 * Keep session alive and update last_seen_at for engagement segmentation.
 * Pings every 5 minutes of activity — writes to artists + listeners tables
 * so the AI drip scheduler knows who's active vs dormant.
 */
export function useActivityPing() {
  const ping = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    // Refresh auth token
    await supabase.auth.getSession();

    // Update last_seen_at via DB function (updates both artists + listeners)
    try {
      await supabase.rpc('update_last_seen', { p_user_id: session.user.id });
    } catch (_) {}
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    let lastPing = 0; // force immediate ping on mount

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastPing > 5 * 60 * 1000) {
        ping();
        lastPing = now;
      }
    };

    // Ping immediately on mount
    ping();

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [ping]);
}
