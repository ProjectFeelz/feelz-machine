import { Helmet } from 'react-helmet-async';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ChevronLeft, Check, Zap, Crown, Loader, Palette, BarChart3, Star } from 'lucide-react';

const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID || '';

// Listener-specific PayPal plan IDs — set these in Netlify env vars
// REACT_APP_PAYPAL_LISTENER_PRO_MONTHLY_PLAN_ID
// REACT_APP_PAYPAL_LISTENER_PRO_ANNUAL_PLAN_ID
const LISTENER_PLAN_IDS = {
  pro_monthly: process.env.REACT_APP_PAYPAL_LISTENER_PRO_MONTHLY_PLAN_ID || '',
  pro_annual:  process.env.REACT_APP_PAYPAL_LISTENER_PRO_ANNUAL_PLAN_ID  || '',
};

// Listener tier features
const TIERS = [
  {
    slug: 'free',
    label: 'Free',
    price_monthly: 0,
    price_annual: 0,
    icon: Star,
    color: '#737373',
    features: [
      { text: 'Full music streaming',          included: true },
      { text: 'Follow artists',                included: true },
      { text: 'Playlists & liked songs',       included: true },
      { text: 'Chat rooms & competitions',     included: true },
      { text: 'Listening stats',               included: true },
      { text: 'Custom app theme',              included: false },
      { text: 'Tip artists (special badge)',   included: false },
      { text: 'Early access to new features',  included: false },
    ],
  },
  {
    slug: 'pro',
    label: 'Fan Pro',
    price_monthly: 2.99,
    price_annual:  1.99,
    icon: Zap,
    color: '#8B5CF6',
    badge: 'Most Popular',
    features: [
      { text: 'Full music streaming',          included: true },
      { text: 'Follow artists',                included: true },
      { text: 'Playlists & liked songs',       included: true },
      { text: 'Chat rooms & competitions',     included: true },
      { text: 'Listening stats',               included: true },
      { text: '10 custom app themes',          included: true },
      { text: 'Fan badge on tips & comments',  included: true },
      { text: 'Early access to new features',  included: true },
    ],
  },
];

