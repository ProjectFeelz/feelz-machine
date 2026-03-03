import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import PAYPAL_CONFIG, { getPayPalScriptUrl } from '../paypalConfig';
import {
  ArrowLeft, Check, X, Crown, Zap, Star, Loader, Shield, AlertCircle
} from 'lucide-react';

const TIER_FEATURES = {
  free: {
    name: 'Free',
    price: '$0',
    period: 'forever',
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
      { text: 'Priority in browse/trending', included: false },
      { text: 'Download sales', included: false },
    ],
  },
  pro: {
    name: 'Pro',
    price: '$20',
    period: '/year',
    icon: Zap,
    color: '#8B5CF6',
    popular: true,
    features: [
      { text: 'Unlimited uploads', included: true },
      { text: 'Full artist profile', included: true },
      { text: 'Cover artwork on tracks', included: true },
      { text: 'Lyrics on tracks', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Chat rooms (1 room)', included: true },
      { text: 'Analytics dashboard', included: true },
      { text: 'Collaboration & splits', included: true },
      { text: 'Priority in browse/trending', included: false },
      { text: 'Download sales', included: false },
    ],
  },
  premium: {
    name: 'Premium',
    price: '$50',
    period: '/year',
    icon: Crown,
    color: '#F59E0B',
    features: [
      { text: 'Unlimited uploads', included: true },
      { text: 'Full artist profile', included: true },
      { text: 'Cover artwork on tracks', included: true },
      { text: 'Lyrics on tracks', included: true },
      { text: 'Custom theme & branding', included: true },
      { text: 'Chat rooms (unlimited)', included: true },
      { text: 'Advanced analytics', included: true },
      { text: 'Collaboration & splits', included: true },
      { text: 'Priority in browse/trending', included: true },
      { text: 'Download sales', included: true },
    ],
  },
};

function PayPalButton({ planId, tierSlug, onSuccess, onError }) {
  const buttonRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check if PayPal SDK is loaded
    if (window.paypal) {
      setReady(true);
      return;
    }

    // Load PayPal SDK
    const script = document.createElement('script');
    script.src = getPayPalScriptUrl();
    script.async = true;
    script.onload = () => setReady(true);
    script.onerror = () => onError('Failed to load PayPal. Please try again.');
    document.head.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  useEffect(() => {
    if (!ready || !buttonRef.current || !window.paypal) return;

    // Clear any existing buttons
    buttonRef.current.innerHTML = '';

    window.paypal.Buttons({
      style: {
        shape: 'pill',
        color: 'white',
        layout: 'vertical',
        label: 'subscribe',
      },
      createSubscription: (data, actions) => {
        return actions.subscription.create({
          plan_id: planId,
        });
      },
      onApprove: (data) => {
        onSuccess({
          subscriptionId: data.subscriptionID,
          orderId: data.orderID,
          tierSlug,
        });
      },
      onError: (err) => {
        console.error('PayPal error:', err);
        onError('Payment failed. Please try again.');
      },
      onCancel: () => {
        // User cancelled - no action needed
      },
    }).render(buttonRef.current);
  }, [ready, planId]);

  return <div ref={buttonRef} className="mt-3" />;
}

