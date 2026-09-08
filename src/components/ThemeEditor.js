import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Save, Loader, Eye, X, Play, Shuffle, UserPlus, Music, Radio, Share2, Verified, Target, Globe } from 'lucide-react';

const PRESETS = [
  { name: 'Default',   slug: 'default',       primary: '#FFFFFF', secondary: '#8B5CF6', accent: '#3B82F6', bg: '#000000', text: '#FFFFFF' },
  { name: 'Midnight',  slug: 'midnight',       primary: '#E0E7FF', secondary: '#6366F1', accent: '#818CF8', bg: '#0F0D23', text: '#E0E7FF' },
  { name: 'Ember',     slug: 'ember',          primary: '#FFF7ED', secondary: '#EA580C', accent: '#F97316', bg: '#1C0A00', text: '#FFF7ED' },
  { name: 'Forest',    slug: 'forest',         primary: '#ECFDF5', secondary: '#059669', accent: '#34D399', bg: '#022C22', text: '#ECFDF5' },
  { name: 'Rose',      slug: 'rose',           primary: '#FFF1F2', secondary: '#E11D48', accent: '#FB7185', bg: '#1A0006', text: '#FFF1F2' },
  { name: 'Gold',      slug: 'gold',           primary: '#FFFBEB', secondary: '#D97706', accent: '#FBBF24', bg: '#1A1400', text: '#FFFBEB' },
  { name: 'Ocean',     slug: 'ocean',          primary: '#F0F9FF', secondary: '#0284C7', accent: '#38BDF8', bg: '#001B2E', text: '#F0F9FF' },
  { name: 'Neon',      slug: 'neon',           primary: '#F0FDF4', secondary: '#22C55E', accent: '#4ADE80', bg: '#000000', text: '#F0FDF4' },
  { name: 'Mono',      slug: 'monochrome',     primary: '#FAFAFA', secondary: '#737373', accent: '#A3A3A3', bg: '#0A0A0A', text: '#FAFAFA' },
  { name: 'Clean',     slug: 'clean_white',    primary: '#18181B', secondary: '#6366F1', accent: '#8B5CF6', bg: '#FFFFFF', text: '#18181B' },
];

const FONTS = [
  'Inter', 'Poppins', 'Space Grotesk', 'DM Sans', 'Outfit', 'Plus Jakarta Sans',
  'Sora', 'Manrope', 'Clash Display', 'Satoshi', 'Cabinet Grotesk', 'General Sans',
  'Playfair Display', 'Crimson Pro', 'Fraunces', 'Libre Baskerville',
  'Bebas Neue', 'Oswald', 'Montserrat', 'Urbanist',
];

