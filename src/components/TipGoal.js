/**
 * TipGoal.js
 *
 * Shows a fundraising progress bar on the artist's profile page.
 * Artists create/manage goals from their dashboard (ArtistDashboard).
 * Listeners see the goal and current progress when they visit.
 * Progress updates automatically when a tip comes in (via TipButton).
 *
 * Props:
 *   artistId   - the artist's ID
 *   primaryColor / textColor / bgColor - theme colours from ArtistProfilePage
 *   isOwner    - if true, show edit/create controls
 */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useHaptics } from '../hooks/useHaptics';
import { Target, X, Loader, Check, Edit2 } from 'lucide-react';

function GoalEditModal({ goal, artistId, onClose, onSaved }) {
  const [title, setTitle]       = useState(goal?.title || '');
  const [desc, setDesc]         = useState(goal?.description || '');
  const [target, setTarget]     = useState(goal?.target_usd?.toString() || '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const handleSave = async () => {
    if (!title.trim() || !target) { setError('Title and target amount are required'); return; }
    const targetNum = parseFloat(target);
    if (isNaN(targetNum) || targetNum < 10) { setError('Minimum goal is $10'); return; }
    setSaving(true);
    try {
      if (goal?.id) {
        await supabase.from('tip_goals').update({
          title: title.trim(), description: desc.trim() || null, target_usd: targetNum,
        }).eq('id', goal.id);
      } else {
        await supabase.from('tip_goals').insert({
          artist_id: artistId, title: title.trim(),
          description: desc.trim() || null, target_usd: targetNum,
          is_active: true,
        });
      }
      onSaved();
      onClose();
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!goal?.id) return;
    await supabase.from('tip_goals').delete().eq('id', goal.id);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center px-6 bg-black/70 backdrop-blur-sm md:pl-64"
      onClick={onClose}>
      <div className="w-full overflow-y-auto rounded-3xl p-5" style={{ maxWidth: 400, maxHeight: "80vh", backgroundColor: "#0f0f0f", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 32px 64px rgba(0,0,0,0.6)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">{goal ? 'Edit Goal' : 'Create a Tip Goal'}</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-white/30" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1 block">What are you raising for?</label>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80}
              placeholder="e.g. Recording the next EP"
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1 block">Description (optional)</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} maxLength={300} rows={2}
              placeholder="Give fans context on what their support means"
              className="w-full bg-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none resize-none" />
          </div>
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1 block">Target ($USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
              <input value={target} onChange={e => setTarget(e.target.value)} type="number" min="10" max="10000"
                placeholder="500"
                className="w-full bg-white/[0.06] rounded-xl pl-7 pr-3 py-2.5 text-sm text-white placeholder-white/20 outline-none" />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 bg-purple-600 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition flex items-center justify-center space-x-2">
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{saving ? 'Saving...' : goal ? 'Save Changes' : 'Create Goal'}</span>
          </button>
          {goal && (
            <button onClick={handleDelete}
              className="w-full py-2 text-red-400/60 text-xs hover:text-red-400 transition">
              Remove goal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TipGoal({ artistId, primaryColor = '#8B5CF6', textColor = '#fff', isOwner = false }) {
  const { tap } = useHaptics();
  const [goal, setGoal]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [showEdit, setShowEdit]   = useState(false);

  const fetchGoal = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('tip_goals')
        .select('*')
        .eq('artist_id', artistId)
        .eq('is_active', true)
        .maybeSingle();
      setGoal(data);
    } catch {}
    setLoading(false);
  }, [artistId]);

  useEffect(() => { fetchGoal(); }, [fetchGoal]);

  // Subscribe to real-time tip updates so the bar moves live
  useEffect(() => {
    if (!goal?.id) return;
    const channel = supabase.channel(`tip-goal-${goal.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tip_goals', filter: `id=eq.${goal.id}` },
        payload => setGoal(prev => prev ? { ...prev, ...payload.new } : prev))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [goal?.id]);

  if (loading) return null;

  // Owner with no goal — show create prompt
  if (!goal && isOwner) {
    return (
      <div className="mx-4 my-3">
        <button onClick={() => { tap(); setShowEdit(true); }}
          className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl border border-dashed border-white/20 text-xs text-white/30 hover:text-white/50 hover:border-white/30 transition">
          <Target className="w-3.5 h-3.5" />
          <span>Set a tip goal</span>
        </button>
        {showEdit && <GoalEditModal goal={null} artistId={artistId} onClose={() => setShowEdit(false)} onSaved={fetchGoal} />}
      </div>
    );
  }

  if (!goal) return null;

  const progress    = Math.min(100, Math.round((goal.current_usd / goal.target_usd) * 100));
  const achieved    = progress >= 100;
  const remaining   = Math.max(0, goal.target_usd - goal.current_usd);

  const formatUSD = (n) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;

  return (
    <div className="mx-4 my-3 p-4 rounded-2xl border"
      style={{ borderColor: `${primaryColor}25`, background: `${primaryColor}0a` }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          <Target className="w-4 h-4 flex-shrink-0" style={{ color: primaryColor }} />
          <p className="text-sm font-semibold" style={{ color: textColor }}>{goal.title}</p>
        </div>
        {isOwner && (
          <button onClick={() => { tap(); setShowEdit(true); }}
            className="p-1 rounded-lg hover:bg-white/10 transition flex-shrink-0 ml-2">
            <Edit2 className="w-3 h-3" style={{ color: `${textColor}40` }} />
          </button>
        )}
      </div>

      {goal.description && (
        <p className="text-xs mb-3 leading-relaxed" style={{ color: `${textColor}50` }}>{goal.description}</p>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: `${primaryColor}20` }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: achieved ? '#22c55e' : primaryColor }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold" style={{ color: achieved ? '#22c55e' : primaryColor }}>
            {achieved ? '🎉 Goal reached!' : `${formatUSD(goal.current_usd)} raised`}
          </span>
          <span className="text-[11px]" style={{ color: `${textColor}40` }}>
            {achieved ? formatUSD(goal.target_usd) : `${formatUSD(remaining)} to go · ${formatUSD(goal.target_usd)} goal`}
          </span>
        </div>
      </div>

      {showEdit && <GoalEditModal goal={goal} artistId={artistId} onClose={() => setShowEdit(false)} onSaved={fetchGoal} />}
    </div>
  );
}