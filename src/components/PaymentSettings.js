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
  const [payoutThreshold, setPayoutThreshold] = useState(10);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [hasProfile, setHasProfile] = useState(false);
  const [currentTier, setCurrentTier] = useState(null);
  const [recentPayouts, setRecentPayouts] = useState([]);

  useEffect(() => {
    if (artist) {
      fetchPaymentProfile();
      fetchCurrentTier();
      fetchRecentPayouts();
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
    const { data: sub } = await supabase
      .from('artist_tier_subscriptions')
      .select('*, platform_tiers(*)')
      .eq('artist_id', artist.id)
      .eq('status', 'active')
      .single();

    if (sub?.platform_tiers) {
      setCurrentTier(sub.platform_tiers);
    } else {
      // Default to free tier
      const { data: freeTier } = await supabase
        .from('platform_tiers')
        .select('*')
        .eq('slug', 'free')
        .single();
      setCurrentTier(freeTier);
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

  const handleSave = async () => {
    if (!paypalEmail.trim()) { setMsg('PayPal email is required'); return; }
    if (!paypalEmail.includes('@')) { setMsg('Enter a valid email address'); return; }

    setSaving(true);
    setMsg('');

    try {
      const payload = {
        artist_id: artist.id,
        paypal_email: paypalEmail.trim(),
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
          <p className="text-lg font-bold text-white">${(profile?.total_earnings || 0).toFixed(2)}</p>
          <p className="text-[10px] text-white/30">Total Earned</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
          <TrendingUp className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">${(profile?.pending_balance || 0).toFixed(2)}</p>
          <p className="text-[10px] text-white/30">Pending</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
          <Check className="w-4 h-4 text-blue-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">${(profile?.total_paid_out || 0).toFixed(2)}</p>
          <p className="text-[10px] text-white/30">Paid Out</p>
        </div>
      </div>

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
            This is where you'll receive payouts from collaborations and sales
          </p>
        </div>

        <div>
          <label className="block text-xs text-white/40 mb-1">PayPal Merchant ID (optional)</label>
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

        <div>
          <label className="block text-xs text-white/40 mb-1">Payout Threshold (minimum before auto-payout)</label>
          <div className="flex items-center space-x-2">
            <span className="text-white/40 text-sm">$</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={payoutThreshold}
              onChange={(e) => setPayoutThreshold(Number(e.target.value))}
              className="w-24 px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none"
            />
          </div>
        </div>
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
          <p>When you collaborate on a track, each artist sets their split percentage. When that track earns money (through sales or future monetization), PayPal handles the automatic distribution.</p>
          <p>Each collaborator must have a PayPal email linked to receive their share. Splits are logged transparently — every artist can see exactly what they earned and when.</p>
          <p className="text-white/25">Feelz Machine does not take a cut of artist earnings. Your yearly subscription is the only platform fee.</p>
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
                  <p className="text-sm text-white font-medium">${payout.amount?.toFixed(2)}</p>
                  <p className="text-[10px] text-white/30">
                    {new Date(payout.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {payout.split_percentage && ` · ${payout.split_percentage}% split`}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  payout.status === 'completed' ? 'bg-green-500/10 text-green-400'
                  : payout.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400'
                  : 'bg-red-500/10 text-red-400'
                }`}>
                  {payout.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
