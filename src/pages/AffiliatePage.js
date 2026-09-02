import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ChevronLeft, Copy, Check, TrendingUp, Users, DollarSign,
  Star, Gift, Link, Loader, AlertCircle, ExternalLink,
  BarChart2, Clock, CheckCircle, Zap
} from 'lucide-react';

const BASE_URL = 'https://www.feelzmachine.com';

function StatCard({ icon: Icon, label, value, sub, color = 'text-purple-400' }) {
  return (
    <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.06]">
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <span className={`text-2xl font-black ${color}`}>{value}</span>
      </div>
      <p className="text-xs text-white/40">{label}</p>
      {sub && <p className="text-[10px] text-white/20 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AffiliatePage() {
  const navigate  = useNavigate();
  const { user, artist } = useAuth();

  const [affiliate, setAffiliate]     = useState(null);
  const [conversions, setConversions] = useState([]);
  const [campaigns, setCampaigns]     = useState([]);
  const [payouts, setPayouts]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [applying, setApplying]       = useState(false);
  const [copied, setCopied]           = useState(false);
  const [activeTab, setActiveTab]     = useState('overview');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('paypal');
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [redeemingKey, setRedeemingKey] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [eligibilityInfo, setEligibilityInfo] = useState(null);
  const [progress, setProgress] = useState(null);
  const [isNewsletterEditor, setIsNewsletterEditor] = useState(false);
  const [retailVenue, setRetailVenue] = useState(null);
  const [retailVenueChecked, setRetailVenueChecked] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('newsletter_editors').select('id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setIsNewsletterEditor(!!data));
  }, [user]);

  useEffect(() => {
    if (!user || artist) { setRetailVenueChecked(true); return; }
    supabase.from('retail_venues').select('id, business_name').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { setRetailVenue(data); setRetailVenueChecked(true); });
  }, [user, artist]);

  const isVenue = !artist && !!retailVenue;

  const isListener = !artist;
  const refLink = affiliate ? `${BASE_URL}?ref=${affiliate.ref_code}` : '';

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Check affiliate record
      const { data: aff } = await supabase
        .from('affiliates').select('*').eq('user_id', user.id).maybeSingle();
      setAffiliate(aff || null);

      if (aff) {
        // Fetch conversions
        const { data: convs } = await supabase
          .from('affiliate_conversions').select('*')
          .eq('affiliate_id', aff.id)
          .order('created_at', { ascending: false }).limit(50);
        setConversions(convs || []);

        // Fetch payouts
        const { data: pays } = await supabase
          .from('affiliate_payouts').select('*')
          .eq('affiliate_id', aff.id)
          .order('requested_at', { ascending: false }).limit(20);
        setPayouts(pays || []);

        // Fetch credit redemption history
        const { data: reds } = await supabase
          .from('affiliate_credit_redemptions').select('*')
          .eq('affiliate_id', aff.id)
          .order('requested_at', { ascending: false }).limit(20);
        setRedemptions(reds || []);
      } else {
        // Check eligibility
        const { data: eligible } = await supabase
          .rpc('check_affiliate_eligibility', { p_user_id: user.id });
        setEligibilityInfo(eligible);

        // Fetch the actual numbers behind each requirement, so the gate can
        // show real progress instead of a flat pass/fail
        const accountDays = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000);
        if (isListener) {
          const [{ count: followingCount }, { count: streamCount }] = await Promise.all([
            supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
            supabase.from('streams').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          ]);
          setProgress({
            accountDays, accountNeeded: 14,
            followingCount: followingCount || 0, followingNeeded: 10,
            streamCount: streamCount || 0, streamNeeded: 20,
          });
        } else if (artist) {
          const { count: trackCount } = await supabase
            .from('tracks').select('*', { count: 'exact', head: true })
            .eq('artist_id', artist.id).eq('is_published', true);
          setProgress({
            accountDays, accountNeeded: 30,
            trackCount: trackCount || 0, trackNeeded: 1,
          });
        }
      }

      // Fetch active campaigns
      const { data: camps } = await supabase
        .from('affiliate_campaigns').select('*, artists(artist_name), tracks(title)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      setCampaigns(camps || []);
    } catch (err) {
      console.error('AffiliatePage fetch error:', err);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await fetch('/.netlify/functions/affiliate-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', userId: user.id }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); }
      else { setAffiliate(data.affiliate); fetchData(); }
    } catch (err) { alert('Something went wrong. Please try again.'); }
    setApplying(false);
  };

  const redeemCredits = async (reward) => {
    setRedeemingKey(reward.key);
    const { error } = await supabase.rpc('request_credit_redemption', {
      p_reward_key: reward.key,
      p_reward_label: reward.label,
      p_cost: reward.cost,
    });
    setRedeemingKey(null);
    if (error) { alert(error.message); return; }
    fetchData();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(refLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Join Feelz Machine',
        text: `Listen to the best SA music and beats on Feelz Machine 🎵`,
        url: refLink,
      });
    } else handleCopy();
  };

  const handlePayoutRequest = async () => {
    if (!affiliate || !payoutAmount) return;
    const amount = parseFloat(payoutAmount);
    if (amount < 200) { alert('Minimum payout is R200'); return; }
    if (amount > affiliate.pending_zar) { alert('Amount exceeds your pending balance'); return; }
    setRequestingPayout(true);
    try {
      await supabase.from('affiliate_payouts').insert({
        affiliate_id: affiliate.id,
        amount_zar:   amount,
        method:       payoutMethod,
        status:       'requested',
      });
      // Deduct from pending
      await supabase.from('affiliates').update({
        pending_zar: affiliate.pending_zar - amount,
      }).eq('id', affiliate.id);
      setPayoutAmount('');
      fetchData();
      alert('Payout requested! We\'ll process it within 3-5 business days.');
    } catch { alert('Failed to request payout. Please try again.'); }
    setRequestingPayout(false);
  };

  if (!user) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-white/40 text-sm">Sign in to access the affiliate programme</p>
    </div>
  );

  // Venues get their own simple, self-contained view — a venue account has
  // no follows/streams history to run the artist/listener eligibility
  // logic against, so rather than force it through that branching, this is
  // deliberately separate and much simpler.
  if (retailVenueChecked && isVenue) {
    const venueRefLink = affiliate ? `${BASE_URL}?ref=${affiliate.ref_code}` : '';
    return (
      <div className="min-h-screen bg-black text-white pb-32">
        <div className="px-4 pt-14 pb-4 flex items-center space-x-3 border-b border-white/[0.04]">
          <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Affiliate Programme</h1>
            <p className="text-xs text-white/40">{retailVenue.business_name}</p>
          </div>
        </div>

        <div className="px-6 py-8 space-y-6">
          {loading ? (
            <div className="flex justify-center py-16"><Loader className="w-6 h-6 animate-spin text-white/20" /></div>
          ) : !affiliate ? (
            <div className="rounded-2xl border border-white/[0.06] p-6 text-center space-y-4"
              style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.08), rgba(236,72,153,0.05))' }}>
              <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto">
                <Link className="w-8 h-8 text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold mb-1">Refer other venues, earn rewards</h2>
                <p className="text-sm text-white/50">Same programme artists and listeners already use. Applications from venues go to an admin for a quick review before activating — not an automatic threshold, just a real look.</p>
              </div>
              <button onClick={handleApply} disabled={applying}
                className="w-full py-3 rounded-xl bg-purple-500 text-white font-bold disabled:opacity-40">
                {applying ? 'Applying…' : 'Apply now'}
              </button>
            </div>
          ) : affiliate.status === 'pending' ? (
            <div className="rounded-2xl border border-white/[0.06] p-6 text-center space-y-3">
              <Clock className="w-8 h-8 text-yellow-400 mx-auto" />
              <h2 className="text-lg font-bold">Application received</h2>
              <p className="text-sm text-white/50">We'll activate your link once it's reviewed.</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/[0.06] p-5 space-y-3">
                <p className="text-xs text-white/40 uppercase tracking-wide font-bold">Your referral link</p>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 px-3 py-2.5 bg-white/[0.06] rounded-lg text-sm text-white/80 truncate">{venueRefLink}</div>
                  <button onClick={handleCopy} className="p-2.5 rounded-lg bg-white/[0.06] flex-shrink-0">
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white/50" />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={Users} label="Signups" value={affiliate.total_signups || 0} />
                <StatCard icon={DollarSign} label="Earned" value={`R${(affiliate.total_earned_zar || 0).toFixed(2)}`} color="text-green-400" />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'overview',     label: 'Overview',    icon: BarChart2 },
    { key: 'campaigns',    label: 'Campaigns',   icon: Zap },
    { key: 'conversions',  label: 'Earnings',    icon: DollarSign },
    { key: 'payout',       label: 'Payout',      icon: Gift },
  ];

  return (
    <div className="min-h-screen bg-black text-white pb-32">
      {/* Header */}
      <div className="px-4 pt-14 pb-4 flex items-center space-x-3 border-b border-white/[0.04]">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold">Affiliate Programme</h1>
          <p className="text-xs text-white/40">Earn by growing the platform</p>
        </div>
      </div>

      {isNewsletterEditor && (
        <div className="mx-4 mt-4 rounded-xl border border-purple-500/30 bg-purple-500/[0.08] p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Editor tools</p>
            <p className="text-xs text-white/40 mt-0.5">Compose and send newsletters — nothing else on the platform is affected by this access.</p>
          </div>
          <a href="/newsletter/compose" className="text-xs font-bold px-3 py-2 rounded-lg bg-purple-500 text-white flex-shrink-0 ml-3">Open</a>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader className="w-6 h-6 animate-spin text-white/20" /></div>
      ) : !affiliate ? (
        /* ── Not yet an affiliate ── */
        <div className="px-6 py-8 space-y-6">
          <div className="rounded-2xl border border-white/[0.06] p-6 text-center space-y-4"
            style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.08), rgba(236,72,153,0.05))' }}>
            <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto">
              <Link className="w-8 h-8 text-purple-400" />
            </div>
            <h2 className="text-xl font-black text-white">Join the Programme</h2>
            <p className="text-sm text-white/50 leading-relaxed">
              Share your unique link. Earn 20% commission on every purchase made through it.
              {isListener ? ' Listeners earn Feelz Credits.' : ' Artists earn real cash.'}
            </p>

            {/* Requirements */}
            <div className="text-left bg-white/[0.03] rounded-xl p-4 space-y-4">
              <p className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-1">Requirements</p>
              {progress ? (
                isListener ? (
                  <>
                    <RequirementRow label="Account age (days)" current={progress.accountDays} needed={progress.accountNeeded} />
                    <RequirementRow label="Artists followed" current={progress.followingCount} needed={progress.followingNeeded} />
                    <RequirementRow label="Streams recorded" current={progress.streamCount} needed={progress.streamNeeded} />
                  </>
                ) : (
                  <>
                    <RequirementRow label="Account age (days)" current={progress.accountDays} needed={progress.accountNeeded} />
                    <RequirementRow label="Published tracks" current={progress.trackCount} needed={progress.trackNeeded} />
                  </>
                )
              ) : (
                <p className="text-xs text-white/20">Loading your progress…</p>
              )}
            </div>

            {eligibilityInfo === true ? (
              <button onClick={handleApply} disabled={applying}
                className="w-full py-3.5 rounded-xl font-bold text-sm transition active:scale-[0.98] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}>
                {applying ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : 'Apply Now — Free'}
              </button>
            ) : (
              <div className="flex items-center space-x-2 px-4 py-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <p className="text-xs text-yellow-400">
                  {progress
                    ? (() => {
                        const missing = [];
                        if (isListener) {
                          if (progress.followingCount < progress.followingNeeded) missing.push(`follow ${progress.followingNeeded - progress.followingCount} more artist${progress.followingNeeded - progress.followingCount === 1 ? '' : 's'}`);
                          if (progress.streamCount < progress.streamNeeded) missing.push(`${progress.streamNeeded - progress.streamCount} more stream${progress.streamNeeded - progress.streamCount === 1 ? '' : 's'}`);
                          if (progress.accountDays < progress.accountNeeded) missing.push(`${progress.accountNeeded - progress.accountDays} more day${progress.accountNeeded - progress.accountDays === 1 ? '' : 's'} on your account`);
                        } else {
                          if (progress.trackCount < progress.trackNeeded) missing.push('publish a track');
                          if (progress.accountDays < progress.accountNeeded) missing.push(`${progress.accountNeeded - progress.accountDays} more day${progress.accountNeeded - progress.accountDays === 1 ? '' : 's'} on your account`);
                        }
                        return missing.length > 0 ? `Almost there — ${missing.join(' and ')}.` : 'Keep growing your presence to unlock the programme';
                      })()
                    : 'Keep growing your presence to unlock the programme'}
                </p>
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="space-y-3">
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wider">How it works</p>
            {[
              { n: '01', title: 'Get your link', desc: 'A unique ref link is generated for you' },
              { n: '02', title: 'Share it', desc: 'Post it on socials, WhatsApp, anywhere' },
              { n: '03', title: 'Someone signs up or buys', desc: 'We track it automatically' },
              { n: '04', title: 'You earn', desc: isListener ? '50 credits per signup, more on purchases' : '20% of the service fee on every purchase' },
            ].map(s => (
              <div key={s.n} className="flex items-start space-x-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <span className="text-xs font-black text-white/20 w-6 flex-shrink-0">{s.n}</span>
                <div>
                  <p className="text-sm font-semibold text-white">{s.title}</p>
                  <p className="text-xs text-white/40">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── Active affiliate ── */
        <div>
          {/* Ref link card */}
          <div className="mx-4 mt-4 p-4 rounded-2xl border border-purple-500/20"
            style={{ background: 'rgba(167,139,250,0.06)' }}>
            <p className="text-xs text-white/40 mb-2">Your referral link</p>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-black/40 rounded-xl px-3 py-2 text-xs text-white/60 truncate border border-white/[0.06]">
                {refLink}
              </div>
              <button onClick={handleCopy}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-purple-500/20 border border-purple-500/30 flex-shrink-0 transition active:scale-95">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-purple-400" />}
              </button>
              <button onClick={handleShare}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.08] flex-shrink-0 transition active:scale-95">
                <ExternalLink className="w-4 h-4 text-white/60" />
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex space-x-1 mx-4 mt-4 bg-white/[0.03] rounded-lg p-1">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center space-x-1 py-2 rounded-md text-xs font-medium transition ${
                  activeTab === key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="px-4 mt-4">
            {/* ── OVERVIEW ── */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {isListener ? (
                    <>
                      <StatCard icon={Star} label="Credits Balance" value={affiliate.credits_balance?.toLocaleString() || 0} color="text-yellow-400" />
                      <StatCard icon={TrendingUp} label="Lifetime Credits" value={affiliate.credits_lifetime?.toLocaleString() || 0} color="text-purple-400" />
                    </>
                  ) : (
                    <>
                      <StatCard icon={DollarSign} label="Pending Payout" value={`R${(affiliate.pending_zar || 0).toFixed(2)}`} color="text-green-400" />
                      <StatCard icon={TrendingUp} label="Total Earned" value={`R${(affiliate.total_earned_zar || 0).toFixed(2)}`} color="text-purple-400" />
                    </>
                  )}
                  <StatCard icon={Users} label="Signups" value={affiliate.total_signups || 0} color="text-blue-400" />
                  <StatCard icon={BarChart2} label="Clicks" value={affiliate.total_clicks || 0} color="text-pink-400" />
                </div>

                {/* Conversion rate */}
                {affiliate.total_clicks > 0 && (
                  <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.06]">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-white/40">Conversion rate</span>
                      <span className="text-white font-bold">
                        {Math.round((affiliate.total_conversions / affiliate.total_clicks) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-purple-400"
                        style={{ width: `${Math.min(100, Math.round((affiliate.total_conversions / affiliate.total_clicks) * 100))}%` }} />
                    </div>
                    <p className="text-[10px] text-white/20 mt-1">{affiliate.total_conversions} conversions from {affiliate.total_clicks} clicks</p>
                  </div>
                )}
              </div>
            )}

            {/* ── CAMPAIGNS ── */}
            {activeTab === 'campaigns' && (
              <div className="space-y-3">
                <p className="text-xs text-white/40">Active campaigns from the Feelz team. Share these for bonus rewards.</p>
                {campaigns.length === 0 ? (
                  <div className="text-center py-10 text-white/20">
                    <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No active campaigns right now</p>
                    <p className="text-xs mt-1">Check back weekly for new briefs</p>
                  </div>
                ) : campaigns.map(c => (
                  <div key={c.id} className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.06] space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">{c.title}</p>
                        {c.artists?.artist_name && <p className="text-xs text-white/40">feat. {c.artists.artist_name}</p>}
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">
                        +{c.credits_reward} credits
                      </span>
                    </div>
                    {c.description && <p className="text-xs text-white/50">{c.description}</p>}
                    {c.ends_at && (
                      <p className="text-[10px] text-white/25 flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>Ends {new Date(c.ends_at).toLocaleDateString('en-ZA')}</span>
                      </p>
                    )}
                    <button onClick={() => {
                      const campaignLink = `${refLink}&campaign=${c.id}`;
                      if (navigator.share) navigator.share({ title: c.title, url: campaignLink });
                      else { navigator.clipboard.writeText(campaignLink); alert('Link copied!'); }
                    }} className="w-full py-2.5 rounded-xl text-xs font-semibold border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition">
                      Share Campaign Link
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── EARNINGS ── */}
            {activeTab === 'conversions' && (
              <div className="space-y-2">
                {conversions.length === 0 ? (
                  <div className="text-center py-10 text-white/20">
                    <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No earnings yet</p>
                    <p className="text-xs mt-1">Share your link to start earning</p>
                  </div>
                ) : conversions.map(c => (
                  <div key={c.id} className="flex items-center space-x-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      c.type === 'signup' ? 'bg-blue-500/20' : 'bg-green-500/20'
                    }`}>
                      {c.type === 'signup' ? <Users className="w-4 h-4 text-blue-400" /> : <DollarSign className="w-4 h-4 text-green-400" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-white capitalize">{c.type.replace('_', ' ')}</p>
                      <p className="text-[10px] text-white/30">{new Date(c.created_at).toLocaleDateString('en-ZA')}</p>
                    </div>
                    <div className="text-right">
                      {isListener
                        ? <p className="text-sm font-bold text-yellow-400">+{c.credits_earned} credits</p>
                        : <p className="text-sm font-bold text-green-400">+R{(c.commission_zar || 0).toFixed(2)}</p>}
                      <p className={`text-[10px] capitalize ${c.status === 'confirmed' ? 'text-green-400/60' : 'text-white/20'}`}>{c.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── PAYOUT ── */}
            {activeTab === 'payout' && (
              <div className="space-y-4">
                {isListener ? (
                  <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/[0.06] text-center space-y-3">
                    <Star className="w-10 h-10 text-yellow-400 mx-auto" />
                    <p className="text-base font-bold text-white">Credits Balance</p>
                    <p className="text-4xl font-black text-yellow-400">{affiliate.credits_balance || 0}</p>
                    <p className="text-xs text-white/30">Redeem for premium access, exclusive drops and more</p>
                    <div className="space-y-2">
                      <p className="text-xs text-white/30 font-semibold uppercase tracking-wider">Redeem For</p>
                      {[
                        { key: 'fan_pro_month', label: '1 Month Fan Pro Free', cost: 500, icon: '⭐' },
                        { key: 'social_shoutout', label: 'Shoutout on Feelz Socials', cost: 1000, icon: '📣' },
                        { key: 'founding_fan_badge', label: 'Founding Fan Badge', cost: 300, icon: '🏅' },
                      ].map(r => {
                        const pendingForThis = redemptions.find(red => red.reward_key === r.key && red.status === 'pending');
                        return (
                        <div key={r.key} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                          <div className="flex items-center space-x-2">
                            <span>{r.icon}</span>
                            <span className="text-sm text-white">{r.label}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-yellow-400">{r.cost} credits</span>
                            <button
                              onClick={() => redeemCredits(r)}
                              disabled={affiliate.credits_balance < r.cost || redeemingKey === r.key || !!pendingForThis}
                              className="px-3 py-1 rounded-lg text-xs font-bold transition disabled:opacity-30"
                              style={{ background: affiliate.credits_balance >= r.cost ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.04)', color: affiliate.credits_balance >= r.cost ? '#facc15' : 'rgba(255,255,255,0.2)', border: `1px solid ${affiliate.credits_balance >= r.cost ? 'rgba(234,179,8,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                              {pendingForThis ? 'Pending' : redeemingKey === r.key ? '...' : 'Redeem'}
                            </button>
                          </div>
                        </div>
                        );
                      })}
                      <p className="text-[10px] text-white/20 text-center pt-1">Redemptions are reviewed and applied manually within 24h</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.06] text-center">
                        <p className="text-2xl font-black text-green-400">R{(affiliate.pending_zar || 0).toFixed(2)}</p>
                        <p className="text-xs text-white/30 mt-1">Available</p>
                      </div>
                      <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.06] text-center">
                        <p className="text-2xl font-black text-white">R{(affiliate.paid_out_zar || 0).toFixed(2)}</p>
                        <p className="text-xs text-white/30 mt-1">Paid Out</p>
                      </div>
                    </div>

                    {affiliate.pending_zar >= 200 && (
                      <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.06] space-y-3">
                        <p className="text-sm font-semibold text-white">Request Payout</p>
                        <input type="number" value={payoutAmount}
                          onChange={e => setPayoutAmount(e.target.value)}
                          placeholder={`Amount (min R200, max R${affiliate.pending_zar.toFixed(2)})`}
                          max={affiliate.pending_zar}
                          className="w-full px-3 py-2.5 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/20 outline-none border border-white/[0.08] focus:border-white/20" />
                        <div className="flex items-center space-x-2 px-3 py-2 bg-white/[0.04] rounded-xl border border-white/[0.06]">
                          <span className="text-xs text-white/40">Payout via</span>
                          <span className="text-xs font-bold text-white">🌍 PayPal</span>
                        </div>
                        <button onClick={handlePayoutRequest} disabled={requestingPayout || !payoutAmount}
                          className="w-full py-3 rounded-xl text-sm font-bold transition active:scale-[0.98] disabled:opacity-40"
                          style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                          {requestingPayout ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : 'Request Payout'}
                        </button>
                        <p className="text-[10px] text-white/20 text-center">Processed within 3–5 business days</p>
                      </div>
                    )}

                    {affiliate.pending_zar < 200 && (
                      <div className="flex items-center space-x-2 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                        <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                        <p className="text-xs text-yellow-400">
                          Minimum payout is R200. You need R{(200 - affiliate.pending_zar).toFixed(2)} more.
                        </p>
                      </div>
                    )}

                    {/* Payout history */}
                    {payouts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-white/40 font-semibold uppercase tracking-wider">Payout History</p>
                        {payouts.map(p => (
                          <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                            <div>
                              <p className="text-sm text-white">R{p.amount_zar.toFixed(2)}</p>
                              <p className="text-[10px] text-white/30">{new Date(p.requested_at).toLocaleDateString('en-ZA')} · {p.method}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              p.status === 'paid' ? 'bg-green-500/15 text-green-400' :
                              p.status === 'rejected' ? 'bg-red-500/15 text-red-400' :
                              'bg-yellow-500/15 text-yellow-400'
                            }`}>{p.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RequirementRow({ label, current, needed }) {
  const met = current >= needed;
  const pct = Math.min(100, Math.round((current / needed) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {met
            ? <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            : <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 flex-shrink-0" />}
          <span className={`text-xs ${met ? 'text-white/60' : 'text-white/50'}`}>{label}</span>
        </div>
        <span className={`text-[10px] font-medium ${met ? 'text-green-400/70' : 'text-white/30'}`}>
          {current} / {needed}
        </span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${met ? 'bg-green-400' : 'bg-purple-400'}`}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}