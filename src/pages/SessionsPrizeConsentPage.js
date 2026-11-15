// src/pages/SessionsPrizeConsentPage.js
//
// /sessions/prize-consent/:token
//
// The page a parent or guardian opens to sign for a prize won by someone under
// 18. It is the only screen on this platform built for a person who has no
// account, will never make one, and has probably never heard of Feelz Machine.
//
// Everything about it follows from that.
//
// No sign in, no app download, no jargon. One screen, three fields, a button.
// It names the child, the song and the amount up front, because the first
// question in a parent's head is "is this real", and the fastest way to answer
// it is to show them something only a real sender would know.
//
// It does not look like the rest of the app. The app is for artists who want a
// dashboard. This is for a mother in a taxi reading on a cracked screen in
// daylight, so it is large type, high contrast, one column, nothing that
// moves.

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const money = (amount, currency) =>
  `${currency === 'ZAR' ? 'R' : (currency || '') + ' '}${Number(amount || 0).toLocaleString('en-ZA')}`;

// The reasons the signing function can refuse, said the way a person would say
// them. A raw code on this screen would end the whole thing.
const REFUSALS = {
  unknown_link:   'This link is not valid. Ask Feelz Machine to send it again.',
  already_signed: 'This has already been signed. Nothing more to do.',
  name_required:  'Please type your full name.',
  email_invalid:  'That does not look like a complete email address. Check it and try again.',
};

const field =
  'w-full px-4 py-3.5 bg-white/[0.06] rounded-xl text-white text-base outline-none ' +
  'focus:bg-white/[0.1] transition placeholder:text-white/25';

export default function SessionsPrizeConsentPage() {
  const { token } = useParams();

  const [state, setState]   = useState('loading'); // loading | ready | signed | invalid
  const [info, setInfo]     = useState(null);
  const [paypal, setPaypal] = useState('');
  const [name, setName]     = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('sessions_prize_consent_view', { p_token: token });
    if (err) { setState('invalid'); return; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) { setState('invalid'); return; }
    setInfo(row);
    setState(row.already_signed ? 'signed' : 'ready');
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const sign = async () => {
    setError('');
    if (!agreed) { setError('Please tick the box to confirm.'); return; }
    setSaving(true);
    const { data, error: err } = await supabase.rpc('sessions_prize_consent_sign', {
      p_token: token,
      p_paypal_email: paypal,
      p_signed_name: name,
    });
    setSaving(false);
    if (err) { setError('Something went wrong on our side. Try again in a minute.'); return; }
    if (data !== 'signed') { setError(REFUSALS[data] || 'That did not go through. Try again.'); return; }
    await load();
  };

  const Shell = ({ children }) => (
    <div
      className="min-h-screen bg-black text-white px-5 py-10 overflow-y-auto"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <style>{`.consent-wrap::-webkit-scrollbar{display:none}`}</style>
      <div className="consent-wrap max-w-md mx-auto">{children}</div>
    </div>
  );

  if (state === 'loading') {
    return <Shell><p className="text-white/40 text-sm">One moment.</p></Shell>;
  }

  if (state === 'invalid') {
    return (
      <Shell>
        <h1 className="text-2xl font-bold mb-3">This link is not valid</h1>
        <p className="text-white/60 leading-relaxed">
          It may have been typed in by hand, or it may be out of date. Ask Feelz Machine to send it to you again.
        </p>
      </Shell>
    );
  }

  if (state === 'signed') {
    return (
      <Shell>
        <div className="rounded-2xl border border-indigo-400/30 bg-indigo-500/[0.07] p-6">
          <h1 className="text-2xl font-bold mb-3">Thank you, that is done</h1>
          <p className="text-white/70 leading-relaxed">
            You have signed for {info.entrant_name}&apos;s prize. We have what we need and there is nothing else for you to do.
          </p>
          <p className="text-white/50 text-sm mt-4 leading-relaxed">
            The money goes out by PayPal once the competition is finished. If anything changes, Feelz Machine will contact you on the number they already have.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-indigo-300/70 mb-2">Feelz Machine Sessions</p>
      <h1 className="text-3xl font-bold leading-tight mb-5">
        {info.is_winner ? `${info.entrant_name} has won` : `About ${info.entrant_name}'s prize`}
      </h1>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-2.5 mb-6">
        <Row label="Who" value={info.entrant_name} />
        <Row label="Song" value={info.song_title} />
        <Row label="Prize" value={money(info.prize_amount, info.prize_currency)} />
        <Row label="Guardian on file" value={info.guardian_name || 'you'} />
      </div>

      <div className="space-y-4 text-white/70 leading-relaxed mb-7">
        <p>
          {info.entrant_name} is under 18, so the prize money cannot go to them directly. It has to go to a parent or guardian, and that is you.
        </p>
        <p>
          We need two things from you. Where the money should be sent, and your name, to show you agreed to receive it on their behalf.
        </p>
        <p className="text-white/50 text-sm">
          The money is sent by PayPal. If you do not have a PayPal address, it is free to open one at paypal.com and takes a few minutes. Use the email address you open it with.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm text-white/50 mb-1.5">PayPal email address</label>
          <input
            className={field}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={paypal}
            onChange={e => { setPaypal(e.target.value); setError(''); }}
          />
        </div>

        <div>
          <label className="block text-sm text-white/50 mb-1.5">Your full name</label>
          <input
            className={field}
            placeholder="First and last name"
            autoComplete="name"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
          />
        </div>

        <label className="flex items-start space-x-3 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => { setAgreed(e.target.checked); setError(''); }}
            className="mt-1 w-5 h-5 accent-indigo-400 flex-shrink-0"
          />
          <span className="text-sm text-white/60 leading-relaxed">
            I am {info.entrant_name}&apos;s parent or guardian, and I agree to receive their prize money for them.
          </span>
        </label>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <button
          onClick={sign}
          disabled={saving}
          className="w-full py-4 rounded-xl bg-indigo-500 text-white font-semibold text-base disabled:opacity-50">
          {saving ? 'Sending...' : 'Sign and send'}
        </button>

        <p className="text-xs text-white/25 text-center leading-relaxed pt-1">
          Signing does not move any money on its own. Feelz Machine sends it after the competition closes.
        </p>
      </div>
    </Shell>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-white/35 flex-shrink-0">{label}</span>
      <span className="text-white font-medium text-right">{value}</span>
    </div>
  );
}
