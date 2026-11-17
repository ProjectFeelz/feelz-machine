-- supabase/migrations/236_prize_cash_and_equipment.sql
--
-- THE PRIZE IS TWO THINGS. THE DATABASE THOUGHT IT WAS ONE.
--
--
-- WHAT WAS WRONG
--
-- The Sessions prize is R5,000 in cash and R5,000 in studio equipment. The
-- database held one number, cash_prize_amount, and that number was 10000.
--
-- The split existed in exactly one place: prize_breakdown_text, a sentence.
-- No code has ever read it. There is no equipment column anywhere.
--
-- Three things followed from that, all of them live:
--
--   1. sessions_payout_status() hands the admin screen prize_amount straight
--      off that column, so the Pay the winner box prefilled R10,000.
--
--   2. sessions-pay-winner.js uses the same column as both the default amount
--      AND the ceiling it refuses to go above. So R10,000 was the suggested
--      payment, and a PayPal payout does not come back.
--
--   3. The guardian consent page showed a parent "ZAR 10,000" and asked them
--      to type their name under it. They would have signed for ten thousand
--      and received five. That is the one that matters, because that page
--      exists specifically to be the record of what was agreed.
--
--
-- WHY cash_prize_amount IS BEING CORRECTED RATHER THAN LEFT ALONE
--
-- The worry was the wheel: AdminCompetitions reads this same column for the
-- Collab Roulette payout, so redefining it could break something that already
-- works. I checked rather than guessed.
--
-- Every wheel competition on the platform has cash_prize_amount = 0. All of
-- them. The wheel's $50 paid-collaboration prize is paid by
-- close-wheel-competition.js, which never reads this column.
--
-- So the column is untouched by the wheel, which means setting it to the real
-- cash figure breaks nothing and finally makes the name true. A second pair of
-- Sessions-only columns would have left two ways to say the same thing, and
-- the next person would have picked the wrong one.

begin;

-- ── 1. The half that is not money ───────────────────────────────────────────
alter table public.competitions
  add column if not exists equipment_prize_amount numeric not null default 0;

comment on column public.competitions.cash_prize_amount is
  'The CASH part of the prize only, the part that can be transferred. Not the headline figure. For Sessions the headline is R10,000 and this is R5,000.';
comment on column public.competitions.equipment_prize_amount is
  'The value of the non-cash part, equipment or gear handed over in person. Never paid out, recorded by hand in school_sessions_prizes when it is delivered.';

-- ── 2. Tell the truth about this season ─────────────────────────────────────
--
-- Guarded on the current value so re-running cannot halve it again.
update public.competitions
set cash_prize_amount      = 5000,
    equipment_prize_amount = 5000
where id = (select competition_id from public.school_sessions_config limit 1)
  and cash_prize_amount = 10000
  and equipment_prize_amount = 0;

-- ── 3. The admin screen learns the difference ───────────────────────────────
--
-- Dropped and recreated because the return type gains a column, and CREATE OR
-- REPLACE cannot change a return type.
drop function if exists public.sessions_payout_status();

