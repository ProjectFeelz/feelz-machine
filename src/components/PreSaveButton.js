/**
 * PreSaveButton.js
 *
 * Shows on tracks where is_preorder=true and release_date is in the future.
 * Saves the track to the user's presaves table. When the track is published,
 * the weekly-listener-recap or a dedicated cron (presave-notify) fires a
 * notification to everyone who presaved it.
 *
 * Props: track (full track object), style overrides optional
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useHaptics } from '../hooks/useHaptics';
import { Bell, BellOff, Loader, Check } from 'lucide-react';

export default function PreSaveButton({ track, textColor = '#fff', accentColor = '#8B5CF6' }) {
  const { user }                    = useAuth();
  const { tap, success }            = useHaptics();
  const [saved, setSaved]           = useState(false);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saveCount, setSaveCount]   = useState(0);
  const [justSaved, setJustSaved]   = useState(false);

  // Only render for actual pre-releases
  const isPreorder = track?.is_preorder && track?.release_date && new Date(track.release_date) > new Date();
  
  const releaseLabel = (() => {
    if (!track?.release_date) return '';
    const d = new Date(track.release_date);
    const now = new Date();
    const days = Math.ceil((d - now) / 86400000);
    if (days <= 0)  return 'Out now';
    if (days === 1) return 'Tomorrow';
    if (days <= 7)  return `${days} days`;
    if (days <= 30) return `${Math.ceil(days / 7)} weeks`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  })();

  useEffect(() => {
    if (!isPreorder || !track?.id) { setLoading(false); return; }
    const check = async () => {
      setLoading(true);
      try {
        const [presaveRes, countRes] = await Promise.all([
          user
            ? supabase.from('track_presaves').select('id').eq('track_id', track.id).eq('user_id', user.id).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from('track_presaves').select('*', { count: 'exact', head: true }).eq('track_id', track.id),
        ]);
        setSaved(!!presaveRes.data);
        setSaveCount(countRes.count || 0);
      } catch {}
      setLoading(false);
    };
    check();
  }, [track?.id, user?.id, isPreorder]);

  if (!isPreorder) return null;

  const handleToggle = async () => {
    if (!user) return;
    tap();
    setSaving(true);
    try {
      if (saved) {
        await supabase.from('track_presaves').delete().eq('track_id', track.id).eq('user_id', user.id);
        setSaved(false);
        setSaveCount(p => Math.max(0, p - 1));
      } else {
        await supabase.from('track_presaves').insert({ track_id: track.id, user_id: user.id });
        success();
        setSaved(true);
        setSaveCount(p => p + 1);
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
      }
    } catch (err) { console.error('Pre-save error:', err); }
    setSaving(false);
  };

  return (
    <div className="flex flex-col items-center space-y-1">
      <button
        onClick={handleToggle}
        disabled={saving || loading || !user}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
        style={saved
          ? { backgroundColor: `${accentColor}25`, color: accentColor, border: `1.5px solid ${accentColor}50` }
          : { backgroundColor: 'rgba(255,255,255,0.08)', color: `${textColor}80`, border: '1.5px solid rgba(255,255,255,0.12)' }
        }
      >
        {saving || loading ? (
          <Loader className="w-3 h-3 animate-spin" />
        ) : justSaved ? (
          <Check className="w-3 h-3" />
        ) : saved ? (
          <BellOff className="w-3 h-3" />
        ) : (
          <Bell className="w-3 h-3" />
        )}
        <span>
          {justSaved ? 'Saved!' : saved ? 'Saved' : 'Pre-save'}
        </span>
      </button>
      <div className="flex items-center space-x-1.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
          Drops {releaseLabel}
        </span>
        {saveCount > 0 && (
          <span className="text-[10px]" style={{ color: `${textColor}30` }}>
            {saveCount} {saveCount === 1 ? 'person' : 'people'} saved
          </span>
        )}
      </div>
    </div>
  );
}