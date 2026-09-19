import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useGoBack from '../hooks/useGoBack';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Check, X, Zap, Crown, Star, Mail, Lock,
  Eye, EyeOff, Loader, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Pricing data (mirrors TierUpgradePage) ────────────────────────────────────
const BASE_USD = {
  pro:     { monthly: 2.00,  annual: 17.00  },
  premium: { monthly: 5.00,  annual: 42.00  },
  // fan_pro was missing entirely while LISTENER_TIERS already offered it, so
  // getPrice did BASE_USD['fan_pro'][billingCycle] on undefined and threw.
  // Choosing Listener — the role deliberately listed first — crashed the
  // pricing block outright.
  //
  // $2.99/mo and $1.99/mo-billed-annually, mirroring ListenerUpgradePage.
  // `annual` here is the yearly TOTAL (as it is for pro and premium), so
  // 1.99 x 12 = 23.88, which savingPct reports as the same 33% that page
  // advertises.
  fan_pro: { monthly: 2.99,  annual: 23.88  },
};

// Returns null for a genuinely free tier and undefined when the tier has no
// price on file. The two are different and the caller must not conflate them:
// rendering an unpriced paid tier as "Free" is worse than showing nothing.
function getPrice(tierKey, billingCycle, rate) {
  if (tierKey === 'free') return null;
  const row = BASE_USD[tierKey];
  if (!row) return undefined;
  return Math.round(row[billingCycle] * rate);
}

function savingPct(tierKey) {
  const row = BASE_USD[tierKey];
  if (!row) return null;
  return Math.round((1 - row.annual / (row.monthly * 12)) * 100);
}

const CURRENCY_MAP = {
  ZA: { symbol: 'R',   rate: 18.5 },
  NG: { symbol: '₦',   rate: 1600 },
  GH: { symbol: 'GH₵', rate: 15   },
  KE: { symbol: 'KSh', rate: 130  },
  GB: { symbol: '£',   rate: 0.79 },
  AU: { symbol: 'A$',  rate: 1.53 },
  CA: { symbol: 'C$',  rate: 1.36 },
  US: { symbol: '$',   rate: 1    },
};

const TIERS = [
  {
    key: 'free', name: 'Free', icon: Star, color: '#737373', price: null,
    features: [
      { text: 'Upload up to 2 singles', included: true },
      { text: 'Basic artist profile',   included: true },
      { text: 'Cover artwork on tracks', included: true },
      { text: 'Lyrics on tracks',        included: false },
      { text: 'Custom theme & branding', included: false },
      { text: 'Chat rooms',              included: false },
      { text: 'Analytics dashboard',     included: false },
      { text: 'Collaboration & splits',  included: false },
      { text: 'Download sales',          included: false },
    ],
  },
  {
    key: 'pro', name: 'Pro', icon: Zap, color: '#8B5CF6', popular: true,
    features: [
      { text: 'Unlimited uploads',           included: true },
      { text: 'Full artist profile',         included: true },
      { text: 'Lyrics on tracks',            included: true },
      { text: 'Custom theme & branding',     included: true },
      { text: 'Chat rooms (1 room)',         included: true },
      { text: 'Analytics dashboard',         included: true },
      { text: 'Collaboration & splits',      included: true },
      { text: 'Competition entry',           included: true },
      { text: 'Download sales (2/month)',    included: true },
      { text: 'Pre-order releases',          included: false },
      { text: 'Priority in browse/trending', included: false },
      { text: 'Live streaming',              included: false },
    ],
  },
  {
    key: 'premium', name: 'Premium', icon: Crown, color: '#F59E0B',
    features: [
      { text: 'Unlimited uploads',           included: true },
      { text: 'Full artist profile',         included: true },
      { text: 'Custom theme & branding',     included: true },
      { text: 'Chat rooms (unlimited)',       included: true },
      { text: 'Advanced analytics',          included: true },
      { text: 'Collaboration & splits',      included: true },
      { text: 'Priority in browse/trending', included: true },
      { text: 'Download sales (unlimited)',  included: true },
      { text: 'Pre-order releases',          included: true },
      { text: 'YouTube video backdrop',      included: true },
      { text: 'Featured track placement',    included: true },
      { text: 'Live streaming to followers', included: true },
      { text: 'Tip goals & fundraising',     included: true },
    ],
  },
];