create function public.sessions_payout_status()
returns table (
  entry_id        uuid,
  competition_id  uuid,
  artist_id       uuid,
  winner_name     text,
  winner_email    text,
  is_minor        boolean,
  is_group        boolean,
  prize_amount    numeric,   -- cash only. This is what gets sent.
  equipment_amount numeric,  -- handed over, never transferred.
  prize_currency  text,
  payout_route    text,
  payout_target   text,
  paid_status     text,
  blocker         text,
  guardian_name   text,
  guardian_signed_at timestamptz,
  consent_token   uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comp uuid; v_entry record; v_g record; v_email text; v_paid text; v_minor boolean;
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
      null::uuid, v_comp, null::uuid, null::text, null::text, null::boolean, null::boolean,
      (select cmp.cash_prize_amount from public.competitions cmp where cmp.id = v_comp),
      (select cmp.equipment_prize_amount from public.competitions cmp where cmp.id = v_comp),
      coalesce((select cmp.cash_prize_currency from public.competitions cmp where cmp.id = v_comp), 'ZAR'),
      'none'::text, null::text, 'unpaid'::text,
      'No winner marked yet. Mark one in the entries list below.'::text,
      null::text, null::timestamptz, null::uuid;
    return;
  end if;

  v_minor := coalesce(v_entry.entrant_is_minor, false);

  select g.* into v_g from public.school_sessions_guardian_consents g
  where g.entry_id = v_entry.id limit 1;

  if v_minor then
    v_email := nullif(trim(coalesce(v_g.prize_paypal_email, '')), '');
  else
    select coalesce(
             (select nullif(trim(p.paypal_email), '') from public.artist_payment_profiles p where p.artist_id = v_entry.artist_id),
             (select nullif(trim(ar.paypal_email), '') from public.artists ar where ar.id = v_entry.artist_id))
      into v_email;
  end if;

  select cp.status into v_paid from public.competition_payouts cp
  where cp.entry_id = v_entry.id and cp.status in ('processing','success')
  order by cp.initiated_at desc nulls last limit 1;

  return query select
    v_entry.id, v_entry.competition_id, v_entry.artist_id,
    v_entry.entrant_full_name, v_entry.entrant_email,
    v_minor, coalesce(v_entry.is_group, false),
    (select cmp.cash_prize_amount from public.competitions cmp where cmp.id = v_comp),
    (select cmp.equipment_prize_amount from public.competitions cmp where cmp.id = v_comp),
    coalesce((select cmp.cash_prize_currency from public.competitions cmp where cmp.id = v_comp), 'ZAR'),
    case when v_email is not null and (not v_minor or v_g.prize_consented_at is not null)
         then 'paypal' else 'none' end::text,
    v_email,
    coalesce(v_paid, 'unpaid')::text,
    case
      when v_paid = 'success'    then 'Already paid. Check PayPal for the batch.'
      when v_paid = 'processing' then 'A payout is already on its way for this entry.'
      when v_minor and v_g.id is null then
        'This entrant is under 18 and has no guardian on file. Add one before anything can be paid.'
      when v_minor and v_g.prize_consented_at is null then
        'Waiting on ' || coalesce(v_g.guardian_name, 'the guardian') || ' to sign. Send them the link below.'
      when v_email is null and v_minor then
        'The guardian signed but left no PayPal address. Contact them, or pay by EFT and record it below.'
      when v_email is null then
        'No payout details on this account. Ask them to add a PayPal address at Profile, Payments, or pay by EFT and record it below.'
      else null
    end::text,
    v_g.guardian_name, v_g.prize_consented_at, v_g.prize_consent_token;
end;
$$;

revoke all on function public.sessions_payout_status() from public;
grant execute on function public.sessions_payout_status() to authenticated;

-- ── 4. So does the parent's page ────────────────────────────────────────────
--
-- The important one. A parent must see the number that is actually going to
-- arrive in their PayPal, and must see the equipment named as a separate thing
-- that gets handed over, not as money.
drop function if exists public.sessions_prize_consent_view(uuid);

create function public.sessions_prize_consent_view(p_token uuid)
returns table (
  entrant_name     text,
  song_title       text,
  guardian_name    text,
  prize_amount     numeric,   -- cash. What they are signing to receive.
  equipment_amount numeric,   -- named, but not paid.
  prize_currency   text,
  already_signed   boolean,
  signed_at        timestamptz,
  is_winner        boolean
)
language sql
security definer
set search_path = public
as $$
  select
    e.entrant_full_name,
    coalesce(s.title, t.title, 'their Sessions entry'),
    g.guardian_name,
    c.cash_prize_amount,
    coalesce(c.equipment_prize_amount, 0),
    coalesce(c.cash_prize_currency, 'ZAR'),
    g.prize_consented_at is not null,
    g.prize_consented_at,
    coalesce(e.is_winner, false)
  from public.school_sessions_guardian_consents g
  join public.school_sessions_entries e on e.id = g.entry_id
  left join public.competitions c on c.id = e.competition_id
  left join public.school_sessions_shortlist_songs s on s.id = e.song_id
  left join public.tracks t on t.id = e.track_id
  where g.prize_consent_token = p_token;
$$;

revoke all on function public.sessions_prize_consent_view(uuid) from public;
grant execute on function public.sessions_prize_consent_view(uuid) to anon, authenticated;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 cash part' as k, (select 'R' || cash_prize_amount::text from public.competitions where id=(select competition_id from public.school_sessions_config limit 1)) as v
union all
select '2 equipment part', (select 'R' || equipment_prize_amount::text from public.competitions where id=(select competition_id from public.school_sessions_config limit 1))
union all
select '3 they still add to the headline', (select case when cash_prize_amount + equipment_prize_amount = 10000 then 'yes, R10,000' else 'NO, CHECK THIS' end from public.competitions where id=(select competition_id from public.school_sessions_config limit 1))
union all
select '4 public copy untouched', (select left(coalesce(prize_breakdown_text,'(empty)'), 60) from public.competitions where id=(select competition_id from public.school_sessions_config limit 1))
union all
select '5 wheel competitions affected', (select count(*)::text from public.competitions where wheel_challenge and coalesce(cash_prize_amount,0) <> 0)
union all
select '6 payout status columns', (select count(*)::text from pg_proc p, unnest(p.proargmodes) m where p.proname='sessions_payout_status' and m='t')
union all
select '7 consent view columns', (select count(*)::text from pg_proc p, unnest(p.proargmodes) m where p.proname='sessions_prize_consent_view' and m='t')
order by 1;
