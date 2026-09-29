// src/components/NotificationPreferences.js
//
// Choose which notifications you do not want.
//
//
// WHY THIS EXISTS
//
// Artists have had a per-artist bell for a long time. Listeners have had
// nothing: no switch anywhere in the app, and the only control was the
// browser's own block button, which is all or nothing and which most people
// cannot find their way back out of.
//
// So the one lever anybody had was "silence this site forever", and a fair
// number of people will have pulled it rather than keep getting a kind of
// notification they did not want. Every one of those is somebody the platform
// can no longer reach about anything, including the things they did want.
//
//
// OPT OUT, NOT OPT IN
//
// Everything is on until somebody turns it off. No row in the table means no
// preference, which means yes, so this changes nobody's experience until they
// choose. See migration 200.
//
//
// THE PUSH SWITCH IS SEPARATE, DELIBERATELY
//
// "Keep the bell in the app, stop my phone buzzing" is a real thing to want
// and it had no expression at all. It is one switch at the top rather than a
// seventh category, because it cuts across all six.
//
//
// WHAT THIS CANNOT DO
//
// If the browser permission is 'denied', nothing on this page can undo it.
// That is a browser setting and only the person can change it. So the panel
// says so plainly rather than showing switches that would not do anything.
// A lit switch that silently does nothing is worse than an honest message.

import React from 'react';
import { supabase } from '../supabaseClient';
import { Bell, BellOff, Loader, Check } from 'lucide-react';

// These keys MUST match notification_category() in migration 200. The function
// maps every raw type string onto one of these, so a new type gets a line
// there and no new switch here.
const CATEGORIES = [
  { key: 'new_music',        label: 'New music',        blurb: 'When an artist you follow releases something' },
  { key: 'platform_updates', label: 'Platform updates', blurb: 'News from Feelz Machine, and what has changed' },
  { key: 'social',           label: 'People',           blurb: 'Follows, comments, chat and collaborations' },
  { key: 'money',            label: 'Sales and payouts', blurb: 'Purchases, tips and money reaching your account' },
  { key: 'competitions',     label: 'Competitions',     blurb: 'The wheel, School Sessions and contest results' },
  { key: 'engagement',       label: 'Streaks and reminders', blurb: 'Nudges about your own listening' },
];

export default function NotificationPreferences({ user, onToast }) {
  const [muted, setMuted]         = React.useState([]);
  const [pushMuted, setPushMuted] = React.useState(false);
  const [loading, setLoading]     = React.useState(true);
  const [saving, setSaving]       = React.useState(null);   // which key is in flight
  const [permission, setPermission] = React.useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  React.useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('muted, push_muted')
        .eq('user_id', user.id)
        .maybeSingle();
      // 42P01 / PGRST205 mean migration 200 has not run. Not an error worth
      // showing anybody: the panel just reads as "everything on", which is
      // exactly what is true in that case.
      if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
        console.error('[notif prefs] load failed:', error.code, error.message);
      }
      if (cancelled) return;
      setMuted(data?.muted || []);
      setPushMuted(!!data?.push_muted);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Written on every change rather than behind a Save button. There is no
  // half-finished state to protect here, and a Save button on a list of
  // switches is a way to lose somebody's choice when they navigate away.
  const persist = async (nextMuted, nextPushMuted, key) => {
    if (!user) return;
    setSaving(key);
    const prevMuted = muted;
    const prevPush  = pushMuted;
    setMuted(nextMuted);
    setPushMuted(nextPushMuted);

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id:    user.id,
        muted:      nextMuted,
        push_muted: nextPushMuted,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      // Put it back. A switch that flips and silently does not save is the
      // thing people notice a week later when the notifications keep coming.
      setMuted(prevMuted);
      setPushMuted(prevPush);
      console.error('[notif prefs] save failed:', error.code, error.message);
      onToast?.('Could not save that. Try again in a moment.');
    }
    setSaving(null);
  };

  const toggleCategory = (key) => {
    const next = muted.includes(key) ? muted.filter(m => m !== key) : [...muted, key];
    persist(next, pushMuted, key);
  };

  const blocked = permission === 'denied';

  const askPermission = async () => {
    if (typeof Notification === 'undefined' || permission !== 'default') return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') onToast?.('Notifications are on.');
    } catch { /* the browser refused to show it; nothing to do */ }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader className="w-5 h-5 animate-spin text-white/20" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-white">Notifications</h2>
        <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
          Everything is on unless you turn it off. This only affects you.
        </p>
      </div>

      {/* ── The browser's own permission, first ── */}
      {permission === 'default' && (
        <button
          onClick={askPermission}
          className="w-full flex items-center gap-3 rounded-xl border border-purple-500/40 bg-purple-500/10 p-3.5 text-left transition hover:bg-purple-500/15">
          <Bell className="w-4 h-4 text-purple-300 flex-shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">Turn on notifications</span>
            <span className="block text-xs text-white/45 mt-0.5">
              Your browser will ask once. Without it nothing below can reach you outside the app.
            </span>
          </span>
        </button>
      )}

      {blocked && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5">
          <BellOff className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Blocked in your browser</p>
            <p className="text-xs text-white/45 mt-0.5 leading-relaxed">
              Notifications for this site are switched off in your browser settings, and only you
              can switch them back on: tap the padlock or the icon next to the address, find
              Notifications, and set it to Allow. The choices below still work for what you see
              inside the app.
            </p>
          </div>
        </div>
      )}

      {/* ── Push, across everything ── */}
      {!blocked && permission === 'granted' && (
        <Row
          label="Push to this device"
          blurb="Off means the app still shows everything, your phone just stays quiet."
          on={!pushMuted}
          busy={saving === '__push'}
          onToggle={() => persist(muted, !pushMuted, '__push')}
        />
      )}

      {/* ── The six ── */}
      <div className="space-y-1.5">
        {CATEGORIES.map(c => (
          <Row
            key={c.key}
            label={c.label}
            blurb={c.blurb}
            on={!muted.includes(c.key)}
            busy={saving === c.key}
            onToggle={() => toggleCategory(c.key)}
          />
        ))}
      </div>

      <p className="text-[11px] text-white/25 leading-relaxed">
        Alerts for a particular artist are set on their profile, with the bell next to Follow.
      </p>
    </div>
  );
}

function Row({ label, blurb, on, busy, onToggle }) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      role="switch"
      aria-checked={on}
      className="w-full flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition hover:bg-white/[0.04] disabled:opacity-50">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="block text-xs text-white/40 mt-0.5 leading-snug">{blurb}</span>
      </span>
      {/* A real track and knob rather than a tick, because a tick reads as
          "done" and this is a state that stays. */}
      <span
        className="relative flex-shrink-0 rounded-full transition-colors"
        style={{ width: 44, height: 26, background: on ? '#8B5CF6' : 'rgba(255,255,255,0.14)' }}>
        <span
          className="absolute top-[3px] rounded-full bg-white flex items-center justify-center transition-all"
          style={{ width: 20, height: 20, left: on ? 21 : 3 }}>
          {busy
            ? <Loader className="w-3 h-3 animate-spin text-black/50" />
            : on ? <Check className="w-3 h-3 text-purple-600" /> : null}
        </span>
      </span>
    </button>
  );
}