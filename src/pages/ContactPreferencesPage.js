// src/pages/ContactPreferencesPage.js
//
// Where a listener controls who may contact them.
//
// This file was referenced by AppRouter and linked from the hub but was
// missing from the repo, which broke the build. Rebuilt against the RPC
// contract in migration 69, which does exist:
//
//   get_my_contact_status()                    -> { email, email_subscribed, artists[] }
//   set_artist_contact_optin(artist_id, bool)  -> void
//   set_all_contact_optin(bool)                -> void
//
// Everything goes through those functions rather than touching the tables.
// artist_contacts RLS is "Artists see own contacts": the artist can read
// rows about other people, and the person those rows describe cannot see
// or change them. Widening that so listeners could write would also expose
// the shape of artists' contact lists, so narrow SECURITY DEFINER
// functions are the right tool.
//
// Why this matters beyond tidiness: export-contacts hands an artist the
// name and email of their followers. Consent to direct marketing has to be
// withdrawable, so this page is the withdrawal mechanism, not a nicety.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, Mail, Check, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

function Toggle({ on, onChange, label }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-label={`${on ? 'Turn off' : 'Turn on'} ${label}`}
      className={`w-11 h-6 rounded-full flex-shrink-0 transition relative ${
        on ? 'bg-purple-500' : 'bg-white/[0.12]'
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
          on ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  );
}

export default function ContactPreferencesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving]   = React.useState(false);
  const [error, setError]     = React.useState('');
  const [toast, setToast]     = React.useState('');
  const [status, setStatus]   = React.useState(null);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  const load = React.useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data, error: rpcError } = await supabase.rpc('get_my_contact_status');
    setLoading(false);
    if (rpcError) { setError('Could not load your preferences. Try again shortly.'); return; }
    setError('');
    setStatus(data);
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

  // Optimistic, then reconciled from the server. If the write fails the
  // reload puts the real state back rather than leaving a toggle lying.
  const setArtist = async (artistId, optedIn, name) => {
    setStatus(s => ({
      ...s,
      artists: (s.artists || []).map(a =>
        a.artist_id === artistId ? { ...a, opted_in: optedIn } : a),
    }));
    const { error: rpcError } = await supabase.rpc('set_artist_contact_optin', {
      p_artist_id: artistId, p_opted_in: optedIn,
    });
    if (rpcError) { showToast('Could not save that'); load(); return; }
    showToast(optedIn ? `${name} can contact you again` : `${name} can no longer contact you`);
  };

  const setAll = async (optedIn) => {
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('set_all_contact_optin', { p_opted_in: optedIn });
    setSaving(false);
    if (rpcError) { showToast('Could not save that'); return; }
    showToast(optedIn ? 'Opted back in' : 'Opted out of everything');
    load();
  };

  if (!user) {
    return (
      <div className="pt-10 px-4 text-center">
        <p className="text-sm text-white/50">Log in to manage your contact preferences.</p>
      </div>
    );
  }

  const artists  = status?.artists || [];
  const emailOn  = status?.email_subscribed !== false;
  const anyOn    = emailOn || artists.some(a => a.opted_in);

  return (
    <div className="pt-4 pb-32 px-4 md:px-8">
      <Helmet><title>Contact Preferences</title><meta name="robots" content="noindex, nofollow" /></Helmet>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/hub'))}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Contact Preferences</h1>
          <p className="text-xs text-white/30">Who can email you, and about what.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
      ) : error ? (
        <p className="text-sm text-red-400 py-8">{error}</p>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center flex-shrink-0">
                <Mail className="w-4 h-4 text-cyan-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Feelz Machine updates</p>
                <p className="text-xs text-white/35 truncate">{status?.email || 'No email on your account'}</p>
              </div>
              <Toggle on={emailOn} label="platform email" onChange={(v) => setAll(v)} />
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Artists who hold you as a contact</p>
              {artists.length > 0 && (
                <button onClick={() => setAll(!anyOn)} disabled={saving}
                  className="text-xs font-semibold text-purple-300 hover:text-purple-200 transition disabled:opacity-40">
                  {saving ? 'Saving...' : anyOn ? 'Opt out of everything' : 'Opt back in to everything'}
                </button>
              )}
            </div>

            {artists.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center">
                <p className="text-sm text-white/40">No artist has you as a contact.</p>
                <p className="text-xs text-white/25 mt-1">Following an artist adds you to their list.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {artists.map(a => (
                  <div key={a.artist_id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border transition ${
                      a.opted_in
                        ? 'bg-white/[0.03] border-white/[0.07]'
                        : 'bg-white/[0.01] border-white/[0.04]'
                    }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      a.opted_in ? 'bg-purple-500/15 border border-purple-400/20' : 'bg-white/[0.05]'
                    }`}>
                      {a.opted_in
                        ? <Check className="w-3.5 h-3.5 text-purple-300" />
                        : <X className="w-3.5 h-3.5 text-white/25" />}
                    </div>
                    <p className={`text-sm truncate flex-1 ${a.opted_in ? 'text-white' : 'text-white/40'}`}>
                      {a.artist_name}
                    </p>
                    <Toggle on={a.opted_in} label={a.artist_name}
                      onChange={(v) => setArtist(a.artist_id, v, a.artist_name)} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-white/25 leading-relaxed">
            Opting out stops an artist contacting you. It does not unfollow them,
            and it does not remove your listening history.
          </p>
        </div>
      )}
    </div>
  );
}