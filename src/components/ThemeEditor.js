import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Palette, Save, Loader, RotateCcw, Upload, Eye } from 'lucide-react';

const PRESETS = [
  { name: 'Default', slug: 'default', primary: '#FFFFFF', secondary: '#8B5CF6', accent: '#3B82F6', bg: '#000000', text: '#FFFFFF' },
  { name: 'Midnight', slug: 'midnight', primary: '#E0E7FF', secondary: '#6366F1', accent: '#818CF8', bg: '#0F0D23', text: '#E0E7FF' },
  { name: 'Ember', slug: 'ember', primary: '#FFF7ED', secondary: '#EA580C', accent: '#F97316', bg: '#1C0A00', text: '#FFF7ED' },
  { name: 'Forest', slug: 'forest', primary: '#ECFDF5', secondary: '#059669', accent: '#34D399', bg: '#022C22', text: '#ECFDF5' },
  { name: 'Rose', slug: 'rose', primary: '#FFF1F2', secondary: '#E11D48', accent: '#FB7185', bg: '#1A0006', text: '#FFF1F2' },
  { name: 'Gold', slug: 'gold', primary: '#FFFBEB', secondary: '#D97706', accent: '#FBBF24', bg: '#1A1400', text: '#FFFBEB' },
  { name: 'Ocean', slug: 'ocean', primary: '#F0F9FF', secondary: '#0284C7', accent: '#38BDF8', bg: '#001B2E', text: '#F0F9FF' },
  { name: 'Neon', slug: 'neon', primary: '#F0FDF4', secondary: '#22C55E', accent: '#4ADE80', bg: '#000000', text: '#F0FDF4' },
  { name: 'Monochrome', slug: 'monochrome', primary: '#FAFAFA', secondary: '#737373', accent: '#A3A3A3', bg: '#0A0A0A', text: '#FAFAFA' },
  { name: 'Clean White', slug: 'clean_white', primary: '#18181B', secondary: '#6366F1', accent: '#8B5CF6', bg: '#FFFFFF', text: '#18181B' },
];

const FONTS = [
  'Inter', 'Poppins', 'Space Grotesk', 'DM Sans', 'Outfit',
  'Plus Jakarta Sans', 'Sora', 'Manrope', 'Clash Display',
  'Satoshi', 'Cabinet Grotesk', 'General Sans',
  'Playfair Display', 'Crimson Pro', 'Fraunces', 'Libre Baskerville',
  'Bebas Neue', 'Oswald', 'Montserrat', 'Urbanist',
];

