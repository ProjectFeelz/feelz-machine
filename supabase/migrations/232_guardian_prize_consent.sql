-- supabase/migrations/232_guardian_prize_consent.sql
--
-- A GUARDIAN SIGNING FOR A MINOR'S PRIZE, END TO END.
--
--
-- WHAT ALREADY EXISTED, AND WHY THIS IS SMALL
--
-- school_sessions_guardian_consents is already there and already has a row for
-- all five entrants under 18: guardian_name, guardian_contact, relationship,
-- consented, consented_at. A parent has already said yes once.
--
-- They said yes to their child ENTERING. That is not the same as saying yes to
-- receiving ten thousand rand on their behalf, and it does not tell us where
-- the money goes. So this adds the second consent to the same row rather than
-- building a parallel system, and the guardian we already have on file is the
-- person it goes to.
--
--
-- HOW IT WORKS FROM THE PARENT'S SIDE
--
-- Every consent row gets a token. The token is a URL:
--
--     /sessions/prize-consent/<token>
--
-- The parent opens it on their phone. No account, no password, no app. They
-- see their child's name, the song, the amount, and plain words about what
-- they are agreeing to. They put in the PayPal address the money should go to,
-- type their own full name as a signature, and submit. That is the whole thing.
--
-- The link is not emailed by the platform on purpose. A parent in South Africa
-- answers WhatsApp and does not answer email from a music app they have never
-- heard of. The admin screen shows the link with a copy button so Steve sends
-- it the way he would actually reach them.
--
--
-- WHY THE TOKEN IS SAFE ENOUGH
--
-- It is a random uuid, so it cannot be guessed. It reveals a first name, a song
-- title and a prize amount, all of which are already public on the entry page.
-- It cannot read anything else and it cannot be reused to change a signature
-- once given: once prize_consented_at is set, signing again is refused.
--
-- The money still only ever moves when an admin clicks send. A signature
-- authorises a payout, it does not trigger one.

begin;

-- ── 1. The second consent, on the row that already holds the first ──────────
alter table public.school_sessions_guardian_consents
  add column if not exists prize_consent_token uuid not null default gen_random_uuid(),
  add column if not exists prize_paypal_email  text,
  add column if not exists prize_signed_name   text,
  add column if not exists prize_consented_at  timestamptz;

create unique index if not exists ss_guardian_prize_token
  on public.school_sessions_guardian_consents (prize_consent_token);

-- ── 2. What the parent sees when they open the link ─────────────────────────
--
-- security definer and granted to anon, because a parent is not signed in and
-- never will be. It returns four facts and nothing else. An unknown token
-- returns no rows rather than an error, so the page can say "this link is not
-- valid" instead of showing a stack trace.
create or replace function public.sessions_prize_consent_view(p_token uuid)
returns table (
  entrant_name   text,
  song_title     text,
  guardian_name  text,
  prize_amount   numeric,
  prize_currency text,
  already_signed boolean,
  signed_at      timestamptz,
  is_winner      boolean
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

-- ── 3. Signing ──────────────────────────────────────────────────────────────
--
-- Returns a word rather than raising, because the page has to tell a parent
-- what went wrong in a sentence they can act on, and a Postgres error is not
-- that.
create or replace function public.sessions_prize_consent_sign(
  p_token        uuid,
  p_paypal_email text,
  p_signed_name  text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select * into v_row from public.school_sessions_guardian_consents
  where prize_consent_token = p_token;

  if v_row.id is null then return 'unknown_link'; end if;
  if v_row.prize_consented_at is not null then return 'already_signed'; end if;

  if coalesce(trim(p_signed_name), '') = '' then return 'name_required'; end if;
  -- Deliberately loose. Rejecting a real address because it has a plus in it
  -- costs a prize; letting a typo through costs a bounced payout that an admin
  -- sees and fixes.
  if coalesce(trim(p_paypal_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'email_invalid';
  end if;

  update public.school_sessions_guardian_consents
  set prize_paypal_email = lower(trim(p_paypal_email)),
      prize_signed_name  = trim(p_signed_name),
      prize_consented_at = now()
  where prize_consent_token = p_token;

  return 'signed';
end;
$$;

revoke all on function public.sessions_prize_consent_view(uuid) from public;
revoke all on function public.sessions_prize_consent_sign(uuid, text, text) from public;
grant execute on function public.sessions_prize_consent_view(uuid) to anon, authenticated;
grant execute on function public.sessions_prize_consent_sign(uuid, text, text) to anon, authenticated;

-- ── 4. The payout status now knows about guardians ──────────────────────────
--
-- Replaces the version from 230. The difference: for a winner under 18, the
-- PayPal address that matters is the GUARDIAN'S, not the entrant's, and the
-- route is not open until that guardian has actually signed. The tick box on
-- the admin screen used to be an honour system. Now it reports a signature
-- that exists or it blocks.
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
  v_comp   uuid;
  v_entry  record;
  v_g      record;
  v_email  text;
  v_paid   text;
  v_minor  boolean;
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
      'No winner marked yet. Mark one in the entries list below.'::text,
      null::text, null::timestamptz, null::uuid;
    return;
  end if;

  v_minor := coalesce(v_entry.entrant_is_minor, false);

  select g.* into v_g
  from public.school_sessions_guardian_consents g
  where g.entry_id = v_entry.id
  limit 1;

  if v_minor then
    v_email := nullif(trim(coalesce(v_g.prize_paypal_email, '')), '');
  else
    select coalesce(
             (select nullif(trim(p.paypal_email), '') from public.artist_payment_profiles p
               where p.artist_id = v_entry.artist_id),
             (select nullif(trim(ar.paypal_email), '') from public.artists ar
               where ar.id = v_entry.artist_id)
           )
      into v_email;
  end if;

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
    v_minor,
    coalesce(v_entry.is_group, false),
    (select cmp.cash_prize_amount from public.competitions cmp where cmp.id = v_comp),
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
    v_g.guardian_name,
    v_g.prize_consented_at,
    v_g.prize_consent_token;
end;
$$;

revoke all on function public.sessions_payout_status() from public;
grant execute on function public.sessions_payout_status() to authenticated;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 minors with a guardian row' as k, (
  select count(*)::text from school_sessions_entries e
  where e.entrant_is_minor and exists (
    select 1 from school_sessions_guardian_consents g where g.entry_id = e.id)) as v
union all
select '2 minors total', (select count(*)::text from school_sessions_entries where entrant_is_minor)
union all
select '3 consent tokens issued', (select count(*)::text from school_sessions_guardian_consents where prize_consent_token is not null)
union all
select '4 guardians who have signed for a prize', (select count(*)::text from school_sessions_guardian_consents where prize_consented_at is not null)
union all
select '5 consent page function', case when exists (select 1 from pg_proc where proname='sessions_prize_consent_view') then 'ready' else 'MISSING' end
union all
select '6 signing function', case when exists (select 1 from pg_proc where proname='sessions_prize_consent_sign') then 'ready' else 'MISSING' end
order by 1;
