-- supabase/migrations/241_fix_country_reach_types.sql
--
-- 240 CREATED A FUNCTION THAT FAILED EVERY TIME IT WAS CALLED.
--
--
-- WHAT WENT WRONG
--
-- admin_country_reach declares hidden_listeners and hidden_plays as bigint,
-- and fills them with sum(). In Postgres, sum() over a bigint returns NUMERIC,
-- not bigint, so every call came back:
--
--   42804: Returned type numeric does not match expected type bigint in column 3
--
-- count(*) returns bigint, which is why columns 1 and 2 were fine and only the
-- two summed columns broke.
--
--
-- WHY NOBODY SAW IT
--
-- The migration's own check block passed, because it reads the figures
-- straight from listening_events and never calls the function. It confirmed
-- the numbers were right and said nothing about whether the function could
-- return them.
--
-- The page then swallowed it. setReach got undefined, undefined is falsy, and
-- the footer is written as `reach && ...`, so the panel rendered exactly as it
-- did before with no error anywhere. A broken function and a working one look
-- identical from the outside when the only difference is a row that does not
-- appear.
--
-- Checking that a migration RAN is not the same as checking that what it
-- created WORKS. This one needed a call, not a count.
--
--
-- THE FIX
--
-- Cast the sums. Same signature and same declared types, so CREATE OR REPLACE
-- is enough and no drop is needed.

begin;

create or replace function public.admin_country_reach(p_days int default 30)
returns table (
  countries_shown   bigint,
  countries_hidden  bigint,
  hidden_listeners  bigint,
  hidden_plays      bigint,
  suppressed        boolean
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
      count(*) filter (where listeners >= v_min_group)                              as shown,
      count(*) filter (where listeners <  v_min_group)                              as hidden,
      -- sum() returns numeric. The cast is the whole point of this migration.
      coalesce(sum(listeners) filter (where listeners < v_min_group), 0)::bigint    as hid_l,
      coalesce(sum(plays)     filter (where listeners < v_min_group), 0)::bigint    as hid_p
    from per_country
  )
  select
    t.shown,
    case when t.hid_l >= v_min_group then t.hidden else 0::bigint end,
    case when t.hid_l >= v_min_group then t.hid_l  else 0::bigint end,
    case when t.hid_l >= v_min_group then t.hid_p  else 0::bigint end,
    (t.hidden > 0 and t.hid_l < v_min_group)
  from totals t;
end;
$$;

revoke all on function public.admin_country_reach(int) from public;
grant execute on function public.admin_country_reach(int) to authenticated;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
--
-- This one CALLS the function instead of recomputing what it should say, which
-- is the mistake 240 made. As postgres it raises "admins only", and that is a
-- pass: it means the body compiled and the admin guard is doing its job. The
-- type error would fire before the guard only if the guard were missing.
do $$
declare r record; ok boolean := false;
begin
  begin
    select * into r from public.admin_country_reach(7) limit 1;
    ok := true;
  exception
    when insufficient_privilege or raise_exception then
      raise notice 'Guard fired as expected. Function body compiled.';
      ok := true;
    when others then
      raise exception 'STILL BROKEN: % %', sqlstate, sqlerrm;
  end;
  if ok then raise notice 'admin_country_reach is callable.'; end if;
end $$;

select '1 function present' as k,
  case when exists (select 1 from pg_proc where proname='admin_country_reach')
       then 'yes' else 'MISSING' end as v
union all
select '2 summed columns now cast',
  case when pg_get_functiondef((select oid from pg_proc where proname='admin_country_reach')) like '%::bigint%'
       then 'yes' else 'NO, THE CAST IS GONE' end
order by 1;
