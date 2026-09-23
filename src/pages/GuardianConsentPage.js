// src/pages/GuardianConsentPage.js
//
// Date of birth, and for anyone under 18, parent or guardian consent.
//
// WHY IT IS A PAGE AND NOT A FIELD IN SETTINGS
//
// A consent is a thing a second person does. It is meant to be handed to a
// parent with the phone unlocked, so it needs the whole screen, the wording
// in front of them, and no other controls to touch by accident. It also needs
// its own URL so it can be linked to from the banner on the dashboard and
// from an admin asking someone to redo it.
//
// WHAT IT GATES
//
// Nothing about uploading, publishing, being played or being followed. Only
// selling: an artist under 18 with no verified consent cannot take money.
// See migration 174 and the check in netlify/functions/paypal-order.js.
//
// The consent wording is stored verbatim on the row (consent_text), so this
// string can be changed later without rewriting what anybody already agreed
// to. Change it here and every consent from then on records the new words.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Loader, ShieldCheck, Clock, AlertTriangle, Check } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const COMPANY = 'Feelz Machine';

const CONSENT_TEXT =
  `I am the parent or legal guardian of the artist named above. ` +
  `I have read the Terms of Use and the Privacy Policy. ` +
  `I consent to them holding an artist account on ${COMPANY}, to their music being published there, ` +
  `and to ${COMPANY} contacting me about that account. ` +
  `I understand that any money their music earns is paid to the PayPal account on file and that I am responsible for it. ` +
  `I understand I can withdraw this consent at any time by contacting ${COMPANY}, and that the account's sales will stop when I do.`;

const inputCls =
  'w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition border border-white/[0.06] focus:border-white/20';

function Label({ children, hint }) {
  return (
    <div className="mb-1.5">
      <p className="text-[11px] font-semibold text-white/50">{children}</p>
      {hint && <p className="text-[10px] text-white/25 mt-0.5">{hint}</p>}
    </div>
  );
}

// Turns whatever the database says into a sentence, rather than showing a
// Postgres message with an error code on it.
function readableError(err) {
  const m = err?.message || '';
  if (!m) return 'That did not save. Try again in a moment.';
  return m.replace(/^ERROR:\s*/i, '');
}

