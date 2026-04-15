import { useEffect } from 'react';
import { supabase } from './supabaseClient';

/**
 * Auto-refresh Supabase session every 30 minutes to prevent timeout.
 * Supabase sessions expire after 1 hour by default.
 */
export function useSessionRefresh() {
  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.refreshSession();
      }
    }, 30 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, []);
}
