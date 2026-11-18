-- supabase/migrations/245_admin_functions_that_never_checked.sql
--
-- NINE FUNCTIONS NAMED admin_ THAT ANY SIGNED-IN USER COULD CALL.
--
--
-- WHAT IS WRONG
--
-- These nine are SECURITY DEFINER, so they run with the owner's rights and
-- ignore row level security and column grants entirely. That is the point of
-- them: an admin screen needs to see across accounts. Every other admin
-- function on this platform earns that by asking first:
--
--     if not exists (select 1 from public.admins a where a.user_id = auth.uid())
--     then raise exception 'admins only'; end if;
--
-- These nine never ask. EXECUTE is granted to authenticated, so anybody with
-- a Feelz Machine account can call them straight from the browser.
--
--
-- THE ONE THAT MATTERS
--
-- admin_school_entries returns entrant_email. There are 15 Sessions entrants
-- and 5 of them are minors.
--
-- school_sessions_entries is protected properly at the table: anon and
-- authenticated hold COLUMN grants that deliberately exclude entrant_email
-- and entrant_is_minor. Somebody thought about that and got it right.
--
-- A SECURITY DEFINER function steps over column grants without noticing them.
-- So the careful work at the table was being undone by one unguarded function
-- sitting next to it.
--
-- Two of the nine also WRITE: set and delete a district nomination.
--
--
-- WHY WRAPPERS AND NOT NINE REWRITES
--
-- The guard could be pasted into each body. That means retyping nine working
-- functions to add one line to each, and the bodies are long enough that the
-- SQL editor truncates them, so they would be retyped from a reading rather
-- than copied. Nine chances to change something nobody meant to change.
--
-- Instead each function is renamed to _impl and locked so nothing can reach
-- it, and a wrapper takes the original name, asks the question, and calls
-- through. Not one line of working logic is touched or even read. The app
-- keeps calling the same names with the same arguments and gets the same
-- results, when it is allowed to.
--
-- The convention already exists here: admin_behavior_summary_impl.
--
--
-- WHAT CALLS THEM
--
-- All nine are called from real admin screens: AdminSchoolSessions,
-- AdminAnalytics, AdminDashboard, AdminDuplicates. So revoking EXECUTE from
-- authenticated is NOT the fix. Admins are authenticated too, and that would
-- break every one of those pages. They need the guard, not a locked door.

begin;

-- ── admin_school_entries(uuid) -> jsonb ─────────────────────────────────────
alter function public.admin_school_entries(uuid) rename to admin_school_entries_impl;
revoke all on function public.admin_school_entries_impl(uuid) from public, anon, authenticated;

