import { useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

/**
 * Keep session alive by pinging on user activity.
 * Prevents idle timeout for users browsing/listening.
 */
export function useActivityPing() {
  const ping = useCallback(async () => {
    await supabase.auth.getSession();
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    let lastPing = Date.now();

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastPing > 5 * 60 * 1000) {
        ping();
        lastPing = now;
      }
    };

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