// Mirrors the tiers in ListenerUpgradePage. Kept in the same shape as the
// artist tiers so TierCard renders all three roles without special cases.
const LISTENER_TIERS = [
  {
    key: 'free', name: 'Free', icon: Star, color: '#737373', price: null,
    tagline: 'Listening is free, and stays free',
    features: [
      { text: 'Full music streaming',        included: true },
      { text: 'Follow artists',              included: true },
      { text: 'Playlists and liked songs',   included: true },
      { text: 'Chat rooms and competitions', included: true },
      { text: 'Listening stats',             included: true },
      { text: 'Custom app themes',           included: false },
      { text: 'Fan badge on tips and comments', included: false },
    ],
  },
  {
    key: 'fan_pro', name: 'Fan Pro', icon: Zap, color: '#8B5CF6', popular: true,
    tagline: 'For people who back the artists they love',
    features: [
      { text: 'Everything in Free',          included: true },
      { text: '10 custom app themes',        included: true },
      { text: 'Fan badge on tips and comments', included: true },
      { text: 'Early access to new features', included: true },
    ],
  },
];

const BEATMAKER_TIERS = [
  {
    key: 'free', name: 'Free', icon: Star, color: '#737373', price: null,
    features: [
      { text: 'Upload up to 3 beats',          included: true },
      { text: 'Basic producer profile',         included: true },
      { text: 'Free & Basic Lease licences',    included: true },
      { text: 'Beat discovery in feed',         included: true },
      { text: 'Stem uploads',                   included: false },
      { text: 'Beat analytics',                 included: false },
      { text: 'Premium & Unlimited Lease',      included: false },
      { text: 'Exclusive licence tier',         included: false },
      { text: 'Collaboration & splits',         included: false },
    ],
  },
  {
    key: 'pro', name: 'Pro', icon: Zap, color: '#8B5CF6', popular: true,
    features: [
      { text: 'Upload up to 20 beats',          included: true },
      { text: 'Full producer profile',          included: true },
      { text: 'All licences except Exclusive',  included: true },
      { text: 'Stem uploads',                   included: true },
      { text: 'Beat analytics dashboard',       included: true },
      { text: 'Collaboration & revenue splits', included: true },
      { text: 'Custom theme & branding',        included: true },
      { text: 'Competition entry',              included: true },
      { text: 'Exclusive licence tier',         included: false },
      { text: 'Priority in beats feed',         included: false },
    ],
  },
  {
    key: 'premium', name: 'Premium', icon: Crown, color: '#F59E0B',
    features: [
      { text: 'Unlimited beat uploads',         included: true },
      { text: 'All 5 licences incl. Exclusive', included: true },
      { text: 'Stem uploads',                   included: true },
      { text: 'Advanced analytics & CSV export',included: true },
      { text: 'Collaboration & revenue splits', included: true },
      { text: 'Priority placement in feed',     included: true },
      { text: 'Featured beat placement',        included: true },
      { text: 'Custom theme & branding',        included: true },
      { text: 'Merch store integration',        included: true },
    ],
  },
];

