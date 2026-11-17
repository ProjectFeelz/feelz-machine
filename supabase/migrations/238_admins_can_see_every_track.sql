-- supabase/migrations/238_admins_can_see_every_track.sql
--
-- THE ADMIN PANEL HAS BEEN COUNTING TRACKS THROUGH A LISTENER'S EYES.
--
--
-- WHAT IS WRONG
--
-- Platform health says the published share is 99.4%, 156 of 157 tracks. The
-- real numbers are 156 of 216, which is 72.2%.
--
-- 156 is right. 157 is not. There are 216 tracks.
--
--
-- WHY THE DENOMINATOR IS WRONG AND THE NUMERATOR IS NOT
--
-- AdminAnalytics counts tracks from the browser, as you, so row level
-- security answers both questions. The SELECT policies on tracks are:
--
--   Published tracks are publicly viewable   is_published = true
--   Artists can view own tracks              your own artist rows
--   Judges and admins can read entered tracks  can_judge_track(id)
--
-- Count published tracks and every one of them is visible, so 156 is correct.
-- Count ALL tracks and you see the 156 published ones plus your own
-- unpublished, which is one. 157. The ratio then compares a number against
-- itself and lands just under 100% no matter what the platform is doing.
--
-- It was never going to look wrong. A healthy-looking 99.4% is exactly what a
-- broken denominator produces here, which is why it sat there.
--
--
-- THE ASYMMETRY WORTH NAMING
--
-- tracks already has "Admins can update any track" and "Admins can delete any
-- track". It has no admin SELECT policy at all.
--
-- So an admin can delete a track they are not permitted to read. The write
-- side was granted and the read side was forgotten, and because reads fail
-- quietly by returning fewer rows rather than an error, nothing ever
-- complained. The contacts panel had the same shape and was fixed in 234.
--
--
-- WHY A POLICY AND NOT A FUNCTION
--
-- A SECURITY DEFINER count would fix this one number. The policy fixes every
-- admin screen that reads tracks, including the ones nobody has looked at
-- closely yet, and it needs no change to any JavaScript. Policies are OR'd, so
-- this adds nothing for anybody who is not in the admins table.

begin;

drop policy if exists "Admins can view any track" on public.tracks;

create policy "Admins can view any track"
  on public.tracks
  for select
  using (
    exists (
      select 1 from public.admins a
      where a.user_id = (select auth.uid())
    )
  );

comment on table public.tracks is
  'Admins hold SELECT, UPDATE and DELETE on every row. The SELECT half was missing until 238, which made every admin count of this table silently return published tracks plus the admin''s own.';

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 admin SELECT policy exists' as k,
  case when exists (
    select 1 from pg_policy
    where polrelid = 'public.tracks'::regclass
      and polname = 'Admins can view any track'
  ) then 'yes' else 'MISSING' end as v
union all
select '2 real total tracks',   (select count(*)::text from public.tracks)
union all
select '3 real published',      (select count(*)::text from public.tracks where is_published)
union all
select '4 real published share',
  (select round(100.0 * count(*) filter (where is_published) / nullif(count(*), 0), 1)::text || '%'
     from public.tracks)
union all
select '5 what the panel showed before', '156 / 157 = 99.4%'
union all
select '6 select policies on tracks now',
  (select count(*)::text from pg_policy
    where polrelid = 'public.tracks'::regclass and polcmd = 'r')
order by 1;
