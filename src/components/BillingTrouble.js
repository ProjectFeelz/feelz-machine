/**
 * src/components/BillingTrouble.js
 *
 * Shows a subscriber that a payment failed, while it still matters.
 *
 *
 * WHAT WAS ALREADY TRUE BEFORE THIS FILE
 *
 * netlify/functions/paypal-webhook.js handles BILLING.SUBSCRIPTION.PAYMENT.FAILED
 * and writes two columns on the subscription row: last_payment_failed_at and
 * payment_retry_until. public.expire_stale_subscriptions reads the second one
 * and leaves the plan alone while PayPal is still retrying, so a card that
 * fails on Friday and clears on Tuesday costs nobody their features.
 *
 * All of that worked and none of it was visible. Nothing in src/ read either
 * column. The subscriber's only warning was an email from PayPal, and the
 * first thing they saw in the app was their plan gone, with the app offering
 * no explanation because it had never been told to give one.
 *
 *
 * WHY IT FETCHES ITS OWN ROW
 *
 * The two pages that need this already fetch a tier, not a subscription, and
 * both of them deliberately filter on status = 'active' for that purpose. A
 * subscription in trouble is exactly the one those queries throw away. Rather
 * than change what either page means by "current tier", this reads the row it
 * needs and renders nothing at all when there is nothing to say, which is the
 * normal case for almost everybody.
 *
 *
 * WHY THERE IS NO PAY NOW BUTTON DURING A RETRY
 *
 * PayPal owns the retry schedule on a billing agreement. There is no API call
 * that makes it try again early, so a Pay now button could only do one thing:
 * start a second subscription. While the first one is still retrying, that is
 * a way to bill somebody twice for one month. So during the retry window the
 * only action offered is the one that actually fixes it, updating the card in
 * PayPal, and starting again is offered once PayPal has stopped trying.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ExternalLink, RotateCcw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

// Where a PayPal subscriber changes the card behind an automatic payment.
// Stable, and the same page for every country.
const PAYPAL_AUTOPAY_URL = 'https://www.paypal.com/myaccount/autopay/';

const longDate = (value) => {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return '';
  }
};

/**
 * @param {'artist'|'listener'} audience  which subscription table to read
 * @param {string}  [artistId]            required when audience is 'artist'
 * @param {string}  [className]           spacing from the caller's layout
 */
export default function BillingTrouble({ audience = 'artist', artistId, className = '' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sub, setSub] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Most recent row, whatever its status. An artist who has subscribed,
      // lapsed and subscribed again has several, and only the latest one
      // describes where they stand today.
      const query = audience === 'listener'
        ? supabase
            .from('listener_tier_subscriptions')
            .select('status, expires_at, last_payment_failed_at, payment_retry_until')
            .eq('user_id', user?.id)
        : supabase
            .from('artist_tier_subscriptions')
            .select('status, expires_at, last_payment_failed_at, payment_retry_until')
            .eq('artist_id', artistId);

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // A failure to read this is not worth a message. The subscriber already
      // has PayPal's own email, and an error box about a billing check reads
      // like a billing problem to somebody who does not have one.
      if (!cancelled && !error) setSub(data || null);
    };

    if (audience === 'listener' ? user?.id : artistId) load();
    return () => { cancelled = true; };
  }, [audience, artistId, user?.id]);

  const failedAt   = sub?.last_payment_failed_at ? new Date(sub.last_payment_failed_at) : null;
  const retryUntil = sub?.payment_retry_until    ? new Date(sub.payment_retry_until)    : null;

  // Still being retried: the plan is on, and saying so is half the point.
  const inRetry = !!(retryUntil && retryUntil.getTime() > Date.now());

  // PayPal has stopped trying and the plan is off. A past failure on a row
  // that is active again is history: they fixed it, and bringing it up now
  // would be alarming for no reason.
  const lapsed = !!(failedAt && !inRetry && sub?.status !== 'active');

  if (!inRetry && !lapsed) return null;

  const tone = inRetry
    ? { border: 'border-yellow-500/25', bg: 'bg-yellow-500/[0.06]', fg: 'text-yellow-400' }
    : { border: 'border-red-500/25',    bg: 'bg-red-500/[0.06]',    fg: 'text-red-400'    };

  const upgradePath = audience === 'listener' ? '/listener/upgrade' : '/upgrade';

  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg} p-4 ${className}`}>
      <div className="flex items-start space-x-3">
        <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${tone.fg}`} />

        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-white">
            {inRetry
              ? 'Your subscription payment did not go through'
              : 'Your plan ended when a payment could not be taken'}
          </p>

          <p className="text-xs leading-relaxed text-white/60">
            {inRetry ? (
              <>
                PayPal is trying again, and your plan stays on until{' '}
                <span className="text-white/80">{longDate(retryUntil)}</span>. If the card has
                changed or expired, update it in PayPal and the next attempt goes through on its
                own. There is nothing to pay here: PayPal decides when it tries again.
              </>
            ) : (
              <>
                PayPal tried for several days and stopped. Starting the plan again takes a minute
                and charges today, and everything you have uploaded is exactly where you left it.
              </>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={PAYPAL_AUTOPAY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white transition"
            >
              <span>{inRetry ? 'Update your card in PayPal' : 'Check it in PayPal'}</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            {lapsed && (
              <button
                onClick={() => navigate(upgradePath)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white text-black hover:bg-white/90 text-xs font-semibold transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Start the plan again</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}