-- supabase/migrations/220_free_tier_albums.sql
--
-- ALBUMS BECOME A PAID FEATURE.
--
-- THE HOLE
--
-- The free limit only ever counted singles. enforce_free_single_limit reads
-- `album_id is null`, so anything released inside an album or EP was exempt on
-- every tier. A free artist could put out forty songs by bundling them, and an
-- artist whose plan lapsed kept their whole catalogue live.
--
-- That is why the November remediation looked like it did nothing. It was
-- applying the rule correctly. The rule was the wrong shape.
--
-- Measured before writing this: two artists platform wide hold published
-- albums with no active plan. The Nostalgic Unit, 38 album tracks across 9
-- albums, and Mike City 806, 3 tracks on 1. Both were admin grants that ended
-- on 12 November. Their singles were already correct at 2 each.
--
-- THE SECOND HOLE, WHICH IS THE ONE THAT MATTERS LONGER
--
-- Nothing ran when a plan expired. A trigger fires when a row is written; a
-- date passing writes nothing. So whatever an artist had live on the day their
-- plan ended stayed live forever. expire-subscriptions already runs nightly and
-- marks the subscription row ended, so the enforcement is hung off that rather
-- than put on a schedule of its own.
--
-- WHAT THIS DOES
--
--   1. One place that answers "does this artist have an active plan".
--   2. An archive, so every row this hides can be put back by hand.
--   3. enforce_free_tier_albums(), which notifies then hides. Idempotent.
--   4. Triggers so a free artist cannot publish an album in the first place.
--   5. Runs it once, now, for the backlog.
--
-- Nothing here deletes anything. Hidden is hidden, and it all comes back the
-- moment a plan is active again.

begin;

-- ── 1. One definition of "active" ───────────────────────────────────────────
--
-- expires_at, not status. useTier.js decides at read time on expires_at, and a
-- cancelled plan that is paid until the end of the month is still active to a
-- listener. Two definitions of active is how the app and the admin panel end
-- up disagreeing about the same artist.
create or replace function public.artist_has_active_plan(p_artist_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1 from artist_tier_subscriptions s
    where s.artist_id = p_artist_id
      and (s.expires_at is null or s.expires_at > now())
  );
$fn$;

grant execute on function public.artist_has_active_plan(uuid) to authenticated, anon;

-- ── 2. The undo ─────────────────────────────────────────────────────────────
create table if not exists public.tier_enforcement_archive (
  id            bigserial primary key,
  artist_id     uuid,
  kind          text not null,          -- 'album' or 'track'
  target_id     uuid not null,
  was_published boolean not null,
  reason        text,
  archived_at   timestamptz not null default now()
);

create index if not exists idx_tier_archive_target
  on public.tier_enforcement_archive (kind, target_id);

alter table public.tier_enforcement_archive enable row level security;
-- No policy on purpose. Service role and the SECURITY DEFINER functions reach
-- it; nobody else has any business reading it.

-- ── 3. The enforcement ──────────────────────────────────────────────────────
create or replace function public.enforce_free_tier_albums()
returns table(artists_affected int, albums_hidden int, tracks_hidden int)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_artists int := 0;
  v_albums  int := 0;
  v_tracks  int := 0;