export default function ThemeEditor() {
  const { artist } = useAuth();
  const [theme, setTheme] = useState({
    primary_color: '#FFFFFF',
    secondary_color: '#8B5CF6',
    accent_color: '#3B82F6',
    background_color: '#000000',
    text_color: '#FFFFFF',
    heading_font: 'Inter',
    body_font: 'Inter',
    theme_preset: 'default',
  });
  const [bannerFile, setBannerFile] = useState(null);
  const [bgImageFile, setBgImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [hasTheme, setHasTheme] = useState(false);

  useEffect(() => {
    if (artist) fetchTheme();
  }, [artist]);

  const fetchTheme = async () => {
    const { data } = await supabase
      .from('artist_themes')
      .select('*')
      .eq('artist_id', artist.id)
      .maybeSingle();
    if (data) {
      setTheme({
        primary_color: data.primary_color || '#FFFFFF',
        secondary_color: data.secondary_color || '#8B5CF6',
        accent_color: data.accent_color || '#3B82F6',
        background_color: data.background_color || '#000000',
        text_color: data.text_color || '#FFFFFF',
        heading_font: data.heading_font || 'Inter',
        body_font: data.body_font || 'Inter',
        theme_preset: data.theme_preset || 'default',
      });
      setHasTheme(true);
    }
  };

  const uploadFile = async (file, folder) => {
    const ext = file.name.split('.').pop();
    const name = `${folder}${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error } = await supabase.storage.from('feelz-samples').upload(name, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('feelz-samples').getPublicUrl(name);
    return publicUrl;
  };

  const applyPreset = (preset) => {
    setTheme({
      ...theme,
      primary_color: preset.primary,
      secondary_color: preset.secondary,
      accent_color: preset.accent,
      background_color: preset.bg,
      text_color: preset.text,
      theme_preset: preset.slug,
    });
  };

  const handleSave = async () => {
    if (!artist) return;
    setSaving(true);
    try {
      let bannerUrl = undefined;
      let bgUrl = undefined;

      if (bannerFile) {
        bannerUrl = await uploadFile(bannerFile, 'banners/');
      }
      if (bgImageFile) {
        bgUrl = await uploadFile(bgImageFile, 'backgrounds/');
      }

      const payload = {
        artist_id: artist.id,
        primary_color: theme.primary_color,
        secondary_color: theme.secondary_color,
        accent_color: theme.accent_color,
        background_color: theme.background_color,
        text_color: theme.text_color,
        heading_font: theme.heading_font,
        body_font: theme.body_font,
        theme_preset: theme.theme_preset,
        updated_at: new Date().toISOString(),
      };

      if (bannerUrl) payload.banner_image_url = bannerUrl;
      if (bgUrl) payload.background_image_url = bgUrl;

      if (hasTheme) {
        const { error } = await supabase.from('artist_themes').update(payload).eq('artist_id', artist.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('artist_themes').insert(payload);
        if (error) throw error;
        setHasTheme(true);
      }

      // Also update banner on artist record
      if (bannerUrl) {
        await supabase.from('artists').update({ banner_image_url: bannerUrl }).eq('id', artist.id);
      }

      setMsg('Theme saved!');
      setBannerFile(null);
      setBgImageFile(null);
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
    setSaving(false);
  };

  if (!artist) return null;

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {msg}
        </div>
      )}

      {/* Preview link */}
      <a href={`/artist/${artist.slug}`} target="_blank" rel="noopener noreferrer"
        className="flex items-center space-x-2 text-sm text-white/40 hover:text-white/60 transition">
        <Eye className="w-4 h-4" />
        <span>Preview: /artist/{artist.slug}</span>
      </a>

      {/* Presets */}
      <div>
        <h4 className="text-xs font-medium text-white/50 mb-3">Theme Presets</h4>
        <div className="grid grid-cols-5 gap-2">
          {PRESETS.map(preset => (
            <button key={preset.slug} onClick={() => applyPreset(preset)}
              className={`p-2 rounded-lg border transition-all ${
                theme.theme_preset === preset.slug ? 'border-white/40 scale-105' : 'border-white/[0.06]'
              }`}
              style={{ backgroundColor: preset.bg }}>
              <div className="flex space-x-1 mb-1.5 justify-center">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.primary }} />
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.secondary }} />
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.accent }} />
              </div>
              <p className="text-[9px] text-center truncate" style={{ color: preset.text }}>{preset.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom colors */}
      <div>
        <h4 className="text-xs font-medium text-white/50 mb-3">Custom Colors</h4>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'primary_color', label: 'Primary' },
            { key: 'secondary_color', label: 'Secondary' },
            { key: 'accent_color', label: 'Accent' },
            { key: 'background_color', label: 'Background' },
            { key: 'text_color', label: 'Text' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center space-x-2">
              <input type="color" value={theme[key]}
                onChange={(e) => setTheme({ ...theme, [key]: e.target.value, theme_preset: 'custom' })}
                className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent" />
              <div className="flex-1">
                <p className="text-xs text-white/40">{label}</p>
                <p className="text-[10px] text-white/20 uppercase">{theme[key]}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fonts */}
      <div>
        <h4 className="text-xs font-medium text-white/50 mb-3">Typography</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/40 mb-1">Heading Font</label>
            <select value={theme.heading_font} onChange={(e) => setTheme({ ...theme, heading_font: e.target.value })}
              className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1">Body Font</label>
            <select value={theme.body_font} onChange={(e) => setTheme({ ...theme, body_font: e.target.value })}
              className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Image uploads */}
      <div>
        <h4 className="text-xs font-medium text-white/50 mb-3">Images</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-white/40 mb-1">Banner Image (1200x400 recommended)</label>
            <input type="file" accept=".jpg,.jpeg,.png,.webp"
              onChange={(e) => setBannerFile(e.target.files[0])}
              className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm" />
            {bannerFile && <p className="text-xs text-green-400 mt-1">{bannerFile.name}</p>}
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1">Background Image (optional)</label>
            <input type="file" accept=".jpg,.jpeg,.png,.webp"
              onChange={(e) => setBgImageFile(e.target.files[0])}
              className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm" />
            {bgImageFile && <p className="text-xs text-green-400 mt-1">{bgImageFile.name}</p>}
          </div>
        </div>
      </div>

      {/* Live Profile Preview */}
      <div>
        <h4 className="text-xs font-medium text-white/50 mb-3">Live Preview</h4>
        <div className="rounded-xl overflow-hidden border border-white/[0.06] shadow-2xl"
          style={{ backgroundColor: theme.background_color, color: theme.text_color, fontFamily: `"${theme.body_font}", sans-serif` }}>
          <div className="relative h-24"
            style={{ background: `linear-gradient(135deg, ${theme.secondary_color}50, ${theme.accent_color}30, ${theme.background_color})` }}>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
              <div className="w-16 h-16 rounded-xl overflow-hidden border-2 shadow-lg"
                style={{ borderColor: theme.background_color, backgroundColor: `${theme.secondary_color}30` }}>
                {artist.profile_image_url
                  ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${theme.secondary_color}, ${theme.accent_color})` }}>
                      <span className="text-xl font-bold" style={{ color: theme.text_color }}>
                        {artist.artist_name?.[0]?.toUpperCase()}
                      </span>
                    </div>
                }
              </div>
            </div>
          </div>
          <div className="pt-12 pb-4 px-4 flex flex-col items-center text-center">
            <p className="text-sm font-bold mb-0.5"
              style={{ color: theme.text_color, fontFamily: `"${theme.heading_font}", sans-serif` }}>
              {artist.artist_name}
            </p>
            <p className="text-[10px] mb-3" style={{ color: `${theme.text_color}50` }}>
              0 followers · 0 tracks
            </p>
            <div className="flex space-x-2 mb-3">
              <div className="px-3 py-1 rounded-full text-[10px] font-semibold border-2"
                style={{ borderColor: theme.primary_color, color: theme.primary_color }}>
                Follow
              </div>
              <div className="px-3 py-1 rounded-full text-[10px] font-semibold"
                style={{ backgroundColor: theme.secondary_color, color: theme.text_color }}>
                Play
              </div>
            </div>
            {artist.bio && (
              <p className="text-[10px] leading-relaxed mb-3 max-w-xs"
                style={{ color: `${theme.text_color}70` }}>
                {artist.bio.slice(0, 80)}{artist.bio.length > 80 ? '...' : ''}
              </p>
            )}
            <div className="w-full rounded-lg p-2 flex items-center space-x-2 text-left"
              style={{ backgroundColor: `${theme.secondary_color}15` }}>
              <div className="w-7 h-7 rounded-md flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${theme.secondary_color}40, ${theme.accent_color}20)` }} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium truncate" style={{ color: theme.secondary_color }}>Sample Track</p>
                <p className="text-[9px]" style={{ color: `${theme.text_color}40` }}>Now Playing</p>
              </div>
              <div className="text-[9px]" style={{ color: `${theme.text_color}30` }}>2:34</div>
            </div>
          </div>
          <div className="px-4 pb-3 text-center">
            <p className="text-[9px]" style={{ color: `${theme.text_color}20` }}>
              Powered by <span style={{ color: `${theme.text_color}35` }}>Feelz Machine</span>
            </p>
          </div>
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 bg-white text-black rounded-lg font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-50 transition">
        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        <span>{saving ? 'Saving...' : 'Save Theme'}</span>
      </button>
    </div>
  );
}
