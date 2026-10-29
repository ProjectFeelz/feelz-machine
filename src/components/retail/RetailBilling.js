// src/components/retail/RetailBilling.js
//
// How a venue starts paying, and the nudge that keeps a trial from ending in
// silence.
//
//
// WHY THIS IS ONE FILE AND NOT TWO BUTTONS
//
// A venue is billed in one of two currencies, decided by
// retail_subscriptions.currency (migration 217): dollars through PayPal, rand
// through Paystack. Retail launches in South Africa, so rand is the common
// case, but both have to work and neither may be guessed at from the browser.
//
// So nothing here decides which processor a venue uses. One call to
// retail-paystack-subscription with action 'state' answers that, along with
// whether a free trial is still available and what the fee is, and the screen
// draws whatever that answer says. The alternative, reading
// retail_subscriptions in the browser and working it out, means the screen can
// offer a trial the server will then refuse.
//
//
// THE TWO SURFACES
//
// RetailBillingPanel  shown where the player would be, when the venue is not
//                     active: the way in.
//
// RetailTrialBanner   shown above a working player while a card-less trial is
//                     running. A rand trial takes no card (Paystack cannot
//                     start a subscription without one, see
//                     netlify/functions/retail-paystack-subscription.js), so
//                     it ends with the music stopping unless somebody comes
//                     back. A venue that was never told is a venue that thinks
//                     the product broke.

import React from 'react';
import { Loader, CreditCard, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const PAYPAL_CLIENT_ID = process.env.REACT_APP_PAYPAL_CLIENT_ID || '';
const FN = '/.netlify/functions';

async function post(fn, payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${FN}/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

const money = (amount, currency) => currency === 'ZAR'
  ? `R${Number(amount || 0).toFixed(0)}`
  : `$${Number(amount || 0).toFixed(2)}`;

function daysUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86400000));
}

// One place asks the server what this venue's billing is, and both surfaces
// below read it. Returns `reload` so a surface can refresh after acting
// instead of guessing what the new state is.
function useBillingState(venueId) {
  const [state, setState] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    const { ok, body } = await post('retail-paystack-subscription', { action: 'state', venueId });
    if (ok) { setState(body); setError(''); }
    else setError(body.message || body.error || 'Could not load your billing details.');
    setLoading(false);
  }, [venueId]);

  React.useEffect(() => { load(); }, [load]);

  return { state, error, loading, reload: load };
}

