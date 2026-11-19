-- supabase/migrations/252_empty_the_candidate_card_number.sql
--
-- WIPE THE THREE VALUES NOW. DROP THE COLUMN AFTER LAUNCH.
--
--
-- WHAT HAPPENED TO THE FIRST VERSION OF THIS FILE
--
-- The first 252 tried to drop the column outright. It refused, by design, and
-- named what stopped it:
--
--   Not dropping it. These functions still read candidate_card_no:
--   admin_school_entries_impl. Fix them first.
--
-- That guard earned its place. Without it the column would have gone, and the
-- admin Sessions screen would have broken at call time rather than at
-- migration time, so the first person to find out would have been whoever
-- opened the page, probably mid-competition.
--
-- Nothing ran. The raise happened inside the transaction, so the database is
-- exactly as it was.
--
--
-- WHY THIS DOES LESS, AND WHY THAT IS RIGHT THIS WEEK
--
-- admin_school_entries_impl is the function migration 245 deliberately never
-- opened. It was renamed and wrapped precisely so its body never had to be
-- retyped from a reading that the SQL editor might have truncated. Dropping
-- the column means recreating that function, which means doing the one thing
-- 245 was written to avoid, four days before entries close.
--
-- So separate the two things that got bundled together:
--
--   The DATA is the actual concern. A school candidate number identifies a
--   child at a named school, five entrants are minors, and the purpose it was
--   collected for no longer exists. That can go today, safely, with one
--   update and no function touched.
--
--   The COLUMN is tidiness. An empty column that nothing writes to and
--   nothing reads meaningfully is not a risk, it is clutter. Clutter can wait
--   eleven days.
--
-- After this runs, the field is gone from the form, gone from the upload
-- write, gone from the admin screen, gone from the CSV, and holds nothing.
-- admin_school_entries_impl carries on reading a column that is always null,
-- which is harmless and changes nothing on screen.
--
--
-- WHAT IS LEFT TO DO, SO IT IS NOT FORGOTTEN
--
-- Migration 253, after 1 December: recreate admin_school_entries_impl without
-- the field, then drop the column. The guard from the first 252 goes in front
-- of it unchanged.

begin;

update public.school_sessions_entries
set candidate_card_no = null
where candidate_card_no is not null;

comment on column public.school_sessions_entries.candidate_card_no is
  'DEAD. School candidate number from the School Sessions era. Nothing writes it, the form field is gone, and its values were wiped in migration 252. Drop it in 253 once admin_school_entries_impl no longer names it.';

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 values still stored' as k,
  (select count(*)::text from public.school_sessions_entries
    where candidate_card_no is not null and candidate_card_no <> '')
  || ' (should be 0)' as v
union all
select '2 entries still intact',
  (select count(*)::text from public.school_sessions_entries) || ' entries'
union all
select '3 nobody lost an entry',
  (select count(*)::text from public.school_sessions_entries where track_id is not null)
  || ' entries still have their track'
union all
select '4 what still names the column',
  coalesce((select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
     where p.pronamespace='public'::regnamespace
       and pg_get_functiondef(p.oid) ilike '%candidate_card_no%'), 'nothing')
union all
-- The number to hand me when the computer is back, so 253 can be written
-- without guessing at the size of the job.
select '5 size of the function 253 has to recreate',
  coalesce((select length(pg_get_functiondef('public.admin_school_entries_impl(uuid)'::regprocedure))::text
            || ' characters'), 'not found')
union all
select '6 the exact lines 253 has to change',
  coalesce((select string_agg(trim(ln), '  ///  ') from (
     select unnest(string_to_array(
       pg_get_functiondef('public.admin_school_entries_impl(uuid)'::regprocedure), E'\n')) as ln
   ) z where ln ilike '%candidate_card_no%'), 'none')
order by 1;
