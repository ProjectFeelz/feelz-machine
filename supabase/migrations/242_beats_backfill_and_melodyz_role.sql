-- supabase/migrations/242_beats_backfill_and_melodyz_role.sql
--
-- SIX MONTHS OF BEATS WERE FILED AS SONGS.
--
--
-- WHAT WAS BROKEN
--
-- TrackUploadPanel initialises trackForm.is_beat to false and never assigns it
-- anywhere. The form branches on a DIFFERENT variable, `isBeat`, taken from
-- release.release_type, and a beatmaker account is locked to release_type
-- 'beat'. So the screen knew it was handling a beat the whole way through and
-- then wrote false into the row.
--
-- The last track ever marked as a beat was 27 May 2026. In the 162 tracks
-- uploaded since, not one is a beat. The marketplace has had no new stock for
-- six months and nothing reported a fault, because saving a song is not an
-- error. The code half is fixed in the same batch as this.
--
--
-- WHY THIS BACKFILL IS NARROW, AND THE ACCOUNT IT DELIBERATELY SKIPS
--
-- The obvious backfill is "every track on a beatmaker account is a beat".
-- A read-only preview of exactly that showed it would convert 8 tracks, and
-- four of them belong to Sweet melodyz: Rain Dance, Coming of Age, Different
-- Faces and High Rises. Those are songs. They would have left the music feeds
-- and reappeared in the beat marketplace with a licence and a download price.
--
-- So role is NOT a statement of intent. It is whatever got written at signup,
-- and that path is known to be unreliable: AuthContext sets role_confirmed
-- true when it creates the row, before anybody is asked, and the comment in
-- Welcome.js records that every account was given the artist flow regardless
-- of what was chosen. Sweet melodyz is what that bug looks like in the data.
--
-- The beat metadata is no help either. bpm, beat_key, beat_scale and
-- beat_licence are empty on every track on the platform, including on the four
-- genuine beats, so there is nothing in a row that separates a beat upload
-- from a song upload.
--
-- That leaves four tracks that are genuinely ambiguous, on three accounts that
-- exist to make beats and have never released a song. Those four are named one
-- by one below rather than selected by a rule, because a rule that happens to
-- match them today would match the wrong thing tomorrow.
--
--
-- AND THE ROLE ITSELF
--
-- Sweet melodyz is marked beatmaker and makes songs. Correcting that stops her
-- being counted as a beatmaker in every statistic from here on, and stops this
-- same backfill question being asked about her again. It touches the role and
-- nothing else: not her music, not her tier, not her grant.

begin;

-- ── 1. The four ambiguous tracks, named ─────────────────────────────────────
--
-- Guarded on is_beat = false so re-running is a no-op, and scoped by artist so
-- a track that happens to share a title elsewhere cannot be caught.
create temp table beats_backfilled_242 as
with moved as (
  update public.tracks t
  set is_beat = true
  from public.artists a
  where a.id = t.artist_id
    and coalesce(t.is_beat, false) = false
    and a.role = 'beatmaker'
    and a.artist_name <> 'Sweet melodyz'
    and (
         (a.artist_name = 'Kiddy roy'  and t.title in ('No gang', 'Intro to the game'))
      or (a.artist_name = '44 billions' and t.title = 'Trap')
      or (a.artist_name = 'btt090428'   and t.title = 'Grootman TT')
    )
  returning t.id, t.title, a.artist_name, t.is_published
)
select * from moved;

-- ── 2. Sweet melodyz is an artist ───────────────────────────────────────────
update public.artists
set role = 'artist'
where artist_name = 'Sweet melodyz'
  and role = 'beatmaker';

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 tracks converted to beats' as k,
       (select count(*)::text from beats_backfilled_242) as v
union all
select '2 which ones',
       (select coalesce(string_agg(artist_name || ' - ' || title, ', ' order by artist_name), 'none')
          from beats_backfilled_242)
union all
select '3 published beats now (was 4)',
       (select count(*)::text from public.tracks where is_beat and is_published)
union all
select '4 Sweet melodyz role',
       (select coalesce(role, '(null)') from public.artists where artist_name = 'Sweet melodyz')
union all
select '5 her 4 songs untouched, still songs',
       (select count(*)::text from public.tracks t
          join public.artists a on a.id = t.artist_id
         where a.artist_name = 'Sweet melodyz' and coalesce(t.is_beat, false) = false)
union all
select '6 beatmaker accounts now',
       (select count(*)::text from public.artists where role = 'beatmaker')
union all
select '7 beatmakers with a published beat',
       (select count(distinct t.artist_id)::text from public.tracks t
          join public.artists a on a.id = t.artist_id
         where a.role = 'beatmaker' and t.is_beat and t.is_published)
union all
select '8 any beat without an owner who makes beats',
       (select count(*)::text from public.tracks t
          join public.artists a on a.id = t.artist_id
         where t.is_beat and a.role <> 'beatmaker')
order by 1;

-- ── What changed ────────────────────────────────────────────────────────────
select artist_name, title,
       case when is_published then 'live in the marketplace' else 'draft' end as state
from beats_backfilled_242
order by artist_name, title;
