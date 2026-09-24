// src/pages/AdminGuardianConsents.js
//
// The "verify afterwards" half of parent and guardian consent.
//
// A typed name in a form is a claim. What makes the record worth having is an
// adult on the other end of a phone or an email confirming it, and that being
// written down with who checked and when. Until that happens the artist's
// music cannot be sold: see artist_can_sell in migration 174 and the check in
// netlify/functions/paypal-order.js.
//
// Reads through admin_guardian_consents(), not the table, so the browser never
// holds a policy that can read every minor's guardian details.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import useGoBack from '../hooks/useGoBack';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, Loader, ShieldCheck, Clock, XCircle, Mail, Phone, Copy,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const TABS = [
  { key: 'pending',  label: 'To check' },
  { key: 'verified', label: 'Confirmed' },
  { key: 'rejected', label: 'Turned down' },
];

function Row({ c, onVerify, busy }) {
  const [note, setNote] = React.useState(c.admin_note || '');
  const [open, setOpen] = React.useState(false);

  const copy = (v) => { try { navigator.clipboard.writeText(v); } catch {} };

  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{c.artist_name}</p>
          <p className="text-[11px] text-white/35 mt-0.5">
            {c.minor_full_name} · {c.age_years} years old
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${
          c.status === 'verified' ? 'bg-green-500/15 text-green-300'
          : c.status === 'rejected' ? 'bg-red-500/15 text-red-300'
          : 'bg-amber-500/15 text-amber-300'}`}>
          {c.status === 'verified' ? 'Confirmed' : c.status === 'rejected' ? 'Turned down' : 'To check'}
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] text-white/50">
          <span className="text-white/30">Guardian</span> {c.guardian_name} ({c.guardian_relationship})
        </p>
        <button onClick={() => copy(c.guardian_email)}
          className="flex items-center space-x-1.5 text-[11px] text-white/50 hover:text-white/80 transition">
          <Mail className="w-3 h-3 text-white/25" />
          <span>{c.guardian_email}</span>
          <Copy className="w-2.5 h-2.5 text-white/20" />
        </button>
        {c.guardian_phone && (
          <button onClick={() => copy(c.guardian_phone)}
            className="flex items-center space-x-1.5 text-[11px] text-white/50 hover:text-white/80 transition">
            <Phone className="w-3 h-3 text-white/25" />
            <span>{c.guardian_phone}</span>
            <Copy className="w-2.5 h-2.5 text-white/20" />
          </button>
        )}
        <p className="text-[10px] text-white/25">
          Signed "{c.signed_name}" on {new Date(c.consented_at).toLocaleDateString()}
        </p>
      </div>

      <button onClick={() => setOpen(o => !o)}
        className="text-[10px] text-white/30 hover:text-white/60 transition">
        {open ? 'Hide what they agreed to' : 'What they agreed to'}
      </button>
      {open && (
        <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06]">
          <p className="text-[10px] text-white/40 leading-relaxed">{c.consent_text}</p>
        </div>
      )}

      {c.status === 'pending' ? (
        <>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What you did to check, or why not. The artist sees this on a turn down."
            className="w-full px-3 py-2 bg-white/[0.06] rounded-lg text-white text-[11px] outline-none border border-white/[0.06] focus:border-white/20"
          />
          <div className="flex space-x-2">
            <button disabled={busy} onClick={() => onVerify(c.id, true, note)}
              className="flex-1 py-2.5 rounded-xl bg-green-500/15 border border-green-500/25 text-green-300 text-xs font-bold disabled:opacity-30">
              Confirmed, open sales
            </button>
            <button disabled={busy} onClick={() => onVerify(c.id, false, note)}
              className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-bold disabled:opacity-30">
              Could not confirm
            </button>
          </div>
        </>
      ) : (
        <p className="text-[10px] text-white/25">
          {c.status === 'verified' ? 'Confirmed' : 'Turned down'}
          {c.verified_at ? ` ${new Date(c.verified_at).toLocaleDateString()}` : ''}
          {c.admin_note ? ` · ${c.admin_note}` : ''}
        </p>
      )}
    </div>
  );
}

export default function AdminGuardianConsents() {
  const navigate = useNavigate();
  // Back to wherever you came from, which is the Hub for anyone who tapped
  // the card there, not a hardcoded /admin.
  const goBack = useGoBack('/hub');
  const { isAdmin } = useAuth();

  const [tab, setTab]         = React.useState('pending');
  const [rows, setRows]       = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy]       = React.useState(false);
  const [toast, setToast]     = React.useState('');

  React.useEffect(() => { if (!isAdmin) navigate('/hub'); }, [isAdmin, navigate]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_guardian_consents', { p_status: tab });
    if (error) {
      console.error('[AdminGuardianConsents] read failed:', error.code, error.message);
      setToast(error.message);
    }
    setRows(data || []);
    setLoading(false);
  }, [tab]);

  React.useEffect(() => { load(); }, [load]);

  const verify = async (id, ok, note) => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_verify_guardian_consent', {
      p_consent_id: id, p_verified: ok, p_note: note || null,
    });
    setBusy(false);
    if (error) { setToast(error.message); return; }
    setToast(ok ? 'Confirmed. Their music can be sold.' : 'Turned down. The artist has been told.');
    setTimeout(() => setToast(''), 3000);
    load();
  };

  return (
    <div className="min-h-screen bg-black text-white pb-28">
      <Helmet><title>Guardian consents</title><meta name="robots" content="noindex" /></Helmet>

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm bg-white/10 border border-white/15">
          {toast}
        </div>
      )}

      <div className="flex items-center space-x-3 px-5 pt-6 pb-2 max-w-5xl mx-auto w-full">
        <button onClick={goBack}
          className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-white/60" />
        </button>
        <h1 className="text-lg font-black">Guardian consents</h1>
      </div>

      <p className="px-5 text-[11px] text-white/30 leading-relaxed max-w-3xl mx-auto w-full mb-4">
        An artist under 18 cannot sell until a parent or guardian has consented and someone here
        has confirmed it. Contact the guardian on the details below, then mark it. Nothing else
        about their account is affected either way.
      </p>

      <div className="flex space-x-2 px-5 mb-4 max-w-5xl mx-auto w-full">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition ${
              tab === t.key ? 'bg-white text-black' : 'bg-white/[0.06] text-white/50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-5 max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {loading ? (
          <div className="flex justify-center py-10"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-10 space-y-2">
            {tab === 'pending'
              ? <ShieldCheck className="w-6 h-6 text-white/15" />
              : tab === 'verified' ? <Clock className="w-6 h-6 text-white/15" />
              : <XCircle className="w-6 h-6 text-white/15" />}
            <p className="text-sm text-white/30">Nothing here.</p>
          </div>
        ) : (
          rows.map(c => <Row key={c.id} c={c} onVerify={verify} busy={busy} />)
        )}
      </div>
    </div>
  );
}