import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  Users, DollarSign, TrendingUp, Plus, Check, X,
  Loader, Zap, Clock, BarChart2, Gift, AlertCircle
} from 'lucide-react';

export default function AdminAffiliates({ embedded = false }) {
  const [affiliates, setAffiliates]   = useState([]);
  const [pendingRedemptions, setPendingRedemptions] = useState([]);
  const [campaigns, setCampaigns]     = useState([]);
  const [payouts, setPayouts]         = useState([]);
  const [stats, setStats]             = useState({});
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState('overview');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    title: '', description: '', target_type: 'all',
    credits_reward: 50, ends_at: '', artist_id: '', track_id: '',
  });
  const [artists, setArtists]         = useState([]);
  const [saving, setSaving]           = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: affs },
        { data: camps },
        { data: pays },
        { data: convStats },
        { data: reds },
      ] = await Promise.all([
        supabase.from('affiliates').select('*').order('total_earned_zar', { ascending: false }).limit(100),
        supabase.from('affiliate_campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('affiliate_payouts').select('*').eq('status', 'requested').order('requested_at'),
        supabase.from('affiliate_conversions').select('status, commission_zar, credits_earned, type'),
        supabase.from('affiliate_credit_redemptions').select('*').eq('status', 'pending').order('requested_at'),
      ]);
      setPendingRedemptions(reds || []);

      // Enrich affiliates with display names separately
      const enrichedAffs = await Promise.all((affs || []).map(async (aff) => {
        const { data: art } = await supabase.from('artists').select('artist_name').eq('user_id', aff.user_id).maybeSingle();
        const { data: lst } = await supabase.from('listeners').select('display_name').eq('user_id', aff.user_id).maybeSingle();
        const { data: ven } = aff.role === 'venue'
          ? await supabase.from('retail_venues').select('business_name').eq('user_id', aff.user_id).maybeSingle()
          : { data: null };
        return { ...aff, display_name: art?.artist_name || ven?.business_name || lst?.display_name || aff.user_id?.slice(0,8) };
      }));
      setAffiliates(enrichedAffs);
      setCampaigns(camps || []);
      setPayouts(pays || []);

      const convs = convStats || [];
      setStats({
        totalAffiliates:   enrichedAffs.length,
        activeAffiliates:  enrichedAffs.filter(a => a.status === 'active').length,
        totalEarned:       enrichedAffs.reduce((s, a) => s + (a.total_earned_zar || 0), 0),
        pendingPayouts:    (pays || []).reduce((s, p) => s + (p.amount_zar || 0), 0),
        totalConversions:  convs.length,
        totalCommission:   convs.reduce((s, c) => s + (c.commission_zar || 0), 0),
      });

      const { data: arts } = await supabase.from('artists').select('id, artist_name').order('artist_name').limit(200);
      setArtists(arts || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApprovePayout = async (payoutId, affiliateId, amount) => {
    await supabase.from('affiliate_payouts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', payoutId);
    await supabase.from('affiliates').update({
      paid_out_zar: supabase.rpc('increment_decimal', { x: amount }),
    }).eq('id', affiliateId);
    fetchData();
  };

  const handleRejectPayout = async (payoutId) => {
    const { data: payout } = await supabase.from('affiliate_payouts').select('amount_zar, affiliate_id').eq('id', payoutId).single();
    await supabase.from('affiliate_payouts').update({ status: 'rejected' }).eq('id', payoutId);
    // Return funds to pending
    await supabase.from('affiliates').update({
      pending_zar: supabase.rpc('increment_decimal', { x: payout.amount_zar }),
    }).eq('id', payout.affiliate_id);
    fetchData();
  };

  const handleApproveAffiliate = async (userId) => {
    const { error } = await supabase.rpc('admin_approve_affiliate', { p_user_id: userId });
    if (error) { console.error(error); return; }
    fetchData();
  };

  const handleFulfillRedemption = async (id, approve) => {
    const { error } = await supabase.rpc('admin_fulfill_redemption', { p_redemption_id: id, p_approve: approve });
    if (error) { console.error(error); return; }
    setPendingRedemptions(prev => prev.filter(r => r.id !== id));
  };

  const handleCreateCampaign = async () => {
    setSaving(true);
    try {
      await supabase.from('affiliate_campaigns').insert({
        ...campaignForm,
        artist_id: campaignForm.artist_id || null,
        track_id:  campaignForm.track_id  || null,
        ends_at:   campaignForm.ends_at   || null,
        is_active: true,
      });
      setShowNewCampaign(false);
      setCampaignForm({ title: '', description: '', target_type: 'all', credits_reward: 50, ends_at: '', artist_id: '', track_id: '' });
      fetchData();
    } catch (err) { alert('Failed to create campaign'); }
    setSaving(false);
  };

  const handleToggleCampaign = async (id, current) => {
    await supabase.from('affiliate_campaigns').update({ is_active: !current }).eq('id', id);
    fetchData();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/30" /></div>;

  return (
    <div className="pt-4 pb-32 px-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04] mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Affiliates</h1>
          <p className="text-xs text-white/30 mt-0.5">Manage your affiliate programme</p>
        </div>
      </div>
      <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Active Affiliates', value: stats.activeAffiliates || 0, icon: Users, color: 'text-purple-400' },
          { label: 'Total Commission', value: `R${(stats.totalCommission || 0).toFixed(2)}`, icon: DollarSign, color: 'text-green-400' },
          { label: 'Pending Payouts', value: `R${(stats.pendingPayouts || 0).toFixed(2)}`, icon: Clock, color: 'text-yellow-400' },
          { label: 'Total Conversions', value: stats.totalConversions || 0, icon: TrendingUp, color: 'text-blue-400' },
          { label: 'Total Affiliates', value: stats.totalAffiliates || 0, icon: BarChart2, color: 'text-pink-400' },
          { label: 'Total Earned', value: `R${(stats.totalEarned || 0).toFixed(2)}`, icon: Gift, color: 'text-orange-400' },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
            <div className="flex items-center justify-between mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className={`text-xl font-black ${s.color}`}>{s.value}</span>
            </div>
            <p className="text-[10px] text-white/30">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-white/[0.03] rounded-lg p-1">
        {['overview', 'payouts', 'redemptions', 'campaigns'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-md text-xs font-medium capitalize transition ${tab === t ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'}`}>
            {t} {t === 'payouts' && payouts.length > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full px-1">{payouts.length}</span>}
            {t === 'redemptions' && pendingRedemptions.length > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] rounded-full px-1">{pendingRedemptions.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'redemptions' && (
        <div className="space-y-2">
          {pendingRedemptions.length === 0 ? (
            <p className="text-center text-white/20 text-sm py-8">No pending redemptions.</p>
          ) : pendingRedemptions.map(r => (
            <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{r.reward_label}</p>
                <p className="text-[10px] text-white/30">{r.cost} credits · requested {new Date(r.requested_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center space-x-1.5 flex-shrink-0">
                <button onClick={() => handleFulfillRedemption(r.id, true)}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 hover:bg-green-500/25 transition">Approve</button>
                <button onClick={() => handleFulfillRedemption(r.id, false)}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/[0.06] text-white/50 hover:bg-white/[0.1] transition">Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Overview — affiliate list */}
      {tab === 'overview' && (
        <div className="space-y-2">
          {affiliates.map(a => (
            <div key={a.id} className="flex items-center space-x-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{a.display_name || 'User'}</p>
                <p className="text-[10px] text-white/30">{a.ref_code} · {a.role} · {a.total_conversions} conversions</p>
              </div>
              <div className="text-right flex-shrink-0 space-y-1">
                {a.role === 'listener'
                  ? <p className="text-sm font-bold text-yellow-400">{a.credits_balance || 0} credits</p>
                  : <p className="text-sm font-bold text-green-400">R{(a.total_earned_zar || 0).toFixed(2)}</p>}
                <div className="flex items-center justify-end space-x-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${a.status === 'active' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                    {a.status}
                  </span>
                  {a.status !== 'active' && (
                    <button onClick={() => handleApproveAffiliate(a.user_id)}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 transition">
                      Approve now
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {affiliates.length === 0 && <p className="text-center text-white/20 text-sm py-8">No affiliates yet</p>}
        </div>
      )}

      {/* Payouts */}
      {tab === 'payouts' && (
        <div className="space-y-3">
          {payouts.length === 0 ? (
            <p className="text-center text-white/20 text-sm py-8">No pending payout requests</p>
          ) : payouts.map(p => (
            <div key={p.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{p.affiliates?.artists?.artist_name || 'Unknown'}</p>
                  <p className="text-xs text-white/40">{p.method} · {new Date(p.requested_at).toLocaleDateString('en-ZA')}</p>
                </div>
                <p className="text-lg font-black text-green-400">R{p.amount_zar.toFixed(2)}</p>
              </div>
              <div className="flex space-x-2">
                <button onClick={() => handleApprovePayout(p.id, p.affiliate_id, p.amount_zar)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-green-500/15 text-green-400 border border-green-500/25 transition hover:bg-green-500/25">
                  <Check className="w-3.5 h-3.5 inline mr-1" />Approve
                </button>
                <button onClick={() => handleRejectPayout(p.id)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 transition hover:bg-red-500/20">
                  <X className="w-3.5 h-3.5 inline mr-1" />Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campaigns */}
      {tab === 'campaigns' && (
        <div className="space-y-3">
          <button onClick={() => setShowNewCampaign(!showNewCampaign)}
            className="w-full py-3 rounded-xl text-sm font-bold border border-purple-500/30 text-purple-400 bg-purple-500/10 transition hover:bg-purple-500/15 flex items-center justify-center space-x-2">
            <Plus className="w-4 h-4" /><span>New Campaign Brief</span>
          </button>

          {showNewCampaign && (
            <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.06] space-y-3">
              <p className="text-sm font-bold text-white">New Campaign</p>
              <input value={campaignForm.title} onChange={e => setCampaignForm({ ...campaignForm, title: e.target.value })}
                placeholder="Campaign title" className="w-full px-3 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/20 outline-none border border-white/[0.06]" />
              <textarea value={campaignForm.description} onChange={e => setCampaignForm({ ...campaignForm, description: e.target.value })}
                placeholder="What should affiliates focus on?" rows={3}
                className="w-full px-3 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/20 outline-none border border-white/[0.06] resize-none" />
              <div className="grid grid-cols-2 gap-2">
                <select value={campaignForm.target_type} onChange={e => setCampaignForm({ ...campaignForm, target_type: e.target.value })}
                  className="px-3 py-2 bg-white/[0.06] rounded-xl text-sm text-white outline-none border border-white/[0.06]">
                  <option value="all">All affiliates</option>
                  <option value="artists">Artists only</option>
                  <option value="listeners">Listeners only</option>
                  <option value="beatmakers">Beatmakers only</option>
                </select>
                <input type="number" value={campaignForm.credits_reward}
                  onChange={e => setCampaignForm({ ...campaignForm, credits_reward: parseInt(e.target.value) })}
                  placeholder="Credits reward"
                  className="px-3 py-2 bg-white/[0.06] rounded-xl text-sm text-white outline-none border border-white/[0.06]" />
              </div>
              <select value={campaignForm.artist_id} onChange={e => setCampaignForm({ ...campaignForm, artist_id: e.target.value })}
                className="w-full px-3 py-2 bg-white/[0.06] rounded-xl text-sm text-white outline-none border border-white/[0.06]">
                <option value="">No specific artist</option>
                {artists.map(a => <option key={a.id} value={a.id}>{a.artist_name}</option>)}
              </select>
              <input type="datetime-local" value={campaignForm.ends_at}
                onChange={e => setCampaignForm({ ...campaignForm, ends_at: e.target.value })}
                className="w-full px-3 py-2 bg-white/[0.06] rounded-xl text-sm text-white outline-none border border-white/[0.06]" />
              <div className="flex space-x-2">
                <button onClick={handleCreateCampaign} disabled={saving || !campaignForm.title}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-white text-black transition disabled:opacity-40">
                  {saving ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : 'Create Campaign'}
                </button>
                <button onClick={() => setShowNewCampaign(false)}
                  className="px-4 py-2.5 rounded-xl text-sm text-white/40 border border-white/[0.08] hover:bg-white/[0.04] transition">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {campaigns.map(c => (
            <div key={c.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-white">{c.title}</p>
                  <p className="text-[10px] text-white/30">{c.target_type} · +{c.credits_reward} credits · {c.total_clicks} clicks</p>
                </div>
                <button onClick={() => handleToggleCampaign(c.id, c.is_active)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-full transition ${c.is_active ? 'bg-green-500/15 text-green-400' : 'bg-white/[0.06] text-white/30'}`}>
                  {c.is_active ? 'Active' : 'Paused'}
                </button>
              </div>
              {c.description && <p className="text-xs text-white/40">{c.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}