export default function TierUpgradePage() {
  const navigate = useNavigate();
  const { user, artist, refreshProfile } = useAuth();
  const [currentTier, setCurrentTier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedTier, setSelectedTier] = useState(null);

  useEffect(() => {
    if (artist) fetchCurrentTier();
  }, [artist]);

  const fetchCurrentTier = async () => {
    try {
      // Check active subscription
      const { data: sub } = await supabase
        .from('artist_tier_subscriptions')
        .select('*, platform_tiers(*)')
        .eq('artist_id', artist.id)
        .eq('status', 'active')
        .single();

      if (sub?.platform_tiers) {
        setCurrentTier(sub.platform_tiers.slug);
      } else {
        setCurrentTier('free');
      }
    } catch {
      setCurrentTier('free');
    }
    setLoading(false);
  };

  const handleSubscriptionSuccess = async ({ subscriptionId, tierSlug }) => {
    setProcessing(true);
    setError('');
    try {
      // Get the tier record
      const { data: tier } = await supabase
        .from('platform_tiers')
        .select('id')
        .eq('slug', tierSlug)
        .single();

      if (!tier) throw new Error('Tier not found');

      // Deactivate any existing subscription
      await supabase
        .from('artist_tier_subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('artist_id', artist.id)
        .eq('status', 'active');

      // Create new subscription record
      const { error: insertErr } = await supabase
        .from('artist_tier_subscriptions')
        .insert({
          artist_id: artist.id,
          tier_id: tier.id,
          status: 'active',
          paypal_subscription_id: subscriptionId,
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });

      if (insertErr) throw insertErr;

      // Update artist's current tier
      await supabase
        .from('artists')
        .update({ current_tier_id: tier.id, updated_at: new Date().toISOString() })
        .eq('id', artist.id);

      setCurrentTier(tierSlug);
      setSuccess(`Welcome to ${tierSlug === 'pro' ? 'Pro' : 'Premium'}! Your new features are active now.`);
      setSelectedTier(null);
      refreshProfile();
    } catch (err) {
      setError('Failed to activate subscription: ' + err.message);
    }
    setProcessing(false);
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

  const isConfigured = PAYPAL_CONFIG.clientId !== 'YOUR_PAYPAL_CLIENT_ID_HERE';

  return (
    <div className="min-h-screen bg-black pb-32">
      {/* Header */}
      <div className="flex items-center p-5">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-lg font-bold text-white ml-4">Choose Your Plan</h1>
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

      {/* Not configured warning */}
      {!isConfigured && (
        <div className="mx-6 mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-sm text-yellow-400">
            PayPal is not configured yet. Add your PayPal Client ID and Plan IDs to <code className="text-yellow-300">paypalConfig.js</code> or set them as environment variables.
          </p>
        </div>
      )}

      {/* Current plan badge */}
      <div className="px-6 mb-6">
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white/[0.06]">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-white/60">
            Current plan: <span className="font-semibold text-white capitalize">{currentTier}</span>
          </span>
        </div>
      </div>

      {/* Tier cards */}
      <div className="px-6 space-y-4">
        {Object.entries(TIER_FEATURES).map(([slug, tier]) => {
          const isCurrent = currentTier === slug;
          const isDowngrade = (currentTier === 'premium' && slug !== 'premium') ||
                              (currentTier === 'pro' && slug === 'free');
          const Icon = tier.icon;

          return (
            <div key={slug}
              className={`relative rounded-2xl border overflow-hidden transition-all ${
                isCurrent
                  ? 'border-white/20 bg-white/[0.04]'
                  : selectedTier === slug
                    ? `bg-white/[0.03]`
                    : 'border-white/[0.06] bg-white/[0.02]'
              }`}
              style={selectedTier === slug ? { borderColor: `${tier.color}40` } : {}}
            >
              {/* Popular badge */}
              {tier.popular && (
                <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[10px] font-bold"
                  style={{ backgroundColor: tier.color, color: '#000' }}>
                  MOST POPULAR
                </div>
              )}

              <div className="p-5">
                {/* Tier header */}
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${tier.color}20` }}>
                    <Icon className="w-5 h-5" style={{ color: tier.color }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                    <div className="flex items-baseline space-x-1">
                      <span className="text-xl font-bold" style={{ color: tier.color }}>{tier.price}</span>
                      <span className="text-xs text-white/30">{tier.period}</span>
                    </div>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-2 mb-4">
                  {tier.features.map((feature, i) => (
                    <div key={i} className="flex items-center space-x-2.5">
                      {feature.included ? (
                        <Check className="w-4 h-4 flex-shrink-0" style={{ color: tier.color }} />
                      ) : (
                        <X className="w-4 h-4 text-white/15 flex-shrink-0" />
                      )}
                      <span className={`text-sm ${feature.included ? 'text-white/70' : 'text-white/25'}`}>
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Action area */}
                {isCurrent ? (
                  <div className="py-2.5 text-center text-sm font-medium text-white/40 bg-white/[0.04] rounded-lg">
                    Current Plan
                  </div>
                ) : slug === 'free' ? (
                  // Can't downgrade to free via button (need to cancel subscription)
                  currentTier !== 'free' ? (
                    <p className="text-xs text-white/20 text-center py-2">Cancel your subscription to return to Free</p>
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
                        planId={PAYPAL_CONFIG.planIds[slug]}
                        tierSlug={slug}
                        onSuccess={handleSubscriptionSuccess}
                        onError={(msg) => setError(msg)}
                      />
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-white/30 text-center">PayPal not configured — use manual activation for testing:</p>
                        <button
                          onClick={() => handleSubscriptionSuccess({ subscriptionId: `test_${Date.now()}`, tierSlug: slug })}
                          className="w-full py-2.5 rounded-lg text-sm font-medium transition"
                          style={{ backgroundColor: `${tier.color}20`, color: tier.color }}>
                          Activate {tier.name} (Test Mode)
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

      {/* Disclaimer */}
      <div className="px-6 mt-6">
        <p className="text-[11px] text-white/20 text-center leading-relaxed">
          Subscriptions renew yearly via PayPal. Cancel anytime from your PayPal account.
          Feelz Machine is a distribution platform — we do not handle copyright claims.
          By subscribing you agree to our Terms of Use.
        </p>
      </div>
    </div>
  );
}
