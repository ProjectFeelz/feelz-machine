// src/pages/ResetPasswordPage.js
//
// /reset-password: choose a new password.
//
// Reached two ways:
//   1. The "Forgot password" email. Supabase signs the person in from the link
//      (a recovery session) and this page sets the password.
//   2. Signed in already (for example someone who has only ever used email
//      links, like most iPhone users). They can set a password here for the
//      same account. Nothing else about the account changes, and email links
//      and Google keep working.

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Lock, Eye, EyeOff, Loader, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady]     = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [pw, setPw]           = useState('');
  const [pw2, setPw2]         = useState('');
  const [show, setShow]       = useState(false);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  useEffect(() => {
    // The recovery link lands with tokens in the URL; supabase-js turns them
    // into a session (PASSWORD_RECOVERY). Wait briefly for that.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) { setHasSession(true); setReady(true); }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setHasSession(true);
      setTimeout(() => setReady(true), session ? 0 : 1500);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError('Use at least 8 characters.'); return; }
    if (pw !== pw2) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) { setError(err.message.replace('AuthApiError: ', '')); return; }
    setDone(true);
    setTimeout(() => navigate('/', { replace: true }), 1500);
  };

  const field = 'w-full pl-10 pr-10 py-3 bg-white/[0.06] rounded-xl text-sm text-white placeholder-white/30 outline-none border border-white/[0.06] focus:border-white/25 transition';

  return (
    <div className="min-h-[100dvh] bg-black text-white flex items-center justify-center px-6">
      <Helmet><title>Set your password · Feelz Machine</title><meta name="robots" content="noindex" /></Helmet>
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black">Set your password</h1>
        <p className="text-sm text-white/45 mt-2 mb-6">Next time, sign in with your email and this password.</p>

        {!ready ? (
          <Loader className="w-5 h-5 text-white/30 animate-spin" />
        ) : !hasSession ? (
          <div className="space-y-3 text-sm text-white/60">
            <p>This link has expired or was already used.</p>
            <button onClick={() => navigate('/login')} className="text-white font-semibold underline">Get a new link</button>
          </div>
        ) : done ? (
          <p className="text-sm text-emerald-300 flex items-center"><Check className="w-4 h-4 mr-2" />Password saved. Taking you in.</p>
        ) : (
          <form onSubmit={save} className="space-y-3">
            {[['New password', pw, setPw, 'new-password'], ['Type it again', pw2, setPw2, 'new-password']].map(([ph, v, set, ac]) => (
              <div key={ph} className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input type={show ? 'text' : 'password'} value={v} onChange={e => set(e.target.value)} placeholder={ph} autoComplete={ac} className={field} />
                <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            ))}
            {error && <p className="text-xs text-red-300">{error}</p>}
            <button type="submit" disabled={busy} className="w-full py-3 bg-white text-black rounded-xl text-sm font-bold disabled:opacity-40 flex items-center justify-center">
              {busy ? <Loader className="w-4 h-4 animate-spin" /> : 'Save password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}