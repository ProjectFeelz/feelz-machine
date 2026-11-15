-- supabase/migrations/226_judges_can_see_themselves.sql
--
-- A JUDGE COULD NOT TELL THEY WERE A JUDGE.
--
-- The Hub decides whether to show the Judge Panel card like this:
--
--   select id from school_sessions_judges where user_id = <me> limit 1
--
-- That is the right question. The problem is that school_sessions_judges has
-- no policy letting an ordinary signed-in person read any row at all, so the
-- query comes back empty for the very person it is asking about. A judge who
-- is also an admin sees the card, because admins get it from the admin block
-- higher up the page. Everybody else is a judge with no way in and no sign
-- that anything is wrong.
--
-- That is why it works for you and not for Davu.
--
-- This grants exactly one thing: you may see YOUR OWN judge row. Not the
-- panel of judges, not who else is judging, not which competitions anybody
-- else sits on. The list of judges stays private.

begin;

drop policy if exists judges_can_see_their_own_row on public.school_sessions_judges;
create policy judges_can_see_their_own_row
  on public.school_sessions_judges
  for select
  to authenticated
  using (user_id = auth.uid());

-- The Hub reads id and user_id; the judge panel reads competition_id to check
-- which season you are judging. Granted narrowly rather than opening the
-- table, in case it ever gains a column that should not travel.
grant select (id, user_id, competition_id) on public.school_sessions_judges to authenticated;

commit;

-- ── Adding a judge ──────────────────────────────────────────────────────────
--
-- Uncomment, put the real address in, and run it. admin_find_user_by_email
-- reads auth.users, so it finds anybody with an account rather than only the
-- 36 who happened to have an email on their profile row.
--
-- insert into public.school_sessions_judges (user_id, competition_id)
-- select public.admin_find_user_by_email('davu@example.com'),
--        (select competition_id from public.school_sessions_config limit 1)
-- where public.admin_find_user_by_email('davu@example.com') is not null
--   and not exists (
--     select 1 from public.school_sessions_judges j
--     where j.user_id = public.admin_find_user_by_email('davu@example.com')
--   );

-- ── Check ───────────────────────────────────────────────────────────────────
select 'self-read policy' as k,
       case when exists (
         select 1 from pg_policies
         where tablename = 'school_sessions_judges'
           and policyname = 'judges_can_see_their_own_row'
       ) then 'yes' else 'NO, FIX THIS' end as v
union all
select 'judges on the live season', count(*)::text
from school_sessions_judges
union all
select 'who they are', coalesce(string_agg(u.email, ', '), 'nobody')
from school_sessions_judges j join auth.users u on u.id = j.user_id
order by 1;
