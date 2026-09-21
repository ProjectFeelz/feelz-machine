// src/pages/RetailStartPage.js
// /retail/start: self-serve signup for the Feelz Retail free trial.
//
// Two steps on one page. Not signed in: create a login (or sign in), and the
// confirmation email brings them back here. Signed in: business name, and the
// venue is created by netlify/functions/retail-signup.js at the standard price.
// Then the player, where they start the trial through PayPal.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader, Store } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import useRetailManifest from '../hooks/useRetailManifest';

const inputCls = 'w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition';

export default function RetailStartPage() {
  useRetailManifest();
  const navigate = useNavigate();
  const { user, loading, signUpWithEmail } = useAuth();

  const [pricing, setPricing] = React.useState(null);   // { priceUsd, trialDays }
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [businessName, setBusinessName] = React.useState('');
  const [contactName, setContactName] = React.useState('');
  const [contactPhone, setContactPhone] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [sentTo, setSentTo] = React.useState('');

  React.useEffect(() => {
    fetch('/.netlify/functions/retail-signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pricing' }),
    }).then(r => r.json()).then(setPricing).catch(() => setPricing({ priceUsd: null, trialDays: 0 }));
  }, []);

  const createLogin = async () => {
    setError('');
    if (!email.trim() || password.length < 6) {
      setError('Enter your email and a password of at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      await signUpWithEmail(email.trim(), password, '/retail/start');
      setSentTo(email.trim());
    } catch (err) {
      const m = (err.message || '').toLowerCase();
      setError(m.includes('registered')
        ? 'That email already has an account. Sign in instead.'
        : (err.message || 'Something went wrong. Try again.'));
    }
    setBusy(false);
  };

  const createVenue = async () => {
    setError('');
    if (businessName.trim().length < 2) { setError('Enter your business name.'); return; }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/retail-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ action: 'start', businessName, contactName, contactPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.venueId) throw new Error(data.error || 'Could not create your venue.');
      navigate('/retail/player');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (loading || !pricing) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>;
  }

  const price = pricing.priceUsd;
  const days  = pricing.trialDays;

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-12">
      <Helmet><title>Start your free trial, Feelz Retail</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1.5">
          <Store className="w-8 h-8 text-purple-400 mx-auto" />
          <h1 className="text-xl font-bold">{days ? `${days} days free` : 'Feelz Retail'}</h1>
          {price
            ? <p className="text-xs text-white/45">Then ${price.toFixed(2)} a month. Cancel any time before day {days + 1} and you pay nothing.</p>
            : <p className="text-xs text-white/45">Online signup is not open yet.</p>}
        </div>

        {!price ? (
          <a href="mailto:jane@projectfeelz.com?subject=Feelz%20Retail%20enquiry"
            className="block text-center w-full py-3 rounded-xl bg-purple-500 text-white font-bold text-sm hover:bg-purple-400 transition">
            Get in touch
          </a>
        ) : sentTo ? (
          <p className="text-sm text-white/60 text-center">
            Check {sentTo} for a confirmation link. It brings you straight back here to finish.
          </p>
        ) : !user ? (
          <>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
            <input type="password" placeholder="Password (min 6 characters)" value={password}
              onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && createLogin()} className={inputCls} />
            <button onClick={createLogin} disabled={busy}
              className="w-full py-3 rounded-xl bg-purple-500 text-white font-bold text-sm hover:bg-purple-400 transition disabled:opacity-60">
              {busy ? 'Creating your login' : 'Create my login'}
            </button>
            <p className="text-xs text-white/35 text-center">
              Already have an account?{' '}
              <button onClick={() => navigate('/login?redirect=/retail/start')} className="text-purple-400 underline">Sign in</button>
            </p>
          </>
        ) : (
          <>
            <input placeholder="Business name" value={businessName} onChange={e => setBusinessName(e.target.value)} className={inputCls} />
            <input placeholder="Your name (optional)" value={contactName} onChange={e => setContactName(e.target.value)} className={inputCls} />
            <input placeholder="Phone (optional)" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputCls} />
            <button onClick={createVenue} disabled={busy}
              className="w-full py-3 rounded-xl bg-purple-500 text-white font-bold text-sm hover:bg-purple-400 transition disabled:opacity-60">
              {busy ? 'Setting up' : 'Continue to your free trial'}
            </button>
            <p className="text-[11px] text-white/30 text-center leading-relaxed">
              Next you add PayPal or a card. Nothing is charged for {days} days. By continuing you agree to the{' '}
              <button onClick={() => navigate('/retail/terms')} className="underline">Feelz Retail terms</button>.
            </p>
          </>
        )}

        {error && <p className="text-xs text-red-400 text-center">{error}</p>}
      </div>
    </div>
  );
}