export default function GuardianConsentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading]   = React.useState(true);
  const [saving,  setSaving]    = React.useState(false);
  const [artist,  setArtist]    = React.useState(null);
  const [consent, setConsent]   = React.useState(null);
  const [error,   setError]     = React.useState('');
  const [done,    setDone]      = React.useState('');

  const [dob, setDob] = React.useState('');
  const [form, setForm] = React.useState({
    minorName: '', guardianName: '', relationship: '',
    guardianEmail: '', guardianPhone: '', signedName: '', agreed: false,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const load = React.useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data: a, error: aErr } = await supabase
      .from('artists')
      .select('id, artist_name, date_of_birth')
      .eq('user_id', user.id)
      .maybeSingle();
    if (aErr) console.error('[GuardianConsent] artist read failed:', aErr.code, aErr.message);
    setArtist(a || null);
    if (a?.date_of_birth) setDob(a.date_of_birth);

    if (a?.id) {
      // RLS lets an artist read only their own rows, so this needs no filter
      // beyond the artist id, and gets nothing at all if somebody else's id
      // is put in the URL.
      const { data: c, error: cErr } = await supabase
        .from('artist_guardian_consents')
        .select('id, status, guardian_name, guardian_relationship, guardian_email, consented_at, verified_at, admin_note')
        .eq('artist_id', a.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (cErr) console.error('[GuardianConsent] consent read failed:', cErr.code, cErr.message);
      setConsent(c?.[0] || null);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

  // Worked out in the browser only to decide which half of the page to show.
  // The real decision is made in the database by artist_is_minor.
  const isMinor = React.useMemo(() => {
    if (!dob) return null;
    const d = new Date(dob + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    const eighteen = new Date();
    eighteen.setFullYear(eighteen.getFullYear() - 18);
    return d > eighteen;
  }, [dob]);

  const saveDob = async () => {
    setError(''); setDone(''); setSaving(true);
    const { data, error: e } = await supabase.rpc('set_own_date_of_birth', { p_dob: dob });
    setSaving(false);
    if (e) { setError(readableError(e)); return; }
    await load();
    setDone(data
      ? 'Saved. Because you are under 18, a parent or guardian needs to fill in the rest of this page before your music can be sold.'
      : 'Saved. Nothing else is needed.');
  };

  const submit = async () => {
    setError(''); setDone('');
    if (!form.agreed) { setError('The box at the bottom has to be ticked by the parent or guardian.'); return; }
    setSaving(true);
    const { error: e } = await supabase.rpc('submit_guardian_consent', {
      p_minor_full_name:       form.minorName,
      p_minor_date_of_birth:   dob,
      p_guardian_name:         form.guardianName,
      p_guardian_relationship: form.relationship,
      p_guardian_email:        form.guardianEmail,
      p_guardian_phone:        form.guardianPhone || null,
      p_signed_name:           form.signedName,
      p_consent_text:          CONSENT_TEXT,
    });
    setSaving(false);
    if (e) { setError(readableError(e)); return; }
    await load();
    setDone('Thank you. We will contact the parent or guardian on the details given, and the account will be opened for sales once we have.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 animate-spin text-white/20" />
      </div>
    );
  }

  if (!user || !artist) {
    return (
      <div className="min-h-screen bg-black text-white px-5 pt-20">
        <p className="text-sm text-white/50">Sign in with the artist account this is for.</p>
      </div>
    );
  }

  const status = consent?.status || null;

  return (
    <div className="min-h-screen bg-black text-white pb-28">
      <Helmet>
        <title>Parent or guardian consent · {COMPANY}</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="flex items-center space-x-3 px-5 pt-6 pb-4">
        <button onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <h1 className="text-lg font-black">Age and consent</h1>
      </div>

      <div className="px-5 space-y-5 max-w-lg">
        {/* ── Where this account stands ── */}
        {status === 'verified' && (
          <div className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-green-500/10 border border-green-500/20">
            <ShieldCheck className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-300">Consent confirmed</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                {consent.guardian_name} ({consent.guardian_relationship}) consented, and we confirmed it.
                Selling is open on this account.
              </p>
            </div>
          </div>
        )}
        {status === 'pending' && (
          <div className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Waiting on us</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                {consent.guardian_name} has consented. We contact them on the details given before
                opening sales. Everything else on the account works as normal in the meantime.
              </p>
            </div>
          </div>
        )}
        {status === 'rejected' && (
          <div className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">We could not confirm this</p>
              <p className="text-[11px] text-white/40 mt-0.5">
                {consent.admin_note || 'Check the details and fill it in again.'}
              </p>
            </div>
          </div>
        )}

        {/* ── Date of birth ── */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <Label hint="Asked once. It is only used to work out whether a parent or guardian needs to agree to this account.">
            Your date of birth
          </Label>
          <div className="flex items-center space-x-2">
            <input type="date" value={dob} max={new Date().toISOString().slice(0, 10)}
              onChange={e => setDob(e.target.value)} className={inputCls} />
            <button onClick={saveDob} disabled={!dob || saving}
              className="px-4 py-2.5 rounded-lg bg-white text-black text-xs font-bold disabled:opacity-30 flex-shrink-0">
              {saving ? '…' : 'Save'}
            </button>
          </div>
          {isMinor === false && (
            <p className="text-[11px] text-white/30 mt-2">18 or over, so nothing else on this page applies to you.</p>
          )}
        </div>

        {/* ── The consent itself ── */}
        {isMinor === true && status !== 'pending' && status !== 'verified' && (
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-4">
            <div>
              <p className="text-sm font-bold text-white">For the parent or guardian</p>
              <p className="text-[11px] text-white/35 mt-1 leading-relaxed">
                This part is for the adult responsible for the artist. Fill it in on their behalf,
                with them present. We will contact you on the details you give before any of their
                music can be sold.
              </p>
            </div>

            <div>
              <Label hint="As it appears on their school or ID documents, not their artist name.">
                The artist's full name
              </Label>
              <input className={inputCls} value={form.minorName}
                onChange={e => set('minorName', e.target.value)} placeholder="Full name" />
            </div>

            <div>
              <Label>Your full name</Label>
              <input className={inputCls} value={form.guardianName}
                onChange={e => set('guardianName', e.target.value)} placeholder="Parent or guardian" />
            </div>

            <div>
              <Label>Your relationship to them</Label>
              <input className={inputCls} value={form.relationship}
                onChange={e => set('relationship', e.target.value)}
                placeholder="Mother, father, legal guardian" />
            </div>

            <div>
              <Label hint="We will use this to confirm the consent. Use an address you check.">
                Your email address
              </Label>
              <input className={inputCls} type="email" value={form.guardianEmail}
                onChange={e => set('guardianEmail', e.target.value)} placeholder="you@example.com" />
            </div>

            <div>
              <Label hint="Optional, but it makes confirming this much faster.">Your phone number</Label>
              <input className={inputCls} value={form.guardianPhone}
                onChange={e => set('guardianPhone', e.target.value)} placeholder="+27 …" />
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06]">
              <p className="text-[11px] text-white/45 leading-relaxed">{CONSENT_TEXT}</p>
            </div>

            <div>
              <Label hint="Typing your name here stands for your signature.">Sign by typing your name</Label>
              <input className={inputCls} value={form.signedName}
                onChange={e => set('signedName', e.target.value)} placeholder="Your full name again" />
            </div>

            <button onClick={() => set('agreed', !form.agreed)}
              className="flex items-start space-x-2.5 text-left w-full">
              <span className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border ${
                form.agreed ? 'bg-white border-white' : 'border-white/25'}`}>
                {form.agreed && <Check className="w-3 h-3 text-black" />}
              </span>
              <span className="text-[11px] text-white/50 leading-relaxed">
                I am the parent or legal guardian named above and I agree to everything in the box.
              </span>
            </button>

            {error && <p className="text-[11px] text-red-400">{error}</p>}

            <button onClick={submit} disabled={saving}
              className="w-full py-3 rounded-xl bg-white text-black text-sm font-bold disabled:opacity-30">
              {saving ? 'Sending…' : 'Give consent'}
            </button>
          </div>
        )}

        {done && <p className="text-[11px] text-green-400 leading-relaxed">{done}</p>}
        {error && isMinor !== true && <p className="text-[11px] text-red-400">{error}</p>}

        <p className="text-[10px] text-white/20 leading-relaxed">
          We do not ask for an ID or passport number and you should not send one. A name, a
          relationship and a contact that answers is what this needs.
        </p>
      </div>
    </div>
  );
}