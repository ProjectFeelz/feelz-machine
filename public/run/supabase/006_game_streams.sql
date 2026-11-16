-- Feelz Run: a finished run counts as a stream of its song.
alter table public.game_missions add column if not exists track_id uuid references public.tracks(id) on delete set null;

update public.game_missions m set track_id = v.track
from (values
  ('m01', 'c8c16939-4e59-4217-942e-d1e06fa860fd'::uuid),
  ('m02', '27c7681d-bbd1-40a0-a183-02dc773f54d9'::uuid),
  ('m03', 'c92bccdd-5361-4a4e-9472-b188ad65ea19'::uuid),
  ('m04', '54a533b8-bcbc-424e-b130-0441bd7645c3'::uuid),
  ('m05', '054f6b34-20d5-43c7-80cc-ada5546fd14f'::uuid),
  ('m06', 'b3994b14-6c2c-483a-82dc-66c1862a7502'::uuid),
  ('m07', '0ca7051b-8e16-41f8-b762-2214547cf0d6'::uuid),
  ('m08', '88e496bf-0a85-484b-85a9-892b0f38a350'::uuid),
  ('m09', '59434ad6-60de-4b38-8a6d-e745dd9d61f4'::uuid),
  ('m10', '6eb8937c-9570-4834-a0a5-12f7e404473f'::uuid),
  ('m11', '4ae18100-f2ce-4839-8f14-705a7e01d9c8'::uuid),
  ('m12', '81f9e7fc-0bf6-4e30-8657-e4f009946b25'::uuid),
  ('m13', 'bbf1b1fd-60d3-44b5-9742-30fd532cef8c'::uuid),
  ('m14', 'c1673fbf-f5f9-4e72-8af5-da4692ecfa86'::uuid),
  ('m15', '8f0bffa5-8af7-4ee1-a22f-b14713a5a1a5'::uuid)
) as v(id, track)
where m.id = v.id;

CREATE OR REPLACE FUNCTION public.game_submit_run(run_id uuid, mission text, run_time numeric, records integer, notes_low integer, notes_mid integer, notes_high integer, kos integer, journals text[], coin integer, misses integer, spare_seconds numeric, wipeouts integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me uuid := auth.uid();
  g public.game_missions;
  tok public.game_run_tokens;
  elapsed numeric;
  journal_count int;
  new_pages int;
  full_set boolean;
  rp int;
  rp_earned int;
  xp_gain int;
  prof public.game_players;
  old_best int;
  new_best boolean;
  my_rank int;
  v_track uuid;
begin
  prof := public.game_ensure_player();
  select * into g from public.game_missions where id = mission;
  if g.id is null then raise exception 'Unknown mission.'; end if;

  select * into tok from public.game_run_tokens where id = run_id for update;
  if tok.id is null or tok.used or tok.user_id <> me or tok.mission <> mission then
    raise exception 'This run has already been posted or could not be verified.';
  end if;
  if tok.started_at < now() - interval '30 minutes' then raise exception 'This run is too old to post.'; end if;

  elapsed := extract(epoch from (now() - tok.started_at));
  if run_time < g.min_run_seconds or run_time > elapsed + 5 then raise exception 'This run could not be verified.'; end if;
  journals := coalesce(journals, '{}');
  journal_count := cardinality(journals);
  if records < 0 or notes_low < 0 or notes_mid < 0 or notes_high < 0 or kos < 0
     or coin < 0 or misses < 0 or misses > 500 or spare_seconds is null or spare_seconds < 0 or wipeouts < 0
     or records > g.total_records or notes_low > g.total_notes_low or notes_mid > g.total_notes_mid
     or notes_high > g.total_notes_high or kos > g.total_enemies or coin > g.total_coin
     or spare_seconds > g.max_spare_seconds
     or journal_count > cardinality(g.journal_ids)
     or not (journals <@ g.journal_ids)
     or journal_count <> (select count(distinct j) from unnest(journals) j) then
    raise exception 'This run could not be verified.';
  end if;

  update public.game_run_tokens set used = true where id = run_id;

  full_set := records >= g.total_records and notes_low >= g.total_notes_low and notes_mid >= g.total_notes_mid
    and notes_high >= g.total_notes_high and journal_count >= cardinality(g.journal_ids) and coin >= g.total_coin;
  rp := records * 5 + notes_low * 10 + notes_mid * 25 + notes_high * 50
      + kos * 25 + journal_count * 50 + coin * 100
      + floor(spare_seconds)::int * 4
      + case when misses = 0 then 300 else 0 end
      + case when wipeouts = 0 then 200 else 0 end
      + case when full_set then 500 else 0 end;
  rp_earned := ceil(rp / 2.0)::int;
  xp_gain := 50 + notes_low * 5 + notes_mid * 15 + notes_high * 30 + records + kos * 10 + 100;
  select count(*) into new_pages from unnest(journals) j where not (j = any (prof.journal));

  insert into public.game_runs (user_id, mission, rp, run_time, records, notes, kos, journals, misses, wipeouts)
  values (me, mission, rp, run_time, records, notes_low + notes_mid + notes_high, kos, journal_count, misses, wipeouts);

  old_best := coalesce((prof.best -> mission ->> 'rp')::int, 0);
  new_best := rp > old_best;
  update public.game_players p set
    xp = p.xp + xp_gain,
    rp_bank = p.rp_bank + rp_earned,
    stash_records = p.stash_records + records,
    stash_notes = p.stash_notes + notes_low + notes_mid + notes_high,
    stash_pages = p.stash_pages + new_pages,
    stash_coins = p.stash_coins + coin,
    vinyl_total = p.vinyl_total + records,
    notes_total = p.notes_total + notes_low + notes_mid + notes_high,
    kos_total = p.kos_total + kos,
    coins_total = p.coins_total + coin,
    journal = (select coalesce(array_agg(distinct j order by j), '{}') from unnest(p.journal || journals) j),
    runs = p.runs + 1,
    best = case when new_best then p.best || jsonb_build_object(mission, jsonb_build_object('rp', rp, 'time', run_time)) else p.best end
  where p.user_id = me;

  -- The song played through: a finished, verified run counts as one stream of
  -- it, for the artist, through the same log_stream every other play uses (so
  -- an artist playing their own song is not counted). At most one per song
  -- per player every 10 minutes. A failure here never stops the run posting.
  begin
    v_track := g.track_id;
    if v_track is null and mission like 'a-%' then
      select al.track_id into v_track from public.game_artist_levels al where 'a-' || al.id::text = mission;
    end if;
    if v_track is not null and not exists (
      select 1 from public.streams s
      where s.user_id = me and s.track_id = v_track and s.source = 'feelz_run'
        and s.created_at > now() - interval '10 minutes'
    ) then
      perform public.log_stream(v_track, me, least(run_time, coalesce(g.track_seconds, run_time))::int, true, 'web', 'game', 'feelz_run');
    end if;
  exception when others then
    raise warning '[game_submit_run] stream not logged: %', sqlerrm;
  end;

  select count(*) + 1 into my_rank
  from (select r.user_id, max(r.rp) as top from public.game_runs r where r.mission = game_submit_run.mission group by r.user_id) b
  where b.top > greatest(old_best, rp);

  return json_build_object('rp', rp, 'rp_earned', rp_earned, 'xp_gained', xp_gain, 'new_best', new_best, 'rank', my_rank);
end;
$function$;
