/**
 * ChallengeXPModal.js
 * Shows a user's full challenge XP breakdown + recent completions.
 * Bottom sheet modal — same pattern as the DM modal on ArtistProfilePage.
 * Triggered from a XP pill on the profile page.
 */

import React, { useState, useEffect } from 'react';
import { X, Zap, Star, Flame, Crown } from 'lucide-react';
import { supabase } from '../supabaseClient';

const TIER_CONFIG = {
  Common:    { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.25)', icon: Zap,   label: 'Common'    },
  Rare:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)',  icon: Star,  label: 'Rare'      },
  Epic:      { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)', icon: Flame, label: 'Epic'      },
  Legendary: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.3)',   icon: Crown, label: 'Legendary' },
};

const TIER_POINTS = { Common: 100, Rare: 250, Epic: 500, Legendary: 1000 };

export default function ChallengeXPModal({ userId, onClose }) {
  const [xpData, setXpData]             = useState(null);
  const [completions, setCompletions]   = useState([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ data: xp }, { data: recent }] = await Promise.all([
        supabase.from('challenge_xp').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('challenge_completions')
          .select('*, tracks(title, cover_artwork_url)')
          .eq('user_id', userId)
          .order('completed_at', { ascending: false })
          .limit(10),
      ]);
      setXpData(xp || { total_xp: 0, common_count: 0, rare_count: 0, epic_count: 0, legendary_count: 0 });
      setCompletions(recent || []);
      setLoading(false);
    })();
  }, [userId]);

  const total = xpData?.total_xp || 0;
  const rank = total >= 10000 ? 'Legend' : total >= 5000 ? 'Elite' : total >= 2000 ? 'Pro' : total >= 500 ? 'Rising' : 'Rookie';
  const rankColor = total >= 10000 ? '#fbbf24' : total >= 5000 ? '#a78bfa' : total >= 2000 ? '#60a5fa' : total >= 500 ? '#34d399' : '#9ca3af';

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-neutral-900 rounded-t-2xl border-t border-white/[0.08]"
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/10" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-4 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-bold text-white">Challenge XP</h3>
            <p className="text-[11px] text-white/30 mt-0.5">Challenges completed by uploading a track</p>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-white/30" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto max-h-[70vh]">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-5 h-5 rounded-full border-2 border-white/10 border-t-purple-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Total XP + Rank */}
              <div className="rounded-2xl p-4 mb-4 flex items-center justify-between"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Total XP</p>
                  <p className="text-3xl font-black text-white">{total.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Rank</p>
                  <p className="text-xl font-black" style={{ color: rankColor }}>{rank}</p>
                </div>
              </div>

              {/* Tier breakdown */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                {Object.entries(TIER_CONFIG).map(([tier, cfg]) => {
                  const count = xpData?.[`${tier.toLowerCase()}_count`] || 0;
                  const Icon = cfg.icon;
                  return (
                    <div key={tier} className="rounded-xl p-3"
                      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                      <div className="flex items-center space-x-1.5 mb-1.5">
                        <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: cfg.color }}>{tier}</span>
                      </div>
                      <p className="text-lg font-black text-white">{count}</p>
                      <p className="text-[10px] text-white/30">{count * TIER_POINTS[tier]} XP earned</p>
                    </div>
                  );
                })}
              </div>

              {/* Recent completions */}
              {completions.length > 0 && (
                <>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Recent completions</p>
                  <div className="space-y-2">
                    {completions.map(c => {
                      const cfg = TIER_CONFIG[c.challenge_tier] || TIER_CONFIG.Common;
                      return (
                        <div key={c.id} className="rounded-xl p-3 flex items-start space-x-3"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          {c.tracks?.cover_artwork_url
                            ? <img src={c.tracks.cover_artwork_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                            : <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex-shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white/80 line-clamp-2 leading-snug">{c.challenge_prompt}</p>
                            {c.tracks?.title && (
                              <p className="text-[10px] text-white/30 mt-0.5 truncate">↳ {c.tracks.title}</p>
                            )}
                          </div>
                          <span className="text-[10px] font-bold flex-shrink-0" style={{ color: cfg.color }}>
                            +{c.challenge_points}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {completions.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-sm text-white/20">No challenges completed yet.</p>
                  <p className="text-xs text-white/10 mt-1">Spin the wheel and upload a track to earn XP.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