begin
  -- Counted before anything moves, because every predicate below stops being
  -- true the moment the updates run.
  select count(distinct al.artist_id) into v_artists
  from albums al
  where al.is_published = true
    and not artist_has_active_plan(al.artist_id);

  -- Archive, so this is reversible row by row.
  insert into tier_enforcement_archive (artist_id, kind, target_id, was_published, reason)
  select al.artist_id, 'album', al.id, true, 'free tier: albums are a paid feature'
  from albums al
  where al.is_published = true
    and not artist_has_active_plan(al.artist_id);

  insert into tier_enforcement_archive (artist_id, kind, target_id, was_published, reason)
  select t.artist_id, 'track', t.id, true, 'free tier: albums are a paid feature'
  from tracks t
  where t.is_published = true
    and t.album_id is not null
    and not artist_has_active_plan(t.artist_id);

  -- Tell them BEFORE it happens, and tell each artist once a month at most, so
  -- a nightly job cannot turn into a nightly reminder that they are broke.
  insert into notifications (user_id, artist_id, type, title, message, email_requested, metadata)
  select
    ar.user_id,
    ar.id,
    'admin_message',
    'Your albums are hidden while your plan is off',
    'Albums and EPs are part of a paid plan. Yours is not active right now, so your albums and the songs on them are hidden from listeners. '
    || 'Your singles are still live. Nothing has been deleted and nothing is lost. '
    || 'Everything comes straight back the moment you turn a plan back on, from your artist dashboard.',
    true,
    jsonb_build_object('kind', 'free_tier_albums_hidden')
  from artists ar
  where ar.user_id is not null
    and exists (
      select 1 from albums al
      where al.artist_id = ar.id and al.is_published = true
        and not artist_has_active_plan(ar.id)
    )
    and not exists (
      select 1 from notifications n
      where n.artist_id = ar.id
        and n.metadata->>'kind' = 'free_tier_albums_hidden'
        and n.created_at > now() - interval '30 days'
    );

  update albums al
  set is_published = false
  where al.is_published = true
    and not artist_has_active_plan(al.artist_id);
  get diagnostics v_albums = row_count;

  update tracks t
  set is_published = false
  where t.is_published = true
    and t.album_id is not null
    and not artist_has_active_plan(t.artist_id);
  get diagnostics v_tracks = row_count;

  return query select v_artists, v_albums, v_tracks;
end;
$fn$;

-- ── 4. The door, not just the sweep ─────────────────────────────────────────
--
-- Both triggers only look at a row CROSSING INTO published. An update that
-- leaves is_published alone, or sets it to false, passes straight through:
-- otherwise the sweep above could not unpublish anything, and an artist whose
-- plan lapsed could not edit their own hidden album.
create or replace function public.enforce_album_requires_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.is_published is true
     and (tg_op = 'INSERT' or old.is_published is distinct from true)
     and not artist_has_active_plan(new.artist_id)
  then
    raise exception 'Albums and EPs need an active plan. Your singles stay free. Upgrade from your dashboard and publish it then.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_album_requires_plan on public.albums;
create trigger trg_album_requires_plan
  before insert or update on public.albums
  for each row execute function public.enforce_album_requires_plan();

create or replace function public.enforce_album_track_requires_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.is_published is true
     and new.album_id is not null
     and (tg_op = 'INSERT' or old.is_published is distinct from true)
     and not artist_has_active_plan(new.artist_id)
  then
    raise exception 'Album tracks need an active plan. Your singles stay free.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_album_track_requires_plan on public.tracks;
create trigger trg_album_track_requires_plan
  before insert or update on public.tracks
  for each row execute function public.enforce_album_track_requires_plan();

commit;

-- ── 5. Run it once for the backlog ──────────────────────────────────────────
select * from public.enforce_free_tier_albums();

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect 0 still live, 41 archived, 2 notices, and both triggers present.
select 'album tracks still live with no plan' as k, count(*)::text as v
from tracks t
where t.is_published = true and t.album_id is not null
  and not public.artist_has_active_plan(t.artist_id)
union all
select 'albums still live with no plan', count(*)::text
from albums al
where al.is_published = true and not public.artist_has_active_plan(al.artist_id)
union all
select 'rows archived', count(*)::text from tier_enforcement_archive
union all
select 'notices sent', count(*)::text from notifications
where metadata->>'kind' = 'free_tier_albums_hidden'
union all
select 'triggers', string_agg(tgname, ', ' order by tgname)
from pg_trigger
where tgname in ('trg_album_requires_plan', 'trg_album_track_requires_plan')
order by 1;
