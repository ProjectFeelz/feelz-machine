-- FEELZ RUN: ARTIST LEVEL SLOTS
-- Artist levels are a Premium feature with a limit:
--   Premium plan            1 live level
--   Feelz Run add-on        4 more (a monthly add-on, billed like the Instagram one)
--   platform-owned artists  no limit (Big Feelz)
-- Pro and Free artists have none. A level over the limit (for example after a
-- plan lapses) stays saved but is not shown in the game until there is room.

create or replace function public.game_artist_level_slots(p_artist_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when a.id is null then 0
    when coalesce(a.is_platform_owned, false) then 1000
    when coalesce(a.is_suspended, false) then 0
    else (case when public.artist_tier_at_least(a.id, 'premium') then 1 else 0 end)
       + (case when public.artist_has_addon(a.id, 'feelzrun') then 4 else 0 end)
  end
  from (select 1) one left join public.artists a on a.id = p_artist_id;
$$;

-- Which of an artist's live levels fit in their slots: the longest-standing first.
create or replace function public.game_artist_level_in_slot(p_level uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.rn <= public.game_artist_level_slots(r.artist_id)
    from (
      select l.id, l.artist_id, row_number() over (partition by l.artist_id order by l.created_at, l.id) as rn
      from public.game_artist_levels l
      where l.is_live and l.artist_id = (select artist_id from public.game_artist_levels where id = p_level)
    ) r where r.id = p_level
  ), false);
$$;

