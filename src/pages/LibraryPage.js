import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/useTier';
import { getListenerFeature } from '../contexts/useTier';
import { supabase } from '../supabaseClient';
import { usePlayer } from '../contexts/PlayerContext';
import {
  Heart, Download, ListMusic, Users, Clock, ChevronRight, TrendingUp,
  Music, BarChart3, Zap, Crown, Palette,
  Shield, ChevronDown, Check, BarChart2, Play,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── App theme definitions (module-level so they never recreate) ───────────────
const THEMES = [
  { key: 'default',   label: 'Default',     bg: '#0a0a0a', surface: 'rgba(255,255,255,0.055)', surface2: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.10)', accent: '#8B5CF6' },
  { key: 'deep_navy', label: 'Deep Navy',   bg: '#060c1a', surface: 'rgba(59,130,246,0.07)',   surface2: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.18)',  accent: '#3B82F6' },
  { key: 'forest',    label: 'Forest Dark', bg: '#040f07', surface: 'rgba(34,197,94,0.06)',    surface2: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.16)',   accent: '#22C55E' },
  { key: 'warm_dark', label: 'Warm Dark',   bg: '#120800', surface: 'rgba(249,115,22,0.06)',   surface2: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.16)',  accent: '#F97316' },
  // Requested by listeners — pink/sparkle palette
  { key: 'bubblegum', label: 'Bubblegum',   bg: '#1F0313', surface: 'rgba(236,72,153,0.06)',   surface2: 'rgba(236,72,153,0.10)',  border: 'rgba(236,72,153,0.16)',  accent: '#EC4899' },
  { key: 'blush',     label: 'Blush',       bg: '#1A0A10', surface: 'rgba(240,168,188,0.06)',  surface2: 'rgba(240,168,188,0.10)', border: 'rgba(240,168,188,0.16)', accent: '#F0A8BC' },
  { key: 'sparkle',   label: 'Sparkle',     bg: '#180A1F', surface: 'rgba(217,70,239,0.06)',   surface2: 'rgba(217,70,239,0.10)',  border: 'rgba(217,70,239,0.16)',  accent: '#D946EF', sparkle: true },
];

function applyTheme(themeKey) {
  const theme = THEMES.find(t => t.key === themeKey) || THEMES[0];
  const r = document.documentElement;
  r.style.setProperty('--fm-bg',        theme.bg);
  r.style.setProperty('--fm-surface',   theme.surface);
  r.style.setProperty('--fm-surface-2', theme.surface2);
  r.style.setProperty('--fm-border',    theme.border);
  r.style.setProperty('--fm-border-2',  theme.border);
  r.style.setProperty('--app-accent',   theme.accent);
  r.toggleAttribute('data-theme-sparkle', !!theme.sparkle);
}

export default function LibraryPage() {
  const { user, isArtist } = useAuth();
  const { listenerTierSlug } = useTier();
  const navigate = useNavigate();
  const { playTrack } = usePlayer();
  const [stats, setStats] = useState({
    likes: 0, recentTrack: null, playlists: 0, following: 0, downloads: 0,
    totalStreams: 0, topArtist: null, monthlyDownloads: 0,
  });
  const [prefs, setPrefs] = useState({ theme: 'default', fanBadge: true });
  const [featured, setFeatured] = useState([]);
  const [newToYou, setNewToYou] = useState([]);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [showThemes, setShowThemes] = useState(false);

  // Load preferences from DB
  useEffect(() => {
    if (!user) return;
    supabase.from('listeners')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.preferences) {
          setPrefs(p => ({ ...p, ...data.preferences }));
          applyTheme(data.preferences.theme || 'default');
        }
      })
      .catch(() => {}); // don't crash if preferences column missing
  }, [user?.id]); // eslint-disable-line

  const savePrefs = async (newPrefs) => {
    if (!user) return;
    setSavingPrefs(true);
    const merged = { ...prefs, ...newPrefs };
    setPrefs(merged);
    if (newPrefs.theme) applyTheme(newPrefs.theme);
    try {
      await supabase.from('listeners')
        .update({ preferences: merged, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    } catch {}
    setSavingPrefs(false);
  };

  // Featured artwork for the desktop right rail. Deliberately its own
  // effect and its own state: if this query fails or returns nothing, the
  // rail just doesn't render and the rest of the page is unaffected.
  useEffect(() => {
    supabase.from('tracks')
      .select('id, title, slug, cover_artwork_url, artists(artist_name)')
      .eq('is_published', true)
      .not('cover_artwork_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => setFeatured(data || []));
  }, []);

  // "New to you" strip. Prefers recent tracks from artists this user
  // actually follows; falls back to recent published tracks if they don't
  // follow anyone yet, so the strip is never empty for a new account.
  useEffect(() => {
    const load = async () => {
      let ids = [];
      if (user) {
        const { data: follows } = await supabase
          .from('follows').select('artist_id').eq('follower_id', user.id).limit(50);
        ids = (follows || []).map(f => f.artist_id).filter(Boolean);
      }
      let q = supabase.from('tracks')
        .select('id, title, slug, cover_artwork_url, created_at, artists(artist_name)')
        .eq('is_published', true)
        .not('cover_artwork_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(15);
      if (ids.length > 0) q = q.in('artist_id', ids);
      const { data } = await q;
      setNewToYou(data || []);
    };
    load();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0,0,0,0);

        const [
          { count: likesCount },
          { data: recentData },
          { count: playlistCount },
          { count: followCount },
          { count: dlCount },
          { count: streamCount },
          { count: monthlyDlCount },
        ] = await Promise.all([
          supabase.from('track_likes').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('streams')
            .select('tracks(id, title, cover_artwork_url, artists(artist_name))')
            .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
          supabase.from('playlists').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
          supabase.from('downloads').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('streams').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('downloads').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('amount_paid', 0).gte('created_at', monthStart.toISOString()),
        ]);

        // Top artist by stream count
        let topArtist = null;
        try {
          const { data: topStreams } = await supabase
            .from('streams')
            .select('tracks(artist_id, artists(artist_name, profile_image_url))')
            .eq('user_id', user.id)
            .limit(200);
          if (topStreams?.length) {
            const counts = {};
            const meta   = {};
            topStreams.forEach(s => {
              const id = s.tracks?.artist_id;
              if (!id) return;
              counts[id] = (counts[id] || 0) + 1;
              meta[id]   = s.tracks?.artists;
            });
            const topId = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0];
            if (topId) topArtist = meta[topId];
          }
        } catch {}

        setStats({
          likes:           likesCount    || 0,
          recentTrack:     recentData?.[0]?.tracks
            ? { ...recentData[0].tracks, artist_name: recentData[0].tracks.artists?.artist_name }
            : null,
          playlists:       playlistCount || 0,
          following:       followCount   || 0,
          downloads:       dlCount       || 0,
          totalStreams:    streamCount   || 0,
          topArtist,
          monthlyDownloads: monthlyDlCount || 0,
        });
      } catch (err) { console.error('Library stats error:', err); }
    };
    load();
  }, [user]);

  const isPro          = listenerTierSlug === 'pro' || listenerTierSlug === 'premium' || listenerTierSlug === 'fan_pro';
  const freeQuota      = 3;
  const downloadsLeft  = Math.max(0, freeQuota - stats.monthlyDownloads);
  const quotaPct       = Math.min(100, Math.round((stats.monthlyDownloads / freeQuota) * 100));

  const items = [
    { icon: Heart,     label: 'Liked Songs',          path: '/library/likes',       iconColor: 'text-red-400/70',    count: stats.likes,     accent: 'bg-red-500/10' },
    { icon: Clock,     label: 'Recently Played',      path: '/library/recent',      iconColor: 'text-cyan-400/70',   count: null,            accent: 'bg-cyan-500/10', sub: stats.recentTrack?.title },
    { icon: Download,  label: 'Downloads',            path: '/library/downloads',   iconColor: 'text-green-400/70',  count: stats.downloads, accent: 'bg-green-500/10' },
    { icon: ListMusic, label: 'Playlists',            path: '/library/playlists',   iconColor: 'text-purple-400/70', count: stats.playlists, accent: 'bg-purple-500/10' },
    { icon: Users,     label: 'Following',            path: '/library/following',   iconColor: 'text-blue-400/70',   count: stats.following, accent: 'bg-blue-500/10' },
    { icon: TrendingUp,label: 'Recently Discovered',  path: '/library/discovered',  iconColor: 'text-orange-400/70', count: null,            accent: 'bg-orange-500/10' },
  ];

  return (
    <div className="pb-8 px-4 md:px-0">
      <Helmet>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <title>Library · Feelz Machine</title>
        <meta name="description" content="Your music library — liked songs, downloads, playlists and artists you follow." />
        <link rel="canonical" href="https://www.feelzmachine.com/library" />
      </Helmet>

      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl md:relative md:top-auto md:bg-transparent pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04] md:border-none mb-5">
        <h1 className="text-2xl font-bold text-white">Your Library</h1>
      </div>

      {/* ── Listener stats snapshot ── */}
      {!isArtist && stats.totalStreams > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] text-center">
            <p className="text-lg font-black text-white">{stats.totalStreams.toLocaleString()}</p>
            <p className="text-[10px] text-white/30 mt-0.5">Streams</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] text-center">
            <p className="text-lg font-black text-white">{stats.following}</p>
            <p className="text-[10px] text-white/30 mt-0.5">Following</p>
          </div>
          <button
            onClick={() => navigate('/listener/stats')}
            className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05] text-center hover:bg-white/[0.06] transition active:scale-95"
          >
            {stats.topArtist ? (
              <>
                <p className="text-[10px] font-bold text-white truncate">{stats.topArtist.artist_name}</p>
                <p className="text-[10px] text-white/30 mt-0.5">Top artist →</p>
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4 text-purple-400/70 mx-auto mb-0.5" />
                <p className="text-[10px] text-white/30">Stats →</p>
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Download quota bar (listener only) ── */}
      {!isArtist && (
        <div className="mb-4">
          {isPro ? (
            <div className="rounded-2xl overflow-hidden border border-purple-500/20"
              style={{ background: 'linear-gradient(135deg, rgba(88,28,135,0.15) 0%, rgba(15,15,30,0.95) 100%)' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
                    <Zap className="w-3 h-3 text-white" />
                  </div>
                  <p className="text-sm font-bold text-white">Fan Pro</p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>
                  Active
                </span>
              </div>

              {/* Downloads quota */}
              <div className="px-4 py-3 border-b border-white/[0.04]">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-1.5">
                    <Download className="w-3 h-3 text-green-400" />
                    <p className="text-xs font-semibold text-white">Free Downloads</p>
                  </div>
                  <p className="text-[11px] text-white/40">{stats.monthlyDownloads} / {freeQuota} used</p>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${quotaPct >= 100 ? 'bg-red-400' : quotaPct >= 66 ? 'bg-yellow-400' : 'bg-green-400'}`}
                    style={{ width: `${quotaPct}%` }} />
                </div>
                <p className="text-[11px] text-white/20 mt-1">
                  {downloadsLeft > 0 ? `${downloadsLeft} left this month` : 'Resets 1st of next month'}
                </p>
              </div>

              {/* App Themes */}
              <div className="px-4 py-3 border-b border-white/[0.04]">
                <button
                  onClick={() => setShowThemes(p => !p)}
                  className="w-full flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Palette className="w-3.5 h-3.5 text-purple-400" />
                    <p className="text-xs font-semibold text-white">App Theme</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-white/40 capitalize">{prefs.theme?.replace('_', ' ') || 'Default'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform ${showThemes ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {showThemes && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {THEMES.map(theme => (
                      <button key={theme.key}
                        onClick={() => savePrefs({ theme: theme.key })}
                        className="flex items-center space-x-2.5 p-2.5 rounded-xl border transition active:scale-95"
                        style={{
                          background: prefs.theme === theme.key ? `${theme.accent}20` : 'rgba(255,255,255,0.03)',
                          borderColor: prefs.theme === theme.key ? `${theme.accent}50` : 'rgba(255,255,255,0.06)',
                        }}>
                        <div className="w-8 h-8 rounded-lg flex-shrink-0 border border-white/10"
                          style={{ backgroundColor: theme.bg }}>
                          <div className="w-full h-full rounded-lg flex items-end justify-end p-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.accent }} />
                          </div>
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-xs font-medium text-white truncate">{theme.label}</p>
                        </div>
                        {prefs.theme === theme.key && (
                          <Check className="w-3 h-3 flex-shrink-0" style={{ color: theme.accent }} />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fan Badge toggle */}
              <div className="px-4 py-3 border-b border-white/[0.04]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-3.5 h-3.5 text-yellow-400" />
                    <div>
                      <p className="text-xs font-semibold text-white">Fan Badge</p>
                      <p className="text-[11px] text-white/30">Shows on comments & guestbooks</p>
                    </div>
                  </div>
                  <button
                    onClick={() => savePrefs({ fanBadge: !prefs.fanBadge })}
                    className="relative flex-shrink-0"
                    style={{ width: 40, height: 22 }}>
                    <div className={`absolute inset-0 rounded-full transition-colors ${prefs.fanBadge ? 'bg-purple-500' : 'bg-white/10'}`} />
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${prefs.fanBadge ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Stats link */}
              <button
                onClick={() => navigate('/listener/stats')}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition">
                <div className="flex items-center space-x-2">
                  <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                  <p className="text-xs font-semibold text-white">Your Stats</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-white/25" />
              </button>

            </div>
          ) : (
            <button
              onClick={() => navigate('/listener/upgrade')}
              className="w-full flex items-center space-x-3 p-3.5 rounded-xl text-left active:scale-[0.98] transition"
              style={{ background: 'rgba(88,28,135,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">Get Fan Pro</p>
                <p className="text-[10px] text-white/35 mt-0.5">Themes, stats, 3 free downloads & fan badge</p>
              </div>
              <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded-lg flex-shrink-0">$2.99/mo</span>
            </button>
          )}
        </div>
      )}

      {/* ── Navigation items + featured rail ──
          On desktop this becomes a two-column layout: the library cards
          take the space they need, and the previously-empty right side
          gets filled with real artwork instead of dead space. */}
      <div className="lg:flex lg:gap-8 lg:items-start">
        <div className="flex-1 min-w-0 space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
          {items.map(({ icon: Icon, label, path, iconColor, accent, count, sub }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="w-full flex items-center space-x-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] hover:border-white/[0.1] active:bg-white/[0.06] transition group"
            >
              <div className={`w-14 h-14 rounded-2xl ${accent || 'bg-white/[0.06]'} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-7 h-7 ${iconColor}`} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <span className="text-base font-semibold text-white block">{label}</span>
                {sub && <span className="text-xs text-white/30 truncate block mt-0.5">{sub}</span>}
              </div>
              {count != null && count > 0 && (
                <span className="text-sm text-white/25 font-medium mr-1 flex-shrink-0">{count}</span>
              )}
              <ChevronRight className="w-5 h-5 text-white/15 group-hover:text-white/30 transition flex-shrink-0" />
            </button>
          ))}

          {/* "New to you" strip. Deliberately muted, this sits below the
              main cards and shouldn't compete with them for attention.
              Scrolls sideways, click any item to play it directly. */}
          {newToYou.length > 0 && (
            <div className="md:col-span-2 mt-6">
              <p className="text-[10px] uppercase tracking-widest text-white/20 font-semibold mb-3">New to you</p>
              <div className="flex space-x-3 overflow-x-auto pb-2">
                {newToYou.map(t => (
                  <button
                    key={t.id}
                    onClick={() => playTrack(t, newToYou)}
                    className="flex-shrink-0 w-[110px] text-left group"
                  >
                    <div className="w-[110px] h-[110px] rounded-lg overflow-hidden bg-white/[0.04] mb-2 relative">
                      <img
                        src={t.cover_artwork_url}
                        alt=""
                        className="w-full h-full object-cover opacity-50 group-hover:opacity-90 transition duration-300"
                        style={{ filter: 'grayscale(0.5)' }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                          <Play className="w-3.5 h-3.5 text-black ml-0.5" fill="black" />
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-white/50 truncate group-hover:text-white/80 transition">{t.title}</p>
                    <p className="text-[10px] text-white/25 truncate">{t.artists?.artist_name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {featured.length > 0 && (
          <div className="hidden lg:block w-[300px] flex-shrink-0">
            <p className="text-[10px] uppercase tracking-widest text-white/25 font-semibold mb-3">Fresh on Feelz</p>
            <div className="grid grid-cols-2 gap-3">
              {featured.map(t => (
                <button key={t.id} onClick={() => navigate(`/track/${t.slug || t.id}`)}
                  className="text-left group">
                  <div className="w-full aspect-square rounded-xl overflow-hidden bg-white/[0.06] mb-2">
                    <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  </div>
                  <p className="text-xs font-medium text-white truncate">{t.title}</p>
                  <p className="text-[11px] text-white/30 truncate">{t.artists?.artist_name}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}