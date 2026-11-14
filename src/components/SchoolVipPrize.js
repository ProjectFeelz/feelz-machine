// src/components/SchoolVipPrize.js
//
// The VIP card, told as a second prize rather than as a mechanic.
//
// WHY IT SITS NEXT TO THE PRIZE POT AND NOT IN THE RULES
//
// The old VIP card was a printed name on a piece of card, handed out by
// somebody, explained nowhere. A student found out it existed after the fact,
// which is the one moment it is worth nothing: the behaviour it is meant to
// reward has already not happened.
//
// So it is stated before anybody enters, in the place people read first, and
// it is framed the way it actually works: a SECOND thing to win, which you can
// take home whether or not your cover wins anything. One cover wins the cash.
// A seat in a judging round goes to people who bring others to the platform.
// Those are different races and one person can be in both.
//
// THE HEADING ASKS A QUESTION NOW
//
// It used to open with "A second thing to win", which is a description of
// where the block sits on the page rather than an offer. Somebody skimming
// does not know whether it is for them. "Want to be a VIP?" is answerable in
// one word, and the only people who read on are the ones who said yes.
//
// WHAT IT SHOWS, AND TO WHOM
//
//   signed out, or not entered   what the card is and how it is earned
//   entered, in progress         the same, plus two real counters and the
//                                share link, because a progress bar you
//                                cannot act on is a tease
//   earned                       said plainly, with the numbers that did it
//
// The progress half needs my_vip_progress(), which returns the CALLER'S row
// and nobody else's. An earlier version of this exposed every entrant's name,
// school and counts to any signed in account; that was a list of
// schoolchildren and it is closed.

// COLOUR
//
// GOLD, and gold only here.
//
// Lime is the platform and the cash prize already owns it as a filled block.
// Two lime panels stacked read as two competing announcements. Gold says
// premium on its own and makes this read as a different KIND of prize rather
// than a smaller one.
//
// The gold is kept light (#F6CF57) and laid over near black. That matters:
// mixing gold into a mid tone background is what turns it brown, and brown is
// not a colour this platform uses anywhere. Light gold on black stays gold.

import React from 'react';
import { supabase } from '../supabaseClient';
import { Crown, Users, Headphones, Copy, Check } from 'lucide-react';

const SITE = 'https://www.feelzmachine.com';

const GOLD = '#F6CF57';
// The panel. A faint gold wash in the top left falling away to black, rather
// than a flat gold tint, which is the thing that goes brown.
const PANEL = 'linear-gradient(135deg, rgba(246,207,87,0.13) 0%, rgba(246,207,87,0.04) 38%, rgba(0,0,0,0.9) 100%)';

