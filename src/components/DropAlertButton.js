/**
 * DropAlertButton.js
 * Toggle drop alerts for an artist.
 * Requires push permission — prompts if not granted.
 */
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Bell, BellOff, Loader } from 'lucide-react';

export default function DropAlertButton({ artistId, textColor = '#ffffff' }) {
  const { user } = useAuth();
  const { supported, subscribed, subscribe } = usePushNotifications(user);
  const [enabled, setEnabled]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!user || !artistId) { setLoading(false); return; }
    supabase.from('artist_alerts').select('id').eq('user_id', user.id).eq('artist_id', artistId).maybeSingle()
      .then(({ data }) => { setEnabled(!!data); setLoading(false); });
  }, [user, artistId]);

  const toggle = async () => {
    if (!user || toggling) return;
    setToggling(true);

    if (!enabled) {
      // Subscribe to push if supported and not yet subscribed
      if (supported && !subscribed) await subscribe();
      await supabase.from('artist_alerts').upsert({ user_id: user.id, artist_id: artistId }, { onConflict: 'user_id,artist_id' });
      setEnabled(true);
    } else {
      await supabase.from('artist_alerts').delete().eq('user_id', user.id).eq('artist_id', artistId);
      setEnabled(false);
    }
    setToggling(false);
  };

  if (!user || loading) return null;

  return (
    <button
      onClick={toggle}
      disabled={toggling}
      title={enabled ? 'Turn off drop alerts' : 'Get notified when this artist drops'}
      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border transition text-xs font-medium disabled:opacity-40"
      style={enabled
        ? { background: 'rgba(251,191,36,0.15)', borderColor: 'rgba(251,191,36,0.3)', color: 'rgb(251,191,36)' }
        : { background: `${textColor}08`, borderColor: `${textColor}15`, color: `${textColor}50` }
      }
    >
      {toggling ? <Loader className="w-3.5 h-3.5 animate-spin" /> : enabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
      <span>{enabled ? 'Alerts on' : 'Alert me'}</span>
    </button>
  );
}
