-- FEELZ RUN: ARTIST LEVELS
-- Artists on Feelz Machine can put one of their own songs on a Feelz Run level.
-- The level (map, world, enemies) is one of the 15 album missions; the song,
-- and so the checkpoint deadlines, are theirs. Everything is opt in, made and
-- switched off by the artist from the Hub. Players reach it only through the
-- game_ functions below, and every run is still checked on the server.

-- The album missions' song sections, so an artist level can be timed against them.
alter table public.game_missions add column if not exists parts jsonb;
alter table public.game_missions add column if not exists template text;
alter table public.game_missions add column if not exists artist_level uuid;

update public.game_missions g set parts = v.parts
from (values
('m01', '[[0,12.38],[12.38,52.88],[52.88,79.74],[79.74,112.88],[112.88,135.98],[135.98,162.38],[162.38,187.52],[187.52,209.4]]'::jsonb),
('m02', '[[0,12.2],[12.2,39.4],[39.4,54.2],[54.2,80.7],[80.7,93.4],[93.4,106.5],[106.5,120],[120,151.4]]'::jsonb),
('m03', '[[0,23.8],[23.8,60.9],[60.9,81.9],[81.9,108.4],[108.4,120.1],[120.1,141],[141,161.9]]'::jsonb),
('m04', '[[0,9.7],[9.7,30.7],[30.7,73.5],[73.5,102.1],[102.1,110.9],[110.9,139.6],[139.6,176.8]]'::jsonb),
('m05', '[[0,13.4],[13.4,55.6],[55.6,90.9],[90.9,125.9],[125.9,144.7],[144.7,179.5],[179.5,189.9]]'::jsonb),
('m06', '[[0,9.6],[9.6,43.5],[43.5,68],[68,90.2],[90.2,113.2],[113.2,136.4],[136.4,148.2],[148.2,172.4],[172.4,194.1],[194.1,231.1]]'::jsonb),
('m07', '[[0,11.8],[11.8,37.3],[37.3,56.5],[56.5,83.4],[83.4,109.9],[109.9,124.5],[124.5,148.6],[148.6,182]]'::jsonb),
('m08', '[[0,11.4],[11.4,44.6],[44.6,61.8],[61.8,101.4],[101.4,127.5]]'::jsonb),
('m09', '[[0,8.5],[8.5,30.5],[30.5,62.3],[62.3,79.2],[79.2,100.2],[100.2,133],[133,155],[155,171.4]]'::jsonb),
('m10', '[[0,30.6],[30.6,56],[56,86.4],[86.4,107.3],[107.3,136.9]]'::jsonb),
('m11', '[[0,14.1],[14.1,42.5],[42.5,56.7],[56.7,84.2],[84.2,110.7],[110.7,153.5],[153.5,180],[180,205.3]]'::jsonb),
('m12', '[[0,11.6],[11.6,42.2],[42.2,74.7],[74.7,101.9],[101.9,137.4],[137.4,151.2],[151.2,178],[178,219.4]]'::jsonb),
('m13', '[[0,16.2],[16.2,48.1],[48.1,86.9],[86.9,97.9],[97.9,130.9],[130.9,162.6],[162.6,182.2]]'::jsonb),
('m14', '[[0,21.1],[21.1,41.5],[41.5,65.1],[65.1,114.9],[114.9,139.3],[139.3,157.6]]'::jsonb),
('m15', '[[0,12.4],[12.4,38.4],[38.4,66.1],[66.1,95.1],[95.1,117],[117,134.1]]'::jsonb)
) as v(id, parts)
where g.id = v.id;

-- Which songs a voucher can be used on, and how much off the artist allows.
-- 'album' rows are the First Impressions Last Longest songs; 'artist' rows
-- come and go with an artist's opt in.
alter table public.game_voucher_tracks add column if not exists max_percent int not null default 50;
alter table public.game_voucher_tracks add column if not exists source text not null default 'album';

