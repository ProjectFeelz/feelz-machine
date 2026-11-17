-- supabase/migrations/240_country_reach_without_naming_anyone.sql
--
-- "SOUTH AFRICA, 100%" IS TRUE AND IT IS ALSO HIDING THE BEST NEWS YOU HAVE.
--
--
-- WHAT THE PANEL IS DOING, AND WHY IT IS RIGHT
--
-- get_platform_listener_stats builds by_country with:
--
--     having count(distinct user_id) >= v_min_group      -- v_min_group = 3
--
-- A country with one or two listeners is dropped. That is not a bug, it is a
-- privacy guard, and it is a good one. Outside South Africa almost every
-- country has exactly one listener right now. Printing "Italy, 1 listener"
-- next to a panel that also lists CITIES does not describe a market, it
-- describes a person. The guard stays exactly as it is.
--
--
-- WHAT IS ACTUALLY LOST
--
-- Suppressing the rows also suppressed the fact that they exist. Over 90 days
-- that is 19 countries, 24 listeners and 299 plays reported as nothing at all,
-- so the honest summary of the platform reads "we are South African" when the
-- truer one is "we are South African and twenty other places are listening".
--
-- You cannot see reach you are not told about, and this is the kind of number
-- that changes what somebody does next.
--
--
-- WHY A SECOND FUNCTION AND NOT AN EDIT TO THE FIRST
--
-- get_platform_listener_stats is around ninety lines building one jsonb object
-- with six sections. Replacing it means retyping all of it to change four
-- lines, and a function that must be rewritten in full to be touched at all is
-- exactly where a quiet mistake gets made in the five sections nobody meant to
-- change.
--
-- This adds a small function beside it instead. The original keeps working
-- untouched, the guard keeps guarding, and the page makes one extra call to
-- learn the size of what it was not shown.
--
--
-- THE AGGREGATE IS GUARDED TOO
--
-- The same k >= 3 rule is applied to the bucket itself. If the hidden
-- countries add up to fewer than three listeners between them, the whole row
-- is suppressed rather than published as "1 country, 1 listener", which would
-- hand back exactly the detail the threshold exists to withhold.

begin;

create or replace function public.admin_country_reach(p_days int default 30)
returns table (
  countries_shown   bigint,   -- named in the panel
  countries_hidden  bigint,   -- real, deliberately unnamed
  hidden_listeners  bigint,
  hidden_plays      bigint,
  suppressed        boolean   -- true when even the aggregate is too small
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_group int := 3;   -- must match get_platform_listener_stats
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;

  return query
  with per_country as (
    select e.country,
           count(distinct e.user_id) as listeners,
           count(*)                  as plays
    from public.listening_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and e.country is not null
    group by e.country
  ),
  totals as (
    select
      count(*) filter (where listeners >= v_min_group)                    as shown,
      count(*) filter (where listeners <  v_min_group)                    as hidden,
      coalesce(sum(listeners) filter (where listeners < v_min_group), 0)  as hid_l,
      coalesce(sum(plays)     filter (where listeners < v_min_group), 0)  as hid_p
    from per_country
  )
  select
    t.shown,
    case when t.hid_l >= v_min_group then t.hidden  else 0::bigint end,
    case when t.hid_l >= v_min_group then t.hid_l   else 0::bigint end,
    case when t.hid_l >= v_min_group then t.hid_p   else 0::bigint end,
    (t.hidden > 0 and t.hid_l < v_min_group)
  from totals t;
end;
$$;

revoke all on function public.admin_country_reach(int) from public;
grant execute on function public.admin_country_reach(int) to authenticated;

comment on function public.admin_country_reach(int) is
  'Companion to get_platform_listener_stats. Reports HOW MANY countries that function suppressed for being under its 3-listener privacy threshold, without naming any of them. Same threshold applied to the aggregate itself.';

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
--
-- Run as postgres this raises "admins only", which is the function working.
-- These read the same figures directly so you can see what it will return.
with per as (
  select country, count(distinct user_id) l, count(*) p
  from public.listening_events
  where created_at >= now() - interval '90 days' and country is not null
  group by country
)
select '1 function exists' as k,
  case when exists (select 1 from pg_proc where proname='admin_country_reach')
       then 'ready' else 'MISSING' end as v
from per limit 1
union all
select '2 named in the panel (90d)', (select count(*)::text from per where l >= 3)
union all
select '3 hidden countries (90d)',   (select count(*)::text from per where l < 3)
union all
select '4 hidden listeners (90d)',   (select coalesce(sum(l),0)::text from per where l < 3)
union all
select '5 hidden plays (90d)',       (select coalesce(sum(p),0)::text from per where l < 3)
union all
select '6 aggregate passes its own guard',
  (select case when coalesce(sum(l),0) >= 3 then 'yes, the row will show' else 'no, suppressed' end from per where l < 3)
order by 1;
