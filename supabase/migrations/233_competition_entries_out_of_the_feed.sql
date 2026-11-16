-- supabase/migrations/233_competition_entries_out_of_the_feed.sql
--
-- COMPETITION ENTRIES STOP BEING CATALOGUE SONGS.
--
--
-- THE PROBLEM, MEASURED
--
-- Every Sessions entry is published into the main catalogue as an ordinary
-- track, with nothing anywhere saying it is a competition entry. There is no
-- column for it, so no feed can filter on it even if someone wanted to.
--
-- Right now that is 14 of 151 published tracks, nine percent of everything on
-- the platform, from one competition that has not finished. Seven of those 14
-- are the SAME cover song, sitting next to each other in Browse under titles
-- that differ only by capital letters and a full stop. They carry Hip Hop,
-- Pop, R&B and Trap tags, so they also feed the recommendation engine and the
-- similar-artists matching: fourteen versions of one song helping decide who
-- sounds like whom.
--
-- Picking a winner changed none of it. Next season would have added 14 more.
--
--
-- THE RULE STEVE WANTS
--
-- An entry is not catalogue material. It is the same song over and over, some
-- of it good and some of it rough, and none of it is what the platform should
-- be handing a stranger as a recommendation.
--
-- So an entry lives in exactly two places: the Sessions pages for its season,
-- where it belongs and where people go to judge it, and the entrant's own
-- artist profile, so nobody loses their work or their play count.
--
-- Everywhere else it is invisible. Home, For You, Browse, search, genres,
-- recommendations, new-release emails.
--
-- The one exception is the winner. That version becomes the official remix,
-- so the moment a winner is marked, their track is released back into the
-- catalogue as a normal song. Unmark them and it goes back to being an entry,
-- because a judge changing their mind mid-livestream is a thing that happens.
--
--
-- WHY A COLUMN AND A TRIGGER, NOT A FILTER IN THE APP
--
-- 'is_published' appears 125 times across 23 files. A rule enforced by
-- remembering to add a filter in 125 places is a rule that is already broken
-- somewhere and will break again the next time anybody writes a query.
--
-- So the fact lives on the row. tracks.competition_id is set by a trigger when
-- an entry is created, cleared by a trigger when that entry wins, and the app
-- asks one question: is this song in a competition. The view at the end gives
-- future queries a single honest source.

begin;

-- ── 1. The fact, on the row ─────────────────────────────────────────────────
alter table public.tracks
  add column if not exists competition_id uuid references public.competitions(id) on delete set null;

create index if not exists tracks_competition_id_idx
  on public.tracks (competition_id) where competition_id is not null;

-- The column is useless to the app if the app cannot read it.
grant select (competition_id) on public.tracks to anon, authenticated;

-- ── 2. Backfill the entries that already exist ──────────────────────────────
--
-- The winner is excluded here as well as in the trigger. If a winner has
-- already been marked by the time this runs, they should not be pulled out of
-- the catalogue for a moment and put back.
update public.tracks t
set competition_id = e.competition_id
from public.school_sessions_entries e
where t.id = e.track_id
  and coalesce(e.is_winner, false) = false
  and t.competition_id is distinct from e.competition_id;

-- ── 3. Keep it true from now on ─────────────────────────────────────────────
--
-- Tagging at the source is the whole point. An entry created next season, by
-- code nobody has written yet, is tagged because the database does it, not
-- because somebody remembered.
create or replace function public.tag_competition_entry_track()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The track moved off this entry: let the old one go back to being a song.
  if tg_op = 'UPDATE' and old.track_id is not null and old.track_id is distinct from new.track_id then
    update public.tracks set competition_id = null where id = old.track_id;
  end if;

  if new.track_id is null then
    return new;
  end if;

  if coalesce(new.is_winner, false) then
    -- The official remix. Back in the catalogue where it belongs.
    update public.tracks set competition_id = null where id = new.track_id;
  else
    update public.tracks set competition_id = new.competition_id where id = new.track_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tag_competition_entry_track on public.school_sessions_entries;
create trigger trg_tag_competition_entry_track
  after insert or update of track_id, is_winner, competition_id
  on public.school_sessions_entries
  for each row execute function public.tag_competition_entry_track();

-- ── 4. One honest source for anything that lists songs ──────────────────────
--
-- security_invoker so it obeys the caller's row level security exactly as the
-- table does. It is the same tracks table minus the competition entries, so a
-- feed query becomes a one word change rather than a new condition somebody
-- has to remember.
create or replace view public.tracks_feed
with (security_invoker = true) as
  select * from public.tracks where competition_id is null;

grant select on public.tracks_feed to anon, authenticated;

-- ── 5. The entry titled with somebody's email address ───────────────────────
--
-- Pasted into the title field by mistake and live on the platform since. It is
-- a cover of a song whose real title is already on the shortlist, which is
-- what the other thirteen entries use, so that is what it becomes.
--
-- Narrow on purpose: an entry track, with an at sign and a dot in the title,
-- and only where the shortlist actually gives a replacement. It cannot touch
-- a legitimately titled song.
update public.tracks t
set title = s.title
from public.school_sessions_entries e
join public.school_sessions_shortlist_songs s on s.id = e.song_id
where t.id = e.track_id
  and t.title like '%@%'
  and t.title like '%.%'
  and coalesce(s.title, '') <> '';

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 entry tracks now tagged' as k, (select count(*)::text from public.tracks where competition_id is not null) as v
union all
select '2 entries that have a track', (select count(*)::text from public.school_sessions_entries where track_id is not null)
union all
select '3 published catalogue, entries excluded', (select count(*)::text from public.tracks_feed where is_published)
union all
select '4 published catalogue including entries', (select count(*)::text from public.tracks where is_published)
union all
select '5 titles still holding an email', (select count(*)::text from public.tracks where competition_id is not null and title like '%@%')
union all
select '6 winner released to the catalogue', coalesce((
  select string_agg(t.title, ', ') from public.school_sessions_entries e
  join public.tracks t on t.id = e.track_id
  where e.is_winner and t.competition_id is null), 'no winner marked yet')
union all
select '7 tagging trigger', case when exists (
  select 1 from pg_trigger where tgname = 'trg_tag_competition_entry_track'
) then 'live' else 'MISSING' end
union all
select '8 feed view', case when exists (
  select 1 from information_schema.views where table_schema='public' and table_name='tracks_feed'
) then 'ready' else 'MISSING' end
order by 1;
