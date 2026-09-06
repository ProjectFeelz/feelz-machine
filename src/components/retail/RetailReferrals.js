// src/components/retail/RetailReferrals.js
//
// Referrals, inside Feelz Retail.
//
// A venue referring another venue is a real feature: 'venue' is a valid
// role on the affiliates table and netlify/functions/affiliate-track.js
// already handles venue applications. The only way in, though, was a
// dollar-sign button in the retail header that navigated to /affiliates,
// which renders inside AppLayout, so a venue was dropped into the main
// Feelz Machine app with its sidebar. Retail is a separate product, so
// that link was removed and this replaces it.
//
// No new backend. It uses the same apply endpoint the main app uses and
// reads the same affiliates row.
//
// WHY VENUES ARE "PENDING" AND ARTISTS ARE NOT
//
// affiliate-track applies thresholds to artists and listeners (published
// tracks, follows, streams) and cannot for a venue, which has no such
// history. So a venue application is created as pending for a person to
// approve rather than auto-activated. That is a deliberate B2B decision,
// not a failure, and the copy here says so plainly instead of leaving a
// venue staring at a status they cannot act on.

import React from 'react';
import { Loader, Link2, Check, TrendingUp, Users, DollarSign, Clock } from 'lucide-react';
import { supabase } from '../../supabaseClient';

export default function RetailReferrals({ venue, user, onClose }) {
  const [loading, setLoading] = React.useState(true);
  const [affiliate, setAffiliate] = React.useState(null);
  const [applying, setApplying] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('affiliates')
      .select('ref_code, status, total_clicks, total_signups, total_conversions, total_earned_usd, pending_usd, credits_balance')
      .eq('user_id', user.id)
      .maybeSingle();
    setAffiliate(data);
    setLoading(false);
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

  const apply = async () => {
    setApplying(true);
    setError('');
    try {
      const res = await fetch('/.netlify/functions/affiliate-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', userId: user.id }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else { setAffiliate(data.affiliate); load(); }
    } catch {
      setError('Could not apply just now. Try again shortly.');
    }
    setApplying(false);
  };

  // The referral link points at the retail landing page, not the main app.
  // Sending a prospective venue to feelzmachine.com would be the same
  // mistake as the button this screen replaces.
  const refUrl = affiliate?.ref_code
    ? `${window.location.origin}/retail?ref=${affiliate.ref_code}`
    : '';

  const copy = async () => {
    try { await navigator.clipboard.writeText(refUrl); } catch { /* clipboard blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const Stat = ({ icon: Icon, label, value }) => (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
      <Icon className="w-3.5 h-3.5 text-purple-300/60 mb-1.5" />
      <p className="text-lg font-black text-white leading-none">{value}</p>
      <p className="text-[10px] text-white/35 mt-1">{label}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(30,20,60,0.98) 0%, rgba(14,14,18,0.99) 100%)',
          border: '1px solid rgba(167,139,250,0.22)',
        }}
        onClick={e => e.stopPropagation()}>

        <div className="p-5 border-b border-white/[0.06]">
          <p className="text-[10px] uppercase tracking-[0.2em] text-purple-400 font-bold mb-1.5">Feelz Retail</p>
          <p className="text-lg font-bold text-white leading-tight">Refer another venue</p>
          <p className="text-xs text-white/40 mt-1">
            Know a shop, cafe or bar that needs music sorted? Send them your link.
          </p>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
          ) : !affiliate ? (
            <>
              <p className="text-sm text-white/60 leading-relaxed mb-4">
                Venue referrals are reviewed by a person rather than approved automatically,
                so this goes in as an application. We will come back to you.
              </p>
              {error && <p className="text-xs text-amber-300 mb-3">{error}</p>}
              <button onClick={apply} disabled={applying}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-white transition disabled:opacity-40">
                {applying ? <Loader className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Apply to refer venues
              </button>
            </>
          ) : affiliate.status === 'pending' ? (
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-amber-300/70 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-200">Application received</p>
                <p className="text-xs text-white/40 mt-1 leading-relaxed">
                  Venue referrals are approved by a person, not a threshold. Once yours is
                  approved your link and earnings will appear here.
                </p>
              </div>
            </div>
          ) : affiliate.status === 'suspended' ? (
            <p className="text-sm text-white/50">
              This referral account is paused. Get in touch if that looks wrong.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <Stat icon={Users}      label="Signups"    value={affiliate.total_signups || 0} />
                <Stat icon={TrendingUp} label="Conversions" value={affiliate.total_conversions || 0} />
                <Stat icon={Link2}      label="Link clicks" value={affiliate.total_clicks || 0} />
                <Stat icon={DollarSign} label="Earned"      value={`$${affiliate.total_earned_usd || '0.00'}`} />
              </div>

              <p className="text-[10px] uppercase tracking-wide text-white/35 font-bold mb-2">Your link</p>
              <div className="flex items-center gap-2">
                <input readOnly value={refUrl}
                  onFocus={e => e.target.select()}
                  className="flex-1 min-w-0 bg-white/[0.06] rounded-lg px-3 py-2.5 text-xs text-white/70 outline-none border border-white/[0.06]" />
                <button onClick={copy}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-white transition flex-shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {(affiliate.pending_usd > 0) && (
                <p className="text-[11px] text-white/35 mt-3">
                  ${affiliate.pending_usd} pending, paid once confirmed.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}