function Bar({ icon: Icon, label, have, need }) {
  const pct = need > 0 ? Math.min(100, Math.round((have / need) * 100)) : 0;
  const done = have >= need;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] lg:text-xs font-semibold text-white/60">
          <Icon className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
          {label}
        </span>
        {/* Once it is passed, "21 of 15" reads like a mistake. Past the line
            the number stands on its own with a tick. */}
        <span
          className="inline-flex items-center gap-1 text-[11px] lg:text-xs font-bold"
          style={{ color: done ? GOLD : 'rgba(255,255,255,0.5)' }}
        >
          {done ? <><Check className="w-3 h-3" />{have}</> : `${have} of ${need}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: done ? GOLD : 'rgba(246,207,87,0.5)' }}
        />
      </div>
    </div>
  );
}

export default function SchoolVipPrize({ signedIn }) {
  const [rules, setRules]       = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  const [copied, setCopied]     = React.useState(false);

  // The rules read is anon on purpose: this block has to say what the card is
  // to somebody who has not signed in, which is most of the people the flyer
  // sends here.
  React.useEffect(() => {
    let dead = false;
    supabase.rpc('vip_rules').then(({ data, error }) => {
      if (dead) return;
      if (error) { console.warn('[vip] rules unavailable:', error.code, error.message); return; }
      setRules(Array.isArray(data) ? data[0] : data);
    });
    return () => { dead = true; };
  }, []);

  React.useEffect(() => {
    if (!signedIn) { setProgress(null); return; }
    let dead = false;
    supabase.rpc('my_vip_progress').then(({ data, error }) => {
      if (dead) return;
      if (error) { console.warn('[vip] progress unavailable:', error.code, error.message); return; }
      setProgress(Array.isArray(data) ? data[0] : data);
    });
    return () => { dead = true; };
  }, [signedIn]);

  // Nothing is rendered until the rules are in. A card that promises a prize
  // and then corrects the numbers a second later is worse than one that
  // arrives a second late.
  if (!rules) return null;

  const minSignups   = rules.min_signups ?? 15;
  const minListeners = rules.min_listeners ?? 5;
  // The season pool, not a per school allowance. Nothing about this card is
  // keyed on a school any more: anyone who brings people here can earn one.
  const cap          = rules.candidate_cap ?? 50;
  const taken        = rules.cards_taken ?? 0;
  const left         = Math.max(0, cap - taken);

  const link = progress?.ref_code ? `${SITE}/?ref=${progress.ref_code}` : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in plenty of contexts. The link is on screen and
      // selectable, so this is a convenience failing, not the feature.
      setCopied(false);
    }
  };

  const awarded = !!progress?.card_awarded;

  return (
    <div
      className="rounded-xl p-5 lg:p-7 space-y-4 lg:space-y-5"
      style={{ background: PANEL, border: '1px solid rgba(246,207,87,0.28)' }}
    >

      <div className="flex items-start gap-3">
        <span
          className="w-9 h-9 lg:w-11 lg:h-11 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(246,207,87,0.14)', border: '1px solid rgba(246,207,87,0.3)' }}
        >
          <Crown className="w-4.5 h-4.5 lg:w-5 lg:h-5" style={{ color: GOLD }} />
        </span>
        <div className="min-w-0">
          {/* THE DIRECT ASK. It used to say "A second thing to win", which
              describes the block's position on the page rather than offering
              anybody anything. */}
          <p className="text-[11px] lg:text-xs font-bold tracking-widest uppercase" style={{ color: GOLD }}>
            {awarded ? 'You are a VIP' : 'Want to be a VIP?'}
          </p>
          <p className="text-lg lg:text-2xl font-bold text-white leading-tight mt-0.5">
            {awarded ? 'Your card is in' : 'Read this bit'}
          </p>
        </div>
      </div>

      {awarded ? (
        <p className="text-xs lg:text-base text-white/65 leading-relaxed">
          You brought in {progress.signups} sign ups and {progress.listeners} of them
          are listening. That is a seat in a judging round, and it is yours whether or
          not you entered a cover at all.
        </p>
      ) : (
        <>
          {/* WHAT IT IS, THEN HOW TO GET ONE. In that order, and in two
              paragraphs, because somebody who does not yet know what a VIP
              card is cannot be told the thresholds first. */}
          <p className="text-xs lg:text-base text-white/65 leading-relaxed">
            <span className="text-white font-semibold">A VIP card is a seat on the judging panel.</span>{' '}
            You sit in one of the judging rounds and help decide who wins. The cash prize
            goes to the best cover. This is the other way in, and you do not have to enter
            a cover at all to get one.
          </p>
          <p className="text-xs lg:text-base text-white/65 leading-relaxed">
            <span className="text-white font-semibold">How to get one.</span> Share your
            link. Bring in{' '}
            <span className="font-semibold" style={{ color: GOLD }}>{minSignups} people who sign up</span>, of whom{' '}
            <span className="font-semibold" style={{ color: GOLD }}>{minListeners} actually listen</span> to
            something, and the card is yours.
            {left > 0
              ? ` ${left} of the ${cap} cards for this season are still going.`
              : ' Every card for this season has been claimed.'}
          </p>
        </>
      )}

      {/* The counters, once there is somebody to count for. */}
      {progress && (
        <div className="space-y-3 pt-1">
          <Bar icon={Users}      label="Signed up"           have={Number(progress.signups)}   need={minSignups} />
          <Bar icon={Headphones} label="Actually listening"  have={Number(progress.listeners)} need={minListeners} />

          {!awarded && left === 0 && (
            <p className="text-[11px] lg:text-xs text-white/40 leading-relaxed">
              All {cap} cards for this season have been claimed, so this is counting
              towards next season.
            </p>
          )}
        </div>
      )}

      {/* The link. Without it the whole block is a thing you are told about
          rather than a thing you can start doing. */}
      {link && (
        <div className="pt-1">
          <p className="text-[11px] lg:text-xs font-semibold uppercase tracking-wider text-white/40 mb-1.5">
            Your link
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-[11px] lg:text-sm text-white/70 bg-black/50 rounded-lg px-2.5 h-11 flex items-center"
              style={{ border: '1px solid rgba(246,207,87,0.18)' }}>
              {link}
            </code>
            <button
              onClick={copy}
              aria-label="Copy your link"
              className="flex-shrink-0 h-11 px-4 rounded-lg text-black text-xs lg:text-sm font-bold
                         active:scale-95 transition inline-flex items-center gap-1.5"
              style={{ background: GOLD }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] lg:text-xs text-white/40 mt-1.5 leading-relaxed">
            Anyone who signs up through this counts for you. Only the ones who
            actually play something count towards the second number, which is the
            one that is hard.
          </p>
        </div>
      )}

      {!signedIn && (
        <p className="text-[11px] lg:text-xs text-white/40 leading-relaxed">
          Sign in to get your link and start counting.
        </p>
      )}
    </div>
  );
}
