import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  DollarSign, Save, Loader, ExternalLink, AlertCircle,
  Check, TrendingUp, Crown, Zap, Star, ChevronRight
} from 'lucide-react';

export default function PaymentSettings() {
  const navigate = useNavigate();
  const { artist } = useAuth();
  const [profile, setProfile] = useState(null);
  const [paypalEmail, setPaypalEmail] = useState('');
  const [paypalMerchantId, setPaypalMerchantId] = useState('');
  const [payoutThreshold,  setPayoutThreshold]  = useState(10);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [hasProfile, setHasProfile] = useState(false);
  const [currentTier, setCurrentTier] = useState(null);
  const [recentPayouts, setRecentPayouts] = useState([]);
  const [earnings, setEarnings] = useState(null);

  useEffect(() => {
    if (artist) {
      fetchPaymentProfile();
      fetchCurrentTier();
      fetchRecentPayouts();
      fetchEarnings();
    }
  }, [artist]);

  const fetchPaymentProfile = async () => {
    const { data } = await supabase
      .from('artist_payment_profiles')
      .select('*')
      .eq('artist_id', artist.id)
      .single();

    if (data) {
      setProfile(data);
      setPaypalEmail(data.paypal_email || '');
      setPaypalMerchantId(data.paypal_merchant_id || '');
      setPayoutThreshold(data.payout_threshold || 10);
      setHasProfile(true);
    }
  };

  const fetchCurrentTier = async () => {
    try {
      const { data: sub } = await supabase
        .from('artist_tier_subscriptions')
        .select('tier_id')
        .eq('artist_id', artist.id)
        .eq('status', 'active')
        .maybeSingle();
      if (sub?.tier_id) {
        const { data: tierRow } = await supabase
          .from('platform_tiers')
          .select('*')
          .eq('id', sub.tier_id)
          .maybeSingle();
        if (tierRow) { setCurrentTier(tierRow); return; }
      }
      // Fallback to artist.tier
      const { data: artistRow } = await supabase
        .from('artists').select('tier').eq('id', artist.id).maybeSingle();
      const slug = artistRow?.tier || 'free';
      const { data: tierRow } = await supabase
        .from('platform_tiers').select('*').eq('slug', slug).maybeSingle();
      setCurrentTier(tierRow || { slug: 'free', name: 'Free' });
    } catch {
      setCurrentTier({ slug: 'free', name: 'Free' });
    }
  };

  const fetchRecentPayouts = async () => {
    const { data } = await supabase
      .from('payouts')
      .select('*')
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setRecentPayouts(data || []);
  };

  // Real totals from sales, tips, retail and collaborator shares
  // (migration 155). The old counters on the payment profile stopped moving
  // when sales started going straight to the artist's PayPal.
  const fetchEarnings = async () => {
    const { data, error } = await supabase.rpc('artist_earnings_summary', { p_artist_id: artist.id });
    if (!error && data) setEarnings(data);
  };

  const handleSave = async () => {
    if (!paypalEmail.trim()) { setMsg('PayPal email is required'); return; }
    if (!paypalEmail.includes('@')) { setMsg('Enter a valid email address'); return; }

    setSaving(true);
    setMsg('');

    try {
      const payload = {
        artist_id: artist.id,
        paypal_email:   paypalEmail.trim(),
        paypal_merchant_id: paypalMerchantId.trim() || null,
        payout_threshold: payoutThreshold,
        updated_at: new Date().toISOString(),
      };

      if (hasProfile) {
        const { error } = await supabase
          .from('artist_payment_profiles')
          .update(payload)
          .eq('artist_id', artist.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('artist_payment_profiles')
          .insert(payload);
        if (error) throw error;
        setHasProfile(true);
      }

      // Write the SAME address to artists.paypal_email too.
      //
      // There are two tables holding a payout email and two screens writing
      // them: this one saves artist_payment_profiles, Profile > Edit saves
      // artists. Which screen an artist happened to use decided whether the
      // payout function could find them, and this is the screen that
      // promises "This is where you'll receive payouts", so it was the worst
      // one to be ignored.
      //
      // process-split-payout now prefers this table and falls back to the
      // other, so writing both means the two can never disagree again
      // whichever screen someone edits.
      const { error: mirrorErr } = await supabase
        .from('artists')
        .update({ paypal_email: paypalEmail.trim() })
        .eq('id', artist.id);
      if (mirrorErr) {
        // Not fatal, the payout function reads this table first. Worth
        // knowing about, not worth failing a save the artist just made.
        console.error('[payments] could not mirror payout email to artists:', mirrorErr.message);
      }

      setMsg('Payment settings saved!');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
    setSaving(false);
  };

  const tierIcon = currentTier?.slug === 'premium' ? Crown
    : currentTier?.slug === 'pro' ? Zap : Star;
  const tierColor = currentTier?.slug === 'premium' ? '#F59E0B'
    : currentTier?.slug === 'pro' ? '#8B5CF6' : '#737373';
  const TierIcon = tierIcon;

  if (!artist) return null;

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {msg}
        </div>
      )}

      {/* Current tier card */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${tierColor}20` }}>
              <TierIcon className="w-5 h-5" style={{ color: tierColor }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white capitalize">{currentTier?.name || 'Free'} Plan</p>
              <p className="text-xs text-white/30">
                {currentTier?.slug === 'free'
                  ? '2 singles, basic features'
                  : currentTier?.slug === 'pro'
                    ? 'Unlimited uploads, analytics, collabs'
                    : 'Everything + priority + sales'}
              </p>
            </div>
          </div>
          <button onClick={() => navigate('/upgrade')}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition"
            style={{ backgroundColor: `${tierColor}15`, color: tierColor }}>
            <span>{currentTier?.slug === 'premium' ? 'Manage' : 'Upgrade'}</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Earnings overview */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
          <DollarSign className="w-4 h-4 text-green-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-green-400">${Number(earnings?.earned ?? 0).toFixed(2)}</p>
          <p className="text-[10px] text-white/30">Total Earned</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
          <TrendingUp className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">${Number(earnings?.owed ?? 0).toFixed(2)}</p>
          <p className="text-[10px] text-white/30">Owed to You</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
          <Check className="w-4 h-4 text-blue-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">${Number(earnings?.you_owe ?? 0).toFixed(2)}</p>
          <p className="text-[10px] text-white/30">You Owe Collabs</p>
        </div>
      </div>
      {earnings && (
        <p className="text-[11px] text-white/30 -mt-2 text-center">
          Sales ${Number(earnings.sales).toFixed(2)} · Tips ${Number(earnings.tips).toFixed(2)}{Number(earnings.retail) > 0 ? ` · Retail $${Number(earnings.retail).toFixed(2)}` : ''}
        </p>
      )}

      {/* PayPal settings */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-white/50">PayPal Settings</h4>

        <div>
          <label className="block text-xs text-white/40 mb-1">PayPal Email *</label>
          <input
            type="email"
            value={paypalEmail}
            onChange={(e) => setPaypalEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none placeholder-white/20"
          />
          <p className="text-[10px] text-white/20 mt-1">
            Buyers pay this PayPal directly when they buy your music
          </p>
        </div>

        <div>
          <label className="block text-xs text-white/40 mb-1 mt-3">PayPal Merchant ID (optional)</label>
          <input
            type="text"
            value={paypalMerchantId}
            onChange={(e) => setPaypalMerchantId(e.target.value)}
            placeholder="Your PayPal merchant ID"
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none placeholder-white/20"
          />
          <p className="text-[10px] text-white/20 mt-1">
            Find this in PayPal → Settings → Business Info → Merchant ID
          </p>
        </div>

        {/* The payout threshold is gone. Sales are paid straight into your
            PayPal at the moment of sale, so there is nothing for Feelz
            Machine to hold and no minimum to wait for. */}
      </div>

      {/* Save button */}
      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 bg-white text-black rounded-lg font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-50 transition">
        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        <span>{saving ? 'Saving...' : 'Save Payment Settings'}</span>
      </button>

      {/* How splits work */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
        <h4 className="text-sm font-semibold text-white mb-2">How Royalty Splits Work</h4>
        <div className="space-y-2 text-xs text-white/40 leading-relaxed">
          <p>Every sale is paid straight into the PayPal email above, the moment the buyer pays. Feelz Machine never holds your money, so there is no payout to wait for. Without a PayPal email your music can't be bought.</p>
          <p>On a track with collaborators, the buyer pays the track owner. Feelz Machine records each collaborator's agreed share of every sale and tells both of you what it comes to. The owner then pays their collaborators directly.</p>
          <p className="text-white/25">Feelz Machine does not take a cut of artist earnings. Your yearly subscription is the only platform fee. PayPal's own fee comes off each sale.</p>
        </div>
      </div>

      {/* Recent payouts */}
      {recentPayouts.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-white/50 mb-3">Recent Payouts</h4>
          <div className="space-y-2">
            {recentPayouts.map(payout => (
              <div key={payout.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <div>
                  <p className="text-sm text-white font-medium">${Number(payout.amount || 0).toFixed(2)}</p>
                  <p className="text-[10px] text-white/30">
                    {new Date(payout.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {payout.split_percentage && ` · ${payout.split_percentage}% split`}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  ['paid', 'completed'].includes(payout.status) ? 'bg-green-500/10 text-green-400'
                  : ['pending', 'processing'].includes(payout.status) ? 'bg-yellow-500/10 text-yellow-400'
                  : 'bg-red-500/10 text-red-400'
                }`}>
                  {String(payout.status || '').replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}