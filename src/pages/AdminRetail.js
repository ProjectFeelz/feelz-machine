// src/pages/AdminRetail.js
//
// WARNING: THIS FILE IS A RECOVERY STUB. THE REAL PANEL IS MISSING.
//
// This file was found byte-identical to RetailAdminPage.js: at some point
// it was overwritten with a copy of the page that is supposed to wrap it.
// The copy imported itself and rendered <AdminRetail embedded /> at the
// bottom, so the component mounted itself forever. That is the duplicated
// header and KPI block, repeating down the page.
//
// The recursion is removed below so the page is usable again. But the
// actual retail admin panel, the tabbed Playlists / Venues / Ads /
// Pitches / Payouts / Analytics / Pricing / Auto-Compile UI, is not in
// this repo any more. It was not deleted by anything in this session, it
// was already gone.
//
// RESTORE IT FROM GIT rather than rebuilding it:
//   git log --oneline --follow -- src/pages/AdminRetail.js
//   git show <sha>:src/pages/AdminRetail.js | head -40   # confirm it is
//                                                        # the real panel
//   git checkout <sha> -- src/pages/AdminRetail.js
//
// Pick the newest commit whose version does NOT import './AdminRetail'.
// Restoring will overwrite this stub, which is the intended outcome.
//
// Original header follows.
//
// Standalone retail admin panel at /retail-admin.
//
// Separate from the main admin panel on purpose: a retail admin can run
// retail and nothing else. The real enforcement is in RLS (see migration
// 55) — this page just reflects it. Hiding tabs in the UI would not be
// security on its own.
//
// Built full-width with responsive grids from the start, so it doesn't
// inherit the fixed-column squeeze the main admin pages had.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Store, Loader, ArrowLeft, Music, Users, Megaphone, ListMusic } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

export default function AdminRetail({ embedded = false }) {
  const navigate = useNavigate();
  const { user, rawIsAdmin } = useAuth();

  const [checking, setChecking] = React.useState(true);
  const [allowed, setAllowed]   = React.useState(false);
  const [stats, setStats]       = React.useState(null);

  React.useEffect(() => {
    if (!user) { setChecking(false); return; }
    if (rawIsAdmin) { setAllowed(true); setChecking(false); return; }
    supabase.from('retail_admins').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { setAllowed(!!data); setChecking(false); });
  }, [user, rawIsAdmin]);

  // Retail-only stats. Deliberately no revenue figures: retail admins see
  // catalogue and activity, not money.
  React.useEffect(() => {
    if (!allowed) return;
    Promise.all([
      supabase.from('retail_venues').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('retail_playlists').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('retail_catalog').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('retail_ads').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]).then(([v, p, c, a]) => setStats({
      venues: v.count || 0,
      playlists: p.count || 0,
      tracks: c.count || 0,
      ads: a.count || 0,
    }));
  }, [allowed]);

  const MissingPanelNotice = (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
      <p className="text-sm font-bold text-amber-200">Retail panel not loaded</p>
      <p className="text-xs text-amber-100/60 mt-1.5 leading-relaxed">
        The tabbed retail admin panel is missing from this build. Restore
        src/pages/AdminRetail.js from git history, see the note at the top of
        that file.
      </p>
    </div>
  );

  // Embedded is the normal case: both RetailAdminPage and AdminContent
  // render their own header and KPIs, so rendering them again here is what
  // produced the duplicated layers.
  if (embedded) {
    return <div className="px-6 pb-10">{MissingPanelNotice}</div>;
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <Store className="w-9 h-9 text-white/15 mx-auto" />
          <p className="text-sm text-white/50">You don't have access to the retail admin panel.</p>
          <button onClick={() => navigate('/hub')} className="text-xs text-purple-400 hover:text-purple-300 underline">
            Back to Hub
          </button>
        </div>
      </div>
    );
  }

  const KPIS = stats ? [
    { icon: Store,     label: 'Active venues',    value: stats.venues,    color: 'bg-purple-500/20', text: 'text-purple-300' },
    { icon: ListMusic, label: 'Live playlists',   value: stats.playlists, color: 'bg-blue-500/20',   text: 'text-blue-300'   },
    { icon: Music,     label: 'Tracks in catalogue', value: stats.tracks, color: 'bg-lime-500/20',   text: 'text-lime-300'   },
    { icon: Megaphone, label: 'Active ads',       value: stats.ads,       color: 'bg-amber-500/20',  text: 'text-amber-300'  },
  ] : [];

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>Retail Admin · Feelz Machine</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Header, purple-tinted so it reads as retail rather than main admin */}
      <div className="sticky top-0 z-20 backdrop-blur-xl px-6 py-4"
        style={{
          background: 'linear-gradient(135deg, rgba(30,20,60,0.97) 0%, rgba(14,14,18,0.97) 60%)',
          borderBottom: '1px solid rgba(167,139,250,0.18)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button onClick={() => navigate(rawIsAdmin ? '/hub' : '/retail/player')}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.14] transition">
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div>
              <p className="text-purple-400 text-[10px] font-bold tracking-[0.2em] uppercase">Feelz Retail</p>
              <h1 className="text-lg font-bold text-white">Admin</h1>
            </div>
          </div>
          <button onClick={() => navigate('/retail/player')}
            className="text-xs font-bold px-3 py-2 rounded-lg bg-purple-500/15 text-purple-200 border border-purple-400/20 hover:bg-purple-500/30 transition">
            Open player
          </button>
        </div>
      </div>

      <div className="px-6 pt-6">
        {/* KPIs, responsive from the start */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {KPIS.map(({ icon: Icon, label, value, color, text }) => (
              <div key={label} className="rounded-2xl p-5 border border-white/[0.07] bg-white/[0.03]">
                <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${text}`} />
                </div>
                <p className="text-3xl font-black text-white leading-none">{value}</p>
                <p className="text-xs text-white/35 mt-2">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Where the retail tabs belong. The component that rendered them is
          missing from the repo, see the note at the top of this file. This
          says so rather than showing an empty page, because silent
          emptiness is what let the problem sit unnoticed. */}
      <div className="px-6 pb-10">{MissingPanelNotice}</div>
    </div>
  );
}