// ── Preview of the artist profile ───────────────────────────────────────────
//
// This has to track ArtistProfilePage's header, and it had fallen a long way
// behind it: a centred avatar overlapping the banner, a centred name, three
// pills, the bio, and Popular as a vertical list of skeleton rows. The real
// page is now a left-aligned row — large square avatar, name and stats and a
// six-pill control row beside it, social squares beneath, and Popular as a
// horizontal rail of artwork cards.
//
// A theme editor whose preview shows a layout that no longer exists is worse
// than no preview: every colour decision is made against the wrong picture.
//
// Anything structural that changes on ArtistProfilePage has to change here
// too. The colour variables are read exactly as that page reads them
// (theme.primary_color -> primaryColor and so on) so the mapping cannot drift.
function ProfilePreview({ theme, artist }) {
  const {
    primary_color:    primary,
    secondary_color:  secondary,
    accent_color:     accent,
    background_color: bg,
    text_color:       text,
    heading_font:     headingFont = 'Inter',
    body_font:        bodyFont    = 'Inter',
  } = theme;

  const heading = { fontFamily: `"${headingFont}", sans-serif` };

  // Same order and styling as the real pill row.
  const pills = [
    { label: 'Follow',  Icon: UserPlus, style: { backgroundColor: primary, color: bg, border: `2px solid ${primary}` } },
    { label: 'Play',    Icon: Play,     style: { backgroundColor: secondary, color: text } },
    { label: 'Shuffle', Icon: Shuffle,  style: { backgroundColor: `${secondary}30`, color: text, border: `1px solid ${secondary}40` } },
    { label: 'Radio',   Icon: Radio,    style: { backgroundColor: `${secondary}30`, color: text, border: `1px solid ${secondary}40` } },
    { label: 'Share',   Icon: Share2,   style: { backgroundColor: `${text}10`, color: `${text}70`, border: `1px solid ${text}20` } },
    { label: 'Tip goal', Icon: Target,  style: { backgroundColor: 'transparent', color: `${text}55`, border: `1px dashed ${text}30` } },
  ];

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.06] shadow-2xl"
      style={{ backgroundColor: bg, color: text, fontFamily: `"${bodyFont}", sans-serif` }}>

      {/* Header. One row, avatar left, everything else beside it — the
          arrangement the live page uses above lg. */}
      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-24"
          style={{ background: `linear-gradient(135deg, ${secondary}50, ${accent}30, ${bg})` }} />
        <div className="absolute inset-x-0 top-0 h-24"
          style={{ background: `linear-gradient(to bottom, transparent 20%, ${bg} 100%)` }} />

        <div className="relative flex items-end gap-4 px-5 pt-5 pb-4">
          {/* Avatar: large, square, and it ends level with the text block */}
          <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 shadow-xl flex-shrink-0"
            style={{ borderColor: bg, backgroundColor: `${secondary}30` }}>
            {artist.profile_image_url
              ? <img src={artist.profile_image_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${secondary}, ${accent})` }}>
                  <span className="text-2xl font-bold" style={{ color: text }}>
                    {artist.artist_name?.[0]?.toUpperCase()}
                  </span>
                </div>}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-lg font-bold truncate" style={{ ...heading, color: text }}>
                {artist.artist_name}
              </p>
              {artist.is_verified && (
                <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: accent }}>
                  <Verified style={{ width: 8, height: 8, color: bg }} />
                </span>
              )}
            </div>

            <p className="text-[10px] mb-2.5" style={{ color: `${text}80` }}>
              {artist.follower_count ?? 0} followers &nbsp;·&nbsp; {artist.track_count ?? 0} tracks &nbsp;·&nbsp; {artist.total_streams ?? 0} streams
            </p>

            <div className="flex items-center flex-wrap gap-1.5 mb-2">
              {pills.map(({ label, Icon, style }) => (
                <span key={label}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-semibold"
                  style={style}>
                  <Icon style={{ width: 9, height: 9 }} />
                  <span>{label}</span>
                </span>
              ))}
            </div>

            {/* Social squares, in line under the pills as on the live page */}
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3].map(i => (
                <span key={i} className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ border: `1px solid ${text}25` }}>
                  <Globe style={{ width: 9, height: 9, color: `${text}60` }} />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Popular — a horizontal rail of artwork cards with rank badges, not a
          list. This is the single biggest thing the old preview got wrong. */}
      <div className="px-5 pt-1 pb-4">
        <p className="text-xs font-bold mb-2" style={{ ...heading, color: text }}>Popular</p>
        <div className="flex gap-2 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="flex-shrink-0" style={{ width: 68 }}>
              <div className="w-full aspect-square rounded-lg relative mb-1"
                style={{ background: `linear-gradient(135deg, ${secondary}40, ${accent}20)` }}>
                <span className="absolute top-1 left-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold"
                  style={{ backgroundColor: `${bg}CC`, color: text }}>{i}</span>
                <div className="w-full h-full flex items-center justify-center">
                  <Music style={{ width: 12, height: 12, color: `${text}25` }} />
                </div>
              </div>
              <div className="h-1.5 rounded-full mb-1" style={{ width: `${85 - i * 6}%`, backgroundColor: `${text}25` }} />
              <div className="h-1 rounded-full" style={{ width: `${50 - i * 4}%`, backgroundColor: `${text}12` }} />
            </div>
          ))}
        </div>
      </div>

      {/* New Music panel. Included because it leans on the secondary colour
          harder than anything else on the page, so it is where a bad
          secondary shows up first. Hero card above the row, as on the live
          page. */}
      <div className="mx-5 mb-4 rounded-xl p-2.5"
        style={{ background: `${secondary}12`, border: `1px solid ${secondary}25` }}>
        <div className="flex items-center gap-1.5 mb-2">
          <p className="text-[10px] font-bold" style={{ ...heading, color: text }}>New Music</p>
          <span className="text-[7px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ background: `${secondary}25`, color: secondary, border: `1px solid ${secondary}35` }}>
            Just dropped
          </span>
        </div>
        <div className="flex items-center gap-2 p-1.5 rounded-lg mb-2"
          style={{ background: `${text}08`, border: `1px solid ${secondary}55` }}>
          <div className="w-9 h-9 rounded-md flex-shrink-0 flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${secondary}40, ${accent}20)` }}>
            <Music style={{ width: 11, height: 11, color: `${text}30` }} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="inline-block px-1.5 py-0.5 rounded-full text-[7px] font-bold mb-0.5"
              style={{ background: secondary, color: '#fff' }}>NEW</span>
            <div className="h-1.5 rounded-full" style={{ width: '55%', backgroundColor: `${text}25` }} />
          </div>
          <Play style={{ width: 11, height: 11, color: secondary }} fill={secondary} />
        </div>
        <div className="flex gap-1.5 overflow-hidden rounded-lg p-1.5"
          style={{ background: 'rgba(0,0,0,0.28)', border: `1px solid ${text}0F` }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex-shrink-0 rounded-md" style={{
              width: 34, height: 34,
              background: `linear-gradient(135deg, ${secondary}35, ${accent}18)`,
            }} />
          ))}
        </div>
      </div>

      <div className="px-5 pb-3 text-center">
        <p className="text-[9px]" style={{ color: `${text}20` }}>
          Powered by <span style={{ color: `${text}35` }}>Feelz Machine</span>
        </p>
      </div>
    </div>
  );
}

