// src/pages/SessionsEntryConsentPage.js
//
// /sessions/entry-consent/:token
//
// The page a parent or guardian opens from the email sent when someone under
// 18 enters Sessions. No account, one screen: who, which song, a name and a
// tick. Same plain style as the prize consent page.

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const REFUSALS = {
  unknown_link:   'This link is not valid. Ask Feelz Machine to send it again.',
  already_signed: 'This has already been confirmed. Nothing more to do.',
  name_required:  'Please type your full name.',
};

const field =
  'w-full px-4 py-3.5 bg-white/[0.06] rounded-xl text-white text-base outline-none ' +
  'focus:bg-white/[0.1] transition placeholder:text-white/25';

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-black text-white px-5 py-10 overflow-y-auto">
      <div className="max-w-md mx-auto">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-white/40">{label}</span>
      <span className="text-base text-white text-right">{value}</span>
    </div>
  );
}

export default function SessionsEntryConsentPage() {
  const { token } = useParams();

  const [state, setState]   = useState('loading'); // loading | ready | signed | invalid
  const [info, setInfo]     = useState(null);
  const [name, setName]     = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('sessions_entry_consent_view', { p_token: token });
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
    const { data, error: err } = await supabase.rpc('sessions_entry_consent_sign', {
      p_token: token,
      p_signed_name: name,
    });
    setSaving(false);
    if (err) { setError('Something went wrong on our side. Try again in a minute.'); return; }
    if (data !== 'signed') { setError(REFUSALS[data] || 'That did not go through. Try again.'); return; }
    await load();
  };

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
        <div className="rounded-2xl border border-lime-400/30 bg-lime-400/[0.07] p-6">
          <h1 className="text-2xl font-bold mb-3">Thank you, that is done</h1>
          <p className="text-white/70 leading-relaxed">
            {info.entrant_name}&apos;s entry is confirmed. There is nothing else for you to do.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-xs font-bold uppercase tracking-widest text-lime-300/70 mb-2">Feelz Machine Sessions</p>
      <h1 className="text-3xl font-bold leading-tight mb-5">
        Confirm {info.entrant_name}&apos;s entry
      </h1>

      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 space-y-2.5 mb-6">
        <Row label="Who" value={info.entrant_name} />
        <Row label="Song" value={info.song_title || '-'} />
        <Row label="Competition" value={info.competition_title} />
        <Row label="Guardian on file" value={info.guardian_name || 'you'} />
      </div>

      <div className="space-y-4 text-white/70 leading-relaxed mb-7">
        <p>
          {info.entrant_name} has entered a music competition on Feelz Machine. Because they are under 18,
          a parent or guardian has to confirm they may take part and be contacted about it.
        </p>
        <p className="text-white/50 text-sm">
          If you did not know about this entry and do not agree, simply close this page. It will not go forward.
        </p>
      </div>

      <div className="space-y-3">
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
            className="mt-1 w-5 h-5 accent-lime-400 flex-shrink-0"
          />
          <span className="text-sm text-white/60 leading-relaxed">
            I am {info.entrant_name}&apos;s parent or guardian, and I agree to them entering Sessions and being contacted about it.
          </span>
        </label>

        {error && <p className="text-sm text-red-300">{error}</p>}

        <button
          onClick={sign}
          disabled={saving}
          className="w-full py-4 rounded-xl bg-lime-400 text-black font-semibold text-base disabled:opacity-50">
          {saving ? 'Sending...' : 'Confirm'}
        </button>
      </div>
    </Shell>
  );
}
