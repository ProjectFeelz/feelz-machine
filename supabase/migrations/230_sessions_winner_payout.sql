-- supabase/migrations/230_sessions_winner_payout.sql
--
-- PAYING THE SESSIONS WINNER FROM INSIDE THE APP.
--
--
-- WHY THIS IS ONLY NOW POSSIBLE
--
-- competition_payouts already exists and already records a prize paid out of
-- the business PayPal balance. The wheel competition uses it. Sessions never
-- did, and the comment in AdminSchoolSessions.js says why: when this was
-- School Sessions the cash went to a school and to a guardian by EFT, often
-- for a child who cannot hold a PayPal account, so the platform stayed out of
-- the middle on purpose.
--
-- Sessions is no longer that. It is locked to South Africa, and the prize goes
-- to whoever won, whether that is one person or a group entering together. So
-- the money can go out the same way the wheel prize does, and this adds the
-- three columns that record was missing plus one function the admin screen
-- reads before anybody clicks anything.
--
--
-- WHAT THIS DELIBERATELY DOES NOT ADD
--
-- A Paystack rail.
--
-- This is worth being exact about, because it is easy to assume otherwise.
-- Paystack is already in this codebase and it is already how artists get paid
-- in rand. But look at what it actually does: netlify/lib/payee.js uses a
-- Paystack SUBACCOUNT, and a subaccount splits a SALE at the moment the buyer
-- pays. The artist's share never passes through the platform at all. That is
-- the whole principle of that module.
--
-- A prize has no sale to split. There is no buyer. It is money leaving the
-- business account and going to a person, which on Paystack is the Transfers
-- API, and there is not one line of that in this repository. The columns the
-- app stores today also could not drive it: artist_payment_profiles keeps
-- paystack_account_last4, the last four digits, because Paystack holds the
-- real account number against the subaccount and the app never needed it back.
--
-- So the only rail that can pay a Sessions winner in-app right now is PayPal,
-- and anything paid another way is recorded by hand in school_sessions_prizes
-- exactly as before. The function below reports the route honestly rather than
-- letting a screen imply a bank transfer that cannot happen.

begin;

-- ── 1. What the payout record was missing ───────────────────────────────────
--
-- processor defaults to 'paypal' because every row that exists today is a
-- PayPal payout, so the default makes the old rows truthful rather than null.
alter table public.competition_payouts
  add column if not exists processor      text not null default 'paypal',
  add column if not exists recipient_name text,
  add column if not exists note           text;

-- ── 2. A prize is paid once ─────────────────────────────────────────────────
--
-- paypal-payout.js checks for an existing payout before it sends. That is a
-- read followed by a write, so two clicks a second apart can both read "no
-- payout yet" and both send. The window is small and the cost is paying a
-- stranger R10 000 twice, so the database refuses the second one instead of
-- the application hoping to catch it.
--
-- Scoped to live rows on purpose: a failed or cancelled payout should be
-- retryable.
create unique index if not exists competition_payouts_one_live_per_entry
  on public.competition_payouts (entry_id)
  where status in ('processing', 'success');

