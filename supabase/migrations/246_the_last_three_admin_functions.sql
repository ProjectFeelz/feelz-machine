-- supabase/migrations/246_the_last_three_admin_functions.sql
--
-- THE THREE 245 MISSED, AND HOW THEY WERE MISSED.
--
--
-- WHAT HAPPENED
--
-- 245 closed nine unguarded admin_ functions. Its own check block then named
-- three more still open: admin_top_genres, admin_trending_genres and
-- admin_upload_timeline.
--
-- They were not a different kind of problem. They were in the original query's
-- results and never reached the screen: the output was read as a fixed slice
-- of text, the list ran past it, and these three sort alphabetically after
-- admin_stream_timeline. Nine were fixed because nine were visible.
--
-- Worth writing down, because the lesson is not about these functions. A
-- truncated answer looks exactly like a complete one. The only reason this
-- was caught is that 245's check asked the question again afterwards instead
-- of reporting what it had just done.
--
--
-- WHAT THEY EXPOSE
--
-- Less than admin_school_entries did. No personal data: genre names, stream
-- counts and upload counts per day, platform-wide. Nothing identifies a
-- person, and all three are read-only.
--
-- They are still platform-wide business figures that any signed-in account
-- could read on demand, and they are named admin_ because they were meant to
-- be admin-only. Same treatment, same reason.
--
-- Two of the three are LANGUAGE SQL rather than plpgsql, so their wrappers
-- are plpgsql and call through. The bodies are untouched either way.

begin;

-- ── admin_top_genres(int) -> setof ──────────────────────────────────────────
alter function public.admin_top_genres(integer) rename to admin_top_genres_impl;
revoke all on function public.admin_top_genres_impl(integer) from public, anon, authenticated;

create function public.admin_top_genres(p_limit integer)
returns table (genre text, streams bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  return query select * from public.admin_top_genres_impl(p_limit);
end; $$;

-- ── admin_trending_genres(int, int) -> setof ────────────────────────────────
alter function public.admin_trending_genres(integer, integer) rename to admin_trending_genres_impl;
revoke all on function public.admin_trending_genres_impl(integer, integer) from public, anon, authenticated;

create function public.admin_trending_genres(p_days integer, p_limit integer)
returns table (genre text, streams bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  return query select * from public.admin_trending_genres_impl(p_days, p_limit);
end; $$;

-- ── admin_upload_timeline(int) -> setof ─────────────────────────────────────
alter function public.admin_upload_timeline(integer) rename to admin_upload_timeline_impl;
revoke all on function public.admin_upload_timeline_impl(integer) from public, anon, authenticated;

create function public.admin_upload_timeline(p_days integer)
returns table (day date, tracks bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'admins only';
  end if;
  return query select * from public.admin_upload_timeline_impl(p_days);
end; $$;

grant execute on function public.admin_top_genres(integer)                to authenticated;
grant execute on function public.admin_trending_genres(integer, integer)  to authenticated;
grant execute on function public.admin_upload_timeline(integer)           to authenticated;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
--
-- Deliberately asks the WHOLE question again rather than checking the three
-- this file touched. That is what found them in the first place.
select '1 admin_ functions still unguarded and callable' as k,
  coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
     where p.pronamespace='public'::regnamespace and p.prosecdef
       and p.proname like 'admin%' and p.proname not like '%\_impl'
       and pg_get_functiondef(p.oid) not ilike '%admins%'
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
    'none, all closed') as v
union all
select '2 how many admin_ wrappers now guarded',
  (select count(*)::text from pg_proc p
    where p.pronamespace='public'::regnamespace and p.proname like 'admin%'
      and p.proname not like '%\_impl'
      and pg_get_functiondef(p.oid) ilike '%admins only%')
union all
select '3 _impl bodies unreachable by authenticated',
  (select count(*)::text from pg_proc p
    where p.pronamespace='public'::regnamespace and p.proname like '%\_impl'
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
union all
-- The wider sweep, not just the admin_ prefix. A definer function that reads
-- across accounts is the same risk whatever it is called.
select '4 NON-admin definer functions touching personal columns, callable by anyone',
  coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
     where p.pronamespace='public'::regnamespace and p.prosecdef
       and p.proname not like 'admin%' and p.proname not like '%\_impl'
       and pg_get_functiondef(p.oid) not ilike '%admins%'
       and pg_get_functiondef(p.oid) not ilike '%auth.uid()%'
       and (pg_get_functiondef(p.oid) ilike '%entrant_email%'
         or pg_get_functiondef(p.oid) ilike '%guardian_%'
         or pg_get_functiondef(p.oid) ilike '%paypal_email%'
         or pg_get_functiondef(p.oid) ilike '%.email%'
         or pg_get_functiondef(p.oid) ilike '%phone%')
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
    'none')
order by 1;
