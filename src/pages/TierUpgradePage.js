import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/useTier';
import {
  ArrowLeft, Check, X, Crown, Zap, Star, Loader, Shield, AlertCircle, Globe
} from 'lucide-react';

// ── PayPal config ─────────────────────────────────────────────
const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID || '';
const PLAN_IDS = {
  pro_monthly:     process.env.REACT_APP_PAYPAL_PRO_MONTHLY_PLAN_ID     || '',
  pro_annual:      process.env.REACT_APP_PAYPAL_PRO_ANNUAL_PLAN_ID      || '',
  premium_monthly: process.env.REACT_APP_PAYPAL_PREMIUM_MONTHLY_PLAN_ID || '',
  premium_annual:  process.env.REACT_APP_PAYPAL_PREMIUM_ANNUAL_PLAN_ID  || '',
};
const isConfigured = !!PAYPAL_CLIENT_ID && PAYPAL_CLIENT_ID !== 'YOUR_PAYPAL_CLIENT_ID_HERE';

// ── Base prices in USD ────────────────────────────────────────
const BASE_USD = {
  pro:     { monthly: 2.00,  annual: 17.00 },
  premium: { monthly: 5.00,  annual: 42.00 },
};

// ── Currency display map ──────────────────────────────────────
// Maps country code → { currency, symbol, locale }
const CURRENCY_MAP = {
  ZA: { currency: 'ZAR', symbol: 'R',   locale: 'en-ZA' },
  NG: { currency: 'NGN', symbol: '₦',   locale: 'en-NG' },
  GH: { currency: 'GHS', symbol: 'GH₵', locale: 'en-GH' },
  KE: { currency: 'KES', symbol: 'KSh', locale: 'en-KE' },
  GB: { currency: 'GBP', symbol: '£',   locale: 'en-GB' },
  EU: { currency: 'EUR', symbol: '€',   locale: 'en-EU' }, // fallback for EU
  DE: { currency: 'EUR', symbol: '€',   locale: 'de-DE' },
  FR: { currency: 'EUR', symbol: '€',   locale: 'fr-FR' },
  AU: { currency: 'AUD', symbol: 'A$',  locale: 'en-AU' },
  CA: { currency: 'CAD', symbol: 'C$',  locale: 'en-CA' },
  US: { currency: 'USD', symbol: '$',   locale: 'en-US' },
};
const DEFAULT_CURRENCY = { currency: 'USD', symbol: '$', locale: 'en-US' };

