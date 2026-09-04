// src/pages/AdminRetailStaff.js
// Grant and revoke the retail admin role.
//
// This was SQL-only before: the role had to be handed out by running an
// insert against retail_admins by hand, which meant it either did not
// happen or happened with a copied user id and no record of who granted
// it.
//
// Follows the newsletter editors flow in NewsletterComposePage: look the
// person up by email with admin_find_user_by_email, then insert. That RPC
// is already the established pattern and is itself admin-gated.
//
// Only platform admins can grant this. retail_admins RLS allows writes
// from `admins` only, and a retail admin can read just their own row, so
// a retail admin cannot promote anyone. That is deliberate and the page
// says so, because the natural assumption is the opposite.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, UserPlus, Trash2, Shield } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const inputCls = "w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition";

export default function AdminRetailStaff() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [staff, setStaff] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [toast, setToast] = React.useState('');

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from('retail_admins')
      .select('id, user_id, admin_name, created_at')
      .order('created_at', { ascending: false });

    const rows = data || [];
    // retail_admins has no join to a profile, so names and emails are
    // looked up separately rather than being denormalised onto the role
    // row where they would go stale.
    if (rows.length > 0) {
      const ids = rows.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('user_profiles').select('user_id, name, email').in('user_id', ids);
      const byId = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
      setStaff(rows.map(r => ({ ...r, profile: byId[r.user_id] || null })));
    } else {
      setStaff([]);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (!isAdmin) navigate('/hub');
  }, [isAdmin, navigate]);

  const add = async () => {
    if (!email.trim()) return;
    setAdding(true);

    const { data: foundUserId, error: lookupError } =
      await supabase.rpc('admin_find_user_by_email', { p_email: email.trim() });

    if (lookupError || !foundUserId) {
      setAdding(false);
      showToast('No account found with that email. They need to sign up first.');
      return;
    }

    const { error } = await supabase.from('retail_admins').insert({
      user_id: foundUserId,
      admin_name: name.trim() || null,
    });
    setAdding(false);

    if (error) {
      showToast(error.code === '23505'
        ? 'That person already has retail admin access'
        : 'Error: ' + error.message);
      return;
    }

    setEmail(''); setName('');
    showToast('Retail admin access granted');
    load();
  };

  const revoke = async (row) => {
    const who = row.profile?.name || row.admin_name || row.profile?.email || 'this person';
    if (!window.confirm(`Revoke retail admin access for ${who}?`)) return;
    const { error } = await supabase.from('retail_admins').delete().eq('id', row.id);
    if (error) { showToast('Error: ' + error.message); return; }
    setStaff(prev => prev.filter(s => s.id !== row.id));
    showToast('Access revoked');
  };

  if (!isAdmin) return null;

  return (
    <div className="pt-4 pb-32 px-4 md:px-8">
      <Helmet><title>Retail Staff</title><meta name="robots" content="noindex, nofollow" /></Helmet>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/hub')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Retail Staff</h1>
          <p className="text-xs text-white/30">Who can manage the retail catalogue, venues and ads.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 mb-6 flex items-start gap-3 max-w-3xl">
        <Shield className="w-4 h-4 text-white/25 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-white/40 leading-relaxed">
          Retail staff can see and manage the catalogue, playlists, venues and ads.
          They cannot see revenue, payouts or ad income, and they cannot grant this
          access to anyone else. Only platform admins can do that.
        </p>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mb-8 max-w-3xl">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-3">Grant access</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input className={inputCls} placeholder="Their account email" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} />
          <input className={inputCls} placeholder="Name for your reference (optional)" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} />
        </div>
        <button onClick={add} disabled={!email.trim() || adding}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-white transition disabled:opacity-30">
          {adding ? <Loader className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Grant retail admin
        </button>
        <p className="text-[11px] text-white/25 mt-2.5">
          They must already have a Feelz Machine account. This looks them up by the
          email on that account.
        </p>
      </div>

      <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-3">
        Current retail staff
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
      ) : staff.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center max-w-3xl">
          <p className="text-sm text-white/40">Nobody has retail admin access yet.</p>
          <p className="text-xs text-white/25 mt-1">Platform admins already have it by default.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {staff.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="w-9 h-9 rounded-full bg-purple-500/15 border border-purple-400/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-purple-200/70 font-bold">
                  {(s.profile?.name || s.admin_name || s.profile?.email || '?')[0]?.toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">
                  {s.profile?.name || s.admin_name || 'Unknown account'}
                </p>
                <p className="text-xs text-white/35 truncate">{s.profile?.email || s.user_id}</p>
              </div>
              <button onClick={() => revoke(s)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-red-500/20 transition flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}