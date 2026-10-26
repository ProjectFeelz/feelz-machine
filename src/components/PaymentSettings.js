import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import BillingTrouble from './BillingTrouble';
import {
  DollarSign, Save, Loader, ExternalLink, AlertCircle,
  Check, TrendingUp, Crown, Zap, Star, ChevronRight
} from 'lucide-react';

export default function PaymentSettings() {
  const navigate = useNavigate();
  const { artist } = useAuth();
  const [profile, setProfile] = useState(null);
  const [paypalEmail, setPaypalEmail] = useState('');
  const [paypalMerchantId, setPaypalMerchantId] = useState('');
  const [payoutThreshold,  setPayoutThreshold]  = useState(10);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [hasProfile, setHasProfile] = useState(false);
  const [currentTier, setCurrentTier] = useState(null);
  const [recentPayouts, setRecentPayouts] = useState([]);
  const [earnings, setEarnings] = useState(null);

  // ── Bank account, for being paid in rand ──────────────────────────────────
  //
  // Separate state and a separate save from the PayPal block above, on
  // purpose. These are two different ways of being paid and an artist may
  // have one, the other or both; sharing a save button would mean typing a
  // PayPal address to change a bank account.
  //
  // The account number is never read back from the database, because it is
  // never stored there. Paystack holds it. What comes back is the last four
  // digits, which is enough for somebody to recognise their own account.
  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksError, setBanksError] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMsg, setBankMsg] = useState('');
  const [bankOnFile, setBankOnFile] = useState(null);

  useEffect(() => {
    if (artist) {
      fetchPaymentProfile();
      fetchCurrentTier();
      fetchRecentPayouts();
      fetchEarnings();
    }
  }, [artist]);

  const fetchPaymentProfile = async () => {
    const { data } = await supabase
      .from('artist_payment_profiles')
      .select('*')
      .eq('artist_id', artist.id)
      .single();

    if (data) {
      setProfile(data);
      setPaypalEmail(data.paypal_email || '');
      setPaypalMerchantId(data.paypal_merchant_id || '');
      setPayoutThreshold(data.payout_threshold || 10);
      setHasProfile(true);
      if (data.paystack_subaccount_code) {
        setBankOnFile({
          bankName: data.paystack_bank_name || 'Your bank',
          last4: data.paystack_account_last4 || null,
        });
        setBankCode(data.paystack_bank_code || '');
      }
    }
  };

  // The bank list comes from Paystack rather than a hardcoded array, so a bank
  // being added or renamed is not a deploy. Fetched when the artist opens the
  // section rather than on page load, because most visits here are about
  // something else and the list is a round trip through a third party.
  const loadBanks = async () => {
    if (banks.length || banksLoading) return;
    setBanksLoading(true);
    setBanksError('');
    try {
      const res = await fetch('/.netlify/functions/paystack-subaccount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'banks' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
      setBanks(json.banks || []);
    } catch (err) {
      console.error('[payments] bank list failed:', err.message);
      setBanksError('Could not load the bank list. Your PayPal address still works.');
    } finally {
      setBanksLoading(false);
    }
  };

  const handleSaveBank = async () => {
    const digits = accountNumber.replace(/\s+/g, '');
    if (!bankCode) { setBankMsg('Choose your bank.'); return; }
    if (!/^\d{6,20}$/.test(digits)) { setBankMsg('Enter your account number, digits only.'); return; }

    setBankSaving(true);
    setBankMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/paystack-subaccount', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          action: 'save',
          bankCode,
          bankName: banks.find(b => b.code === bankCode)?.name || null,
          accountNumber: digits,
        }),
      });
      const json = await res.json();
      // Paystack's own wording is the useful one: it says things like
      // "Account number is invalid", where a generic failure sends somebody
      // back to the same form with no idea what to change.
      if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);

      setBankOnFile({ bankName: json.bankName || 'Your bank', last4: json.last4 });
      setAccountNumber('');
      setBankMsg(json.accountName
        ? `Saved. Payouts go to ${json.accountName}.`
        : 'Saved. Your sales will be paid into this account.');
      setTimeout(() => setBankMsg(''), 6000);
    } catch (err) {
      setBankMsg(err.message);
    } finally {
      setBankSaving(false);
    }
  };

  const fetchCurrentTier = async () => {
    try {
      const { data: sub } = await supabase
        .from('artist_tier_subscriptions')
        .select('tier_id')
        .eq('artist_id', artist.id)
        .eq('status', 'active')
        .maybeSingle();
      if (sub?.tier_id) {
        const { data: tierRow } = await supabase
          .from('platform_tiers')
          .select('*')
          .eq('id', sub.tier_id)
          .maybeSingle();
        if (tierRow) { setCurrentTier(tierRow); return; }
      }
      // Fallback to artist.tier
      const { data: artistRow } = await supabase
        .from('artists').select('tier').eq('id', artist.id).maybeSingle();
      const slug = artistRow?.tier || 'free';
      const { data: tierRow } = await supabase
        .from('platform_tiers').select('*').eq('slug', slug).maybeSingle();
      setCurrentTier(tierRow || { slug: 'free', name: 'Free' });
    } catch {
      setCurrentTier({ slug: 'free', name: 'Free' });
    }
  };

  const fetchRecentPayouts = async () => {
    const { data } = await supabase
      .from('payouts')
      .select('*')
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setRecentPayouts(data || []);
  };

  // Real totals from sales, tips, retail and collaborator shares
  // (migration 155). The old counters on the payment profile stopped moving
  // when sales started going straight to the artist's PayPal.
  const fetchEarnings = async () => {
    const { data, error } = await supabase.rpc('artist_earnings_summary', { p_artist_id: artist.id });
    if (!error && data) setEarnings(data);
  };

  const handleSave = async () => {
    // PayPal stopped being compulsory the moment a bank account became a way
    // of being paid. An artist with their bank on file should not have to
    // produce a PayPal address they do not use and may not have, which in
    // South Africa is most of them.
    //
    // It is still required when it is the ONLY payout method, because a seller
    // with neither cannot sell at all: netlify/lib/payee.js refuses the order
    // rather than parking the money in the platform account.
    if (!paypalEmail.trim() && !bankOnFile) {
      setMsg('Add a PayPal email or a bank account, otherwise your music cannot be bought.');
      return;
    }
    if (paypalEmail.trim() && !paypalEmail.includes('@')) {
      setMsg('Enter a valid email address');
      return;
    }

    setSaving(true);
    setMsg('');

    try {
      const payload = {
        artist_id: artist.id,
        // null rather than an empty string when it is left blank. An empty
        // string is a value, and a query asking which artists have a payout
        // method would count it as one.
        paypal_email:   paypalEmail.trim() || null,
        paypal_merchant_id: paypalMerchantId.trim() || null,
        payout_threshold: payoutThreshold,
        updated_at: new Date().toISOString(),
      };

      if (hasProfile) {
        const { error } = await supabase
          .from('artist_payment_profiles')
          .update(payload)
          .eq('artist_id', artist.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('artist_payment_profiles')
          .insert(payload);
        if (error) throw error;
        setHasProfile(true);
      }

      // Write the SAME address to artists.paypal_email too.
      //
      // There are two tables holding a payout email and two screens writing
      // them: this one saves artist_payment_profiles, Profile > Edit saves
      // artists. Which screen an artist happened to use decided whether the
      // payout function could find them, and this is the screen that
      // promises "This is where you'll receive payouts", so it was the worst
      // one to be ignored.
      //
      // process-split-payout now prefers this table and falls back to the
      // other, so writing both means the two can never disagree again
      // whichever screen someone edits.
      const { error: mirrorErr } = await supabase
        .from('artists')
        .update({ paypal_email: paypalEmail.trim() || null })
        .eq('id', artist.id);
      if (mirrorErr) {
        // Not fatal, the payout function reads this table first. Worth
        // knowing about, not worth failing a save the artist just made.
        console.error('[payments] could not mirror payout email to artists:', mirrorErr.message);
      }

      setMsg('Payment settings saved!');
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
    setSaving(false);
  };

  const tierIcon = currentTier?.slug === 'premium' ? Crown
    : currentTier?.slug === 'pro' ? Zap : Star;
  const tierColor = currentTier?.slug === 'premium' ? '#F59E0B'
    : currentTier?.slug === 'pro' ? '#8B5CF6' : '#737373';
  const TierIcon = tierIcon;

  if (!artist) return null;

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {msg}
        </div>
      )}

      {/* A failed subscription payment, while it still matters. Renders
          nothing at all when there is nothing to say, which is almost always. */}
      <BillingTrouble audience="artist" artistId={artist.id} />

      {/* Current tier card */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${tierColor}20` }}>
              <TierIcon className="w-5 h-5" style={{ color: tierColor }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-white capitalize">{currentTier?.name || 'Free'} Plan</p>
              <p className="text-xs text-white/30">
                {currentTier?.slug === 'free'
                  ? '2 singles, basic features'
                  : currentTier?.slug === 'pro'
                    ? 'Unlimited uploads, analytics, collabs'
                    : 'Everything + priority + sales'}
              </p>
            </div>
          </div>
          <button onClick={() => navigate('/upgrade')}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition"
            style={{ backgroundColor: `${tierColor}15`, color: tierColor }}>
            <span>{currentTier?.slug === 'premium' ? 'Manage' : 'Upgrade'}</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Earnings overview */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
          <DollarSign className="w-4 h-4 text-green-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-green-400">${Number(earnings?.earned ?? 0).toFixed(2)}</p>
          <p className="text-[10px] text-white/30">Total Earned</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
          <TrendingUp className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">${Number(earnings?.owed ?? 0).toFixed(2)}</p>
          <p className="text-[10px] text-white/30">Owed to You</p>
        </div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
          <Check className="w-4 h-4 text-blue-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">${Number(earnings?.you_owe ?? 0).toFixed(2)}</p>
          <p className="text-[10px] text-white/30">You Owe Collabs</p>
        </div>
      </div>
      {earnings && (
        <p className="text-[11px] text-white/30 -mt-2 text-center">
          Sales ${Number(earnings.sales).toFixed(2)} · Tips ${Number(earnings.tips).toFixed(2)}{Number(earnings.retail) > 0 ? ` · Retail $${Number(earnings.retail).toFixed(2)}` : ''}
        </p>
      )}

      {/* ── Bank account ────────────────────────────────────────────────────
          Above PayPal deliberately. For a South African artist this is the
          better of the two: the money lands in an ordinary bank account, in
          rand, with no withdrawal step and no conversion. PayPal stays below
          for everyone it suits, and for anyone outside the countries Paystack
          settles into. */}
      <div className="space-y-3">
        {/* The country is in the heading because the list underneath is South
            African banks and nothing else. That is not this component's
            choice: the Paystack business is registered in South Africa, so
            its bank list and its payout currency are both fixed to ZAR.
            Without the label an artist banking anywhere else scrolls a list
            of 33 banks looking for theirs, which is a worse experience than
            being told in three words and using PayPal below. */}
        <h4 className="text-xs font-medium text-white/50">Bank Account (South Africa)</h4>

        {bankOnFile ? (
          <div className="rounded-xl bg-green-500/[0.07] border border-green-500/20 p-3">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-sm text-white">
                {bankOnFile.bankName}
                {bankOnFile.last4 ? <span className="text-white/40"> ending {bankOnFile.last4}</span> : null}
              </p>
            </div>
            <p className="text-[10px] text-white/30 mt-1.5">
              Sales are paid into this account. To change it, enter the new details below.
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-white/35">
            Add a South African bank account and buyers pay you in rand, straight into it.
            Nothing is held in between. Banking elsewhere? Use PayPal below.
          </p>
        )}

        <div>
          <label className="block text-xs text-white/40 mb-1">Bank</label>
          <select
            value={bankCode}
            onFocus={loadBanks}
            onChange={(e) => setBankCode(e.target.value)}
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none"
          >
            <option value="">
              {banksLoading ? 'Loading banks...' : banks.length ? 'Choose your bank' : 'Tap to load banks'}
            </option>
            {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
          {banksError && <p className="text-[10px] text-amber-300/70 mt-1">{banksError}</p>}
        </div>

        <div>
          <label className="block text-xs text-white/40 mb-1">Account number</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder={bankOnFile ? 'Enter a new account number' : 'Your account number'}
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none placeholder-white/20"
          />
          <p className="text-[10px] text-white/20 mt-1">
            Held by our payment provider, not stored here. You will only ever see the last four
            digits.
          </p>
        </div>

        <button
          onClick={handleSaveBank}
          disabled={bankSaving}
          className="w-full py-2.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-50 text-white text-sm font-medium transition flex items-center justify-center gap-2"
        >
          {bankSaving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{bankSaving ? 'Saving...' : bankOnFile ? 'Update bank account' : 'Save bank account'}</span>
        </button>

        {bankMsg && (
          <p className={`text-xs ${/saved/i.test(bankMsg) ? 'text-green-400' : 'text-amber-300'}`}>
            {bankMsg}
          </p>
        )}
      </div>

      {/* PayPal settings */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-white/50">PayPal Settings</h4>

        <div>
          {/* The asterisk went with the bank account arriving. PayPal is one
              of two ways to be paid now, not the only one. */}
          <label className="block text-xs text-white/40 mb-1">
            PayPal Email {bankOnFile
              ? <span className="text-white/25">(optional)</span>
              : <span className="text-white/25">(or add a bank account above)</span>}
          </label>
          <input
            type="email"
            value={paypalEmail}
            onChange={(e) => setPaypalEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none placeholder-white/20"
          />
          <p className="text-[10px] text-white/20 mt-1">
            Buyers pay this PayPal directly when they buy your music
          </p>
        </div>

        <div>
          <label className="block text-xs text-white/40 mb-1 mt-3">PayPal Merchant ID (optional)</label>
          <input
            type="text"
            value={paypalMerchantId}
            onChange={(e) => setPaypalMerchantId(e.target.value)}
            placeholder="Your PayPal merchant ID"
            className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none placeholder-white/20"
          />
          <p className="text-[10px] text-white/20 mt-1">
            Find this in PayPal → Settings → Business Info → Merchant ID
          </p>
        </div>

        {/* The payout threshold is gone. Sales are paid straight into your
            PayPal at the moment of sale, so there is nothing for Feelz
            Machine to hold and no minimum to wait for. */}
      </div>

      {/* Save button */}
      <button onClick={handleSave} disabled={saving}
        className="w-full py-3 bg-white text-black rounded-lg font-semibold text-sm flex items-center justify-center space-x-2 disabled:opacity-50 transition">
        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        <span>{saving ? 'Saving...' : 'Save Payment Settings'}</span>
      </button>

      {/* How a sale reaches you.
       *
       * THE TWO ROUTES DO NOT BEHAVE THE SAME AND THE ARTIST HAS TO BE TOLD
       *
       * They differ in two ways that an artist will notice and, if nobody
       * says so first, will read as a fault:
       *
       *   WHEN. A PayPal sale lands at the moment the fan pays. A rand sale
       *   settles on the card provider's schedule, which is about two days.
       *   An artist who sells on Monday evening and sees nothing on Monday
       *   night writes in asking where their money is.
       *
       *   WHO PAYS THE PROCESSING. Nobody, as far as the artist is
       *   concerned: the buyer covers it on top of the price on both routes,
       *   so the artist receives exactly what their page says either way.
       *   That is not how the rand route started. It took the card fee out
       *   of the artist's share while PayPal grossed up, which meant the
       *   same track paid two different amounts depending on how the fan
       *   happened to pay. Both are grossed up now.
       *
       * A table rather than a paragraph because the question this answers is
       * a comparison, and a comparison written as prose makes the reader hold
       * both halves in their head.
       */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
        <h4 className="text-sm font-semibold text-white mb-1">How a sale reaches you</h4>
        <p className="text-xs text-white/35 mb-3 leading-relaxed">
          A fan chooses how to pay. The two ways do not arrive the same.
        </p>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[380px]">
            <thead>
              <tr className="text-white/35">
                <th className="text-left font-normal py-1.5 pr-2 w-[34%]"> </th>
                <th className="text-left font-semibold py-1.5 pr-2 text-white/60">PayPal</th>
                <th className="text-left font-semibold py-1.5 text-white/60">Rand, by card</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-t border-white/[0.06]">
                <td className="py-2 pr-2 text-white/35">Paid into</td>
                <td className="py-2 pr-2 text-white/55">Your PayPal address</td>
                <td className="py-2 text-white/55">Your bank account</td>
              </tr>
              <tr className="border-t border-white/[0.06]">
                <td className="py-2 pr-2 text-white/35">When it lands</td>
                <td className="py-2 pr-2 text-white/55">As the fan pays</td>
                <td className="py-2 text-white/55">About two days later</td>
              </tr>
              <tr className="border-t border-white/[0.06]">
                <td className="py-2 pr-2 text-white/35">Processing fee</td>
                <td className="py-2 pr-2 text-white/55">The buyer pays it, on top of your price</td>
                <td className="py-2 text-white/55">The buyer pays it, on top of your price</td>
              </tr>
              <tr className="border-t border-white/[0.06]">
                <td className="py-2 pr-2 text-white/35">You end up with</td>
                <td className="py-2 pr-2 text-white/55">Your price in full</td>
                <td className="py-2 text-white/55">Your price in full</td>
              </tr>
              <tr className="border-t border-white/[0.06]">
                <td className="py-2 pr-2 text-white/35">Set it up</td>
                <td className="py-2 pr-2 text-white/55">PayPal email above</td>
                <td className="py-2 text-white/55">Bank account above, South Africa only</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-2 text-xs text-white/40 leading-relaxed mt-3">
          <p>Either way the money is yours and Feelz Machine never holds it. There is no payout to request and no threshold to reach. You need at least one of the two on file, a bank account or a PayPal email, or your music cannot be bought.</p>
          <p>Having both is fine. The fan picks, and you are paid whichever way they chose.</p>
          <p>On both routes the buyer is shown the processing on top of your price before they pay, so they know what the extra is and you receive the number on your page.</p>
          {/* Merch does not have a rand route. netlify/functions/merch-order.js
              resolves the payee and refuses anything that is not a direct
              PayPal payment, so an artist who added a bank account and no
              PayPal has working music sales and merch that quietly cannot be
              bought. The table above says one of the two is enough, which is
              true of music and not of merch. */}
          <p>Merch is the exception: a merch order is paid into PayPal only, so selling merch needs a PayPal email even if your bank account is on file. Music, albums, beats and tips work on either route.</p>
          <p>On a track with collaborators, the buyer pays the track owner. Feelz Machine records each collaborator's agreed share of every sale and tells both of you what it comes to. The owner then pays their collaborators directly.</p>
          <p>
            <a href="/splits" className="text-purple-300/80 hover:text-purple-200 font-medium">
              See every split, both ways
            </a>
            {' '}to mark a share paid, confirm one you received, or remind somebody who owes you.
          </p>
          <p className="text-white/25">Feelz Machine does not take a cut of artist earnings. Your subscription is the only platform fee.</p>
        </div>
      </div>

      {/* Your agreements.
       *
       * The Feelz Retail submit gate ends with this line:
       *
       *   "Your agreement is recorded against version X and Y of these
       *    documents. If we change them later, this track stays on the version
       *    you agreed to, and you can read it any time from your Payment
       *    Settings."
       *
       * Payment Settings had no such link. Somebody who agreed to something and
       * then went looking for it, exactly as they were told to, found nothing.
       * A promise like that has to be kept, because the whole point of a
       * versioned agreement is that the person can go back and read it.
       *
       * Both open in a new tab so nothing half-typed on this page is lost.
       *
       * Shown to every artist rather than only to those who have pitched. The
       * check for "has this person agreed" would be another round trip, and
       * reading the terms before you submit is a good thing, not a leak. */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
        <h4 className="text-sm font-semibold text-white mb-1">Your agreements</h4>
        <p className="text-xs text-white/40 leading-relaxed mb-3">
          The documents you agree to when you send a track to Feelz Retail. If we
          change them later, anything you already submitted stays on the version
          you agreed to.
        </p>
        <div className="space-y-2">
          {[
            ['retail-submission-terms', 'Retail submission terms', 'What you agree to when you submit'],
            ['retail-licence',          'Retail licence',          'What applies if your track is accepted'],
          ].map(([slug, title, sub]) => (
            <a key={slug} href={`/legal/${slug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06] transition">
              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate">{title}</p>
                <p className="text-[10px] text-white/30 truncate">{sub}</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-white/30 flex-shrink-0 ml-3" />
            </a>
          ))}
        </div>
      </div>

      {/* Recent payouts */}
      {recentPayouts.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-white/50 mb-3">Recent Payouts</h4>
          <div className="space-y-2">
            {recentPayouts.map(payout => (
              <div key={payout.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <div>
                  <p className="text-sm text-white font-medium">${Number(payout.amount || 0).toFixed(2)}</p>
                  <p className="text-[10px] text-white/30">
                    {new Date(payout.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {payout.split_percentage && ` · ${payout.split_percentage}% split`}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  ['paid', 'completed'].includes(payout.status) ? 'bg-green-500/10 text-green-400'
                  : ['pending', 'processing'].includes(payout.status) ? 'bg-yellow-500/10 text-yellow-400'
                  : 'bg-red-500/10 text-red-400'
                }`}>
                  {String(payout.status || '').replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}