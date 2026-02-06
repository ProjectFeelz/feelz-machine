import { useEffect } from 'react';
import { supabase } from './supabaseClient';

/**
 * Auto-refresh Supabase session every 30 minutes to prevent timeout
 * Supabase sessions expire after 1 hour by default
 */
export function useSessionRefresh() {
  useEffect(() => {
    console.log('🔄 Session refresh hook initialized');

    // Refresh session every 30 minutes (before 1hr expiry)
    const refreshInterval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          console.error('❌ Session refresh failed:', error);
        } else {
          console.log('✅ Session refreshed automatically at', new Date().toLocaleTimeString());
        }
      } else {
        console.log('ℹ️ No active session to refresh');
      }
    }, 30 * 60 * 1000); // 30 minutes in milliseconds

    // Cleanup interval on unmount
    return () => {
      console.log('🛑 Session refresh hook cleaned up');
      clearInterval(refreshInterval);
    };
  }, []); // Empty dependency array = only run once on mount
}