-- supabase/migrations/254_deleted_artists_stop_releasing_music.sql
--
-- A DELETED ARTIST SENT A RELEASE NOTIFICATION THIS MORNING.
--
--
-- WHAT WENT OUT
--
--   New Trap you have not heard
--   [Deleted Artist] just released "Started From Zero". You play a lot of
--   Trap, and nobody has heard this one yet.
--
-- notify-new-in-genre runs Thursdays at 08:00 (cron 0 8 * * 4). It looks for
-- a published track in a genre somebody listens to that nobody has played
-- yet, and tells them about it. It did exactly that. The track was published,
-- so it qualified.
--
--
-- WHY A DELETED ARTIST STILL HAS PUBLISHED MUSIC
--
-- Deleting an account is a soft delete, on purpose. AuthContext.js renames
-- the artist to '[Deleted Artist]', clears the bio, picture and socials, and
-- sets is_published false, so that collaborations other artists were part of
-- do not vanish from their side. That reasoning is sound.
--
-- The flow then deletes artist_thoughts, artist_posts, streams,
-- push_subscriptions and artist_guestbook.
--
-- It never touches the tracks table. Not once. So the person is gone, their
-- profile is hidden, and their music is still published and still treated as
-- a normal part of the catalogue: recommended, fed, crawled, and as of this
-- morning, announced by name.
--
--
-- WHY THIS IS A TRIGGER AND NOT A LINE IN AuthContext
--
-- A line in the delete flow fixes it until somebody adds a second way to
-- delete an account, or an admin does it by hand in the dashboard, or a
-- future screen forgets. The rule is "a deleted artist has no published
-- music", and rules about rows belong next to the rows.
--
-- The trigger also means the fix cannot be undone by a deploy.
--
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
-- It unpublishes. It does not delete anything. Same reasoning as the soft
-- delete it is completing: a track that is part of somebody else's
-- collaboration history should still exist, it just should not be on the
-- shelves.
--
-- It keys on the '[Deleted Artist]' name, not on is_published. Plenty of
-- artists are unpublished for ordinary reasons, 193 of them were published
-- in one go by migration 237, and unpublishing the music of everybody who is
-- merely unpublished would be a catastrophe rather than a fix.

begin;

-- ── The ones already out there ──────────────────────────────────────────────
update public.tracks t
set is_published = false,
    updated_at   = now()
from public.artists a
where a.id = t.artist_id
  and a.artist_name = '[Deleted Artist]'
  and t.is_published;

-- ── So it cannot happen again ───────────────────────────────────────────────
create or replace function public.unpublish_tracks_of_deleted_artist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only on the transition INTO deleted, so an ordinary edit of a deleted
  -- artist's row does not re-run this every time.
  if new.artist_name = '[Deleted Artist]'
     and old.artist_name is distinct from new.artist_name then
    update public.tracks
    set is_published = false,
        updated_at   = now()
    where artist_id = new.id
      and is_published;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_unpublish_tracks_of_deleted_artist on public.artists;

create trigger trg_unpublish_tracks_of_deleted_artist
  after update of artist_name on public.artists
  for each row
  execute function public.unpublish_tracks_of_deleted_artist();

commit;

-- ── Check ───────────────────────────────────────────────────────────────────
select '1 deleted artists on the platform' as k,
  (select count(*)::text from public.artists where artist_name = '[Deleted Artist]') as v
union all
select '2 their published tracks now',
  (select count(*)::text from public.tracks t
     join public.artists a on a.id = t.artist_id
    where a.artist_name = '[Deleted Artist]' and t.is_published)
  || ' (should be 0)'
union all
select '3 what this unpublished',
  coalesce((select string_agg(t.title, ' | ' order by t.title)
     from public.tracks t
     join public.artists a on a.id = t.artist_id
    where a.artist_name = '[Deleted Artist]'), 'nothing, the artist row may have a different name')
union all
select '4 the trigger is in place',
  case when exists (select 1 from pg_trigger
                     where tgname = 'trg_unpublish_tracks_of_deleted_artist'
                       and not tgisinternal)
       then 'yes' else 'NO, CHECK THIS' end
union all
select '5 published catalogue after this',
  (select count(*)::text from public.tracks where is_published) || ' published tracks'
union all
-- The thing to be sure of: this must not have touched anybody else.
select '6 artists who are unpublished but NOT deleted',
  (select count(*)::text from public.artists
    where coalesce(is_published, false) = false and artist_name <> '[Deleted Artist]')
  || ' artists, and their music was not touched'
union all
select '7 covers of the Sessions song still published',
  (select count(*)::text from public.tracks
    where is_published and competition_id is null
      and (title ilike '%zero%' or title ilike '%started from%'))
  || ' (these are people who never entered, a separate thing)'
order by 1;
