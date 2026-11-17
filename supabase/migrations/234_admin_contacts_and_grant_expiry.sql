-- supabase/migrations/234_admin_contacts_and_grant_expiry.sql
--
-- TWO FIXES. THE ADMIN CONTACTS PANEL, AND GRANTS THAT NEVER END.
--
--
-- ── 1. WHY THE CONTACTS PANEL WAS LYING ─────────────────────────────────────
--
-- The panel said 1 email subscriber. There are 613. It said 104 artist
-- contacts. There are 1,004, across 65 artists.
--
-- Nothing is wrong with the queries. AdminAnalytics.js asks for an exact count
-- of the whole table, correctly. The problem is that it asks from the browser,
-- as the signed-in admin, and row level security answers the question it was
-- actually asked: how many of these rows may THIS PERSON see.
--
--   artist_contacts     one policy, "Artists see own contacts". No admin
--                       policy at all. So Steve saw his own 106 and the card
--                       labelled it platform-wide.
--
--   email_subscribers   policies are "Anyone can subscribe" for insert and
--                       "Authenticated users manage own subscription" for
--                       everything else, scoped to auth.uid() = user_id. So
--                       Steve saw exactly one row. His own. The card said 1.
--
--   global_contacts     already HAS "Admins can view all global contacts",
--                       which is why that card was the only one close to
--                       right. This migration copies that pattern onto the
--                       other two.
--
-- WORTH KNOWING: this was never only a display bug. AdminAnalytics also
-- EXPORTS these tables to CSV, and those exports went through the same
-- policies. Every subscriber export taken from this panel contained one row.
-- The data was always there; nobody was ever allowed to read it.
--
--
-- ── 2. GRANTS THAT NEVER END ────────────────────────────────────────────────
--
-- A correction first, because the earlier reading of this was wrong.
--
-- artists.tier_expires_at is empty for every premium and pro artist, which
-- looks like nothing can ever expire. It is not. That column is a mirror that
-- nothing has ever written to. The real dates live in
-- artist_tier_subscriptions.expires_at, and artist_has_active_plan() reads
-- that table, so the gate has been working correctly all along.
--
-- Three grants do have end dates: Ian Sani 26 Nov 2026, Kanamo Leokor
-- 07 Dec 2026, Nova G. Nora 03 Feb 2027.
--
-- Four have none: Feelz Machine, Big Feelz, Steve C-SA and Sweet melodyz.
-- Those four are deliberate and stay deliberate. Three are Steve's own
-- accounts and the fourth is family. What was missing was any way to tell
-- "deliberately forever" apart from "nobody filled in the date", which is why
-- this adds a flag rather than a deadline.
--
-- So: the four are marked permanent, the mirror column is filled and kept in
-- step, and anything else without an end date shows up in a view instead of
-- hiding in a table nobody reads.
--
-- This deliberately does NOT refuse new endless grants. Raising an exception
-- inside a live admin flow mid-build is how a working screen breaks on a
-- Friday. The view makes them visible; turning that into a hard refusal is a
-- few lines whenever Steve wants it.

begin;

-- ── Admins can read the contact tables ──────────────────────────────────────
--
-- Read only, and admin only. Nothing here lets anyone write to these tables,
-- and the existing per-user policies are untouched: an artist still sees their
-- own contacts and a listener still manages their own subscription exactly as
-- before. This only adds a second way in, for the people the panel was built
-- for.
drop policy if exists "Admins can view all artist contacts" on public.artist_contacts;
create policy "Admins can view all artist contacts"
  on public.artist_contacts
  for select
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "Admins can view all email subscribers" on public.email_subscribers;
create policy "Admins can view all email subscribers"
  on public.email_subscribers
  for select
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

-- ── Permanent grants, said out loud ─────────────────────────────────────────
alter table public.artist_tier_subscriptions
  add column if not exists is_permanent boolean not null default false;

comment on column public.artist_tier_subscriptions.is_permanent is
  'True means this grant is meant to run forever and expires_at being empty is intentional. Everything else with no end date is an oversight and shows up in grants_without_an_end_date.';

update public.artist_tier_subscriptions s
set is_permanent = true
from public.artists a
where a.id = s.artist_id
  and s.status = 'active'
  and s.expires_at is null
  and a.artist_name in ('Feelz Machine', 'Big Feelz', 'Steve C-SA', 'Sweet melodyz');

-- ── Fill the mirror, and keep it filled ─────────────────────────────────────
--
-- artists.tier_expires_at is what admin screens and anything casual will reach
-- for, because it is the obvious column with the obvious name. Leaving it
-- empty while the truth sits in another table is how both of us got this
-- wrong. The trigger means it cannot drift again.
create or replace function public.mirror_tier_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.artists a
  set tier_expires_at = (
        select max(s.expires_at)
        from public.artist_tier_subscriptions s
        where s.artist_id = a.id and s.status = 'active'
      ),
      tier_started_at = coalesce(a.tier_started_at, (
        select min(s.started_at)
        from public.artist_tier_subscriptions s
        where s.artist_id = a.id and s.status = 'active'
      ))
  where a.id = coalesce(new.artist_id, old.artist_id);
  return null;
end;
$$;

drop trigger if exists trg_mirror_tier_expiry on public.artist_tier_subscriptions;
create trigger trg_mirror_tier_expiry
  after insert or update of expires_at, status, started_at or delete
  on public.artist_tier_subscriptions
  for each row execute function public.mirror_tier_expiry();

-- Backfill what the trigger would have done.
update public.artists a
set tier_expires_at = (
      select max(s.expires_at)
      from public.artist_tier_subscriptions s
      where s.artist_id = a.id and s.status = 'active'
    )
where exists (
  select 1 from public.artist_tier_subscriptions s
  where s.artist_id = a.id and s.status = 'active'
);

-- ── Anything endless that nobody meant ──────────────────────────────────────
create or replace view public.grants_without_an_end_date
with (security_invoker = true) as
  select a.artist_name, a.tier, s.id as subscription_id, s.started_at, s.status
  from public.artist_tier_subscriptions s
  join public.artists a on a.id = s.artist_id
  where s.status = 'active'
    and s.expires_at is null
    and s.is_permanent = false;

grant select on public.grants_without_an_end_date to authenticated;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 admin can read artist_contacts' as k,
  case when exists (select 1 from pg_policies where tablename='artist_contacts' and policyname='Admins can view all artist contacts') then 'yes' else 'NO' end as v
union all
select '2 admin can read email_subscribers',
  case when exists (select 1 from pg_policies where tablename='email_subscribers' and policyname='Admins can view all email subscribers') then 'yes' else 'NO' end
union all
select '3 what the panel should now show',
  (select count(*)::text from public.email_subscribers where subscribed) || ' subscribers, ' ||
  (select count(*)::text from public.artist_contacts) || ' artist contacts, ' ||
  (select count(*)::text from public.global_contacts) || ' global contacts'
union all
select '4 grants marked permanent', coalesce((
  select string_agg(a.artist_name, ', ') from public.artist_tier_subscriptions s
  join public.artists a on a.id = s.artist_id where s.is_permanent), 'none')
union all
select '5 endless grants nobody meant', coalesce((
  select string_agg(artist_name || ' (' || tier || ')', ', ') from public.grants_without_an_end_date), 'none, good')
union all
select '6 expiry mirror now filled', coalesce((
  select string_agg(artist_name || ' ' || to_char(tier_expires_at,'DD Mon YYYY'), ' | ')
  from public.artists where tier_expires_at is not null), 'none')
order by 1;