function TierCard({ tier, symbol, rate, billingCycle = 'monthly' }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = tier.icon;

  const localPrice = getPrice(tier.key, billingCycle, rate);

  const visibleFeatures = expanded ? tier.features : tier.features.slice(0, 5);

  return (
    <div
      className="rounded-2xl border p-4 relative"
      style={{
        borderColor: tier.popular ? `${tier.color}50` : 'rgba(255,255,255,0.07)',
        background:  tier.popular ? `${tier.color}08` : 'rgba(255,255,255,0.02)',
      }}
    >
      {tier.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
          style={{ background: tier.color, color: '#000' }}>
          Most Popular
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: `${tier.color}20` }}>
            <Icon className="w-4 h-4" style={{ color: tier.color }} />
          </div>
          <span className="font-bold text-white text-sm">{tier.name}</span>
        </div>
        <div className="text-right">
          {/* Keyed off the tier itself. Testing `localPrice` for truthiness
              meant any tier missing from BASE_USD advertised itself as free. */}
          {tier.key === 'free' ? (
            <span className="text-lg font-bold text-white">Free</span>
          ) : localPrice != null ? (
            <div className="flex flex-col items-end">
              <div className="flex items-baseline space-x-0.5">
                <span className="text-lg font-bold text-white">{symbol}{localPrice}</span>
                <span className="text-xs text-white/30">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
              </div>
              {billingCycle === 'annual' && savingPct(tier.key) != null && (
                <span className="text-[9px] font-bold text-green-400">SAVE {savingPct(tier.key)}%</span>
              )}
            </div>
          ) : (
            <span className="text-sm font-semibold text-white/40">—</span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {visibleFeatures.map((f, i) => (
          <div key={i} className="flex items-center space-x-2">
            {f.included
              ? <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: tier.color }} />
              : <X className="w-3.5 h-3.5 flex-shrink-0 text-white/20" />}
            <span className={`text-xs ${f.included ? 'text-white/70' : 'text-white/25'}`}>{f.text}</span>
          </div>
        ))}
      </div>

      {tier.features.length > 5 && (
        <button
          onClick={() => setExpanded(p => !p)}
          className="mt-3 flex items-center space-x-1 text-xs text-white/30 hover:text-white/50 transition"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span>{expanded ? 'Show less' : `+${tier.features.length - 5} more`}</span>
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, signInWithMagicLink, user } = useAuth();
  const navigate      = useNavigate();
  // Back that works on a cold deep link. navigate(-1) does nothing when
  // this page IS the first history entry, which is every shared link and
  // every tapped push notification. See src/hooks/useGoBack.js.
  const goBack = useGoBack('/');
  const [searchParams] = useSearchParams();

  const redirectTo = searchParams.get('redirect') || null;

  const [authMode, setAuthMode]         = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail]               = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [success, setSuccess]           = useState('');
  const [magicSent, setMagicSent]       = useState(false);
  const [fromPluginGallery, setFromPluginGallery] = useState(false);
  const [bridgeVerifying, setBridgeVerifying]     = useState(false);

  // Currency detection
  const [symbol,       setSymbol]       = useState('$');
  const [rate,         setRate]         = useState(1);
  const [billingCycle, setBillingCycle] = useState('monthly');
  // Starts unset on purpose. The page used to open straight onto artist
  // pricing, and more than one person told Steve they did not sign up
  // because it looked like the platform was for artists only. The choice
  // comes first, the pricing follows from it.
  const [pricingRole, setPricingRole]   = useState(null); // null | 'listener' | 'artist' | 'beatmaker'

  useEffect(() => {
    if (user) navigate(redirectTo || '/', { replace: true });
  }, [user]); // eslint-disable-line

  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(d => {
        const c = CURRENCY_MAP[d.country_code];
        if (c) { setSymbol(c.symbol); setRate(c.rate); }
      }).catch(() => {});
  }, []);

  // Handles arriving back from Plugin Gallery's auth bridge (?bridge_token=&state=)
  useEffect(() => {
    const bridgeToken = searchParams.get('bridge_token');
    const state        = searchParams.get('state');
    if (!bridgeToken) return;

    const expectedState = sessionStorage.getItem('pg_bridge_state');
    sessionStorage.removeItem('pg_bridge_state');

    // Strip the token out of the visible URL immediately, regardless of outcome
    window.history.replaceState({}, '', '/login');

    if (!state || state !== expectedState) {
      setError('Could not verify your Plugin Gallery sign-in. Please try again.');
      return;
    }

    setBridgeVerifying(true);
    fetch('/.netlify/functions/verify-auth-bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: bridgeToken }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data.email) {
          setError('Could not verify your Plugin Gallery sign-in. Please try again.');
          return;
        }
        setEmail(data.email);
        setFromPluginGallery(true);
      })
      .catch(() => setError('Could not verify your Plugin Gallery sign-in. Please try again.'))
      .finally(() => setBridgeVerifying(false));
  }, []); // eslint-disable-line

  const handlePluginGallery = () => {
    const state = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    sessionStorage.setItem('pg_bridge_state', state);
    if (redirectTo) sessionStorage.setItem('post_login_redirect', redirectTo);
    window.location.href = `https://www.projectfeelz.com/api/auth-bridge/start?state=${encodeURIComponent(state)}`;
  };

  const handleGoogle = async () => {
    if (!ageConfirmed) { setError('Please confirm you are 13 or older.'); return; }
    setLoading(true); setError('');
    try {
      if (redirectTo) sessionStorage.setItem('post_login_redirect', redirectTo);
      // The pricing toggle above (Artist / Beat Maker) is the only place
      // this choice gets made, but the artist row doesn't exist yet at
      // this point — it's created by a trigger after auth completes.
      // Stash the selection so it can be applied once that row actually
      // exists, instead of silently discarding it (the original bug).
      if (pricingRole === 'artist' || pricingRole === 'beatmaker') {
        localStorage.setItem('pending_creator_role', pricingRole);
      } else {
        localStorage.removeItem('pending_creator_role');
      }
      await signInWithGoogle();
    } catch (err) { setError(err.message); setLoading(false); }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    if (!ageConfirmed) { setError('Please confirm you are 13 or older.'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setLoading(true); setError('');
    try {
      // Same reasoning as the Google path — magic link means leaving this
      // tab entirely to click the emailed link, so this has to survive
      // that gap. localStorage (not sessionStorage) since the link may
      // be opened in a different tab or even a different device.
      if (pricingRole === 'artist' || pricingRole === 'beatmaker') {
        localStorage.setItem('pending_creator_role', pricingRole);
      } else {
        localStorage.removeItem('pending_creator_role');
      }
      await signInWithMagicLink(email.trim());
      setMagicSent(true);
    } catch (err) {
      setError(err.message?.replace('AuthApiError: ', '') || 'Something went wrong.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black overflow-y-auto">
      {/* Back button */}
      <button onClick={() => goBack()}
        className="fixed top-12 left-4 z-10 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition">
        <ArrowLeft className="w-5 h-5 text-white" />
      </button>

      <div className="max-w-lg mx-auto px-5 pt-20 pb-16">

        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Feelz Machine</h1>
          <p className="text-sm text-white/40 mb-2">Independent music, no middlemen</p>
          <p className="text-xs text-cyan-400/80 font-medium">
            Free to listen and follow artists · Artists & beatmakers get paid to share their music
          </p>
        </div>

        {/* ── Auth section ─────────────────────────────────────────────────── */}
        <div className="bg-white/[0.02] border border-white/[0.07] rounded-2xl p-5">

          {fromPluginGallery && !magicSent && (
            <div className="mb-4 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <p className="text-xs font-semibold text-cyan-400 mb-1.5">
                ✓ Connected from Plugin Gallery
              </p>
              <p className="text-xs text-white/60 leading-relaxed">
                Almost there, <strong className="text-white/80">1)</strong> tick "I confirm I am 13 or older" below,
                then <strong className="text-white/80">2)</strong> tap "Send Magic Link".
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}

          {magicSent ? (
            /* ── Magic link sent state ── */
            <div className="text-center py-4 space-y-3">
              <div className="w-16 h-16 rounded-full bg-purple-500/15 flex items-center justify-center mx-auto">
                <Mail className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-base font-bold text-white">Check your email</h3>
              <p className="text-sm text-white/50 leading-relaxed">
                We sent a magic link to <span className="text-white/80 font-medium">{email}</span>.
                Tap the link in the email to sign in, no password needed.
              </p>
              <p className="text-xs text-amber-400/90 font-medium">
                Not in your inbox? Check your spam or junk folder.
              </p>
              <p className="text-xs text-white/35">
                Still nothing after a few minutes?{' '}
                <button onClick={() => { setMagicSent(false); setError(''); }}
                  className="text-purple-400 hover:text-purple-300 transition underline">
                  Try again
                </button>
              </p>
            </div>
          ) : (
            <>
              {/* Magic link form */}
              <form onSubmit={handleMagicLink} className="space-y-3 mb-4">
                <div>
                  <p className="text-sm font-semibold text-white mb-1">Sign in or create account</p>
                  <p className="text-xs text-white/35 mb-3">Enter your email, we'll send you a magic link. No password needed.</p>
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="Email address" autoComplete="email"
                    className="w-full pl-10 pr-4 py-3 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/25 outline-none border border-white/[0.06] focus:border-white/20 transition"
                  />
                </div>

                {/* Age confirmation */}
                <label className="flex items-start space-x-2.5 cursor-pointer group">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <input type="checkbox" checked={ageConfirmed}
                      onChange={e => { setAgeConfirmed(e.target.checked); setError(''); }}
                      className="sr-only" />
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition ${
                      ageConfirmed ? 'bg-white border-white' : 'bg-transparent border-white/20 group-hover:border-white/40'
                    }`}>
                      {ageConfirmed && (
                        <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-white/35 leading-relaxed group-hover:text-white/50 transition">
                    I confirm I am 13 years or older
                  </span>
                </label>

                <button type="submit" disabled={loading || !ageConfirmed || !email.trim()}
                  className="w-full py-3 bg-white text-black rounded-xl text-sm font-bold disabled:opacity-40 transition active:scale-98 flex items-center justify-center space-x-2">
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  <span>{loading ? 'Sending…' : 'Send Magic Link'}</span>
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center space-x-3 mb-4">
                <div className="flex-1 h-px bg-white/[0.07]" />
                <span className="text-[11px] text-white/25">or</span>
                <div className="flex-1 h-px bg-white/[0.07]" />
              </div>

              {/* Google */}
              <button onClick={handleGoogle} disabled={loading || !ageConfirmed}
                className="w-full py-3 bg-white/[0.05] border border-white/[0.08] text-white/70 rounded-xl text-sm font-semibold disabled:opacity-40 transition hover:bg-white/[0.08] active:scale-98 flex items-center justify-center space-x-3">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* Plugin Gallery bridge */}
              <button onClick={handlePluginGallery} disabled={loading || bridgeVerifying}
                className="w-full mt-3 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition hover:opacity-90 active:scale-98 flex items-center justify-center space-x-3"
                style={{ background: 'linear-gradient(90deg, #00f0ff, #a855f7)' }}>
                <img src="https://www.projectfeelz.com/logo.png" alt="" className="w-5 h-5 rounded" />
                <span>{bridgeVerifying ? 'Connecting…' : 'Continue with Plugin Gallery'}</span>
              </button>
            </>
          )}
        </div>

        {/* ── Pricing section ──────────────────────────────────────────────── */}
        <div className="mt-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="flex-1 h-px bg-white/[0.07]" />
            {/* Was "Artist & Beat Maker Plans", which labelled the section
                artists-only immediately above a role picker that leads with
                Listener. That contradiction is the thing that made the page
                read as not-for-listeners. */}
            <span className="text-xs text-white/25">Plans</span>
            <div className="flex-1 h-px bg-white/[0.07]" />
          </div>
          <p className="text-center text-xs text-white/40 mb-4">
            Listening is free. Pick who you are to see what the paid tiers add.
          </p>

          {/* Role choice, listener included and listed first, because that is
              what most people signing up actually are. */}
          <p className="text-sm font-semibold text-white/70 mb-2">What brings you here?</p>
          <div className="grid grid-cols-3 gap-1 bg-white/[0.05] rounded-xl p-1 mb-4">
            {[
              { key: 'listener',  label: '🎧 Listener'  },
              { key: 'artist',    label: '🎤 Artist'    },
              { key: 'beatmaker', label: '🎛️ Beat Maker' },
            ].map(r => (
              <button key={r.key} onClick={() => setPricingRole(r.key)}
                className={`py-2 rounded-lg text-xs font-semibold transition ${
                  pricingRole === r.key ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
                }`}>
                {r.label}
              </button>
            ))}
          </div>

          {/* Nothing about money until they have said who they are. */}
          {!pricingRole && (
            <p className="text-center text-xs text-white/35 py-4">
              Pick one and we will show you what it costs. Listening is free.
            </p>
          )}

          {/* Billing toggle. Gated on the role: it used to render
              unconditionally, so the first thing a new visitor saw was a
              Monthly/Annual choice for a plan they had not been offered yet,
              which is half of the complaint about the page leading with
              pricing. */}
          {pricingRole && (
          <div className="flex bg-white/[0.05] rounded-xl p-1 mb-5">
            {['monthly', 'annual'].map(cycle => (
              <button key={cycle}
                onClick={() => setBillingCycle(cycle)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center space-x-1.5 ${
                  billingCycle === cycle ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
                }`}>
                <span>{cycle === 'monthly' ? 'Monthly' : 'Annual'}</span>
                {cycle === 'annual' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">
                    SAVE 30%
                  </span>
                )}
              </button>
            ))}
          </div>
          )}

          <div className="space-y-3">
            {pricingRole && (
              pricingRole === 'listener'  ? LISTENER_TIERS
              : pricingRole === 'beatmaker' ? BEATMAKER_TIERS
              : TIERS
            )?.map(tier => (
              <TierCard key={tier.key} tier={tier} symbol={symbol} rate={rate} billingCycle={billingCycle} />
            ))}
          </div>
          {pricingRole && (
            <p className="text-center text-xs text-white/35 mt-4">
              {pricingRole === 'listener'
                ? 'Signing up is free. Fan Pro is optional and you can add it any time.'
                : 'Start free, upgrade whenever. You can change plan after joining.'}
            </p>
          )}
        </div>

        {/* Terms, and the marketing notice.
            POPIA section 69 lets Feelz Machine opt people in by default rather
            than asking them to tick a box, but only where the person was given
            a reasonable opportunity to object AT THE TIME their details were
            collected — not only later, buried in a settings page. This line is
            that opportunity. Terms section 14 is the detail; this is the
            sentence the person actually reads, at the moment it applies. */}
        <p className="text-center text-[11px] text-white/20 mt-6 leading-relaxed">
          By continuing, you agree to our{' '}
          <a href="/terms-of-use" className="text-white/30 hover:text-white/50 underline">Terms</a>
          {' '}and{' '}
          <a href="/privacy-policy" className="text-white/30 hover:text-white/50 underline">Privacy Policy</a>
          , and to emails from Feelz Machine and from artists you follow.
          You can stop them any time from the link in any email, or in{' '}
          <a href="/contact-preferences" className="text-white/30 hover:text-white/50 underline">Email Preferences</a>.
        </p>
      </div>
    </div>
  );
}