// ── Dollars: the PayPal subscribe button ─────────────────────────────────────
//
// Moved here from RetailPlayerPage unchanged in behaviour, so both processors
// are drawn by the same component and a venue can never be shown both.
function RetailPayPalButton({ venueId, onSubscribed }) {
  const buttonRef = React.useRef(null);
  const [ready, setReady] = React.useState(false);
  const [planId, setPlanId] = React.useState(null);
  const [usdAmount, setUsdAmount] = React.useState(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (window.paypal) { setReady(true); return; }
    const existing = document.querySelector('script[src*="paypal.com/sdk"]');
    if (existing) { existing.addEventListener('load', () => setReady(true)); return; }
    const script = document.createElement('script');
    // USD, not ZAR. The plan this button subscribes to is created in USD by
    // retail-paypal-subscription.js, deliberately, because ZAR billing plans
    // did not work on this PayPal account. Loading the SDK under a different
    // currency to the plan is a mismatch PayPal is entitled to reject. Rand
    // venues do not come down this path at all; they go to Paystack.
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription&currency=USD`;
    script.async = true;
    script.onload = () => setReady(true);
    script.onerror = () => setError('Could not load PayPal. Try again shortly.');
    document.head.appendChild(script);
  }, []);

  React.useEffect(() => {
    post('retail-paypal-subscription', { action: 'get-plan', venueId })
      .then(({ body }) => {
        if (body.planId) { setPlanId(body.planId); setUsdAmount(body.usdAmount); }
        else setError(body.error || 'Billing not set up yet, contact us.');
      })
      .catch(() => setError('Could not reach billing. Try again shortly.'));
  }, [venueId]);

  React.useEffect(() => {
    if (!ready || !planId || !buttonRef.current || !window.paypal) return;
    buttonRef.current.innerHTML = '';
    window.paypal.Buttons({
      style: { shape: 'pill', color: 'white', layout: 'vertical', label: 'subscribe' },
      createSubscription: (data, actions) => actions.subscription.create({ plan_id: planId }),
      onApprove: async (data) => {
        // The response is read, not thrown away. A link that came back 402
        // subscription_not_paid, or failed outright, used to still show the
        // venue a working subscribed player that the server had not switched
        // on.
        try {
          const { ok, body: linked } = await post('retail-paypal-subscription', {
            action: 'link', venueId, subscriptionId: data.subscriptionID,
          });
          if (!ok || !linked.success) {
            setError(
              linked.error === 'subscription_not_paid'
                ? 'PayPal has approved this but the first payment has not settled yet. '
                  + 'Your player switches on by itself as soon as it does, usually within a few minutes.'
                : 'Payment went through but we could not activate this venue. Contact us and we will sort it out.'
            );
            return;
          }
          // APPROVED means PayPal has the approval but not the first payment.
          // The server leaves the venue pending until the webhook confirms it,
          // so switching the player on here showed an empty player.
          if (linked.status !== 'ACTIVE') {
            setError('Approved. Your player switches on by itself as soon as PayPal confirms the first payment, '
              + 'usually within a few minutes. Refresh this page then.');
            return;
          }
        } catch {
          setError('Payment went through but we could not reach the server to activate the venue. Contact us.');
          return;
        }
        onSubscribed();
      },
      onError: (err) => {
        console.error('[retail] PayPal button error:', err);
        setError('PayPal could not complete that. Nothing was charged. Refresh the page to try again.');
      },
    }).render(buttonRef.current);
  }, [ready, planId, venueId, onSubscribed]);

  if (error) return <p className="text-xs text-red-400 mt-3">{error}</p>;
  if (!planId || !ready) return <div className="flex justify-center mt-4"><Loader className="w-4 h-4 text-white/30 animate-spin" /></div>;
  return (
    <div className="mt-4 max-w-xs mx-auto">
      {usdAmount && (
        <p className="text-xs text-white/40 mb-2 text-center">
          Billed as ${usdAmount} USD/month via PayPal, pay by bank card, no PayPal account needed.
        </p>
      )}
      <div ref={buttonRef} />
    </div>
  );
}

// ── Rand: Paystack ───────────────────────────────────────────────────────────
//
// Leaves for Paystack's hosted checkout rather than using the inline overlay,
// because the inline flow gives the browser no reliable way to learn that a
// payment succeeded, and the webhook is the only thing that decides that
// anyway. A redirect out and back is honest about where the money is handled.
function PaystackSubscribe({ venueId, fee, label, onError }) {
  const [busy, setBusy] = React.useState(false);

  const go = async () => {
    setBusy(true);
    const { ok, body } = await post('retail-paystack-subscription', { action: 'start', venueId });
    if (!ok || !body.authorizationUrl) {
      setBusy(false);
      onError(body.message || body.error || 'Could not open the card payment. Try again shortly.');
      return;
    }
    // Replaced rather than opened in a tab: a popup blocker eats the tab and
    // the venue is left looking at a button that appeared to do nothing.
    window.location.assign(body.authorizationUrl);
  };

  return (
    <button
      onClick={go}
      disabled={busy}
      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white text-black
                 text-sm font-semibold hover:bg-white/90 transition disabled:opacity-50"
    >
      {busy ? <Loader className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
      {label || `Pay ${money(fee, 'ZAR')} a month`}
    </button>
  );
}

/**
 * The way in, shown where the player would be when a venue is not active.
 */
export function RetailBillingPanel({ venueId, onActivated }) {
  const { state, error, loading, reload } = useBillingState(venueId);
  const [actionError, setActionError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const startTrial = async () => {
    setBusy(true);
    setActionError('');
    const { ok, body } = await post('retail-paystack-subscription', { action: 'start-trial', venueId });
    setBusy(false);
    if (!ok || !body.success) {
      setActionError(body.message || body.error || 'Could not start the trial. Try again shortly.');
      await reload();
      return;
    }
    onActivated();
  };

  if (loading) return <div className="flex justify-center mt-4"><Loader className="w-4 h-4 text-white/30 animate-spin" /></div>;
  if (error || !state) return <p className="text-xs text-red-400 mt-3">{error || 'Could not load your billing details.'}</p>;

  // Dollars: unchanged, PayPal's own trial is inside the plan, so there is no
  // separate trial button on this path.
  if (state.currency !== 'ZAR') {
    return <RetailPayPalButton venueId={venueId} onSubscribed={onActivated} />;
  }

  const trialDays = Number(state.trialDaysAvailable) || 0;
  const fee = state.monthlyFee;

  if (!(fee > 0)) {
    return (
      <p className="text-xs text-white/40 mt-4 max-w-xs mx-auto">
        No monthly fee has been set for this venue yet. Contact us and we will sort it out.
      </p>
    );
  }

  return (
    <div className="mt-5 max-w-xs mx-auto space-y-3">
      {(actionError || !state.paystackLive) && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3 text-left">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-100/80">
            {actionError || 'Paying by card in rand is not switched on yet. Contact us and we will take the first month another way.'}
          </p>
        </div>
      )}

      {trialDays > 0 && (
        <>
          <button
            onClick={startTrial}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white text-black
                       text-sm font-semibold hover:bg-white/90 transition disabled:opacity-50"
          >
            {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            Start your {trialDays}-day free trial
          </button>
          <p className="text-xs text-white/40">
            No card needed. The music starts now and we will remind you before the {trialDays} days are up.
          </p>
        </>
      )}

      {state.paystackLive && (
        <PaystackSubscribe
          venueId={venueId}
          fee={fee}
          label={trialDays > 0 ? `Skip the trial, pay ${money(fee, 'ZAR')} a month` : `Pay ${money(fee, 'ZAR')} a month`}
          onError={setActionError}
        />
      )}

      <p className="text-xs text-white/30">
        {money(fee, 'ZAR')} a month, billed by card through Paystack. Cancel whenever you like.
      </p>
    </div>
  );
}

/**
 * The reminder, shown above a working player while a card-less trial runs.
 *
 * Draws nothing at all unless this venue is on one, so it can sit
 * unconditionally in the player page without a condition wrapped around it.
 */
export function RetailTrialBanner({ venueId }) {
  const { state } = useBillingState(venueId);
  const [actionError, setActionError] = React.useState('');

  if (!state || !state.onTrial || state.currency !== 'ZAR') return null;

  const left = daysUntil(state.trialEndsAt);
  const urgent = left != null && left <= 3;

  return (
    <div className={`mx-3 mt-3 rounded-xl border p-3 ${
      urgent ? 'border-amber-500/30 bg-amber-500/[0.08]' : 'border-white/[0.08] bg-white/[0.03]'
    }`}>
      <div className="flex items-start gap-2.5">
        <Clock className={`w-4 h-4 flex-shrink-0 mt-0.5 ${urgent ? 'text-amber-300' : 'text-white/40'}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${urgent ? 'text-amber-100' : 'text-white'}`}>
            {left === 0 ? 'Your free trial ends today'
              : left === 1 ? 'Your free trial ends tomorrow'
              : `${left} days left of your free trial`}
          </p>
          <p className="text-xs text-white/45 mt-0.5">
            Add a card to keep the music playing. {money(state.monthlyFee, 'ZAR')} a month, cancel whenever you like.
          </p>
          {actionError && <p className="text-xs text-red-400 mt-1.5">{actionError}</p>}
          {state.paystackLive && (
            <div className="mt-2.5 max-w-[220px]">
              <PaystackSubscribe venueId={venueId} fee={state.monthlyFee} onError={setActionError} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RetailBillingPanel;
