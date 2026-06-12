import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/useTier';
import { getListenerFeature } from '../contexts/useTier';
import { supabase } from '../supabaseClient';
import {
  Heart, Download, ListMusic, Users, Clock, ChevronRight,
  Music, BarChart3, Zap, TrendingUp, Crown, Palette,
  Shield, ChevronDown, Check, BarChart2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ── App theme definitions (module-level so they never recreate) ───────────────
const THEMES = [
  { key: 'default',   label: 'Default',     bg: '#000000', accent: '#8B5CF6' },
  { key: 'deep_navy', label: 'Deep Navy',   bg: '#0a0f1e', accent: '#3B82F6' },
  { key: 'forest',    label: 'Forest Dark', bg: '#0a1a0f', accent: '#22C55E' },
  { key: 'warm_dark', label: 'Warm Dark',   bg: '#1a0f0a', accent: '#F97316' },
];

function applyTheme(themeKey) {
  const theme = THEMES.find(t => t.key === themeKey) || THEMES[0];
  // CSS vars for components that read them
  document.documentElement.style.setProperty('--app-bg', theme.bg);
  document.documentElement.style.setProperty('--app-accent', theme.accent);
  // Apply to body and root for full bleed coverage
  document.body.style.backgroundColor = theme.bg;
  const root = document.getElementById('root');
  if (root) root.style.backgroundColor = theme.bg;
}

export default function LibraryPage() {
  const { user, isArtist } = useAuth();
  const { listenerTierSlug } = useTier();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    likes: 0, recentTrack: null, playlists: 0, following: 0, downloads: 0,
    totalStreams: 0, topArtist: null, monthlyDownloads: 0,
  });
  const [prefs, setPrefs] = useState({ theme: 'default', fanBadge: true });
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
    { icon: Heart,     label: 'Liked Songs',     path: '/library/likes',     iconColor: 'text-red-400/70',    count: stats.likes,     accent: 'bg-red-500/10' },
    { icon: Clock,     label: 'Recently Played', path: '/library/recent',    iconColor: 'text-cyan-400/70',   count: null,            accent: 'bg-cyan-500/10', sub: stats.recentTrack?.title },
    { icon: Download,  label: 'Downloads',       path: '/library/downloads', iconColor: 'text-green-400/70',  count: stats.downloads, accent: 'bg-green-500/10' },
    { icon: ListMusic, label: 'Playlists',        path: '/library/playlists', iconColor: 'text-purple-400/70', count: stats.playlists, accent: 'bg-purple-500/10' },
    { icon: Users,     label: 'Following',        path: '/library/following', iconColor: 'text-blue-400/70',   count: stats.following, accent: 'bg-blue-500/10' },
  ];

  return (
    <div className="pb-4 px-4 md:px-0 max-w-2xl mx-auto">
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

      {/* ── Navigation items ── */}
      <div className="space-y-1">
        {items.map(({ icon: Icon, label, path, iconColor, accent, count, sub }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="w-full flex items-center space-x-4 p-3.5 rounded-xl hover:bg-white/[0.04] active:bg-white/[0.06] transition group"
          >
            <div className={`w-11 h-11 rounded-xl ${accent || 'bg-white/[0.06]'} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <span className="text-sm font-medium text-white block">{label}</span>
              {sub && <span className="text-xs text-white/30 truncate block mt-0.5">{sub}</span>}
            </div>
            {count != null && count > 0 && (
              <span className="text-xs text-white/25 font-medium mr-1 flex-shrink-0">{count}</span>
            )}
            <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/30 transition flex-shrink-0" />
          </button>
        ))}


      </div>
    </div>
  );
}