function PayPalSubscribeButton({ planId, tierSlug, billingCycle, onSuccess, onError }) {
  const buttonRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.paypal) { setReady(true); return; }
    const existing = document.querySelector('script[src*="paypal.com/sdk"]');
    if (existing) { existing.addEventListener('load', () => setReady(true)); return; }
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`;
    script.addEventListener('load', () => setReady(true));
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || !buttonRef.current || !window.paypal || !planId) return;
    buttonRef.current.innerHTML = '';
    window.paypal.Buttons({
      style: { shape: 'pill', color: 'white', layout: 'vertical', label: 'subscribe' },
      createSubscription: (data, actions) => actions.subscription.create({ plan_id: planId }),
      onApprove: (data) => onSuccess(data.subscriptionID, billingCycle),
      onError: onError,
    }).render(buttonRef.current);
  }, [ready, planId]); // eslint-disable-line

  if (!planId) return (
    <div className="py-3 text-center text-xs text-white/20">
      PayPal plan not configured — set REACT_APP_PAYPAL_LISTENER_PRO_{billingCycle.toUpperCase()}_PLAN_ID
    </div>
  );

  return <div ref={buttonRef} className="min-h-[45px]" />;
}

export default function ListenerUpgradePage() {
  const navigate  = useNavigate();
  const { user, listener, refreshProfile } = useAuth();
  const [cycle,       setCycle]       = useState('monthly');
  const [currentTier, setCurrentTier] = useState('free');
  const [processing,  setProcessing]  = useState(false);
  const [success,     setSuccess]     = useState('');
  const [error,       setError]       = useState('');

  useEffect(() => {
    if (!user) return;
    // Check if listener already has a pro subscription
    supabase.from('listener_tier_subscriptions')
      .select('status, tier_id, platform_tiers(slug)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.platform_tiers?.slug) setCurrentTier(data.platform_tiers.slug);
      });
  }, [user?.id]);

  const handleSuccess = async (subscriptionId, billingCycle) => {
    setProcessing(true); setError('');
    try {
      // Look up tier_id for 'pro'
      const { data: tier } = await supabase
        .from('platform_tiers').select('id').eq('slug', 'pro').maybeSingle();
      if (!tier) throw new Error('Tier not found');

      // Cancel any existing subscription
      await supabase.from('listener_tier_subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('user_id', user.id).eq('status', 'active');

      // Create new subscription
      const expiresAt = billingCycle === 'annual'
        ? new Date(Date.now() + 365 * 86400000).toISOString()
        : new Date(Date.now() +  30 * 86400000).toISOString();

      await supabase.from('listener_tier_subscriptions').insert({
        user_id:               user.id,
        tier_id:               tier.id,
        status:                'active',
        paypal_subscription_id: subscriptionId,
        billing_cycle:         billingCycle,
        started_at:            new Date().toISOString(),
        expires_at:            expiresAt,
      });

      // Mirror tier onto listeners table for easy reads
      await supabase.from('listeners')
        .update({ tier: 'pro', updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      setCurrentTier('pro');
      setSuccess('Welcome to Fan Pro! Your themes and badge are now active.');
      await refreshProfile();
    } catch (err) {
      setError('Failed to activate: ' + err.message);
    }
    setProcessing(false);
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel Fan Pro? You will return to Free.')) return;
    await supabase.from('listener_tier_subscriptions')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'user_cancelled' })
      .eq('user_id', user.id).eq('status', 'active');
    await supabase.from('listeners')
      .update({ tier: 'free', updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    setCurrentTier('free');
    await refreshProfile();
  };

  return (
    <div className="pb-32 px-4 max-w-lg mx-auto">
      <Helmet><title>Fan Pro · Feelz Machine</title><link rel="icon" href="/favicon.ico" /><link rel="apple-touch-icon" href="/logo192.png" /></Helmet>

      <div className="flex items-center space-x-3 mb-6 sticky top-0 z-20 bg-black/95 backdrop-blur-xl pt-14 md:pt-4 pb-3 -mx-4 px-4 border-b border-white/[0.04]">
        <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Fan Pro</h1>
          <p className="text-xs text-white/30">Support the platform, unlock your vibe</p>
        </div>
      </div>

      {success && (
        <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-green-400">{success}</div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
      )}

      {/* Billing toggle */}
      <div className="flex items-center space-x-2 bg-white/[0.04] rounded-xl p-1 mb-6">
        {['monthly', 'annual'].map(c => (
          <button key={c} onClick={() => setCycle(c)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              cycle === c ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
            }`}>
            {c === 'monthly' ? 'Monthly' : 'Annual'}
            {c === 'annual' && <span className="ml-1.5 text-[10px] text-green-400 font-bold">Save 33%</span>}
          </button>
        ))}
      </div>

      {/* Tier cards */}
      <div className="space-y-4 mb-6">
        {TIERS.map(tier => {
          const Icon    = tier.icon;
          const price   = cycle === 'annual' ? tier.price_annual : tier.price_monthly;
          const isCurrent = currentTier === tier.slug;
          return (
            <div key={tier.slug}
              className={`rounded-2xl border p-5 relative ${
                tier.slug === 'pro'
                  ? 'border-purple-500/30 bg-purple-500/5'
                  : 'border-white/[0.08] bg-white/[0.02]'
              }`}>
              {tier.badge && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold bg-purple-500 text-white whitespace-nowrap">
                  {tier.badge}
                </div>
              )}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: tier.color + '20' }}>
                    <Icon className="w-4 h-4" style={{ color: tier.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{tier.label}</p>
                    {isCurrent && <p className="text-[10px] text-green-400">Current plan</p>}
                  </div>
                </div>
                <div className="text-right">
                  {price === 0 ? (
                    <p className="text-lg font-black text-white">Free</p>
                  ) : (
                    <>
                      <p className="text-lg font-black text-white">${price.toFixed(2)}<span className="text-xs text-white/30 font-normal">/mo</span></p>
                      {cycle === 'annual' && <p className="text-[10px] text-white/30">billed annually</p>}
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-2 mb-4">
                {tier.features.map(f => (
                  <div key={f.text} className="flex items-center space-x-2.5">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                      f.included ? 'bg-green-500/20' : 'bg-white/[0.04]'
                    }`}>
                      {f.included
                        ? <Check className="w-2.5 h-2.5 text-green-400" strokeWidth={3} />
                        : <span className="w-1.5 h-0.5 bg-white/15 rounded-full block" />}
                    </div>
                    <p className={`text-xs ${f.included ? 'text-white/70' : 'text-white/25'}`}>{f.text}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {tier.slug === 'pro' && !isCurrent && (
                <PayPalSubscribeButton
                  planId={LISTENER_PLAN_IDS[`pro_${cycle}`]}
                  tierSlug="pro"
                  billingCycle={cycle}
                  onSuccess={handleSuccess}
                  onError={() => setError('Payment failed — please try again')}
                />
              )}
              {tier.slug === 'pro' && isCurrent && (
                <button onClick={handleCancel}
                  className="w-full py-2.5 rounded-xl text-xs text-white/30 border border-white/[0.08] hover:bg-white/[0.04] transition">
                  Cancel subscription
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* What Pro enables */}
      <div className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.05] space-y-3">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Fan Pro unlocks</p>
        <div className="flex items-start space-x-3">
          <Palette className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-white font-medium">App Themes</p>
            <p className="text-xs text-white/30 mt-0.5">Change the entire app's colour scheme — Midnight, Ember, Ocean, Rose and more. Your vibe, your app.</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <BarChart3 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-white font-medium">Listening Stats</p>
            <p className="text-xs text-white/30 mt-0.5">Deep dive into your listening history — top artists, genres, weekly comparisons. Know your taste.</p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <Crown className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-white font-medium">Fan Badge</p>
            <p className="text-xs text-white/30 mt-0.5">A Pro badge appears next to your tips and comments — artists see you're a genuine supporter of the platform.</p>
          </div>
        </div>
      </div>

      {processing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white/[0.08] rounded-2xl p-6 flex flex-col items-center space-y-3">
            <Loader className="w-8 h-8 animate-spin text-white" />
            <p className="text-sm text-white/70">Activating Fan Pro…</p>
          </div>
        </div>
      )}
    </div>
  );
}