create function public.admin_school_entries(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  return public.admin_school_entries_impl(p_competition_id);
end; $$;

-- ── admin_school_nominations() -> jsonb ─────────────────────────────────────
alter function public.admin_school_nominations() rename to admin_school_nominations_impl;
revoke all on function public.admin_school_nominations_impl() from public, anon, authenticated;

create function public.admin_school_nominations()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  return public.admin_school_nominations_impl();
end; $$;

-- ── admin_platform_totals() -> jsonb ────────────────────────────────────────
alter function public.admin_platform_totals() rename to admin_platform_totals_impl;
revoke all on function public.admin_platform_totals_impl() from public, anon, authenticated;

create function public.admin_platform_totals()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  return public.admin_platform_totals_impl();
end; $$;

-- ── admin_set_district_nomination(uuid, boolean) -> void  [WRITE] ───────────
alter function public.admin_set_district_nomination(uuid, boolean) rename to admin_set_district_nomination_impl;
revoke all on function public.admin_set_district_nomination_impl(uuid, boolean) from public, anon, authenticated;

create function public.admin_set_district_nomination(p_id uuid, p_approved boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  perform public.admin_set_district_nomination_impl(p_id, p_approved);
end; $$;

-- ── admin_delete_district_nomination(uuid) -> void  [WRITE] ─────────────────
alter function public.admin_delete_district_nomination(uuid) rename to admin_delete_district_nomination_impl;
revoke all on function public.admin_delete_district_nomination_impl(uuid) from public, anon, authenticated;

create function public.admin_delete_district_nomination(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  perform public.admin_delete_district_nomination_impl(p_id);
end; $$;

-- ── admin_duplicate_artist_groups() -> setof ────────────────────────────────
alter function public.admin_duplicate_artist_groups() rename to admin_duplicate_artist_groups_impl;
revoke all on function public.admin_duplicate_artist_groups_impl() from public, anon, authenticated;

create function public.admin_duplicate_artist_groups()
returns table (
  group_key text, id uuid, artist_name text, slug text, profile_image_url text,
  tier text, follower_count integer, created_at timestamptz, user_id uuid
) language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  return query select * from public.admin_duplicate_artist_groups_impl();
end; $$;

-- ── admin_platform_7d_stats(int) -> setof ───────────────────────────────────
alter function public.admin_platform_7d_stats(integer) rename to admin_platform_7d_stats_impl;
revoke all on function public.admin_platform_7d_stats_impl(integer) from public, anon, authenticated;

create function public.admin_platform_7d_stats(p_days integer)
returns table (
  streams bigint, tips_usd numeric, downloads_usd numeric,
  beats_usd numeric, revenue_usd numeric, fan_pro_active bigint
) language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  return query select * from public.admin_platform_7d_stats_impl(p_days);
end; $$;

-- ── admin_signup_timeline(int) -> setof ─────────────────────────────────────
alter function public.admin_signup_timeline(integer) rename to admin_signup_timeline_impl;
revoke all on function public.admin_signup_timeline_impl(integer) from public, anon, authenticated;

create function public.admin_signup_timeline(p_days integer)
returns table (day date, artists bigint, listeners bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  return query select * from public.admin_signup_timeline_impl(p_days);
end; $$;

-- ── admin_stream_timeline(int) -> setof ─────────────────────────────────────
alter function public.admin_stream_timeline(integer) rename to admin_stream_timeline_impl;
revoke all on function public.admin_stream_timeline_impl(integer) from public, anon, authenticated;

create function public.admin_stream_timeline(p_days integer)
returns table (day date, streams bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  return query select * from public.admin_stream_timeline_impl(p_days);
end; $$;

-- ── The grants the app actually needs ───────────────────────────────────────
grant execute on function public.admin_school_entries(uuid)                 to authenticated;
grant execute on function public.admin_school_nominations()                 to authenticated;
grant execute on function public.admin_platform_totals()                    to authenticated;
grant execute on function public.admin_set_district_nomination(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_district_nomination(uuid)     to authenticated;
grant execute on function public.admin_duplicate_artist_groups()            to authenticated;
grant execute on function public.admin_platform_7d_stats(integer)           to authenticated;
grant execute on function public.admin_signup_timeline(integer)             to authenticated;
grant execute on function public.admin_stream_timeline(integer)             to authenticated;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
with named as (
  select unnest(array[
    'admin_school_entries','admin_school_nominations','admin_platform_totals',
    'admin_set_district_nomination','admin_delete_district_nomination',
    'admin_duplicate_artist_groups','admin_platform_7d_stats',
    'admin_signup_timeline','admin_stream_timeline'
  ]) n
)
select '1 wrappers in place' as k,
  (select count(*)::text from named j
    join pg_proc p on p.proname = j.n and p.pronamespace = 'public'::regnamespace) || ' of 9' as v
union all
select '2 every wrapper now guarded',
  (select count(*)::text from named j
     join pg_proc p on p.proname = j.n and p.pronamespace='public'::regnamespace
    where pg_get_functiondef(p.oid) ilike '%admins only%') || ' of 9'
union all
select '3 _impl bodies sealed off',
  (select count(*)::text from pg_proc p
    where p.pronamespace='public'::regnamespace
      and p.proname like 'admin\_%\_impl'
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  || ' unreachable by authenticated'
union all
select '4 admin_ functions still unguarded and callable',
  coalesce((select string_agg(p.proname, ', ') from pg_proc p
     where p.pronamespace='public'::regnamespace and p.prosecdef
       and p.proname like 'admin%' and p.proname not like '%\_impl'
       and pg_get_functiondef(p.oid) not ilike '%admins%'
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))), 'none, all closed')
union all
select '5 entrant emails still reachable without admin',
  case when has_function_privilege('authenticated', 'public.admin_school_entries_impl(uuid)', 'EXECUTE')
       then 'YES, CHECK THIS' else 'no' end
order by 1;
