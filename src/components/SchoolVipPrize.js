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
// Two students per school can win a seat in a judging round by bringing people
// to the platform. Those are different races and a student can be in both.
//
// TWO CARDS PER SCHOOL, DELIBERATELY
//
// One card ends the race the moment somebody takes it: everybody else at that
// school stops, because there is nothing left to chase. Two keeps it alive
// twice over, first to be one of the two, and then between those two to be the
// one who brought in more. The number is read from the database rather than
// written here, because it is tunable in admin.
//
// WHAT IT SHOWS, AND TO WHOM
//
//   signed out, or not entered   what the card is and how it is earned
//   entered, in progress         the same, plus two real counters and the
//                                share link, because a progress bar you
//                                cannot act on is a tease
//   earned                       said plainly, with the numbers that did it
//
// The progress half needs my_school_vip_progress() from migration 216, which
// returns the CALLER'S row and nobody else's. An earlier version of this
// exposed every entrant's name, school and counts to any signed in account;
// that was a list of schoolchildren and it is closed.

import React from 'react';
import { supabase } from '../supabaseClient';
import { Crown, Users, Headphones, Copy, Check } from 'lucide-react';

const SITE = 'https://www.feelzmachine.com';

function Bar({ icon: Icon, label, have, need }) {
  const pct = need > 0 ? Math.min(100, Math.round((have / need) * 100)) : 0;
  const done = have >= need;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/60">
          <Icon className="w-3 h-3" />
          {label}
        </span>
        {/* Once it is passed, "21 of 15" reads like a mistake. Past the line
            the number stands on its own with a tick. */}
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${done ? 'text-lime-400' : 'text-white/50'}`}>
          {done ? <><Check className="w-3 h-3" />{have}</> : `${have} of ${need}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? 'bg-lime-400' : 'bg-lime-400/50'}`}
          style={{ width: `${pct}%` }}
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
    supabase.rpc('school_vip_rules').then(({ data, error }) => {
      if (dead) return;
      if (error) { console.warn('[vip] rules unavailable:', error.code, error.message); return; }
      setRules(Array.isArray(data) ? data[0] : data);
    });
    return () => { dead = true; };
  }, []);

  React.useEffect(() => {
    if (!signedIn) { setProgress(null); return; }
    let dead = false;
    supabase.rpc('my_school_vip_progress').then(({ data, error }) => {
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
  const perSchool    = rules.cards_per_school ?? 2;

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
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-5 lg:p-6 space-y-4">

      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-amber-400/15 flex items-center justify-center flex-shrink-0">
          <Crown className="w-4.5 h-4.5 text-amber-300" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-widest uppercase text-amber-300/80">
            A second thing to win
          </p>
          <p className="text-lg lg:text-xl font-bold text-white leading-tight mt-0.5">
            {awarded ? 'You have a VIP card' : 'The VIP card'}
          </p>
        </div>
      </div>

      {awarded ? (
        <p className="text-xs lg:text-sm text-white/60 leading-relaxed">
          You brought in {progress.signups} sign ups and {progress.listeners} of them
          are listening. That is a seat in a judging round for {progress.school}, and it is
          yours whatever happens to your cover.
        </p>
      ) : (
        <>
          <p className="text-xs lg:text-sm text-white/60 leading-relaxed">
            The cash goes to the best cover. The VIP card goes to the students who
            bring people here. It is a seat in one of the judging rounds, so you
            help decide who wins, and it is yours whether or not your own cover
            places.
          </p>
          <p className="text-xs lg:text-sm text-white/60 leading-relaxed">
            {perSchool === 1 ? 'One card' : `${perSchool} cards`} per school. Bring in{' '}
            <span className="text-white font-semibold">{minSignups} people who sign up</span>, of whom{' '}
            <span className="text-white font-semibold">{minListeners} actually listen</span>, and the
            card is yours.
            {perSchool > 1 && ' Then it is between the two of you for who brought in more.'}
          </p>
        </>
      )}

      {/* The counters, once there is somebody to count for. */}
      {progress && (
        <div className="space-y-3 pt-1">
          <Bar icon={Users}      label="Signed up"      have={Number(progress.signups)}   need={minSignups} />
          <Bar icon={Headphones} label="Actually listening" have={Number(progress.listeners)} need={minListeners} />

          {!progress.has_entered && (
            <p className="text-[11px] text-white/35 leading-relaxed">
              You have not entered yet, so this is not counting towards a card at any
              school. Enter first, then share your link.
            </p>
          )}

          {progress.has_entered && !awarded && progress.school_has_card && perSchool === 1 && (
            <p className="text-[11px] text-amber-300/70 leading-relaxed">
              Somebody at {progress.school} already holds this season's card.
            </p>
          )}
        </div>
      )}

      {/* The link. Without it the whole block is a thing you are told about
          rather than a thing you can start doing. */}
      {link && (
        <div className="pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35 mb-1.5">
            Your link
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-[11px] text-white/70 bg-black/40 border border-white/[0.08] rounded-lg px-2.5 h-11 flex items-center">
              {link}
            </code>
            <button
              onClick={copy}
              aria-label="Copy your link"
              className="flex-shrink-0 h-11 px-4 rounded-lg bg-amber-400 text-black text-xs font-bold
                         hover:bg-amber-300 active:scale-95 transition inline-flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-white/35 mt-1.5 leading-relaxed">
            Anyone who signs up through this counts for you. Only the ones who
            actually play something count towards the second number, which is the
            one that is hard.
          </p>
        </div>
      )}

      {!signedIn && (
        <p className="text-[11px] text-white/35 leading-relaxed">
          Sign in to get your link and start counting.
        </p>
      )}
    </div>
  );
}