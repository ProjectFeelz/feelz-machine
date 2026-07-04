// src/contexts/ListenerThemeContext.js
// Loads the listener's chosen theme from listener_themes table and applies
// CSS variables to :root so the entire app reflects their chosen palette.
// Only applies for listeners — artists keep their own per-profile themes.

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

export const LISTENER_THEME_PRESETS = [
  { slug: 'default',    name: 'Default',   primary: '#FFFFFF', secondary: '#8B5CF6', accent: '#3B82F6', bg: '#000000', surface: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)' },
  { slug: 'midnight',   name: 'Midnight',  primary: '#E0E7FF', secondary: '#6366F1', accent: '#818CF8', bg: '#0F0D23', surface: 'rgba(99,102,241,0.05)',   border: 'rgba(99,102,241,0.12)'  },
  { slug: 'ember',      name: 'Ember',     primary: '#FFF7ED', secondary: '#EA580C', accent: '#F97316', bg: '#1C0A00', surface: 'rgba(234,88,12,0.05)',    border: 'rgba(234,88,12,0.12)'   },
  { slug: 'forest',     name: 'Forest',    primary: '#ECFDF5', secondary: '#059669', accent: '#34D399', bg: '#022C22', surface: 'rgba(5,150,105,0.05)',    border: 'rgba(5,150,105,0.12)'   },
  { slug: 'rose',       name: 'Rose',      primary: '#FFF1F2', secondary: '#E11D48', accent: '#FB7185', bg: '#1A0006', surface: 'rgba(225,29,72,0.05)',    border: 'rgba(225,29,72,0.12)'   },
  { slug: 'gold',       name: 'Gold',      primary: '#FFFBEB', secondary: '#D97706', accent: '#FBBF24', bg: '#1A1400', surface: 'rgba(217,119,6,0.05)',    border: 'rgba(217,119,6,0.12)'   },
  { slug: 'ocean',      name: 'Ocean',     primary: '#F0F9FF', secondary: '#0284C7', accent: '#38BDF8', bg: '#001B2E', surface: 'rgba(2,132,199,0.05)',    border: 'rgba(2,132,199,0.12)'   },
  { slug: 'neon',       name: 'Neon',      primary: '#F0FDF4', secondary: '#22C55E', accent: '#4ADE80', bg: '#000000', surface: 'rgba(34,197,94,0.05)',    border: 'rgba(34,197,94,0.10)'   },
  { slug: 'mono',       name: 'Mono',      primary: '#FAFAFA', secondary: '#737373', accent: '#A3A3A3', bg: '#0A0A0A', surface: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)' },
  { slug: 'amethyst',   name: 'Amethyst',  primary: '#F5F3FF', secondary: '#7C3AED', accent: '#A78BFA', bg: '#0D0A1F', surface: 'rgba(124,58,237,0.06)',  border: 'rgba(124,58,237,0.14)'  },
  // Requested by listeners — pink/sparkle palette
  { slug: 'bubblegum',  name: 'Bubblegum', primary: '#FFF0F8', secondary: '#EC4899', accent: '#F472B6', bg: '#1F0313', surface: 'rgba(236,72,153,0.06)',  border: 'rgba(236,72,153,0.14)'  },
  { slug: 'blush',      name: 'Blush',     primary: '#FFF5F7', secondary: '#F0A8BC', accent: '#FBCFE8', bg: '#1A0A10', surface: 'rgba(240,168,188,0.06)', border: 'rgba(240,168,188,0.14)' },
  { slug: 'sparkle',    name: 'Sparkle',   primary: '#FFF8FC', secondary: '#D946EF', accent: '#FDE68A', bg: '#180A1F', surface: 'rgba(217,70,239,0.06)',  border: 'rgba(217,70,239,0.16)', sparkle: true },
];

const ThemeContext = createContext(null);

function applyTheme(preset) {
  const root = document.documentElement;
  root.style.setProperty('--lt-bg',        preset.bg);
  root.style.setProperty('--lt-primary',   preset.primary);
  root.style.setProperty('--lt-secondary', preset.secondary);
  root.style.setProperty('--lt-accent',    preset.accent);
  root.style.setProperty('--lt-surface',   preset.surface);
  root.style.setProperty('--lt-border',    preset.border);
  root.setAttribute('data-listener-theme', preset.slug);
  root.toggleAttribute('data-theme-sparkle', !!preset.sparkle);
}

function clearTheme() {
  const root = document.documentElement;
  ['--lt-bg','--lt-primary','--lt-secondary','--lt-accent','--lt-surface','--lt-border']
    .forEach(v => root.style.removeProperty(v));
  root.removeAttribute('data-listener-theme');
  root.removeAttribute('data-theme-sparkle');
}

export function ListenerThemeProvider({ children }) {
  const { user, listener, isArtist } = useAuth();
  const [activeSlug, setActiveSlug] = useState('default');
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!user?.id || isArtist) { clearTheme(); return; }
    try {
      const { data } = await supabase
        .from('listener_themes')
        .select('theme_slug')
        .eq('user_id', user.id)
        .maybeSingle();
      const slug   = data?.theme_slug || 'default';
      const preset = LISTENER_THEME_PRESETS.find(p => p.slug === slug) || LISTENER_THEME_PRESETS[0];
      setActiveSlug(slug);
      applyTheme(preset);
    } catch {
      clearTheme();
    }
  }, [user?.id, isArtist]);

  useEffect(() => { load(); }, [load]);

  // Clear theme if user is an artist — artists have per-profile themes instead
  useEffect(() => {
    if (isArtist) clearTheme();
  }, [isArtist]);

  const setTheme = async (slug) => {
    const preset = LISTENER_THEME_PRESETS.find(p => p.slug === slug);
    if (!preset || !user?.id) return;

    // Apply immediately (optimistic)
    setActiveSlug(slug);
    applyTheme(preset);

    // Persist
    setSaving(true);
    try {
      await supabase.from('listener_themes').upsert(
        { user_id: user.id, theme_slug: slug, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    } catch (err) {
      console.warn('Theme save failed:', err);
    }
    setSaving(false);
  };

  return (
    <ThemeContext.Provider value={{ activeSlug, setTheme, saving, presets: LISTENER_THEME_PRESETS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useListenerTheme() {
  return useContext(ThemeContext);
}