-- ── 3. Can the winner actually be paid? ─────────────────────────────────────
--
-- One call, so the admin screen does not have to assemble this from five
-- queries and get it subtly wrong. It answers in plain words and it never
-- guesses: if there is no payout route it says so rather than returning an
-- empty string that a screen will render as a blank box.
--
-- security definer because it reads auth.users and artist_payment_profiles,
-- which an admin's own session cannot select from. The admin check is the
-- first thing it does.
create or replace function public.sessions_payout_status()
returns table (
  entry_id        uuid,
  competition_id  uuid,
  artist_id       uuid,
  winner_name     text,
  winner_email    text,
  is_minor        boolean,
  is_group        boolean,
  prize_amount    numeric,
  prize_currency  text,
  payout_route    text,
  payout_target   text,
  paid_status     text,
  blocker         text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comp   uuid;
  v_entry  record;
  v_email  text;
  v_paid   text;
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;

  select c.competition_id into v_comp from public.school_sessions_config c limit 1;

  select e.id, e.competition_id, e.artist_id, e.entrant_full_name, e.entrant_email,
         e.entrant_is_minor, e.is_group
    into v_entry
  from public.school_sessions_entries e
  where e.competition_id = v_comp and e.is_winner
  limit 1;

  if v_entry.id is null then
    return query select
      null::uuid, v_comp, null::uuid, null::text, null::text,
      null::boolean, null::boolean,
      (select cmp.cash_prize_amount from public.competitions cmp where cmp.id = v_comp),
      coalesce((select cmp.cash_prize_currency from public.competitions cmp where cmp.id = v_comp), 'ZAR'),
      'none'::text, null::text, 'unpaid'::text,
      'No winner marked yet. Mark one in the entries list below.'::text;
    return;
  end if;

  -- Where the money would go. Same precedence the rest of the platform uses:
  -- the payment profile first, the artist row as the older fallback.
  select coalesce(
           (select nullif(trim(p.paypal_email), '') from public.artist_payment_profiles p
             where p.artist_id = v_entry.artist_id),
           (select nullif(trim(ar.paypal_email), '') from public.artists ar
             where ar.id = v_entry.artist_id)
         )
    into v_email;

  select cp.status into v_paid
  from public.competition_payouts cp
  where cp.entry_id = v_entry.id and cp.status in ('processing', 'success')
  order by cp.initiated_at desc nulls last
  limit 1;

  return query select
    v_entry.id,
    v_entry.competition_id,
    v_entry.artist_id,
    v_entry.entrant_full_name,
    v_entry.entrant_email,
    coalesce(v_entry.entrant_is_minor, false),
    coalesce(v_entry.is_group, false),
    (select cmp.cash_prize_amount from public.competitions cmp where cmp.id = v_comp),
    coalesce((select cmp.cash_prize_currency from public.competitions cmp where cmp.id = v_comp), 'ZAR'),
    case when v_email is not null then 'paypal' else 'none' end::text,
    v_email,
    coalesce(v_paid, 'unpaid')::text,
    case
      when v_paid = 'success'    then 'Already paid. Check PayPal for the batch.'
      when v_paid = 'processing' then 'A payout is already on its way for this entry.'
      when v_email is null then
        'No payout details on this account. Ask them to add a PayPal address at Profile, Payments, or pay by EFT and record it below.'
      when coalesce(v_entry.entrant_is_minor, false) then
        'This entrant is under 18. A guardian has to sign for the prize before it goes out.'
      else null
    end::text;
end;
$$;

revoke all on function public.sessions_payout_status() from public;
grant execute on function public.sessions_payout_status() to authenticated;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 processor column' as k,
  case when exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='competition_payouts' and column_name='processor')
  then 'yes' else 'NO' end as v
union all
select '2 double payout guard', case when exists (
  select 1 from pg_indexes where schemaname='public' and indexname='competition_payouts_one_live_per_entry'
) then 'in place' else 'MISSING' end
union all
select '3 status function', case when exists (
  select 1 from pg_proc where proname='sessions_payout_status'
) then 'created' else 'MISSING' end
union all
select '4 prize on the books', coalesce((
  select 'R' || cash_prize_amount::text from public.competitions
  where id = (select competition_id from public.school_sessions_config limit 1)), 'none set')
union all
select '5 entrants who could be paid today', (
  select count(*)::text from public.school_sessions_entries e
  where e.artist_id in (
    select artist_id from public.artist_payment_profiles where coalesce(paypal_email,'') <> ''
    union
    select id from public.artists where coalesce(paypal_email,'') <> ''
  ))
union all
select '6 entrants under 18', (select count(*)::text from public.school_sessions_entries where entrant_is_minor)
order by 1;