create table if not exists public.game_artist_levels (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  track_id uuid not null unique references public.tracks(id) on delete cascade,
  template text not null references public.game_missions(id),
  parts jsonb not null,
  song_seconds numeric not null,
  discount_max int not null default 0 check (discount_max in (0, 10, 25, 50)),
  is_live boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists game_artist_levels_artist_idx on public.game_artist_levels (artist_id);
alter table public.game_artist_levels enable row level security;
revoke all on public.game_artist_levels from anon, authenticated;

-- A song that anyone can already play in full on Feelz Machine.
create or replace function public.game_track_playable(t public.tracks)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(t.is_published, false)
     and not coalesce(t.is_premium, false)
     and not coalesce(t.is_preorder, false)
     and not (coalesce(t.is_early_access, false) and coalesce(t.early_access_until, 'infinity'::timestamptz) > now())
     and (t.release_date is null or t.release_date <= now())
     and not coalesce(t.is_podcast, false)
     and t.file_url is not null;
$$;

-- Make or update the level for one of your songs.
-- p_parts: one [start, end] pair in seconds for each section of the template.
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
    -- Every section needs enough song to run its part of the map.
    if (e - s) < (te - ts) * 0.7 then raise exception 'Section % is too short for its part of the level.', i + 1; end if;
    prev := e;
  end loop;
  if abs(prev - p_song_seconds) > 1.5 then raise exception 'The last section has to end with the song.'; end if;

  insert into public.game_artist_levels (artist_id, track_id, template, parts, song_seconds, discount_max, is_live)
  values (a.id, t.id, p_template, p_parts, p_song_seconds, p_discount, coalesce(p_live, true))
  on conflict (track_id) do update set template = excluded.template, parts = excluded.parts, song_seconds = excluded.song_seconds,
    discount_max = excluded.discount_max, is_live = excluded.is_live, updated_at = now()
  returning * into lvl;

  -- The level's own entry, so runs post and rank exactly as they do on the album levels.
  -- No journal pages or coin in artist levels: those belong to the album story.
  mission_id := 'a-' || lvl.id::text;
  insert into public.game_missions (id, title, total_records, total_notes_low, total_notes_mid, total_notes_high, journal_ids,
    total_coin, total_enemies, track_seconds, min_run_seconds, max_spare_seconds, parts, template, artist_level)
  values (mission_id, upper(left(t.title, 60)), g.total_records, g.total_notes_low, g.total_notes_mid, g.total_notes_high, '{}',
    0, g.total_enemies, p_song_seconds, g.min_run_seconds, ceil(g.max_spare_seconds * ratio), p_parts, g.id, lvl.id)
  on conflict (id) do update set title = excluded.title, total_records = excluded.total_records,
    total_notes_low = excluded.total_notes_low, total_notes_mid = excluded.total_notes_mid, total_notes_high = excluded.total_notes_high,
    total_enemies = excluded.total_enemies, track_seconds = excluded.track_seconds, min_run_seconds = excluded.min_run_seconds,
    max_spare_seconds = excluded.max_spare_seconds, parts = excluded.parts, template = excluded.template;

  -- Song vouchers: only while the level is live and the artist offers a discount.
  -- The album rows are never touched here.
  if lvl.is_live and lvl.discount_max > 0 then
    insert into public.game_voucher_tracks (track_id, max_percent, source) values (t.id, lvl.discount_max, 'artist')
    on conflict (track_id) do update set max_percent = case when public.game_voucher_tracks.source = 'artist' then excluded.max_percent else public.game_voucher_tracks.max_percent end;
  else
    delete from public.game_voucher_tracks where track_id = t.id and source = 'artist';
  end if;

  return json_build_object('id', lvl.id, 'mission', mission_id, 'is_live', lvl.is_live);
end;
$$;

-- Switch a level off (or back on). Vouchers already bought stay good.
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

-- The artist's own levels, for the Hub.
create or replace function public.game_artist_levels_mine()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(json_agg(json_build_object(
    'id', l.id, 'mission', 'a-' || l.id::text, 'track_id', l.track_id, 'template', l.template, 'parts', l.parts,
    'song_seconds', l.song_seconds, 'discount_max', l.discount_max, 'is_live', l.is_live,
    'plays', (select count(*) from public.game_runs r where r.mission = 'a-' || l.id::text)
  ) order by l.updated_at desc), '[]'::json)
  from public.game_artist_levels l join public.artists a on a.id = l.artist_id
  where a.user_id = auth.uid();
$$;

-- The album levels an artist can choose from.
create or replace function public.game_level_templates()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(json_agg(json_build_object('id', g.id, 'title', g.title, 'seconds', g.track_seconds, 'parts', g.parts) order by g.id), '[]'::json)
  from public.game_missions g where g.template is null and g.parts is not null;
$$;

-- Live artist levels, for the game (signed in or not).
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
    and (p_id is null or l.id = p_id);
$$;

-- Buy a voucher: the album songs, and artist songs up to the artist's limit.
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
begin
  p := public.game_ensure_player();
  price := case pct when 10 then 250 when 25 then 600 when 50 then 1200 else null end;
  if price is null then raise exception 'Vouchers come in 10%%, 25%% and 50%%.'; end if;
  select vt.max_percent into maxp from public.game_voucher_tracks vt where vt.track_id = track;
  if maxp is null then raise exception 'Vouchers are not available for that song.'; end if;
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

-- game_me: vouchers now say whose song they are for.
create or replace function public.game_me()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.game_players;
begin
  p := public.game_ensure_player();
  return json_build_object(
    'player_name', p.player_name, 'country', p.country, 'xp', p.xp, 'level', public.game_level_for(p.xp),
    'rp_bank', p.rp_bank, 'credits', p.credits,
    'stash', json_build_object('records', p.stash_records, 'notes', p.stash_notes, 'pages', p.stash_pages, 'coins', p.stash_coins),
    'vinyl_total', p.vinyl_total, 'notes_total', p.notes_total, 'kos_total', p.kos_total, 'coins_total', p.coins_total,
    'journal', p.journal, 'runs', p.runs, 'best', p.best, 'unlocks', p.unlocks, 'outfit', p.outfit, 'dance', p.dance,
    'vouchers', coalesce((
      select json_agg(json_build_object('code', v.code, 'percent', v.percent, 'status', v.status, 'expires_at', v.expires_at,
                                        'track_id', v.track_id, 'title', t.title, 'slug', t.slug, 'artist_name', ar.artist_name) order by v.created_at desc)
      from public.game_vouchers v join public.tracks t on t.id = v.track_id left join public.artists ar on ar.id = t.artist_id
      where v.user_id = p.user_id and v.status in ('active', 'reserved') and v.expires_at > now()
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.game_track_playable(public.tracks) from public, anon, authenticated;
revoke all on function public.game_artist_level_save(uuid, text, jsonb, numeric, int, boolean) from public, anon;
revoke all on function public.game_artist_level_set_live(uuid, boolean) from public, anon;
revoke all on function public.game_artist_levels_mine() from public, anon;
revoke all on function public.game_level_templates() from public;
revoke all on function public.game_artist_levels_list(uuid) from public;
grant execute on function public.game_artist_level_save(uuid, text, jsonb, numeric, int, boolean) to authenticated;
grant execute on function public.game_artist_level_set_live(uuid, boolean) to authenticated;
grant execute on function public.game_artist_levels_mine() to authenticated;
grant execute on function public.game_level_templates() to anon, authenticated;
grant execute on function public.game_artist_levels_list(uuid) to anon, authenticated;
