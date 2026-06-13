/**
 * useAppTheme.js
 * src/hooks/useAppTheme.js
 *
 * Reads --app-bg and --app-accent CSS vars set by LibraryPage
 * and returns them for use in any component that wants to respect the theme.
 *
 * Usage:
 *   const { appBg, appAccent } = useAppTheme();
 *
 * For full theme propagation, add this to your top-level app wrapper or AppLayout:
 *   import { useAppThemeInit } from '../hooks/useAppTheme';
 *   useAppThemeInit(); // call at top of AppLayout
 */

import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const THEMES = [
  { key: 'default',   bg: '#000000', accent: '#8B5CF6' },
  { key: 'deep_navy', bg: '#0a0f1e', accent: '#3B82F6' },
  { key: 'forest',    bg: '#0a1a0f', accent: '#22C55E' },
  { key: 'warm_dark', bg: '#1a0f0a', accent: '#F97316' },
];

export function applyThemeGlobal(themeKey) {
  const theme = THEMES.find(t => t.key === themeKey) || THEMES[0];
  document.documentElement.style.setProperty('--app-bg',     theme.bg);
  document.documentElement.style.setProperty('--app-accent', theme.accent);
  document.body.style.backgroundColor = theme.bg;
  const root = document.getElementById('root');
  if (root) root.style.backgroundColor = theme.bg;
}

// Call this once in AppLayout to load and apply the user's saved theme on startup
export function useAppThemeInit() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    supabase.from('listeners')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const themeKey = data?.preferences?.theme || 'default';
        applyThemeGlobal(themeKey);
      })
      .catch(() => {});
  }, [user?.id]); // eslint-disable-line
}

// Hook to read current CSS var values reactively
export function useAppTheme() {
  const [appBg,     setAppBg]     = useState('#000000');
  const [appAccent, setAppAccent] = useState('#8B5CF6');

  useEffect(() => {
    const update = () => {
      const style = getComputedStyle(document.documentElement);
      const bg     = style.getPropertyValue('--app-bg').trim()     || '#000000';
      const accent = style.getPropertyValue('--app-accent').trim() || '#8B5CF6';
      setAppBg(bg);
      setAppAccent(accent);
    };
    update();
    // Re-read on storage changes (theme toggled in another tab)
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);

  return { appBg, appAccent };
}