const BEATMAKER_TIER_FEATURES = {
  free: {
    name: 'Free',
    icon: Star,
    color: '#737373',
    features: [
      { text: 'Upload up to 3 beats', included: true },
      { text: 'Basic producer profile', included: true },
      { text: 'Free & Basic Lease licences only', included: true },
      { text: 'Beat discovery in For You feed', included: true },
      { text: 'Stem uploads', included: false },
      { text: 'Beat analytics', included: false },
      { text: 'Premium & Unlimited Lease', included: false },
      { text: 'Exclusive Licence tier', included: false },
      { text: 'Collaboration & splits', included: false },
      { text: 'Custom theme & branding', included: false },
    ],
  },
  pro: {
    name: 'Pro',
    icon: Zap,
    color: '#8B5CF6',
    popular: true,
    features: [
      { text: 'Upload up to 20 beats', included: true },
      { text: 'Full producer profile', included: true },
      { text: 'All licences except Exclusive', included: true },
      { text: 'Stem uploads', included: true },
      { text: 'Beat analytics dashboard', included: true },
      { text: 'Per-beat streams, plays & licence views', included: true },
      { text: 'Collaboration & revenue splits', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Competition entry', included: true },
      { text: 'Exclusive Licence tier', included: false },
      { text: 'Priority in beats feed', included: false },
    ],
  },
  premium: {
    name: 'Premium',
    icon: Crown,
    color: '#F59E0B',
    features: [
      { text: 'Unlimited beat uploads', included: true },
      { text: 'Full producer profile', included: true },
      { text: 'All 5 licence tiers including Exclusive', included: true },
      { text: 'Stem uploads', included: true },
      { text: 'Advanced beat analytics & CSV export', included: true },
      { text: 'Collaboration & revenue splits', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Priority placement in beats feed', included: true },
      { text: 'Featured beat placement', included: true },
      { text: 'Competition entry', included: true },
      { text: 'Merch store integration', included: true },
    ],
  },
};

const TIER_FEATURES = {
  free: {
    name: 'Free',
    icon: Star,
    color: '#737373',
    features: [
      { text: 'Upload up to 2 singles', included: true },
      { text: 'Basic artist profile', included: true },
      { text: 'Cover artwork on tracks', included: true },
      { text: 'Lyrics on tracks', included: false },
      { text: 'Custom theme & branding', included: false },
      { text: 'Chat rooms', included: false },
      { text: 'Analytics dashboard', included: false },
      { text: 'Collaboration & splits', included: false },
      { text: 'Competition entry', included: false },
      { text: 'Download sales', included: false },
    ],
  },
  pro: {
    name: 'Pro',
    icon: Zap,
    color: '#8B5CF6',
    popular: true,
    features: [
      { text: 'Unlimited uploads', included: true },
      { text: 'Full artist profile', included: true },
      { text: 'Lyrics on tracks', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Chat rooms (1 room)', included: true },
      { text: 'Analytics dashboard', included: true },
      { text: 'Collaboration & splits', included: true },
      { text: 'Competition entry', included: true },
      { text: 'Community posting (1/day)', included: true },
      { text: 'Pre-order releases', included: false },
      { text: 'Priority in browse/trending', included: false },
      { text: 'Download sales (2 tracks/month)', included: true },
      { text: 'YouTube video backdrop', included: false },
      { text: 'Live streaming', included: false },
    ],
  },
  premium: {
    name: 'Premium',
    icon: Crown,
    color: '#F59E0B',
    features: [
      { text: 'Unlimited uploads', included: true },
      { text: 'Full artist profile', included: true },
      { text: 'Lyrics on tracks', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Chat rooms (unlimited)', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Collaboration & splits', included: true },
      { text: 'Competition entry', included: true },
      { text: 'Priority in browse/trending', included: true },
      { text: 'Download sales', included: true },
      { text: 'Pre-order releases', included: true },
      { text: 'YouTube video backdrop', included: true },
      { text: 'Featured track placement', included: true },
      { text: 'Live streaming to followers', included: true },
      { text: 'Tip goals & fan fundraising', included: true },
      { text: 'Merch store (Printful integration)', included: true },
    ],
  },
};

// ── PayPal Button ─────────────────────────────────────────────
function PayPalButton({ planId, tierSlug, billingCycle, onSuccess, onError }) {
  const buttonRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.paypal) { setReady(true); return; }
    const existing = document.querySelector('script[src*="paypal.com/sdk"]');
    if (existing) { existing.addEventListener('load', () => setReady(true)); return; }
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`;
    script.async = true;
    script.onload = () => setReady(true);
    script.onerror = () => onError('Failed to load PayPal. Please try again.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || !buttonRef.current || !window.paypal || !planId) return;
    buttonRef.current.innerHTML = '';
    window.paypal.Buttons({
      style: { shape: 'pill', color: 'white', layout: 'vertical', label: 'subscribe' },
      createSubscription: (data, actions) => actions.subscription.create({ plan_id: planId }),
      onApprove: (data) => onSuccess({ subscriptionId: data.subscriptionID, tierSlug, billingCycle }),
      onError: (err) => { console.error('PayPal error:', err); onError('Payment failed. Please try again.'); },
      onCancel: () => {},
    }).render(buttonRef.current);
  }, [ready, planId]);

  if (!planId) {
    return (
      <div className="py-3 text-center text-xs text-yellow-400/60">
        PayPal plan not configured for this tier.
      </div>
    );
  }

  return <div ref={buttonRef} className="mt-3" />;
}

// ── Price display ─────────────────────────────────────────────
function PriceDisplay({ tier, billingCycle, geoRate, geoInfo }) {
  const baseUSD = BASE_USD[tier]?.[billingCycle];
  if (!baseUSD) return null;

  const converted = baseUSD * (geoRate || 1);
  const displayAmount = converted < 10
    ? converted.toFixed(2)
    : Math.round(converted).toLocaleString();

  const symbol = geoInfo?.symbol || '$';

  const annualSavingPct = billingCycle === 'annual'
    ? Math.round((1 - BASE_USD[tier].annual / (BASE_USD[tier].monthly * 12)) * 100)
    : null;

  return (
    <div className="flex items-baseline space-x-1">
      <span className="text-2xl font-bold text-white">
        {symbol}{displayAmount}
      </span>
      <span className="text-xs text-white/30">
        /{billingCycle === 'monthly' ? 'mo' : 'yr'}
      </span>
      {annualSavingPct && (
        <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-500/20 text-green-400">
          SAVE {annualSavingPct}%
        </span>
      )}
    </div>
  );
}

export default function TierUpgradePage() {
  const navigate = useNavigate();
  const { user, artist, refreshProfile, isBeatmaker } = useAuth();
  const [viewRole, setViewRole] = React.useState(isBeatmaker ? 'beatmaker' : 'artist');

  const [currentTier, setCurrentTier]   = useState(null);
  const [activeSubId, setActiveSubId]   = useState(null);
  const [loading, setLoading]           = useState(true);
  const [processing, setProcessing]     = useState(false);
  const [cancelling, setCancelling]     = useState(false);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState('');
  const [selectedTier, setSelectedTier] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly');

  // Geo state
  const [geoRate, setGeoRate]       = useState(1);
  const [geoInfo, setGeoInfo]       = useState(null);
  const [geoLoading, setGeoLoading] = useState(true);

  // ── Geo detection ─────────────────────────────────────────
  useEffect(() => {
    const detect = async () => {
      try {
        // 1. Detect country via IP
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) throw new Error('Geo detection failed');
        const data = await res.json();
        const countryCode = data.country_code;
        const info = CURRENCY_MAP[countryCode] || DEFAULT_CURRENCY;

        if (info.currency !== 'USD') {
          // 2. Fetch live exchange rate
          try {
            const rateRes = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const rateData = await rateRes.json();
            const rate = rateData.rates?.[info.currency];
            if (rate && rate > 0) {
              setGeoRate(rate);
              setGeoInfo(info); // only set local currency if we have a valid rate
            } else {
              setGeoInfo(DEFAULT_CURRENCY); // rate unavailable, show USD
            }
          } catch {
            setGeoInfo(DEFAULT_CURRENCY); // exchange rate API down, show USD
          }
        } else {
          setGeoInfo(info); // already USD
        }
      } catch {
        setGeoInfo(DEFAULT_CURRENCY); // geo detection failed, show USD
      }
      setGeoLoading(false);
    };
    detect();
  }, []);

  useEffect(() => {
    if (artist) fetchCurrentTier();
  }, [artist]);

  useEffect(() => {
    if (!artist) return;
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') await fetchCurrentTier();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [artist]);

  const fetchCurrentTier = async () => {
    try {
      const { data: sub } = await supabase
        .from('artist_tier_subscriptions')
        .select('tier_id, paypal_subscription_id, billing_cycle')
        .eq('artist_id', artist.id)
        .eq('status', 'active')
        .maybeSingle();

      if (sub?.tier_id) {
        setActiveSubId(sub.paypal_subscription_id || null);
        const { data: tierRow } = await supabase
          .from('platform_tiers').select('slug').eq('id', sub.tier_id).maybeSingle();
        if (tierRow) { setCurrentTier(tierRow.slug); setLoading(false); return; }
      }
      setActiveSubId(null);
      const { data: artistRow } = await supabase
        .from('artists').select('tier').eq('id', artist.id).maybeSingle();
      setCurrentTier(artistRow?.tier || 'free');
    } catch {
      setCurrentTier('free');
    }
    setLoading(false);
  };

  const handleSubscriptionSuccess = async ({ subscriptionId, tierSlug, billingCycle: cycle }) => {
    setProcessing(true);
    setError('');
    try {
      const { data: tier } = await supabase
        .from('platform_tiers').select('id').eq('slug', tierSlug).single();
      if (!tier) throw new Error('Tier not found');

      await supabase
        .from('artist_tier_subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('artist_id', artist.id).eq('status', 'active');

      const expiresAt = cycle === 'annual'
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { error: insertErr } = await supabase
        .from('artist_tier_subscriptions')
        .insert({
          artist_id: artist.id,
          tier_id: tier.id,
          status: 'active',
          paypal_subscription_id: subscriptionId,
          billing_cycle: cycle || 'monthly',
          payment_provider: 'paypal_web',
          started_at: new Date().toISOString(),
          expires_at: expiresAt,
        });
      if (insertErr) throw insertErr;

      await supabase.from('artists')
        .update({ current_tier_id: tier.id, tier: tierSlug, updated_at: new Date().toISOString() })
        .eq('id', artist.id);

      setCurrentTier(tierSlug);
      setSuccess(`Welcome to ${tierSlug === 'pro' ? 'Pro' : 'Premium'}! Your new features are active.`);
      setSelectedTier(null);
      refreshProfile();

      // Affiliate conversion — non-fatal
      try {
        const ref = sessionStorage.getItem('feelz_ref');
        if (ref) {
          await fetch('/.netlify/functions/affiliate-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'convert', refCode: ref, userId: user.id, conversionType: 'artist_subscription' }),
          });
          sessionStorage.removeItem('feelz_ref');
        }
      } catch {}
    } catch (err) {
      setError('Failed to activate subscription: ' + err.message);
    }
    setProcessing(false);
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel your subscription? You will return to the Free plan.')) return;
    setCancelling(true);
    setError('');
    try {
      await supabase
        .from('artist_tier_subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('artist_id', artist.id).eq('status', 'active');

      await supabase.from('artists')
        .update({ tier: 'free', current_tier_id: null, updated_at: new Date().toISOString() })
        .eq('id', artist.id);

      setCurrentTier('free');
      setActiveSubId(null);
      setSuccess('Subscription cancelled. You are now on the Free plan.');
      refreshProfile();
    } catch (err) {
      setError('Failed to cancel subscription: ' + err.message);
    }
    setCancelling(false);
  };

  if (!user || !artist) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <Shield className="w-12 h-12 text-white/10 mb-4" />
        <p className="text-white/40 text-sm mb-4">Sign in as an artist to manage your plan</p>
        <button onClick={() => navigate('/login')} className="px-6 py-2.5 bg-white text-black rounded-lg text-sm font-medium">
          Sign In
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    // No min-h-screen or background: this renders inside AppLayout, which
    // provides the shell, the sidebar and the player. It was previously
    // routed outside the layout, so choosing a plan meant losing the nav.
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center p-5">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white ml-4">Choose Your Plan</h1>
        {!geoLoading && geoInfo && (
          <div className="ml-auto flex items-center space-x-1.5 text-xs text-white/30">
            <Globe className="w-3 h-3" />
            <span>{geoInfo.currency}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-6 mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="mx-6 mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-sm text-green-400">{success}</p>
        </div>
      )}

      {/* Current plan + billing toggle */}
      <div className="px-6 mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/[0.06]">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-xs text-white/60">
              Current plan: <span className="font-semibold text-white capitalize">{currentTier}</span>
            </span>
          </div>
          {currentTier !== 'free' && (
            <button onClick={handleCancel} disabled={cancelling}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40">
              {cancelling && <Loader className="w-3 h-3 animate-spin" />}
              <span>{cancelling ? 'Cancelling...' : 'Cancel subscription'}</span>
            </button>
          )}
        </div>

        {/* Role toggle — Artist / Beat Maker */}
        <div className="flex items-center bg-white/[0.04] rounded-xl p-1 space-x-1 mb-3">
          {[
            { key: 'artist',    label: '🎤 Artist' },
            { key: 'beatmaker', label: '🎛️ Beat Maker' },
          ].map(r => (
            <button key={r.key}
              onClick={() => { setViewRole(r.key); setSelectedTier(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                viewRole === r.key ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'
              }`}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Billing cycle toggle */}
        <div className="flex items-center bg-white/[0.04] rounded-xl p-1 space-x-1">
          {['monthly', 'annual'].map(cycle => (
            <button key={cycle}
              onClick={() => { setBillingCycle(cycle); setSelectedTier(null); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                billingCycle === cycle
                  ? 'bg-white text-black'
                  : 'text-white/40 hover:text-white/70'
              }`}>
              {cycle === 'monthly' ? 'Monthly' : 'Annual'}
              {cycle === 'annual' && (
                <span className="ml-1.5 text-[10px] font-bold text-green-400">SAVE 30%</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tier cards */}
      <div className="px-6 space-y-4">
        {Object.entries(viewRole === 'beatmaker' ? BEATMAKER_TIER_FEATURES : TIER_FEATURES).map(([slug, tier]) => {
          const isCurrent = currentTier === slug;
          const isDowngrade = (currentTier === 'premium' && slug !== 'premium') ||
                              (currentTier === 'pro' && slug === 'free');
          const Icon = tier.icon;
          const planKey = `${slug}_${billingCycle}`;
          const planId = PLAN_IDS[planKey];

          return (
            <div key={slug}
              className={`relative rounded-2xl border overflow-hidden transition-all ${
                isCurrent
                  ? 'border-white/20 bg-white/[0.04]'
                  : selectedTier === slug
                    ? 'bg-white/[0.03]'
                    : 'border-white/[0.06] bg-white/[0.02]'
              }`}
              style={selectedTier === slug ? { borderColor: `${tier.color}40` } : {}}>

              {tier.popular && (
                <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[10px] font-bold"
                  style={{ backgroundColor: tier.color, color: '#000' }}>
                  MOST POPULAR
                </div>
              )}

              <div className="p-5">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${tier.color}20` }}>
                    <Icon className="w-5 h-5" style={{ color: tier.color }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                    {slug === 'free' ? (
                      <span className="text-xl font-bold text-white/40">Free</span>
                    ) : geoLoading ? (
                      <div className="h-5 w-16 bg-white/[0.06] rounded animate-pulse" />
                    ) : (
                      <PriceDisplay tier={slug} billingCycle={billingCycle} geoRate={geoRate} geoInfo={geoInfo} />
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {tier.features.map((feature, i) => (
                    <div key={i} className="flex items-center space-x-2.5">
                      {feature.included
                        ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: tier.color }} />
                        : <X className="w-4 h-4 text-white/15 flex-shrink-0" />}
                      <span className={`text-sm ${feature.included ? 'text-white/70' : 'text-white/25'}`}>
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div className="py-2.5 text-center text-sm font-medium text-white/40 bg-white/[0.04] rounded-lg">
                    Current Plan
                  </div>
                ) : slug === 'free' ? (
                  currentTier !== 'free' ? (
                    <p className="text-xs text-white/20 text-center py-2">Use "Cancel subscription" above to return to Free</p>
                  ) : null
                ) : isDowngrade ? (
                  <p className="text-xs text-white/20 text-center py-2">You're on a higher plan</p>
                ) : selectedTier === slug ? (
                  <div>
                    {processing ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader className="w-5 h-5 animate-spin text-white/30" />
                        <span className="ml-2 text-sm text-white/40">Activating...</span>
                      </div>
                    ) : isConfigured ? (
                      <PayPalButton
                        planId={planId}
                        tierSlug={slug}
                        billingCycle={billingCycle}
                        onSuccess={handleSubscriptionSuccess}
                        onError={(msg) => setError(msg)}
                      />
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-white/30 text-center">PayPal not configured — test mode:</p>
                        <button
                          onClick={() => handleSubscriptionSuccess({ subscriptionId: `test_${Date.now()}`, tierSlug: slug, billingCycle })}
                          className="w-full py-2.5 rounded-lg text-sm font-medium transition"
                          style={{ backgroundColor: `${tier.color}20`, color: tier.color }}>
                          Activate {tier.name} (Test)
                        </button>
                      </div>
                    )}
                    <button onClick={() => setSelectedTier(null)}
                      className="w-full mt-2 py-2 text-xs text-white/30 hover:text-white/50 transition">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setSelectedTier(slug); setError(''); }}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold transition active:scale-[0.98]"
                    style={{ backgroundColor: tier.color, color: '#000' }}>
                    Upgrade to {tier.name}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-6 mt-6">
        <p className="text-[11px] text-white/20 text-center leading-relaxed">
          Subscriptions via PayPal. Monthly plans renew each month, annual plans renew yearly.
          Cancel anytime. Prices shown in {geoInfo?.currency || 'USD'} for display — charged in USD equivalent.
          By subscribing you agree to our Terms of Use.
        </p>
      </div>
    </div>
  );
}