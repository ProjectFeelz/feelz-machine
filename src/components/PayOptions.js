/**
 * src/components/PayOptions.js
 *
 * THE SELLER DECIDES WHICH WAY TO PAY COMES FIRST.
 *
 *
 * WHAT WAS WRONG
 *
 * netlify/lib/payee.js has always said the processor is chosen by the seller,
 * and it means it: a seller with a Paystack subaccount is paid through
 * Paystack whatever the buyer prefers, because that settles into their own
 * bank account, in rand, with no PayPal balance to withdraw from and no
 * conversion on the way out.
 *
 * The screens did not say that. Every selling screen rendered the PayPal
 * buttons, then dropped PayInRandButton underneath as an afterthought. So the
 * seller's subaccount decided only whether rand WORKED, never whether it was
 * OFFERED first, and in practice the buyer chose the processor by which
 * button happened to be bigger. An artist in Johannesburg who had done the
 * work of adding bank details was still being paid the awkward way by most
 * buyers.
 *
 * This component is the fix, and it is deliberately the smallest one that
 * works.
 *
 *
 * WHY IT TAKES THE PAYPAL BUTTONS AS CHILDREN
 *
 * Six screens sell music and each wires the PayPal SDK itself, with its own
 * createOrder and onApprove. That code takes real money and is not being
 * touched. Every one of them renders the SDK into a plain
 * <div id="paypal-..."> by id, imperatively, so where that div sits in the
 * tree is irrelevant to the SDK as long as it exists when render() is called.
 *
 * So this changes the ORDER of two siblings and nothing else. The PayPal
 * container is passed in as children, always mounted, never hidden, never
 * unmounted and remounted, because a PayPal button that is remounted mid-flow
 * is a sale that fails for reasons nobody can reproduce.
 *
 *
 * THREE STATES, NOT TWO
 *
 *   sellerTakesRand true   rand first, as the primary action, PayPal under a
 *                          divider as the other way to pay.
 *   sellerTakesRand false  no rand option at all. The button is not rendered,
 *                          so nothing is offered that would be refused.
 *   sellerTakesRand null   not known yet, or not knowable. Exactly the layout
 *                          these screens had before this file existed:
 *                          PayPal first, rand underneath.
 *
 * null is the state the first render is in, for as long as the quote takes.
 * That means a screen can lay itself out PayPal-first and then flip once the
 * answer arrives. That flicker is accepted on purpose: the alternative is
 * holding the PayPal buttons back behind a spinner on every sale on the site
 * to spare a reorder on some of them.
 */

import React from 'react';
import PayInRandButton from './PayInRandButton';
import useRandQuote from '../hooks/useRandQuote';

export default function PayOptions({
  trackId = null,
  albumId = null,
  licenceId = null,
  amount = null,
  // Only used before a quote arrives. Once there is one the button shows the
  // actual rand figure instead.
  randLabel = 'Pay in rand',
  // Passed through. A screen too tight for the "coming soon" notice sets this
  // false, same as it did when it rendered the button directly.
  announceWhenComingSoon = true,
  // The PayPal block, exactly as the screen already wrote it.
  children,
}) {
  const { quote, sellerTakesRand } = useRandQuote({ trackId, albumId, licenceId, amount });

  const randFirst = sellerTakesRand === true;

  const rand = sellerTakesRand === false ? null : (
    <PayInRandButton
      trackId={trackId}
      albumId={albumId}
      licenceId={licenceId}
      amount={amount}
      quote={quote}
      primary={randFirst}
      label={randLabel}
      announceWhenComingSoon={announceWhenComingSoon}
    />
  );

  // Not known, or known to be no. Either way this is the layout the screen
  // has always had, so nothing moves on the sellers this does not apply to.
  if (!randFirst) {
    return (
      <>
        {children}
        {rand}
      </>
    );
  }

  return (
    <>
      {rand}
      {/* Said in words rather than left to size and position alone, because a
          buyer who came here meaning to use PayPal needs to see that it is
          still here, not hunt for it. */}
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[11px] uppercase tracking-wide text-white/30">or pay with PayPal</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      {children}
    </>
  );
}
