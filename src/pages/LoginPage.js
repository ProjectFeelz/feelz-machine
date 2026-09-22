// src/pages/LoginPage.js
//
// Sign in / create account.
//
// Web: one screen, no scrolling. Sign-in on the left, the real Feelz Machine
// app running inside a phone on the right (an iframe of the For You feed, so
// people see and can tap through the actual product while they sign in).
// Phone: just the sign-in, full screen.
//
// No pricing anywhere on this page. People meet prices when they reach for
// something paid inside the app, not at the front door.
//
// Ways in:
//   email + password   (new; iPhone users were stuck on one-time links that
//                       open in Safari instead of the installed app)
//   Google
//   email link         (the old magic link, kept as a fallback)
//   Plugin Gallery     (auth bridge)
// "Forgot password" emails a link to /reset-password, which also lets anyone
// who has only ever used email links set a password for the same account.

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Mail, Lock, Eye, EyeOff, Loader, ArrowLeft } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import VinylRecord from '../components/VinylRecord';
import RetailTonearm from '../components/retail/RetailTonearm';

const field = 'w-full pl-10 pr-4 py-3 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/30 outline-none border border-white/[0.06] focus:border-white/25 transition';

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

// The live app in a phone. Scaled to fit whatever height the screen has.
function PhonePreview() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - 96) / 812));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div style={{ width: 375 * scale + 28 * scale, height: 812 * scale + 28 * scale }} className="relative flex-shrink-0">
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})`, width: 403, height: 840 }}>
        <div className="w-full h-full rounded-[56px] p-[14px] bg-[#111] shadow-[0_40px_120px_rgba(140,171,46,0.18)] border border-white/10">
          <div className="relative w-full h-full rounded-[44px] overflow-hidden bg-black">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-7 rounded-full bg-black z-10" />
            <iframe
              title="Feelz Machine app preview"
              src="/?preview=phone"
              loading="lazy"
              allow="autoplay; encrypted-media"
              className="w-[375px] h-[812px] border-0 bg-black"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Retail sign-in (tablet and computer): a record turning under its tonearm.
// Purely a picture. Nothing in it can be clicked or touched, and there is no
// audio anywhere on this page.
function RecordPreview() {
  const [size, setSize] = useState(420);
  useEffect(() => {
    const fit = () => setSize(Math.max(260, Math.min(560, window.innerHeight - 200, window.innerWidth * 0.4)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="relative flex-shrink-0 select-none pointer-events-none" aria-hidden="true"
      style={{ width: size * 1.12, height: size * 1.08 }}>
      {/* A thin ring of light under the rim, not a splash. */}
      <div className="absolute rounded-full"
        style={{ width: size * 1.1, height: size * 1.1, left: -size * 0.05, bottom: -size * 0.05,
          background: 'radial-gradient(circle closest-side, rgba(167,139,250,0) 86%, rgba(167,139,250,0.5) 92%, rgba(167,139,250,0.14) 96%, rgba(167,139,250,0) 100%)',
          filter: 'blur(6px)' }} />
      <div className="absolute" style={{ width: size, height: size, left: 0, bottom: 0,
        filter: 'drop-shadow(26px 36px 60px rgba(0,0,0,0.9)) drop-shadow(6px 10px 18px rgba(0,0,0,0.7))' }}>
        <VinylRecord coverUrl="/retail-icon-512.png" isPlaying size={size} shadow={false} />
      </div>
      <div className="absolute" style={{ width: size, height: size, left: 0, bottom: 0 }}>
        <RetailTonearm playing uid="login" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, signInWithMagicLink, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || null;
  // Venues arrive from Retail with ?redirect=/retail...; they get the Retail
  // look (record instead of phone) and are sent back there afterwards.
  const isRetail = /^\/retail/.test(redirectTo || '') || searchParams.get('app') === 'retail';

  // signin | signup | link | forgot
  const [mode, setMode]                 = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPw, setShowPw]             = useState(false);
  const [role, setRole]                 = useState('listener'); // listener | artist | beatmaker
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError]               = useState('');
  const [notice, setNotice]             = useState(''); // "check your email" states
  const [loading, setLoading]           = useState(false);
  const [fromPluginGallery, setFromPluginGallery] = useState(false);
  const [bridgeVerifying, setBridgeVerifying]     = useState(false);
  const [googleAge, setGoogleAge]                 = useState(false); // show the age box for Google on the sign-in tab

  useEffect(() => {
    if (user) navigate(redirectTo || '/', { replace: true });
  }, [user]); // eslint-disable-line

  // Arriving back from Plugin Gallery's auth bridge (?bridge_token=&state=)
  useEffect(() => {
    const bridgeToken = searchParams.get('bridge_token');
    const state       = searchParams.get('state');
    if (!bridgeToken) return;
    const expectedState = sessionStorage.getItem('pg_bridge_state');
    sessionStorage.removeItem('pg_bridge_state');
    window.history.replaceState({}, '', '/login');
    if (!state || state !== expectedState) {
      setError('Could not verify your Plugin Gallery sign-in. Please try again.');
      return;
    }
    setBridgeVerifying(true);
    fetch('/.netlify/functions/verify-auth-bridge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: bridgeToken }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data.email) { setError('Could not verify your Plugin Gallery sign-in. Please try again.'); return; }
        setEmail(data.email);
        setFromPluginGallery(true);
        setMode('link');
      })
      .catch(() => setError('Could not verify your Plugin Gallery sign-in. Please try again.'))
      .finally(() => setBridgeVerifying(false));
  }, []); // eslint-disable-line

  // The creator role is applied after the account row exists (AuthContext).
  const stashRole = () => {
    if (redirectTo) sessionStorage.setItem('post_login_redirect', redirectTo);
    if (mode === 'signup' && (role === 'artist' || role === 'beatmaker')) localStorage.setItem('pending_creator_role', role);
    else if (mode === 'signup') localStorage.removeItem('pending_creator_role');
  };

  const needsAge = mode === 'signup' || mode === 'link' || googleAge;
  const clean = m => (m || 'Something went wrong.').replace('AuthApiError: ', '');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setNotice('');
    const addr = email.trim();
    if (!addr) { setError('Enter your email address.'); return; }
    if (needsAge && mode !== 'signin' && !ageConfirmed) { setError('Please confirm you are 13 or older.'); return; }

    setLoading(true);
    try {
      if (mode === 'signin') {
        if (!password) { setError('Enter your password.'); setLoading(false); return; }
        if (redirectTo) sessionStorage.setItem('post_login_redirect', redirectTo);
        await signInWithEmail(addr, password);
      } else if (mode === 'signup') {
        if (password.length < 8) { setError('Use at least 8 characters for your password.'); setLoading(false); return; }
        stashRole();
        const data = await signUpWithEmail(addr, password, '/setup');
        // With email confirmation on, Supabase returns no session and an empty
        // identities list if the address is already registered.
        if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setError('That email already has an account. Sign in, or use Forgot password to set one.');
        } else if (!data?.session) {
          setNotice(`Check ${addr} and tap the link to confirm your account.`);
        }
      } else if (mode === 'link') {
        stashRole();
        await signInWithMagicLink(addr);
        setNotice(`We sent a sign-in link to ${addr}. Tap it to come straight in.`);
      } else if (mode === 'forgot') {
        const { error: e2 } = await supabase.auth.resetPasswordForEmail(addr, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (e2) throw e2;
        setNotice(`If ${addr} has an account, a link to set your password is on its way.`);
      }
    } catch (err) {
      const m = clean(err.message);
      setError(/invalid login credentials/i.test(m)
        ? 'Email or password is wrong. Never set a password? Use Forgot password to set one.'
        : m);
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    // Google can create a new account from either tab, so the age check applies.
    if (!ageConfirmed) { setGoogleAge(true); setError('Please confirm you are 13 or older, then tap Google again.'); return; }
    setLoading(true); setError('');
    try { stashRole(); await signInWithGoogle(); }
    catch (err) { setError(clean(err.message)); setLoading(false); }
  };

  const handlePluginGallery = () => {
    const state = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    sessionStorage.setItem('pg_bridge_state', state);
    if (redirectTo) sessionStorage.setItem('post_login_redirect', redirectTo);
    window.location.href = `https://www.projectfeelz.com/api/auth-bridge/start?state=${encodeURIComponent(state)}`;
  };

  const TITLES = isRetail ? {
    signin: ['Welcome back', 'Sign in to run the music in your venue.'],
    signup: ['Set up Feelz Retail', 'Licensed independent music for your shop, bar or salon.'],
    link:   ['Email me a link', 'No password. We send a link that signs you in.'],
    forgot: ['Set or reset your password', 'We email you a link to choose a new password.'],
  } : {
    signin: ['Welcome back', 'Sign in to keep listening.'],
    signup: ['Join Feelz Machine', 'Independent music, straight from the artists. Free to listen.'],
    link:   ['Email me a link', 'No password. We send a link that signs you in.'],
    forgot: ['Set or reset your password', 'We email you a link to choose a new password.'],
  };

  const form = (
    <div className="w-full max-w-sm">
      <button onClick={() => navigate(isRetail ? '/retail' : '/')}
        className={`${isRetail ? 'md:hidden' : 'lg:hidden'} mb-6 text-sm text-white/45 hover:text-white flex items-center`}>
        <ArrowLeft className="w-4 h-4 mr-1" /> {isRetail ? 'Back to Retail' : 'Back to the music'}
      </button>
      <div className="flex items-center space-x-2.5 mb-6 lg:mb-5">
        {isRetail ? (
          <img src="/retail-icon-192.png" alt="" className="w-9 h-9 rounded-lg" />
        ) : (
          <div className="w-9 h-9 rounded-lg border border-[#8CAB2E] flex items-center justify-center">
            <span className="text-[#8CAB2E] font-bold text-sm">FM</span>
          </div>
        )}
        <p className="text-sm font-bold text-white">{isRetail ? 'Feelz Machine Retail' : 'Feelz Machine'}</p>
      </div>

      <h1 className="text-3xl font-black text-white leading-tight">{TITLES[mode][0]}</h1>
      <p className="text-sm text-white/45 mt-2 mb-5">{TITLES[mode][1]}</p>

      {fromPluginGallery && (
        <div className="mb-4 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-white/70">
          Connected from Plugin Gallery. Tick the age box and send the link.
        </div>
      )}
      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">{error}</div>}

      {notice ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white/80 leading-relaxed">
            {notice}
            <p className="text-xs text-amber-300/90 mt-2">Not there? Check spam or junk.</p>
          </div>
          <button onClick={() => { setNotice(''); setMode('signin'); }} className="text-sm text-white/50 hover:text-white flex items-center">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to sign in
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={submit} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address"
                autoComplete="email" className={field} />
            </div>

            {(mode === 'signin' || mode === 'signup') && (
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Create a password (8+ characters)' : 'Password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className={field + ' pr-10'} />
                <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            )}

            {mode === 'signin' && (
              <div className="flex justify-end -mt-1">
                <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-xs text-white/45 hover:text-white">
                  Forgot password?
                </button>
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <p className="text-[11px] text-white/40 mb-1.5">I'm here to</p>
                <div className="grid grid-cols-3 gap-1 bg-white/[0.05] rounded-xl p-1">
                  {[['listener', 'Listen'], ['artist', 'Release music'], ['beatmaker', 'Sell beats']].map(([k, label]) => (
                    <button type="button" key={k} onClick={() => setRole(k)}
                      className={`py-2 rounded-lg text-xs font-semibold transition ${role === k ? 'bg-white text-black' : 'text-white/45 hover:text-white/70'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {needsAge && (
              <label className="flex items-center space-x-2.5 cursor-pointer text-[12px] text-white/45">
                <input type="checkbox" checked={ageConfirmed} onChange={e => { setAgeConfirmed(e.target.checked); setError(''); }}
                  className="w-4 h-4 accent-white" />
                <span>I confirm I am 13 years or older</span>
              </label>
            )}

            <button type="submit" disabled={loading || bridgeVerifying}
              className="w-full py-3 bg-white text-black rounded-xl text-sm font-bold disabled:opacity-40 transition flex items-center justify-center">
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : {
                signin: 'Sign in', signup: 'Create account', link: 'Send me a link', forgot: 'Send reset link',
              }[mode]}
            </button>
          </form>

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <div className="flex items-center space-x-3 my-4">
                <div className="flex-1 h-px bg-white/[0.08]" /><span className="text-[11px] text-white/30">or</span><div className="flex-1 h-px bg-white/[0.08]" />
              </div>
              <div className="space-y-2">
                <button onClick={handleGoogle} disabled={loading}
                  className="w-full py-3 bg-white/[0.05] border border-white/[0.08] text-white/80 rounded-xl text-sm font-semibold hover:bg-white/[0.08] transition flex items-center justify-center space-x-3 disabled:opacity-40">
                  <GoogleIcon /><span>Continue with Google</span>
                </button>
                <button onClick={handlePluginGallery} disabled={loading || bridgeVerifying}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition hover:opacity-90 flex items-center justify-center space-x-3"
                  style={{ background: 'linear-gradient(90deg, #00f0ff, #a855f7)' }}>
                  <img src="https://www.projectfeelz.com/logo.png" alt="" className="w-5 h-5 rounded" />
                  <span>{bridgeVerifying ? 'Connecting...' : 'Continue with Plugin Gallery'}</span>
                </button>
                <button onClick={() => { setMode('link'); setError(''); }}
                  className="w-full py-2 rounded-xl text-xs font-semibold text-white/50 hover:text-white/80 transition">
                  Email me a sign-in link instead
                </button>
              </div>
            </>
          )}

          <p className="text-sm text-white/45 mt-5">
            {mode === 'signin' ? (
              <>New here? <button onClick={() => { setMode('signup'); setError(''); }} className="text-white font-semibold hover:underline">Create an account</button></>
            ) : (
              <>Have an account? <button onClick={() => { setMode('signin'); setError(''); }} className="text-white font-semibold hover:underline">Sign in</button></>
            )}
          </p>
        </>
      )}

      {/* POPIA s69: the chance to object is given at the moment details are collected. */}
      <p className="text-[11px] text-white/25 mt-5 leading-relaxed">
        By continuing you agree to our <a href="/terms-of-use" className="underline hover:text-white/50">Terms</a> and{' '}
        <a href="/privacy-policy" className="underline hover:text-white/50">Privacy Policy</a>, and to messages from Feelz Machine and
        artists you follow. Stop them any time in <a href="/contact-preferences" className="underline hover:text-white/50">Email Preferences</a>.
      </p>
    </div>
  );

  return (
    // At least one screen tall, not exactly one: on a short laptop window the
    // create-account form would otherwise be cut off rather than scroll a little.
    <div className={`min-h-[100dvh] bg-black text-white flex ${isRetail ? 'overflow-hidden' : ''}`}>
      <Helmet><title>{isRetail ? 'Sign in · Feelz Machine Retail' : 'Sign in · Feelz Machine'}</title></Helmet>
      {isRetail ? (
        <div className="w-full max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-6 flex items-center justify-center md:justify-between gap-8 lg:gap-12">
          <div className="flex-1 flex justify-center md:justify-start">{form}</div>
          <div className="hidden md:flex flex-1 justify-center items-center">
            <RecordPreview />
          </div>
        </div>
      ) : (
        <div className="w-full max-w-6xl mx-auto px-6 lg:px-10 py-10 lg:py-6 flex items-center justify-center lg:justify-between gap-12">
          <div className="flex-1 flex justify-center lg:justify-start">{form}</div>
          <div className="hidden lg:flex flex-1 justify-center items-center">
            <PhonePreview />
          </div>
        </div>
      )}
    </div>
  );
}