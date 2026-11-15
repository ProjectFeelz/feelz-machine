-- supabase/migrations/231_ask_entrants_for_payout_details.sql
--
-- ASKS ALL 14 SESSIONS ENTRANTS WHERE THEIR PRIZE SHOULD GO.
--
--
-- WHY NOW AND NOT ON THE NIGHT
--
-- Not one of the fourteen has any payment details on their account. Not a
-- PayPal address, not a bank account, nothing. So on the night the winner is
-- announced, the prize cannot be sent, and the person who just won in front of
-- an audience gets asked to go and set up a payment account instead.
--
-- Payment details take days to chase, not minutes. This asks now, while it is
-- a small thing nobody is waiting on.
--
--
-- THE TRAP THIS MESSAGE EXISTS TO AVOID
--
-- The payments page offers two things: a bank account and a PayPal address.
-- An entrant reading "add your payment details" will almost always choose the
-- bank account, because they are South African and that is the sane choice.
--
-- It will not pay them the prize.
--
-- The bank option creates a Paystack subaccount, which splits money off a SALE
-- when somebody buys their music. A prize has no sale to split. The prize goes
-- out of the business PayPal balance, so PayPal is the one that matters here.
-- Telling them that now is cheaper than discovering it with a winner waiting.
--
--
-- THE FIVE WHO ARE UNDER 18
--
-- PayPal will not give an account to a minor, so telling a fifteen year old to
-- open one sets them up to fail. Those five get a different message: it goes
-- to a parent or guardian, and that adult signs for it. Everyone else gets the
-- straightforward one.
--
-- Safe to run twice. The guard is on the metadata tag.

begin;

insert into public.notifications (user_id, artist_id, type, title, message, email_requested, metadata)
select
  ar.user_id,
  e.artist_id,
  'admin_message',
  'Where should your prize go if you win?',

  case when coalesce(e.entrant_is_minor, false) then
    -- Under 18.
    'Voting is coming and we want to be ready to pay the winner the same day.' || chr(10) || chr(10) ||
    'The prize is sent by PayPal. PayPal does not allow accounts for anyone under 18, so yours needs to go to a parent or guardian instead.' || chr(10) || chr(10) ||
    'Here is what to do. Ask a parent or guardian if they have a PayPal address, or if they will open one. Then open Profile, go to Payments, and put their PayPal address in. Tell us it is theirs and we will note it.' || chr(10) || chr(10) ||
    'They will also need to say yes in writing before the money goes out. We will come to you about that if you win, so there is nothing to do about it today.' || chr(10) || chr(10) ||
    'You can do this whether you win or not. It takes five minutes and it means nobody is scrambling on the night.'
  else
    -- 18 or over.
    'Voting is coming and we want to be ready to pay the winner the same day.' || chr(10) || chr(10) ||
    'The prize is sent by PayPal, so open Profile, go to Payments, and add your PayPal address. If you do not have one, it is free to open at paypal.com and takes a few minutes.' || chr(10) || chr(10) ||
    'One thing worth knowing. That same page also lets you add a bank account. That one is for when people buy your music, and it will not pay the prize. If you only add a bank account we still cannot send you anything, so add the PayPal address too.' || chr(10) || chr(10) ||
    'Do it whether you think you will win or not. It takes five minutes and it means nobody is scrambling on the night.'
  end,

  true,
  jsonb_build_object('kind', 'sessions_payout_details_ask', 'entry_id', e.id, 'url', '/profile?tab=payments')

from public.school_sessions_entries e
join public.artists ar on ar.id = e.artist_id
where ar.user_id is not null
  and coalesce(e.is_rejected, false) = false
  and not exists (
    select 1 from public.notifications n
    where n.metadata->>'kind' = 'sessions_payout_details_ask'
      and n.metadata->>'entry_id' = e.id::text
  );

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 entrants asked' as k, count(*)::text as v
from notifications where metadata->>'kind' = 'sessions_payout_details_ask'
union all
select '2 of those, under 18', count(*)::text
from notifications n
join school_sessions_entries e on e.id::text = n.metadata->>'entry_id'
where n.metadata->>'kind' = 'sessions_payout_details_ask' and e.entrant_is_minor
union all
select '3 emails queued', count(*)::text
from notifications where metadata->>'kind' = 'sessions_payout_details_ask' and email_requested
union all
select '4 entrants with a paypal address now', (
  select count(distinct e.artist_id)::text from school_sessions_entries e
  where e.artist_id in (
    select artist_id from artist_payment_profiles where coalesce(paypal_email,'') <> ''
    union
    select id from artists where coalesce(paypal_email,'') <> ''
  ))
union all
select '5 entrants still with nothing', (
  select count(distinct e.artist_id)::text from school_sessions_entries e
  where e.artist_id not in (
    select artist_id from artist_payment_profiles where coalesce(paypal_email,'') <> ''
    union
    select id from artists where coalesce(paypal_email,'') <> ''
  ))
order by 1;
