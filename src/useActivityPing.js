import { useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

/**
 * Keep session alive by pinging on user activity
 * Prevents idle timeout for users browsing/previewing samples
 */
export function useActivityPing() {
  const ping = useCallback(async () => {
    // Lightweight session check to keep it alive
    await supabase.auth.getSession();
    console.log('🏓 Activity ping sent at', new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    console.log('👂 Activity listener initialized');

    // Events that indicate user is active
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    let lastPing = Date.now();
    
    const handleActivity = () => {
      const now = Date.now();
      // Only ping if 5 minutes have passed since last ping (not on every click)
      if (now - lastPing > 5 * 60 * 1000) {
        ping();
        lastPing = now;
      }
    };

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup listeners on unmount
    return () => {
      console.log('🛑 Activity listener cleaned up');
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [ping]); // Only recreate if ping function changes (it won't due to useCallback)
}