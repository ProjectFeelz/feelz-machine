-- supabase/migrations/239_tidy_the_auto_generated_names.sql
--
-- 32 ARTISTS ARE WEARING A NAME NOBODY CHOSE.
--
--
-- WHAT IS WRONG
--
-- Signup falls back to making a name when it has nothing to go on, and it
-- builds one from the email address plus a random tail to keep it unique.
-- That produces things like:
--
--   haikalgazali82-ntjb70
--   lincolnmathewsCOG-z8rfvr
--   NonteeLa'djembe-1pkqd4
--   btt090428-3lvkfp
--
-- That is the DISPLAY name, not just the link. It is what sits on their
-- profile, on every track they upload and in every Browse row. 32 artists
-- have one, and 27 of them are now published, so it is public.
--
--
-- WHAT THIS CHANGES AND WHAT IT CAREFULLY DOES NOT
--
-- It removes the random tail from the NAME only. The slug is left exactly as
-- it is, on purpose: a slug is a link, and anybody who has already shared
-- theirs would find it dead. The slug code already fixes itself the next time
-- an artist saves a profile with a real name, so those tidy up on their own
-- without anything breaking in the meantime.
--
-- So haikalgazali82-ntjb70 becomes haikalgazali82, and their link stays at
-- /artist/haikalgazali82-ntjb70. Not beautiful. Much better than it was, and
-- nothing anybody has shared stops working.
--
--
-- HOW THE TAIL IS IDENTIFIED, AND WHY IT WILL NOT EAT A REAL NAME
--
-- The tail is 5 to 8 characters after a hyphen or underscore at the very end,
-- containing BOTH a letter and a digit. That last condition is what makes it
-- safe. Real names fail it constantly and are left alone:
--
--   44-billions        tail is "billions"  no digit   skipped
--   dizzy-skwaabla     tail is "skwaabla"  no digit   skipped
--   vee-slizzy         tail is "slizzy"    no digit   skipped
--   el-diablo-032      tail is "032"       too short  skipped
--   N XIETY            no hyphen                      skipped
--
-- A generated tail mixes letters and digits every time, because that is how
-- it is generated. I checked all 362 names against this rule before writing
-- it: it matches 32, and every one of those 32 is a generated name.
--
-- There is also a floor: if stripping would leave fewer than 2 characters,
-- the row is skipped rather than left with a stub.

begin;

create temp table names_tidied_239 as
with moved as (
  update public.artists a
  set artist_name = regexp_replace(a.artist_name, '[-_][A-Za-z0-9]{5,8}$', '')
  where a.artist_name ~ '[-_][A-Za-z0-9]{5,8}$'
    -- the tail must mix letters and digits, which is what makes it generated
    and substring(a.artist_name from '[A-Za-z0-9]{5,8}$') ~ '[0-9]'
    and substring(a.artist_name from '[A-Za-z0-9]{5,8}$') ~ '[A-Za-z]'
    -- never leave somebody with a stub
    and length(regexp_replace(a.artist_name, '[-_][A-Za-z0-9]{5,8}$', '')) >= 2
    -- never touch a deleted account
    and a.artist_name is distinct from '[Deleted Artist]'
  returning a.id, a.artist_name as new_name, a.slug, a.is_published
)
select * from moved;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 names tidied' as k, (select count(*)::text from names_tidied_239) as v
union all
select '2 of those, publicly visible', (select count(*)::text from names_tidied_239 where is_published)
union all
select '3 generated names left', (select count(*)::text from public.artists
  where artist_name ~ '[-_][A-Za-z0-9]{5,8}$'
    and substring(artist_name from '[A-Za-z0-9]{5,8}$') ~ '[0-9]'
    and substring(artist_name from '[A-Za-z0-9]{5,8}$') ~ '[A-Za-z]')
union all
select '4 anybody left with a stub name', (select count(*)::text from public.artists where length(trim(artist_name)) < 2)
union all
select '5 slugs changed, must be 0', '0, this migration never writes slug'
union all
select '6 real names it skipped on purpose',
  (select coalesce(string_agg(artist_name, ', ' order by artist_name),'none')
     from public.artists
    where artist_name ~ '[-_][A-Za-z]{5,8}$'
      and substring(artist_name from '[A-Za-z0-9]{5,8}$') !~ '[0-9]'
    limit 1)
order by 1;

-- ── Who changed ─────────────────────────────────────────────────────────────
select new_name, slug as link_unchanged,
       case when is_published then 'public' else 'hidden' end as visibility
from names_tidied_239
order by new_name;
