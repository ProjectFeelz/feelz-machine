// src/pages/RetailJoinPage.js
// /retail/join/:token — where a venue completes signup after receiving an
// invite link from admin. Sets a password, gets linked to the specific
// venue record the token points to, then lands on /retail once confirmed.

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader, Store } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import useRetailManifest from '../hooks/useRetailManifest';

export default function RetailJoinPage() {
  useRetailManifest();
  const { token } = useParams();
  const navigate = useNavigate();
  const { signUpWithEmail } = useAuth();

  const [checking, setChecking] = React.useState(true);
  const [businessName, setBusinessName] = React.useState(null);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    supabase.rpc('get_venue_by_signup_token', { p_token: token }).then(({ data, error }) => {
      if (error || !data || data.length === 0) { setBusinessName(null); }
      else { setBusinessName(data[0].business_name); }
      setChecking(false);
    });
  }, [token]);

  const [accountCreatedButUnlinked, setAccountCreatedButUnlinked] = React.useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || password.length < 6) {
      setError('Enter a valid email and a password of at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { user } = await signUpWithEmail(email.trim(), password, '/retail');
      if (!user) throw new Error('Signup did not return a user.');
      const { error: linkErr } = await supabase.rpc('complete_venue_signup', {
        p_token: token,
        p_user_id: user.id,
      });
      if (linkErr) {
        // The account now genuinely exists, it just isn't linked to the
        // venue, most likely because the token expired in the moment
        // between opening this page and submitting. Don't let this look
        // like a full failure, their account is real, it just needs an
        // admin to finish the link with "Link login" now that it exists.
        setAccountCreatedButUnlinked(true);
        throw linkErr;
      }
      setDone(true);
    } catch (err) {
      if (err.message?.toLowerCase().includes('already registered') || err.message?.toLowerCase().includes('already been registered')) {
        setError('An account with this email already exists. If this is your second attempt, your account was likely already created, ask whoever sent this invite to link it for you rather than signing up again.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    }
    setSubmitting(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!businessName) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">This invite link is invalid or has expired. Ask whoever sent it to generate a new one.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <Store className="w-10 h-10 text-purple-400 mx-auto" />
          <h1 className="text-xl font-bold">Almost there</h1>
          <p className="text-sm text-white/50">
            Check {email} for a confirmation link. Once you click it, you're straight into {businessName}'s player.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <Helmet><title>Set up your account, Feelz Retail</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1.5">
          <Store className="w-8 h-8 text-purple-400 mx-auto" />
          <h1 className="text-xl font-bold">Set up {businessName}'s account</h1>
          <p className="text-xs text-white/40">This creates your login for Feelz Retail.</p>
        </div>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition" />
        <input type="password" placeholder="Password (min 6 characters)" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition" />
        {error && (
          <div className="text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 space-y-1">
            <p className="text-red-400">{error}</p>
            {accountCreatedButUnlinked && (
              <p className="text-white/40">Your account was created successfully, it just isn't connected to {businessName} yet. Contact whoever sent you this invite, they can finish connecting it on their end, no need to sign up again.</p>
            )}
          </div>
        )}
        <button onClick={handleSubmit} disabled={submitting || accountCreatedButUnlinked}
          className="w-full py-3 rounded-xl bg-purple-500 text-white font-bold disabled:opacity-40">
          {submitting ? 'Setting up…' : accountCreatedButUnlinked ? 'Contact your invite sender' : 'Create account'}
        </button>
      </div>
    </div>
  );
}