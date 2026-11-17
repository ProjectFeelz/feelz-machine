-- supabase/migrations/237_publish_the_artists_who_were_never_going_to_be.sql
--
-- 193 ARTISTS WHO WERE NEVER GOING TO BECOME VISIBLE ON THEIR OWN.
--
--
-- WHAT IS ACTUALLY WRONG
--
-- 293 artists have is_published = false. That is 293 out of 362, so most of
-- the roster is invisible on a platform whose whole job is to show people.
--
-- The reason is one missing line, not 293 decisions. In the whole codebase
-- there are only three places that ever write artists.is_published:
--
--   1. ProfilePage.js, when you save your profile.
--   2. ProfileSetup.js, when you save your profile. (Until this week it did
--      not set it either. That is the /setup bug, fixed in the same batch.)
--   3. AuthContext.js, which sets it to FALSE when an account is deleted.
--
-- TrackUploadPanel.js writes is_published five times, and every one of them
-- is on a track or an album. It never touches the artist row.
--
-- So uploading music does not publish you. Publishing a track does not
-- publish you. Finishing setup did not publish you. The only thing that ever
-- has is opening the profile page and pressing save, and most people who
-- finish signup have no reason to go back and do that.
--
-- That is how 41 artists ended up with music live on the platform and no
-- profile anybody can reach.
--
--
-- WHY A BACKFILL AND NOT JUST THE CODE FIX
--
-- The code fix stops it happening again. It does nothing for the people it
-- already happened to, because nothing in the app ever revisits that column.
-- Left alone, these 193 stay hidden until each one happens to come back and
-- save a profile they have no reason to think is broken.
--
--
-- WHO GETS PUBLISHED, AND WHY THOSE RULES
--
-- An artist is published here if they have a name and a working link, and
-- at least one of:
--
--   * a published track. 41 people. They already decided to be public, they
--     pressed publish, and the platform quietly kept them hidden anyway.
--
--   * a bio or a profile picture. 190 people. Nobody writes a bio for a page
--     they want kept private. Filling that in IS the intent to be seen.
--
-- The two groups overlap, so 193 move in total.
--
--
-- WHO IS LEFT ALONE, AND WHY
--
-- 100 artists stay unpublished. They are the ones with nothing on the page:
-- no bio, no picture, no published music. Publishing those would fill Browse
-- with empty profiles, which is worse for everybody than leaving them out.
-- They are not blocked. The moment one of them adds anything and saves, the
-- fixed code publishes them like it always should have.
--
--
-- WHAT I CHECKED BEFORE WRITING THIS
--
-- Four things, because 193 rows is too many to find out afterwards.
--
--   Deleted accounts. AuthContext renames a deleted artist to
--   '[Deleted Artist]' and unpublishes them. Republishing those would bring
--   deleted people back onto the site. There are 0 in this set and the
--   migration excludes them by name anyway, in case one appears later.
--
--   Slugs. A published artist with no slug, or a slug that clashes with
--   somebody else's, is a dead link in Browse. All 193 have a slug and all
--   193 are unique. 0 problems.
--
--   Notifications. artists has an update trigger,
--   notify_followers_artist_milestone, that inserts rows. 193 updates could
--   have meant a flood of alerts about artists nobody has heard of. I ran
--   this exact update inside a transaction and rolled it back: 193 rows
--   changed, notifications 25,642 before and 25,642 after. It does not fire
--   on this column.
--
--   Re-running. The where clause only ever looks at rows that are currently
--   false, so running this twice changes nothing the second time.

begin;

-- ── The backfill ────────────────────────────────────────────────────────────
--
-- The list is kept in a temp table so the check below can name every single
-- person who moved, rather than just counting them. It lives for this editor
-- session only and disappears when you close the tab.
create temp table artists_published_237 as
with moved as (
  update public.artists a
  set is_published = true
  where coalesce(a.is_published, false) = false
    -- never bring a deleted account back
    and a.artist_name is distinct from '[Deleted Artist]'
    -- never publish a page with no name on it
    and coalesce(trim(a.artist_name), '') <> ''
    -- never publish a page with no working link
    and coalesce(trim(a.slug), '') <> ''
    and (
      -- they published music
      exists (select 1 from public.tracks t
               where t.artist_id = a.id and t.is_published)
      -- or they filled the page in
      or coalesce(trim(a.bio), '') <> ''
      or coalesce(a.profile_image_url, '') <> ''
    )
  returning a.id, a.artist_name, a.slug, a.created_at
)
select m.*,
       (select count(*) from public.tracks t
         where t.artist_id = m.id and t.is_published) as published_tracks,
       (coalesce(trim(m.artist_name), '') <> '') as has_name
from moved m;

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 artists published by this migration' as k,
       (select count(*)::text from artists_published_237) as v
union all
select '2 of those, had music live already',
       (select count(*)::text from artists_published_237 where published_tracks > 0)
union all
select '3 of those, had a bio or a picture only',
       (select count(*)::text from artists_published_237 where published_tracks = 0)
union all
select '4 published artists now',
       (select count(*)::text from public.artists where is_published)
union all
select '5 still unpublished, left on purpose',
       (select count(*)::text from public.artists where coalesce(is_published, false) = false)
union all
select '6 any deleted accounts caught up in it',
       (select count(*)::text from artists_published_237 where artist_name = '[Deleted Artist]')
union all
select '7 any published artist with a broken link',
       (select count(*)::text from public.artists where is_published and coalesce(trim(slug), '') = '')
union all
select '8 published music with a hidden artist, should be 0 now',
       (select count(distinct t.artist_id)::text
          from public.tracks t
          join public.artists a on a.id = t.artist_id
         where t.is_published and coalesce(a.is_published, false) = false)
order by 1;

-- ── Who moved ───────────────────────────────────────────────────────────────
--
-- Every name, newest signup first. Run this on its own if the list is long.
select artist_name,
       slug,
       published_tracks as live_tracks,
       to_char(created_at, 'DD Mon YYYY') as joined
from artists_published_237
order by created_at desc;