-- Room for one more live level (not counting the one being saved).
create or replace function public.game_artist_level_room(p_artist_id uuid, p_track uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  slots int := public.game_artist_level_slots(p_artist_id);
  used int;
begin
  select count(*) into used from public.game_artist_levels where artist_id = p_artist_id and is_live and track_id <> p_track;
  if slots <= 0 then
    raise exception 'Feelz Run levels come with the Premium plan.';
  end if;
  if used >= slots then
    raise exception '%', format('Your plan has room for %s live %s. Switch one off, or add the Feelz Run add-on for more.', slots, case when slots = 1 then 'level' else 'levels' end);
  end if;
end;
$$;

-- Saving: the same as before, with the slot check first when it goes live.
create or replace function public.game_artist_level_save(p_track uuid, p_template text, p_parts jsonb, p_song_seconds numeric, p_discount int, p_live boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t public.tracks;
  a public.artists;
  g public.game_missions;
  lvl public.game_artist_levels;
  n int;
  i int;
  s numeric; e numeric; prev numeric := 0;
  ts numeric; te numeric;
  ratio numeric;
  mission_id text;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  select * into t from public.tracks where id = p_track;
  if t.id is null then raise exception 'Song not found.'; end if;
  select * into a from public.artists where id = t.artist_id;
  if a.id is null or a.user_id <> me then raise exception 'You can only do this for your own songs.'; end if;
  if coalesce(a.is_suspended, false) then raise exception 'Your account is paused.'; end if;
  if coalesce(p_live, true) then perform public.game_artist_level_room(a.id, t.id); end if;
  if not public.game_track_playable(t) then raise exception 'Only songs that are released and free to stream can go in the game.'; end if;
  select * into g from public.game_missions where id = p_template and template is null and parts is not null;
  if g.id is null then raise exception 'Pick one of the album levels.'; end if;
  if p_discount not in (0, 10, 25, 50) then raise exception 'The discount can be none, 10%%, 25%% or 50%%.'; end if;
  if p_song_seconds is null or p_song_seconds < 60 or p_song_seconds > 900 then raise exception 'That song length does not look right.'; end if;
  ratio := p_song_seconds / g.track_seconds;
  if ratio < 0.75 or ratio > 1.6 then
    raise exception 'This level suits songs between % and % seconds long.', ceil(g.track_seconds * 0.75), floor(g.track_seconds * 1.6);
  end if;
  n := jsonb_array_length(g.parts);
  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) <> n then raise exception 'This level needs % sections.', n; end if;
  for i in 0 .. n - 1 loop
    s := (p_parts -> i ->> 0)::numeric; e := (p_parts -> i ->> 1)::numeric;
    ts := (g.parts -> i ->> 0)::numeric; te := (g.parts -> i ->> 1)::numeric;
    if s is null or e is null or abs(s - prev) > 0.05 or e <= s then raise exception 'The sections must follow on from each other.'; end if;
    if (e - s) < (te - ts) * 0.7 then raise exception 'Section % is too short for its part of the level.', i + 1; end if;
    prev := e;
  end loop;
  if abs(prev - p_song_seconds) > 1.5 then raise exception 'The last section has to end with the song.'; end if;

  insert into public.game_artist_levels (artist_id, track_id, template, parts, song_seconds, discount_max, is_live)
  values (a.id, t.id, p_template, p_parts, p_song_seconds, p_discount, coalesce(p_live, true))
  on conflict (track_id) do update set template = excluded.template, parts = excluded.parts, song_seconds = excluded.song_seconds,
    discount_max = excluded.discount_max, is_live = excluded.is_live, updated_at = now()
  returning * into lvl;

  mission_id := 'a-' || lvl.id::text;
  insert into public.game_missions (id, title, total_records, total_notes_low, total_notes_mid, total_notes_high, journal_ids,
    total_coin, total_enemies, track_seconds, min_run_seconds, max_spare_seconds, parts, template, artist_level)
  values (mission_id, upper(left(t.title, 60)), g.total_records, g.total_notes_low, g.total_notes_mid, g.total_notes_high, '{}',
    0, g.total_enemies, p_song_seconds, g.min_run_seconds, ceil(g.max_spare_seconds * ratio), p_parts, g.id, lvl.id)
  on conflict (id) do update set title = excluded.title, total_records = excluded.total_records,
    total_notes_low = excluded.total_notes_low, total_notes_mid = excluded.total_notes_mid, total_notes_high = excluded.total_notes_high,
    total_enemies = excluded.total_enemies, track_seconds = excluded.track_seconds, min_run_seconds = excluded.min_run_seconds,
    max_spare_seconds = excluded.max_spare_seconds, parts = excluded.parts, template = excluded.template;

  if lvl.is_live and lvl.discount_max > 0 then
    insert into public.game_voucher_tracks (track_id, max_percent, source) values (t.id, lvl.discount_max, 'artist')
    on conflict (track_id) do update set max_percent = case when public.game_voucher_tracks.source = 'artist' then excluded.max_percent else public.game_voucher_tracks.max_percent end;
  else
    delete from public.game_voucher_tracks where track_id = t.id and source = 'artist';
  end if;

  return json_build_object('id', lvl.id, 'mission', mission_id, 'is_live', lvl.is_live);
end;
$$;

create or replace function public.game_artist_level_set_live(p_track uuid, p_live boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  lvl public.game_artist_levels;
begin
  select l.* into lvl from public.game_artist_levels l join public.artists a on a.id = l.artist_id
  where l.track_id = p_track and a.user_id = auth.uid();
  if lvl.id is null then raise exception 'Level not found.'; end if;
  if coalesce(p_live, false) then perform public.game_artist_level_room(lvl.artist_id, lvl.track_id); end if;
  update public.game_artist_levels set is_live = coalesce(p_live, false), updated_at = now() where id = lvl.id;
  if coalesce(p_live, false) and lvl.discount_max > 0 then
    insert into public.game_voucher_tracks (track_id, max_percent, source) values (lvl.track_id, lvl.discount_max, 'artist')
    on conflict (track_id) do nothing;
  else
    delete from public.game_voucher_tracks where track_id = lvl.track_id and source = 'artist';
  end if;
  return json_build_object('id', lvl.id, 'is_live', coalesce(p_live, false));
end;
$$;

-- The Hub: the artist's levels, and how many slots they have.
create or replace function public.game_artist_levels_mine()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'slots', public.game_artist_level_slots(a.id),
    'tier', a.tier,
    'addon', public.artist_has_addon(a.id, 'feelzrun'),
    'addon_live', public.addon_is_live('feelzrun'),
    'levels', coalesce((
      select json_agg(json_build_object(
        'id', l.id, 'mission', 'a-' || l.id::text, 'track_id', l.track_id, 'template', l.template, 'parts', l.parts,
        'song_seconds', l.song_seconds, 'discount_max', l.discount_max, 'is_live', l.is_live,
        'in_game', l.is_live and public.game_artist_level_in_slot(l.id),
        'plays', (select count(*) from public.game_runs r where r.mission = 'a-' || l.id::text)
      ) order by l.created_at)
      from public.game_artist_levels l where l.artist_id = a.id
    ), '[]'::json))
  from public.artists a where a.user_id = auth.uid()
  order by a.created_at limit 1;
$$;

-- The game: live levels that fit in their artist's slots.
create or replace function public.game_artist_levels_list(p_id uuid default null)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(json_agg(json_build_object(
    'id', l.id, 'mission', 'a-' || l.id::text, 'template', l.template, 'parts', l.parts, 'song_seconds', l.song_seconds,
    'discount_max', l.discount_max, 'track_id', t.id, 'title', t.title, 'slug', t.slug, 'bpm', t.bpm,
    'cover', coalesce(t.cover_artwork_url, a.profile_image_url), 'artist_name', a.artist_name, 'artist_slug', a.slug
  ) order by l.updated_at desc), '[]'::json)
  from public.game_artist_levels l
  join public.tracks t on t.id = l.track_id
  join public.artists a on a.id = l.artist_id
  where l.is_live and public.game_track_playable(t) and not coalesce(a.is_suspended, false)
    and public.game_artist_level_in_slot(l.id)
    and (p_id is null or l.id = p_id);
$$;

-- Vouchers on artist songs only while the level is in the game.
create or replace function public.game_buy_voucher(track uuid, pct int)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.game_players;
  price int;
  new_code text;
  maxp int;
  src text;
begin
  p := public.game_ensure_player();
  price := case pct when 10 then 750 when 25 then 1800 when 50 then 3600 else null end;
  if price is null then raise exception 'Vouchers come in 10%%, 25%% and 50%%.'; end if;
  select vt.max_percent, vt.source into maxp, src from public.game_voucher_tracks vt where vt.track_id = track;
  if maxp is null then raise exception 'Vouchers are not available for that song.'; end if;
  if src = 'artist' and not exists (select 1 from public.game_artist_levels l where l.track_id = track and l.is_live and public.game_artist_level_in_slot(l.id)) then
    raise exception 'Vouchers are not available for that song.';
  end if;
  if pct > maxp then raise exception '%', format('This artist offers up to %s%% off this song.', maxp); end if;
  if exists (select 1 from public.game_vouchers v where v.user_id = p.user_id and v.track_id = track
             and v.status in ('active', 'reserved') and v.expires_at > now()) then
    raise exception 'You already have a voucher for that song.';
  end if;
  if p.credits < price then raise exception 'You need % credits for that voucher.', price; end if;
  new_code := 'FR-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
  insert into public.game_vouchers (code, user_id, track_id, percent, cost) values (new_code, p.user_id, track, pct, price);
  update public.game_players set credits = credits - price where user_id = p.user_id;
  insert into public.game_credit_log (user_id, change, balance_after, reason) values (p.user_id, -price, p.credits - price, 'voucher ' || new_code);
  return public.game_me();
end;
$$;

-- The add-on: $2.99 a month, switched on.
insert into public.platform_settings (key, value) values
  ('addon_feelzrun_monthly_usd', '2.99'),
  ('addon_feelzrun_live', 'true')
on conflict (key) do update set value = excluded.value, updated_at = now();

revoke all on function public.game_artist_level_slots(uuid) from public, anon, authenticated;
revoke all on function public.game_artist_level_in_slot(uuid) from public, anon, authenticated;
revoke all on function public.game_artist_level_room(uuid, uuid) from public, anon, authenticated;
revoke all on function public.game_artist_levels_mine() from public, anon;
grant execute on function public.game_artist_levels_mine() to authenticated;