export default function ThemeEditor() {
  const { artist } = useAuth();
  const [theme, setTheme] = useState({
    primary_color: '#FFFFFF', secondary_color: '#8B5CF6', accent_color: '#3B82F6',
    background_color: '#000000', text_color: '#FFFFFF',
    heading_font: 'Inter', body_font: 'Inter', theme_preset: 'default',
  });
  const [bannerFile, setBannerFile]   = useState(null);
  const [bgImageFile, setBgImageFile] = useState(null);
  const [currentBannerUrl, setCurrentBannerUrl] = useState(null);
  const [currentBgUrl, setCurrentBgUrl]         = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');
  const [hasTheme, setHasTheme] = useState(false);

  useEffect(() => { if (artist) fetchTheme(); }, [artist]);

  const fetchTheme = async () => {
    const { data } = await supabase
      .from('artist_themes').select('*').eq('artist_id', artist.id).maybeSingle();
    if (data) {
      setTheme({
        primary_color:    data.primary_color    || '#FFFFFF',
        secondary_color:  data.secondary_color  || '#8B5CF6',
        accent_color:     data.accent_color     || '#3B82F6',
        background_color: data.background_color || '#000000',
        text_color:       data.text_color       || '#FFFFFF',
        heading_font:     data.heading_font     || 'Inter',
        body_font:        data.body_font        || 'Inter',
        theme_preset:     data.theme_preset     || 'default',
      });
      setCurrentBannerUrl(data.banner_image_url || null);
      setCurrentBgUrl(data.background_image_url || null);
      setHasTheme(true);
    }
  };

  const uploadFile = async (file, folder) => {
    const ext  = file.name.split('.').pop();
    const name = `${folder}${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const { error } = await supabase.storage.from('feelz-samples').upload(name, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('feelz-samples').getPublicUrl(name);
    return publicUrl;
  };

  const applyPreset = (preset) => {
    setTheme({
      ...theme,
      primary_color: preset.primary, secondary_color: preset.secondary,
      accent_color: preset.accent, background_color: preset.bg,
      text_color: preset.text, theme_preset: preset.slug,
    });
  };

  const handleRemoveBanner = async () => {
    if (!artist) return;
    setSaving(true);
    try {
      if (hasTheme) await supabase.from('artist_themes').update({ banner_image_url: null }).eq('artist_id', artist.id);
      await supabase.from('artists').update({ banner_image_url: null }).eq('id', artist.id);
      setCurrentBannerUrl(null); setBannerFile(null);
      setMsg('Banner removed!'); setTimeout(() => setMsg(''), 3000);
    } catch (err) { setMsg('Error: ' + err.message); }
    setSaving(false);
  };

  const handleRemoveBgImage = async () => {
    if (!artist) return;
    setSaving(true);
    try {
      if (hasTheme) await supabase.from('artist_themes').update({ background_image_url: null }).eq('artist_id', artist.id);
      setCurrentBgUrl(null); setBgImageFile(null);
      setMsg('Background image removed!'); setTimeout(() => setMsg(''), 3000);
    } catch (err) { setMsg('Error: ' + err.message); }
    setSaving(false);
  };

  const handleSave = async () => {
    if (!artist) return;
    setSaving(true);
    try {
      let bannerUrl = undefined;
      let bgUrl     = undefined;
      if (bannerFile)  bannerUrl = await uploadFile(bannerFile,  'banners/');
      if (bgImageFile) bgUrl     = await uploadFile(bgImageFile, 'backgrounds/');

      const payload = {
        artist_id: artist.id,
        primary_color: theme.primary_color, secondary_color: theme.secondary_color,
        accent_color: theme.accent_color,   background_color: theme.background_color,
        text_color: theme.text_color,       heading_font: theme.heading_font,
        body_font: theme.body_font,         theme_preset: theme.theme_preset,
        updated_at: new Date().toISOString(),
      };
      if (bannerUrl !== undefined) payload.banner_image_url = bannerUrl;
      if (bgUrl     !== undefined) payload.background_image_url = bgUrl;

      if (hasTheme) {
        const { error } = await supabase.from('artist_themes').update(payload).eq('artist_id', artist.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('artist_themes').insert(payload);
        if (error) throw error;
        setHasTheme(true);
      }

      if (bannerUrl) {
        await supabase.from('artists').update({ banner_image_url: bannerUrl }).eq('id', artist.id);
        setCurrentBannerUrl(bannerUrl);
      }
      if (bgUrl) setCurrentBgUrl(bgUrl);

      setMsg('Theme saved!');
      setBannerFile(null); setBgImageFile(null);
      setTimeout(() => setMsg(''), 3000);
    } catch (err) { setMsg('Error: ' + err.message); }
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
            { key: 'primary_color',    label: 'Primary' },
            { key: 'secondary_color',  label: 'Secondary' },
            { key: 'accent_color',     label: 'Accent' },
            { key: 'background_color', label: 'Background' },
            { key: 'text_color',       label: 'Text' },
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
            <select value={theme.heading_font}
              onChange={(e) => setTheme({ ...theme, heading_font: e.target.value })}
              className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1">Body Font</label>
            <select value={theme.body_font}
              onChange={(e) => setTheme({ ...theme, body_font: e.target.value })}
              className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
              {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Image uploads */}
      <div>
        <h4 className="text-xs font-medium text-white/50 mb-3">Images</h4>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs text-white/40">Banner Image (1200×400 recommended)</label>
            {currentBannerUrl && !bannerFile && (
              <div className="relative rounded-lg overflow-hidden h-16">
                <img src={currentBannerUrl} alt="Current banner" className="w-full h-full object-cover" />
                <button type="button" onClick={handleRemoveBanner} disabled={saving}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500/80 transition">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            )}
            <input type="file" accept=".jpg,.jpeg,.png,.webp"
              onChange={(e) => setBannerFile(e.target.files[0])}
              className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm" />
            {bannerFile && <p className="text-xs text-green-400">{bannerFile.name}</p>}
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-white/40">Background Image (optional)</label>
            {currentBgUrl && !bgImageFile && (
              <div className="relative rounded-lg overflow-hidden h-12">
                <img src={currentBgUrl} alt="Current background" className="w-full h-full object-cover" />
                <button type="button" onClick={handleRemoveBgImage} disabled={saving}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500/80 transition">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            )}
            <input type="file" accept=".jpg,.jpeg,.png,.webp"
              onChange={(e) => setBgImageFile(e.target.files[0])}
              className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm" />
            {bgImageFile && <p className="text-xs text-green-400">{bgImageFile.name}</p>}
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div>
        <h4 className="text-xs font-medium text-white/50 mb-3">Live Preview</h4>
        <ProfilePreview theme={theme} artist={artist} />
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