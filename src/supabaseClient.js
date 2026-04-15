import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

let client = null;

export const supabase = (() => {
  if (client) return client;

  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return client;
})();

// Helper to refresh session before heavy operations (like bulk uploads)
export async function ensureFreshSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    console.log('No session found');
    return null;
  }

  // If token expires in less than 5 minutes, refresh it
  const expiresAt = session.expires_at || 0;
  const now = Math.floor(Date.now() / 1000);
  const fiveMinutes = 5 * 60;

  if (expiresAt - now < fiveMinutes) {
    console.log('Token expiring soon, refreshing...');
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.error('Failed to refresh session:', refreshError);
      return null;
    }
    return data.session;
  }

  return session;
}